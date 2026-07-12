"use strict";

/**
 * Query-level, deny-by-default visibility helpers (audit findings P0-2 / P0-3).
 *
 * The audience-DTO layer (audience-dto.js) decides which PROPERTIES leave the
 * server. This module decides which ROWS are even allowed to load, so excluded
 * profiles/images never reach the DTO layer in the first place. Reader agents
 * apply these directly to Knex query builders.
 *
 * Two responsibilities:
 *   1. Knex query helpers (image visibility filter).
 *   2. Canonical per-audience SELECT column lists, derived from the DTO
 *      allowlists so the column set and the emitted properties cannot drift.
 *
 * Minor rule is sourced from talent-age.js (the canonical age authority): a
 * minor profile is NOT publicly exposable and NOT generically agency-
 * discoverable without named-agency guardian authorization.
 *
 * Column names below are verified against the live schema (see audit, 2026-06-30).
 */

const {
  isMinorProfile,
  minorPublicExposureAllowed,
} = require("./talent-age");
const { applyViewerVisibilityFilter } = require("./content-moderation");
const {
  AUDIENCE,
  PUBLIC_CARD_FIELDS,
  AGENCY_DISCOVERY_FIELDS,
  OWNER_FIELDS,
  CONFIRMED_JOB_FIELDS,
} = require("./audience-dto");

// ---------------------------------------------------------------------------
// Image-status visibility (real `images` columns)
// ---------------------------------------------------------------------------

// `images.status` values treated as live/visible (NULL defaults to active).
const VISIBLE_IMAGE_STATUSES = Object.freeze(["active"]);

/**
 * Apply the per-audience visibility filter to a Knex query on `images`.
 *
 * Deny-by-default. The WHERE clauses applied (all AND-ed):
 *   - moderation: `applyViewerVisibilityFilter` hides `rejected`/`review`
 *     (allows NULL/`pending`/`approved`), and is a safe no-op pre-migration.
 *   - status: `images.status` IS NULL OR IN (VISIBLE_IMAGE_STATUSES).
 *   - public audience:  `images.exclude_from_public`  IS NULL OR = false.
 *   - agency audiences: `images.exclude_from_agency`  IS NULL OR = false.
 *
 * @param {import('knex').Knex.QueryBuilder} query - a builder rooted on `images`
 * @param {string} audience - one of AUDIENCE.* (defaults to PUBLIC = strictest)
 * @param {{ column?: string, table?: string }} [opts]
 *   `column` overrides the moderation column (qualified or bare);
 *   `table` qualifies the status/exclude columns when `images` is joined/aliased.
 * @returns {import('knex').Knex.QueryBuilder} the same query (chainable)
 */
function applyImageVisibility(query, audience = AUDIENCE.PUBLIC, opts = {}) {
  const prefix = opts.table ? `${opts.table}.` : "";
  const statusCol = `${prefix}status`;
  const moderationCol = opts.column || `${prefix}moderation_status`;

  applyViewerVisibilityFilter(query, moderationCol);

  query.where(function statusVisible() {
    this.whereNull(statusCol).orWhereIn(statusCol, VISIBLE_IMAGE_STATUSES);
  });

  if (audience === AUDIENCE.PUBLIC) {
    const col = `${prefix}exclude_from_public`;
    query.where(function notExcludedFromPublic() {
      this.whereNull(col).orWhere(col, false);
    });
  } else {
    // Every authenticated agency audience honors the blanket agency exclusion.
    const col = `${prefix}exclude_from_agency`;
    query.where(function notExcludedFromAgency() {
      this.whereNull(col).orWhere(col, false);
    });
  }

  return query;
}

// ---------------------------------------------------------------------------
// Profile-level exposure rules (in-process gates; pair with SELECT lists)
// ---------------------------------------------------------------------------

function isObject(value) {
  return value && typeof value === "object";
}

/** `is_public` defaults to true when NULL (column default), like public.js. */
function isPublicFlagOn(profile) {
  const v = isObject(profile) ? profile.is_public : undefined;
  return v == null || v === true || v === 1;
}

/** `is_discoverable` must be explicitly true to surface in agency Discover. */
function isDiscoverableFlagOn(profile) {
  const v = isObject(profile) ? profile.is_discoverable : undefined;
  return v === true || v === 1;
}

/**
 * May this profile appear on UNAUTHENTICATED public surfaces?
 * Fail-closed on age (minorPublicExposureAllowed denies missing/unparseable DOB
 * and consent-less minors) AND the profile's own `is_public` toggle.
 *
 * @param {object|null|undefined} profile
 * @returns {boolean}
 */
function isPubliclyExposable(profile) {
  if (!isObject(profile)) return false;
  if (!isPublicFlagOn(profile)) return false;
  return minorPublicExposureAllowed(profile);
}

/**
 * May this profile appear in an agency's GENERIC Discover results?
 * Requires `is_discoverable`, must not be a minor (generic discovery has no
 * named-agency guardian authorization — minors are excluded here and only
 * reachable via an actual submission with consent), and must not exclude the
 * requesting agency.
 *
 * @param {object|null|undefined} profile
 * @param {{ agencyId?: string|null }} [opts]
 * @returns {boolean}
 */
function isAgencyDiscoverable(profile, opts = {}) {
  if (!isObject(profile)) return false;
  if (!isDiscoverableFlagOn(profile)) return false;
  // Minor => not generically discoverable (no named-agency guardian auth here).
  if (isMinorProfile(profile)) return false;
  if (excludesAgency(profile, opts.agencyId)) return false;
  return true;
}

/**
 * Does this profile exclude the given agency from seeing it?
 *
 * TODO(schema-wave): there is no per-agency block model on `profiles` today —
 * only the image-level blanket `images.exclude_from_agency` (enforced by
 * applyImageVisibility). This helper honors an in-memory exclusion list if a
 * caller attaches one (`excluded_agency_ids` / `blocked_agency_ids`, array or
 * JSON string) so the contract is ready when the column lands. Fail-closed:
 * when an exclusion list IS present but no agencyId is supplied, we cannot prove
 * the agency is allowed, so we treat it as excluded. With no exclusion list we
 * return false (not excluded) to avoid hiding the entire roster.
 *
 * @param {object|null|undefined} profile
 * @param {string|null|undefined} agencyId
 * @returns {boolean}
 */
function excludesAgency(profile, agencyId) {
  if (!isObject(profile)) return false;
  const raw =
    profile.excluded_agency_ids ?? profile.blocked_agency_ids ?? null;
  if (raw == null) return false;

  let list = raw;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = list.split(",");
    }
  }
  if (!Array.isArray(list) || list.length === 0) return false;

  const blocked = new Set(list.map((id) => String(id || "").trim()).filter(Boolean));
  if (blocked.size === 0) return false;
  // Exclusion list exists but caller gave no identity => fail closed.
  if (!agencyId) return true;
  return blocked.has(String(agencyId).trim());
}

// ---------------------------------------------------------------------------
// Canonical per-audience SELECT column lists (derived from DTO allowlists)
// ---------------------------------------------------------------------------

// Columns needed to GATE/derive but never emitted by the DTO. Readers must
// select them so isPubliclyExposable / deriveAudienceAge / filters work, even
// though audience-dto.js strips them from the response.
const AGE_GATING_COLUMNS = Object.freeze([
  "date_of_birth",
  "guardian_consent_at",
]);

function uniqueColumns(...lists) {
  return Object.freeze([...new Set(lists.flat())]);
}

/** Public card query: allowlist + age gating + public visibility flag. */
const PUBLIC_PROFILE_SELECT = uniqueColumns(
  PUBLIC_CARD_FIELDS,
  AGE_GATING_COLUMNS,
  ["is_public"],
);

/** Agency Discover query: allowlist + age gating + discoverability flag. */
const AGENCY_DISCOVERY_SELECT = uniqueColumns(
  AGENCY_DISCOVERY_FIELDS,
  AGE_GATING_COLUMNS,
  ["is_discoverable"],
);

/** Owner editor query: the owner allowlist (already includes DOB/consent). */
const OWNER_PROFILE_SELECT = uniqueColumns(OWNER_FIELDS, AGE_GATING_COLUMNS);

/** Confirmed-job query: allowlist + age gating (minor handling on the job). */
const CONFIRMED_JOB_SELECT = uniqueColumns(
  CONFIRMED_JOB_FIELDS,
  AGE_GATING_COLUMNS,
);

const AUDIENCE_SELECT = Object.freeze({
  [AUDIENCE.PUBLIC]: PUBLIC_PROFILE_SELECT,
  [AUDIENCE.AGENCY_DISCOVERY]: AGENCY_DISCOVERY_SELECT,
  [AUDIENCE.OWNER]: OWNER_PROFILE_SELECT,
  [AUDIENCE.CONFIRMED_JOB]: CONFIRMED_JOB_SELECT,
});

/**
 * Qualify a bare column list with a table/alias prefix for joined queries, e.g.
 * `qualifyColumns(PUBLIC_PROFILE_SELECT, "profiles")`.
 *
 * @param {readonly string[]} columns
 * @param {string} table
 * @returns {string[]}
 */
function qualifyColumns(columns, table) {
  const prefix = table ? `${table}.` : "";
  return columns.map((col) => `${prefix}${col}`);
}

/**
 * Resolve the SELECT column list for an audience (optionally qualified).
 *
 * @param {string} audience - one of AUDIENCE.*
 * @param {{ table?: string }} [opts]
 * @returns {string[]}
 */
function selectColumnsForAudience(audience, opts = {}) {
  const cols = AUDIENCE_SELECT[audience];
  if (!cols) {
    throw new Error(`Unknown audience for SELECT list: ${audience}`);
  }
  return opts.table ? qualifyColumns(cols, opts.table) : [...cols];
}

module.exports = {
  // Audience enum — re-exported so callers can pull the visibility API and
  // its audiences from one module (it is imported above from audience-dto,
  // the canonical definition). Without this re-export, the natural
  // `const { AUDIENCE } = require("./profile-visibility")` resolves to
  // undefined and `AUDIENCE.PUBLIC` throws.
  AUDIENCE,
  // Knex helpers.
  applyImageVisibility,
  VISIBLE_IMAGE_STATUSES,
  // Profile-level gates.
  isPubliclyExposable,
  isAgencyDiscoverable,
  excludesAgency,
  // SELECT lists.
  AGE_GATING_COLUMNS,
  PUBLIC_PROFILE_SELECT,
  AGENCY_DISCOVERY_SELECT,
  OWNER_PROFILE_SELECT,
  CONFIRMED_JOB_SELECT,
  AUDIENCE_SELECT,
  qualifyColumns,
  selectColumnsForAudience,
};
