/**
 * Back-page architecture grammar tests. The headline claim: meaningfully
 * different back-page STRUCTURES — many families — not one partition with
 * styling changes. Asserts architecture variety, validity, full-length
 * protection, photo-set responsiveness, and determinism.
 */

const { solveBackProgram, ARCHITECTURES, PAGE_W, PAGE_H, MIN_CELL } =
  require("../composition/back-program/synthesize");

const REGION = { x: 0.35, y: 0.3, w: PAGE_W - 0.7, h: PAGE_H - 0.6 };

function img(id, aspect, raw = "", role = null) {
  return { id, aspect, rawShotType: raw, role };
}
function pool(n, withFull = true) {
  const base = [
    img("a", 0.8, "headshot", "headshot"),
    img("b", 0.7, "", "editorial"),
    img("c", 1.2, "", "lifestyle"),
    img("d", 0.66, "", "editorial"),
    img("e", 0.9, "", "lifestyle"),
    img("f", 0.75, "", "editorial"),
  ].slice(0, n);
  if (withFull) base[Math.min(1, n - 1)] = img("fl", 0.55, "full_length", "full_body");
  return base;
}
function solve(overrides = {}) {
  return solveBackProgram({
    region: REGION,
    images: overrides.images || pool(4),
    stats: overrides.stats || { side: "auto", skip: false },
    pacing: 1,
    tone: overrides.tone || { formality: 0.5, density: 0.5 },
    seed: overrides.seed || "b-1",
    ...overrides,
  });
}

function noOverlaps(cells) {
  for (let i = 0; i < cells.length; i++)
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i], b = cells[j];
      const ow = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const oh = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      if (ow > 0.02 && oh > 0.02) return false;
    }
  return true;
}

describe("architecture variety (the headline claim)", () => {
  test("many distinct back architectures across seeds + photo counts", () => {
    const archs = new Set();
    for (const n of [3, 4, 5, 6]) {
      for (let i = 0; i < 30; i++) {
        const layout = solve({ images: pool(n, i % 2 === 0), seed: `va-${n}-${i}`, tone: { formality: (i % 10) / 10, density: ((i * 3) % 10) / 10 } });
        archs.add(layout.architecture);
      }
    }
    // far more than "one template": expect at least 5 distinct families
    expect(archs.size).toBeGreaterThanOrEqual(5);
  });

  test("structural signatures (arch + cell count + stats side) vary widely", () => {
    const sigs = new Set();
    for (let i = 0; i < 60; i++) {
      const l = solve({ seed: `sig-${i}`, tone: { formality: (i % 7) / 7, density: (i % 5) / 5 } });
      sigs.add(`${l.architecture}|${l.cells.length}|${l.statsBlock.orientation}|${l.statsBlock.x < 1 ? "L" : "R"}`);
    }
    expect(sigs.size).toBeGreaterThanOrEqual(10);
  });
});

describe("validity invariants across 200 runs", () => {
  test("no overlaps, in bounds, min cell size, full-length protected", () => {
    for (let i = 0; i < 200; i++) {
      const n = 3 + (i % 4);
      const withFull = i % 3 !== 0;
      const layout = solve({
        images: pool(n, withFull),
        seed: `inv-${i}`,
        tone: { formality: (i % 10) / 10, density: ((i * 7) % 10) / 10 },
        stats: { side: "auto", skip: i % 5 === 0 },
        bleedAppetite: ["none", "restrained", "expressive"][i % 3],
      });
      expect(noOverlaps(layout.cells)).toBe(true);
      for (const c of layout.cells) {
        expect(c.x).toBeGreaterThanOrEqual(-0.01);
        expect(c.y).toBeGreaterThanOrEqual(REGION.y - 0.01);
        expect(c.x + c.w).toBeLessThanOrEqual(PAGE_W + 0.01);
        expect(Math.min(c.w, c.h)).toBeGreaterThanOrEqual(MIN_CELL - 0.1);
      }
      if (withFull) {
        const fl = layout.cells.find((c) => c.imageId === "fl");
        if (fl) expect(fl.w / fl.h).toBeLessThanOrEqual(0.86);
      }
    }
  });
});

describe("photo-set responsiveness", () => {
  test("2 images → restrained duo; 6 images → high-density reachable", () => {
    const duo = solve({ images: pool(2, false), seed: "duo-x" });
    expect(duo.cells.length).toBeLessThanOrEqual(2);

    let sawDense = false;
    for (let i = 0; i < 30; i++) {
      const l = solve({ images: pool(6, false), seed: `d6-${i}`, tone: { formality: 0.4, density: 0.95 } });
      if (l.cells.length >= 5) sawDense = true;
    }
    expect(sawDense).toBe(true);
  });

  test("density bias: high density yields more cells on average than low", () => {
    const avg = (density) => {
      let total = 0;
      for (let i = 0; i < 40; i++) {
        total += solve({ images: pool(6, false), seed: `den-${density}-${i}`, tone: { formality: 0.4, density } }).cells.length;
      }
      return total / 40;
    };
    expect(avg(0.95)).toBeGreaterThan(avg(0.1));
  });
});

describe("stats strategies + determinism", () => {
  test("column and band stat strategies both reachable", () => {
    const orientations = new Set();
    for (let i = 0; i < 30; i++) orientations.add(solve({ seed: `st-${i}` }).statsBlock.orientation);
    expect(orientations.has("column")).toBe(true);
    expect(orientations.has("strip")).toBe(true);
  });

  test("stats.skip carves no stats region", () => {
    const l = solve({ stats: { side: "auto", skip: true } });
    expect(l.statsBlock.w).toBe(0);
  });

  test("same inputs + seed ⇒ deep-equal", () => {
    expect(solve({ seed: "det" })).toEqual(solve({ seed: "det" }));
  });
});
