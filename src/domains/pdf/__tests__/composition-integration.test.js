/**
 * Composition engine integration tests (WS-D).
 *
 * End-to-end composeCompCard with fixture profile + images — no DB, no Groq
 * (NODE_ENV is 'test', so the advice gate is closed) — plus route-level
 * coverage of /pdf/view/:slug?engine=composed using the same in-memory app
 * pattern as pdf-diagnostics-route.test.js.
 */

const express = require("express");
const request = require("supertest");

const { composeCompCard } = require("../composition");
const { validateLayout } = require("../composition/layout-solver");
const pdfRouter = require("../routes/pdf");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildWomenProfile(overrides = {}) {
  return {
    id: "profile-women-1",
    slug: "ava-stone",
    first_name: "Ava",
    last_name: "Stone",
    gender: "Female",
    age: 24,
    height_cm: 175,
    bust_cm: 86,
    waist_cm: 61,
    hips_cm: 89,
    dress_size: "4",
    shoe_size: "9",
    hair_color: "dark brown",
    eye_color: "green",
    city: "New York",
    instagram_handle: "avastone",
    is_pro: false,
    image_analysis: JSON.stringify({
      lookType: "editorial",
      marketSignals: ["editorial", "runway"],
    }),
    ...overrides,
  };
}

function buildImage(id, shotType, width, height, extra = {}) {
  return {
    id,
    profile_id: "profile-women-1",
    path: `/uploads/${id}.jpg`,
    label: id,
    sort: extra.sort ?? 1,
    shot_type: shotType,
    width,
    height,
    usage_rights: "granted",
    ...extra,
  };
}

function buildHealthyImages() {
  return [
    buildImage("img-1", "headshot", 1600, 2000, { is_primary: true, sort: 1 }),
    buildImage("img-2", "full_length", 1400, 2800, { sort: 2 }),
    buildImage("img-3", "three_quarter", 1500, 2100, { sort: 3 }),
    buildImage("img-4", null, 1800, 1400, { style_type: "editorial", sort: 4 }),
    buildImage("img-5", null, 1600, 2000, { style_type: "lifestyle", sort: 5 }),
  ];
}

const ARCHETYPE = { label: "Editorial", verdict: "Strong editorial presence." };

// ---------------------------------------------------------------------------
// composeCompCard end-to-end
// ---------------------------------------------------------------------------

describe("composeCompCard integration", () => {
  test("produces a valid plan whose images map back to the input rows", async () => {
    const profile = buildWomenProfile();
    const images = buildHealthyImages();
    const result = await composeCompCard({
      profile,
      images,
      archetype: ARCHETYPE,
      options: { seed: "fixture-seed-1" },
    });

    const { plan, poolAnalysis } = result;
    const imageIds = new Set(images.map((img) => img.id));

    expect(plan.engine).toBe("composed");
    expect(plan.seedUsed).toBe("fixture-seed-1");
    expect(typeof plan.toneProfile).toBe("string");
    expect(plan.palette).toEqual(
      expect.objectContaining({
        background: expect.any(String),
        text: expect.any(String),
      }),
    );
    expect(plan.typography).toEqual(
      expect.objectContaining({
        display: expect.any(String),
        nameSize: expect.any(String),
        nameCase: expect.any(String),
        statSize: expect.any(String),
        statLabelSize: expect.any(String),
      }),
    );

    // Hero maps back to a real image row and tops the deterministic ranking.
    expect(imageIds.has(plan.front.imageId)).toBe(true);
    expect(plan.front.imageId).toBe(poolAnalysis.heroRanking[0]);
    const heroRow = images.find((img) => img.id === plan.front.imageId);
    expect(heroRow).toBeDefined();
    expect(plan.front.crop).toEqual(
      expect.objectContaining({
        fit: expect.any(String),
        objectPosition: expect.any(String),
      }),
    );
    expect(["full-bleed", "bordered"]).toContain(plan.front.treatment);
    expect(["top", "bottom"]).toContain(plan.front.name.placement);
    expect(["left", "center"]).toContain(plan.front.name.align);

    // Back layout is solved geometry (atelier v2) and every slot maps to an
    // image row; layout invariants hold.
    expect(validateLayout(plan.back.layout).ok).toBe(true);
    expect(plan.back.slots.length).toBeGreaterThanOrEqual(3);
    expect(plan.back.slots.length).toBeLessThanOrEqual(5);
    expect(plan.back.slots.length).toBe(plan.back.layout.cells.length);
    plan.back.slots.forEach((slot) => {
      expect(imageIds.has(slot.imageId)).toBe(true);
      expect(slot.crop).toEqual(
        expect.objectContaining({ objectPosition: expect.any(String) }),
      );
    });
    expect(["bottom-strip", "side-column"]).toContain(plan.back.statsPlacement);
    expect(plan.back.contact.line).toContain("New York");
    expect(Array.isArray(plan.decisions)).toBe(true);
    expect(plan.decisions.length).toBeGreaterThan(0);
  });

  test("formats women's stats exactly (dual units)", async () => {
    const { statsBlock } = await composeCompCard({
      profile: buildWomenProfile(),
      images: buildHealthyImages(),
      archetype: ARCHETYPE,
      options: { seed: "fixture-seed-1" },
    });

    expect(statsBlock.category).toBe("women");
    expect(statsBlock.isFitness).toBe(false);
    expect(statsBlock.units).toBe("dual");
    expect(statsBlock.lines).toEqual([
      { key: "height", label: "HEIGHT", value: "175 cm / 5'9\"" },
      { key: "bust", label: "BUST", value: '86 cm / 34"' },
      { key: "waist", label: "WAIST", value: '61 cm / 24"' },
      { key: "hips", label: "HIPS", value: '89 cm / 35"' },
      { key: "dress", label: "DRESS", value: "US 4 / EU 36" },
      { key: "shoes", label: "SHOES", value: "US 9 / EU 40" },
      { key: "hair", label: "HAIR", value: "Dark Brown" },
      { key: "eyes", label: "EYES", value: "Green" },
    ]);
  });

  test("respects the units preference option", async () => {
    const { statsBlock } = await composeCompCard({
      profile: buildWomenProfile(),
      images: buildHealthyImages(),
      archetype: ARCHETYPE,
      options: { seed: "fixture-seed-1", unitsPreference: "metric" },
    });

    expect(statsBlock.units).toBe("metric");
    expect(statsBlock.lines[0]).toEqual({
      key: "height",
      label: "HEIGHT",
      value: "175 cm",
    });
  });

  test("guardrail report keeps the canonical shape and passes for a healthy fixture", async () => {
    const { guardrailReport } = await composeCompCard({
      profile: buildWomenProfile(),
      images: buildHealthyImages(),
      archetype: ARCHETYPE,
      options: { seed: "fixture-seed-1" },
    });

    expect(Object.keys(guardrailReport).sort()).toEqual(
      [
        "blockingIssueCount",
        "blockingIssues",
        "checks",
        "mode",
        "status",
        "warningCount",
        "warnings",
      ].sort(),
    );
    expect(guardrailReport.mode).toBe("draft");
    // A healthy fixture must never BLOCK; advisory warnings (caution crops
    // on heavily mismatched aspects, stats telemetry) are legitimate
    // guardrail output, not failures.
    expect(["pass", "warn"]).toContain(guardrailReport.status);
    expect(guardrailReport.blockingIssueCount).toBe(0);
    for (const warning of guardrailReport.warnings) {
      expect(["composed-crop-caution", "composed-stats-warning"]).toContain(warning.id);
    }
    // Summary counts always agree with the checks array.
    expect(
      guardrailReport.checks.filter((c) => c.level === "error").length,
    ).toBe(guardrailReport.blockingIssueCount);
    expect(
      guardrailReport.checks.filter((c) => c.level === "warn").length,
    ).toBe(guardrailReport.warningCount);
  });

  test("unsafe crops degrade the guardrail status to fail", async () => {
    // Extreme-tall full-length images (aspect 0.25) cannot cover any catalog
    // cell without losing >30% of the figure → crop-engine flags 'unsafe'.
    const images = [
      buildImage("tall-1", "full_length", 700, 2800, { sort: 1 }),
      buildImage("tall-2", "full_length", 700, 2800, { sort: 2 }),
      buildImage("tall-3", "full_length", 700, 2800, { sort: 3 }),
      buildImage("tall-4", "full_length", 700, 2800, { sort: 4 }),
    ];
    const { guardrailReport } = await composeCompCard({
      profile: buildWomenProfile(),
      images,
      archetype: ARCHETYPE,
      options: { seed: "fixture-seed-1" },
    });

    expect(guardrailReport.status).toBe("fail");
    expect(guardrailReport.blockingIssueCount).toBeGreaterThanOrEqual(1);
    expect(
      guardrailReport.checks.some(
        (check) => check.id === "composed-crop-unsafe" && check.level === "error",
      ),
    ).toBe(true);
  });

  test("stats warnings surface as warn-level guardrail checks", async () => {
    const profile = buildWomenProfile({
      hips_cm: null,
      measurements: null,
    });
    const { guardrailReport, statsBlock } = await composeCompCard({
      profile,
      images: buildHealthyImages(),
      archetype: ARCHETYPE,
      options: { seed: "fixture-seed-1" },
    });

    expect(statsBlock.warnings.length).toBeGreaterThanOrEqual(1);
    expect(
      guardrailReport.checks.some(
        (check) => check.id === "composed-stats-warning" && check.level === "warn",
      ),
    ).toBe(true);
    expect(guardrailReport.status).toBe("warn");
  });

  test("missing full-body coverage surfaces as a warn-level check", async () => {
    const images = [
      buildImage("img-1", "headshot", 1600, 2000, { is_primary: true, sort: 1 }),
      buildImage("img-2", "headshot", 1600, 2000, { sort: 2 }),
      buildImage("img-3", null, 1800, 1400, { style_type: "editorial", sort: 3 }),
      buildImage("img-4", null, 1600, 2000, { style_type: "lifestyle", sort: 4 }),
      buildImage("img-5", null, 1600, 2000, { style_type: "lifestyle", sort: 5 }),
    ];
    const { guardrailReport, plan } = await composeCompCard({
      profile: buildWomenProfile(),
      images,
      archetype: ARCHETYPE,
      options: { seed: "fixture-seed-1" },
    });

    expect(plan.warnings.some((w) => /full-body/i.test(w))).toBe(true);
    expect(
      guardrailReport.checks.some(
        (check) =>
          check.id === "composed-full-body-missing" && check.level === "warn",
      ),
    ).toBe(true);
  });

  test("AI advice is disabled under NODE_ENV=test and same seed reproduces the plan", async () => {
    const args = {
      profile: buildWomenProfile(),
      images: buildHealthyImages(),
      archetype: ARCHETYPE,
      options: { seed: "repro-seed" },
    };
    const first = await composeCompCard(args);
    const second = await composeCompCard(args);

    expect(first.advice).toBeNull();
    expect(second.plan).toEqual(first.plan);
  });

  test("honors hero locks via options.locks", async () => {
    const { plan } = await composeCompCard({
      profile: buildWomenProfile(),
      images: buildHealthyImages(),
      archetype: ARCHETYPE,
      options: {
        seed: "fixture-seed-1",
        locks: { heroId: "img-3", gridIds: [] },
      },
    });

    expect(plan.front.imageId).toBe("img-3");
  });
});

// ---------------------------------------------------------------------------
// Route-level: /pdf/view/:slug?engine=composed (demo profile, no DB)
// ---------------------------------------------------------------------------

describe("composed engine route", () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  function createApp() {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use((req, _res, next) => {
      req.session = {};
      next();
    });
    app.use(pdfRouter);
    return app;
  }

  beforeAll(() => {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  test("GET /pdf/view/elara-k?engine=composed renders the composed card", async () => {
    const app = createApp();
    const response = await request(app).get("/pdf/view/elara-k?engine=composed");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["x-compcard-engine"]).toBe("composed");
    expect(response.headers["x-compcard-seed"]).toBeDefined();
    expect(response.text).toContain("comp-card-page");
    expect(response.text).toContain("Elara");
  });

  test("composed engine is the default for /pdf/view/:slug", async () => {
    const app = createApp();
    const response = await request(app).get("/pdf/view/elara-k");

    expect(response.status).toBe(200);
    expect(response.headers["x-compcard-engine"]).toBe("composed");
    expect(response.text).toContain("comp-card-page");
  });

  test("GET /pdf/view/elara-k?engine=classic keeps the classic standard path", async () => {
    const app = createApp();
    const response = await request(app).get("/pdf/view/elara-k?engine=classic");

    expect(response.status).toBe(200);
    expect(response.headers["x-compcard-engine"]).toBeUndefined();
    // Classic path still emits its own metadata headers + page wrapper.
    expect(response.headers["x-compcard-seed"]).toBeDefined();
    expect(response.headers["x-compcard-layout-family"]).toBeDefined();
    expect(response.text).toContain("comp-card-page");
    expect(response.text).toContain("Elara");
  });

  test("composed renders deterministically for a fixed seed", async () => {
    const app = createApp();
    const first = await request(app).get(
      "/pdf/view/elara-k?engine=composed&seed=route-seed",
    );
    const second = await request(app).get(
      "/pdf/view/elara-k?engine=composed&seed=route-seed",
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // supertest binds an ephemeral port per request; the printed portfolio
    // cue URL embeds the host, so normalize it before comparing.
    const normalize = (html) => html.replace(/127\.0\.0\.1:\d+/g, "HOST");
    expect(normalize(first.text)).toBe(normalize(second.text));
  });
});
