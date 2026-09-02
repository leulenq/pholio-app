"use strict";

/**
 * Discover launch-mode — per-profile constraint evaluation (WS5.2).
 *
 * Scores a single profile against the hard constraints of one role in the parsed
 * contract, producing a satisfaction vector of
 *   { field, status: 'pass'|'fail'|'unknown', tier, actual }
 * used by the grouping engine (engine.js) and surfaced per-card as
 * `constraint_truth` (present.js).
 *
 * Semantics (spec §6, tasks/discover-search-redesign.md):
 *   - `unknown` (no data on file) is DISTINCT from `fail` and is NEVER treated
 *     as satisfied — availability with no bookout data is unknown, never pass.
 *   - constraints flagged `needs_confirmation` by the deterministic re-parse
 *     (LB-4) are NOT applied — they are skipped and counted separately.
 *   - playing_age is matched by RANGE OVERLAP, not containment.
 *   - `approx` numeric ops match within ±3cm.
 *   - tiers come from field-whitelist.js (single source of truth); this module
 *     never invents its own tier/relaxation policy.
 *
 * Pure & DB-free: the caller batch-loads bookouts / representation status and
 * passes them via opts, so this stays a testable pure function.
 */

const {
  tierFor,
  GENDER_DB_MAP,
  normalizeExperienceLevel,
  heritageSlugsForValues,
  heritageLabelsForValues,
  parseHeritageValues,
} = require("./field-whitelist");
const {
  normalizeBookingLaneList,
} = require("../../../../shared/constants/booking-lanes");

const APPROX_TOL_CM = 3;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve the a/b bounds of a numeric constraint, preferring the deterministic
 * reconciled `value` (set by validate-contract) over the raw LLM a/b.
 */
function constraintBounds(c) {
  if (c && c.value != null) {
    if (typeof c.value === "object") {
      return { a: num(c.value.a), b: num(c.value.b) };
    }
    return { a: num(c.value), b: null };
  }
  return { a: num(c && c.a), b: num(c && c.b) };
}

/** Compare an actual number against a constraint's op semantics. */
function numericStatus(actual, c) {
  if (actual == null) return "unknown";
  const { a, b } = constraintBounds(c);
  if (a == null && b == null) return "unknown";
  const op = c && c.op;
  switch (op) {
    case "min":
      return actual >= a ? "pass" : "fail";
    case "max":
      return actual <= a ? "pass" : "fail";
    case "between": {
      const hi = b == null ? a : b;
      return actual >= Math.min(a, hi) && actual <= Math.max(a, hi)
        ? "pass"
        : "fail";
    }
    case "approx":
      return Math.abs(actual - a) <= APPROX_TOL_CM ? "pass" : "fail";
    case "exact":
      return actual === a ? "pass" : "fail";
    default:
      if (b != null) {
        return actual >= Math.min(a, b) && actual <= Math.max(a, b)
          ? "pass"
          : "fail";
      }
      return actual >= a ? "pass" : "fail";
  }
}

/** Playing-age RANGE OVERLAP vs profiles.playing_age_min/max. */
function playingAgeStatus(c, pMin, pMax) {
  if (pMin == null && pMax == null) return "unknown";
  const { a, b } = constraintBounds(c);
  if (a == null && b == null) return "unknown";
  const lo = a == null ? b : a;
  const hi = b == null ? a : b;
  const plo = pMin == null ? -Infinity : Number(pMin);
  const phi = pMax == null ? Infinity : Number(pMax);
  return Math.max(lo, plo) <= Math.min(hi, phi) ? "pass" : "fail";
}

/** ISO date-string (YYYY-MM-DD) range overlap. */
function rangesOverlap(fromA, toA, fromB, toB) {
  const a1 = String(fromA);
  const a2 = String(toA || fromA);
  const b1 = String(fromB);
  const b2 = String(toB || fromB);
  return a1 <= b2 && a2 >= b1;
}

/**
 * Availability: `profiles.availability_status` + bookout rows.
 *
 * A talent who says they are available and has booked out nothing over the
 * window IS available — the old rule (positive bookout rows required) marked
 * every such talent `unknown` and dropped them (audit §2.3). Fail is reserved
 * for a stated conflict: an overlapping bookout, or "unavailable".
 *
 * @returns {{status: 'pass'|'fail'|'unknown', overlap: object|null}}
 */
function availabilityResult(windows, status, bookouts) {
  const list = Array.isArray(windows) ? windows : [];
  const books = Array.isArray(bookouts) ? bookouts : [];
  const declared = String(status || "").trim().toLowerCase();

  let overlap = null;
  for (const w of list) {
    if (!w || !w.from) continue;
    for (const b of books) {
      if (!b || !b.starts_on) continue;
      if (rangesOverlap(w.from, w.to, b.starts_on, b.ends_on)) {
        overlap = b;
        break;
      }
    }
    if (overlap) break;
  }
  if (overlap) return { status: "fail", overlap };
  if (declared === "unavailable") return { status: "fail", overlap: null };
  if (declared === "available" || declared === "limited") {
    return { status: "pass", overlap: null };
  }
  // No stated status: declared bookout rows that miss the window still confirm.
  if (books.length) return { status: "pass", overlap: null };
  return { status: "unknown", overlap: null };
}

function availabilityStatus(windows, status, bookouts) {
  return availabilityResult(windows, status, bookouts).status;
}

function unionStatus(want, membership) {
  if (want === "either") return "pass";
  if (membership == null || !String(membership).trim()) return "unknown";
  const m = String(membership).toLowerCase();
  const derived = /non|none|not?\b|independent/.test(m) ? "non_union" : "union";
  return derived === want ? "pass" : "fail";
}

/**
 * `profiles.tattoos` is a BOOLEAN column (migration
 * 20250104000000_add_comprehensive_profile_fields.js). Reading it as free text
 * made `false` non-empty and therefore "has tattoos", so "no visible tattoos"
 * excluded the very talent who answered no (audit §2.3).
 *   true / 1 / "true"  → has tattoos
 *   false / 0 / "false" → none
 *   null / ""           → unknown
 */
function tattooBoolean(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (value == null) return null;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (["true", "1", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n", "none"].includes(text)) return false;
  // Legacy free text ("full sleeve") describes tattoos the talent has.
  return true;
}

function tattooStatus(want, tattoos) {
  const has = tattooBoolean(tattoos);
  if (has == null) return "unknown";
  if (want === false) return has ? "fail" : "pass";
  if (want === true) return has ? "pass" : "fail";
  return "unknown";
}

function enumSetStatus(actual, wanted) {
  if (actual == null || !String(actual).trim()) return "unknown";
  const a = String(actual).toLowerCase();
  return wanted.map((v) => String(v).toLowerCase()).includes(a)
    ? "pass"
    : "fail";
}

/**
 * A profile's booking lanes. Canonical store since `20260624195800` is the
 * `profile_booking_lanes` join table, batch-loaded by the caller and handed in
 * as `opts.lanes`; the legacy `modeling_categories` / `booking_lanes` columns
 * are the fallback for rows written before that migration (audit §2.4).
 */
function profileBoards(profile, lanes) {
  if (Array.isArray(lanes) && lanes.length) {
    return normalizeBookingLaneList(lanes);
  }
  const raw = profile.modeling_categories || profile.booking_lanes || null;
  let list = [];
  if (raw) {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      list = normalizeBookingLaneList(parsed);
    } catch {
      list = [];
    }
  }
  return list;
}

function boardsStatus(wanted, profile, lanes) {
  const have = profileBoards(profile, lanes);
  if (!have.length) return "unknown";
  const want = normalizeBookingLaneList(wanted);
  return want.some((w) => have.includes(w)) ? "pass" : "fail";
}

/**
 * `profiles.shoe_size` is a free string ("8 US", "38 EU", "8"); `shoe_region`
 * carries the region when the string does not. Compared numerically, and by
 * region only when both sides state one (audit §2.4).
 */
function parseStoredShoe(profile) {
  const raw = profile == null ? null : profile.shoe_size;
  if (raw == null || !String(raw).trim()) return null;
  const text = String(raw).trim();
  const numMatch = text.match(/\d+(?:[.,]\d+)?/);
  if (!numMatch) return null;
  const size = Number(numMatch[0].replace(",", "."));
  if (!Number.isFinite(size)) return null;
  const regionMatch = text.match(/\b(us|eu|eur|uk)\b/i);
  let region = regionMatch ? regionMatch[1].toUpperCase() : null;
  if (region === "EUR") region = "EU";
  if (!region && profile.shoe_region && String(profile.shoe_region).trim()) {
    region = String(profile.shoe_region).trim().toUpperCase();
  }
  return { size, region: region || null };
}

function shoeStatus(want, profile) {
  const have = parseStoredShoe(profile);
  if (!have) return "unknown";
  const wantSize = Number(want && want.size);
  if (!Number.isFinite(wantSize)) return "unknown";
  if (have.size !== wantSize) return "fail";
  const wantRegion = want.region ? String(want.region).toUpperCase() : null;
  if (wantRegion && have.region && wantRegion !== have.region) return "fail";
  return "pass";
}

/** Numeric size comparison ("4" vs "US 4" vs 4). */
function sizeNumber(value) {
  if (value == null) return null;
  const match = String(value).match(/\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const n = Number(match[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function sizeStatus(want, actual) {
  if (actual == null || !String(actual).trim()) return "unknown";
  const a = sizeNumber(actual);
  const w = sizeNumber(want);
  if (a == null || w == null) return enumSetStatus(actual, [String(want)]);
  return a === w ? "pass" : "fail";
}

/** Three vocabularies, one comparison — see normalizeExperienceLevel. */
function experienceStatus(want, actual) {
  const have = normalizeExperienceLevel(actual);
  if (have == null) return "unknown";
  const wanted = normalizeExperienceLevel(want);
  if (wanted == null) return "unknown";
  return have === wanted ? "pass" : "fail";
}

/**
 * Heritage — the talent's own picker selection against the booker's ask, both
 * normalised to slugs. Blank is `unknown` and never a fail (audit §3.1 rule 3);
 * "Mixed Heritage" alone therefore only answers a "mixed" ask.
 */
function heritageStatus(wanted, profile) {
  const stored = parseHeritageValues(profile && profile.ethnicity);
  if (!stored.length) return "unknown";
  const have = heritageSlugsForValues(stored);
  if (!have.length) return "unknown"; // free text we cannot read honestly
  const want = (Array.isArray(wanted) ? wanted : [wanted]).map((v) =>
    String(v).toLowerCase(),
  );
  return have.some((slug) => want.includes(slug)) ? "pass" : "fail";
}

/** Whether a constraint object was flagged needs_confirmation (LB-4). */
function isSkipped(c) {
  return !!(c && typeof c === "object" && c.needs_confirmation === true);
}

/**
 * Evaluate a single profile against a role's `hard` constraint block.
 *
 * @param {object} profile — raw profiles row (profiles.*)
 * @param {object} hard — role.hard from the validated contract
 * @param {object} [opts]
 * @param {Date}   [opts.now]
 * @param {Array<{starts_on,ends_on}>} [opts.bookouts] — this profile's bookouts
 * @param {string|null} [opts.representationStatus] — resolved rep status, or
 *   undefined/null when the DTO does not yet expose it (→ 'unknown')
 * @returns {Array<{field, status, tier, actual}>} applied constraints only
 *   (needs_confirmation constraints are excluded — see `collectSkipped`)
 */
function evaluateProfile(profile, hard, opts = {}) {
  const p = profile || {};
  const h = hard || {};
  const out = [];
  const push = (field, status, actual) =>
    out.push({ field, status, tier: tierFor(field), actual });

  // gender_presentation (the one exclusion the engine applies on a fail)
  if (Array.isArray(h.gender_presentation) && h.gender_presentation.length) {
    const wantDb = h.gender_presentation
      .map((g) => GENDER_DB_MAP[g])
      .filter(Boolean)
      .map((v) => v.toLowerCase());
    const actual = p.gender;
    const declared = String(actual == null ? "" : actual).trim().toLowerCase();
    let status = "unknown";
    // "Prefer not to say" is a withheld answer, and "Other" is an identity no
    // brief can request (GENDER_DB_MAP has no key for it). Neither is a
    // different answer to the booker's ask, so neither is the one exclusion
    // the engine applies; both stay visible as unknown.
    if (declared && declared !== "prefer not to say" && declared !== "other") {
      status = wantDb.includes(declared) ? "pass" : "fail";
    }
    push("gender_presentation", status, actual ?? null);
  }

  // height_cm
  if (h.height_cm && !isSkipped(h.height_cm)) {
    push("height_cm", numericStatus(num(p.height_cm), h.height_cm), p.height_cm ?? null);
  }

  // playing_age — range overlap
  if (h.playing_age && !isSkipped(h.playing_age)) {
    push(
      "playing_age",
      playingAgeStatus(h.playing_age, p.playing_age_min, p.playing_age_max),
      p.playing_age_min != null || p.playing_age_max != null
        ? { min: p.playing_age_min ?? null, max: p.playing_age_max ?? null }
        : null,
    );
  }

  // measurements
  if (h.measurements && typeof h.measurements === "object") {
    const meas = h.measurements;
    const lengthCols = {
      bust_cm: "bust_cm",
      chest_cm: "chest_cm",
      waist_cm: "waist_cm",
      hips_cm: "hips_cm",
      inseam_cm: "inseam_cm",
    };
    for (const [key, col] of Object.entries(lengthCols)) {
      const c = meas[key];
      if (c && !isSkipped(c)) {
        push(
          `measurements.${key}`,
          numericStatus(num(p[col]), c),
          p[col] ?? null,
        );
      }
    }
    if (meas.dress_size && !isSkipped(meas.dress_size) && meas.dress_size.value != null) {
      push(
        "measurements.dress_size",
        sizeStatus(meas.dress_size.value, p.dress_size),
        p.dress_size ?? null,
      );
    }
    if (meas.suit_size && !isSkipped(meas.suit_size) && meas.suit_size.value != null) {
      push(
        "measurements.suit_size",
        sizeStatus(meas.suit_size.value, p.suit_size),
        p.suit_size ?? null,
      );
    }
  }

  // shoe — stored as a free string with an optional region column
  if (h.shoe && !isSkipped(h.shoe) && h.shoe.size != null) {
    push("shoe", shoeStatus(h.shoe, p), parseStoredShoe(p));
  }

  // location.market
  if (h.location && h.location.market) {
    const actual = p.market;
    let status = "unknown";
    if (actual != null && String(actual).trim()) {
      status =
        String(actual).toLowerCase() === String(h.location.market).toLowerCase()
          ? "pass"
          : "fail";
    }
    push("location", status, actual ?? null);
  }

  // availability
  if (Array.isArray(h.availability) && h.availability.length) {
    const applied = h.availability.filter((w) => !isSkipped(w));
    if (applied.length) {
      const result = availabilityResult(
        applied,
        p.availability_status,
        opts.bookouts,
      );
      push("availability", result.status, {
        status: p.availability_status ?? null,
        overlap: result.overlap
          ? {
              starts_on: result.overlap.starts_on ?? null,
              ends_on: result.overlap.ends_on ?? null,
            }
          : null,
      });
    }
  }

  // visible_tattoos (boolean column)
  if (h.visible_tattoos === true || h.visible_tattoos === false) {
    push(
      "visible_tattoos",
      tattooStatus(h.visible_tattoos, p.tattoos),
      tattooBoolean(p.tattoos),
    );
  }

  // boards — join table first, legacy columns as fallback
  if (Array.isArray(h.boards) && h.boards.length) {
    push(
      "boards",
      boardsStatus(h.boards, p, opts.lanes),
      profileBoards(p, opts.lanes),
    );
  }

  // hair_color (OR-set)
  if (Array.isArray(h.hair_color) && h.hair_color.length) {
    push("hair_color", enumSetStatus(p.hair_color, h.hair_color), p.hair_color ?? null);
  }

  // eye_color (OR-set)
  if (Array.isArray(h.eye_color) && h.eye_color.length) {
    push("eye_color", enumSetStatus(p.eye_color, h.eye_color), p.eye_color ?? null);
  }

  // heritage — the talent's own selection, only when the brief asked
  if (Array.isArray(h.heritage) && h.heritage.length) {
    const stored = parseHeritageValues(p.ethnicity);
    push("heritage", heritageStatus(h.heritage, p), {
      slugs: heritageSlugsForValues(stored),
      labels: heritageLabelsForValues(stored),
    });
  }

  // union
  if (h.union) {
    push("union", unionStatus(h.union, p.union_membership), p.union_membership ?? null);
  }

  // representation_status
  if (Array.isArray(h.representation_status) && h.representation_status.length) {
    const rep = opts.representationStatus;
    const status =
      rep == null ? "unknown" : enumSetStatus(rep, h.representation_status);
    push("representation_status", status, rep ?? null);
  }

  // experience_level (three vocabularies, one comparison)
  if (h.experience_level) {
    push(
      "experience_level",
      experienceStatus(h.experience_level, p.experience_level),
      p.experience_level ?? null,
    );
  }

  // credentials are NOT applied: no profile field records tearsheets or shows,
  // so the ask can only be answered with a note (audit §3.2 / §4). Applying it
  // as `unknown` pushed everyone into the partial group for no information.

  return out;
}

/**
 * The applied hard-constraint fields for a role (excludes needs_confirmation
 * and blank constraints) — mirrors evaluateProfile's field set so the engine
 * can compute the removable-chip satisfaction matrix without a profile.
 */
function appliedConstraintFields(hard) {
  const probe = evaluateProfile({}, hard, {});
  // dedupe (measurements.* already distinct)
  return [...new Set(probe.map((e) => e.field))];
}

module.exports = {
  evaluateProfile,
  appliedConstraintFields,
  // exported for unit tests
  numericStatus,
  playingAgeStatus,
  availabilityStatus,
  availabilityResult,
  unionStatus,
  tattooStatus,
  tattooBoolean,
  boardsStatus,
  profileBoards,
  parseStoredShoe,
  shoeStatus,
  sizeStatus,
  experienceStatus,
  heritageStatus,
  rangesOverlap,
  APPROX_TOL_CM,
};
