"use strict";

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const {
  CURRENT_SUBMISSION_DISCLOSURE_VERSION,
  CURRENT_SUBMISSION_ACKNOWLEDGEMENT_VERSION,
  acknowledgementVersionForPurpose,
  buildSubmissionDisclosureSnapshot,
  disclosureVersionForPurpose,
  normalizeDisclosurePurpose,
} = require("../../../shared/lib/submission-disclosure-content");
const {
  DEFAULT_CALL_PURPOSE,
} = require("../../../shared/constants/event-casting");

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeString(value))
        .filter(Boolean),
    ),
  ).sort();
}

function normalizeDigitalSlotPicks(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([slot, imageId]) => [
        normalizeString(slot),
        normalizeString(imageId),
      ])
      .filter(([slot, imageId]) => slot && imageId)
      .sort(([left], [right]) => left.localeCompare(right, "en-US")),
  );
}

function normalizeSubmissionNote(value) {
  return normalizeString(value).slice(0, 1200);
}

/**
 * `YYYY-MM-DD` or "". Availability is a calendar range, never an instant: an
 * ISO timestamp hashed on one side and a date string on the other would be two
 * different packages describing the same intent.
 */
function normalizeDateOnly(value) {
  const text = normalizeString(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeAvailabilityRange(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const from = normalizeDateOnly(value.from);
  const to = normalizeDateOnly(value.to);
  if (!from && !to) return null;
  return { from: from || null, to: to || null };
}

/**
 * The exact bytes the applicant's consent is bound to.
 *
 * THE EVENT KEYS ARE SPREAD CONDITIONALLY AND MUST STAY THAT WAY (design §b.4).
 * `canonicalJson` sorts keys and emits `null` for absent values, so adding
 * `openCallLinkId`/`availability`/`walkVideoUrl` unconditionally would change
 * the hash of every representation package in existence — every draft someone
 * is halfway through would come back as `consent_package_changed` and make them
 * re-consent for no reason. `openCallLinkId` is the switch: no link, no keys,
 * byte-identical output to the pre-event-casting version.
 *
 * `client/src/domains/talent/pages/ApplyPage/submissionConsentBinding.js`
 * mirrors this function byte for byte and
 * `tests/talent/event-intake.test.js` fails the build if the two ever drift.
 */
function canonicalSubmissionPackage({
  agencyId,
  boards = [],
  mediaSetId = null,
  digitalSlotPicks = {},
  compCardPresetId = null,
  imageIds = [],
  note = "",
  openCallLinkId = null,
  availability = null,
  walkVideoUrl = null,
} = {}) {
  const linkId = normalizeString(openCallLinkId);
  return {
    agencyId: normalizeString(agencyId) || null,
    boards: normalizeStringList(boards),
    mediaSetId: normalizeString(mediaSetId) || null,
    digitalSlotPicks: normalizeDigitalSlotPicks(digitalSlotPicks),
    compCardPresetId: normalizeString(compCardPresetId) || null,
    imageIds: normalizeStringList(imageIds),
    note: normalizeSubmissionNote(note),
    ...(linkId
      ? {
          openCallLinkId: linkId,
          availability: normalizeAvailabilityRange(availability),
          walkVideoUrl: normalizeString(walkVideoUrl) || null,
        }
      : {}),
  };
}

function buildSubmissionPackageFingerprint({
  agencyId,
  boards = [],
  mediaSetId = null,
  digitalSlotPicks = {},
  compCardPresetId = null,
  imageIds = [],
  note = "",
  openCallLinkId = null,
  availability = null,
  walkVideoUrl = null,
} = {}) {
  return crypto
    .createHash("sha256")
    .update(canonicalJson(canonicalSubmissionPackage({
      agencyId,
      boards,
      mediaSetId,
      digitalSlotPicks,
      compCardPresetId,
      imageIds,
      note,
      openCallLinkId,
      availability,
      walkVideoUrl,
    })))
    .digest("hex");
}

function requestClientMeta(req) {
  return {
    ipAddress:
      req?.ip ||
      req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
      null,
    userAgent: req?.get?.("user-agent") || req?.headers?.["user-agent"] || null,
  };
}

/*
 * Deploy-before-migrate guard for the purpose columns (design A4). Consent is
 * recorded inside the submit transaction: if the code ships ahead of the
 * migration, writing a column that does not exist would fail the submission
 * itself. Representation submissions predate these columns and must keep going
 * through on an older schema. Cached per knex instance.
 */
const purposeSchemaPromises = new WeakMap();
function hasConsentPurposeColumns(db) {
  const client = db?.client || db;
  let promise = purposeSchemaPromises.get(client);
  if (!promise) {
    promise = db.schema
      .hasColumn("application_submission_consent_events", "purpose")
      .catch(() => {
        purposeSchemaPromises.delete(client);
        return false;
      });
    purposeSchemaPromises.set(client, promise);
  }
  return promise;
}

/*
 * The same guard for `applicant_identity_id`
 * (`20260819130000_snapshot_and_consent_identity_support.js`). Separate cache
 * because the two columns ship in different migrations and a deploy can land
 * between them.
 */
const identitySchemaPromises = new WeakMap();
function hasConsentIdentityColumn(db) {
  const client = db?.client || db;
  let promise = identitySchemaPromises.get(client);
  if (!promise) {
    promise = db.schema
      .hasColumn("application_submission_consent_events", "applicant_identity_id")
      .catch(() => {
        identitySchemaPromises.delete(client);
        return false;
      });
    identitySchemaPromises.set(client, promise);
  }
  return promise;
}

async function recordSubmissionDisclosureConsent(
  trx,
  {
    applicationId,
    userId,
    profileId,
    agencyId,
    packageFingerprint,
    disclosureSnapshot,
    guardianConsentRequestId = null,
    guardianConsentGrantId = null,
    ipAddress = null,
    userAgent = null,
    purpose = DEFAULT_CALL_PURPOSE,
    openCallLinkId = null,
    compensationDisclosure = null,
    applicantIdentityId = null,
  },
) {
  /*
   * WHO THIS CONSENT BELONGS TO — two shapes, one row.
   *
   * An account-backed submission is scoped by (user, profile), and that pair
   * stays mandatory for it: a consent row with a NULL profile on the
   * representation path would be an audit record nobody can attribute.
   *
   * An anonymous open-call submission has neither — no `users` row and no
   * `profiles` row exist at state 2 of the identity ladder
   * (`docs/open-call-applicant-flow-design-2026-08.md` §3.2) — and it is scoped
   * by `applicant_identity_id` instead. Migration `20260819130000` made both
   * columns nullable and added that pointer for exactly this. The rule is
   * therefore "one of the two scopes, never neither", which is the presence
   * invariant that migration deliberately left to this service rather than
   * restating as a second CHECK.
   *
   * Existing call sites are byte-compatible: they pass user and profile and
   * no identity, and take the first branch unchanged.
   */
  const hasAccountScope = Boolean(userId && profileId);
  if (!applicationId || !agencyId || !(hasAccountScope || applicantIdentityId)) {
    throw new Error("Submission disclosure consent requires application scope");
  }
  if (!packageFingerprint) {
    throw new Error("Submission disclosure consent requires package fingerprint");
  }
  if (!disclosureSnapshot || typeof disclosureSnapshot !== "object") {
    throw new Error("Submission disclosure consent requires disclosure snapshot");
  }

  const resolvedPurpose = normalizeDisclosurePurpose(purpose);

  // The purpose decides which text the applicant read, so it decides which
  // version is stamped. Defaulting keeps representation on the string it has
  // always carried.
  const purposeColumns = (await hasConsentPurposeColumns(trx))
    ? {
        purpose: resolvedPurpose,
        open_call_link_id: openCallLinkId || null,
        compensation_disclosure: compensationDisclosure || null,
      }
    : {};

  // Written only where the column exists, so a consent row still lands during
  // the window between the code deploying and `20260819130000` running.
  const identityColumn =
    applicantIdentityId && (await hasConsentIdentityColumn(trx))
      ? { applicant_identity_id: applicantIdentityId }
      : {};

  await trx("application_submission_consent_events").insert({
    id: uuidv4(),
    application_id: applicationId,
    user_id: userId || null,
    profile_id: profileId || null,
    agency_id: agencyId,
    package_fingerprint: packageFingerprint,
    consent_text_version: disclosureVersionForPurpose(resolvedPurpose),
    acknowledgement_version: acknowledgementVersionForPurpose(resolvedPurpose),
    disclosure_snapshot: disclosureSnapshot,
    guardian_consent_request_id: guardianConsentRequestId || null,
    guardian_consent_grant_id: guardianConsentGrantId || null,
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
    created_at: trx.fn.now(),
    ...purposeColumns,
    ...identityColumn,
  });
}

module.exports = {
  CURRENT_SUBMISSION_DISCLOSURE_VERSION,
  CURRENT_SUBMISSION_ACKNOWLEDGEMENT_VERSION,
  buildSubmissionDisclosureSnapshot,
  canonicalSubmissionPackage,
  buildSubmissionPackageFingerprint,
  normalizeSubmissionNote,
  recordSubmissionDisclosureConsent,
  requestClientMeta,
};
