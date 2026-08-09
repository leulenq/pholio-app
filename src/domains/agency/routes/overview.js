// src/domains/agency/routes/overview.js
"use strict";

const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const { getSessionAgencyId } = require("../services/context");
const {
  getPendingReview,
  getActiveCastings,
  getPipeline,
  getAlerts,
  getPulse,
} = require("../queries/overview.queries");

/**
 * GET /api/agency/overview
 *
 * Returns aggregated intake KPIs, pipeline, pulse, and alert data
 * for the Agency Overview tab.
 *
 * Auth: requireRole('AGENCY')
 */
mountAgencyApiGuard(router);

router.get("/api/agency/overview", requireRole("AGENCY"), async (req, res) => {
  try {
    const agencyId = getSessionAgencyId(req.session);
    if (!agencyId)
      return res.status(401).json({ success: false, error: "Unauthorized" });

    const [
      pendingReview,
      activeCastings,
      pipeline,
      alerts,
      pulse,
    ] = await Promise.all([
      getPendingReview(knex, agencyId),
      getActiveCastings(knex, agencyId),
      getPipeline(knex, agencyId),
      getAlerts(knex, agencyId),
      getPulse(knex, agencyId),
    ]);

    return res.json({
      success: true,
      data: {
        kpis: {
          pendingReview,
          activeCastings,
        },
        pipeline,
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
