/**
 * WS10 / PR 12 — Hive moderation adapter + provider seam.
 *
 * Covers: Hive class-score → verdict mapping, threshold config, timeout and
 * failure fallback to the heuristic, missing-key degradation (logs once), and
 * the seam behavior that Hive is escalation-only (never auto-rejects, never
 * loosens a heuristic flag).
 */

const sharp = require("sharp");

const hive = require("../../src/shared/lib/moderation/hive");
const {
  MODERATION_STATUS,
  analyzeImageBuffer,
} = require("../../src/shared/lib/content-moderation");

/** Build a small solid-color PNG buffer for deterministic tests. */
async function makePng(width, height, rgb) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: rgb[0], g: rgb[1], b: rgb[2] },
    },
  })
    .png()
    .toBuffer();
}

/** Hive sync-API response envelope around a class list. */
function hiveResponse(classes) {
  return { status: [{ response: { output: [{ classes }] } }] };
}

function okFetch(payload) {
  return jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }));
}

const ENV_KEYS = [
  "MODERATION_PROVIDER",
  "HIVE_API_KEY",
  "MODERATION_HIVE_FLAG_THRESHOLD",
  "MODERATION_HIVE_TIMEOUT_MS",
];

describe("moderation/hive adapter", () => {
  const originalFetch = global.fetch;
  const savedEnv = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    hive.__resetHiveWarnings();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    jest.restoreAllMocks();
  });

  it("verdict vocabulary stays in sync with MODERATION_STATUS", () => {
    // hive.js mirrors the strings locally to avoid a circular require —
    // this test is the guard that keeps the vocabularies identical.
    const flagged = hive.verdictFromScores({ general_nsfw: 0.99 }, 0.5);
    const clean = hive.verdictFromScores({ general_nsfw: 0.01 }, 0.5);
    expect(flagged.status).toBe(MODERATION_STATUS.REVIEW);
    expect(clean.status).toBe(MODERATION_STATUS.APPROVED);
  });

  describe("verdictFromScores", () => {
    it("flags general_nsfw at/above threshold to review, never rejected", () => {
      const v = hive.verdictFromScores(
        { general_nsfw: 1.0, general_suggestive: 0.1 },
        0.5,
      );
      expect(v.status).toBe(MODERATION_STATUS.REVIEW);
      expect(v.status).not.toBe(MODERATION_STATUS.REJECTED);
      expect(v.reason).toBe("hive_general_nsfw");
      expect(v.flags.hiveFlagged).toEqual(["general_nsfw"]);
      expect(v.flags.hiveScores.general_nsfw).toBe(1.0);
    });

    it("flags general_suggestive at threshold", () => {
      const v = hive.verdictFromScores({ general_suggestive: 0.5 }, 0.5);
      expect(v.status).toBe(MODERATION_STATUS.REVIEW);
      expect(v.reason).toBe("hive_general_suggestive");
    });

    it("combines multiple flagged classes into the reason", () => {
      const v = hive.verdictFromScores(
        { general_nsfw: 0.9, general_suggestive: 0.8 },
        0.5,
      );
      expect(v.reason).toBe("hive_general_nsfw,hive_general_suggestive");
    });

    it("approves below threshold and ignores unmonitored classes", () => {
      const v = hive.verdictFromScores(
        { general_nsfw: 0.49, gore: 0.99 },
        0.5,
      );
      expect(v.status).toBe(MODERATION_STATUS.APPROVED);
      expect(v.reason).toBeNull();
    });
  });

  describe("extractClassScores", () => {
    it("reads the nested Hive envelope", () => {
      const scores = hive.extractClassScores(
        hiveResponse([
          { class: "general_nsfw", score: 0.12 },
          { class: "general_suggestive", score: 0.34 },
        ]),
      );
      expect(scores).toEqual({ general_nsfw: 0.12, general_suggestive: 0.34 });
    });

    it("returns an empty object for junk payloads", () => {
      expect(hive.extractClassScores(null)).toEqual({});
      expect(hive.extractClassScores({})).toEqual({});
      expect(hive.extractClassScores({ status: "nope" })).toEqual({});
    });
  });

  describe("analyzeBufferWithHive", () => {
    it("returns a review verdict when Hive flags", async () => {
      process.env.HIVE_API_KEY = "test-key";
      global.fetch = okFetch(
        hiveResponse([{ class: "general_nsfw", score: 0.91 }]),
      );

      const result = await hive.analyzeBufferWithHive(Buffer.from("img"));
      expect(result.status).toBe(MODERATION_STATUS.REVIEW);
      expect(result.reason).toBe("hive_general_nsfw");

      // Request shape: sync endpoint, Token auth, multipart body.
      const [url, opts] = global.fetch.mock.calls[0];
      expect(url).toBe(hive.HIVE_SYNC_ENDPOINT);
      expect(opts.method).toBe("POST");
      expect(opts.headers.Authorization).toBe("Token test-key");
      expect(opts.body).toBeInstanceOf(FormData);
    });

    it("honors MODERATION_HIVE_FLAG_THRESHOLD", async () => {
      process.env.HIVE_API_KEY = "test-key";
      process.env.MODERATION_HIVE_FLAG_THRESHOLD = "0.95";
      global.fetch = okFetch(
        hiveResponse([{ class: "general_nsfw", score: 0.91 }]),
      );

      const result = await hive.analyzeBufferWithHive(Buffer.from("img"));
      expect(result.status).toBe(MODERATION_STATUS.APPROVED);
      expect(result.flags.hiveThreshold).toBe(0.95);
    });

    it("returns null (fallback) without an API key and warns exactly once", async () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      global.fetch = jest.fn();

      expect(await hive.analyzeBufferWithHive(Buffer.from("img"))).toBeNull();
      expect(await hive.analyzeBufferWithHive(Buffer.from("img"))).toBeNull();

      const keyWarnings = warnSpy.mock.calls.filter((call) =>
        String(call[0]).includes("HIVE_API_KEY is not set"),
      );
      expect(keyWarnings).toHaveLength(1);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns null on HTTP error responses", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => {});
      process.env.HIVE_API_KEY = "test-key";
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => "server exploded",
        json: async () => ({}),
      }));
      expect(await hive.analyzeBufferWithHive(Buffer.from("img"))).toBeNull();
    });

    it("returns null on network failure", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => {});
      process.env.HIVE_API_KEY = "test-key";
      global.fetch = jest.fn(async () => {
        throw new Error("ECONNRESET");
      });
      expect(await hive.analyzeBufferWithHive(Buffer.from("img"))).toBeNull();
    });

    it("returns null on timeout (abort signal fires)", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => {});
      process.env.HIVE_API_KEY = "test-key";
      process.env.MODERATION_HIVE_TIMEOUT_MS = "20";
      // A fetch that never resolves unless the abort signal fires.
      global.fetch = jest.fn(
        (url, opts) =>
          new Promise((resolve, reject) => {
            opts.signal.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      );
      expect(await hive.analyzeBufferWithHive(Buffer.from("img"))).toBeNull();
    }, 5000);

    it("returns null when the response has no class scores", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => {});
      process.env.HIVE_API_KEY = "test-key";
      global.fetch = okFetch({ unexpected: true });
      expect(await hive.analyzeBufferWithHive(Buffer.from("img"))).toBeNull();
    });
  });

  describe("analyzeImageBuffer with MODERATION_PROVIDER=hive", () => {
    it("hive flag on a heuristic-clean image routes to review (queue), never reject", async () => {
      process.env.MODERATION_PROVIDER = "hive";
      process.env.HIVE_API_KEY = "test-key";
      global.fetch = okFetch(
        hiveResponse([{ class: "general_suggestive", score: 0.77 }]),
      );

      const buffer = await makePng(100, 100, [40, 90, 200]); // heuristic-clean
      const result = await analyzeImageBuffer(buffer);

      expect(result.status).toBe(MODERATION_STATUS.REVIEW);
      expect(result.provider).toBe("hive");
      expect(result.reason).toBe("hive_general_suggestive");
      expect(result.flags.hiveScores.general_suggestive).toBe(0.77);
    });

    it("hive clean verdict approves with hive flags attached", async () => {
      process.env.MODERATION_PROVIDER = "hive";
      process.env.HIVE_API_KEY = "test-key";
      global.fetch = okFetch(
        hiveResponse([
          { class: "general_nsfw", score: 0.02 },
          { class: "general_suggestive", score: 0.05 },
        ]),
      );

      const buffer = await makePng(100, 100, [40, 90, 200]);
      const result = await analyzeImageBuffer(buffer);

      expect(result.status).toBe(MODERATION_STATUS.APPROVED);
      expect(result.provider).toBe("hive");
      expect(result.flags.hiveScores).toEqual({
        general_nsfw: 0.02,
        general_suggestive: 0.05,
      });
    });

    it("hive failure falls back to the heuristic verdict — upload never fails", async () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      process.env.MODERATION_PROVIDER = "hive";
      process.env.HIVE_API_KEY = "test-key";
      global.fetch = jest.fn(async () => {
        throw new Error("hive is down");
      });

      const buffer = await makePng(100, 100, [40, 90, 200]);
      const result = await analyzeImageBuffer(buffer);

      expect(result.status).toBe(MODERATION_STATUS.APPROVED);
      expect(result.provider).toBe("heuristic");
      expect(result.flags.hiveFallback).toBe(true);
      expect(
        warnSpy.mock.calls.some((call) =>
          String(call[0]).includes("hive provider unavailable"),
        ),
      ).toBe(true);
    });

    it("without HIVE_API_KEY, provider=hive degrades to the heuristic", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => {});
      process.env.MODERATION_PROVIDER = "hive";
      global.fetch = jest.fn();

      const buffer = await makePng(100, 100, [40, 90, 200]);
      const result = await analyzeImageBuffer(buffer);

      expect(result.status).toBe(MODERATION_STATUS.APPROVED);
      expect(result.provider).toBe("heuristic");
      expect(result.flags.hiveFallback).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("never loosens a heuristic flag: heuristic review skips hive and keeps its reason", async () => {
      process.env.MODERATION_PROVIDER = "hive";
      process.env.HIVE_API_KEY = "test-key";
      global.fetch = okFetch(
        hiveResponse([{ class: "general_nsfw", score: 0.0 }]),
      );

      const buffer = await makePng(100, 100, [200, 140, 110]); // skin-tone fill
      const result = await analyzeImageBuffer(buffer);

      // Exact heuristic reason preserved — csam-moderation.js keys on it.
      expect(result.status).toBe(MODERATION_STATUS.REVIEW);
      expect(result.reason).toBe("high_skin_ratio");
      expect(result.provider).toBe("heuristic");
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
