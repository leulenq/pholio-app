/**
 * matching/case-retriever.js — case-based reasoning over past fit briefs.
 *
 * Decision support gains a lot from analogy: "this candidate resembles talent you
 * advanced on similar briefs." We retrieve the most similar prior evaluations
 * (match_evaluations) by cosine similarity over their evidence vectors and
 * summarize what happened to them. This grounds the LLM reasoner and gives the
 * booker cold-start-robust context without a trained model.
 *
 * The similarity math is pure/testable; the DB retrieval is a thin query.
 */

"use strict";

function parseMaybeJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

/**
 * Reduce an evidence map (dim → unit) to a plain satisfaction vector (dim → 0..1).
 */
function evidenceVector(evidence) {
  const v = {};
  for (const [dim, unit] of Object.entries(evidence || {})) {
    if (unit && typeof unit.strength === "number") v[dim] = unit.strength;
  }
  return v;
}

/** Cosine similarity over the union of dimensions (absent = 0). */
function cosineSim(a, b) {
  const dims = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const d of dims) {
    const x = a[d] || 0;
    const y = b[d] || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Retrieve the k most similar past evaluations for a scope.
 *
 * @param {import('knex').Knex} knex
 * @param {Object} p
 * @param {string} p.scopeType
 * @param {string[]} p.scopeIds  scopes to draw the case base from (this brief/board,
 *                               optionally broadened to the agency's other scopes)
 * @param {Object} p.evidence    the candidate's evidence map
 * @param {number} [p.k=5]
 * @param {string} [p.excludeProfileId]
 * @param {number} [p.pool=400]  how many recent cases to score
 * @returns {Promise<Array>} neighbors sorted by similarity desc
 */
async function retrieveSimilarCases(knex, { scopeType, scopeIds, evidence, k = 5, excludeProfileId, pool = 400 }) {
  if (!scopeIds || !scopeIds.length) return [];
  const hasTable = await knex.schema.hasTable("match_evaluations");
  if (!hasTable) return [];

  const rows = await knex("match_evaluations")
    .where({ scope_type: scopeType })
    .whereIn("scope_id", scopeIds)
    .modify((qb) => {
      if (excludeProfileId) qb.andWhereNot({ profile_id: excludeProfileId });
    })
    .orderBy("computed_at", "desc")
    .limit(pool)
    .select("profile_id", "posture", "band", "fit_index", "evidence_snapshot", "computed_at");

  const target = evidenceVector(evidence);
  const scored = rows
    .map((r) => {
      const vec = evidenceVector(parseMaybeJson(r.evidence_snapshot, {}));
      return {
        profile_id: r.profile_id,
        posture: r.posture,
        band: r.band,
        fit_index: r.fit_index,
        similarity: Number(cosineSim(target, vec).toFixed(4)),
      };
    })
    .filter((c) => c.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, k);
}

/**
 * Summarize retrieved neighbors into an analogical note for the fit brief.
 */
function summarizeCases(neighbors) {
  if (!neighbors || !neighbors.length) return { count: 0, byPosture: {}, note: null };
  const byPosture = {};
  for (const n of neighbors) byPosture[n.posture] = (byPosture[n.posture] || 0) + 1;
  const advanced = (byPosture.advance || 0) + (byPosture.consider || 0);
  const note =
    `Resembles ${neighbors.length} past candidate(s) evaluated for this work — ` +
    `${advanced} were advanced/considered, ${neighbors.length - advanced} were not.`;
  return { count: neighbors.length, byPosture, note };
}

module.exports = { retrieveSimilarCases, summarizeCases, evidenceVector, cosineSim };
