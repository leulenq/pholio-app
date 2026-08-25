"use strict";

/**
 * Fire the export webhook for a submission, and record what happened.
 *
 * Separated from `export-webhook.js` so the delivery rules stay testable
 * without a database, and so the one thing this file must guarantee is easy to
 * see: **it never throws into the caller, and never blocks the submission.**
 * A talent sending their book is their act. An agency's broken endpoint must
 * not fail it, delay it, or be visible to them.
 *
 * The payload deliberately mirrors the CSV export's columns rather than
 * inventing a second shape. An agency that has already mapped the CSV should
 * not have to map anything again, and one vocabulary is easier to keep honest
 * than two.
 */

const { deliver, MAX_CONSECUTIVE_FAILURES } = require("./export-webhook");

const TABLE = "agency_export_webhooks";

let schemaPromise = null;

/** Cached per process — the answer changes only when a migration runs. */
async function hasWebhookSchema(db) {
  if (!schemaPromise) {
    schemaPromise = db.schema.hasTable(TABLE).catch(() => false);
  }
  return schemaPromise;
}

/** Test seam. */
function resetWebhookSchemaCache() {
  schemaPromise = null;
}

/**
 * The live endpoint for an agency, or null.
 *
 * @param {import('knex')} db
 * @param {string} agencyId
 */
async function activeWebhook(db, agencyId) {
  if (!(await hasWebhookSchema(db))) return null;
  const row = await db(TABLE).where({ agency_id: agencyId }).first();
  if (!row || !row.active || row.disabled_at) return null;
  return row;
}

/**
 * Record an outcome. A run of failures eventually disables the endpoint: an
 * agency that switched systems and forgot this row should cost a handful of
 * failed deliveries, not an unbounded retry queue.
 *
 * @param {import('knex')} db
 * @param {object} webhook
 * @param {{ok: boolean, statusCode: number|null, error: string|null}} outcome
 */
async function recordOutcome(db, webhook, outcome) {
  const failures = outcome.ok ? 0 : (webhook.consecutive_failures || 0) + 1;
  const patch = {
    last_status_code: outcome.statusCode,
    last_error: outcome.error ? String(outcome.error).slice(0, 2000) : null,
    consecutive_failures: failures,
    updated_at: db.fn.now(),
  };
  if (outcome.ok) patch.last_delivered_at = db.fn.now();
  if (failures >= MAX_CONSECUTIVE_FAILURES) patch.disabled_at = db.fn.now();

  await db(TABLE).where({ id: webhook.id }).update(patch);
}

/**
 * The delivered shape. Mirrors the CSV export's columns.
 *
 * @param {{application: object, profile: object|null, identity: object|null, agencyId: string}} input
 */
function buildPayload({ application, profile, identity, agencyId }) {
  const contact = profile || identity || {};
  return {
    event: "submission.received",
    sentAt: new Date().toISOString(),
    agencyId,
    application: {
      id: application.id,
      status: application.status,
      submittedAt: application.created_at || null,
      callPurpose: application.call_purpose || null,
      openCallLinkId: application.open_call_link_id || null,
    },
    applicant: {
      // Null profileId is a real, common state: an open-call applicant who has
      // not claimed a Pholio account. Receivers must be able to tell.
      profileId: application.profile_id || null,
      name:
        [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
        contact.displayName ||
        null,
      email: contact.email || null,
      phone: contact.phone || null,
      city: contact.city || null,
      heightCm: contact.height_cm ?? null,
    },
  };
}

/**
 * Deliver, if the agency has an endpoint. Fire-and-forget by design.
 *
 * @param {import('knex')} db
 * @param {{agencyId: string, application: object, profile?: object, identity?: object}} input
 * @param {object} [opts] delivery overrides, for tests
 * @returns {Promise<{delivered: boolean, reason?: string}>}
 */
async function dispatchSubmission(db, input, opts = {}) {
  try {
    const webhook = await activeWebhook(db, input.agencyId);
    if (!webhook) return { delivered: false, reason: "no_active_webhook" };

    const outcome = await deliver(
      { url: webhook.url, secret: webhook.secret },
      buildPayload(input),
      opts,
    );
    await recordOutcome(db, webhook, outcome);
    return outcome.ok
      ? { delivered: true }
      : { delivered: false, reason: outcome.error };
  } catch (error) {
    // Swallowed on purpose. Nothing about an export hand-off may surface in a
    // talent's submission path.
    console.error("[ExportWebhook] dispatch failed:", error.message);
    return { delivered: false, reason: "dispatch_error" };
  }
}

module.exports = {
  TABLE,
  activeWebhook,
  buildPayload,
  dispatchSubmission,
  hasWebhookSchema,
  recordOutcome,
  resetWebhookSchemaCache,
};
