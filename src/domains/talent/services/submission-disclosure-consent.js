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

function canonicalSubmissionPackage({
  agencyId,
  boards = [],
  mediaSetId = null,
  digitalSlotPicks = {},
  compCardPresetId = null,
  imageIds = [],
  note = "",
} = {}) {
  return {
    agencyId: normalizeString(agencyId) || null,
    boards: normalizeStringList(boards),
    mediaSetId: normalizeString(mediaSetId) || null,
    digitalSlotPicks: normalizeDigitalSlotPicks(digitalSlotPicks),
    compCardPresetId: normalizeString(compCardPresetId) || null,
    imageIds: normalizeStringList(imageIds),
    note: normalizeSubmissionNote(note),
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
  },
) {
  if (!applicationId || !userId || !profileId || !agencyId) {
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

  await trx("application_submission_consent_events").insert({
    id: uuidv4(),
    application_id: applicationId,
    user_id: userId,
    profile_id: profileId,
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
