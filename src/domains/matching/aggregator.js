'use strict';

/**
 * Interaction-aware aggregation core for the talent-matching decision engine.
 *
 * Replaces naive weighted-sum scoring with a 2-additive Choquet integral over a
 * fuzzy measure (capacity). The 2-additive model captures pairwise synergy and
 * redundancy between signals while remaining fully explainable through Shapley
 * values (per-dimension importance) and interaction indices (per-pair coupling).
 *
 * Canonical compact (Grabisch) form of the 2-additive Choquet integral:
 *
 *     C(x) = Σ_i phi_i * x_i  −  0.5 * Σ_{i<j} I_ij * |x_i − x_j|
 *
 * where `phi_i` are Shapley values (Σ phi_i = 1) and `I_ij ∈ [-1, 1]` are the
 * Shapley interaction indices.
 *
 * No external dependencies — plain JS math only.
 */

/**
 * Build the canonical "a|b" pair key for two dimension names.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function pairKeyOf(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Split a pair key back into its two dimension names.
 * @param {string} key
 * @returns {[string, string]}
 */
function splitPairKey(key) {
  const idx = key.indexOf('|');
  return [key.slice(0, idx), key.slice(idx + 1)];
}

/**
 * Clamp a number into a closed interval.
 * @param {number} x
 * @param {number} [lo=0]
 * @param {number} [hi=1]
 * @returns {number}
 */
function clamp(x, lo = 0, hi = 1) {
  if (!Number.isFinite(x)) return lo;
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

/**
 * Given Shapley values and pairwise interaction indices over a fixed dimension
 * set, compute the largest global shrink factor `t ∈ (0, 1]` such that scaling
 * every interaction by `t` satisfies the 2-additive monotonicity condition:
 *
 *     for every i:   phi_i − 0.5 * Σ_{j≠i} |t * I_ij| ≥ 0
 *
 * If the capacity is already monotone the factor is 1. If a dimension has zero
 * importance but nonzero coupling the factor collapses to 0 (interactions are
 * removed), which always yields a monotone capacity.
 *
 * @param {string[]} dims
 * @param {{[dim: string]: number}} phi
 * @param {{[pairKey: string]: number}} interaction
 * @returns {number} shrink factor in [0, 1]
 */
function monotonicityShrinkFactor(dims, phi, interaction) {
  // need_i = 0.5 * Σ_{j≠i} |I_ij|  (unshrunk demand on dimension i)
  const need = {};
  for (const d of dims) need[d] = 0;

  for (const key of Object.keys(interaction)) {
    const [a, b] = splitPairKey(key);
    if (!(a in need) || !(b in need)) continue;
    const half = 0.5 * Math.abs(interaction[key]);
    need[a] += half;
    need[b] += half;
  }

  let factor = 1;
  for (const d of dims) {
    if (need[d] <= 0) continue;
    const allowed = (phi[d] || 0) / need[d];
    if (allowed < factor) factor = allowed;
  }
  return clamp(factor, 0, 1);
}

/**
 * Build a normalized, monotone 2-additive capacity from prior beliefs.
 *
 * @param {Object} priors
 * @param {{[dim: string]: number}} priors.importance
 *   Non-negative relative importances per dimension. Normalized so Shapley
 *   values sum to 1. If empty or all-zero, importance is spread uniformly.
 * @param {{[pairKey: string]: number}} [priors.interactions]
 *   Optional interaction indices in [-1, 1]. `pairKey` is the two dim names
 *   sorted ascending, joined by "|". Positive = complementary/synergy,
 *   negative = redundant/substitutable. Pairs referencing unknown dims are
 *   ignored.
 * @returns {{dims: string[], phi: {[dim: string]: number}, interaction: {[pairKey: string]: number}}}
 */
function buildCapacity(priors) {
  const importance = (priors && priors.importance) || {};
  const rawInteractions = (priors && priors.interactions) || {};

  const dims = Object.keys(importance);

  // --- Normalize importance into Shapley values (Σ phi = 1) ---
  const phi = {};
  let total = 0;
  for (const d of dims) {
    const v = Number(importance[d]);
    const w = Number.isFinite(v) && v > 0 ? v : 0;
    phi[d] = w;
    total += w;
  }

  if (dims.length === 0) {
    return { dims: [], phi: {}, interaction: {} };
  }

  if (total > 0) {
    for (const d of dims) phi[d] = phi[d] / total;
  } else {
    // All zero/empty importance → uniform distribution.
    const u = 1 / dims.length;
    for (const d of dims) phi[d] = u;
  }

  // --- Collect valid interaction indices ---
  const dimSet = new Set(dims);
  const interaction = {};
  for (const key of Object.keys(rawInteractions)) {
    const [a, b] = splitPairKey(key);
    if (a === b) continue;
    if (!dimSet.has(a) || !dimSet.has(b)) continue; // ignore unknown dims
    const val = Number(rawInteractions[key]);
    if (!Number.isFinite(val) || val === 0) continue;
    // Canonicalize the key ordering and clamp to [-1, 1].
    interaction[pairKeyOf(a, b)] = clamp(val, -1, 1);
  }

  // --- Enforce monotonicity via a single global shrink factor ---
  const factor = monotonicityShrinkFactor(dims, phi, interaction);
  if (factor < 1) {
    for (const key of Object.keys(interaction)) {
      const scaled = interaction[key] * factor;
      if (scaled === 0) delete interaction[key];
      else interaction[key] = scaled;
    }
  }

  return { dims, phi, interaction };
}

/**
 * Compute the 2-additive Choquet integral of `scores` under `capacity`, with a
 * full Shapley + interaction explainability breakdown.
 *
 * Only dimensions present in BOTH `scores` and `capacity.dims` participate. The
 * Shapley values are renormalized over the present sub-capacity to sum to 1,
 * interaction pairs referencing an absent dimension are dropped, and the
 * sub-capacity is re-shrunk to remain monotone. Input scores are clamped to
 * [0, 1].
 *
 * @param {{[dim: string]: number}} scores
 * @param {{dims: string[], phi: {[dim: string]: number}, interaction: {[pairKey: string]: number}}} capacity
 * @returns {{
 *   value: number,
 *   contributions: Array<{dim: string, importance: number, score: number, contribution: number}>,
 *   interactions: Array<{pair: [string, string], index: number, disagreement: number, contribution: number}>,
 *   shapley: {[dim: string]: number},
 *   interactionIndex: {[pairKey: string]: number}
 * }}
 */
function choquet2additive(scores, capacity) {
  const empty = {
    value: 0,
    contributions: [],
    interactions: [],
    shapley: {},
    interactionIndex: {},
  };

  if (!scores || !capacity || !Array.isArray(capacity.dims)) return empty;

  const capPhi = capacity.phi || {};
  const capInteraction = capacity.interaction || {};

  // --- Determine present dims (in both scores and capacity) ---
  const present = capacity.dims.filter((d) => Object.prototype.hasOwnProperty.call(scores, d));
  if (present.length === 0) return empty;

  const presentSet = new Set(present);

  // --- Clamp participating scores to [0, 1] ---
  const x = {};
  for (const d of present) x[d] = clamp(Number(scores[d]), 0, 1);

  // --- Renormalize Shapley values over the present dims ---
  const phi = {};
  let phiSum = 0;
  for (const d of present) {
    const v = Number(capPhi[d]);
    phi[d] = Number.isFinite(v) && v > 0 ? v : 0;
    phiSum += phi[d];
  }
  if (phiSum > 0) {
    for (const d of present) phi[d] = phi[d] / phiSum;
  } else {
    const u = 1 / present.length;
    for (const d of present) phi[d] = u;
  }

  // --- Drop interaction pairs referencing an absent dim ---
  const interaction = {};
  for (const key of Object.keys(capInteraction)) {
    const [a, b] = splitPairKey(key);
    if (!presentSet.has(a) || !presentSet.has(b)) continue;
    const val = Number(capInteraction[key]);
    if (!Number.isFinite(val) || val === 0) continue;
    interaction[key] = val;
  }

  // --- Re-shrink the present sub-capacity to stay monotone ---
  const factor = monotonicityShrinkFactor(present, phi, interaction);
  if (factor < 1) {
    for (const key of Object.keys(interaction)) {
      const scaled = interaction[key] * factor;
      if (scaled === 0) delete interaction[key];
      else interaction[key] = scaled;
    }
  }

  // --- Additive (Shapley) part: Σ phi_i x_i ---
  let value = 0;
  const contributions = [];
  for (const d of present) {
    const contribution = phi[d] * x[d];
    value += contribution;
    contributions.push({
      dim: d,
      importance: phi[d],
      score: x[d],
      contribution,
    });
  }
  contributions.sort((p, q) => q.contribution - p.contribution);

  // --- Interaction part: −0.5 Σ I_ij |x_i − x_j| ---
  const interactions = [];
  for (const key of Object.keys(interaction)) {
    const [a, b] = splitPairKey(key);
    const index = interaction[key];
    const disagreement = Math.abs(x[a] - x[b]);
    const contribution = -0.5 * index * disagreement;
    value += contribution;
    interactions.push({
      pair: [a, b],
      index,
      disagreement,
      contribution,
    });
  }
  interactions.sort((p, q) => q.contribution - p.contribution);

  return {
    value: clamp(value, 0, 1),
    contributions,
    interactions,
    shapley: phi,
    interactionIndex: interaction,
  };
}

module.exports = {
  buildCapacity,
  choquet2additive,
  // Exposed for testing / advanced callers.
  pairKeyOf,
};
