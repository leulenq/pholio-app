"use strict";

/**
 * `GET /api/internal/event-funnel/:linkId` — design §(f), the one reader of the
 * event-casting funnel.
 *
 * Internal on purpose. §(g) closes with "NO agency-facing analytics surface":
 * these numbers grade Pholio's intake, not the organizer's applicants, and an
 * organizer shown a 40% walk-video abandon rate would reasonably read it as a
 * statement about the people who applied to them. Platform staff only, via the
 * same `requirePlatformAdmin` guard the agency-request review queue uses.
 *
 * Read-only: there is no write verb here and there should never be one. The
 * funnel is written by the surfaces being measured.
 */

const express = require("express");
const asyncHandler = require("express-async-handler");
const knex = require("../../../shared/db/knex");
const {
  createRequirePlatformAdmin,
} = require("../middleware/require-platform-admin");
const {
  loadEventFunnelReport,
} = require("../../agency/queries/event-funnel.queries");
const { isEventCall } = require("../../agency/services/open-call-brief");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createEventFunnelRouter(options = {}) {
  const router = express.Router();
  const db = options.db || knex;
  const requirePlatformAdmin =
    options.requirePlatformAdmin || createRequirePlatformAdmin({ db });

  // Scoped to this namespace: the router is mounted at `/`, so an unscoped
  // `router.use` would put a staff guard in front of the whole application.
  router.use("/api/internal/event-funnel", requirePlatformAdmin);

  router.get(
    "/api/internal/event-funnel/:linkId",
    asyncHandler(async (req, res) => {
      const { linkId } = req.params;
      if (!UUID_PATTERN.test(linkId)) {
        return res.status(400).json({
          success: false,
          error: "INVALID_LINK_ID",
          message: "A valid open call link id is required.",
        });
      }

      const link = await db("agency_open_call_links as l")
        .leftJoin("agencies as a", "a.id", "l.agency_id")
        .where("l.id", linkId)
        .first(
          "l.id",
          "l.agency_id",
          "l.code",
          "l.label",
          "l.call_kind",
          "l.event_name",
          "l.event_starts_on",
          "l.event_ends_on",
          "a.name as agency_name",
        );
      if (!link) {
        return res.status(404).json({
          success: false,
          error: "OPEN_CALL_LINK_NOT_FOUND",
          message: "No open call link with that id.",
        });
      }

      const report = await loadEventFunnelReport(linkId, { db });
      return res.json({
        success: true,
        data: {
          call: {
            id: link.id,
            code: link.code,
            label: link.label,
            callKind: link.call_kind,
            // A representation link reports its (empty) funnel rather than
            // 404ing: "this link records nothing" is a real answer to
            // "why are there no numbers for this call".
            isEventCall: isEventCall(link),
            eventName: link.event_name || null,
            eventStartsOn: link.event_starts_on || null,
            eventEndsOn: link.event_ends_on || null,
            agencyId: link.agency_id,
            agencyName: link.agency_name || null,
          },
          funnel: report,
        },
      });
    }),
  );

  return router;
}

const router = createEventFunnelRouter();

module.exports = router;
module.exports.createEventFunnelRouter = createEventFunnelRouter;
