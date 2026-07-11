"use strict";

/**
 * Discover parse v2 — the roles contract as a Groq strict-mode JSON schema.
 *
 * WS4.1 (tasks/discover-search-implementation-plan.md) / spec §4
 * (tasks/discover-search-redesign.md). Shape:
 *
 *   { roles: [ { label, count, hard, soft_query } ],
 *     set_aside: [ { text, reason } ],
 *     unparsed_remainder }
 *
 * STRICT-MODE RULES (the same discipline proven in art-director.js and
 * enforced by the schema-compile test):
 *   - every property appears in `required`
 *   - `additionalProperties: false` on every object
 *   - optionality is expressed ONLY as a `null` member of a type union — there
 *     are NO optional keys and NO dynamic-key maps
 *   - `confidence` is a fixed field inside each constraint object, never a
 *     sparse/dynamic map
 *
 * Every enum vocabulary is imported from field-whitelist.js (single source of
 * truth) so the schema, the validator, and the SQL layer cannot drift.
 */

const {
  CONSTRAINT_OPS,
  SIZE_REGIONS,
  SHOE_REGIONS,
  GENDER_PRESENTATION,
  HAIR_COLOR,
  EYE_COLOR,
  BOARDS,
  MARKETS,
  UNION,
  REPRESENTATION_STATUS,
  EXPERIENCE_LEVEL,
  AVAILABILITY_KINDS,
} = require("./field-whitelist");

// ── strict-schema builders ───────────────────────────────────────────────────

/** A nullable string enum (null is a legal member so the union is closed). */
function nullableEnum(values) {
  return { type: ["string", "null"], enum: [...values, null] };
}

/** An object node with every property required + closed. */
function objectNode(properties) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  };
}

/** A nullable object node (object|null) with every property required. */
function nullableObjectNode(properties) {
  return {
    type: ["object", "null"],
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  };
}

/**
 * A numeric constraint object (height / measurement / playing-age), nullable.
 *   op   — how the number is compared (exact|min|max|between|approx)
 *   a    — primary value (min, max, exact, center for approx, low for between)
 *   b    — secondary value (high for between; null otherwise)
 *   span — the SOURCE substring the value came from (LB-4 provenance); the
 *          deterministic layer re-parses THIS, not the number.
 *   confidence — fixed field, model's confidence 0..1
 */
function constraintNode() {
  return nullableObjectNode({
    op: { type: "string", enum: CONSTRAINT_OPS },
    a: { type: ["number", "null"] },
    b: { type: ["number", "null"] },
    span: { type: ["string", "null"] },
    confidence: { type: ["number", "null"] },
  });
}

/** A region-tagged size (dress / suit). */
function sizeNode(regions) {
  return nullableObjectNode({
    value: { type: ["string", "null"] },
    region: nullableEnum(regions),
    span: { type: ["string", "null"] },
    confidence: { type: ["number", "null"] },
  });
}

// ── the `hard` object ────────────────────────────────────────────────────────

const HARD_NODE = objectNode({
  // enum set = OR semantics
  gender_presentation: {
    type: ["array", "null"],
    items: { type: "string", enum: GENDER_PRESENTATION },
  },
  height_cm: constraintNode(),
  // matched by RANGE OVERLAP vs playing_age_min/max (a=low, b=high)
  playing_age: constraintNode(),
  measurements: nullableObjectNode({
    bust_cm: constraintNode(),
    chest_cm: constraintNode(),
    waist_cm: constraintNode(),
    hips_cm: constraintNode(),
    inseam_cm: constraintNode(),
    dress_size: sizeNode(SIZE_REGIONS),
    suit_size: sizeNode(SIZE_REGIONS),
    exact: { type: ["boolean", "null"] },
  }),
  shoe: nullableObjectNode({
    size: { type: ["number", "null"] },
    region: nullableEnum(SHOE_REGIONS),
    span: { type: ["string", "null"] },
    confidence: { type: ["number", "null"] },
  }),
  location: nullableObjectNode({
    market: nullableEnum(MARKETS),
    local_only: { type: ["boolean", "null"] },
    travel_ok: { type: ["boolean", "null"] },
    span: { type: ["string", "null"] },
  }),
  // multi-window: "fittings through Jun 26, shoot Jul 9"
  availability: {
    type: ["array", "null"],
    items: objectNode({
      kind: { type: "string", enum: AVAILABILITY_KINDS },
      from: { type: ["string", "null"] },
      to: { type: ["string", "null"] },
      span: { type: ["string", "null"] },
    }),
  },
  visible_tattoos: { type: ["boolean", "null"] },
  boards: { type: ["array", "null"], items: { type: "string", enum: BOARDS } },
  // enum set = OR
  hair_color: {
    type: ["array", "null"],
    items: { type: "string", enum: HAIR_COLOR },
  },
  eye_color: {
    type: ["array", "null"],
    items: { type: "string", enum: EYE_COLOR },
  },
  union: nullableEnum(UNION),
  representation_status: {
    type: ["array", "null"],
    items: { type: "string", enum: REPRESENTATION_STATUS },
  },
  credentials: nullableObjectNode({
    tearsheets: { type: ["boolean", "null"] },
    runway_shows: { type: ["boolean", "null"] },
    fit_experience: { type: ["boolean", "null"] },
    published_work: { type: ["boolean", "null"] },
    span: { type: ["string", "null"] },
    confidence: { type: ["number", "null"] },
  }),
  experience_level: nullableEnum(EXPERIENCE_LEVEL),
});

// ── the full contract ────────────────────────────────────────────────────────

const CONTRACT_SCHEMA_ROOT = objectNode({
  roles: {
    type: "array",
    items: objectNode({
      label: { type: "string" },
      count: { type: "integer" },
      hard: HARD_NODE,
      soft_query: { type: "string" },
    }),
  },
  set_aside: {
    type: "array",
    items: objectNode({
      text: { type: "string" },
      reason: { type: "string", enum: ["not_used_for_filtering"] },
    }),
  },
  unparsed_remainder: { type: "string" },
});

// Groq response_format envelope (name + strict + schema), same shape as
// art-director.js BRIEF_SCHEMA and query-understanding UNDERSTANDING_SCHEMA.
const CONTRACT_SCHEMA = {
  name: "discover_roles_contract",
  strict: true,
  schema: CONTRACT_SCHEMA_ROOT,
};

// ── canonical empty values ───────────────────────────────────────────────────

const HARD_FIELD_NAMES = Object.keys(HARD_NODE.properties);

/** A `hard` object with every field null (all keys present — strict-legal). */
function emptyHard() {
  const hard = {};
  for (const key of HARD_FIELD_NAMES) hard[key] = null;
  return hard;
}

/** The canonical empty contract (no roles parsed). */
function emptyContract() {
  return { roles: [], set_aside: [], unparsed_remainder: "" };
}

/** A single-role scaffold with an empty hard block. */
function emptyRole(label = "role 1", soft_query = "") {
  return { label, count: 1, hard: emptyHard(), soft_query };
}

module.exports = {
  CONTRACT_SCHEMA,
  CONTRACT_SCHEMA_ROOT,
  HARD_NODE,
  HARD_FIELD_NAMES,
  emptyHard,
  emptyContract,
  emptyRole,
};
