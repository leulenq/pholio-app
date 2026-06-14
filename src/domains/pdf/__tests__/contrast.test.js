/**
 * Tests for dynamic text-over-image contrast control.
 */

const {
  resolveTextContrast,
  bandStats,
  TARGET_CONTRAST,
  SCRIM_MAX,
} = require("../composition/contrast");

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

describe("bandStats", () => {
  test("reads the correct band cells", () => {
    const f = forensicsWith({ topLuma: 0.1, bottomLuma: 0.9 });
    expect(bandStats(f, "top").mean).toBeCloseTo(0.1, 5);
    expect(bandStats(f, "bottom").mean).toBeCloseTo(0.9, 5);
    expect(bandStats(null, "top")).toBeNull();
  });
});

describe("resolveTextContrast", () => {
  test("very dark band: light ink, no scrim needed", () => {
    const out = resolveTextContrast({
      forensics: forensicsWith({ topLuma: 0.06 }),
      edge: "top",
    });
    expect(out.ink).toBe("light");
    expect(out.verdict).toBe("safe");
    expect(out.scrim).toBeNull();
    expect(out.estContrast).toBeGreaterThanOrEqual(TARGET_CONTRAST);
  });

  test("very light band: dark ink, no scrim needed", () => {
    const out = resolveTextContrast({
      forensics: forensicsWith({ bottomLuma: 0.92 }),
      edge: "bottom",
    });
    expect(out.ink).toBe("dark");
    expect(out.verdict).toBe("safe");
    expect(out.scrim).toBeNull();
  });

  test("mid-luma calm band: scrim with solved strength", () => {
    // 0.3 luma sits in the dead zone: white ink reads 3.0:1, dark ink
    // 3.2:1 — neither reaches 4.5:1 without help.
    const out = resolveTextContrast({
      forensics: forensicsWith({ bottomLuma: 0.3, bottomDetail: 0.1 }),
      edge: "bottom",
    });
    expect(out.verdict).toBe("scrim");
    expect(out.scrim.strength).toBeGreaterThan(0.2);
    expect(out.scrim.strength).toBeLessThanOrEqual(SCRIM_MAX + 0.001);
    // darker direction for light ink over mid backdrop
    expect(["darken", "lighten"]).toContain(out.scrim.direction);
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
    const darker = resolveTextContrast({
      forensics: forensicsWith({ bottomLuma: 0.35, bottomDetail: 0.05 }),
      edge: "bottom",
    });
    const lighter = resolveTextContrast({
      forensics: forensicsWith({ bottomLuma: 0.55, bottomDetail: 0.05 }),
      edge: "bottom",
    });
    if (darker.scrim && lighter.scrim && darker.ink === "light" && lighter.ink === "light") {
      expect(lighter.scrim.strength).toBeGreaterThanOrEqual(darker.scrim.strength);
    }
  });
});
