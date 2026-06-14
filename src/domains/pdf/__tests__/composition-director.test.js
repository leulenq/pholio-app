/**
 * Tests for the atelier (v2) composition director: parametric plan shape,
 * determinism, breadth of the design space, advice clamping, full-length
 * placement, forensics-driven decisions, and fallback behavior.
 */

const {
  designComposition,
  buildContactLine,
  nearestToneLabel,
} = require("../composition/composition-director");
const { validateLayout } = require("../composition/layout-solver");

// ── fixtures ────────────────────────────────────────────────────────────────

let nextSort = 0;
function poolImage(overrides = {}) {
  nextSort += 1;
  return {
    id: overrides.id || `img-${nextSort}`,
    src: `/uploads/${overrides.id || `img-${nextSort}`}.jpg`,
    role: null,
    rawShotType: "",
    shot_type: null,
    aspect: 0.667,
    width: 2000,
    height: 3000,
    shortEdge: 2000,
    isPrimary: false,
    sort: nextSort,
    qualityScore: 80,
    heroScore: 50,
    reasons: [],
    metadata: {},
    ...overrides,
  };
}

function makePool() {
  nextSort = 0;
  return [
    poolImage({ id: "hs", role: "headshot", rawShotType: "headshot", shot_type: "headshot", heroScore: 90, isPrimary: true, aspect: 0.8 }),
    poolImage({ id: "fb", role: "full_body", rawShotType: "full_length", shot_type: "full_length", heroScore: 60, aspect: 0.55 }),
    poolImage({ id: "tq", role: "full_body", rawShotType: "three_quarter", shot_type: "three_quarter", heroScore: 70, aspect: 0.7 }),
    poolImage({ id: "ed", role: "editorial", heroScore: 55, aspect: 0.75 }),
    poolImage({ id: "ls", role: "lifestyle", heroScore: 45, aspect: 1.3 }),
  ];
}

function baseInput(overrides = {}) {
  const pool = overrides.pool || makePool();
  return {
    profile: {
      slug: "ana-petrova",
      first_name: "Ana",
      last_name: "Petrova",
      city: "Paris",
      instagram_handle: "anapetrova",
    },
    archetype: { label: "Editorial", scores: { runway: 70, editorial: 80, commercial: 25, lifestyle: 20 } },
    castingAnalysis: { lookType: "high fashion editorial", marketSignals: ["editorial", "runway"] },
    statsBlock: { category: "women", isFitness: false },
    poolAnalysis: {
      pool,
      coverage: {},
      heroRanking: pool.map((p) => p.id),
      warnings: [],
    },
    seed: "seed-1",
    ...overrides,
  };
}

function findDecision(plan, aspect) {
  return plan.decisions.find((d) => d.aspect === aspect) || null;
}

function darkTopForensics() {
  // Realistic studio portrait: uniform dark backdrop, the subject as a
  // high-detail center column around the measured focal point. The top and
  // bottom bands are genuinely clear of the talent.
  const grid = Array.from({ length: 9 }, () =>
    Array.from({ length: 6 }, () => 0.15),
  );
  const detail = Array.from({ length: 9 }, (_, r) =>
    Array.from({ length: 6 }, (_, c) => (r >= 3 && r <= 6 && c >= 2 && c <= 3 ? 0.8 : 0.04)),
  );
  return {
    width: 2000,
    height: 3000,
    aspect: 0.667,
    luma: { rows: 9, cols: 6, grid, mean: 0.18, isDark: true },
    detail: { grid: detail },
    quiet: {
      top: { score: 0.95, bandRows: 3 },
      bottom: { score: 0.2, bandRows: 2 },
      left: { score: 0.3, bandCols: 2 },
      right: { score: 0.3, bandCols: 2 },
    },
    palette: [
      { hex: "#7A4A2E", population: 0.4, sat: 0.45, luma: 0.34 },
      { hex: "#D9D2C8", population: 0.3, sat: 0.07, luma: 0.82 },
    ],
    warmth: 0.3,
    saturation: 0.3,
    contrast: 0.6,
    focal: { x: 0.5, y: 0.5 },
    version: 2,
  };
}

// ── plan shape + determinism ────────────────────────────────────────────────

describe("designComposition v2 — shape and determinism", () => {
  test("produces the full v2 plan contract", () => {
    const plan = designComposition(baseInput());
    expect(plan.engine).toBe("composed");
    expect(plan.seedUsed).toBe("seed-1");

    // language
    const tone = plan.language.toneVector;
    for (const axis of ["formality", "energy", "warmth", "density"]) {
      expect(tone[axis]).toBeGreaterThanOrEqual(0);
      expect(tone[axis]).toBeLessThanOrEqual(1);
    }
    expect(typeof plan.language.pacing).toBe("number");

    // front
    expect(plan.front.imageId).toBe("hs");
    expect(plan.front.crop.objectPosition).toMatch(/%/);
    expect(plan.front.geometry.hero.w).toBeGreaterThan(0);
    expect(["full-bleed", "bordered"]).toContain(plan.front.treatment);
    expect(["top", "bottom"]).toContain(plan.front.name.placement);
    expect(["left", "center"]).toContain(plan.front.name.align);

    // back: absolute layout + compatibility slots view
    expect(plan.back.layout.cells.length).toBeGreaterThanOrEqual(3);
    expect(validateLayout(plan.back.layout).ok).toBe(true);
    expect(plan.back.slots).toHaveLength(plan.back.layout.cells.length);
    for (const slot of plan.back.slots) {
      expect(slot.imageId).toBeTruthy();
      expect(slot.crop).toBeTruthy();
      expect(typeof slot.aspect).toBe("number");
    }
    expect(["bottom-strip", "side-column"]).toContain(plan.back.statsPlacement);
    expect(plan.back.contact.line).toContain("Paris");

    // wordmark rects for the PDF link post-processor
    expect(plan.wordmark.front.w).toBeGreaterThan(0);
    expect(plan.wordmark.back.w).toBeGreaterThan(0);
    expect(plan.wordmark.href).toBeNull(); // route fills it

    // typography derived from language
    const { FAMILIES } = require("../composition/font-library");
    expect(Object.keys(FAMILIES)).toContain(plan.typography.display);
    expect(plan.typography.voiceId).toBeTruthy();
    expect(plan.typography.fontsUrl).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?/);
    expect(plan.typography.nameSize).toMatch(/pt$/);

    expect(plan.decisions.length).toBeGreaterThan(8);
    expect(plan.warnings).toEqual(expect.any(Array));
  });

  test("same inputs + same seed ⇒ deep-equal plan", () => {
    expect(designComposition(baseInput())).toEqual(designComposition(baseInput()));
  });

  test("design space breadth: distinct structures across 12 seeds", () => {
    const tuples = new Set();
    for (let i = 0; i < 12; i++) {
      const plan = designComposition(baseInput({ seed: `s-${i}` }));
      tuples.add(
        [
          plan.front.treatment,
          plan.front.name.placement,
          plan.typography.nameSize,
          plan.back.statsPlacement,
          plan.back.layout.cells.length,
          plan.back.layout.cells.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(";"),
        ].join("|"),
      );
    }
    expect(tuples.size).toBeGreaterThanOrEqual(8);
  });

  test("two talents sharing a seed get distinct art direction", () => {
    const planFor = (slug) =>
      designComposition(
        baseInput({ profile: { slug, first_name: "X", last_name: "Y" } }),
      );
    expect(planFor("talent-one")).not.toEqual(planFor("talent-two"));
  });

  test("no banned-pattern vocabulary in the plan", () => {
    const text = JSON.stringify(designComposition(baseInput()));
    expect(text).not.toMatch(/badge|pill|chip|eyebrow|kicker|backdrop-filter|glass/i);
  });
});

// ── data-driven design ──────────────────────────────────────────────────────

describe("designComposition v2 — talent data drives the design", () => {
  test("editorial archetype lands a formal register", () => {
    const plan = designComposition(baseInput());
    expect(plan.language.toneVector.formality).toBeGreaterThan(0.6);
    expect(plan.toneProfile).toBe("high-fashion");
  });

  test("commercial talent reads warmer and less formal", () => {
    const plan = designComposition(
      baseInput({
        archetype: { label: "Commercial", scores: { runway: 5, editorial: 10, commercial: 85, lifestyle: 60 } },
        castingAnalysis: { lookType: "commercial lifestyle", marketSignals: ["commercial"] },
      }),
    );
    expect(plan.language.toneVector.warmth).toBeGreaterThan(0.55);
    expect(plan.language.toneVector.formality).toBeLessThan(0.72);
  });

  test("kids category clamps formality and labels kids-bright", () => {
    const plan = designComposition(
      baseInput({ statsBlock: { category: "kids", isFitness: false } }),
    );
    expect(plan.language.toneVector.formality).toBeLessThanOrEqual(0.5);
    expect(plan.toneProfile).toBe("kids-bright");
  });

  test("hero forensics drive name band + accent derivation", () => {
    const forensics = darkTopForensics();
    const plans = [];
    for (let i = 0; i < 25; i++) {
      plans.push(
        designComposition(
          baseInput({ seed: `f-${i}`, forensicsById: new Map([["hs", forensics]]) }),
        ),
      );
    }
    // The quiet dark top band must be selected for at least some seeds with
    // light ink on it; accent must derive from the hero palette (not gold)
    // whenever the photo yields a usable color.
    const onImageTop = plans.find(
      (p) => p.front.geometry.nameBand.onImage && p.front.name.placement === "top",
    );
    expect(onImageTop).toBeTruthy();
    expect(onImageTop.front.geometry.nameBand.inkOn).toBe("light");
    const accentDecision = findDecision(plans[0], "palette");
    expect(accentDecision.because).toMatch(/hero-palette/);
    expect(plans[0].palette.accent).not.toBe("#B8956A");
  });

  test("stats default to the back; front line is rare and justified", () => {
    let frontLines = 0;
    for (let i = 0; i < 40; i++) {
      const plan = designComposition(
        baseInput({
          seed: `fs-${i}`,
          forensicsById: new Map([
            ["hs", { ...darkTopForensics(), quiet: { ...darkTopForensics().quiet, bottom: { score: 0.9, bandRows: 3 } } }],
          ]),
        }),
      );
      if (plan.front.statLine) {
        frontLines += 1;
        const decision = findDecision(plan, "stats-placement");
        expect(decision.because).toMatch(/show-package|override/);
      }
    }
    expect(frontLines).toBeGreaterThan(0); // reachable…
    expect(frontLines).toBeLessThan(16); // …but rare (~15%)
  });

  test("frontStats override forces the front line", () => {
    const plan = designComposition(baseInput({ overrides: { frontStats: true } }));
    expect(plan.front.statLine).toBeTruthy();
  });
});

// ── advice clamping ─────────────────────────────────────────────────────────

describe("designComposition v2 — advice is validated, never trusted", () => {
  test("invalid advice.heroImageId ignored and logged", () => {
    const plan = designComposition(
      baseInput({ advice: { heroImageId: "nope", rationale: "x" } }),
    );
    expect(plan.front.imageId).toBe("hs");
    expect(findDecision(plan, "advice.heroImageId").choice).toBe("ignored");
  });

  test("advice hero outside 15 points of top is rejected; within is honored", () => {
    const rejected = designComposition(
      baseInput({ advice: { heroImageId: "ls", rationale: "x" } }), // 45 vs 90
    );
    expect(rejected.front.imageId).toBe("hs");

    const pool = makePool();
    pool.find((p) => p.id === "tq").heroScore = 80; // within 15 of 90
    const accepted = designComposition(
      baseInput({
        pool,
        poolAnalysis: { pool, coverage: {}, heroRanking: pool.map((p) => p.id), warnings: [] },
        advice: { heroImageId: "tq", rationale: "x" },
      }),
    );
    expect(accepted.front.imageId).toBe("tq");
  });

  test("advice tone becomes a bounded nudge, ignored for kids", () => {
    const base = designComposition(baseInput({ seed: "nudge" }));
    const nudged = designComposition(
      baseInput({ seed: "nudge", advice: { tone: "commercial-warm", rationale: "x" } }),
    );
    expect(nudged.language.toneVector.warmth).toBeGreaterThan(base.language.toneVector.warmth);
    expect(
      nudged.language.toneVector.warmth - base.language.toneVector.warmth,
    ).toBeLessThanOrEqual(0.151);

    const kids = designComposition(
      baseInput({
        statsBlock: { category: "kids" },
        advice: { tone: "high-fashion", rationale: "x" },
      }),
    );
    expect(findDecision(kids, "advice.tone").choice).toBe("ignored");
  });

  test("advice.gridPreference is obsolete and logged as ignored", () => {
    const plan = designComposition(
      baseInput({ advice: { gridPreference: "quad-grid", rationale: "x" } }),
    );
    expect(findDecision(plan, "advice.gridPreference").choice).toBe("ignored");
  });

  test("advice.nameAlign accepted when valid, ignored when junk", () => {
    const ok = designComposition(baseInput({ advice: { nameAlign: "center", rationale: "x" } }));
    expect(ok.front.name.align).toBe("center");
    const junk = designComposition(
      baseInput({ advice: { nameAlign: "justified", rationale: "x" } }),
    );
    expect(findDecision(junk, "advice.nameAlign").choice).toBe("ignored");
  });
});

// ── composition rules + degradation ─────────────────────────────────────────

describe("designComposition v2 — rules and degradation", () => {
  test("true full-length gets a tall, crop-safe cell", () => {
    for (let i = 0; i < 10; i++) {
      const plan = designComposition(baseInput({ seed: `fl-${i}` }));
      const flCell = plan.back.layout.cells.find((c) => c.imageId === "fb");
      expect(flCell).toBeTruthy();
      // Tall enough to keep the figure; near its own aspect so the sides
      // survive too (the absolute-tallest cell is no longer guaranteed).
      expect(flCell.w / flCell.h).toBeLessThanOrEqual(0.8);
      expect(flCell.crop.safety.level).not.toBe("unsafe");
    }
  });

  test("sparse pool reuses the hero with a warning", () => {
    const pool = makePool().slice(0, 3); // hs, fb, tq
    const plan = designComposition(
      baseInput({
        pool,
        poolAnalysis: { pool, coverage: {}, heroRanking: pool.map((p) => p.id), warnings: [] },
      }),
    );
    expect(plan.warnings.join(" ")).toMatch(/hero image reused/);
    expect(plan.back.layout.cells.length).toBeGreaterThanOrEqual(3);
  });

  test("empty pool degrades with warnings, never throws", () => {
    const plan = designComposition(
      baseInput({
        pool: [],
        poolAnalysis: { pool: [], coverage: {}, heroRanking: [], warnings: [] },
      }),
    );
    expect(plan.front.imageId).toBeNull();
    expect(plan.back.layout.cells).toEqual([]);
    expect(plan.warnings.join(" ")).toMatch(/pool is empty/);
  });

  test("override hero wins even at low score", () => {
    const plan = designComposition(baseInput({ overrides: { heroImageId: "ls" } }));
    expect(plan.front.imageId).toBe("ls");
  });

  test("missing crop-engine degrades to caution crops", () => {
    const plan = designComposition(baseInput({ cropEngine: null }));
    expect(plan.front.crop.safety.level).toBe("caution");
  });
});

// ── helpers ─────────────────────────────────────────────────────────────────

describe("helpers", () => {
  test("buildContactLine assembles city/@handle/phone, never an address", () => {
    expect(
      buildContactLine({ city: "Paris", instagram_handle: "ana", phone: "+33 1" }),
    ).toBe("Paris  ·  @ana  ·  +33 1");
    expect(buildContactLine({})).toBe("");
  });

  test("nearestToneLabel is telemetry-only mapping", () => {
    expect(nearestToneLabel({ formality: 0.9, energy: 0.3, warmth: 0.3 }, { category: "women" })).toBe("high-fashion");
    expect(nearestToneLabel({ formality: 0.5, energy: 0.3, warmth: 0.7 }, { category: "women" })).toBe("commercial-warm");
    expect(nearestToneLabel({ formality: 0.5, energy: 0.8, warmth: 0.5 }, { category: "men" })).toBe("fitness-bold");
    expect(nearestToneLabel({ formality: 0.9, energy: 0.1, warmth: 0.1 }, { category: "kids" })).toBe("kids-bright");
  });
});
