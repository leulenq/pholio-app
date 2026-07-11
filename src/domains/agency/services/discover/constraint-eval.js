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

const { tierFor, GENDER_DB_MAP } = require("./field-whitelist");
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
 * Availability: profiles.availability_status + bookout rows.
 * Pass ONLY when we have positive declared data (bookouts) that do not overlap
 * the requested window. Missing data → unknown (never pass); an overlapping
 * bookout or an 'unavailable' status → fail.
 */
function availabilityStatus(windows, status, bookouts) {
  const list = Array.isArray(windows) ? windows : [];
  const books = Array.isArray(bookouts) ? bookouts : [];

  if (String(status || "").toLowerCase() === "unavailable") return "fail";

  let overlaps = false;
  for (const w of list) {
    if (!w || !w.from) continue;
    for (const b of books) {
      if (!b || !b.starts_on) continue;
      if (rangesOverlap(w.from, w.to, b.starts_on, b.ends_on)) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) break;
  }
  if (overlaps) return "fail";
  // Positive confirmation requires declared bookout data with no conflict.
  if (books.length) return "pass";
  return "unknown";
}

function unionStatus(want, membership) {
  if (want === "either") return "pass";
  if (membership == null || !String(membership).trim()) return "unknown";
  const m = String(membership).toLowerCase();
  const derived = /non|none|not?\b|independent/.test(m) ? "non_union" : "union";
  return derived === want ? "pass" : "fail";
}

/** Freeform tattoos text → truthy = "has tattoos", null/empty = unknown. */
function tattooStatus(want, tattoos) {
  const text = tattoos == null ? "" : String(tattoos).trim();
  if (!text) return "unknown";
  const has = true; // any non-empty freeform text is treated as "has tattoos"
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

function profileBoards(profile) {
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
  if (!list.length && profile.archetype) {
    list = normalizeBookingLaneList([profile.archetype]);
  }
  return list;
}

function boardsStatus(wanted, profile) {
  const have = profileBoards(profile);
  if (!have.length) return "unknown";
  const want = normalizeBookingLaneList(wanted);
  return want.some((w) => have.includes(w)) ? "pass" : "fail";
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

  // gender_presentation (also applied as SQL exclusion in the engine)
  if (Array.isArray(h.gender_presentation) && h.gender_presentation.length) {
    const wantDb = h.gender_presentation
      .map((g) => GENDER_DB_MAP[g])
      .filter(Boolean)
      .map((v) => v.toLowerCase());
    const actual = p.gender;
    let status = "unknown";
    if (actual != null && String(actual).trim()) {
      status = wantDb.includes(String(actual).toLowerCase()) ? "pass" : "fail";
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
        enumSetStatus(p.dress_size, [String(meas.dress_size.value)]),
        p.dress_size ?? null,
      );
    }
    if (meas.suit_size && !isSkipped(meas.suit_size) && meas.suit_size.value != null) {
      push(
        "measurements.suit_size",
        enumSetStatus(p.suit_size, [String(meas.suit_size.value)]),
        p.suit_size ?? null,
      );
    }
  }

  // shoe
  if (h.shoe && !isSkipped(h.shoe) && h.shoe.size != null) {
    push(
      "shoe",
      enumSetStatus(p.shoe_size, [String(h.shoe.size)]),
      p.shoe_size ?? null,
    );
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
      push(
        "availability",
        availabilityStatus(applied, p.availability_status, opts.bookouts),
        p.availability_status ?? null,
      );
    }
  }

  // visible_tattoos
  if (h.visible_tattoos === true || h.visible_tattoos === false) {
    push("visible_tattoos", tattooStatus(h.visible_tattoos, p.tattoos), p.tattoos ?? null);
  }

  // boards
  if (Array.isArray(h.boards) && h.boards.length) {
    push("boards", boardsStatus(h.boards, p), profileBoards(p));
  }

  // hair_color (OR-set)
  if (Array.isArray(h.hair_color) && h.hair_color.length) {
    push("hair_color", enumSetStatus(p.hair_color, h.hair_color), p.hair_color ?? null);
  }

  // eye_color (OR-set)
  if (Array.isArray(h.eye_color) && h.eye_color.length) {
    push("eye_color", enumSetStatus(p.eye_color, h.eye_color), p.eye_color ?? null);
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

  // experience_level
  if (h.experience_level) {
    push(
      "experience_level",
      enumSetStatus(p.experience_level, [h.experience_level]),
      p.experience_level ?? null,
    );
  }

  // credentials — always unknown at launch (no falsifiable data). The engine's
  // credential_gate short-circuit is the honest-zero path; if it ever reaches
  // here it must not read as satisfied.
  if (h.credentials && typeof h.credentials === "object") {
    const asked = ["tearsheets", "runway_shows", "fit_experience", "published_work"].some(
      (k) => h.credentials[k] === true,
    );
    if (asked) push("credentials", "unknown", null);
  }

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
  unionStatus,
  tattooStatus,
  boardsStatus,
  rangesOverlap,
  APPROX_TOL_CM,
};
