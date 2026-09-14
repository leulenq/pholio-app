"use strict";

const { randomUUID, createHash } = require("crypto");
const {
  activeWebhook,
  buildPayload,
  recordOutcome,
} = require("./export-webhook-dispatch");
const { deliver } = require("./export-webhook");
const { parsePayload } = require("../../../shared/lib/submission-retention");
const { minorPublicExposureAllowed } = require("../../../shared/lib/talent-age");
const { isAgencyBlockedForTalent } = require("../../../shared/lib/blocked-agencies");
const TABLE = "submission_webhook_deliveries";
const MAX_ATTEMPTS = 10;
const revision = (hook) => createHash("sha256").update(JSON.stringify([hook.url, hook.secret || null])).digest("hex");
const asIso = (value) => (value instanceof Date ? value : new Date(value)).toISOString();

// Called in the same transaction as the frozen package. The queue stores only
// references, never a second copy of applicant PII that erasure could overlook.
async function enqueueSubmission(db, { agencyId, applicationId, packageId, now = new Date() }) {
  const webhook = await activeWebhook(db, agencyId);
  if (!webhook) return null;
  const id = randomUUID();
  await db(TABLE).insert({ id, application_id: applicationId, package_id: packageId,
    webhook_id: webhook.id, endpoint_revision: revision(webhook), next_attempt_at: asIso(now),
  }).onConflict(["package_id", "webhook_id"]).ignore();
  const persisted = await db(TABLE)
    .where({ package_id: packageId, webhook_id: webhook.id })
    .first("id");
  return persisted?.id || null;
}

async function resolveDelivery(db, row, now) {
  const [application, pkg, webhook] = await Promise.all([
    db("applications").where({ id: row.application_id }).first(),
    db("talent_submission_packages").where({ id: row.package_id }).first(),
    db("agency_export_webhooks").where({ id: row.webhook_id }).first(),
  ]);
  const retentionExpiry = new Date(pkg?.retention_expires_at).getTime();
  if (!application || !pkg || !webhook || !webhook.active || webhook.disabled_at ||
      revision(webhook) !== row.endpoint_revision || application.agency_id !== webhook.agency_id ||
      pkg.application_id !== application.id || pkg.redacted_at || pkg.revoked_at ||
      !Number.isFinite(retentionExpiry) || retentionExpiry <= now.getTime() ||
      application.withdrawn_at || application.minor_at_submission || application.minor_access_revoked_at ||
      ["withdrawn", "archived", "expired"].includes(String(application.status).toLowerCase())) return null;
  const snapshot = parsePayload(pkg.payload);
  if (snapshot.disclosureRedacted || snapshot.minorDataMinimized || snapshot.consentConfirmed !== true) return null;
  const [profile, agency] = await Promise.all([
    db("profiles").where({ id: application.profile_id }).first(),
    db("agencies").where({ id: application.agency_id }).first(),
  ]);
  if (!minorPublicExposureAllowed(profile, now) || String(agency?.status).toUpperCase() !== "ACTIVE") return null;
  const user = await db("users").where({ id: profile.user_id }).first();
  if (!user || String(user.account_status).toLowerCase() !== "active") return null;
  if (await isAgencyBlockedForTalent(db, profile.user_id, application.agency_id)) return null;
  return { webhook, payload: { ...buildPayload({ application, snapshot, agencyId: application.agency_id }), deliveryId: row.id } };
}

async function replaySubmissionWebhooks(db, options = {}) {
  const { limit = 10, deliverImpl = deliver } = options;
  const batchNow = options.now instanceof Date ? options.now : new Date();
  const clock = typeof options.clock === "function" ? options.clock : () => new Date();
  const boundedLimit = Math.max(1, Math.min(20, Number(limit) || 10));
  const nowValue = asIso(batchNow);
  const rows = await db(TABLE).where({ state: "pending" }).where("next_attempt_at", "<=", nowValue)
    .where((q) => q.whereNull("lease_expires_at").orWhere("lease_expires_at", "<=", nowValue))
    .orderBy("next_attempt_at").orderBy("id").limit(boundedLimit);
  const counts = { examined: rows.length, delivered: 0, cancelled: 0, failed: 0 };
  await Promise.all(rows.map(async (row) => {
    const leaseToken = randomUUID();
    const claimedAt = new Date(clock());
    const leaseExpiresAt = new Date(claimedAt.getTime() + 60_000).toISOString();
    const changed = await db(TABLE).where({ id: row.id, state: "pending" })
      .where({ attempts: row.attempts })
      .where("next_attempt_at", "<=", claimedAt.toISOString())
      .where((q) => q.whereNull("lease_expires_at").orWhere("lease_expires_at", "<=", claimedAt.toISOString()))
      .update({ lease_token: leaseToken, lease_expires_at: leaseExpiresAt, attempts: db.raw("attempts + 1") });
    if (changed !== 1) return;
    let resolved;
    let outcome;
    try {
      resolved = await resolveDelivery(db, row, claimedAt);
      if (resolved) {
        // Current disclosure state is checked immediately before the network
        // call. Like every outbox, an in-flight request cannot be recalled if
        // a withdrawal commits after this point.
        outcome = await deliverImpl(resolved.webhook, resolved.payload);
        await recordOutcome(db, resolved.webhook, outcome);
      }
    } catch { outcome = { ok: false }; }
    const terminal = !outcome && !resolved ? "cancelled" : outcome?.ok ? "completed" : row.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending";
    await db(TABLE).where({ id: row.id, lease_token: leaseToken }).update({
      state: terminal, lease_token: null, lease_expires_at: null,
      completed_at: terminal === "pending" ? null : claimedAt.toISOString(),
      next_attempt_at: new Date(claimedAt.getTime() + Math.min(24 * 3600_000, 60_000 * 2 ** row.attempts)).toISOString(),
      last_error: outcome && !outcome.ok ? "delivery_failed" : null,
    });
    if (terminal === "completed") counts.delivered++;
    else if (terminal === "cancelled") counts.cancelled++;
    else counts.failed++;
  }));
  return counts;
}

module.exports = { TABLE, enqueueSubmission, replaySubmissionWebhooks, resolveDelivery };
