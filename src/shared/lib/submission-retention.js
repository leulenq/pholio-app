"use strict";

const SUBMISSION_PACKAGE_RETENTION_MONTHS = 24;

function parsePayload(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function submissionRetentionExpiry(from = new Date()) {
  const date = from instanceof Date ? new Date(from) : new Date(from);
  date.setUTCMonth(date.getUTCMonth() + SUBMISSION_PACKAGE_RETENTION_MONTHS);
  return date;
}

function redactedPayload(row, reason, at) {
  const payload = parsePayload(row?.payload);
  return {
    packageSchemaVersion: payload.packageSchemaVersion || 2,
    applicationId: row?.application_id || payload.applicationId || null,
    agencyId: payload.agencyId || null,
    submittedAt: payload.submittedAt || row?.created_at || null,
    disclosureRedacted: true,
    redactedAt: at.toISOString(),
    redactionReason: reason,
  };
}

function serializePayload(db, payload) {
  return db?.client?.config?.client === "pg"
    ? payload
    : JSON.stringify(payload);
}

async function redactSubmissionPackages(
  db,
  { applicationId, reason, at = new Date(), revoke = true },
) {
  const rows = await db("talent_submission_packages")
    .where({ application_id: applicationId })
    .whereNull("redacted_at");
  for (const row of rows) {
    await db("talent_submission_packages")
      .where({ id: row.id })
      .update({
        payload: serializePayload(db, redactedPayload(row, reason, at)),
        redacted_at: at,
        redaction_reason: reason,
        ...(revoke ? { revoked_at: at } : {}),
      });
  }
  return rows.length;
}

async function redactExpiredSubmissionPackages(db, now = new Date()) {
  const rows = await db("talent_submission_packages")
    .whereNull("redacted_at")
    .whereNotNull("retention_expires_at");
  let redacted = 0;
  for (const row of rows) {
    const expiresAt = new Date(row.retention_expires_at);
    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() > now.getTime()
    ) {
      continue;
    }
    await db("talent_submission_packages")
      .where({ id: row.id })
      .update({
        payload: serializePayload(
          db,
          redactedPayload(row, "retention_expired", now),
        ),
        redacted_at: now,
        redaction_reason: "retention_expired",
        revoked_at: row.revoked_at || now,
      });
    redacted += 1;
  }
  return redacted;
}

module.exports = {
  SUBMISSION_PACKAGE_RETENTION_MONTHS,
  parsePayload,
  submissionRetentionExpiry,
  redactSubmissionPackages,
  redactExpiredSubmissionPackages,
};
