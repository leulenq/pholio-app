/**
 * Crop-space transform tests (audit P0-2).
 *
 * The visible-window math must mirror CSS object-fit: cover with
 * object-position, and forensics remapping must express quiet bands, the
 * subject mask, and the focal point in terms of the pixels the page shows.
 */

const {
  parseObjectPosition,
  visibleCropWindow,
  cropForensics,
  cropMatteGrid,
} = require("../composition/crop-space");

describe("parseObjectPosition", () => {
  test("parses percentages", () => {
    expect(parseObjectPosition("50% 18%")).toEqual({ x: 0.5, y: 0.18 });
  });
  test("falls back to center for junk", () => {
    expect(parseObjectPosition(null)).toEqual({ x: 0.5, y: 0.5 });
    expect(parseObjectPosition("left top")).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("visibleCropWindow", () => {
  test("identity when aspects match", () => {
    expect(visibleCropWindow({ imageAspect: 0.65, cellAspect: 0.65 })).toEqual({
      x0: 0, y0: 0, x1: 1, y1: 1,
    });
  });

  test("null when aspects unknown (fail-soft identity)", () => {
    expect(visibleCropWindow({ imageAspect: null, cellAspect: 0.6 })).toBeNull();
  });

  test("taller image in a wider cell crops vertically at object-position y", () => {
    // image 2:3 (0.667) in a square cell → visible height fraction = 0.667
    const win = visibleCropWindow({
      imageAspect: 2 / 3,
      cellAspect: 1,
      objectPosition: "50% 0%",
    });
    expect(win.x0).toBe(0);
    expect(win.x1).toBe(1);
    expect(win.y0).toBeCloseTo(0, 4); // top-aligned
    expect(win.y1).toBeCloseTo(2 / 3, 3);

    const bottom = visibleCropWindow({
      imageAspect: 2 / 3,
      cellAspect: 1,
      objectPosition: "50% 100%",
    });
    expect(bottom.y0).toBeCloseTo(1 / 3, 3);
    expect(bottom.y1).toBeCloseTo(1, 4);
  });

  test("wider image in a taller cell crops horizontally at object-position x", () => {
    const win = visibleCropWindow({
      imageAspect: 1.5,
      cellAspect: 0.75,
      objectPosition: "25% 50%",
    });
    // visible width fraction = 0.75 / 1.5 = 0.5; x0 = (1 - 0.5) * 0.25
    expect(win.y0).toBe(0);
    expect(win.y1).toBe(1);
    expect(win.x0).toBeCloseTo(0.125, 4);
    expect(win.x1).toBeCloseTo(0.625, 4);
  });
});

// A synthetic forensics fixture: 9×6 grids, bright/flat top half, dark/busy
// bottom half — a subject standing in the lower half of the frame.
function fixtureForensics() {
  const rows = 9;
  const cols = 6;
  const luma = [];
  const detail = [];
  for (let r = 0; r < rows; r++) {
    const bottom = r >= 5;
    luma.push(new Array(cols).fill(bottom ? 0.12 : 0.85));
    detail.push(new Array(cols).fill(bottom ? 0.8 : 0.02));
  }
  return {
    aspect: 2 / 3,
    luma: { rows, cols, grid: luma, mean: 0.5, isDark: false },
    detail: { grid: detail },
    quiet: {
      top: { score: 0.95, bandRows: 3 },
      bottom: { score: 0.1, bandRows: 2 },
      left: { score: 0.4, bandCols: 2 },
      right: { score: 0.4, bandCols: 2 },
    },
    focal: { x: 0.5, y: 0.3 },
    palette: [],
    warmth: 0,
    saturation: 0.2,
    contrast: 0.5,
  };
}

describe("cropForensics", () => {
  test("identity window returns the original object", () => {
    const f = fixtureForensics();
    expect(cropForensics(f, null)).toBe(f);
    expect(cropForensics(f, { x0: 0, y0: 0, x1: 1, y1: 1 })).toBe(f);
  });

  test("cropping to the busy bottom region kills the quiet-top verdict", () => {
    const f = fixtureForensics();
    // Only the bottom 40% of the image is visible (raw rows 5–8: the dark,
    // busy subject) → the visible top band is the subject's midsection —
    // nothing like the raw image's near-perfect quiet top band.
    const win = { x0: 0, y0: 0.6, x1: 1, y1: 1 };
    const eff = cropForensics(f, win);
    expect(eff).not.toBe(f);
    expect(eff.quiet.top.score).toBeLessThan(0.6);
    // raw verdict said the top was near-perfectly quiet
    expect(f.quiet.top.score).toBeGreaterThan(0.9);
    // focal remaps into window coordinates: (0.3 - 0.6) / 0.4 → clamped 0
    expect(eff.focal.y).toBe(0);
    expect(eff.cropWindow).toEqual(win);
  });

  test("cropping to the flat top half keeps it quiet and remaps the focal", () => {
    const f = fixtureForensics();
    const win = { x0: 0, y0: 0, x1: 1, y1: 0.5 };
    const eff = cropForensics(f, win);
    expect(eff.quiet.top.score).toBeGreaterThan(0.85);
    expect(eff.focal.y).toBeCloseTo(0.6, 4); // 0.3 / 0.5
    expect(eff.luma.isDark).toBe(false);
  });
});

describe("cropMatteGrid", () => {
  test("resamples subject coverage into the window", () => {
    // subject occupies the bottom half of the raw matte
    const grid = [
      [0, 0], [0, 0], [0, 0], [0, 0],
      [1, 1], [1, 1], [1, 1], [1, 1],
    ];
    const win = { x0: 0, y0: 0.5, x1: 1, y1: 1 };
    const cropped = cropMatteGrid(grid, win);
    // everything visible is subject now
    expect(cropped.every((row) => row.every((v) => v === 1))).toBe(true);
    // identity passes through
    expect(cropMatteGrid(grid, null)).toBe(grid);
  });
});
