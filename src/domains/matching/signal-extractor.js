/**
 * matching/signal-extractor.js — profile → typed Evidence Units.
 *
 * Turns raw profile fields into per-dimension evidence carrying a GRADED
 * satisfaction (`strength`, 0..1 — how well the dimension is met) and an honest
 * `confidence` (0..1 — data completeness/recency). Missing/stale data yields a
 * low-confidence unit, never a false zero. Only the satisfaction feeds the
 * aggregator; confidence rolls up into the fit brief's overall confidence.
 */

"use strict";

const { DIMENSIONS, DIRECTION, evidence, clamp01 } = require("./contracts");
const { profileAge } = require("./constraint-solver");

// Days after which digitals/stats are considered stale (industry: digitals ≤3mo).
const STALE_DAYS = 90;

function daysSince(ts) {
  if (!ts) return Infinity;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 86400000;
}

// Recency confidence: full within STALE_DAYS, decays toward 0.4 as data ages.
function recencyConfidence(ts) {
  if (!ts) return 0.6; // present but undated
  const d = daysSince(ts);
  if (d <= STALE_DAYS) return 1;
  return clamp01(1 - (d - STALE_DAYS) / (STALE_DAYS * 4)) * 0.6 + 0.4;
}

// Graded band satisfaction: 1 inside [min,max], linear falloff to 0 `tol` beyond.
function bandSatisfaction(value, min, max, tol) {
  if (value == null) return null;
  if (min != null && value < min)
    return clamp01(1 - (min - value) / tol);
  if (max != null && value > max)
    return clamp01(1 - (value - max) / tol);
  return 1;
}

function direction(strength) {
  if (strength >= 0.6) return DIRECTION.SUPPORTS;
  if (strength <= 0.35) return DIRECTION.OPPOSES;
  return DIRECTION.NEUTRAL;
}

function constraintParams(constraints, type) {
  const c = (constraints || []).find((x) => x && x.type === type);
  return c ? c.params || {} : null;
}

/**
 * @param {Object} profile
 * @param {Object} criteria - merged criteria { constraints, signal_relevance, look_target }
 * @returns {Object<string, Object>} evidence keyed by dimension
 */
function extractEvidence(profile, criteria = {}) {
  const constraints = criteria.constraints || [];
  const lookTarget = criteria.look_target || null;
  const out = {};
  const put = (u) => {
    out[u.dimension] = u;
  };

  // ── Height ────────────────────────────────────────────────────────────────
  {
    const p = constraintParams(constraints, "height_range") || {};
    const h = profile.height_cm;
    if (h == null || h === 0) {
      put(evidence({ dimension: DIMENSIONS.HEIGHT, value: null, strength: 0, confidence: 0.1, note: "height not on file", provenance: "profile.height_cm" }));
    } else {
      const s = bandSatisfaction(h, p.min, p.max, 8) ?? 1;
      put(evidence({ dimension: DIMENSIONS.HEIGHT, value: h, strength: s, direction: direction(s), confidence: 1, provenance: "profile.height_cm", note: p.min || p.max ? `${h}cm vs ${p.min ?? "–"}-${p.max ?? "–"}` : `${h}cm` }));
    }
  }

  // ── Measurements (avg of bust/waist/hips vs optional bands) ─────────────────
  {
    const p = constraintParams(constraints, "measurement_range") || {};
    const fields = [
      ["bust_cm", p.bust],
      ["waist_cm", p.waist],
      ["hips_cm", p.hips],
    ];
    const present = fields.filter(([f]) => profile[f] != null && profile[f] !== 0);
    if (!present.length) {
      put(evidence({ dimension: DIMENSIONS.MEASUREMENTS, value: null, strength: 0, confidence: 0.1, note: "measurements not on file" }));
    } else {
      const sats = present.map(([f, band]) => {
        if (!band) return 1; // present but no target ⇒ satisfied
        return bandSatisfaction(Number(profile[f]), band.min, band.max, 6) ?? 1;
      });
      const s = sats.reduce((a, b) => a + b, 0) / sats.length;
      const conf = recencyConfidence(profile.measurements_updated_at) * (present.length / 3);
      put(evidence({ dimension: DIMENSIONS.MEASUREMENTS, value: present.map(([f]) => `${f}=${profile[f]}`).join(","), strength: s, direction: direction(s), confidence: clamp01(conf), note: "bust/waist/hips" }));
    }
  }

  // ── Age ─────────────────────────────────────────────────────────────────────
  {
    const p = constraintParams(constraints, "age_range") || {};
    const age = profileAge(profile);
    if (age == null) {
      put(evidence({ dimension: DIMENSIONS.AGE, value: null, strength: 0, confidence: 0.1, note: "age not on file" }));
    } else {
      const s = bandSatisfaction(age, p.min, p.max, 4) ?? 1;
      put(evidence({ dimension: DIMENSIONS.AGE, value: age, strength: s, direction: direction(s), confidence: 1, note: `age ${age}` }));
    }
  }

  // ── Look / aesthetic fit (fit_score_* vs look target) ───────────────────────
  {
    const fit = {
      runway: profile.fit_score_runway,
      editorial: profile.fit_score_editorial,
      commercial: profile.fit_score_commercial,
      lifestyle: profile.fit_score_lifestyle,
      swim_fitness: profile.fit_score_swim_fitness,
    };
    const hasAny = Object.values(fit).some((v) => v != null);
    if (!hasAny) {
      put(evidence({ dimension: DIMENSIONS.LOOK, value: null, strength: 0, confidence: 0.1, note: "no look analysis yet" }));
    } else {
      // look target: {editorial:0.8,...} weights, or ["editorial","runway"] list.
      let weights = {};
      if (Array.isArray(lookTarget)) {
        for (const k of lookTarget) weights[String(k).toLowerCase()] = 1;
      } else if (lookTarget && typeof lookTarget === "object") {
        for (const [k, v] of Object.entries(lookTarget)) weights[k.toLowerCase()] = Number(v) || 0;
      }
      const keys = Object.keys(weights).filter((k) => fit[k] != null);
      let s;
      if (keys.length) {
        const num = keys.reduce((a, k) => a + weights[k] * (fit[k] / 100), 0);
        const den = keys.reduce((a, k) => a + weights[k], 0) || 1;
        s = clamp01(num / den);
      } else {
        // no target ⇒ use overall readiness as a weak look proxy
        s = clamp01((profile.fit_score_overall ?? 50) / 100);
      }
      put(evidence({ dimension: DIMENSIONS.LOOK, value: fit, strength: s, direction: direction(s), confidence: recencyConfidence(profile.fit_scores_calculated_at), provenance: "profiles.fit_score_*", note: keys.length ? `look vs ${keys.join("/")}` : "look (overall proxy)" }));
    }
  }

  // ── Experience ──────────────────────────────────────────────────────────────
  {
    const order = { new_face: 0.25, developing: 0.5, experienced: 0.8, established: 1 };
    const lvl = profile.experience_level;
    if (!lvl) {
      put(evidence({ dimension: DIMENSIONS.EXPERIENCE, value: null, strength: 0.5, confidence: 0.2, note: "experience unstated" }));
    } else {
      const s = order[String(lvl).toLowerCase()] ?? 0.5;
      put(evidence({ dimension: DIMENSIONS.EXPERIENCE, value: lvl, strength: s, direction: direction(s), confidence: 0.9, note: String(lvl) }));
    }
  }

  // ── Location proximity ──────────────────────────────────────────────────────
  {
    const p = constraintParams(constraints, "market_in") || {};
    const allowed = Array.isArray(p.values) ? p.values.map((v) => String(v).toLowerCase()) : [];
    const city = String(profile.city || "").toLowerCase();
    if (!allowed.length) {
      put(evidence({ dimension: DIMENSIONS.LOCATION, value: profile.city || null, strength: 0.5, confidence: city ? 0.8 : 0.2, note: "no market target" }));
    } else {
      const hit = allowed.some((m) => city.includes(m));
      put(evidence({ dimension: DIMENSIONS.LOCATION, value: profile.city || null, strength: hit ? 1 : 0.2, direction: hit ? DIRECTION.SUPPORTS : DIRECTION.OPPOSES, confidence: city ? 0.9 : 0.15, note: hit ? "in target market" : "outside target market" }));
    }
  }

  // ── Social reach ────────────────────────────────────────────────────────────
  {
    const p = constraintParams(constraints, "social_reach_min") || {};
    const reach = Number(profile.social_reach) || 0;
    if (p.min == null) {
      put(evidence({ dimension: DIMENSIONS.SOCIAL_REACH, value: reach, strength: 0.5, confidence: reach ? 0.7 : 0.2, note: "reach not required" }));
    } else {
      const s = clamp01(reach / p.min);
      put(evidence({ dimension: DIMENSIONS.SOCIAL_REACH, value: reach, strength: s, direction: direction(s), confidence: 0.8, note: `${reach} vs min ${p.min}` }));
    }
  }

  // ── Media readiness ─────────────────────────────────────────────────────────
  {
    const p = constraintParams(constraints, "media_required") || {};
    const required = Array.isArray(p.types) ? p.types : [];
    const have = new Set(Array.isArray(profile.available_media) ? profile.available_media : []);
    if (!required.length) {
      put(evidence({ dimension: DIMENSIONS.MEDIA_READINESS, value: [...have], strength: 0.6, confidence: 0.4, note: "no media requirement" }));
    } else {
      const met = required.filter((t) => have.has(t)).length;
      const s = clamp01(met / required.length);
      put(evidence({ dimension: DIMENSIONS.MEDIA_READINESS, value: [...have], strength: s, direction: direction(s), confidence: 0.7, note: `${met}/${required.length} media` }));
    }
  }

  return out;
}

module.exports = { extractEvidence, bandSatisfaction, recencyConfidence };
