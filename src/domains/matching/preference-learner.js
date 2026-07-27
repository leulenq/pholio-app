/**
 * matching/preference-learner.js — the per-agency learning loop (Stage 3).
 *
 * Booker decisions (advance/shortlist/book vs pass/release) are preference labels.
 * We learn, per agency and scope, which signals actually separate the talent they
 * advance from the talent they pass — and shift the Choquet capacity's importance
 * toward those signals. Two properties make this safe and non-black-box:
 *
 *   1. EXPLAINABLE: importance moves in proportion to each dimension's
 *      *discrimination* (mean satisfaction among advanced minus among passed).
 *      You can always say "look went up because advanced talent scored higher on
 *      look than passed talent."
 *   2. SHRINKAGE / fair fallback: the learned capacity is blended with the prior
 *      by alpha = n / (n + K); with little data it stays near the prior. Cold
 *      start never overfits one booker's early picks.
 *
 * Interaction learning is intentionally conservative in v1 (kept from priors).
 * Fairness monitoring (impact ratio) runs on the *learned* selections — bias in,
 * bias out, so we measure it. Attributes are MONITORED, never scored.
 */

"use strict";

const crypto = require("crypto");

const POSITIVE = new Set(["advance", "shortlist", "book"]);
const NEGATIVE = new Set(["pass", "release"]);

/**
 * Learned preferences are unavailable in the manual-launch mode. Both flags
 * must be intentionally enabled: enabling only a matching experiment or only
 * a preference experiment must not create or apply a learned model.
 */
function isLearnedPreferencesEnabled(env = process.env) {
  return (
    env.PHOLIO_ENABLE_AUTOMATED_MATCHING === "true" &&
    env.PHOLIO_ENABLE_LEARNED_PREFERENCES === "true"
  );
}

function normalize(map) {
  const total = Object.values(map).reduce((a, b) => a + (b > 0 ? b : 0), 0);
  const out = {};
  if (total <= 0) {
    const keys = Object.keys(map);
    for (const k of keys) out[k] = keys.length ? 1 / keys.length : 0;
    return out;
  }
  for (const [k, v] of Object.entries(map)) out[k] = Math.max(0, v) / total;
  return out;
}

/**
 * Learn a capacity's importance from labeled cases.
 *
 * @param {Array<{evidence:Object<string,number>, label:'positive'|'negative'}>} cases
 * @param {Object<string,number>} priorImportance - configured/default importance
 * @param {Object} [opts] - { K=20, maxAlpha=0.8, floor=0.05 }
 * @returns {{ importance, alpha, n, discrimination, learned, prior }}
 */
function computeImportanceFromDecisions(cases, priorImportance = {}, opts = {}) {
  const { K = 20, maxAlpha = 0.8, floor = 0.05 } = opts;
  const priorNorm = normalize(
    Object.keys(priorImportance).length ? priorImportance : { _: 0 },
  );

  const positives = cases.filter((c) => c.label === "positive");
  const negatives = cases.filter((c) => c.label === "negative");
  const n = positives.length + negatives.length;

  // Dimensions we have any signal on = prior dims ∪ dims seen in cases.
  const dims = new Set(Object.keys(priorImportance));
  for (const c of cases) for (const d of Object.keys(c.evidence || {})) dims.add(d);

  const mean = (rows, dim) => {
    const vals = rows.map((r) => r.evidence?.[dim]).filter((v) => typeof v === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const discrimination = {};
  const learnedRaw = {};
  for (const dim of dims) {
    const mPos = mean(positives, dim);
    const mNeg = mean(negatives, dim);
    let d = 0;
    if (mPos != null && mNeg != null) d = mPos - mNeg;
    discrimination[dim] = Number(d.toFixed(4));
    // Rectified discrimination + floor so a weak-signal dim never fully collapses.
    learnedRaw[dim] = floor + Math.max(0, d);
  }
  const learned = normalize(learnedRaw);

  // Shrinkage toward the prior; align key sets so the blend is well-defined.
  const alpha = n > 0 ? Math.min(maxAlpha, n / (n + K)) : 0;
  const importance = {};
  const allDims = new Set([...Object.keys(priorNorm), ...Object.keys(learned)]);
  for (const dim of allDims) {
    const p = priorNorm[dim] || 0;
    const l = learned[dim] || 0;
    importance[dim] = Number(((1 - alpha) * p + alpha * l).toFixed(4));
  }

  return { importance: normalize(importance), alpha: Number(alpha.toFixed(3)), n, discrimination, learned, prior: priorNorm };
}

/**
 * 4/5ths-rule impact ratio across groups.
 * @param {Object<string,{selected:number,total:number}>} groupCounts
 */
function impactRatio(groupCounts) {
  const rates = {};
  const rateVals = [];
  for (const [g, c] of Object.entries(groupCounts)) {
    const rate = c.total > 0 ? c.selected / c.total : 0;
    rates[g] = { selected: c.selected, total: c.total, rate: Number(rate.toFixed(4)) };
    if (c.total > 0) rateVals.push(rate);
  }
  const max = rateVals.length ? Math.max(...rateVals) : 0;
  const min = rateVals.length ? Math.min(...rateVals) : 0;
  const ratio = max > 0 ? Number((min / max).toFixed(4)) : null;
  return { rates, impactRatio: ratio, flagged: ratio != null && ratio < 0.8 };
}

// ─── DB glue ──────────────────────────────────────────────────────────────────

async function recordDecision(knex, { agencyId, scopeType, scopeId, profileId, decision, evaluationId = null, decidedBy = null, notes = null }) {
  const id = crypto.randomUUID();
  await knex("match_decisions").insert({
    id,
    agency_id: agencyId,
    scope_type: scopeType,
    scope_id: scopeId,
    profile_id: profileId,
    evaluation_id: evaluationId,
    decision,
    decided_by: decidedBy,
    notes,
  });
  return id;
}

function labelOf(decision) {
  if (POSITIVE.has(decision)) return "positive";
  if (NEGATIVE.has(decision)) return "negative";
  return null;
}

/**
 * Learn and persist an agency's preference model for a scope from its decisions.
 * Returns the learned summary (importance + alpha + discrimination), or null if
 * there are no labeled decisions yet.
 */
async function learnAgencyPreferences(knex, { agencyId, scopeType, scopeId, priorImportance = {} }) {
  if (!isLearnedPreferencesEnabled()) return null;
  const decisions = await knex("match_decisions").where({
    agency_id: agencyId,
    scope_type: scopeType,
    scope_id: scopeId,
  });
  if (!decisions.length) return null;

  // Latest evaluation evidence per profile in this scope.
  const evals = await knex("match_evaluations")
    .where({ scope_type: scopeType, scope_id: scopeId })
    .orderBy("computed_at", "desc")
    .select("profile_id", "evidence_snapshot", "id");
  const evidenceByProfile = new Map();
  for (const e of evals) {
    if (evidenceByProfile.has(e.profile_id)) continue; // keep latest
    let snap = e.evidence_snapshot;
    if (typeof snap === "string") { try { snap = JSON.parse(snap); } catch { snap = {}; } }
    const vec = {};
    for (const [dim, u] of Object.entries(snap || {})) {
      if (u && typeof u.strength === "number") vec[dim] = u.strength;
    }
    evidenceByProfile.set(e.profile_id, vec);
  }

  const cases = [];
  for (const d of decisions) {
    const label = labelOf(d.decision);
    const evidence = evidenceByProfile.get(d.profile_id);
    if (!label || !evidence) continue;
    cases.push({ evidence, label });
  }
  if (!cases.length) return null;

  const result = computeImportanceFromDecisions(cases, priorImportance);

  const capacity = JSON.stringify({ phi: result.importance, interaction: {} });
  const existing = await knex("agency_preference_model")
    .where({ agency_id: agencyId, scope_type: scopeType, scope_id: scopeId })
    .first();
  if (existing) {
    await knex("agency_preference_model")
      .where({ id: existing.id })
      .update({ capacity, version: (existing.version || 1) + 1, updated_at: knex.fn.now() });
  } else {
    await knex("agency_preference_model").insert({
      id: crypto.randomUUID(),
      agency_id: agencyId,
      scope_type: scopeType,
      scope_id: scopeId,
      capacity,
      version: 1,
    });
  }
  return result;
}

/**
 * Fairness monitor: impact ratio of the agency's *selections* by a monitored
 * attribute (default gender). Uses decisions as the selection signal. Persists a
 * snapshot and returns it. Attributes are monitored only — never scored.
 */
async function auditFairness(knex, { agencyId, scopeType = null, scopeId = null, attribute = "gender" }) {
  const q = knex("match_decisions as d")
    .join("profiles as p", "p.id", "d.profile_id")
    .where("d.agency_id", agencyId);
  if (scopeType) q.andWhere("d.scope_type", scopeType);
  if (scopeId) q.andWhere("d.scope_id", scopeId);
  const rows = await q.select("d.decision", `p.${attribute} as attr`);

  const groups = {};
  for (const r of rows) {
    const g = r.attr == null || r.attr === "" ? "unknown" : String(r.attr);
    if (!groups[g]) groups[g] = { selected: 0, total: 0 };
    groups[g].total += 1;
    if (POSITIVE.has(r.decision)) groups[g].selected += 1;
  }
  // Drop the 'unknown' bucket from the ratio (can't assess), keep for the record.
  const measurable = { ...groups };
  delete measurable.unknown;
  const { rates, impactRatio: ratio, flagged } = impactRatio(measurable);
  const full = { ...rates };
  if (groups.unknown) full.unknown = { ...groups.unknown, rate: null };

  const sampleSize = rows.length;
  await knex("match_fairness_audits").insert({
    id: crypto.randomUUID(),
    agency_id: agencyId,
    scope_type: scopeType,
    scope_id: scopeId,
    attribute,
    rates: JSON.stringify(full),
    impact_ratio: ratio,
    flagged,
    sample_size: sampleSize,
  });
  return { attribute, rates: full, impactRatio: ratio, flagged, sampleSize };
}

module.exports = {
  computeImportanceFromDecisions,
  impactRatio,
  recordDecision,
  learnAgencyPreferences,
  auditFairness,
  labelOf,
  isLearnedPreferencesEnabled,
};
