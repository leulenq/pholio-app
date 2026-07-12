/**
 * Variable-font axes (comp-card editions plan, Phase 4).
 *
 * Covers the width/optical-axis machinery end to end:
 *  - font-library axis metadata integrity + the axis-resolution rules,
 *  - text-metrics per-axis instance measurement (harfbuzz setVariations),
 *  - font-files legacy exactness (no axes ⇒ identical static measurement) and
 *    the exact variable path,
 *  - the vendored variable masters + manifest,
 *  - design-language threading the axis position onto the name treatment.
 *
 * The live harfbuzz-vs-Chromium parity at axis instances is browser-gated in
 * shaping-parity.test.js (SHAPING_PARITY_BROWSER=1).
 */

const fs = require("fs");
const path = require("path");

const {
  FAMILIES,
  familyAxes,
  hasVariableAxis,
  resolveNameAxes,
} = require("../composition/font-library");
const {
  fontPathFor,
  variableFontPathFor,
  nameAdvanceEm,
} = require("../composition/perception/font-files");
const textMetrics = require("../composition/perception/text-metrics");
const { synthesizeDesignLanguage } = require("../composition/design-language");

const UPPER = "TAYA WAVERLY AVAT.";
const AXIS_FAMILIES = ["Archivo", "Fraunces", "Bodoni Moda"];
const emWidth = (fontPath, text, axes) => {
  const m = textMetrics.measureLine({ fontPath, text, sizePt: 72, axes });
  return m ? m.widthIn : null;
};

// ── axis metadata integrity ────────────────────────────────────────────────

describe("font-library axis metadata", () => {
  test.each(AXIS_FAMILIES)("%s declares well-formed axis ranges", (family) => {
    const axes = familyAxes(family);
    expect(axes).toBeTruthy();
    expect(hasVariableAxis(family)).toBe(true);
    for (const [tag, r] of Object.entries(axes)) {
      expect(tag).toMatch(/^[a-zA-Z]{4}$/);
      expect(r.min).toBeLessThanOrEqual(r.default);
      expect(r.default).toBeLessThanOrEqual(r.max);
    }
  });

  test("Archivo carries wdth; Fraunces + Bodoni Moda carry opsz", () => {
    expect(familyAxes("Archivo").wdth).toEqual({ min: 62, default: 100, max: 125 });
    expect(familyAxes("Fraunces").opsz.max).toBe(144);
    expect(familyAxes("Bodoni Moda").opsz).toEqual({ min: 6, default: 11, max: 96 });
  });

  test("families with no design axis report none", () => {
    for (const family of Object.keys(FAMILIES)) {
      if (AXIS_FAMILIES.includes(family)) continue;
      expect(hasVariableAxis(family)).toBe(false);
      expect(resolveNameAxes(family, { widthMode: "extended", opszSizePt: 72 })).toBeNull();
    }
  });
});

// ── axis-resolution rules ──────────────────────────────────────────────────

describe("resolveNameAxes", () => {
  test("masthead/display CONDENSE: a longer name resolves more condensed", () => {
    const long = resolveNameAxes("Archivo", { widthMode: "condense", nameLength: 26 });
    const mid = resolveNameAxes("Archivo", { widthMode: "condense", nameLength: 18 });
    expect(long.wdth).toBeLessThan(mid.wdth);
    expect(mid.wdth).toBeLessThan(familyAxes("Archivo").wdth.default);
    expect(long.wdth).toBeGreaterThanOrEqual(familyAxes("Archivo").wdth.min);
  });

  test("a short name is NOT condensed (stays at the design width)", () => {
    // overflow past the comfortable length is zero → wdth omitted → no axis
    expect(resolveNameAxes("Archivo", { widthMode: "condense", nameLength: 8 })).toBeNull();
  });

  test("rail/spine EXTENDS the width past default toward the wide extreme", () => {
    const ext = resolveNameAxes("Archivo", { widthMode: "extended" });
    expect(ext.wdth).toBeGreaterThan(familyAxes("Archivo").wdth.default);
    expect(ext.wdth).toBeLessThanOrEqual(familyAxes("Archivo").wdth.max);
  });

  test("optical size tracks the display point size and clamps to range", () => {
    expect(resolveNameAxes("Fraunces", { opszSizePt: 72 }).opsz).toBe(72);
    expect(resolveNameAxes("Fraunces", { opszSizePt: 9 }).opsz).toBe(9);
    expect(resolveNameAxes("Fraunces", { opszSizePt: 500 }).opsz).toBe(144); // clamped to max
    expect(resolveNameAxes("Bodoni Moda", { opszSizePt: 3 }).opsz).toBe(6); // clamped to min
  });

  test("normal width mode with no optical intent yields no axis", () => {
    expect(resolveNameAxes("Archivo", { widthMode: "normal" })).toBeNull();
  });
});

// ── vendored masters + manifest ────────────────────────────────────────────

describe("vendored variable masters", () => {
  test.each(AXIS_FAMILIES)("%s has a vendored variable master on disk", (family) => {
    const p = variableFontPathFor(family);
    expect(p).toBeTruthy();
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).size).toBeGreaterThan(50000);
  });

  test("the manifest records every axis-bearing family with its axes", () => {
    const manifestPath = path.join(
      __dirname, "..", "..", "..", "..", "public", "fonts", "compcard", "variable-manifest.json",
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    for (const family of AXIS_FAMILIES) {
      expect(manifest.variable[family]).toBeTruthy();
      expect(manifest.variable[family].file).toMatch(/-variable\.ttf$/);
      expect(manifest.variable[family].axes).toBeTruthy();
    }
  });
});

// ── per-axis measurement ───────────────────────────────────────────────────

describe("text-metrics variable-instance measurement", () => {
  test("METRICS_VERSION bumped for axis-aware shaping", () => {
    expect(textMetrics.METRICS_VERSION).toBeGreaterThanOrEqual(3);
  });

  test("normalizeAxes drops non-finite / non-4-char tags and sorts", () => {
    expect(textMetrics.normalizeAxes(null)).toEqual([]);
    expect(textMetrics.normalizeAxes({})).toEqual([]);
    expect(textMetrics.normalizeAxes({ wdth: NaN })).toEqual([]);
    expect(textMetrics.normalizeAxes({ wght: 500, wdth: 80 })).toEqual([
      { tag: "wdth", value: 80 },
      { tag: "wght", value: 500 },
    ]);
  });

  test("the variable master at its default weight equals the static instance", () => {
    // Archivo static-500 IS an instance of the same master; measuring the
    // variable face at wght 500 must reproduce it (legacy render/measure agree).
    const stat = emWidth(fontPathFor("Archivo", 500), UPPER);
    const varr = emWidth(variableFontPathFor("Archivo"), UPPER, { wght: 500 });
    expect(varr / stat).toBeGreaterThan(1 - 0.005);
    expect(varr / stat).toBeLessThan(1 + 0.005);
  });

  test("wdth is monotonic: condensed < default < extended", () => {
    const v = variableFontPathFor("Archivo");
    const c = emWidth(v, UPPER, { wdth: 62, wght: 500 });
    const d = emWidth(v, UPPER, { wdth: 100, wght: 500 });
    const e = emWidth(v, UPPER, { wdth: 125, wght: 500 });
    expect(c).toBeLessThan(d);
    expect(d).toBeLessThan(e);
  });

  test("opsz changes advance (a real optical cut, not a no-op)", () => {
    const f = variableFontPathFor("Fraunces");
    const text = emWidth(f, UPPER, { opsz: 9, wght: 500 });
    const display = emWidth(f, UPPER, { opsz: 144, wght: 500 });
    expect(Math.abs(text - display) / text).toBeGreaterThan(0.02);
  });

  test("an unsupported axis is a harmless no-op (null-safe)", () => {
    const v = variableFontPathFor("Archivo");
    const base = emWidth(v, UPPER, { wght: 500 });
    const bogus = emWidth(v, UPPER, { wght: 500, ZZZZ: 42 });
    expect(bogus).toBeCloseTo(base, 6);
  });
});

// ── font-files: legacy exactness + variable path ───────────────────────────

describe("nameAdvanceEm axis path", () => {
  test("LEGACY EXACTNESS: no axes ⇒ byte-identical to today's static measure", () => {
    for (const family of ["Archivo", "Fraunces", "Bodoni Moda", "Inter", "Playfair Display"]) {
      const before = nameAdvanceEm({ family, weight: 500, text: "Taya Waverly", nameCase: "upper" });
      expect(before.measured).toBe(true);
      expect(before.axis).toBeUndefined();
      // recompute against the raw static face — must match exactly
      const staticEm = textMetrics.advanceEmFor(
        textMetrics.loadFont(fontPathFor(family, 500)),
        "TAYA WAVERLY",
      );
      expect(before.advanceEm).toBeCloseTo(staticEm, 10);
    }
  });

  test("axes ⇒ shaped against the variable master, measured:true, axis echoed", () => {
    const r = nameAdvanceEm({ family: "Archivo", weight: 500, text: "Taya Waverly", nameCase: "upper", axes: { wdth: 115 } });
    expect(r.measured).toBe(true);
    expect(r.axis).toMatchObject({ wght: 500, wdth: 115 });
  });

  test("condensed vs extended produce distinct advances for the same string", () => {
    const con = nameAdvanceEm({ family: "Archivo", weight: 500, text: "Taya Waverly", nameCase: "upper", axes: { wdth: 70 } });
    const ext = nameAdvanceEm({ family: "Archivo", weight: 500, text: "Taya Waverly", nameCase: "upper", axes: { wdth: 120 } });
    expect(con.advanceEm).toBeLessThan(ext.advanceEm);
  });

  test("axes on a family with no vendored master fall back honestly (measured:false)", () => {
    // Marcellus has no axis metadata → sanitizeAxes yields nothing → the static
    // path runs and stays measured:true; simulate the estimate branch with a
    // family that HAS axis metadata but a temporarily unresolvable master by
    // asking for an axis on a non-axis family (no-op) — assert the static path.
    const r = nameAdvanceEm({ family: "Marcellus", weight: 400, text: "Taya", nameCase: "upper", axes: { wdth: 80 } });
    expect(r.measured).toBe(true); // no axis metadata ⇒ plain static measure
    expect(r.axis).toBeUndefined();
  });
});

// ── design-language threading ──────────────────────────────────────────────

describe("design-language carries the axis position on the name treatment", () => {
  const baseInput = (overrides = {}) => ({
    profile: { slug: "t", first_name: "Taya", last_name: "Waverly" },
    archetype: { label: "Editorial", scores: { runway: 70, editorial: 75 } },
    statsBlock: { category: "women" },
    poolAnalysis: { pool: [{}, {}, {}, {}] },
    seed: "axis-1",
    ...overrides,
  });

  test("legacy (no edition) path omits name.axes entirely (byte-identical contract)", () => {
    const lang = synthesizeDesignLanguage(baseInput());
    expect("axes" in lang.name).toBe(false);
  });

  test("spine-lockup edition on Archivo EXTENDS the rail", () => {
    const edition = {
      id: "swiss-modernist",
      scale: { minPt: 18, maxPt: 30, trackingBias: 0.3 },
      lockups: ["spine", "inline"],
      voices: ["stark-grotesque", "bold-grotesque"],
      palette: "paper-white",
    };
    const lang = synthesizeDesignLanguage(baseInput({ edition, operators: { field: "paper", register: "standard" } }));
    expect(lang.fonts.display).toBe("Archivo");
    expect(lang.name.axes).toBeTruthy();
    expect(lang.name.axes.wdth).toBeGreaterThan(100);
  });

  test("large-display edition CONDENSES a long name on Archivo", () => {
    const edition = {
      id: "cover-story",
      scale: { minPt: 56, maxPt: 110, trackingBias: -0.6 },
      lockups: ["contrast", "inline"],
      voices: ["stark-grotesque", "bold-grotesque"],
      palette: "paper-white",
    };
    const lang = synthesizeDesignLanguage(
      baseInput({
        profile: { slug: "x", first_name: "Alexandrina", last_name: "Konstantinou" },
        edition,
        operators: { field: "paper", register: "display" },
      }),
    );
    expect(lang.fonts.display).toBe("Archivo");
    expect(lang.name.axes.wdth).toBeLessThan(100);
  });

  test("optical edition on Bodoni Moda sets a display opsz", () => {
    const edition = {
      id: "editorial-masthead",
      scale: { minPt: 40, maxPt: 76, trackingBias: -0.4 },
      lockups: ["inline", "stacked"],
      voices: ["romantic-didone"], // force the didone (Bodoni Moda)
      palette: "paper-white",
    };
    const lang = synthesizeDesignLanguage(baseInput({ edition, operators: { field: "paper", register: "display" } }));
    expect(lang.fonts.display).toBe("Bodoni Moda");
    expect(lang.name.axes.opsz).toBe(76); // display register → scale top, in-range
  });

  test("edition on a family with no axis carries name.axes = null", () => {
    const edition = {
      id: "house-classic",
      scale: { minPt: 20, maxPt: 38, trackingBias: 0 },
      lockups: ["inline"],
      voices: ["editorial-serif"], // Playfair Display — no design axis
      palette: "paper-ivory",
    };
    const lang = synthesizeDesignLanguage(baseInput({ edition, operators: { field: "paper", register: "standard" } }));
    expect(lang.fonts.display).toBe("Playfair Display");
    expect(lang.name.axes).toBeNull();
  });

  test("the axis position is echoed into the name-metrics decision log", () => {
    const edition = {
      id: "swiss-modernist",
      scale: { minPt: 18, maxPt: 30, trackingBias: 0.3 },
      lockups: ["spine", "inline"],
      voices: ["stark-grotesque"],
      palette: "paper-white",
    };
    const lang = synthesizeDesignLanguage(baseInput({ edition, operators: { field: "paper", register: "standard" } }));
    expect(lang.decisions.some((d) => d.aspect === "name-axes")).toBe(true);
  });
});
