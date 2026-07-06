/**
 * matching/explanation-composer.js — assemble the fit brief (the deliverable).
 *
 * Turns constraint results + interaction-aware aggregation + evidence into a
 * structured argument a human decider can act on: a posture, the case for/against,
 * what's missing, interaction insights, what would change the call, and a
 * secondary numeric handle. No auto-verdict — this supports a decision.
 */

"use strict";

const { POSTURE, BAND, DIRECTION } = require("./contracts");

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {Object} p
 * @param {Object} p.constraintResult  from solveConstraints
 * @param {Object} p.aggregation        from choquet2additive
 * @param {Object} p.evidence           dimension → evidence unit
 * @param {Object} p.scope              { type, id }
 * @param {Object} [p.versions]
 * @returns {Object} fit brief
 */
function composeFitBrief({ constraintResult, aggregation, evidence, scope, versions = {} }) {
  const evList = Object.values(evidence || {});
  const feasible = constraintResult.feasible;
  const value = aggregation?.value ?? 0;

  // ── Overall confidence: mean evidence confidence, weighted toward the signals
  //    that actually drove the aggregation (present contributions). ────────────
  const contribDims = new Set((aggregation?.contributions || []).map((c) => c.dim));
  const driving = evList.filter((e) => contribDims.has(e.dimension));
  const confPool = driving.length ? driving : evList;
  const confidence = confPool.length
    ? round2(confPool.reduce((a, e) => a + (e.confidence || 0), 0) / confPool.length)
    : 0;

  // ── Band + posture ──────────────────────────────────────────────────────────
  let band, posture;
  if (!feasible) {
    band = BAND.INELIGIBLE;
    posture = POSTURE.INELIGIBLE;
  } else if (value >= 0.7) {
    band = BAND.STRONG;
    posture = POSTURE.ADVANCE;
  } else if (value >= 0.45) {
    band = BAND.POSSIBLE;
    posture = POSTURE.CONSIDER;
  } else {
    band = BAND.STRETCH;
    posture = POSTURE.NOT_FOR_THIS;
  }
  // Soft misses or low confidence temper an otherwise positive posture.
  if (feasible && (constraintResult.softMisses.length || confidence < 0.4)) {
    if (posture === POSTURE.ADVANCE) posture = POSTURE.CONSIDER;
    else if (posture === POSTURE.CONSIDER) posture = POSTURE.HOLD;
  }

  // ── Case for / against ──────────────────────────────────────────────────────
  const supporting = evList
    .filter((e) => e.direction === DIRECTION.SUPPORTS && e.confidence >= 0.4)
    .sort((a, b) => b.strength - a.strength)
    .map((e) => ({ dimension: e.dimension, strength: round2(e.strength), confidence: round2(e.confidence), note: e.note }));

  const opposing = evList
    .filter((e) => e.direction === DIRECTION.OPPOSES && e.confidence >= 0.4)
    .sort((a, b) => a.strength - b.strength)
    .map((e) => ({ dimension: e.dimension, strength: round2(e.strength), confidence: round2(e.confidence), note: e.note }));

  const caseFor = supporting;
  const caseAgainst = [
    ...constraintResult.vetoes.map((v) => ({ dimension: v.key || v.type, blocking: true, note: v.reason })),
    ...constraintResult.softMisses.map((v) => ({ dimension: v.key || v.type, blocking: false, note: v.reason })),
    ...opposing,
  ];

  // ── Missing / must-confirm data ─────────────────────────────────────────────
  const missing = [
    ...constraintResult.indeterminate.map((g) => g.reason),
    ...evList.filter((e) => e.confidence < 0.3).map((e) => `${e.dimension}: ${e.note || "low-confidence data"}`),
  ];

  // ── Interaction insights (the anti-weighted-matrix explanation) ─────────────
  const interactionNotes = (aggregation?.interactions || [])
    .filter((i) => Math.abs(i.contribution) > 0.02)
    .map((i) => {
      const [a, b] = i.pair;
      if (i.index > 0)
        return { pair: i.pair, note: `${a} and ${b} are complementary — both must land; disagreement (${round2(i.disagreement)}) costs ${round2(i.contribution)}` };
      return { pair: i.pair, note: `${a} and ${b} are substitutable — one strong signal covers; effect ${round2(i.contribution)}` };
    });

  // ── What would change this ──────────────────────────────────────────────────
  const whatWouldChange = [
    ...constraintResult.indeterminate.map((g) => `confirm ${g.key || g.type}: ${g.reason}`),
    ...evList
      .filter((e) => e.direction !== DIRECTION.SUPPORTS && e.confidence >= 0.4 && e.strength < 0.6 && e.strength > 0)
      .map((e) => `improve ${e.dimension} (${e.note})`),
    ...constraintResult.softMisses.map((v) => `resolve ${v.key || v.type}: ${v.reason}`),
  ];

  return {
    scope,
    posture,
    band,
    feasible,
    fit_index: feasible ? Math.round(value * 100) : null, // secondary handle only
    confidence,
    case_for: caseFor,
    case_against: caseAgainst,
    missing,
    interaction_notes: interactionNotes,
    what_would_change_this: whatWouldChange,
    signal_importance: aggregation?.shapley || {},
    engine_version: versions.engine || null,
    criteria_version: versions.criteria ?? null,
    capacity_version: versions.capacity || null,
  };
}

module.exports = { composeFitBrief };
