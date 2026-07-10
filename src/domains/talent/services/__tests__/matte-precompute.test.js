/**
 * Matte precompute at upload (comp-card editions 1.3).
 *
 * Covers:
 *  - eligibility gating (studio/plain background signal, forensics fallback,
 *    videos, cached entries, unavailable markers) — pure, no DB;
 *  - the global precompute queue (serialization at concurrency 1, duplicate
 *    dedupe, fail-soft resolution, test-env guard) with @imgly/the matte
 *    pipeline mocked;
 *  - cache read/write round-trip against the real images.metadata.matte slot
 *    — the exact shape loadCompCardMattes (src/domains/pdf/routes/pdf.js)
 *    reads, so the PDF route consumes precomputed entries unchanged.
 */

const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

jest.mock("../../../pdf/composition/perception/matte", () => ({
  computeBestMatte: jest.fn(),
  MATTE_VERSION: 1,
}));

const matteModule = require("../../../pdf/composition/perception/matte");
const knex = require("../../../../shared/db/knex");
const {
  enqueueMattePrecompute,
  precomputeMatteForImage,
  isMatteEligible,
  MATTE_PRECOMPUTE_CONCURRENCY,
} = require("../matte-precompute");

const FAKE_MATTE = {
  maskGrid: [
    [0, 0.5],
    [1, 0.25],
  ],
  width: 800,
  height: 1200,
  version: 1,
  source: "studio",
};

function row(overrides = {}) {
  return {
    id: overrides.id || uuidv4(),
    asset_kind: "image",
    path: "/uploads/x.jpg",
    metadata: {},
    ...overrides,
  };
}

function studioMeta(extra = {}) {
  return { ai: { signals: { background: "studio" } }, ...extra };
}

async function waitFor(predicate, timeoutMs = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timed out");
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ── Eligibility gating (pure) ─────────────────────────────────────────────

describe("isMatteEligible", () => {
  test("eligible for studio and plain background signals", () => {
    expect(
      isMatteEligible(row({ metadata: studioMeta() })),
    ).toEqual({ eligible: true, reason: "background-studio" });
    expect(
      isMatteEligible(
        row({ metadata: { ai: { signals: { background: "plain" } } } }),
      ),
    ).toEqual({ eligible: true, reason: "background-plain" });
  });

  test("reads the signal from ai.classification.signals too", () => {
    expect(
      isMatteEligible(
        row({
          metadata: {
            ai: { classification: { signals: { background: "Studio" } } },
          },
        }),
      ).eligible,
    ).toBe(true);
  });

  test("ineligible for environmental backgrounds", () => {
    expect(
      isMatteEligible(
        row({ metadata: { ai: { signals: { background: "environmental" } } } }),
      ),
    ).toEqual({ eligible: false, reason: "background-environmental" });
  });

  test("forensics fallback: quiet left+right edges qualify when no signal", () => {
    const forensics = (l, r) => ({
      quiet: { left: { score: l }, right: { score: r } },
    });
    expect(
      isMatteEligible(row({ metadata: { forensics: forensics(0.8, 0.9) } })),
    ).toEqual({ eligible: true, reason: "forensics-quiet-edges" });
    expect(
      isMatteEligible(row({ metadata: { forensics: forensics(0.8, 0.3) } })),
    ).toEqual({ eligible: false, reason: "no-studio-signal" });
  });

  test("explicit background signal wins over forensics", () => {
    expect(
      isMatteEligible(
        row({
          metadata: {
            ai: { signals: { background: "environmental" } },
            forensics: { quiet: { left: { score: 1 }, right: { score: 1 } } },
          },
        }),
      ).eligible,
    ).toBe(false);
  });

  test("no signal and no forensics → ineligible (honest coverage)", () => {
    expect(isMatteEligible(row())).toEqual({
      eligible: false,
      reason: "no-studio-signal",
    });
  });

  test("videos and sourceless rows are ineligible", () => {
    expect(
      isMatteEligible(row({ asset_kind: "video", metadata: studioMeta() })),
    ).toEqual({ eligible: false, reason: "not-an-image" });
    expect(
      isMatteEligible(row({ path: null, metadata: studioMeta() })),
    ).toEqual({ eligible: false, reason: "no-source" });
    expect(isMatteEligible(null)).toEqual({
      eligible: false,
      reason: "no-image",
    });
  });

  test("cached mattes and unavailable markers block recompute", () => {
    expect(
      isMatteEligible(
        row({ metadata: studioMeta({ matte: { maskGrid: [[1]] } }) }),
      ),
    ).toEqual({ eligible: false, reason: "cached" });
    expect(
      isMatteEligible(
        row({
          metadata: studioMeta({ matte: { unavailable: true, version: 1 } }),
        }),
      ),
    ).toEqual({ eligible: false, reason: "cached" });
  });

  test("metadata as a JSON string parses (DB round-trip form)", () => {
    expect(
      isMatteEligible(row({ metadata: JSON.stringify(studioMeta()) })).eligible,
    ).toBe(true);
    expect(isMatteEligible(row({ metadata: "{not json" }))).toEqual({
      eligible: false,
      reason: "no-studio-signal",
    });
  });
});

// ── Queue + cache round-trip (real knex, mocked matte pipeline) ──────────

describe("matte precompute queue + cache round-trip", () => {
  const userId = uuidv4();
  const profileId = uuidv4();
  let tmpDir;
  let fixturePath;

  beforeAll(async () => {
    await knex.migrate.latest();
    await knex("users").insert({
      id: userId,
      email: `matte-precompute-${userId}@example.com`,
      password_hash: "x",
      role: "TALENT",
    });
    await knex("profiles").insert({
      id: profileId,
      user_id: userId,
      slug: `matte-precompute-${profileId}`,
      first_name: "Matte",
      last_name: "Talent",
      city: "Test",
      date_of_birth: "1990-01-01",
      height_cm: 180,
      bio_raw: "",
      bio_curated: "",
    });
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "matte-precompute-"));
    fixturePath = path.join(tmpDir, "fixture.jpg");
    await fs.writeFile(fixturePath, Buffer.from("fake-image-bytes"));
  });

  afterAll(async () => {
    await knex("images").where({ profile_id: profileId }).delete();
    await knex("profiles").where({ id: profileId }).delete();
    await knex("users").where({ id: userId }).delete();
    await knex.destroy();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    matteModule.computeBestMatte.mockReset();
  });

  async function insertImage(overrides = {}) {
    const id = uuidv4();
    await knex("images").insert({
      id,
      profile_id: profileId,
      path: "/uploads/matte-fixture.jpg",
      absolute_path: fixturePath,
      label: "Portfolio image",
      sort: 1,
      metadata: JSON.stringify(studioMeta()),
      ...overrides,
    });
    return id;
  }

  async function readMetadata(id) {
    const fresh = await knex("images").where({ id }).select("metadata").first();
    return typeof fresh.metadata === "string"
      ? JSON.parse(fresh.metadata)
      : fresh.metadata;
  }

  test("computed matte round-trips through images.metadata.matte in the PDF route's shape", async () => {
    matteModule.computeBestMatte.mockResolvedValue({ ...FAKE_MATTE });
    const imageId = await insertImage();

    const result = await precomputeMatteForImage(knex, imageId);
    expect(result).toEqual({ status: "computed", source: "studio" });
    expect(matteModule.computeBestMatte).toHaveBeenCalledTimes(1);
    expect(Buffer.isBuffer(matteModule.computeBestMatte.mock.calls[0][0])).toBe(
      true,
    );

    const metadata = await readMetadata(imageId);
    // Exactly what loadCompCardMattes (pdf.js) reads on a cache hit:
    // parseMeta(img.metadata).matte with Array.isArray(matte.maskGrid).
    expect(metadata.matte).toEqual(FAKE_MATTE);
    expect(Array.isArray(metadata.matte.maskGrid)).toBe(true);
    // Pre-existing metadata (the classification signal) is preserved.
    expect(metadata.ai.signals.background).toBe("studio");

    // Second run is a cache hit — no recompute.
    const again = await precomputeMatteForImage(knex, imageId);
    expect(again).toEqual({ status: "skipped", reason: "cached" });
    expect(matteModule.computeBestMatte).toHaveBeenCalledTimes(1);
  });

  test("genuine refusal writes the unavailable marker (route semantics)", async () => {
    matteModule.computeBestMatte.mockResolvedValue(null);
    const imageId = await insertImage();

    const result = await precomputeMatteForImage(knex, imageId);
    expect(result).toEqual({ status: "unavailable" });
    const metadata = await readMetadata(imageId);
    expect(metadata.matte).toEqual({ unavailable: true, version: 1 });

    // Marker blocks recompute, same as the PDF route.
    const again = await precomputeMatteForImage(knex, imageId);
    expect(again).toEqual({ status: "skipped", reason: "cached" });
  });

  test("unreadable bytes: skipped WITHOUT a marker (transient, retryable)", async () => {
    const imageId = await insertImage({
      absolute_path: path.join(tmpDir, "does-not-exist.jpg"),
      path: "/uploads/does-not-exist-anywhere.jpg",
    });

    const result = await precomputeMatteForImage(knex, imageId);
    expect(result).toEqual({ status: "skipped", reason: "no-bytes" });
    expect(matteModule.computeBestMatte).not.toHaveBeenCalled();
    const metadata = await readMetadata(imageId);
    expect(metadata.matte).toBeUndefined();
  });

  test("ineligible frame is skipped before any byte fetch or compute", async () => {
    const imageId = await insertImage({
      metadata: JSON.stringify({
        ai: { signals: { background: "environmental" } },
      }),
    });
    const result = await precomputeMatteForImage(knex, imageId);
    expect(result).toEqual({
      status: "skipped",
      reason: "background-environmental",
    });
    expect(matteModule.computeBestMatte).not.toHaveBeenCalled();
  });

  test("enqueue is a no-op in the test environment unless forced", async () => {
    const imageId = await insertImage();
    const result = await enqueueMattePrecompute(knex, imageId);
    expect(result).toEqual({ status: "skipped", reason: "test-env" });
    expect(matteModule.computeBestMatte).not.toHaveBeenCalled();
  });

  test("queue serializes bulk work at concurrency 1 and dedupes per image", async () => {
    expect(MATTE_PRECOMPUTE_CONCURRENCY).toBe(1);

    const deferreds = [];
    matteModule.computeBestMatte.mockImplementation(() => {
      let release;
      const promise = new Promise((r) => {
        release = r;
      });
      deferreds.push(release);
      return promise;
    });

    const ids = [await insertImage(), await insertImage(), await insertImage()];
    const promises = ids.map((id) =>
      enqueueMattePrecompute(knex, id, { force: true }),
    );

    // Duplicate enqueue while queued/running returns the same promise.
    expect(enqueueMattePrecompute(knex, ids[0], { force: true })).toBe(
      promises[0],
    );

    // Only the first job reaches the matting stage while it is in flight.
    await waitFor(() => matteModule.computeBestMatte.mock.calls.length >= 1);
    await new Promise((r) => setTimeout(r, 50));
    expect(matteModule.computeBestMatte).toHaveBeenCalledTimes(1);

    deferreds[0]({ ...FAKE_MATTE });
    await waitFor(() => matteModule.computeBestMatte.mock.calls.length >= 2);
    expect(matteModule.computeBestMatte).toHaveBeenCalledTimes(2);

    deferreds[1]({ ...FAKE_MATTE });
    await waitFor(() => matteModule.computeBestMatte.mock.calls.length >= 3);
    deferreds[2]({ ...FAKE_MATTE });

    const results = await Promise.all(promises);
    expect(results).toEqual([
      { status: "computed", source: "studio" },
      { status: "computed", source: "studio" },
      { status: "computed", source: "studio" },
    ]);

    // All three landed in the persistent cache.
    for (const id of ids) {
      const metadata = await readMetadata(id);
      expect(metadata.matte.maskGrid).toEqual(FAKE_MATTE.maskGrid);
    }
  });

  test("a throwing pipeline resolves fail-soft, never rejects", async () => {
    matteModule.computeBestMatte.mockRejectedValue(new Error("model exploded"));
    const imageId = await insertImage();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await enqueueMattePrecompute(knex, imageId, {
        force: true,
      });
      expect(result).toEqual({ status: "failed", reason: "model exploded" });
      // No marker written — the lazy PDF path can still try later.
      const metadata = await readMetadata(imageId);
      expect(metadata.matte).toBeUndefined();
    } finally {
      warn.mockRestore();
    }
  });
});
