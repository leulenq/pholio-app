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
 *   - location.market → src/domains/talent/services/market-resolve.js
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
const { MARKET_LABELS } = require("../../../talent/services/market-resolve");

// ── Constraint operators (shared by every numeric/age/measurement object) ────

const CONSTRAINT_OPS = ["exact", "min", "max", "between", "approx"];

// ── Region tags for sizes (US 6 ≠ UK 6 ≠ EU 6 — council contract gap) ────────

const SIZE_REGIONS = ["US", "UK", "EU", "IT", "FR"];
const SHOE_REGIONS = ["US", "EU", "UK"];

// ── Enum vocabularies (closed sets, lowercase snake canonical) ───────────────

// Contract uses lowercase presentation terms; GENDER_DB_MAP bridges to the
// canonical stored profile values (src/shared/lib/gender.js) for the PR5 SQL
// gate. These MUST match CANONICAL_GENDERS exactly — the sibling map in
// agency/lib/intent-parser.js spelled "Non-binary" while this one spelled
// "Non-Binary", and only the LOWER()-based comparisons papered over the split.
const GENDER_PRESENTATION = ["female", "male", "non_binary"];
const GENDER_DB_MAP = {
  female: "Female",
  male: "Male",
  non_binary: "Non-binary",
};

// Derived from onboarding CastingMeasurements HAIR_OPTIONS / EYE_OPTIONS
// (canonical stored values, lowercased). "Other" is not a searchable filter.
const HAIR_COLOR = ["black", "brown", "blonde", "red", "gray", "white"];
const EYE_COLOR = ["brown", "blue", "green", "hazel", "gray", "amber"];

// Boards = booking lane slugs (src/shared/constants/booking-lanes.js).
const BOARDS = Array.from(BOOKING_LANE_SLUGS).sort();

// Markets = canonical industry slugs (talent/services/market-resolve.js).
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

// Three vocabularies exist in the wild for this column (server free string,
// Discover enum, seed labels). Everything normalises through this map before a
// comparison happens, so "New face" and "new_face" are the same answer.
const EXPERIENCE_LEVEL_ALIASES = {
  new_face: "new_face",
  "new face": "new_face",
  "new faces": "new_face",
  newface: "new_face",
  "fresh face": "new_face",
  developing: "developing",
  development: "developing",
  emerging: "developing",
  experienced: "experienced",
  professional: "experienced",
  seasoned: "experienced",
  established: "established",
  signed: "established",
  veteran: "established",
};

/** Normalise any stored/asked experience value to the Discover enum, or null. */
function normalizeExperienceLevel(value) {
  if (value == null) return null;
  const key = String(value).trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
  return EXPERIENCE_LEVEL_ALIASES[key] || EXPERIENCE_LEVEL_ALIASES[key.replace(/ /g, "_")] || null;
}

// ── Heritage (self-declared, `profiles.ethnicity`) ───────────────────────────
//
// Talent choose from a 10-option picker on their own profile
// (client/src/domains/talent/pages/ProfilePage/IdentitySection.jsx). Discover
// applies it ONLY when the brief asks for it, matches it ONLY against the
// talent's own selection, and shows the talent's own label back. Nothing here
// is ever inferred from a photograph, and a blank field is `unknown`, never a
// fail (tasks/discover-audit-2026-09.md §3.1).

const HERITAGE = [
  "black_african_descent",
  "east_asian",
  "south_asian",
  "southeast_asian",
  "hispanic_latino",
  "middle_eastern",
  "native_american_first_nations",
  "pacific_islander",
  "white_caucasian",
  "mixed_heritage",
];

/** slug → the picker's own label (what the talent selected, shown verbatim). */
const HERITAGE_LABELS = {
  black_african_descent: "Black/African Descent",
  east_asian: "East Asian",
  south_asian: "South Asian",
  southeast_asian: "Southeast Asian",
  hispanic_latino: "Hispanic/Latino",
  middle_eastern: "Middle Eastern",
  native_american_first_nations: "Native American/First Nations",
  pacific_islander: "Pacific Islander",
  white_caucasian: "White/Caucasian",
  mixed_heritage: "Mixed Heritage",
};

const ASIAN_SLUGS = ["east_asian", "south_asian", "southeast_asian"];

/**
 * Brief words (and legacy stored values) → picker slugs. Both sides of a match
 * are normalised through this map, so a talent who stored the legacy
 * ["Black", "Caribbean"] still answers a "Black" ask.
 */
const HERITAGE_SYNONYMS = {
  // Black / African descent
  black: ["black_african_descent"],
  african: ["black_african_descent"],
  afro: ["black_african_descent"],
  "afro caribbean": ["black_african_descent"],
  caribbean: ["black_african_descent"],
  "african american": ["black_african_descent"],
  "african descent": ["black_african_descent"],
  "black african descent": ["black_african_descent"],
  // Asian (unqualified = the three Asian options as an OR-set)
  asian: ASIAN_SLUGS,
  "east asian": ["east_asian"],
  chinese: ["east_asian"],
  japanese: ["east_asian"],
  korean: ["east_asian"],
  "south asian": ["south_asian"],
  indian: ["south_asian"],
  pakistani: ["south_asian"],
  bangladeshi: ["south_asian"],
  "southeast asian": ["southeast_asian"],
  filipino: ["southeast_asian"],
  filipina: ["southeast_asian"],
  vietnamese: ["southeast_asian"],
  thai: ["southeast_asian"],
  // Hispanic / Latino
  latina: ["hispanic_latino"],
  latino: ["hispanic_latino"],
  latinx: ["hispanic_latino"],
  latin: ["hispanic_latino"],
  hispanic: ["hispanic_latino"],
  "hispanic latino": ["hispanic_latino"],
  // Middle Eastern
  "middle eastern": ["middle_eastern"],
  arab: ["middle_eastern"],
  arabic: ["middle_eastern"],
  persian: ["middle_eastern"],
  // Native American / First Nations
  "native american": ["native_american_first_nations"],
  "first nations": ["native_american_first_nations"],
  indigenous: ["native_american_first_nations"],
  "native american first nations": ["native_american_first_nations"],
  // Pacific Islander
  "pacific islander": ["pacific_islander"],
  polynesian: ["pacific_islander"],
  samoan: ["pacific_islander"],
  maori: ["pacific_islander"],
  // White / Caucasian
  white: ["white_caucasian"],
  caucasian: ["white_caucasian"],
  european: ["white_caucasian"],
  "white caucasian": ["white_caucasian"],
  // Mixed
  mixed: ["mixed_heritage"],
  "mixed race": ["mixed_heritage"],
  "mixed heritage": ["mixed_heritage"],
  biracial: ["mixed_heritage"],
  multiracial: ["mixed_heritage"],
};

/** Longest-first so "east asian" wins over "asian" when scanning free text. */
const HERITAGE_TERMS = Object.keys(HERITAGE_SYNONYMS).sort(
  (a, b) => b.length - a.length,
);

function heritageKey(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/**
 * One stored/asked value → the picker slugs it means. Handles picker labels
 * ("Black/African Descent"), slugs ("black_african_descent"), and legacy free
 * values ("Black", "Caribbean", "European").
 */
function heritageSlugsForValue(value) {
  const key = heritageKey(value);
  if (!key) return [];
  const normalised = key.replace(/ /g, "_");
  if (HERITAGE.includes(normalised)) return [normalised];
  return HERITAGE_SYNONYMS[key] ? [...HERITAGE_SYNONYMS[key]] : [];
}

/** A list of stored/asked values → deduped picker slugs. */
function heritageSlugsForValues(values) {
  const list = Array.isArray(values) ? values : [values];
  const out = [];
  for (const value of list) {
    for (const slug of heritageSlugsForValue(value)) {
      if (!out.includes(slug)) out.push(slug);
    }
  }
  return out;
}

/**
 * Scan free brief text for heritage words. The hair/eye guard stays: "black
 * hair" and "brown eyes" are colours, never heritage.
 */
function heritageSlugsFromText(text) {
  let haystack = ` ${String(text || "").toLowerCase()} `;
  const out = [];
  for (const term of HERITAGE_TERMS) {
    const re = new RegExp(
      `\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    );
    const match = haystack.match(re);
    if (!match) continue;
    const window = haystack.slice(
      Math.max(0, match.index - 14),
      match.index + match[0].length + 14,
    );
    // Consume the span either way so "east asian" is never re-read as "asian".
    haystack =
      haystack.slice(0, match.index) +
      " ".repeat(match[0].length) +
      haystack.slice(match.index + match[0].length);
    if (PROTECTED_TERM_SAFE_CONTEXT.test(window)) continue;
    for (const slug of HERITAGE_SYNONYMS[term]) {
      if (!out.includes(slug)) out.push(slug);
    }
  }
  return out;
}

/** Stored `profiles.ethnicity` (JSON string, array, or CSV) → raw values. */
function parseHeritageValues(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map((v) => String(v));
  const text = String(raw).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).map((v) => String(v));
    if (typeof parsed === "string" && parsed.trim()) return [parsed.trim()];
  } catch {
    // not JSON — fall through to CSV
  }
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Stored values → picker labels for display (unknown values pass through). */
function heritageLabelsForValues(values) {
  const out = [];
  for (const value of parseHeritageValues(values)) {
    const slugs = heritageSlugsForValue(value);
    const labels = slugs.length ? slugs.map((s) => HERITAGE_LABELS[s]) : [String(value).trim()];
    for (const label of labels) {
      if (label && !out.includes(label)) out.push(label);
    }
  }
  return out;
}

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
  // Self-declared heritage — a requirement only when the booker asked for it
  // (audit §3.1). Blank is `unknown`, never a fail.
  heritage: {
    tier: "client_gate",
    relaxable: "booker_confirm",
    enum: HERITAGE,
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

// ── Unsupported asks — no profile field can answer them (audit §3.1 rule 4) ──
// Skin tone / complexion is a free-text field with no picker, so there is no
// vocabulary to match honestly. A brief that asks for it gets ONE note
// ("Skin tone isn't a profile field, so it wasn't used.") and the term is kept
// out of `hard` and `soft_query`. Heritage is NOT on this list any more: talent
// declare it themselves and bookers can search it (§3.1).
const UNSUPPORTED_ASK_TERMS = [
  "skin tone",
  "skin-tone",
  "skin colour",
  "skin color",
  "dark-skinned",
  "dark skinned",
  "light-skinned",
  "light skinned",
  "fair-skinned",
  "fair skinned",
  "olive-skinned",
  "olive skinned",
  "olive skin",
  "pale skin",
  "deep skin",
  "complexion",
  "melanin",
];

// Words that legitimately collide with protected terms but describe hair/eye
// color, not heritage — do not set aside "black hair" or "blonde".
const PROTECTED_TERM_SAFE_CONTEXT = /\b(hair|eyes?|eyed|brows?|lashes)\b/;

// Sub-constraints are addressed as dotted paths ("measurements.waist_cm",
// "measurements.dress_size") — they inherit the tier/relaxability of their
// root field so grouping never sees a null tier.
function rootField(field) {
  return typeof field === "string" ? field.split(".")[0] : field;
}

function tierFor(field) {
  const root = rootField(field);
  return HARD_FIELDS[root] ? HARD_FIELDS[root].tier : null;
}

function relaxabilityFor(field) {
  const root = rootField(field);
  return HARD_FIELDS[root] ? HARD_FIELDS[root].relaxable : null;
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
  EXPERIENCE_LEVEL_ALIASES,
  normalizeExperienceLevel,
  HERITAGE,
  HERITAGE_LABELS,
  HERITAGE_SYNONYMS,
  heritageSlugsForValue,
  heritageSlugsForValues,
  heritageSlugsFromText,
  heritageLabelsForValues,
  parseHeritageValues,
  AVAILABILITY_KINDS,
  HARD_FIELDS,
  HARD_FIELD_NAMES,
  UNSUPPORTED_ASK_TERMS,
  PROTECTED_TERM_SAFE_CONTEXT,
  tierFor,
  relaxabilityFor,
  enumFor,
  isKnownHardField,
  isAllowedEnumValue,
};
