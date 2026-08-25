"use strict";

/**
 * Agency export webhook configuration (plan §9.4, adjacency 1).
 *
 * Three routes: read the current endpoint, save one, remove it. Saving
 * validates the URL through the same `assertDeliverableUrl` the delivery path
 * uses, so an agency learns their URL is unreachable while they are looking at
 * the form rather than through silent non-delivery days later.
 *
 * The secret is never read back. It is shown once, when set, and after that the
 * response says only whether one is configured — a settings screen that echoes
 * a signing secret puts it in every screenshot, cache and support ticket.
 */

const express = require("express");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../../shared/db/knex");
const {
  requireRole,
  requireAgencyMembershipRole,
} = require("../../auth/middleware/require-auth");
const { getSessionAgencyId } = require("../services/context");
const { assertDeliverableUrl } = require("../services/export-webhook");
const {
  TABLE,
  hasWebhookSchema,
} = require("../services/export-webhook-dispatch");

const router = express.Router();

function dto(row) {
  if (!row) return null;
  return {
    url: row.url,
    // Presence, never the value.
    hasSecret: Boolean(row.secret),
    active: Boolean(row.active) && !row.disabled_at,
    disabledAt: row.disabled_at || null,
    lastDeliveredAt: row.last_delivered_at || null,
    lastStatusCode: row.last_status_code ?? null,
    lastError: row.last_error || null,
    consecutiveFailures: row.consecutive_failures || 0,
  };
}

router.get(
  "/api/agency/export-webhook",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      if (!(await hasWebhookSchema(knex))) {
        return res.json({ webhook: null, available: false });
      }
      const row = await knex(TABLE)
        .where({ agency_id: getSessionAgencyId(req) })
        .first();
      return res.json({ webhook: dto(row), available: true });
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  "/api/agency/export-webhook",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res, next) => {
    try {
      if (!(await hasWebhookSchema(knex))) {
        return res.status(503).json({
          error: "export_webhook_unavailable",
          message:
            "The export webhook is briefly unavailable while Pholio finishes an update.",
        });
      }
      const agencyId = getSessionAgencyId(req);

      // Validated here so the agency finds out now, not through days of silent
      // non-delivery. Same check the delivery path runs.
      try {
        await assertDeliverableUrl(req.body?.url);
      } catch (rejection) {
        return res
          .status(400)
          .json({ error: rejection.code || "invalid_url", message: rejection.message });
      }

      const existing = await knex(TABLE).where({ agency_id: agencyId }).first();
      // Rotating is explicit. A save that silently reissued the secret would
      // break every receiver that had already been configured with it.
      const rotate = req.body?.rotateSecret === true || !existing;
      const secret = rotate
        ? crypto.randomBytes(32).toString("hex")
        : existing.secret;

      const now = knex.fn.now();
      if (existing) {
        await knex(TABLE).where({ id: existing.id }).update({
          url: String(req.body.url),
          secret,
          active: true,
          // A save is an assertion that the endpoint is good now, so the
          // failure run and any auto-disable are cleared.
          consecutive_failures: 0,
          disabled_at: null,
          last_error: null,
          updated_at: now,
        });
      } else {
        await knex(TABLE).insert({
          id: uuidv4(),
          agency_id: agencyId,
          url: String(req.body.url),
          secret,
          active: true,
          created_at: now,
          updated_at: now,
        });
      }

      const row = await knex(TABLE).where({ agency_id: agencyId }).first();
      return res.json({
        webhook: dto(row),
        // The only time the secret is ever returned.
        secret: rotate ? secret : undefined,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  "/api/agency/export-webhook",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res, next) => {
    try {
      if (!(await hasWebhookSchema(knex))) {
        return res.json({ success: true });
      }
      await knex(TABLE)
        .where({ agency_id: getSessionAgencyId(req) })
        .del();
      return res.json({ success: true });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
