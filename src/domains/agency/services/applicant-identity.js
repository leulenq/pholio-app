"use strict";

/**
 * THE resolver — one shape for an applicant, two possible sources.
 *
 * `docs/open-call-applicant-flow-design-2026-08.md` §4 ("Containing the
 * `profile_id` change"). Since `20260819120000` an `applications` row may carry
 * `applicant_identity_id` and **no** `profile_id`: the anonymous open-call
 * applicant of identity-ladder state 2 (submitted, unclaimed — no `users` row,
 * no `profiles` row). Every organizer read path that inner-joins `profiles`
 * therefore silently *drops* those applicants, which is the failure mode §6
 * requirement 1 exists to prevent:
 *
 *   > Every organizer surface must include unclaimed applicants. Guaranteed by
 *   > §4's resolver and its enforcement test, not by review.
 *
 * Two sources, one DTO:
 *
 *   - **profile-backed** → the live `profiles` row (+ `users` for email and
 *     verification, `social_accounts` for Instagram), exactly as today. Field
 *     choices are the ones `inbox.js` already makes for its talent DTO —
 *     `SUBMISSION_PROFILE_SOURCE_FIELDS` via `AUDIENCE.AGENCY_SUBMISSION`, and
 *     the account email off `users`, never `profiles.*`.
 *   - **identity-backed** → `applicant_identities` plus the LATEST
 *     `talent_submission_packages` row for the application. The design's
 *     reasoning: "an unclaimed application's identity is *by definition*
 *     frozen — the applicant cannot edit it without claiming — so the snapshot
 *     is not a workaround, it is the correct home."
 *
 * BATCHED BY CONTRACT. One query per source table for the whole page — an N+1
 * here would be paid 2,000 times on an event pool at ruling R7's ceiling.
 *
 * DEFENSIVE BY CONTRACT, in two directions:
 *
 *   1. `payload.identity` is written by the submit lane and may be absent on
 *      rows written before it landed. A missing snapshot falls back to the
 *      identity's email with nulls elsewhere; it never throws.
 *   2. Several existing agency suites hand-build a partial schema with no
 *      `applicant_identities` table and no `applications.applicant_identity_id`
 *      column. Every identity read is gated on `hasApplicantIdentitySupport`,
 *      so a caller on such a schema resolves the profile branch and nothing
 *      else rather than erroring.
 *
 * NO BADGES. `isClaimed` / `isEmailVerified` / `isDisowned` and
 * `materialsStatus` are *data*: booleans and one lowercase word. CLAUDE.md bans
 * status badges and coloured dots — the UI renders these as words (design §6
 * requirement 2: "Plain text, not a badge").
 */

const {
  AUDIENCE,
  selectColumnsForAudience,
  applyImageVisibility,
} = require("../../../shared/lib/profile-visibility");
const {
  loadSocialAccountsForProfiles,
} = require("../../../shared/lib/social-accounts");
const {
  loadApplicationSubmissionPackages,
  parsePayload,
} = require("./application-submission-package");

/** Snapshot marker the submit lane writes into `payload.identity.source`. */
const OPEN_CALL_IDENTITY_SOURCE = "open_call_submission";

const IDENTITY_SOURCES = Object.freeze({
  PROFILE: "profile",
  SUBMISSION: "submission",
});

/**
 * Plain-text materials states (design §6: "the row shows requested /
 * fulfilled / overdue as plain text").
 */
const MATERIALS_STATUS = Object.freeze({
  NONE: "none",
  REQUESTED: "requested",
  FULFILLED: "fulfilled",
  OVERDUE: "overdue",
});

// ---------------------------------------------------------------------------
// Schema probes
// ---------------------------------------------------------------------------

/*
 * Cached per knex instance. `hasTable`/`hasColumn` are round trips and these
 * answers cannot change inside a process; the WeakMap means a test that swaps
 * databases gets its own answer instead of a stale one.
 */
const supportCache = new WeakMap();

async function hasApplicantIdentitySupport(db) {
  if (supportCache.has(db)) return supportCache.get(db);
  const probe = (async () => {
    try {
      const [table, column] = await Promise.all([
        db.schema.hasTable("applicant_identities"),
        db.schema.hasColumn("applications", "applicant_identity_id"),
      ]);
      return Boolean(table && column);
    } catch {
      return false;
    }
  })();
  supportCache.set(db, probe);
  return probe;
}

/**
 * Cached `hasColumn`. Several agency suites hand-build a partial schema (see
 * `tests/integration/agency-rbac.test.js`, which creates `users` with four
 * columns), so a read of anything outside the original 2026 shape has to ask
 * first or it 500s a route that used to work.
 */
const columnCache = new WeakMap();

async function hasColumnCached(db, table, column) {
  let perDb = columnCache.get(db);
  if (!perDb) {
    perDb = new Map();
    columnCache.set(db, perDb);
  }
  const key = `${table}.${column}`;
  if (!perDb.has(key)) {
    perDb.set(
      key,
      db.schema.hasColumn(table, column).catch(() => false),
    );
  }
  return perDb.get(key);
}

const materialsCache = new WeakMap();

async function hasMaterialRequestSupport(db) {
  if (materialsCache.has(db)) return materialsCache.get(db);
  const probe = db.schema
    .hasTable("open_call_material_requests")
    .catch(() => false);
  materialsCache.set(db, probe);
  return probe;
}

// ---------------------------------------------------------------------------
// Small shapers
// ---------------------------------------------------------------------------

function text(value, maxLength = 254) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.slice(0, maxLength);
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function joinName(firstName, lastName) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || null;
}

/**
 * Measurements, in one shape both sources can fill. `text` is what a CSV cell
 * and an inbox row want; the numbers stay available for filtering.
 */
function measurementsFrom({ bustCm, waistCm, hipsCm, raw }) {
  const parts = [];
  if (bustCm) parts.push(`Bust: ${bustCm}`);
  if (waistCm) parts.push(`Waist: ${waistCm}`);
  if (hipsCm) parts.push(`Hips: ${hipsCm}`);
  return {
    bustCm: bustCm ?? null,
    waistCm: waistCm ?? null,
    hipsCm: hipsCm ?? null,
    text: parts.length ? parts.join(", ") : text(raw, 200),
  };
}

/** Frozen-snapshot images arrive already normalized; keep only usable ones. */
function snapshotImages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((image) => image && typeof image === "object" && image.id)
    .map((image) => ({
      id: image.id,
      path: image.public_url || image.path || null,
      public_url: image.public_url || image.path || null,
      alt: typeof image.alt === "string" ? image.alt : "",
      image_type: image.image_type || null,
      shot_type: image.shot_type || null,
      sort: number(image.sort),
    }))
    .filter((image) => image.path);
}

function instagramFromSocial(rows) {
  if (!Array.isArray(rows)) return null;
  const row = rows.find(
    (entry) => String(entry?.platform || "").toLowerCase() === "instagram",
  );
  return text(row?.handle || row?.url, 200);
}

function emptyDto(overrides = {}) {
  return {
    displayName: null,
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    city: null,
    gender: null,
    dateOfBirth: null,
    heightCm: null,
    measurements: measurementsFrom({}),
    instagram: null,
    images: [],
    isClaimed: false,
    isEmailVerified: false,
    isDisowned: false,
    identitySource: IDENTITY_SOURCES.SUBMISSION,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------------

/**
 * @param {import('knex')} db
 * @param {Array<{id: string, profile_id?: string|null, applicant_identity_id?: string|null, slug?: string|null}>} applications
 * @returns {Promise<Map<string, object>>} applicationId → DTO
 */
async function resolveApplicantIdentities(db, applications) {
  const out = new Map();
  const rows = (Array.isArray(applications) ? applications : []).filter(
    (row) => row && row.id,
  );
  if (rows.length === 0) return out;

  const identitySupported = await hasApplicantIdentitySupport(db);

  const profileRows = rows.filter((row) => row.profile_id);
  const identityRows = identitySupported
    ? rows.filter((row) => !row.profile_id && row.applicant_identity_id)
    : [];

  /* One `applicant_identities` read covers BOTH branches: a claimed applicant's
     application keeps its `applicant_identity_id` after being re-pointed at the
     new profile, and `disowned_at` ("that wasn't me", §5.5) is a fact about the
     identity that the organizer must still see on a claimed row. */
  const identityIds = identitySupported
    ? [
        ...new Set(
          rows.map((row) => row.applicant_identity_id).filter(Boolean),
        ),
      ]
    : [];

  const [profileData, identityById, snapshotByApplication] = await Promise.all([
    loadProfileSources(db, profileRows),
    loadIdentities(db, identityIds),
    loadIdentitySnapshots(db, identityRows),
  ]);

  for (const row of profileRows) {
    const identity = identityById.get(row.applicant_identity_id) || null;
    out.set(row.id, buildProfileDto(row, profileData, identity));
  }
  for (const row of identityRows) {
    out.set(
      row.id,
      buildIdentityDto(
        identityById.get(row.applicant_identity_id) || null,
        snapshotByApplication.get(row.id) || null,
      ),
    );
  }
  /* Neither pointer resolvable (a pre-migration orphan, or an identity row on a
     schema without identity support): an empty DTO, never a missing key. A
     caller that gets `undefined` back writes `undefined` into a CSV cell. */
  for (const row of rows) {
    if (!out.has(row.id)) out.set(row.id, emptyDto());
  }

  return out;
}

/** Single-row convenience over the batch. Never returns null. */
async function resolveApplicantIdentity(db, application) {
  if (!application?.id) return emptyDto();
  const resolved = await resolveApplicantIdentities(db, [application]);
  return resolved.get(application.id) || emptyDto();
}

// ---------------------------------------------------------------------------
// Source loaders — one query per source, no N+1
// ---------------------------------------------------------------------------

async function loadProfileSources(db, profileRows) {
  const empty = {
    profilesById: new Map(),
    usersByProfileId: new Map(),
    socialByProfileId: new Map(),
    imagesByProfileId: new Map(),
    packagesByApplication: new Map(),
  };
  if (profileRows.length === 0) return empty;

  const profileIds = [...new Set(profileRows.map((row) => row.profile_id))];

  /* The `users` LEFT JOIN and its two columns are the choice `inbox.js`'s
     export already makes (`users.email as owner_email`): the account email is
     the applicant's real address and `profiles.email` is not authoritative.
     `email_verified` rides along because it is the profile branch's answer to
     design §6 requirement 2. */
  const verifiedColumn = await hasColumnCached(db, "users", "email_verified");
  const profiles = await db("profiles")
    .leftJoin("users", "profiles.user_id", "users.id")
    .whereIn("profiles.id", profileIds)
    .select([
      ...selectColumnsForAudience(AUDIENCE.AGENCY_SUBMISSION, {
        table: "profiles",
      }),
      "users.email as account_email",
      ...(verifiedColumn
        ? ["users.email_verified as account_email_verified"]
        : []),
    ]);

  const profilesById = new Map();
  const usersByProfileId = new Map();
  for (const profile of profiles) {
    profilesById.set(profile.id, profile);
    usersByProfileId.set(profile.id, {
      email: profile.account_email || null,
      emailVerified: Boolean(profile.account_email_verified),
    });
  }

  const [socialByProfileId, packagesByApplication] = await Promise.all([
    loadSocialAccountsForProfiles(profileIds).catch(() => new Map()),
    loadApplicationSubmissionPackages(db, profileRows).catch(() => new Map()),
  ]);

  /* The frozen package's image selection wins where one exists (that is the
     existing organizer contract); only the profiles without one need the live
     read, so the fallback query covers exactly those. */
  const fallbackProfileIds = [
    ...new Set(
      profileRows
        .filter((row) => !packagesByApplication.get(row.id)?.images?.length)
        .map((row) => row.profile_id),
    ),
  ];
  const imagesByProfileId = new Map();
  if (fallbackProfileIds.length) {
    const imageQuery = db("images").whereIn("profile_id", fallbackProfileIds);
    applyImageVisibility(imageQuery, AUDIENCE.AGENCY_DISCOVERY, {
      table: "images",
    });
    const images = await imageQuery
      .orderBy(["profile_id", "sort", "created_at"])
      .catch(() => []);
    for (const image of images) {
      const bucket = imagesByProfileId.get(image.profile_id) || [];
      bucket.push(image);
      imagesByProfileId.set(image.profile_id, bucket);
    }
  }

  return {
    profilesById,
    usersByProfileId,
    socialByProfileId,
    imagesByProfileId,
    packagesByApplication,
  };
}

async function loadIdentities(db, identityIds) {
  const byId = new Map();
  if (identityIds.length === 0) return byId;
  const rows = await db("applicant_identities")
    .whereIn("id", identityIds)
    .select(
      "id",
      "email_normalized",
      "phone_normalized",
      "profile_id",
      "claimed_at",
      "disowned_at",
    )
    .catch(() => []);
  for (const row of rows) byId.set(row.id, row);
  return byId;
}

/**
 * The LATEST `talent_submission_packages` row per application. Ordered
 * descending and first-wins, which is the same "newest package per
 * application" rule `loadEventExportPackageExtras` already applies.
 */
async function loadIdentitySnapshots(db, identityRows) {
  const byApplication = new Map();
  if (identityRows.length === 0) return byApplication;
  if (!(await db.schema.hasTable("talent_submission_packages").catch(() => false))) {
    return byApplication;
  }

  const applicationIds = identityRows.map((row) => row.id);
  const rows = await db("talent_submission_packages")
    .whereIn("application_id", applicationIds)
    .orderBy([
      { column: "created_at", order: "desc" },
      { column: "id", order: "desc" },
    ])
    .select("application_id", "payload", "revoked_at", "redacted_at")
    .catch(() => []);

  for (const row of rows) {
    if (byApplication.has(row.application_id)) continue;
    // A revoked or redacted package exports nothing rather than the values it
    // was redacted for holding — same rule as the event export's extras.
    if (row.revoked_at || row.redacted_at) {
      byApplication.set(row.application_id, {});
      continue;
    }
    byApplication.set(row.application_id, parsePayload(row.payload));
  }
  return byApplication;
}

// ---------------------------------------------------------------------------
// DTO builders
// ---------------------------------------------------------------------------

function buildProfileDto(applicationRow, profileData, identity) {
  const profile = profileData.profilesById.get(applicationRow.profile_id);
  if (!profile) {
    return emptyDto({
      identitySource: IDENTITY_SOURCES.PROFILE,
      isClaimed: true,
      isDisowned: Boolean(identity?.disowned_at),
    });
  }

  const account = profileData.usersByProfileId.get(profile.id) || {};
  const pkg = profileData.packagesByApplication.get(applicationRow.id) || null;
  const images = pkg?.images?.length
    ? snapshotImages(pkg.images)
    : snapshotImages(profileData.imagesByProfileId.get(profile.id) || []);

  return {
    displayName: joinName(profile.first_name, profile.last_name),
    firstName: text(profile.first_name, 120),
    lastName: text(profile.last_name, 120),
    email: text(account.email || pkg?.contact?.email, 254),
    phone: text(profile.phone || pkg?.contact?.phone, 40),
    city: text(profile.city, 160),
    gender: text(profile.gender, 40),
    dateOfBirth: profile.date_of_birth || null,
    heightCm: number(profile.height_cm),
    measurements: measurementsFrom({
      bustCm: number(profile.bust_cm),
      waistCm: number(profile.waist_cm),
      hipsCm: number(profile.hips_cm),
    }),
    instagram: instagramFromSocial(
      profileData.socialByProfileId.get(profile.id),
    ),
    images,
    isClaimed: true,
    // The account branch's own evidence — Firebase verification, not a claim
    // click. Design Q4 makes the two equivalent in strength; they are still
    // read from different columns.
    isEmailVerified: Boolean(account.emailVerified),
    isDisowned: Boolean(identity?.disowned_at),
    identitySource: IDENTITY_SOURCES.PROFILE,
  };
}

function buildIdentityDto(identity, payload) {
  const snapshot =
    payload?.identity && typeof payload.identity === "object"
      ? payload.identity
      : {};
  const answers =
    payload?.answers && typeof payload.answers === "object"
      ? payload.answers
      : {};

  const firstName = text(snapshot.firstName, 120);
  const lastName = text(snapshot.lastName, 120);

  return {
    displayName:
      text(snapshot.displayName, 200) ||
      joinName(firstName, lastName) ||
      // Last resort so an organizer row is never blank. The email is what the
      // applicant gave; showing it beats showing nothing.
      text(identity?.email_normalized, 254),
    firstName,
    lastName,
    email: text(snapshot.email || identity?.email_normalized, 254),
    phone: text(snapshot.phone || identity?.phone_normalized, 40),
    city: text(snapshot.city, 160),
    gender: text(snapshot.gender, 40),
    // Never asserted by an anonymous applicant: the event spec asks for the
    // 18+ attestation, not a date (design §3.1, ruling Q1).
    dateOfBirth: null,
    heightCm: number(snapshot.heightCm ?? answers.height),
    measurements: measurementsFrom({ raw: answers.core_measurements }),
    instagram: text(snapshot.instagram ?? answers.instagram, 200),
    // Identity-backed ids are `open_call_submission_media` ids and the paths
    // are already-public URLs — the normalized shape is the same either way.
    images: snapshotImages(payload?.images),
    isClaimed: Boolean(identity?.claimed_at),
    // The claim click IS the verification (design ruling Q4): a single-use,
    // hashed, expiring token delivered to that address.
    isEmailVerified: Boolean(identity?.claimed_at),
    isDisowned: Boolean(identity?.disowned_at),
    identitySource: IDENTITY_SOURCES.SUBMISSION,
  };
}

// ---------------------------------------------------------------------------
// Materials requests — the shortlist-stage ask, as inbox truth
// ---------------------------------------------------------------------------

/**
 * Lives here rather than in `routes/materials.js` because `inbox.js` reads it
 * too and a route module is the wrong thing for another route module to
 * require. One home for the status vocabulary, one home for the query.
 *
 * @returns {Promise<Map<string, object>>} applicationId → request row + status
 */
async function loadMaterialRequests(db, applicationIds) {
  const byApplication = new Map();
  const ids = [...new Set((applicationIds || []).filter(Boolean))];
  if (ids.length === 0) return byApplication;
  if (!(await hasMaterialRequestSupport(db))) return byApplication;

  const rows = await db("open_call_material_requests")
    .whereIn("application_id", ids)
    .select(
      "id",
      "application_id",
      "requested_keys",
      "due_at",
      "requested_by_user_id",
      "fulfilled_at",
      "created_at",
      "updated_at",
    )
    .catch(() => []);

  for (const row of rows) {
    byApplication.set(row.application_id, serializeMaterialRequest(row));
  }
  return byApplication;
}

function parseRequestedKeys(value) {
  if (Array.isArray(value)) return value.filter((key) => typeof key === "string");
  const parsed = parsePayload(value);
  return Array.isArray(parsed)
    ? parsed.filter((key) => typeof key === "string")
    : [];
}

function serializeMaterialRequest(row, now = Date.now()) {
  if (!row) return null;
  const dueAt = row.due_at ? new Date(row.due_at) : null;
  const overdue =
    !row.fulfilled_at &&
    dueAt !== null &&
    Number.isFinite(dueAt.getTime()) &&
    dueAt.getTime() < now;
  return {
    id: row.id || null,
    applicationId: row.application_id,
    requestedKeys: parseRequestedKeys(row.requested_keys),
    dueAt: row.due_at || null,
    fulfilledAt: row.fulfilled_at || null,
    requestedByUserId: row.requested_by_user_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    status: row.fulfilled_at
      ? MATERIALS_STATUS.FULFILLED
      : overdue
        ? MATERIALS_STATUS.OVERDUE
        : MATERIALS_STATUS.REQUESTED,
  };
}

/** `'none'` when nothing was ever asked for — the common case. */
function materialsStatusFor(request) {
  return request?.status || MATERIALS_STATUS.NONE;
}

/**
 * The plain-data truth fields every organizer application DTO carries
 * (design §6 requirements 1 and 2). Words and booleans only — the UI decides
 * how to render them, and CLAUDE.md forbids it being a badge.
 */
function identityTruthFields(dto, request) {
  return {
    emailVerified: Boolean(dto?.isEmailVerified),
    identityClaimed: Boolean(dto?.isClaimed),
    identityDisputed: Boolean(dto?.isDisowned),
    identitySource: dto?.identitySource || null,
    materialsStatus: materialsStatusFor(request),
  };
}

module.exports = {
  IDENTITY_SOURCES,
  MATERIALS_STATUS,
  OPEN_CALL_IDENTITY_SOURCE,
  hasApplicantIdentitySupport,
  hasColumnCached,
  identityTruthFields,
  loadMaterialRequests,
  materialsStatusFor,
  resolveApplicantIdentities,
  resolveApplicantIdentity,
  serializeMaterialRequest,
};
