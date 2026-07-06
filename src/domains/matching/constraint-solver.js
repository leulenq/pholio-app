/**
 * matching/constraint-solver.js — feasibility reasoning (NOT scoring).
 *
 * Separates feasibility (can this talent be considered at all?) from desirability
 * (handled by the aggregator). Hard `veto` constraints disqualify with a reason
 * and are NEVER averaged away. `soft` constraints become surfaced near-misses.
 * Missing data on a veto is INDETERMINATE — surfaced as "must confirm", not a
 * false fail and not a silent pass (decision-support, not blind automation).
 *
 * This absorbs the age/height/gender hard filters from the legacy weighted
 * engine (agency/services/match-scoring.js) as declarative constraints, and
 * adds the agency-locked minors gate.
 */

"use strict";

const { SEVERITY } = require("./contracts");

const STATUS = Object.freeze({
  PASS: "pass",
  FAIL: "fail",
  INDETERMINATE: "indeterminate",
});

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function profileAge(profile) {
  if (profile.age != null && Number.isFinite(Number(profile.age)))
    return Number(profile.age);
  return calculateAge(profile.date_of_birth);
}

function asArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [v];
    } catch {
      return [v];
    }
  }
  return [v];
}

// ─── Per-type evaluators ──────────────────────────────────────────────────────
// Each returns { status, reason }. `params` come from the constraint definition.

const EVALUATORS = {
  age_range(profile, params) {
    const age = profileAge(profile);
    if (age == null)
      return { status: STATUS.INDETERMINATE, reason: "age not on file" };
    if (params.min != null && age < params.min)
      return { status: STATUS.FAIL, reason: `age ${age} below ${params.min}` };
    if (params.max != null && age > params.max)
      return { status: STATUS.FAIL, reason: `age ${age} above ${params.max}` };
    return { status: STATUS.PASS, reason: `age ${age} in range` };
  },

  height_range(profile, params) {
    const h = profile.height_cm;
    if (h == null || h === 0)
      return { status: STATUS.INDETERMINATE, reason: "height not on file" };
    if (params.min != null && h < params.min)
      return {
        status: STATUS.FAIL,
        reason: `height ${h}cm below ${params.min}cm`,
      };
    if (params.max != null && h > params.max)
      return {
        status: STATUS.FAIL,
        reason: `height ${h}cm above ${params.max}cm`,
      };
    return { status: STATUS.PASS, reason: `height ${h}cm in range` };
  },

  gender_in(profile, params) {
    const allowed = asArray(params.values).map((g) => String(g).toLowerCase());
    if (!allowed.length) return { status: STATUS.PASS, reason: "no restriction" };
    if (!profile.gender)
      return { status: STATUS.INDETERMINATE, reason: "gender not on file" };
    return allowed.includes(String(profile.gender).toLowerCase())
      ? { status: STATUS.PASS, reason: `gender ${profile.gender} allowed` }
      : {
          status: STATUS.FAIL,
          reason: `gender ${profile.gender} not in [${allowed.join(", ")}]`,
        };
  },

  // Agency-locked compliance gate. `mode`: 'exclude' | 'consent_required'.
  minors_policy(profile, params) {
    const age = profileAge(profile);
    if (age == null)
      return { status: STATUS.INDETERMINATE, reason: "age not on file (minor check)" };
    if (age >= 18) return { status: STATUS.PASS, reason: "adult" };
    if (params.mode === "exclude")
      return { status: STATUS.FAIL, reason: "minor excluded from this scope" };
    // consent_required (default): require a guardian-consent flag on the profile
    if (params.mode === "consent_required" || params.mode == null) {
      const consented =
        profile.guardian_consent === true ||
        profile.guardian_consent_at != null;
      return consented
        ? { status: STATUS.PASS, reason: "minor with guardian consent" }
        : {
            status: STATUS.FAIL,
            reason: "minor without guardian consent",
          };
    }
    return { status: STATUS.PASS, reason: "minor policy satisfied" };
  },

  market_in(profile, params) {
    const allowed = asArray(params.values).map((m) => String(m).toLowerCase());
    if (!allowed.length) return { status: STATUS.PASS, reason: "no restriction" };
    const city = String(profile.city || "").toLowerCase();
    const country = String(profile.country || "").toLowerCase();
    const hit = allowed.some((m) => city.includes(m) || country.includes(m));
    if (hit) return { status: STATUS.PASS, reason: "in market" };
    if (!city && !country)
      return { status: STATUS.INDETERMINATE, reason: "location not on file" };
    return { status: STATUS.FAIL, reason: "outside required market" };
  },

  media_required(profile, params) {
    // Soft by default: surfaces missing digitals/polaroids/reel as a near-miss.
    const required = asArray(params.types);
    if (!required.length) return { status: STATUS.PASS, reason: "no media required" };
    const have = new Set(asArray(profile.available_media));
    const missing = required.filter((t) => !have.has(t));
    return missing.length
      ? { status: STATUS.FAIL, reason: `missing media: ${missing.join(", ")}` }
      : { status: STATUS.PASS, reason: "media requirements met" };
  },
};

/**
 * Evaluate constraints against a profile.
 *
 * @param {Object} profile
 * @param {Array<{key,type,severity,locked,params}>} constraints
 * @returns {{ feasible:boolean, gates:Array, vetoes:Array, softMisses:Array, indeterminate:Array }}
 */
function solveConstraints(profile, constraints) {
  const gates = [];
  for (const c of constraints || []) {
    if (!c || !c.type) continue;
    const evaluator = EVALUATORS[c.type];
    const severity = c.severity || SEVERITY.VETO;
    if (!evaluator) {
      // Unknown constraint type: fail safe as indeterminate, never a silent pass.
      gates.push({
        key: c.key,
        type: c.type,
        severity,
        locked: !!c.locked,
        status: STATUS.INDETERMINATE,
        reason: `unrecognized constraint type: ${c.type}`,
      });
      continue;
    }
    const { status, reason } = evaluator(profile, c.params || {});
    gates.push({
      key: c.key,
      type: c.type,
      severity,
      locked: !!c.locked,
      status,
      reason,
    });
  }

  const vetoes = gates.filter(
    (g) => g.severity === SEVERITY.VETO && g.status === STATUS.FAIL,
  );
  const softMisses = gates.filter(
    (g) => g.severity === SEVERITY.SOFT && g.status === STATUS.FAIL,
  );
  const indeterminate = gates.filter((g) => g.status === STATUS.INDETERMINATE);

  return {
    feasible: vetoes.length === 0,
    gates,
    vetoes,
    softMisses,
    indeterminate,
  };
}

module.exports = { solveConstraints, calculateAge, profileAge, STATUS };
