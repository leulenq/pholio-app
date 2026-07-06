"use strict";

/**
 * Cross-candidate ranking via PROMETHEE outranking.
 *
 * Produces a PARTIAL order (PROMETHEE I) that can express genuine
 * incomparability between candidates, alongside a total order
 * (PROMETHEE II net-flow ranking) for convenience.
 *
 * This is intentionally an outranking method, not a weighted sort:
 * two candidates with opposite strengths on different criteria remain
 * incomparable rather than being forced into an arbitrary total order.
 */

const EPS = 1e-9;
const DEFAULT_Q = 0.05;
const DEFAULT_P = 0.3;

/** Round to 6 decimals for numerical stability. */
function round6(x) {
  // Add 0 to normalise -0 into 0.
  return Math.round((x + Number.EPSILON) * 1e6) / 1e6 + 0;
}

/**
 * Linear (V-shape with indifference) preference function.
 * d <= q      -> 0
 * d >= p      -> 1
 * otherwise   -> (d - q) / (p - q)
 */
function preference(d, q, p) {
  if (d <= q) return 0;
  if (d >= p) return 1;
  return (d - q) / (p - q);
}

/**
 * Collect the full set of dimensions to consider: the union of every
 * dimension that appears in any candidate's scores plus every dimension
 * named in weights.
 */
function collectDimensions(candidates, weights) {
  const dims = new Set();
  for (const c of candidates) {
    const scores = (c && c.scores) || {};
    for (const dim of Object.keys(scores)) dims.add(dim);
  }
  for (const dim of Object.keys(weights || {})) dims.add(dim);
  return Array.from(dims);
}

/**
 * Build normalized weights over the given dims.
 * Dims absent from `weights` get weight 0. Weights are normalized so the
 * used weights sum to 1 (over the dims that appear). Returns null when the
 * total weight is 0 (caller treats every pi as 0).
 */
function normalizeWeights(dims, weights) {
  const raw = {};
  let total = 0;
  for (const dim of dims) {
    const w = weights && typeof weights[dim] === "number" ? weights[dim] : 0;
    raw[dim] = w;
    total += w;
  }
  if (total <= 0) return { normalized: null, total: 0 };
  const normalized = {};
  for (const dim of dims) normalized[dim] = raw[dim] / total;
  return { normalized, total };
}

/** Score for a candidate on a dim; missing dim -> 0. */
function scoreOf(candidate, dim) {
  const scores = (candidate && candidate.scores) || {};
  const v = scores[dim];
  return typeof v === "number" ? v : 0;
}

/**
 * Aggregated preference index pi(a, b) in [0, 1].
 * If normalized is null (no positive weight), returns 0.
 */
function preferenceIndex(a, b, dims, normalized, thresholds) {
  if (!normalized) return 0;
  let sum = 0;
  for (const dim of dims) {
    const w = normalized[dim];
    if (w === 0) continue;
    const t = thresholds[dim] || {};
    const q = typeof t.q === "number" ? t.q : DEFAULT_Q;
    const p = typeof t.p === "number" ? t.p : DEFAULT_P;
    const d = scoreOf(a, dim) - scoreOf(b, dim);
    sum += w * preference(d, q, p);
  }
  return sum;
}

/**
 * Rank candidates using PROMETHEE.
 *
 * @param {Array<{id: string, scores: Object<string, number>}>} candidates
 * @param {{weights?: Object<string, number>, thresholds?: Object<string, {q:number, p:number}>}} [options]
 * @returns {{flows, order, outranks, incomparable, tiers}}
 */
function rankCandidates(candidates, options) {
  const list = Array.isArray(candidates) ? candidates : [];
  const opts = options || {};
  const weights = opts.weights || {};
  const thresholds = opts.thresholds || {};

  const n = list.length;

  // n === 0 -> empty result.
  if (n === 0) {
    return { flows: [], order: [], outranks: [], incomparable: [], tiers: [] };
  }

  const dims = collectDimensions(list, weights);
  const { normalized } = normalizeWeights(dims, weights);

  // Index map for stable ordering / pair ordering by input order.
  const indexOf = new Map();
  list.forEach((c, i) => indexOf.set(c.id, i));

  // Compute flows.
  const flows = list.map((c) => ({
    id: c.id,
    positive: 0,
    negative: 0,
    net: 0,
  }));

  if (n === 1) {
    // Single candidate: all flows are 0.
    flows[0].positive = round6(0);
    flows[0].negative = round6(0);
    flows[0].net = round6(0);
  } else {
    const denom = n - 1;
    for (let i = 0; i < n; i++) {
      let plus = 0;
      let minus = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        plus += preferenceIndex(list[i], list[j], dims, normalized, thresholds);
        minus += preferenceIndex(list[j], list[i], dims, normalized, thresholds);
      }
      flows[i].positive = round6(plus / denom);
      flows[i].negative = round6(minus / denom);
      flows[i].net = round6(flows[i].positive - flows[i].negative);
    }
  }

  const flowById = new Map();
  flows.forEach((f) => flowById.set(f.id, f));

  // PROMETHEE II total order: net desc, then positive desc, then input order.
  const order = flows
    .slice()
    .sort((a, b) => {
      if (Math.abs(b.net - a.net) > EPS) return b.net - a.net;
      if (Math.abs(b.positive - a.positive) > EPS) return b.positive - a.positive;
      return indexOf.get(a.id) - indexOf.get(b.id);
    })
    .map((f) => f.id);

  // PROMETHEE I partial order: pairwise outranking / indifference / incomparability.
  const outranks = [];
  const incomparable = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = flows[i];
      const b = flows[j];

      const plusEq = Math.abs(a.positive - b.positive) <= EPS;
      const minusEq = Math.abs(a.negative - b.negative) <= EPS;

      // a's positive >= b's positive (within epsilon)
      const aPlusGE = a.positive - b.positive >= -EPS;
      const bPlusGE = b.positive - a.positive >= -EPS;
      // a's negative <= b's negative (within epsilon)
      const aMinusLE = a.negative - b.negative <= EPS;
      const bMinusLE = b.negative - a.negative <= EPS;

      if (plusEq && minusEq) {
        // Indifferent: neither outranks; not incomparable.
        continue;
      }

      // a outranks b: phiPlus(a) >= phiPlus(b) AND phiMinus(a) <= phiMinus(b),
      // with at least one strict inequality.
      const aOutranksB = aPlusGE && aMinusLE && !(plusEq && minusEq);
      const bOutranksA = bPlusGE && bMinusLE && !(plusEq && minusEq);

      if (aOutranksB && !bOutranksA) {
        outranks.push([a.id, b.id]);
      } else if (bOutranksA && !aOutranksB) {
        outranks.push([b.id, a.id]);
      } else {
        // Flows disagree -> genuine tradeoff -> incomparable.
        // Listed once, a<b by input order (i < j already guarantees this).
        incomparable.push([a.id, b.id]);
      }
    }
  }

  // Comparability tiers: greedily group by net flow within epsilon, best -> worst.
  const tiers = [];
  let current = null;
  let currentNet = null;
  for (const id of order) {
    const net = flowById.get(id).net;
    if (current === null || Math.abs(net - currentNet) > EPS) {
      current = [id];
      currentNet = net;
      tiers.push(current);
    } else {
      current.push(id);
    }
  }

  return { flows, order, outranks, incomparable, tiers };
}

module.exports = { rankCandidates };
