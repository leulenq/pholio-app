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
 * Pure functions only. No DB calls, with one scoped exception:
 * `loadTalentRepresentationsForProfiles` (WS6.1 / LB-5), a batch loader kept
 * here (rather than a new `shared/lib` module) so PRs that touch
 * `talent_representations` derivation stay confined to this file. It mirrors
 * `social-accounts.js#loadSocialAccountsForProfiles` and is the only function
 * below that queries the DB — every DTO builder remains pure, taking an
 * already-loaded profile/image/representations object and returning a shaped
 * plain object. Never throws on a sparse/null input.
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
const { buildCanonicalStats } = require("./stats-formatter");
const {
  heritageLabelsForValues,
} = require("../../domains/agency/services/discover/field-whitelist");
const {
  BOOKING_LANES,
  normalizeBookingLaneList,
} = require("../constants/booking-lanes");

const BOOKING_LANE_LABELS = Object.fromEntries(
  BOOKING_LANES.map((lane) => [lane.slug, lane.label]),
);

/**
 * Booking-lane display labels for a card. Prefers the caller's `profile_booking_lanes`
 * rows (canonical since 20260624195800, priority-ordered) and falls back to the
 * legacy `modeling_categories` / `booking_lanes` columns. Never guesses a lane:
 * a talent who declared none gets an empty list.
 */
function bookingLaneLabels(lanes, profile) {
  let slugs = [];
  if (Array.isArray(lanes) && lanes.length) {
    slugs = normalizeBookingLaneList(lanes);
  } else {
    const raw = profile?.modeling_categories || profile?.booking_lanes || null;
    if (raw) {
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        slugs = normalizeBookingLaneList(parsed);
      } catch {
        slugs = [];
      }
    }
  }
  return slugs.map((slug) => BOOKING_LANE_LABELS[slug] || slug);
}
const { PROFILE_AI_COLUMNS } = require("./data-export");
// Only DB-touching import in this otherwise-pure module. See
// `loadTalentRepresentationsForProfiles` below for the scoped exception.
const knexDb = require("../db/knex");

// ---------------------------------------------------------------------------
// Audience identifiers
// ---------------------------------------------------------------------------

const AUDIENCE = Object.freeze({
  PUBLIC: "public",
  AGENCY_DISCOVERY: "agency_discovery",
  AGENCY_SUBMISSION: "agency_submission",
  CONFIRMED_JOB: "confirmed_job",
  EVENT_DESIGNER: "event_designer",
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
  // Discipline (model/performer/creator) is identity-level, non-sensitive.
  "discipline",
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
 * Image properties an AUTHENTICATED AGENCY may read on a submission it
 * received. `PUBLIC_IMAGE_FIELDS` plus the register (`style_type`), the
 * capture/upload dates a booker needs to judge whether digitals are current,
 * and the talent's own caption. Nothing else — see `buildAgencyImageDTO`.
 */
const AGENCY_IMAGE_FIELDS = Object.freeze([
  ...PUBLIC_IMAGE_FIELDS,
  "style_type",
  "captured_at",
  "created_at",
  "alt",
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
 *
 * NOTE (WS6.2 / WS6.4): `tattoos` and `piercings` are ADULT-ONLY — the raw
 * columns are in this allowlist so `pickAllowed` copies them, but
 * `buildAgencyDiscoveryDTO` nulls them out for a minor as a defense-in-depth
 * mirror of the `social` gate (minors are already excluded from generic
 * Discover pre-DTO by `isAgencyDiscoverable`, but a builder call must never
 * assume that gate ran).
 *
 * NOTE: `measured_in_person_at` was in this allowlist to render "measured in
 * person". The roster endpoint that wrote it no longer exists, so the column is
 * permanently null and the field has been dropped rather than left as a
 * property that is always absent. `measurements_updated_at` above remains, and
 * only ever renders "last updated" — self-reported, never confirmed.
 */
// NOTE (audit §3.1): `ethnicity` is deliberately NOT on this allowlist. The raw
// column is mapped to the picker's own labels and exposed as `heritage` by
// buildAgencyDiscoveryDTO, so the agency reads the talent's own selection and
// never a raw stored value.
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
  "stats_track",
  "height_cm",
  "bust_cm",
  "chest_cm",
  "waist_cm",
  "hips_cm",
  "inseam_cm",
  "shoe_size",
  "dress_size",
  "suit_size",
  "measurements_updated_at",
  "hair_color",
  "hair_length",
  "hair_type",
  "eye_color",
  // Adult-only (nulled for minors in buildAgencyDiscoveryDTO — see NOTE above).
  "tattoos",
  "piercings",
  // Professional metadata.
  "discipline",
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
 * Readers load rows via `shared/lib/social-accounts.js`
 * (`loadSocialAccountsForProfile[s]`) and pass them as `opts.social`; this
 * function only shapes what it is handed. `verified` is sourced from
 * `social_accounts.is_oauth_connected`, which production only ever sets true
 * via the Phyllo-backed callback — the mock OAuth route that fabricates it is
 * dev/staging-gated (never mounted when NODE_ENV === "production").
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
  "stats_track",
  "height_cm",
  "bust_cm",
  "chest_cm",
  "waist_cm",
  "hips_cm",
  "inseam_cm",
  "shoe_size",
  "dress_size",
  "suit_size",
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
  "discipline",
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

/**
 * EVENT DESIGNER — the tightest non-public allowlist in the module, and the
 * only one whose audience has no Pholio account at all (design §(d), R3).
 *
 * A designer holding a `/picks/:token` link is a third party the applicant was
 * told about in the event consent copy: "Designers see your name, digitals,
 * height, measurements, availability and walk video through a read-only link.
 * They cannot see your email, phone, socials or date of birth." This list is
 * the machine-readable half of that sentence, so every addition to it is a
 * change to a disclosure the applicant already agreed to — not a UI tweak.
 *
 * Deliberately ABSENT, each for a reason:
 *   - `id` / `slug`      — a slug is the public portfolio URL; the designer
 *                          keys off `application_id` instead, which addresses
 *                          nothing outside the pick list.
 *   - `first_name` /     — sources for `display_name` only. They are read by
 *     `last_name`          the builder but never emitted raw, so the org's
 *                          name-display setting cannot be undone client-side.
 *   - DOB / age / band   — no age signal of any kind. The call is 18+ (R8) and
 *                          `applyMinorSubmissionFilter` keeps minors out of the
 *                          query; the DTO carries no age even if one slipped by.
 *   - weight             — casting for a runway show is a measurements
 *                          question. `buildCanonicalStats` is fed the picked
 *                          subset below precisely so weight cannot appear in
 *                          the rendered stat lines either.
 *   - city / nationality — location is organizer logistics, not a design pick.
 *   - hair / eye color   — outside the disclosed list. Add only by amending the
 *                          consent copy first.
 *   - contact, social, comp card, bio, representation, workflow — never.
 */
const EVENT_DESIGNER_FIELDS = Object.freeze([
  "stats_track",
  "height_cm",
  "bust_cm",
  "chest_cm",
  "waist_cm",
  "hips_cm",
  "inseam_cm",
  "shoe_size",
  "dress_size",
  "suit_size",
]);

/** Name-display modes for `buildEventDesignerDTO`. */
const EVENT_DESIGNER_NAME_DISPLAY = Object.freeze({
  FULL: "full",
  FIRST_INITIAL: "first_initial",
});

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

// ---------------------------------------------------------------------------
// Representation status (WS6.1 / LB-5)
// ---------------------------------------------------------------------------
//
// `talent_representations` (migration 20260629234500) already existed and
// never reached Discover — the launch agency could not distinguish
// "unrepresented, ours to develop" from "exclusive with another mother
// agent" (council review LB-5). The functions below derive a
// `representation_status` for the agency-discovery DTO from batch-loaded
// representation rows, with a legacy fallback onto the free-text
// `profiles.current_agency` column for profiles that predate (or bypass) the
// structured table.

// `talent_representations.status` check constraint is `active` | `ended`.
// Treat a row with a missing/unrecognized status defensively as active
// rather than silently dropping it from consideration.
function isActiveRepresentationRow(row) {
  return Boolean(row) && (row.status == null || row.status === "active");
}

function isDisclosedRepresentationRow(row) {
  return (
    row &&
    (row.disclose_agency_name === true || row.disclose_agency_name === 1)
  );
}

function isExclusiveRepresentationRow(row) {
  return row && (row.is_exclusive === true || row.is_exclusive === 1);
}

/**
 * Pure derivation of the agency-facing representation status. Never touches
 * the DB — callers batch-load `representations` via
 * `loadTalentRepresentationsForProfiles` and pass the rows in.
 *
 * Precedence: exclusive-elsewhere > represented > legacy-fallback > seeking >
 * unrepresented. Naming the agency (`represented_by`) requires the talent's
 * `disclose_agency_name` opt-in on the specific row (default false /
 * "undisclosed" — LB-5's required default).
 *
 * @param {object|null|undefined} profile
 * @param {Array<object>|null|undefined} representations - rows shaped like
 *   `talent_representations` (+ joined `agency_name`), any status.
 * @returns {{ representation_status: string, represented_by: string|null }}
 */
function deriveRepresentationStatus(profile, representations) {
  const src = asObject(profile);
  const reps = Array.isArray(representations) ? representations : [];
  const activeReps = reps.filter(isActiveRepresentationRow);

  if (activeReps.some(isExclusiveRepresentationRow)) {
    return { representation_status: "exclusive_elsewhere", represented_by: null };
  }

  if (activeReps.length > 0) {
    const disclosed = activeReps.find(isDisclosedRepresentationRow);
    const name = disclosed
      ? disclosed.external_agency_name || disclosed.agency_name || null
      : null;
    return {
      representation_status: "represented",
      represented_by: name || "undisclosed",
    };
  }

  // Legacy fallback: no talent_representations rows at all for this profile
  // (not merely none active) but the legacy free-text column is populated.
  // There is no live write-path syncing `current_agency` edits into
  // talent_representations after the one-time backfill migration, so this
  // keeps older/not-yet-migrated profiles honest without a second data model.
  if (reps.length === 0 && String(src.current_agency || "").trim()) {
    return { representation_status: "represented", represented_by: "undisclosed" };
  }

  if (src.seeking_representation) {
    return { representation_status: "seeking", represented_by: null };
  }

  return { representation_status: "unrepresented", represented_by: null };
}

// Column-existence cache for deploy-before-migrate safety, mirroring
// content-moderation.js's `ensureModerationColumnChecked`. Keyed by `db`
// instance (a WeakMap, not a single flag) so tests that spin up multiple
// ephemeral knex connections — or a future multi-tenant db pool — never
// share a stale answer across connections.
const _discloseColumnCacheByDb = new WeakMap();

/**
 * Warm (and memoize per-db) whether
 * `talent_representations.disclose_agency_name` exists yet, so
 * `loadTalentRepresentationsForProfiles` degrades to "undisclosed" instead of
 * erroring during a deploy-before-migrate window.
 *
 * @param {import('knex').Knex} [db]
 * @returns {Promise<boolean>}
 */
async function ensureRepresentationDiscloseColumnChecked(db = knexDb) {
  if (!_discloseColumnCacheByDb.has(db)) {
    const hasTable = await db.schema.hasTable("talent_representations");
    const hasColumn = hasTable
      ? await db.schema.hasColumn(
          "talent_representations",
          "disclose_agency_name",
        )
      : false;
    _discloseColumnCacheByDb.set(db, hasColumn);
  }
  return _discloseColumnCacheByDb.get(db);
}

/**
 * Batch-load `talent_representations` (+ joined `agencies.name`) for many
 * profiles in a single query — mirrors
 * `social-accounts.js#loadSocialAccountsForProfiles` so Discover result pages
 * never N+1 per profile. Returns ALL rows regardless of status; callers
 * (namely `deriveRepresentationStatus`) decide what "active" means.
 *
 * Safe no-op (empty Map) if the table doesn't exist yet.
 *
 * @param {Array<string>} profileIds
 * @param {{ db?: import('knex').Knex }} [opts]
 * @returns {Promise<Map<string, Array<Record<string, unknown>>>>} profile_id -> rows
 */
async function loadTalentRepresentationsForProfiles(profileIds, opts = {}) {
  const db = opts.db || knexDb;
  const ids = [...new Set((profileIds || []).filter(Boolean))];
  const byProfile = new Map();
  if (ids.length === 0) return byProfile;

  const hasTable = await db.schema.hasTable("talent_representations");
  if (!hasTable) return byProfile;

  const hasDiscloseColumn = await ensureRepresentationDiscloseColumnChecked(db);
  const columns = [
    "tr.profile_id",
    "tr.agency_id",
    "tr.external_agency_name",
    "tr.relationship_type",
    "tr.is_exclusive",
    "tr.status",
    "a.name as agency_name",
  ];
  if (hasDiscloseColumn) columns.push("tr.disclose_agency_name");

  const rows = await db("talent_representations as tr")
    .leftJoin("agencies as a", "a.id", "tr.agency_id")
    .whereIn("tr.profile_id", ids)
    .select(columns);

  for (const row of rows) {
    const shaped = hasDiscloseColumn
      ? row
      : { ...row, disclose_agency_name: false };
    if (!byProfile.has(row.profile_id)) byProfile.set(row.profile_id, []);
    byProfile.get(row.profile_id).push(shaped);
  }
  return byProfile;
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
 * Shape a single image for an authenticated agency reading a submission it
 * received. Strictly `PUBLIC_IMAGE_FIELDS` plus four presentation/recency
 * fields an agency legitimately needs and the public never does:
 *
 *   - `style_type`  — editorial / commercial / lifestyle register of a book
 *                     frame; the Book-range read is meaningless without it.
 *   - `captured_at` — when the frame was SHOT. The industry rule is that
 *                     digitals must be current (≤3 months); an agency that
 *                     cannot see the capture date cannot judge the package.
 *   - `created_at`  — upload date, the honest fallback when `captured_at` is
 *                     absent.
 *   - `alt`         — the talent's own caption, present on frozen submission
 *                     package frames (see application-submission-package.js);
 *                     null for a live `images` row, which has no such column.
 *
 * Deliberately still an allowlist, not a spread: storage keys, moderation
 * internals, AI predictions, and embeddings never leave through here.
 *
 * @param {object|null|undefined} image
 */
function buildAgencyImageDTO(image) {
  if (!image) return null;
  const dto = pickAllowed(image, AGENCY_IMAGE_FIELDS);
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
 * @param {{ images?: object[], owner?: object|null, social?: object[]|null,
 *   representations?: object[]|null, lanes?: string[]|null }} [opts]
 *   `representations` is batch-loaded per result set via
 *   `loadTalentRepresentationsForProfiles` and passed in per-profile — this
 *   builder stays a pure function and never queries the DB itself.
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

  // Adult-only visible-when-dressed data (WS6.2) — mirror the social gate
  // above; never surfaced for a minor even if the raw columns are non-null.
  if (minor) {
    dto.tattoos = null;
    dto.piercings = null;
  }

  // Self-declared heritage (`profiles.ethnicity`, a picker multi-select). The
  // raw column never leaves this builder: it is mapped to the picker's own
  // labels, so an agency only ever reads what the talent selected
  // (tasks/discover-audit-2026-09.md §3.1). Blank stays null, never inferred.
  const heritage = heritageLabelsForValues(src.ethnicity);
  dto.heritage = heritage.length ? heritage : null;

  // The talent's declared booking lanes, as labels. Empty when they declared
  // none: the card shows nothing rather than defaulting to a board.
  dto.lanes = bookingLaneLabels(opts.lanes, src);

  const repStatus = deriveRepresentationStatus(src, opts.representations);
  dto.representation_status = repStatus.representation_status;
  dto.represented_by = repStatus.represented_by;

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

/**
 * Render the applicant's name at the organizer's chosen granularity.
 * `first_initial` yields "Ada L." — enough for a designer to talk about
 * someone in a fitting without publishing a full identity to a forwarded link.
 */
function eventDesignerDisplayName(source, mode) {
  const src = asObject(source);
  const first = String(src.first_name || "").trim();
  const last = String(src.last_name || "").trim();

  if (mode === EVENT_DESIGNER_NAME_DISPLAY.FIRST_INITIAL) {
    const initial = last ? `${last[0].toUpperCase()}.` : "";
    return [first, initial].filter(Boolean).join(" ") || null;
  }
  return [first, last].filter(Boolean).join(" ") || null;
}

/**
 * Designer reading a pick list over a token link.
 *
 * Takes the FROZEN submission snapshot (`talent_submission_packages.payload`
 * via `loadApplicationSubmissionPackages`), never a live `profiles` row: what a
 * designer sees is what the applicant submitted to this call, and a later
 * profile edit must not silently rewrite it.
 *
 * `stats` is rebuilt from the picked subset rather than passed through from the
 * snapshot, because the snapshot's own canonical stats carry weight and
 * hair/eye color. Feeding the allowlist through the formatter means the
 * rendered lines can only ever contain allowlisted values.
 *
 * @param {object|null|undefined} profileSnapshot
 * @param {{ images?: object[], availability?: object|null,
 *   walkVideoUrl?: string|null, nameDisplay?: string }} [opts]
 */
function buildEventDesignerDTO(profileSnapshot, opts = {}) {
  const dto = pickAllowed(profileSnapshot, EVENT_DESIGNER_FIELDS);
  dto.display_name = eventDesignerDisplayName(profileSnapshot, opts.nameDisplay);
  // Formatter input is the allowlist itself — weight and colouring are absent
  // from `dto`, so they are absent from the rendered stat lines by construction.
  dto.stats = buildCanonicalStats(dto);

  const images = Array.isArray(opts.images) ? opts.images : [];
  dto.images = images.map(buildPublicImageDTO).filter(Boolean);

  const availability = asObject(opts.availability);
  dto.availability =
    availability.from || availability.to || availability.note
      ? {
          from: availability.from || null,
          to: availability.to || null,
          note:
            typeof availability.note === "string"
              ? availability.note.trim().slice(0, 300) || null
              : null,
        }
      : null;

  dto.walk_video_url =
    typeof opts.walkVideoUrl === "string" && opts.walkVideoUrl.trim()
      ? opts.walkVideoUrl.trim()
      : null;

  return dto;
}

module.exports = {
  AUDIENCE,
  // Allowlists (referenced by contract tests + reader agents).
  PUBLIC_CARD_FIELDS,
  PUBLIC_IMAGE_FIELDS,
  AGENCY_IMAGE_FIELDS,
  AGENCY_DISCOVERY_FIELDS,
  SOCIAL_ACCOUNT_FIELDS,
  OWNER_FIELDS,
  CONFIRMED_JOB_FIELDS,
  EVENT_DESIGNER_FIELDS,
  EVENT_DESIGNER_NAME_DISPLAY,
  // Re-export for visibility helpers / readers.
  PROFILE_AI_COLUMNS,
  // Age policy.
  deriveAudienceAge,
  // Representation status (WS6.1 / LB-5).
  deriveRepresentationStatus,
  loadTalentRepresentationsForProfiles,
  ensureRepresentationDiscloseColumnChecked,
  // DTO builders.
  buildPublicImageDTO,
  buildAgencyImageDTO,
  buildPublicCardDTO,
  buildAgencyDiscoveryDTO,
  buildAgencySubmissionDTO,
  buildOwnerDTO,
  buildConfirmedJobDTO,
  buildEventDesignerDTO,
  // Internal helpers exported for reuse/testing.
  pickAllowed,
  displayName,
  eventDesignerDisplayName,
  shapeSocialAccounts,
  minorPublicExposureAllowed,
};
