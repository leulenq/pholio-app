"use strict";

/**
 * Canonical stats / measurements formatter (Wave 2C).
 *
 * ONE place that reads a `profiles` row and produces a normalized, display-ready
 * stats object. Every surface — profile, submission snapshot, agency, public
 * portfolio, and every PDF engine — routes through this module so they never
 * diverge again (audit P1-3 & P1-6).
 *
 * Design (tasks/field-split-design-2026-07-01.md §A):
 *   - `stats_track` (womenswear | menswear | ungendered) drives WHICH measurement
 *     set + sizing systems render — NOT `gender`.
 *       womenswear → bust / waist / hips + dress size
 *       menswear   → chest / waist / inseam + suit size
 *       ungendered → neutral set (height, chest-or-bust, waist, inseam, shoe)
 *     Height + shoe are always included.
 *   - BOTH units are always derived from the canonical stored value (cm for
 *     lengths, the `weight_unit`-canonical value for weight). The opposite unit is
 *     never read from a possibly-stale stored column (audit P1-2).
 *   - `chest_cm` vs `bust_cm` (audit P1-3): a real `chest_cm` column now exists.
 *     menswear/ungendered read chest_cm (legacy fallback: bust_cm). womenswear
 *     reads bust_cm (legacy fallback: chest_cm). See resolveCoreCircumference.
 *   - `dress_size` and `suit_size` are separate columns — never conflated.
 *   - `measurements_updated_at` recency + a >90d stale flag.
 *
 * Pure: no DB access, no external deps. Never throws on a sparse/null input.
 *
 * The PDF comp-card line renderer (src/domains/pdf/composition/stats-formatter.js)
 * imports its track resolution + core-circumference + unit primitives FROM this
 * module, so the comp-card and every other surface agree on the same canonical
 * decisions. That is the consolidation point — there is no competing copy of the
 * chest/bust/track/unit logic.
 */

const CM_PER_INCH = 2.54;
const LBS_PER_KG = 2.20462;

/** Measurements older than this are flagged stale (mirrors profile.js:963-979). */
const MEASUREMENT_STALE_DAYS = 90;

const VALID_TRACKS = new Set(["womenswear", "menswear", "ungendered"]);

/** gender → default stats_track seed (only when stats_track is absent). */
const GENDER_TO_TRACK = {
  female: "womenswear",
  woman: "womenswear",
  women: "womenswear",
  f: "womenswear",
  male: "menswear",
  man: "menswear",
  men: "menswear",
  m: "menswear",
};

/**
 * Coerce a value to a finite positive number, else null.
 * @param {*} value
 * @returns {number|null}
 */
function toPositiveNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * cm → feet-inches string with no space: `5'10"`. Total inches rounded to the
 * nearest whole inch (carrying 12" → 1').
 * @param {*} cm
 * @returns {string|null}
 */
function cmToFeetInches(cm) {
  const n = toPositiveNumber(cm);
  if (n == null) return null;
  const totalInches = Math.round(n / CM_PER_INCH);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches - feet * 12;
  return `${feet}'${inches}"`;
}

/**
 * cm → inches rounded to the nearest half inch (34 or 34.5).
 * @param {*} cm
 * @returns {number|null}
 */
function cmToInchesHalf(cm) {
  const n = toPositiveNumber(cm);
  if (n == null) return null;
  return Math.round((n / CM_PER_INCH) * 2) / 2;
}

/** Render a number without a trailing `.0`. */
function fmtNum(n) {
  return String(n);
}

/**
 * Resolve the stats track for a profile.
 * Precedence: explicit `stats_track` → seeded from `gender` → `ungendered`.
 * NEVER driven by gender when stats_track is present (audit: track ≠ gender).
 * @param {object} profile
 * @returns {'womenswear'|'menswear'|'ungendered'}
 */
function resolveStatsTrack(profile) {
  const raw = String(profile?.stats_track ?? "").trim().toLowerCase();
  if (VALID_TRACKS.has(raw)) return raw;
  const gender = String(profile?.gender ?? "").trim().toLowerCase();
  return GENDER_TO_TRACK[gender] || "ungendered";
}

/**
 * Resolve the canonical core circumference (bust/chest) per track.
 *
 * A real `chest_cm` column now exists (Wave 2B). The label differs by track but
 * it is the same physical circumference:
 *   - womenswear → bust_cm (legacy fallback: chest_cm)
 *   - menswear / ungendered → chest_cm (legacy fallback: bust_cm)
 *
 * TODO(wave-2 contract): once users reconfirm measurements post-split, drop the
 * legacy cross-fallback so bust_cm and chest_cm stay strictly independent.
 *
 * @param {object} profile
 * @param {string} [track] — resolved track; computed when omitted
 * @returns {{ track: string, key: 'bust'|'chest', label: string, cm: number|null,
 *   usedLegacyFallback: boolean }}
 */
function resolveCoreCircumference(profile, track) {
  const p = profile || {};
  const t = track || resolveStatsTrack(p);
  const bustCm = toPositiveNumber(p.bust_cm);
  const chestCm = toPositiveNumber(p.chest_cm);

  if (t === "womenswear") {
    const cm = bustCm ?? chestCm;
    return {
      track: t,
      key: "bust",
      label: "Bust",
      cm,
      usedLegacyFallback: bustCm == null && chestCm != null,
    };
  }
  // menswear + ungendered read chest first.
  const cm = chestCm ?? bustCm;
  return {
    track: t,
    key: "chest",
    label: "Chest",
    cm,
    usedLegacyFallback: chestCm == null && bustCm != null,
  };
}

/**
 * Measurement recency + stale flag. Stale when `measurements_updated_at` is
 * absent OR older than MEASUREMENT_STALE_DAYS.
 * @param {object} profile
 * @param {Date} [referenceDate]
 * @returns {{ measurements_updated_at: string|null, updated_days_ago: number|null,
 *   is_stale: boolean }}
 */
function measurementRecency(profile, referenceDate) {
  const ref = referenceDate instanceof Date ? referenceDate : new Date();
  const raw = profile?.measurements_updated_at ?? null;
  if (!raw) {
    return { measurements_updated_at: null, updated_days_ago: null, is_stale: true };
  }
  const then = new Date(raw);
  if (Number.isNaN(then.getTime())) {
    return { measurements_updated_at: null, updated_days_ago: null, is_stale: true };
  }
  const days = Math.floor((ref.getTime() - then.getTime()) / (24 * 60 * 60 * 1000));
  return {
    measurements_updated_at: then.toISOString(),
    updated_days_ago: days,
    is_stale: days > MEASUREMENT_STALE_DAYS,
  };
}

/** Build a length measurement view (cm canonical → both units). */
function lengthView(cm) {
  const n = toPositiveNumber(cm);
  if (n == null) return null;
  const rounded = Math.round(n);
  const inches = cmToInchesHalf(n);
  return {
    cm: rounded,
    inches,
    metric: `${rounded} cm`,
    imperial: `${fmtNum(inches)}"`,
    dual: `${rounded} cm / ${fmtNum(inches)}"`,
  };
}

/** Build the height view (cm canonical → cm + ft/in). */
function heightView(cm) {
  const n = toPositiveNumber(cm);
  if (n == null) return null;
  const rounded = Math.round(n);
  const feetInches = cmToFeetInches(n);
  return {
    cm: rounded,
    inches: Math.round(n / CM_PER_INCH),
    feet_inches: feetInches,
    metric: `${rounded} cm`,
    imperial: feetInches,
    dual: `${rounded} cm / ${feetInches}`,
  };
}

/**
 * Build the weight view. BOTH units derived from the canonical stored value
 * (never the possibly-stale opposite column, audit P1-2). Canonical unit is
 * `weight_unit`, else kg when present, else lbs.
 * @param {object} profile
 */
function weightView(profile) {
  const p = profile || {};
  const kg = toPositiveNumber(p.weight_kg);
  const lbs = toPositiveNumber(p.weight_lbs);
  if (kg == null && lbs == null) return null;

  const unit = String(p.weight_unit ?? "").trim().toLowerCase();
  let canonicalKg;
  if (unit === "lbs" && lbs != null) canonicalKg = lbs / LBS_PER_KG;
  else if (unit === "kg" && kg != null) canonicalKg = kg;
  else canonicalKg = kg != null ? kg : lbs / LBS_PER_KG;

  const kgR = Math.round(canonicalKg);
  const lbsR = Math.round(canonicalKg * LBS_PER_KG);
  return {
    kg: kgR,
    lbs: lbsR,
    metric: `${kgR} kg`,
    imperial: `${lbsR} lbs`,
    dual: `${kgR} kg / ${lbsR} lbs`,
  };
}

function cleanString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/**
 * Does the profile have the track's canonical core measurements for submission?
 * Height + core circumference + waist + hips are all required.
 *
 * Core-circumference rule (matches the pre-Wave-2C readiness contract, audit
 * P1-3): a real `chest_cm` satisfies menswear so a male "Chest" no longer fails
 * readiness. Unlike DISPLAY (resolveCoreCircumference, which cross-falls-back so
 * a card is never blank), the READINESS gate is strict for menswear — bust_cm
 * does NOT substitute for a required chest. womenswear/ungendered accept either
 * bust_cm or chest_cm.
 *
 * TODO(wave-2 contract): revisit whether ungendered should require a specific
 * circumference once tracks are user-confirmed post-split.
 *
 * @param {object} profile
 * @returns {boolean}
 */
function hasCoreMeasurements(profile) {
  const p = profile || {};
  const track = resolveStatsTrack(p);
  const hasHeight = toPositiveNumber(p.height_cm) != null;
  const hasWaist = toPositiveNumber(p.waist_cm) != null;
  const hasHips = toPositiveNumber(p.hips_cm) != null;
  const chestCm = toPositiveNumber(p.chest_cm);
  const bustCm = toPositiveNumber(p.bust_cm);
  const hasCore =
    track === "menswear"
      ? chestCm != null
      : chestCm != null || bustCm != null;
  return hasHeight && hasCore && hasWaist && hasHips;
}

/**
 * Build the canonical, display-ready stats object for a profile.
 *
 * @param {object} profile — a `profiles` row
 * @param {object} [options]
 * @param {Date} [options.referenceDate] — "now" override for recency (test hook)
 * @returns {{
 *   track: 'womenswear'|'menswear'|'ungendered',
 *   height: object|null,
 *   weight: object|null,
 *   core: object|null,          // bust/chest per track (with .key + .label)
 *   bust: object|null,
 *   chest: object|null,
 *   waist: object|null,
 *   hips: object|null,
 *   inseam: object|null,
 *   dress_size: string|null,
 *   suit_size: string|null,
 *   shoe_size: string|null,
 *   hair_color: string|null,
 *   eye_color: string|null,
 *   measurements_updated_at: string|null,
 *   updated_days_ago: number|null,
 *   is_stale: boolean,
 *   fields: Array<{ key: string, label: string, value: string }>,
 * }}
 */
function buildCanonicalStats(profile, options = {}) {
  const p = profile && typeof profile === "object" ? profile : {};
  const ref =
    options.referenceDate instanceof Date ? options.referenceDate : new Date();
  const track = resolveStatsTrack(p);

  const height = heightView(p.height_cm);
  const weight = weightView(p);
  const waist = lengthView(p.waist_cm);
  const hips = lengthView(p.hips_cm);
  const inseam = lengthView(p.inseam_cm);

  const coreInfo = resolveCoreCircumference(p, track);
  const coreLen = lengthView(coreInfo.cm);
  const core = coreLen
    ? { ...coreLen, key: coreInfo.key, label: coreInfo.label }
    : null;
  // Expose both named handles; only the track-appropriate one is populated.
  const bust = coreInfo.key === "bust" ? core : null;
  const chest = coreInfo.key === "chest" ? core : null;

  const dress_size = cleanString(p.dress_size);
  const suit_size = cleanString(p.suit_size);
  const shoe_size = cleanString(p.shoe_size);
  const hair_color = cleanString(p.hair_color);
  const eye_color = cleanString(p.eye_color);

  const recency = measurementRecency(p, ref);

  // Ordered, render-ready lines per track. Always height + shoe.
  const fields = [];
  const push = (key, label, value) => {
    if (value == null || value === "") return;
    fields.push({ key, label, value });
  };

  push("height", "Height", height && height.dual);
  if (track === "womenswear") {
    push("bust", "Bust", core && core.dual);
    push("waist", "Waist", waist && waist.dual);
    push("hips", "Hips", hips && hips.dual);
    push("dress", "Dress", dress_size);
  } else if (track === "menswear") {
    push("chest", "Chest", core && core.dual);
    push("waist", "Waist", waist && waist.dual);
    push("inseam", "Inseam", inseam && inseam.dual);
    push("suit", "Suit", suit_size);
  } else {
    // ungendered — neutral set.
    push(coreInfo.key, coreInfo.label, core && core.dual);
    push("waist", "Waist", waist && waist.dual);
    push("hips", "Hips", hips && hips.dual);
    push("inseam", "Inseam", inseam && inseam.dual);
    push("dress", "Dress", dress_size);
    push("suit", "Suit", suit_size);
  }
  push("shoe", "Shoe", shoe_size ? shoe_size : null);
  push("hair", "Hair", hair_color);
  push("eyes", "Eyes", eye_color);

  return {
    track,
    height,
    weight,
    core,
    bust,
    chest,
    waist,
    hips,
    inseam,
    dress_size,
    suit_size,
    shoe_size,
    hair_color,
    eye_color,
    measurements_updated_at: recency.measurements_updated_at,
    updated_days_ago: recency.updated_days_ago,
    is_stale: recency.is_stale,
    fields,
  };
}

module.exports = {
  CM_PER_INCH,
  LBS_PER_KG,
  MEASUREMENT_STALE_DAYS,
  toPositiveNumber,
  cmToFeetInches,
  cmToInchesHalf,
  resolveStatsTrack,
  resolveCoreCircumference,
  measurementRecency,
  hasCoreMeasurements,
  buildCanonicalStats,
};
