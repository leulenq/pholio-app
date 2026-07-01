"use strict";

/**
 * Canonical audience-DTO layer (audit findings P0-2 / P0-3).
 *
 * OWASP API3:2023 — Broken Object Property Level Authorization. Public and
 * agency consumers currently `SELECT profiles.*` and spread raw DB rows to
 * audiences that must never receive DOB, phone, guardian/emergency contacts,
 * source-agency state, AI analysis/inferred traits, or internal workflow fields.
 *
 * This module is the single place that decides, per audience, exactly which
 * properties leave the server. Every DTO is a STATIC ALLOWLIST (an explicit list
 * of keys) — never a row spread and never a denylist. This is the central
 * security property: adding a new sensitive column to `profiles` cannot
 * auto-leak it, because a new column is absent from every allowlist until a
 * human adds it on purpose.
 *
 * Pure functions only. No DB calls. Each takes an already-loaded
 * profile/image/user object and returns a shaped plain object. Never throws on a
 * sparse/null input.
 *
 * Age is ALWAYS derived from DOB via talent-age.js. A stored `profiles.age`
 * column must never be read.
 *
 * The named-submission audience deliberately reuses
 * `buildSubmissionProfileSnapshot` (submission-profile.js) rather than
 * duplicating that minor-safe snapshot logic.
 */

const {
  computeAge,
  isMinorProfile,
  minorPublicExposureAllowed,
} = require("./talent-age");
const {
  buildSubmissionProfileSnapshot,
  normalizeStringList,
} = require("./submission-profile");
const { PROFILE_AI_COLUMNS } = require("./data-export");

// ---------------------------------------------------------------------------
// Audience identifiers
// ---------------------------------------------------------------------------

const AUDIENCE = Object.freeze({
  PUBLIC: "public",
  AGENCY_DISCOVERY: "agency_discovery",
  AGENCY_SUBMISSION: "agency_submission",
  CONFIRMED_JOB: "confirmed_job",
  OWNER: "owner",
});

// ---------------------------------------------------------------------------
// Field allowlists (exported so contract tests + reader agents reference them)
// ---------------------------------------------------------------------------

/**
 * UNAUTHENTICATED public card. The tightest allowlist: display identity, a
 * broad base location, the slug, and nothing else. No age, no DOB, no
 * measurements, no contact, no social handles, no AI, no internal/workflow.
 * (audit: "Public controls are not field-granular" — default sensitive private.)
 */
const PUBLIC_CARD_FIELDS = Object.freeze([
  "id",
  "slug",
  "first_name",
  "last_name",
  // Broad base only — city/region/country, NEVER an exact address.
  "city",
]);

/**
 * Approved public image properties. `public_url`/`path` are served assets;
 * storage keys, absolute/original paths, moderation internals, and AI
 * predictions are excluded.
 */
const PUBLIC_IMAGE_FIELDS = Object.freeze([
  "id",
  "public_url",
  "path",
  "is_primary",
  "sort",
  "shot_type",
  "image_type",
]);

/**
 * Agency Discover results. Professional/casting fields + book images that
 * passed moderation. No owner email, no DOB/phone/guardian/emergency, no raw AI
 * columns, no protected traits (ethnicity/skin_tone) in generic discovery, no
 * universal weight.
 * (audit: "Keep on the professional profile" / "Make conditional by track…".)
 *
 * NOTE: social handles are NOT picked from the profile row — migration
 * 20260629160000_create_social_accounts_table moved them to `social_accounts`.
 * They are merged from `opts.social` (see SOCIAL_ACCOUNT_FIELDS) for ADULTS only.
 *
 * NOTE: `division` is derived client-side (profileDivision.js), not a stored
 * column. A caller that needs it computes and merges it after the DTO.
 */
const AGENCY_DISCOVERY_FIELDS = Object.freeze([
  "id",
  "slug",
  "first_name",
  "last_name",
  "city",
  "city_secondary",
  "nationality",
  "gender",
  "bio_curated",
  // Stats / measurements — agencies are the casting audience for these.
  "height_cm",
  "bust_cm",
  "waist_cm",
  "hips_cm",
  "inseam_cm",
  "shoe_size",
  "dress_size",
  "measurements_updated_at",
  "hair_color",
  "hair_length",
  "hair_type",
  "eye_color",
  // Professional metadata.
  "experience_level",
  "specialties",
  "specializations",
  "languages",
  "training",
  "availability_travel",
  "seeking_representation",
  "union_membership",
  "playing_age_min",
  "playing_age_max",
]);

/**
 * Shaped, allowlisted subset of a `social_accounts` row. Only the
 * agency/public-safe presentation fields — never raw OAuth tokens, encrypted
 * secrets, follower-count metrics, or provider account ids.
 *
 * TODO(social-wave / 2D): wire the actual `social_accounts` join in the reader
 * routes and pass the rows as `opts.social`. This DTO only safely shapes
 * whatever it is handed today.
 */
const SOCIAL_ACCOUNT_FIELDS = Object.freeze([
  "platform",
  "handle",
  "url",
  "verified",
]);

/**
 * The authenticated owner's own full editor payload. Broadest audience, but
 * still an explicit allowlist so a newly added sensitive column does not
 * auto-surface in the editor. Excludes raw AI/infra columns (embeddings,
 * vectors, search documents, scoring) and account-credential columns — those
 * are not user-editable profile fields and live in other surfaces
 * (data-export.js owns the AI export).
 */
const OWNER_FIELDS = Object.freeze([
  "id",
  "user_id",
  "slug",
  "first_name",
  "last_name",
  "pronouns",
  "gender",
  "nationality",
  "place_of_birth",
  // Owner sees their own identity/compliance data.
  "date_of_birth",
  "phone",
  "guardian_email",
  "guardian_consent_at",
  "emergency_contact_name",
  "emergency_contact_phone",
  "emergency_contact_relationship",
  "reference_name",
  "reference_email",
  "reference_phone",
  "work_eligibility",
  "work_status",
  "work_permit_on_file",
  "passport_ready",
  "drivers_license",
  // Location.
  "city",
  "city_secondary",
  // Bio.
  "bio_curated",
  "bio_raw",
  // Stats / measurements.
  "height_cm",
  "bust_cm",
  "waist_cm",
  "hips_cm",
  "inseam_cm",
  "shoe_size",
  "dress_size",
  "weight_kg",
  "weight_lbs",
  "weight_unit",
  "measurements_updated_at",
  "hair_color",
  "hair_length",
  "hair_type",
  "eye_color",
  "skin_tone",
  "ethnicity",
  "tattoos",
  "piercings",
  "body_type",
  // Professional.
  "experience_level",
  "experience_details",
  "specialties",
  "specializations",
  "languages",
  "training",
  "achievements",
  "availability_travel",
  "availability_schedule",
  "comfort_levels",
  "seeking_representation",
  "union_membership",
  "playing_age_min",
  "playing_age_max",
  "current_agency",
  "previous_representations",
  "agency_affiliation",
  "video_reel_url",
  // Owner's own visibility toggles.
  "is_public",
  "is_discoverable",
  "visibility_mode",
]);

/**
 * Confirmed-booking context. Once a booking is confirmed, narrow operational
 * data (emergency contact, call-sheet identity) becomes available to the
 * booking agency's staff for that purpose only. Kept intentionally tiny.
 *
 * TODO(schema-wave): the audit ("Move out of the global profile",
 * lines ~428-440) wants emergency contact + minor permit/chaperone data moved
 * to a dedicated confirmed-job safety/call-sheet context with its own access,
 * purpose, and retention. Until those structures exist this DTO reads the
 * current `profiles` columns. Revisit field set when the safety context lands.
 */
const CONFIRMED_JOB_FIELDS = Object.freeze([
  "id",
  "slug",
  "first_name",
  "last_name",
  "phone",
  "emergency_contact_name",
  "emergency_contact_phone",
  "emergency_contact_relationship",
  // Minor compliance on a confirmed job.
  "guardian_email",
  "work_permit_on_file",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

/**
 * Pick an explicit allowlist of keys from a source row. Missing keys resolve to
 * `null` so the shape is stable for a sparse profile. This is the only way data
 * leaves a profile row in this module.
 *
 * @param {object} source
 * @param {readonly string[]} fields
 * @returns {Record<string, unknown>}
 */
function pickAllowed(source, fields) {
  const src = asObject(source);
  const out = {};
  for (const field of fields) {
    out[field] = src[field] ?? null;
  }
  return out;
}

/**
 * Shape an array (or single object) of `social_accounts` rows into the
 * allowlisted presentation subset. Anything that is not an array of objects
 * yields `[]`. Raw tokens / metrics / provider ids are never carried through
 * because only SOCIAL_ACCOUNT_FIELDS are picked.
 *
 * @param {object[]|object|null|undefined} social
 * @returns {Array<Record<string, unknown>>}
 */
function shapeSocialAccounts(social) {
  if (!social) return [];
  const rows = Array.isArray(social) ? social : [social];
  return rows
    .filter((row) => row && typeof row === "object")
    .map((row) => pickAllowed(row, SOCIAL_ACCOUNT_FIELDS));
}

function displayName(source) {
  const src = asObject(source);
  const name = [src.first_name, src.last_name]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  return name || null;
}

/**
 * Single source of truth for how much age each audience may see.
 *
 * - owner: exact integer age (derived from DOB), never a stored column.
 * - everyone else: a coarse band ("under_18" / "18_or_older") or null. Exact
 *   age never leaves the server for non-owner audiences (audit: "DOB to private
 *   identity/compliance with derived audience-safe age band").
 *
 * @param {object|null|undefined} profile
 * @param {string} audience - one of AUDIENCE.*
 * @returns {{ age: number|null, age_band: string|null }}
 */
function deriveAudienceAge(profile, audience) {
  const src = asObject(profile);
  const exactAge = computeAge(src.date_of_birth ?? src.dob);
  const minor = isMinorProfile(src);
  const band =
    exactAge == null ? null : minor ? "under_18" : "18_or_older";

  if (audience === AUDIENCE.OWNER) {
    return { age: exactAge, age_band: band };
  }
  // Non-owner audiences never receive an exact age.
  return { age: null, age_band: band };
}

// ---------------------------------------------------------------------------
// Audience DTOs
// ---------------------------------------------------------------------------

/**
 * Shape a single approved public image. Returns null for a falsy input.
 * @param {object|null|undefined} image
 */
function buildPublicImageDTO(image) {
  if (!image) return null;
  const dto = pickAllowed(image, PUBLIC_IMAGE_FIELDS);
  dto.url = dto.public_url || dto.path || null;
  return dto;
}

/**
 * UNAUTHENTICATED public card DTO.
 * Callers MUST have already gated the profile through
 * `minorPublicExposureAllowed` (profile-visibility.isPubliclyExposable) — a
 * minor that slips through still receives no disallowed data here, but the band
 * is the only age signal and exact age is never present.
 *
 * @param {object|null|undefined} profile
 * @param {{ image?: object|null }} [opts]
 */
function buildPublicCardDTO(profile, opts = {}) {
  const dto = pickAllowed(profile, PUBLIC_CARD_FIELDS);
  dto.display_name = displayName(profile);
  // Public never sees exact age; only the coarse band.
  dto.age_band = deriveAudienceAge(profile, AUDIENCE.PUBLIC).age_band;
  dto.image = buildPublicImageDTO(opts.image ?? null);
  return dto;
}

/**
 * Agency Discover DTO.
 * @param {object|null|undefined} profile
 * @param {{ images?: object[], owner?: object|null }} [opts]
 */
function buildAgencyDiscoveryDTO(profile, opts = {}) {
  const src = asObject(profile);
  const minor = isMinorProfile(src);
  const dto = pickAllowed(profile, AGENCY_DISCOVERY_FIELDS);
  dto.display_name = displayName(profile);
  dto.languages = normalizeStringList(src.languages);
  dto.is_minor = minor;
  // Coarse band only — never an exact age, never owner email.
  dto.age_band = deriveAudienceAge(profile, AUDIENCE.AGENCY_DISCOVERY).age_band;

  // Adult-only social accounts (joined table, passed via opts.social).
  dto.social = minor ? [] : shapeSocialAccounts(opts.social);

  const images = Array.isArray(opts.images) ? opts.images : [];
  dto.images = images.map(buildPublicImageDTO).filter(Boolean);
  return dto;
}

/**
 * Agency viewing an ACTUAL submission. An application exists, so the richer (but
 * still minor-safe) snapshot is warranted. Delegates to the canonical
 * submission snapshot — do NOT reimplement that logic here.
 *
 * @param {object|null|undefined} profile
 * @param {{ images?: object[], minor?: boolean }} [opts]
 */
function buildAgencySubmissionDTO(profile, opts = {}) {
  const snapshot = buildSubmissionProfileSnapshot(profile, opts);
  const images = Array.isArray(opts.images) ? opts.images : [];
  return {
    ...snapshot,
    images: images.map(buildPublicImageDTO).filter(Boolean),
  };
}

/**
 * The authenticated owner's own full editor payload.
 * @param {object|null|undefined} profile
 * @param {{ images?: object[] }} [opts]
 */
function buildOwnerDTO(profile, opts = {}) {
  const dto = pickAllowed(profile, OWNER_FIELDS);
  dto.display_name = displayName(profile);
  const { age, age_band } = deriveAudienceAge(profile, AUDIENCE.OWNER);
  dto.age = age;
  dto.age_band = age_band;
  dto.is_minor = isMinorProfile(asObject(profile));
  dto.social = shapeSocialAccounts(opts.social);

  if (Array.isArray(opts.images)) {
    // Owner sees their own images; reuse the public image shape (no internal
    // storage keys leak to the client even for the owner editor).
    dto.images = opts.images.map(buildPublicImageDTO).filter(Boolean);
  }
  return dto;
}

/**
 * Confirmed-booking operational context (emergency / call-sheet data).
 * @param {object|null|undefined} profile
 */
function buildConfirmedJobDTO(profile) {
  const dto = pickAllowed(profile, CONFIRMED_JOB_FIELDS);
  dto.display_name = displayName(profile);
  return dto;
}

module.exports = {
  AUDIENCE,
  // Allowlists (referenced by contract tests + reader agents).
  PUBLIC_CARD_FIELDS,
  PUBLIC_IMAGE_FIELDS,
  AGENCY_DISCOVERY_FIELDS,
  SOCIAL_ACCOUNT_FIELDS,
  OWNER_FIELDS,
  CONFIRMED_JOB_FIELDS,
  // Re-export for visibility helpers / readers.
  PROFILE_AI_COLUMNS,
  // Age policy.
  deriveAudienceAge,
  // DTO builders.
  buildPublicImageDTO,
  buildPublicCardDTO,
  buildAgencyDiscoveryDTO,
  buildAgencySubmissionDTO,
  buildOwnerDTO,
  buildConfirmedJobDTO,
  // Internal helpers exported for reuse/testing.
  pickAllowed,
  displayName,
  shapeSocialAccounts,
  minorPublicExposureAllowed,
};
