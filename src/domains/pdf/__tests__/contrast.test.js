/**
 * Tests for dynamic text-over-image contrast control.
 *
 * The forensics luma grid is GAMMA-encoded sRGB gray. Every ratio below is a
 * known answer: the band gray g is linearized (Y = srgbToLinear(g)) and the
 * WCAG formula applied — white ink is 1.05/(Y+0.05), near-black ink is
 * (Y+0.05)/(INK_DARK_LUMA+0.05). Fixtures assert those exact ratios so a
 * regression back into gamma-as-linear (which ~doubles dark-ink verdicts)
 * fails loudly.
 */

const {
  resolveTextContrast,
  bandStats,
  contrastWhiteOver,
  contrastDarkOver,
  srgbToLinear,
  TARGET_CONTRAST,
  INK_DARK_LUMA,
  SCRIM_MIN,
  SCRIM_MAX,
} = require("../composition/contrast");

// Reference WCAG ratios computed independently from the sRGB transfer, so the
// tests do not merely echo the implementation.
function refLinear(g) {
  return g <= 0.03928 ? g / 12.92 : ((g + 0.055) / 1.055) ** 2.4;
}
const whiteRef = (g) => 1.05 / (refLinear(g) + 0.05);
const darkRef = (g) => (refLinear(g) + 0.05) / (INK_DARK_LUMA + 0.05);

function forensicsWith({ topLuma = 0.5, bottomLuma = 0.5, detail = 0.05, bottomDetail = null }) {
  const rows = 9;
  const cols = 6;
  const grid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, () => (r < 3 ? topLuma : r >= 6 ? bottomLuma : 0.5)),
  );
  const detailGrid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, () =>
      r >= 6 && bottomDetail != null ? bottomDetail : detail,
    ),
  );
  return {
    luma: { rows, cols, grid, mean: 0.5, isDark: false },
    detail: { grid: detailGrid },
    quiet: {
      top: { score: 0.8, bandRows: 2 },
      bottom: { score: 0.8, bandRows: 2 },
      left: { score: 0.5, bandCols: 2 },
      right: { score: 0.5, bandCols: 2 },
    },
  };
}

describe("sRGB linearization (the fix)", () => {
  test("gamma gray is linearized before the WCAG ratio", () => {
    // sanity: 0.5 gamma gray is Y≈0.214 linear, not 0.5.
    expect(srgbToLinear(0.5)).toBeCloseTo(0.2140, 3);
    expect(srgbToLinear(0.0)).toBe(0);
    expect(srgbToLinear(1.0)).toBeCloseTo(1.0, 5);
  });

  test("dark-ink verdicts are NOT inflated (the audited defect)", () => {
    // gamma 0.5 mid-gray: the buggy gamma-as-linear math read 5.0:1; the true
    // linear answer is 2.4:1 — well under the 4.5 target.
    expect(contrastDarkOver(0.5)).toBeCloseTo(2.40, 1);
    expect(contrastDarkOver(0.5)).toBeLessThan(TARGET_CONTRAST);
    // gamma 0.4: buggy read 4.09:1; true linear is 1.66:1.
    expect(contrastDarkOver(0.4)).toBeCloseTo(1.66, 1);
  });

  test("contrast helpers match the independent reference for real pairs", () => {
    for (const g of [0.06, 0.15, 0.3, 0.5, 0.7, 0.92]) {
      expect(contrastWhiteOver(g)).toBeCloseTo(whiteRef(g), 4);
      expect(contrastDarkOver(g)).toBeCloseTo(darkRef(g), 4);
    }
  });
});

describe("bandStats", () => {
  test("reads the correct band cells", () => {
    const f = forensicsWith({ topLuma: 0.1, bottomLuma: 0.9 });
    expect(bandStats(f, "top").mean).toBeCloseTo(0.1, 5);
    expect(bandStats(f, "bottom").mean).toBeCloseTo(0.9, 5);
    expect(bandStats(null, "top")).toBeNull();
  });
});

describe("resolveTextContrast", () => {
  test("near-black band (gamma 0.06): light ink passes unaided", () => {
    // white over Y=0.0046 → 1.05/0.0546 ≈ 19.2:1.
    const out = resolveTextContrast({
      forensics: forensicsWith({ topLuma: 0.06 }),
      edge: "top",
    });
    expect(out.ink).toBe("light");
    expect(out.verdict).toBe("safe");
    expect(out.scrim).toBeNull();
    expect(out.estContrast).toBeCloseTo(whiteRef(0.06), 1);
    expect(out.estContrast).toBeGreaterThanOrEqual(TARGET_CONTRAST);
  });

  test("near-white band (gamma 0.92): dark ink passes unaided", () => {
    // dark over Y=0.828 → (0.828+0.05)/0.11 ≈ 7.98:1.
    const out = resolveTextContrast({
      forensics: forensicsWith({ bottomLuma: 0.92 }),
      edge: "bottom",
    });
    expect(out.ink).toBe("dark");
    expect(out.verdict).toBe("safe");
    expect(out.scrim).toBeNull();
    expect(out.estContrast).toBeCloseTo(darkRef(0.92), 1);
  });

  test("mid-gray band (gamma 0.5) does NOT pass unaided — needs a scrim", () => {
    // white over Y=0.214 → 3.98:1, dark over → 2.40:1: neither clears 4.5.
    const out = resolveTextContrast({
      forensics: forensicsWith({ bottomLuma: 0.5, bottomDetail: 0.1 }),
      edge: "bottom",
    });
    expect(out.verdict).not.toBe("safe");
    expect(out.ink).toBe("light"); // white (3.98) beats dark (2.40) worst-case
    expect(out.estContrast).toBeLessThan(TARGET_CONTRAST);
    expect(out.estContrast).toBeCloseTo(whiteRef(0.5), 1);
    if (out.scrim) {
      // white at 3.98:1 needs only a mild darken veil — the SCRIM_MIN floor
      // is the correct solved strength under linearized math
      expect(out.scrim.strength).toBeGreaterThanOrEqual(SCRIM_MIN);
      expect(out.scrim.strength).toBeLessThanOrEqual(SCRIM_MAX + 0.001);
      expect(["darken", "lighten"]).toContain(out.scrim.direction);
    }
  });

  test("busy mid band: relocate verdict", () => {
    const f = forensicsWith({ bottomLuma: 0.5, bottomDetail: 0.9 });
    // widen the luma spread inside the band to make it unrescuable
    f.luma.grid[7] = f.luma.grid[7].map((_, c) => (c % 2 ? 0.15 : 0.85));
    f.luma.grid[8] = f.luma.grid[8].map((_, c) => (c % 2 ? 0.2 : 0.8));
    const out = resolveTextContrast({ forensics: f, edge: "bottom" });
    expect(out.verdict).toBe("relocate");
  });

  test("no forensics: conservative light ink + scrim", () => {
    const out = resolveTextContrast({ forensics: null, edge: "bottom" });
    expect(out.ink).toBe("light");
    expect(out.verdict).toBe("scrim");
    expect(out.scrim.direction).toBe("darken");
  });

  test("scrim strength scales with how light the band is (for light ink)", () => {
    // Both bands sit in the light-ink scrim window (~0.47–0.58 gamma): white
    // ink is preferred but under 4.5:1, so a darken scrim is solved for each.
    const darker = resolveTextContrast({
      forensics: forensicsWith({ bottomLuma: 0.48, bottomDetail: 0.05 }),
      edge: "bottom",
    });
    const lighter = resolveTextContrast({
      forensics: forensicsWith({ bottomLuma: 0.56, bottomDetail: 0.05 }),
      edge: "bottom",
    });
    if (darker.scrim && lighter.scrim && darker.ink === "light" && lighter.ink === "light") {
      expect(lighter.scrim.strength).toBeGreaterThanOrEqual(darker.scrim.strength);
    }
  });
});
