"use strict";

/**
 * Discover parse v2 — field & enum whitelist (single source of truth).
 *
 * WS4 (tasks/discover-search-implementation-plan.md §WS4.4). Every hard field
 * the roles contract can carry, the closed enum vocabulary allowed per field,
 * and the static constraint-tier / relaxation policy from spec §6
 * (tasks/discover-search-redesign.md). `contract-schema.js`, `parse.js`,
 * `validate-contract.js`, and (later) the PR5 engine all read their allowed
 * values from HERE — never from a second copy — so the schema, the validator,
 * and the SQL layer can never drift.
 *
 * Enum vocabularies are derived from the real codebase:
 *   - gender_presentation → onboarding GenderTiles / casting routes
 *   - hair_color / eye_color → onboarding CastingMeasurements option lists
 *   - boards → src/shared/constants/booking-lanes.js lane slugs
 *   - location.market → src/domains/talent/services/intel/market-resolve.js
 *
 * Tier / relaxation policy (spec §6):
 *   tier: 'client_gate'  — booker's stated requirement; never auto-shown as a
 *                          match on a miss (honest zero + explicit opt-in).
 *   tier: 'operational'  — may appear below exact matches in a segregated,
 *                          separately-headed "Near matches" section.
 *   relaxable: 'never'          — playing-age & legal-adjacent gates; never
 *                                 relaxed under any flow.
 *   relaxable: 'booker_confirm' — only surfaced behind the explicit
 *                                 "show nearest (outside spec)" action.
 *   relaxable: 'auto_with_label'— may auto-appear in a labeled near-match band.
 *
 * Model confidence NEVER decides relaxation — it only decides which chips
 * render as "interpretation — check me". Policy is static, set here.
 */

const { BOOKING_LANE_SLUGS } = require("../../../../shared/constants/booking-lanes");
const { MARKET_LABELS } = require("../../../talent/services/intel/market-resolve");

// ── Constraint operators (shared by every numeric/age/measurement object) ────

const CONSTRAINT_OPS = ["exact", "min", "max", "between", "approx"];

// ── Region tags for sizes (US 6 ≠ UK 6 ≠ EU 6 — council contract gap) ────────

const SIZE_REGIONS = ["US", "UK", "EU", "IT", "FR"];
const SHOE_REGIONS = ["US", "EU", "UK"];

// ── Enum vocabularies (closed sets, lowercase snake canonical) ───────────────

// Contract uses lowercase presentation terms; GENDER_DB_MAP bridges to the
// stored profile values (Female / Male / Non-Binary) for the PR5 SQL gate.
const GENDER_PRESENTATION = ["female", "male", "non_binary"];
const GENDER_DB_MAP = {
  female: "Female",
  male: "Male",
  non_binary: "Non-Binary",
};

// Derived from onboarding CastingMeasurements HAIR_OPTIONS / EYE_OPTIONS
// (canonical stored values, lowercased). "Other" is not a searchable filter.
const HAIR_COLOR = ["black", "brown", "blonde", "red", "gray", "white"];
const EYE_COLOR = ["brown", "blue", "green", "hazel", "gray", "amber"];

// Boards = booking lane slugs (src/shared/constants/booking-lanes.js).
const BOARDS = Array.from(BOOKING_LANE_SLUGS).sort();

// Markets = canonical industry slugs (market-resolve.js).
const MARKETS = Object.keys(MARKET_LABELS).sort();

const UNION = ["union", "non_union", "either"];

// LB-5 — representation/conflict status.
const REPRESENTATION_STATUS = [
  "unrepresented",
  "seeking",
  "represented",
  "exclusive_elsewhere",
];

const EXPERIENCE_LEVEL = ["new_face", "developing", "experienced", "established"];

const AVAILABILITY_KINDS = ["fitting", "shoot", "window"];

// ── Per-field policy (tier + relaxation). Keys mirror the `hard` object. ─────

const HARD_FIELDS = {
  gender_presentation: {
    tier: "client_gate",
    // Only gender/stats-track (when explicit) is applied as a SQL exclusion
    // (spec §3 step 3); it is a hard split, not a relaxable near-match.
    relaxable: "never",
    enum: GENDER_PRESENTATION,
  },
  height_cm: {
    tier: "client_gate",
    relaxable: "booker_confirm",
  },
  playing_age: {
    tier: "client_gate",
    // Legal-adjacent — spec §6 mandates 'never'. Matched by range overlap.
    relaxable: "never",
  },
  measurements: {
    tier: "client_gate",
    relaxable: "booker_confirm",
  },
  shoe: {
    tier: "client_gate",
    relaxable: "booker_confirm",
  },
  location: {
    tier: "operational",
    relaxable: "auto_with_label",
  },
  availability: {
    tier: "operational",
    relaxable: "auto_with_label",
  },
  visible_tattoos: {
    tier: "client_gate",
    relaxable: "booker_confirm",
  },
  boards: {
    tier: "client_gate",
    relaxable: "booker_confirm",
    enum: BOARDS,
  },
  hair_color: {
    tier: "client_gate",
    relaxable: "booker_confirm",
    enum: HAIR_COLOR,
  },
  eye_color: {
    tier: "client_gate",
    relaxable: "booker_confirm",
    enum: EYE_COLOR,
  },
  union: {
    tier: "operational",
    relaxable: "auto_with_label",
    enum: UNION,
  },
  representation_status: {
    tier: "client_gate",
    relaxable: "booker_confirm",
    enum: REPRESENTATION_STATUS,
  },
  credentials: {
    tier: "client_gate",
    // Credential asks are honesty gates (spec §4 / LB-6): honest zero when the
    // pool has no falsifiable data, never a semantic look-alike; never relaxed.
    relaxable: "never",
  },
  experience_level: {
    tier: "operational",
    relaxable: "auto_with_label",
    enum: EXPERIENCE_LEVEL,
  },
};

const HARD_FIELD_NAMES = Object.keys(HARD_FIELDS);

// ── Protected-class vocabulary — NEVER a filter or boost (spec §2 / §5) ──────
// If the model places any of these anywhere in `hard` or `soft_query`, the
// term is moved to `set_aside` with reason "not_used_for_filtering".
const PROTECTED_CLASS_TERMS = [
  // ethnicity / heritage
  "black",
  "african",
  "afro",
  "caribbean",
  "white",
  "caucasian",
  "european ethnicity",
  "asian",
  "east asian",
  "south asian",
  "southeast asian",
  "latino",
  "latina",
  "hispanic",
  "latin",
  "middle eastern",
  "arab",
  "persian",
  "indian",
  "mixed race",
  "multiracial",
  "biracial",
  "ethnicity",
  "ethnic",
  "heritage",
  "race",
  "nationality",
  // skin tone
  "skin tone",
  "skin-tone",
  "dark-skinned",
  "dark skinned",
  "light-skinned",
  "light skinned",
  "fair-skinned",
  "fair skinned",
  "olive skin",
  "complexion",
  "melanin",
];

// Words that legitimately collide with protected terms but describe hair/eye
// color, not heritage — do not set aside "black hair" or "blonde".
const PROTECTED_TERM_SAFE_CONTEXT = /\b(hair|eyes?|eyed|brows?|lashes)\b/;

function tierFor(field) {
  return HARD_FIELDS[field] ? HARD_FIELDS[field].tier : null;
}

function relaxabilityFor(field) {
  return HARD_FIELDS[field] ? HARD_FIELDS[field].relaxable : null;
}

function enumFor(field) {
  return HARD_FIELDS[field] ? HARD_FIELDS[field].enum || null : null;
}

function isKnownHardField(field) {
  return Object.prototype.hasOwnProperty.call(HARD_FIELDS, field);
}

/** Whether a value belongs to a field's closed enum (case-insensitive). */
function isAllowedEnumValue(field, value) {
  const list = enumFor(field);
  if (!list) return true; // field has no enum constraint
  if (value === null || value === undefined) return false;
  return list.includes(String(value).toLowerCase());
}

module.exports = {
  CONSTRAINT_OPS,
  SIZE_REGIONS,
  SHOE_REGIONS,
  GENDER_PRESENTATION,
  GENDER_DB_MAP,
  HAIR_COLOR,
  EYE_COLOR,
  BOARDS,
  MARKETS,
  UNION,
  REPRESENTATION_STATUS,
  EXPERIENCE_LEVEL,
  AVAILABILITY_KINDS,
  HARD_FIELDS,
  HARD_FIELD_NAMES,
  PROTECTED_CLASS_TERMS,
  PROTECTED_TERM_SAFE_CONTEXT,
  tierFor,
  relaxabilityFor,
  enumFor,
  isKnownHardField,
  isAllowedEnumValue,
};
