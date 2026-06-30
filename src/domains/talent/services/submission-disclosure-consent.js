"use strict";

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const {
  CURRENT_SUBMISSION_DISCLOSURE_VERSION,
  CURRENT_SUBMISSION_ACKNOWLEDGEMENT_VERSION,
  buildSubmissionDisclosureSnapshot,
} = require("../../../shared/lib/submission-disclosure-content");

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
    ipAddress = null,
    userAgent = null,
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

  await trx("application_submission_consent_events").insert({
    id: uuidv4(),
    application_id: applicationId,
    user_id: userId,
    profile_id: profileId,
    agency_id: agencyId,
    package_fingerprint: packageFingerprint,
    consent_text_version: CURRENT_SUBMISSION_DISCLOSURE_VERSION,
    acknowledgement_version: CURRENT_SUBMISSION_ACKNOWLEDGEMENT_VERSION,
    disclosure_snapshot: disclosureSnapshot,
    guardian_consent_request_id: guardianConsentRequestId || null,
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
    created_at: trx.fn.now(),
  });
}

module.exports = {
  buildSubmissionDisclosureSnapshot,
  canonicalSubmissionPackage,
  buildSubmissionPackageFingerprint,
  normalizeSubmissionNote,
  recordSubmissionDisclosureConsent,
  requestClientMeta,
};
