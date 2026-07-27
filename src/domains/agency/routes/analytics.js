// src/domains/agency/routes/analytics.js
"use strict";

const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const { getSessionAgencyId } = require("../services/context");
const { buildSeasonAnalytics } = require("../queries/season.queries");

mountAgencyApiGuard(router);

/**
 * GET /api/agency/analytics/season
 *
 * The Season surface: pipeline flow, intake rhythm, queue health, match
 * calibration, board performance, desk operations, and roster composition —
 * every section a real aggregate over the agency's own rows.
 *
 * Query:
 *   range  30 | 90 | 365 | 730   (default 90)
 *   board  <uuid>                scope every section to one board
 *   tz     offset minutes        Date#getTimezoneOffset() from the browser, so
 *                                day and hour buckets match the desk's calendar
 *
 * Aggregates only — no talent identity leaves this endpoint, so the
 * minor-submission visibility gates that scope the roster and inbox reads have
 * nothing to redact here.
 *
 * Auth: requireRole('AGENCY') + org.view_analytics (route-permissions.js)
 */
router.get(
  "/api/agency/analytics/season",
  requireRole("AGENCY"),
  async (req, res) => {
    try {
      const agencyId = getSessionAgencyId(req.session);
      if (!agencyId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const analytics = await buildSeasonAnalytics(knex, {
        agencyId,
        range: req.query.range,
        boardId: req.query.board || null,
        tzOffsetMinutes: Number.parseInt(req.query.tz, 10) || 0,
      });

      return res.json({ success: true, data: analytics });
    } catch (error) {
      console.error("[AgencySeasonAnalytics] Error:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to load season analytics",
        details:
          process.env.NODE_ENV !== "production" ? error.message : undefined,
      });
    }
  },
);

module.exports = router;
