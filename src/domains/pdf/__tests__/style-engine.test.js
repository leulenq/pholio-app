const {
  resolveCompCardArtDirection,
  getLayoutFamilyKeys,
} = require("../style-engine");

describe("style-engine", () => {
  const baseTheme = {
    colors: {
      background: "#FAFAF8",
      text: "#1C1C1C",
      accent: "#C9A96E",
    },
    layout: {
      imageGrid: { cols: 2, rows: 2 },
    },
  };

  test("same seed + inputs => stable family and variant", () => {
    const first = resolveCompCardArtDirection({
      seed: "seed-123",
      theme: baseTheme,
    });
    const second = resolveCompCardArtDirection({
      seed: "seed-123",
      theme: baseTheme,
    });
    expect(first.layoutFamily).toBe(second.layoutFamily);
    expect(first.styleVariant).toBe(second.styleVariant);
    expect(first.layoutPatch).toEqual(second.layoutPatch);
    expect(first.styleTokens).toEqual(second.styleTokens);
  });

  test("requested family override is respected", () => {
    const result = resolveCompCardArtDirection({
      seed: "x",
      theme: baseTheme,
      requestedLayoutFamily: "runway-split",
    });
    expect(result.layoutFamily).toBe("runway-split");
    expect(result.layoutPatch.gridCols).toBe(1);
    expect(result.layoutPatch.gridRows).toBe(4);
  });

  test("requested style variant must belong to family", () => {
    const result = resolveCompCardArtDirection({
      seed: "x",
      theme: baseTheme,
      requestedLayoutFamily: "mosaic-horizontal",
      requestedStyleVariant: "linework",
    });
    expect(result.layoutFamily).toBe("mosaic-horizontal");
    expect(result.styleVariant).toBe("linework");
  });

  test("invalid requested values fall back safely", () => {
    const result = resolveCompCardArtDirection({
      seed: "fallback-seed",
      theme: baseTheme,
      requestedLayoutFamily: "not-real",
      requestedStyleVariant: "also-not-real",
    });
    expect(getLayoutFamilyKeys()).toContain(result.layoutFamily);
    expect(result.styleVariant).toBeTruthy();
    expect(result.appliedTheme.colors.background).toBeTruthy();
    expect(result.appliedTheme.layout.imageGrid.cols).toBeGreaterThan(0);
  });
});
