/**
 * matching/contracts.js — shared vocabulary for the decision-support engine.
 *
 * The engine does NOT produce a weighted score. It produces a structured,
 * defeasible argument ("fit brief") built from typed Evidence Units, gated by
 * constraint reasoning, aggregated with an interaction-aware (Choquet) measure,
 * and surfaced as a recommendation posture with a case for/against.
 *
 * This module is the single source of truth for the shapes every other module
 * in src/domains/matching/ passes around. Keep it dependency-free.
 */

"use strict";

// ─── Signal dimensions ────────────────────────────────────────────────────────
// The vocabulary of things that can bear on fit. Extractors emit evidence keyed
// by these; criteria declare relevance/priors keyed by these; the aggregator
// aggregates over them. Additive-free: dimensions may interact (see aggregator).
const DIMENSIONS = Object.freeze({
  HEIGHT: "height",
  MEASUREMENTS: "measurements",
  AGE: "age",
  LOOK: "look", // aesthetic/type fit from image analysis (fit_score_*)
  SEMANTIC: "semantic", // free-text/brief embedding fit
  EXPERIENCE: "experience",
  LOCATION: "location",
  SOCIAL_REACH: "social_reach",
  MEDIA_READINESS: "media_readiness", // has required digitals/polaroids/reel
  AVAILABILITY: "availability",
});

// Direction an evidence unit points relative to fit for THIS scope.
const DIRECTION = Object.freeze({
  SUPPORTS: "supports",
  OPPOSES: "opposes",
  NEUTRAL: "neutral",
});

// Recommendation posture — a stance for a human decider, never an auto-verdict.
const POSTURE = Object.freeze({
  ADVANCE: "advance",
  CONSIDER: "consider",
  HOLD: "hold",
  NOT_FOR_THIS: "not-for-this",
  INELIGIBLE: "ineligible", // failed a hard veto
});

// Coarse comparability band. The primary UI signal; the numeric index is secondary.
const BAND = Object.freeze({
  STRONG: "strong",
  POSSIBLE: "possible",
  STRETCH: "stretch",
  INELIGIBLE: "ineligible",
});

// Constraint severity. `veto` disqualifies (hard); `soft` produces a surfaced
// near-miss that lowers desirability but never silently fails.
const SEVERITY = Object.freeze({
  VETO: "veto",
  SOFT: "soft",
});

const ENGINE_VERSION = "1.0.0";

/**
 * Build a normalized Evidence Unit. Missing/stale data must be represented as a
 * LOW-CONFIDENCE unit — never omitted silently and never a false zero.
 *
 * @param {Object} p
 * @param {string} p.dimension  one of DIMENSIONS
 * @param {*}      p.value       raw observed value (may be null when unknown)
 * @param {string} [p.direction] DIRECTION (default neutral)
 * @param {number} [p.strength]  0..1 how strongly it bears on fit for this scope
 * @param {number} [p.confidence] 0..1 data completeness/recency
 * @param {string} [p.provenance] where the value came from (field@date)
 * @param {string} [p.note]      short human-readable reason
 */
function evidence({
  dimension,
  value = null,
  direction = DIRECTION.NEUTRAL,
  strength = 0,
  confidence = 0,
  provenance = null,
  note = null,
}) {
  return {
    dimension,
    value,
    direction,
    strength: clamp01(strength),
    confidence: clamp01(confidence),
    provenance,
    note,
  };
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

module.exports = {
  DIMENSIONS,
  DIRECTION,
  POSTURE,
  BAND,
  SEVERITY,
  ENGINE_VERSION,
  evidence,
  clamp01,
};
