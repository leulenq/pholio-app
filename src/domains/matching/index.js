/**
 * matching/index.js — the decision-support engine entry point.
 *
 * Pipeline (see tasks/match-score-architecture.md):
 *   resolve criteria (scope inheritance)
 *     → build interaction-aware capacity from priors
 *     → extract evidence units (graded satisfaction + confidence)
 *     → constraint reasoning (feasibility, not scoring)
 *     → 2-additive Choquet aggregation (synergy/redundancy, explainable)
 *     → compose fit brief (posture + case for/against + what-would-change)
 *
 * One engine, three scope entry points (agency gate / board typing / brief).
 * Stage 0: retrieval-based context (CBR) and the learning loop are not wired yet;
 * the seams are here so they slot in without reshaping callers.
 */

"use strict";

const crypto = require("crypto");
const { buildCapacity, choquet2additive } = require("./aggregator");
const { resolveCriteria } = require("./resolve-criteria");
const { extractEvidence } = require("./signal-extractor");
const { solveConstraints } = require("./constraint-solver");
const { composeFitBrief } = require("./explanation-composer");
const { ENGINE_VERSION, DIMENSIONS } = require("./contracts");

const EMPTY_CRITERIA = { constraints: [], signal_relevance: {}, look_target: null };

/**
 * Evaluate one profile against one scope, producing a fit brief.
 *
 * @param {Object} p
 * @param {import('knex').Knex} [p.knex] - required unless `criteria` is supplied
 * @param {Object} p.profile
 * @param {{type:'agency'|'board'|'brief', id:string}} p.scope
 * @param {Object} [p.criteria] - pre-resolved criteria (skips DB load)
 * @returns {Promise<Object>} fit brief (+ non-persisted `_evidence`/`_aggregation`)
 */
async function evaluate({ knex, profile, scope, criteria }) {
  const resolved =
    criteria || (knex ? await resolveCriteria(knex, scope) : EMPTY_CRITERIA);

  const evidence = extractEvidence(profile, resolved);

  // Priors → capacity. If no importance configured, fall back to a uniform
  // capacity over the dimensions we actually have usable evidence for, so the
  // engine is meaningful out-of-the-box while remaining fully overridable.
  const priors = resolved.signal_relevance || {};
  let importance = priors.importance && Object.keys(priors.importance).length
    ? priors.importance
    : null;
  if (!importance) {
    importance = {};
    for (const [dim, e] of Object.entries(evidence)) {
      if (e.confidence >= 0.3) importance[dim] = 1;
    }
    // Guarantee at least the look dimension carries weight if present.
    if (!Object.keys(importance).length && evidence[DIMENSIONS.LOOK]) {
      importance[DIMENSIONS.LOOK] = 1;
    }
  }

  const capacity = buildCapacity({
    importance,
    interactions: priors.interactions || {},
  });

  const scores = {};
  for (const dim of capacity.dims) {
    if (evidence[dim]) scores[dim] = evidence[dim].strength;
  }

  const aggregation = choquet2additive(scores, capacity);
  const constraintResult = solveConstraints(profile, resolved.constraints);

  const brief = composeFitBrief({
    constraintResult,
    aggregation,
    evidence,
    scope,
    versions: {
      engine: ENGINE_VERSION,
      criteria: resolved.sourceVersions ?? null,
      capacity: "prior:1",
    },
  });

  return { ...brief, _evidence: evidence, _aggregation: aggregation };
}

const evaluateAgencyGate = (knex, agencyId, profile, criteria) =>
  evaluate({ knex, profile, scope: { type: "agency", id: agencyId }, criteria });

const evaluateBoard = (knex, boardId, profile, criteria) =>
  evaluate({ knex, profile, scope: { type: "board", id: boardId }, criteria });

const evaluateBrief = (knex, briefId, profile, criteria) =>
  evaluate({ knex, profile, scope: { type: "brief", id: briefId }, criteria });

/**
 * Persist a fit brief as an immutable reasoning record (audit + replay).
 * Strips the internal `_evidence`/`_aggregation` into the stored snapshot.
 */
async function persistEvaluation(knex, { profile, scope, brief }) {
  const { _evidence, _aggregation, ...clean } = brief;
  const row = {
    id: crypto.randomUUID(),
    scope_type: scope.type,
    scope_id: scope.id,
    profile_id: profile.id,
    posture: brief.posture,
    band: brief.band,
    fit_index: brief.fit_index,
    confidence: brief.confidence,
    brief: JSON.stringify(clean),
    evidence_snapshot: JSON.stringify(_evidence || {}),
    criteria_version: Array.isArray(brief.criteria_version)
      ? null
      : brief.criteria_version,
    capacity_version: brief.capacity_version,
    engine_version: brief.engine_version,
  };
  await knex("match_evaluations").insert(row);
  return row.id;
}

/**
 * Adapter: legacy board_requirements + board_scoring_weights → resolved criteria.
 * Lets the new engine run over existing board config without a data migration,
 * and gives the Stage-0 back-compat shim a bridge to a legacy numeric score.
 */
function adaptBoardToCriteria(requirements = {}, weights = {}) {
  const asArr = (v) => {
    if (v == null) return [];
    if (Array.isArray(v)) return v;
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  };

  const constraints = [];
  if (requirements.min_age != null || requirements.max_age != null)
    constraints.push({ key: "age", type: "age_range", severity: "veto", params: { min: requirements.min_age, max: requirements.max_age } });
  if (requirements.min_height_cm != null || requirements.max_height_cm != null)
    constraints.push({ key: "height", type: "height_range", severity: "veto", params: { min: requirements.min_height_cm, max: requirements.max_height_cm } });
  const genders = asArr(requirements.genders);
  if (genders.length)
    constraints.push({ key: "gender", type: "gender_in", severity: "veto", params: { values: genders } });
  if ([requirements.min_bust, requirements.min_waist, requirements.min_hips, requirements.max_bust, requirements.max_waist, requirements.max_hips].some((v) => v != null))
    constraints.push({ key: "measurements", type: "measurement_range", severity: "soft", params: { bust: { min: requirements.min_bust, max: requirements.max_bust }, waist: { min: requirements.min_waist, max: requirements.max_waist }, hips: { min: requirements.min_hips, max: requirements.max_hips } } });
  const locations = asArr(requirements.locations);
  if (locations.length)
    constraints.push({ key: "market", type: "market_in", severity: "soft", params: { values: locations } });
  if (requirements.min_social_reach != null)
    constraints.push({ key: "social_reach", type: "social_reach_min", severity: "soft", params: { min: requirements.min_social_reach } });

  const map = {
    age_weight: DIMENSIONS.AGE,
    height_weight: DIMENSIONS.HEIGHT,
    measurements_weight: DIMENSIONS.MEASUREMENTS,
    experience_weight: DIMENSIONS.EXPERIENCE,
    location_weight: DIMENSIONS.LOCATION,
    social_reach_weight: DIMENSIONS.SOCIAL_REACH,
  };
  const importance = {};
  for (const [wk, dim] of Object.entries(map)) {
    const w = Number(weights[wk]) || 0;
    if (w > 0) importance[dim] = w;
  }
  // Look always matters for board typing even if legacy config never captured it.
  if (!importance[DIMENSIONS.LOOK]) importance[DIMENSIONS.LOOK] = 2;

  return { constraints, signal_relevance: { importance, interactions: {} }, look_target: null };
}

module.exports = {
  evaluate,
  evaluateAgencyGate,
  evaluateBoard,
  evaluateBrief,
  persistEvaluation,
  adaptBoardToCriteria,
};
