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
 *   board     <uuid>             scope the compatible lens to one package/division
 *   timezone  <IANA zone>        browser fallback when agency setup has no zone
 *
 * Aggregate inputs obey the same minor-submission visibility gate as roster,
 * inbox, and activity reads. Small filtered cohorts can otherwise disclose a
 * restricted submission even when names are omitted.
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
        requestedTimeZone: req.query.timezone || null,
        allowMinorSubmissions: req.allowMinorSubmissions,
      });

      return res.json({ success: true, data: analytics });
    } catch (error) {
      if (error?.code === "ANALYTICS_INVALID_BOARD") {
        return res.status(400).json({
          success: false,
          error: "The selected analytics board is no longer available.",
          code: error.code,
        });
      }
      if (
        error?.statusCode === 400 &&
        [
          "ANALYTICS_INVALID_RANGE",
          "ANALYTICS_INVALID_TIMEZONE",
        ].includes(error.code)
      ) {
        return res.status(400).json({
          success: false,
          error: "The analytics request is invalid.",
          code: error.code,
        });
      }
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
