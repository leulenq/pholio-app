"use strict";

const { rankCandidates } = require("../../src/domains/matching/ranker");

/** Helper: find a flow entry by id. */
function flow(result, id) {
  return result.flows.find((f) => f.id === id);
}

/** Helper: does outranks contain the ordered pair [a, b]? */
function hasOutrank(result, a, b) {
  return result.outranks.some((pair) => pair[0] === a && pair[1] === b);
}

/** Helper: is the unordered pair {a, b} incomparable? */
function isIncomparable(result, a, b) {
  return result.incomparable.some(
    (pair) =>
      (pair[0] === a && pair[1] === b) || (pair[0] === b && pair[1] === a)
  );
}

/** Helper: are a and b in the same tier? */
function sameTier(result, a, b) {
  return result.tiers.some((t) => t.includes(a) && t.includes(b));
}

describe("ranker :: PROMETHEE dominance", () => {
  it("a strictly dominating candidate has higher net flow and outranks the other", () => {
    const candidates = [
      { id: "A", scores: { look: 0.9, height: 0.9 } },
      { id: "B", scores: { look: 0.4, height: 0.4 } },
    ];
    const result = rankCandidates(candidates, {
      weights: { look: 1, height: 1 },
    });

    expect(flow(result, "A").net).toBeGreaterThan(flow(result, "B").net);
    expect(hasOutrank(result, "A", "B")).toBe(true);
    expect(hasOutrank(result, "B", "A")).toBe(false);
    expect(isIncomparable(result, "A", "B")).toBe(false);
    expect(result.order[0]).toBe("A");
  });
});

describe("ranker :: genuine tradeoff -> incomparability", () => {
  it("opposite strengths with equal weights and symmetric thresholds are incomparable", () => {
    // A is strong on look / weak on commercial; B is the mirror image.
    // Both clearly beat the weak reference C, but relative to each other A has
    // both a higher positive AND a higher negative flow (a polarizing profile),
    // so the flows disagree and PROMETHEE I declares them incomparable — a
    // genuine tradeoff, even though PROMETHEE II still forces a total order.
    // (Note: a bare 2-candidate mirror is *indifferent*, not incomparable, since
    // the two-way outranking test collapses to a single comparison; a third
    // reference candidate is required to surface real incomparability.)
    const candidates = [
      { id: "A", scores: { look: 0.4, commercial: 0.0 } },
      { id: "B", scores: { look: 0.0, commercial: 0.4 } },
      { id: "C", scores: { look: 0.0, commercial: 0.2 } },
    ];
    const result = rankCandidates(candidates, {
      weights: { look: 1, commercial: 1 },
      thresholds: {
        look: { q: 0.05, p: 0.3 },
        commercial: { q: 0.05, p: 0.3 },
      },
    });

    // PROMETHEE I: A and B are incomparable (genuine tradeoff)...
    expect(isIncomparable(result, "A", "B")).toBe(true);
    expect(hasOutrank(result, "A", "B")).toBe(false);
    expect(hasOutrank(result, "B", "A")).toBe(false);
    // ...but both strictly outrank the weak reference C.
    expect(hasOutrank(result, "A", "C")).toBe(true);
    expect(hasOutrank(result, "B", "C")).toBe(true);

    // PROMETHEE II order still lists all three (total order over the tradeoff).
    expect(result.order.slice().sort()).toEqual(["A", "B", "C"]);
  });
});

describe("ranker :: identical candidates", () => {
  it("equal scores => net 0, no outrank, grouped in same tier (indifferent)", () => {
    const candidates = [
      { id: "A", scores: { look: 0.5, height: 0.6 } },
      { id: "B", scores: { look: 0.5, height: 0.6 } },
    ];
    const result = rankCandidates(candidates, {
      weights: { look: 1, height: 1 },
    });

    expect(flow(result, "A").net).toBe(0);
    expect(flow(result, "B").net).toBe(0);
    expect(hasOutrank(result, "A", "B")).toBe(false);
    expect(hasOutrank(result, "B", "A")).toBe(false);
    expect(isIncomparable(result, "A", "B")).toBe(false);
    expect(sameTier(result, "A", "B")).toBe(true);
  });
});

describe("ranker :: weights matter", () => {
  it("shifting weight onto A's dominant criterion flips the order", () => {
    // A dominates on look, B dominates on commercial.
    const candidates = [
      { id: "A", scores: { look: 0.9, commercial: 0.2 } },
      { id: "B", scores: { look: 0.2, commercial: 0.9 } },
    ];

    const favorCommercial = rankCandidates(candidates, {
      weights: { look: 1, commercial: 5 },
    });
    expect(favorCommercial.order[0]).toBe("B");

    const favorLook = rankCandidates(candidates, {
      weights: { look: 5, commercial: 1 },
    });
    expect(favorLook.order[0]).toBe("A");
  });
});

describe("ranker :: numeric bounds", () => {
  it("keeps flows and net within valid ranges", () => {
    const candidates = [
      { id: "A", scores: { look: 0.8, height: 0.3, commercial: 0.5 } },
      { id: "B", scores: { look: 0.2, height: 0.9, commercial: 0.4 } },
      { id: "C", scores: { look: 0.5, height: 0.5, commercial: 0.5 } },
      { id: "D", scores: { look: 0.1, height: 0.1, commercial: 0.95 } },
    ];
    const result = rankCandidates(candidates, {
      weights: { look: 2, height: 1, commercial: 1 },
    });

    for (const f of result.flows) {
      expect(f.positive).toBeGreaterThanOrEqual(0);
      expect(f.positive).toBeLessThanOrEqual(1);
      expect(f.negative).toBeGreaterThanOrEqual(0);
      expect(f.negative).toBeLessThanOrEqual(1);
      expect(f.net).toBeGreaterThanOrEqual(-1);
      expect(f.net).toBeLessThanOrEqual(1);
    }
  });
});

describe("ranker :: degenerate sizes", () => {
  it("n === 0 returns empty result without error", () => {
    const result = rankCandidates([], { weights: { look: 1 } });
    expect(result.flows).toEqual([]);
    expect(result.order).toEqual([]);
    expect(result.outranks).toEqual([]);
    expect(result.incomparable).toEqual([]);
    expect(result.tiers).toEqual([]);
  });

  it("n === 1 yields zero flows and a single tier without divide-by-zero", () => {
    const result = rankCandidates([{ id: "solo", scores: { look: 0.7 } }], {
      weights: { look: 1 },
    });
    expect(flow(result, "solo").positive).toBe(0);
    expect(flow(result, "solo").negative).toBe(0);
    expect(flow(result, "solo").net).toBe(0);
    expect(result.order).toEqual(["solo"]);
    expect(result.tiers).toEqual([["solo"]]);
    expect(Number.isFinite(flow(result, "solo").net)).toBe(true);
  });
});

describe("ranker :: thresholds", () => {
  it("large indifference q makes small score differences produce no preference (tied)", () => {
    const candidates = [
      { id: "A", scores: { look: 0.55 } },
      { id: "B", scores: { look: 0.5 } },
    ];
    // Difference is 0.05, below q=0.2 -> P = 0 both ways.
    const result = rankCandidates(candidates, {
      weights: { look: 1 },
      thresholds: { look: { q: 0.2, p: 0.5 } },
    });

    expect(flow(result, "A").net).toBe(0);
    expect(flow(result, "B").net).toBe(0);
    expect(hasOutrank(result, "A", "B")).toBe(false);
    expect(isIncomparable(result, "A", "B")).toBe(false);
    expect(sameTier(result, "A", "B")).toBe(true);
  });

  it("small thresholds let the same difference create a strict preference", () => {
    const candidates = [
      { id: "A", scores: { look: 0.55 } },
      { id: "B", scores: { look: 0.5 } },
    ];
    const result = rankCandidates(candidates, {
      weights: { look: 1 },
      thresholds: { look: { q: 0.0, p: 0.02 } },
    });
    expect(hasOutrank(result, "A", "B")).toBe(true);
  });
});

describe("ranker :: weights/scores normalization edge cases", () => {
  it("dims present in weights but missing from a candidate are treated as score 0", () => {
    const candidates = [
      { id: "A", scores: { look: 0.9 } }, // missing height -> 0
      { id: "B", scores: { look: 0.9, height: 0.9 } },
    ];
    const result = rankCandidates(candidates, {
      weights: { look: 1, height: 1 },
    });
    // B dominates on height, ties on look -> B outranks A.
    expect(hasOutrank(result, "B", "A")).toBe(true);
  });

  it("dims present in scores but absent from weights get weight 0", () => {
    const candidates = [
      { id: "A", scores: { look: 0.9, noise: 0.0 } },
      { id: "B", scores: { look: 0.9, noise: 1.0 } },
    ];
    // Only look is weighted; look is tied -> indifferent despite noise diff.
    const result = rankCandidates(candidates, { weights: { look: 1 } });
    expect(flow(result, "A").net).toBe(0);
    expect(flow(result, "B").net).toBe(0);
    expect(sameTier(result, "A", "B")).toBe(true);
  });

  it("zero total weight yields all-zero flows without error", () => {
    const candidates = [
      { id: "A", scores: { look: 0.9 } },
      { id: "B", scores: { look: 0.1 } },
    ];
    const result = rankCandidates(candidates, { weights: {} });
    expect(flow(result, "A").net).toBe(0);
    expect(flow(result, "B").net).toBe(0);
  });
});

describe("ranker :: order stability and tiers", () => {
  it("order is net desc, ties broken by positive then input order", () => {
    const candidates = [
      { id: "A", scores: { look: 0.5, height: 0.5 } },
      { id: "B", scores: { look: 0.5, height: 0.5 } },
      { id: "C", scores: { look: 0.9, height: 0.9 } },
    ];
    const result = rankCandidates(candidates, {
      weights: { look: 1, height: 1 },
    });
    expect(result.order[0]).toBe("C");
    // A and B are tied; stable input order keeps A before B.
    expect(result.order.indexOf("A")).toBeLessThan(result.order.indexOf("B"));
    // C in its own top tier; A and B share the next tier.
    expect(result.tiers[0]).toEqual(["C"]);
    expect(result.tiers[1].sort()).toEqual(["A", "B"]);
  });

  it("rounds flow numbers to 6 decimals", () => {
    const candidates = [
      { id: "A", scores: { x: 0.123456789 } },
      { id: "B", scores: { x: 0.0 } },
    ];
    const result = rankCandidates(candidates, {
      weights: { x: 1 },
      thresholds: { x: { q: 0, p: 1 } },
    });
    for (const f of result.flows) {
      const decimals = (String(f.positive).split(".")[1] || "").length;
      expect(decimals).toBeLessThanOrEqual(6);
    }
  });
});
