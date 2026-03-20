// src/routes/api/agency-overview.js
'use strict'

const express   = require('express')
const router    = express.Router()
const knex      = require('../../db/knex')
const { requireRole } = require('../../middleware/auth')
const {
  getPendingReview,
  getActiveCastings,
  getRosterSize,
  getPlacementRate,
  getPipeline,
  getTalentMix,
  getAlerts,
} = require('../../lib/agency-overview-queries')

/**
 * GET /api/agency/overview
 *
 * Returns aggregated KPI, pipeline, talent mix, and alert data
 * for the Agency Overview tab. All 7 queries run in parallel.
 *
 * Auth: requireRole('AGENCY') — also verifies session via ensureSignedIn internally.
 */
router.get('/api/agency/overview', requireRole('AGENCY'), async (req, res) => {
  try {
    const agencyId = req.session.userId
    if (!agencyId) return res.status(401).json({ success: false, error: 'Unauthorized' })

    const [
      pendingReview,
      activeCastings,
      rosterSize,
      placementRate,
      pipeline,
      talentMix,
      alerts,
    ] = await Promise.all([
      getPendingReview(knex,   agencyId),
      getActiveCastings(knex,  agencyId),
      getRosterSize(knex,      agencyId),
      getPlacementRate(knex,   agencyId),
      getPipeline(knex,        agencyId),
      getTalentMix(knex,       agencyId),
      getAlerts(knex,          agencyId),
    ])

    return res.json({
      success: true,
      data: {
        kpis: { pendingReview, activeCastings, rosterSize, placementRate },
        pipeline,
        talentMix,
        alerts,
      },
    })
  } catch (err) {
    console.error('[AgencyOverview] Error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

module.exports = router
