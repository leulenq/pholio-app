// src/domains/agency/routes/overview.js
"use strict";

const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { getSessionAgencyId } = require("../services/context");
const {
  getPendingReview,
  getActiveCastings,
  getRosterSize,
  getPlacementRate,
  getPipeline,
  getTalentMix,
  getAlerts,
  getPulse,
  getActiveUtilization,
} = require("../queries/overview.queries");

/**
 * GET /api/agency/overview
 *
 * Returns aggregated KPI, pipeline, talent mix, pulse, and alert data
 * for the Agency Overview tab. All 9 queries run in parallel.
 *
 * Auth: requireRole('AGENCY')
 */
router.get("/api/agency/overview", requireRole("AGENCY"), async (req, res) => {
  try {
    const agencyId = getSessionAgencyId(req.session);
    if (!agencyId)
      return res.status(401).json({ success: false, error: "Unauthorized" });

    const [
      pendingReview,
      activeCastings,
      rosterSize,
      placementRate,
      pipeline,
      talentMix,
      alerts,
      pulse,
      utilization,
    ] = await Promise.all([
      getPendingReview(knex, agencyId),
      getActiveCastings(knex, agencyId),
      getRosterSize(knex, agencyId),
      getPlacementRate(knex, agencyId),
      getPipeline(knex, agencyId),
      getTalentMix(knex, agencyId),
      getAlerts(knex, agencyId),
      getPulse(knex, agencyId),
      getActiveUtilization(knex, agencyId),
    ]);

    return res.json({
      success: true,
      data: {
        kpis: {
          pendingReview,
          activeCastings,
          rosterSize,
          placementRate,
          utilization,
        },
        pipeline,
        talentMix,
        alerts,
        pulse,
      },
    });
  } catch (err) {
    console.error("[AgencyOverview] Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
});

module.exports = router;
