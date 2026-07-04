"use strict";

/**
 * Per-field audience visibility (Wave 2B/2C consolidation).
 *
 * Canonical read/write layer over `profile_field_visibility`
 * (migrations/20260701100200_create_profile_field_visibility.js). Every reader
 * that needs to answer "is field group X exposed to audience Y for this
 * profile?" — and every writer that lets a talent opt a field group into a
 * wider audience — goes through THIS module, so the seeded defaults, the
 * writable-pair allowlist, and the minor/guardian-consent gate can never drift
 * between call sites (audit: "public stats opt-in" must be enforced
 * server-side, not just seeded).
 *
 * `visible = false` means "not exposed to this audience by default"; this
 * module answers exposure only — audience-appropriate FORM (e.g. DOB shown
 * only as an age band) stays a DTO concern (see audience-dto.js).
 */

const { v4: uuidv4 } = require("uuid");
const knex = require("../db/knex");
const { isMinorProfile, hasGuardianConsent } = require("./talent-age");

const TABLE = "profile_field_visibility";

// ---------------------------------------------------------------------------
// Canonical taxonomy — MUST mirror the Wave-2B migration seed exactly.
// ---------------------------------------------------------------------------

const AUDIENCES = Object.freeze([
  "private",
  "public",
  "agency_discovery",
  "named_submission",
  "represented_roster",
  "confirmed_job",
]);

const FIELD_GROUPS = Object.freeze([
  "identity",
  "stats",
  "performer_credits",
  "creator_metrics",
  "dob",
  "compliance",
  "emergency_references",
  "adult_content",
  "protected_traits",
]);

/**
 * Seeded defaults (design section C / migration DEFAULT_MATRIX). Flags are in
 * AUDIENCES order: [private, public, agency_discovery, named_submission,
 * represented_roster, confirmed_job].
 */
const DEFAULT_MATRIX = Object.freeze({
  identity: Object.freeze([true, true, true, true, true, true]),
  stats: Object.freeze([true, false, true, true, true, true]),
  performer_credits: Object.freeze([true, true, true, true, true, true]),
  creator_metrics: Object.freeze([true, false, true, true, true, true]),
  dob: Object.freeze([true, false, false, false, true, true]),
  compliance: Object.freeze([true, false, false, false, true, true]),
  emergency_references: Object.freeze([true, false, false, false, false, true]),
  adult_content: Object.freeze([true, false, false, false, false, false]),
  protected_traits: Object.freeze([true, false, false, false, false, false]),
});

const SENSITIVE_FIELD_GROUPS = Object.freeze([
  "dob",
  "compliance",
  "emergency_references",
  "adult_content",
  "protected_traits",
]);

/**
 * (field_key, audience) pairs a talent may toggle through the write API. This
 * is intentionally narrow: identity/performer_credits are already always-on
 * and sensitive groups (SENSITIVE_FIELD_GROUPS) may NEVER be widened beyond
 * their seeded defaults, so the only writable surface today is the
 * "public stats opt-in" the product asked for — stats & creator_metrics into
 * the public audience. Adding a new writable pair is a deliberate, reviewed
 * change to this map, never an inferred one.
 */
const WRITABLE_FIELD_AUDIENCE_PAIRS = Object.freeze({
  stats: Object.freeze(["public"]),
  creator_metrics: Object.freeze(["public"]),
});

function isWritablePair(fieldKey, audience) {
  const audiences = WRITABLE_FIELD_AUDIENCE_PAIRS[fieldKey];
  return Array.isArray(audiences) && audiences.includes(audience);
}

/**
 * Fresh deep copy of the seeded default matrix, expanded into map form:
 * `{ [field_key]: { [audience]: boolean } }`.
 * @returns {Record<string, Record<string, boolean>>}
 */
function defaultVisibilityMap() {
  const map = {};
  for (const fieldKey of FIELD_GROUPS) {
    const flags = DEFAULT_MATRIX[fieldKey];
    map[fieldKey] = {};
    AUDIENCES.forEach((audience, i) => {
      map[fieldKey][audience] = flags[i];
    });
  }
  return map;
}

/**
 * Load a profile's field-visibility map, merged over the seeded defaults.
 *
 * Fail-closed: any error (table absent on a deploy-before-migrate, connection
 * failure, unknown profile) falls back to the Wave-2B seeded defaults — never
 * an all-true / open map. Unknown `field_key`/`audience` values found in the
 * table (e.g. a future migration renamed a group) are ignored rather than
 * trusted.
 *
 * @param {string} profileId
 * @param {{ knex?: import("knex").Knex }} [opts]
 * @returns {Promise<Record<string, Record<string, boolean>>>}
 */
async function loadFieldVisibility(profileId, opts = {}) {
  const knexClient = opts.knex || knex;
  const map = defaultVisibilityMap();
  if (!profileId) return map;

  try {
    const hasTable = await knexClient.schema.hasTable(TABLE);
    if (!hasTable) return map;

    const rows = await knexClient(TABLE)
      .where({ profile_id: profileId })
      .select("field_key", "audience", "visible");

    for (const row of rows) {
      if (!map[row.field_key]) continue;
      if (!AUDIENCES.includes(row.audience)) continue;
      map[row.field_key][row.audience] = Boolean(row.visible);
    }
    return map;
  } catch {
    // Fail closed to defaults on any DB error.
    return defaultVisibilityMap();
  }
}

/**
 * @param {Record<string, Record<string, boolean>>|null|undefined} map
 * @param {string} fieldKey
 * @param {string} audience
 * @returns {boolean}
 */
function isFieldGroupVisible(map, fieldKey, audience) {
  return Boolean(map && map[fieldKey] && map[fieldKey][audience]);
}

// ---------------------------------------------------------------------------
// Write path — validation + upsert.
// ---------------------------------------------------------------------------

class FieldVisibilityError extends Error {
  constructor(message, { status = 400, code = "INVALID_FIELD_VISIBILITY_UPDATE" } = {}) {
    super(message);
    this.name = "FieldVisibilityError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Validate a single `{ field_key, audience, visible }` update. Throws
 * `FieldVisibilityError` (never silently drops) on any rule violation:
 *   - unknown field_key / audience → 400
 *   - visible not boolean → 400
 *   - (field_key, audience) not on the writable allowlist → 403 (this is the
 *     invariant that keeps sensitive groups fixed and locks non-opt-in pairs)
 *   - widening a MINOR profile's exposure without recorded guardian consent
 *     → 403, regardless of which writable field is being widened
 *
 * @param {{ field_key?: unknown, audience?: unknown, visible?: unknown }} update
 * @param {{ profile?: object|null }} [ctx]
 * @returns {{ field_key: string, audience: string, visible: boolean }}
 */
function validateFieldVisibilityUpdate(update, ctx = {}) {
  const fieldKey = update && update.field_key;
  const audience = update && update.audience;
  const visible = update && update.visible;

  if (typeof fieldKey !== "string" || !FIELD_GROUPS.includes(fieldKey)) {
    throw new FieldVisibilityError(`Unknown field_key: ${String(fieldKey)}`, {
      status: 400,
      code: "UNKNOWN_FIELD_KEY",
    });
  }

  if (typeof audience !== "string" || !AUDIENCES.includes(audience)) {
    throw new FieldVisibilityError(`Unknown audience: ${String(audience)}`, {
      status: 400,
      code: "UNKNOWN_AUDIENCE",
    });
  }

  if (typeof visible !== "boolean") {
    throw new FieldVisibilityError("`visible` must be a boolean", {
      status: 400,
      code: "INVALID_VISIBLE_VALUE",
    });
  }

  if (!isWritablePair(fieldKey, audience)) {
    const reason = SENSITIVE_FIELD_GROUPS.includes(fieldKey)
      ? "sensitive field groups can never be exposed beyond their fixed audiences"
      : "this field/audience pair is not opt-in";
    throw new FieldVisibilityError(
      `${fieldKey}/${audience} cannot be modified (${reason}).`,
      { status: 403, code: "FIELD_VISIBILITY_LOCKED" },
    );
  }

  if (visible === true && isMinorProfile(ctx.profile) && !hasGuardianConsent(ctx.profile)) {
    throw new FieldVisibilityError(
      "A minor profile cannot widen field visibility without recorded guardian consent.",
      { status: 403, code: "GUARDIAN_CONSENT_REQUIRED" },
    );
  }

  return { field_key: fieldKey, audience, visible };
}

/**
 * Validate and upsert a batch of visibility updates for a profile. All-or-
 * nothing: the full batch is validated before any write, so a single invalid
 * entry rejects the whole request rather than silently applying a partial
 * update.
 *
 * @param {string} profileId
 * @param {Array<{ field_key: string, audience: string, visible: boolean }>} updates
 * @param {{ profile?: object|null, knex?: import("knex").Knex }} [opts]
 * @returns {Promise<Record<string, Record<string, boolean>>>} the resulting merged map
 */
async function applyFieldVisibilityUpdates(profileId, updates, opts = {}) {
  const knexClient = opts.knex || knex;

  if (!profileId) {
    throw new FieldVisibilityError("profileId is required", {
      status: 400,
      code: "MISSING_PROFILE_ID",
    });
  }
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new FieldVisibilityError(
      "Provide `updates` as a non-empty array of { field_key, audience, visible }.",
      { status: 400, code: "EMPTY_UPDATE" },
    );
  }

  const validated = updates.map((update) =>
    validateFieldVisibilityUpdate(update, { profile: opts.profile }),
  );

  const hasTable = await knexClient.schema.hasTable(TABLE);
  if (!hasTable) {
    throw new FieldVisibilityError(
      "Field visibility is not available yet on this deployment.",
      { status: 503, code: "TABLE_NOT_READY" },
    );
  }

  await knexClient.transaction(async (trx) => {
    for (const update of validated) {
      await trx(TABLE)
        .insert({
          id: uuidv4(),
          profile_id: profileId,
          field_key: update.field_key,
          audience: update.audience,
          visible: update.visible,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        })
        .onConflict(["profile_id", "field_key", "audience"])
        .merge(["visible", "updated_at"]);
    }
  });

  return loadFieldVisibility(profileId, { knex: knexClient });
}

module.exports = {
  AUDIENCES,
  FIELD_GROUPS,
  DEFAULT_MATRIX,
  SENSITIVE_FIELD_GROUPS,
  WRITABLE_FIELD_AUDIENCE_PAIRS,
  FieldVisibilityError,
  isWritablePair,
  defaultVisibilityMap,
  loadFieldVisibility,
  isFieldGroupVisible,
  validateFieldVisibilityUpdate,
  applyFieldVisibilityUpdates,
};
