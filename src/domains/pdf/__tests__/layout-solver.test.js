/**
 * Tests for the generative layout solver — determinism, structural
 * invariants under many seeds (property-style), full-length placement,
 * stats carving variety, quiet-band name placement, bleed constraints.
 */

const {
  solveFrontGeometry,
  solveBackPartition,
  validateLayout,
  toCssRect,
  MIN_CELL_SHORT_EDGE,
  PAGE_W,
  PAGE_H,
} = require("../composition/layout-solver");

const REGION = { x: 0.35, y: 0.3, w: PAGE_W - 0.7, h: PAGE_H - 0.6 };

function img(id, aspect, rawShotType = "", role = null) {
  return { id, aspect, rawShotType, role };
}

const FOUR_IMAGES = [
  img("fl", 0.55, "full_length", "full_body"),
  img("hs", 0.8, "headshot", "headshot"),
  img("ed", 0.7, "", "editorial"),
  img("ls", 1.3, "", "lifestyle"),
];

function solveBack(overrides = {}) {
  return solveBackPartition({
    region: REGION,
    images: FOUR_IMAGES,
    pacing: 1,
    tone: { formality: 0.5, density: 0.5 },
    seed: "seed-1",
    ...overrides,
  });
}

function quietForensics(edge, score = 0.9) {
  const quiet = {
    top: { score: 0.1, bandRows: 2 },
    bottom: { score: 0.1, bandRows: 2 },
    left: { score: 0.1, bandCols: 2 },
    right: { score: 0.1, bandCols: 2 },
  };
  quiet[edge] = edge === "left" || edge === "right"
    ? { score, bandCols: 2 }
    : { score, bandRows: 2 };
  // dark top rows, light bottom rows
  const grid = Array.from({ length: 9 }, (_, r) =>
    Array.from({ length: 6 }, () => (r < 3 ? 0.15 : 0.8)),
  );
  return { quiet, luma: { grid, mean: 0.5, isDark: false, rows: 9, cols: 6 } };
}

describe("solveBackPartition", () => {
  test("deterministic: same inputs + seed ⇒ deep-equal", () => {
    expect(solveBack()).toEqual(solveBack());
  });

  test("different seeds vary the structure", () => {
    const signatures = new Set();
    for (let i = 0; i < 12; i++) {
      const layout = solveBack({ seed: `s-${i}` });
      signatures.add(
        [
          layout.statsBlock.orientation,
          layout.cells.length,
          ...layout.cells.map((c) => `${c.x.toFixed(1)}x${c.y.toFixed(1)}`),
        ].join("|"),
      );
    }
    expect(signatures.size).toBeGreaterThan(6);
  });

  test("structural invariants hold across 50 seeded runs", () => {
    for (let i = 0; i < 50; i++) {
      const aspects = [0.5 + (i % 5) * 0.1, 0.8, 1.2, 0.66, 0.75];
      const images = aspects
        .slice(0, 3 + (i % 3))
        .map((a, j) => img(`i${j}`, a, j === 0 ? "full_length" : ""));
      const layout = solveBackPartition({
        region: REGION,
        images,
        pacing: 0.8 + (i % 9) * 0.1,
        tone: { formality: (i % 10) / 10, density: ((i * 3) % 10) / 10 },
        seed: `prop-${i}`,
      });
      const check = validateLayout(layout);
      expect({ seed: `prop-${i}`, problems: check.problems }).toEqual({
        seed: `prop-${i}`,
        problems: [],
      });
      expect(layout.cells.length).toBeGreaterThanOrEqual(1);
      expect(layout.cells.length).toBeLessThanOrEqual(5);
      expect(layout.coverageRatio).toBeGreaterThanOrEqual(0.62);
    }
  });

  test("true full-length lands in a tall cell near its own aspect (20 seeds)", () => {
    for (let i = 0; i < 20; i++) {
      const layout = solveBack({ seed: `fl-${i}` });
      const flCell = layout.cells.find((c) => c.imageId === "fl");
      expect(flCell).toBeTruthy();
      // Tall enough to keep the figure, not so narrow it crops the sides.
      expect(flCell.w / flCell.h).toBeLessThanOrEqual(0.8);
      expect(flCell.crop.safety.level).not.toBe("unsafe");
    }
  });

  test("a true full-length always receives a genuinely tall cell (aspect ≤ 0.8)", () => {
    // Regression: a right stats column once produced three wide rows — the
    // figure lost its feet. The solver must reserve a full-height column.
    for (let i = 0; i < 30; i++) {
      for (const side of ["right", "left", "bottom"]) {
        const layout = solveBack({ seed: `tall-${side}-${i}`, stats: { side } });
        const flCell = layout.cells.find((c) => c.imageId === "fl");
        expect(flCell).toBeTruthy();
        expect(flCell.w / flCell.h).toBeLessThanOrEqual(0.8);
      }
    }
  });

  test("stats column and bottom band are both reachable across seeds", () => {
    const orientations = new Set();
    for (let i = 0; i < 24; i++) {
      orientations.add(solveBack({ seed: `o-${i}` }).statsBlock.orientation);
    }
    expect(orientations.has("column")).toBe(true);
    expect(orientations.has("strip")).toBe(true);
  });

  test("explicit stats side is honored", () => {
    const bottom = solveBack({ stats: { side: "bottom" } });
    expect(bottom.statsBlock.orientation).toBe("strip");
    const left = solveBack({ stats: { side: "left" } });
    expect(left.statsBlock.orientation).toBe("column");
    expect(left.statsBlock.x).toBeCloseTo(REGION.x, 3);
  });

  test("bleed cells only extend to left/right page edges", () => {
    let sawBleed = false;
    for (let i = 0; i < 30; i++) {
      const layout = solveBack({ seed: `b-${i}`, tone: { density: 1, formality: 0.5 } });
      for (const cell of layout.cells) {
        for (const edge of cell.bleedEdges) {
          sawBleed = true;
          expect(["left", "right"]).toContain(edge);
          if (edge === "left") expect(cell.x).toBe(0);
          if (edge === "right") expect(cell.x + cell.w).toBeCloseTo(PAGE_W, 3);
        }
      }
    }
    expect(sawBleed).toBe(true);
  });

  test("min cell short edge respected", () => {
    for (let i = 0; i < 20; i++) {
      const layout = solveBack({ seed: `m-${i}`, pacing: 1.6 });
      for (const cell of layout.cells) {
        expect(Math.min(cell.w, cell.h)).toBeGreaterThanOrEqual(MIN_CELL_SHORT_EDGE - 0.02);
      }
    }
  });

  test("missing full-length yields a warning", () => {
    const layout = solveBack({ images: FOUR_IMAGES.slice(1) });
    expect(layout.warnings.join(" ")).toMatch(/full-length/);
  });

  test("throws without a region", () => {
    expect(() => solveBackPartition({ images: FOUR_IMAGES })).toThrow(/region/);
  });
});

describe("solveFrontGeometry", () => {
  test("deterministic and seed-variable", () => {
    const args = { heroAspect: 0.7, pacing: 1, tone: {}, seed: "f-1" };
    expect(solveFrontGeometry(args)).toEqual(solveFrontGeometry(args));
    const variants = new Set();
    for (let i = 0; i < 12; i++) {
      const g = solveFrontGeometry({ ...args, seed: `f-${i}` });
      variants.add(`${g.hero.bleedEdges.length}|${g.nameBand.onImage}|${g.nameBand.y.toFixed(1)}`);
    }
    expect(variants.size).toBeGreaterThan(2);
  });

  test("full bleed hero covers the page with all bleed edges", () => {
    for (let i = 0; i < 40; i++) {
      const g = solveFrontGeometry({ heroAspect: 0.65, seed: `fb-${i}`, tone: { density: 1 } });
      if (g.hero.bleedEdges.length === 4) {
        expect(g.hero).toMatchObject({ x: 0, y: 0, w: PAGE_W, h: PAGE_H });
        return;
      }
    }
    throw new Error("no full-bleed front in 40 seeds");
  });

  test("quiet top band pulls the name to the top with light ink on dark rows", () => {
    const forensics = quietForensics("top", 0.95);
    let found = false;
    for (let i = 0; i < 30; i++) {
      const g = solveFrontGeometry({
        heroAspect: 0.65,
        heroForensics: forensics,
        seed: `q-${i}`,
        tone: { density: 1 }, // bias to full bleed → on-image name
      });
      if (g.nameBand.onImage && g.hero.bleedEdges.length === 4) {
        expect(g.nameBand.y).toBeLessThan(PAGE_H / 2); // top edge chosen
        expect(g.nameBand.inkOn).toBe("light"); // dark top rows → light ink
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  test("wordmark and bands stay inside the page", () => {
    for (let i = 0; i < 20; i++) {
      const g = solveFrontGeometry({ heroAspect: 0.7, seed: `w-${i}` });
      for (const rect of [g.nameBand, g.contactBand, g.statLine, g.wordmark]) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.w).toBeLessThanOrEqual(PAGE_W + 1e-6);
        expect(rect.y + rect.h).toBeLessThanOrEqual(PAGE_H + 1e-6);
      }
    }
  });
});

describe("toCssRect", () => {
  test("formats inch rects as CSS", () => {
    expect(toCssRect({ x: 0.5, y: 1.25, w: 2, h: 3.333 })).toEqual({
      left: "0.5in",
      top: "1.25in",
      width: "2in",
      height: "3.333in",
    });
  });
});
