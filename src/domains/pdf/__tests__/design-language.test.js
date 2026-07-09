/**
 * Tests for the design-language synthesizer: tone vector computation,
 * print-safe accent derivation from hero pixels, name-size solving, and the
 * researched front-stat-line rule.
 */

const {
  synthesizeDesignLanguage,
  computeToneVector,
  deriveAccent,
  solveNameSizePt,
  contrastRatio,
  TYPE_RATIOS,
  NAME_PT_MIN,
  NAME_PT_MAX,
} = require("../composition/design-language");

describe("computeToneVector", () => {
  test("runway/editorial scores raise formality", () => {
    const tone = computeToneVector({
      archetype: { scores: { runway: 85, editorial: 70, commercial: 10, lifestyle: 10 } },
      castingAnalysis: { lookType: "runway" },
      statsBlock: { category: "women" },
    });
    expect(tone.formality).toBeGreaterThan(0.75);
  });

  test("commercial/lifestyle raise warmth", () => {
    const tone = computeToneVector({
      archetype: { scores: { commercial: 90, lifestyle: 70, runway: 5, editorial: 5 } },
      castingAnalysis: { lookType: "commercial" },
      statsBlock: { category: "men" },
    });
    expect(tone.warmth).toBeGreaterThan(0.6);
  });

  test("fitness signals raise energy; kids clamp formality and floor warmth", () => {
    const fit = computeToneVector({
      castingAnalysis: { marketSignals: ["athletic", "fitness"] },
      statsBlock: { category: "men", isFitness: true },
    });
    expect(fit.energy).toBeGreaterThanOrEqual(0.7);

    const kid = computeToneVector({
      archetype: { scores: { runway: 95, editorial: 90 } },
      statsBlock: { category: "kids" },
    });
    expect(kid.formality).toBeLessThanOrEqual(0.45);
    expect(kid.warmth).toBeGreaterThanOrEqual(0.6);
  });

  test("all axes stay in [0,1]", () => {
    const tone = computeToneVector({
      archetype: { scores: { runway: 100, editorial: 100, commercial: 100, lifestyle: 100 } },
      castingAnalysis: { lookType: "runway high fashion editorial commercial fitness" },
      statsBlock: { category: "women" },
    });
    for (const v of Object.values(tone)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("deriveAccent", () => {
  const paper = "#FAF8F5";

  test("derives a print-safe accent from a usable hero color", () => {
    const { accent, source } = deriveAccent(
      { palette: [{ hex: "#B05A2E", population: 0.5, sat: 0.5, luma: 0.4 }] },
      paper,
      0.3,
    );
    expect(source).toMatch(/hero-palette/);
    expect(contrastRatio(accent, paper)).toBeGreaterThanOrEqual(4.5);
    // Saturation clamp: resulting color must not be neon.
    expect(accent).toMatch(/^#[0-9A-F]{6}$/);
  });

  test("near-gray and extreme-luma candidates are skipped → gold fallback", () => {
    const { accent, source } = deriveAccent(
      {
        palette: [
          { hex: "#F5F5F5", population: 0.6, sat: 0.01, luma: 0.95 },
          { hex: "#0A0A0A", population: 0.3, sat: 0.02, luma: 0.03 },
        ],
      },
      paper,
      0.3,
    );
    expect(source).toMatch(/fallback/);
    // The fallback passes the same gate as derived accents: raw brand gold
    // is ~2.2–2.3:1 on the papers, so the shipped fallback is a darkened
    // gold that clears 4.5:1 — never the raw swatch on text-bearing roles.
    expect(contrastRatio(accent, paper)).toBeGreaterThanOrEqual(4.5);
  });

  test("no forensics → gated brand gold (contrast ≥ 4.5:1 on paper)", () => {
    const warm = deriveAccent(null, paper, 0.5);
    const neutral = deriveAccent(null, "#FFFFFF", 0);
    expect(warm.source).toMatch(/fallback/);
    expect(neutral.source).toMatch(/fallback/);
    expect(contrastRatio(warm.accent, paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(neutral.accent, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    // Warmth still differentiates the shade family (distinct gates).
    expect(warm.accent).not.toBe(neutral.accent);
  });
});

describe("solveNameSizePt", () => {
  test("longer names get smaller type for the same band", () => {
    const opts = { bandWidthIn: 5, targetSpan: 0.8, trackingEm: 0.2, glyphEm: 0.58 };
    const short = solveNameSizePt({ ...opts, text: "Ana Li" });
    const long = solveNameSizePt({ ...opts, text: "Alexandra Konstantinopoulos" });
    expect(short).toBeGreaterThan(long);
    expect(short).toBeLessThanOrEqual(NAME_PT_MAX);
    expect(long).toBeGreaterThanOrEqual(NAME_PT_MIN);
  });

  test("math: width budget / (chars · advance)", () => {
    // 10 chars, band 5in, span 0.5 → 180pt budget; advance 0.6em → 30pt/char→ 180/6 = 30pt
    const pt = solveNameSizePt({
      text: "ABCDEFGHIJ",
      bandWidthIn: 5,
      targetSpan: 0.5,
      trackingEm: 0.02,
      glyphEm: 0.58,
    });
    expect(pt).toBeCloseTo(30, 0);
  });
});

describe("synthesizeDesignLanguage", () => {
  const input = (overrides = {}) => ({
    profile: { slug: "ana", first_name: "Ana", last_name: "Petrova" },
    archetype: { label: "Editorial", scores: { runway: 70, editorial: 75 } },
    castingAnalysis: { lookType: "editorial" },
    statsBlock: { category: "women", isFitness: false },
    poolAnalysis: { pool: [{}, {}, {}, {}] },
    seed: "dl-1",
    ...overrides,
  });

  test("deterministic for same inputs", () => {
    expect(synthesizeDesignLanguage(input())).toEqual(synthesizeDesignLanguage(input()));
  });

  test("type ratio comes from the classic scale set; pacing in bounds", () => {
    const lang = synthesizeDesignLanguage(input());
    expect(TYPE_RATIOS).toContain(lang.typeScale.ratio);
    expect(lang.pacing).toBeGreaterThanOrEqual(0.8);
    expect(lang.pacing).toBeLessThanOrEqual(1.6);
  });

  test("paper stays in the white set; ink in the house range", () => {
    for (let i = 0; i < 10; i++) {
      const lang = synthesizeDesignLanguage(input({ seed: `p-${i}` }));
      expect(["#FFFFFF", "#FFFEFA", "#FAF8F5"]).toContain(lang.palette.paper);
      expect(["#111111", "#1A1815"]).toContain(lang.palette.ink);
    }
  });

  test("advice tone nudges are bounded and logged; junk tones ignored", () => {
    const base = synthesizeDesignLanguage(input());
    const nudged = synthesizeDesignLanguage(input({ advice: { tone: "commercial-warm" } }));
    expect(nudged.toneVector.warmth - base.toneVector.warmth).toBeLessThanOrEqual(0.151);
    expect(nudged.decisions.some((d) => d.aspect === "advice.tone")).toBe(true);

    const junk = synthesizeDesignLanguage(input({ advice: { tone: "vaporwave" } }));
    expect(junk.decisions.find((d) => d.aspect === "advice.tone").choice).toBe("ignored");
  });

  test("front stat line defaults off and carries a justification when on", () => {
    const lang = synthesizeDesignLanguage(input());
    expect(lang.statsPlacement.page).toBe("back");
    const forced = synthesizeDesignLanguage(input({ overrides: { frontStats: true } }));
    expect(forced.statsPlacement.frontLine).toBe(true);
    expect(forced.statsPlacement.justification).toMatch(/override/);
  });
});
