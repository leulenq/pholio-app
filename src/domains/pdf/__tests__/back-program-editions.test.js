/**
 * Back-program EDITIONS tests (plan 2.7).
 *
 * The edition path is flag-gated on `input.edition = { def, operators }`.
 * These assert the four load-bearing behaviors: architecture-pool restriction
 * (+ infeasible fallback), per-edition chrome-style emission, the per-edition
 * back objectives (footline geometry, airy whitespace, Swiss module snap), the
 * nameplate + front↔back cohesion echo, and determinism.
 *
 * Legacy exactness for the no-edition path lives in
 * back-program-legacy-exact.test.js.
 */

const { solveBackProgram, MIN_CELL, PAGE_W, PAGE_H } =
  require("../composition/back-program/synthesize");
const { EDITIONS_BY_ID } = require("../composition/editions");

const REGION = { x: 0.35, y: 0.3, w: PAGE_W - 0.7, h: PAGE_H - 0.6 };
const FOOT_H = 0.46; // chrome foot band (constant in the solver)

function img(id, aspect, raw = "", role = null) {
  return { id, aspect, rawShotType: raw, role };
}
// portrait-ish set WITHOUT a full-length — so the full-length guarantee never
// rebuilds a feature-column outside the edition pool (that guarantee is
// Booker's law and intentionally overrides the pool; tested separately).
function poolNoFull(n = 4) {
  return [
    img("a", 0.75, "headshot", "headshot"),
    img("b", 0.7, "", "editorial"),
    img("c", 0.8, "", "editorial"),
    img("d", 0.72, "", "editorial"),
    img("e", 0.78, "", "editorial"),
    img("f", 0.74, "", "editorial"),
  ].slice(0, n);
}
function poolWithFull(n = 4) {
  const base = poolNoFull(n);
  base[Math.min(1, n - 1)] = img("fl", 0.55, "full_length", "full_body");
  return base;
}

function solveEd(edId, { field = "paper", images = poolNoFull(4), tone = { formality: 0.6, density: 0.5 }, seed = "e-1", frontEcho, bleedAppetite = "none", def } = {}) {
  const editionDef = def || EDITIONS_BY_ID[edId];
  return solveBackProgram({
    region: REGION,
    images,
    stats: { side: "auto", skip: false },
    pacing: 1,
    tone,
    seed,
    cropEngine: null,
    bleedAppetite,
    edition: { def: editionDef, operators: { field, register: "standard" } },
    frontEcho,
  });
}

// ── architecture pools ───────────────────────────────────────────────────────

describe("architecture pool restriction + fallback", () => {
  test("the draw stays inside the edition's declared back pool (no full-length)", () => {
    const def = EDITIONS_BY_ID["the-strip"];
    const poolList = def.back.pool;
    for (let i = 0; i < 40; i++) {
      // densities that keep the desired count ≥ 3 (the strip's families' min);
      // a lower count legitimately falls back (asserted separately).
      const l = solveEd("the-strip", { field: "warm", seed: `pool-${i}`, tone: { formality: 0.4, density: 0.4 + (i % 4) / 10 } });
      const fellBack = l.decisions.some((d) => d.aspect === "edition-pool" && /fallback/.test(d.choice));
      expect(fellBack || poolList.includes(l.architecture)).toBe(true);
    }
  });

  test("swiss back stays inside its pool and logs the restriction", () => {
    const def = EDITIONS_BY_ID["swiss-modernist"];
    const l = solveEd("swiss-modernist", { seed: "swiss-pool" });
    expect(def.back.pool).toContain(l.architecture);
    expect(l.decisions.some((d) => d.aspect === "edition-pool" && !/fallback/.test(d.choice))).toBe(true);
  });

  test("an infeasible pool falls back to full eligibility (logged, no throw)", () => {
    // restrained-duo maxes at 2 cells; six dense images want ~6 ⇒ infeasible.
    const def = { id: "test-narrow", back: { pool: ["restrained-duo"], style: { nameAlign: "left", statsStyle: "auto", dividers: false, cellIndexes: false } } };
    const l = solveEd("test-narrow", { def, images: poolNoFull(6), tone: { formality: 0.4, density: 0.95 }, seed: "infeasible" });
    const d = l.decisions.find((x) => x.aspect === "edition-pool");
    expect(d).toBeDefined();
    expect(d.choice).toMatch(/fallback/);
    expect(l.cells.length).toBeGreaterThan(2);
  });
});

// ── chrome style emission ────────────────────────────────────────────────────

describe("chrome style emission per edition", () => {
  test("style merges def.back.style + operators.field; dark field forces reversed", () => {
    for (const id of Object.keys(EDITIONS_BY_ID)) {
      const def = EDITIONS_BY_ID[id];
      const field = (def.back.style && def.back.style.reversed) || (def.fields || []).includes("dark") ? "dark" : "paper";
      const l = solveEd(id, { field });
      const s = def.back.style || {};
      expect(l.style.nameAlign).toBe(s.nameAlign || "left");
      expect(l.style.statsStyle).toBe(s.statsStyle || "auto");
      expect(l.style.dividers).toBe(Boolean(s.dividers));
      expect(l.style.cellIndexes).toBe(Boolean(s.cellIndexes));
      expect(l.style.airy).toBe(Boolean(s.airy));
      expect(l.style.field).toBe(field);
      expect(l.style.reversed).toBe(Boolean(s.reversed) || field === "dark");
    }
  });

  test("a dark field reverses an edition whose own back style is not reversed", () => {
    // gallery-monograph allows a dark field but its back style is not reversed.
    const l = solveEd("gallery-monograph", { field: "dark" });
    expect(l.style.reversed).toBe(true);
  });

  test("the nameplate is emitted with running-head scale + style alignment", () => {
    const l = solveEd("editorial-masthead");
    expect(l.nameplate).toEqual({ text: null, scale: "running-head", align: l.style.nameAlign });
  });
});

// ── footline geometry ────────────────────────────────────────────────────────

describe("footline stats geometry (Monograph)", () => {
  const l = solveEd("gallery-monograph", { seed: "foot-1" });

  test("stats block is a footline row, not a side column", () => {
    expect(l.statsBlock.orientation).toBe("footline");
    // a short row (single measure-disciplined line region)
    expect(l.statsBlock.h).toBeLessThanOrEqual(0.44);
    expect(l.statsBlock.h).toBeGreaterThan(0);
  });

  test("photos reclaim the full content width above the footline", () => {
    // the footline frees the side column: some cell reaches near both content
    // edges (no cell is boxed into a narrow side-by-column layout).
    const leftEdge = Math.min(...l.cells.map((c) => c.x));
    const rightEdge = Math.max(...l.cells.map((c) => c.x + c.w));
    expect(rightEdge - leftEdge).toBeGreaterThan(REGION.w * 0.7);
  });

  test("the stats row sits within the foot, never overlapping a cell", () => {
    const statsTop = l.statsBlock.y;
    for (const c of l.cells) {
      const cellBottom = c.y + c.h;
      // cells end at or above the footline row (allow a hair for rounding)
      expect(cellBottom).toBeLessThanOrEqual(statsTop + 0.03);
    }
  });
});

// ── airy whitespace / coverage bounds ────────────────────────────────────────

describe("airy whitespace + coverage bounds (Monograph)", () => {
  test("coverage is capped so whitespace lands in the 0.35–0.5 target", () => {
    for (let i = 0; i < 12; i++) {
      const l = solveEd("gallery-monograph", { seed: `airy-${i}`, tone: { formality: 0.6, density: (i % 5) / 5 } });
      expect(l.coverageRatio).toBeLessThanOrEqual(0.65);
    }
  });

  test("airy margins scale up (content is inset) and are logged", () => {
    const l = solveEd("gallery-monograph", { seed: "airy-margins" });
    expect(l.decisions.some((d) => d.aspect === "airy-margins")).toBe(true);
  });

  test("mat-asymmetry echo shifts the air to the front's heavy side", () => {
    const left = solveEd("gallery-monograph", { seed: "echo", frontEcho: { matAsymmetry: "left" } });
    const right = solveEd("gallery-monograph", { seed: "echo", frontEcho: { matAsymmetry: "right" } });
    const leftMin = Math.min(...left.cells.map((c) => c.x));
    const rightMin = Math.min(...right.cells.map((c) => c.x));
    // a left-heavy mat pushes the cells further right (bigger left margin).
    expect(leftMin).toBeGreaterThan(rightMin);
  });
});

// ── swiss module snap ────────────────────────────────────────────────────────

describe("swiss module-grid snap (≤ 0.02in)", () => {
  function snapErr(v, start, m) {
    return Math.abs(v - (start + Math.round((v - start) / m) * m));
  }

  test("every cell edge lands within 0.02in of the published module grid", () => {
    for (const seed of ["sw-a", "sw-b", "sw-c", "sw-d"]) {
      const l = solveEd("swiss-modernist", { seed, images: poolNoFull(4), tone: { formality: 0.7, density: 0.5 } });
      expect(l.style.dividers).toBe(true);
      const g = l.style.grid; // { x, y, w, h, moduleCount } over the photo area
      expect(g).toBeDefined();
      const mx = g.w / g.moduleCount;
      const my = g.h / g.moduleCount;
      for (const c of l.cells) {
        expect(snapErr(c.x, g.x, mx)).toBeLessThanOrEqual(0.02);
        expect(snapErr(c.x + c.w, g.x, mx)).toBeLessThanOrEqual(0.02);
        expect(snapErr(c.y, g.y, my)).toBeLessThanOrEqual(0.02);
        expect(snapErr(c.y + c.h, g.y, my)).toBeLessThanOrEqual(0.02);
      }
      // the stats block's rows ride the same y-rhythm
      expect(snapErr(l.statsBlock.y, g.y, my)).toBeLessThanOrEqual(0.02);
    }
  });

  test("frontEcho.moduleCount seeds the grid when provided", () => {
    const l = solveEd("swiss-modernist", { seed: "sw-mod", frontEcho: { moduleCount: 6 } });
    expect(l.style.moduleCount).toBe(6);
  });

  test("snapped cells still clear MIN_CELL", () => {
    const l = solveEd("swiss-modernist", { seed: "sw-min", images: poolNoFull(4) });
    for (const c of l.cells) {
      expect(Math.min(c.w, c.h)).toBeGreaterThanOrEqual(MIN_CELL - 0.05);
    }
  });
});

// ── full-length guarantee still enforced under editions ──────────────────────

describe("full-length guarantee unchanged under editions", () => {
  test("the full-length keeps a portrait cell (aspect ≤ 0.86) for every edition", () => {
    for (const id of ["gallery-monograph", "swiss-modernist", "ink-noir", "the-strip", "house-classic"]) {
      for (let i = 0; i < 10; i++) {
        const field = id === "ink-noir" ? "dark" : "paper";
        const l = solveEd(id, { field, images: poolWithFull(4), seed: `fl-${id}-${i}` });
        const fl = l.cells.find((c) => c.imageId === "fl");
        if (fl) expect(fl.w / fl.h).toBeLessThanOrEqual(0.86);
      }
    }
  });
});

// ── determinism ──────────────────────────────────────────────────────────────

describe("determinism (editions)", () => {
  test("same edition inputs + seed ⇒ deep-equal", () => {
    const opts = { field: "warm", seed: "det-ed", images: poolWithFull(4), tone: { formality: 0.5, density: 0.6 } };
    expect(solveEd("the-strip", opts)).toEqual(solveEd("the-strip", opts));
  });

  test("swiss snap is deterministic across repeated solves", () => {
    const a = solveEd("swiss-modernist", { seed: "det-sw", frontEcho: { moduleCount: 8 } });
    const b = solveEd("swiss-modernist", { seed: "det-sw", frontEcho: { moduleCount: 8 } });
    expect(a).toEqual(b);
  });
});
