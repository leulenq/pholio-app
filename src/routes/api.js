const express = require('express');
const router = express.Router();
const knex = require('../db/knex');
const { requireRole } = require('../middleware/auth');

/**
 * GET /api/talent/applications
 * Returns applications for the current talent user
 */
router.get('/talent/applications', requireRole('TALENT'), async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Get talent profile id
    const profile = await knex('profiles').where({ user_id: userId }).first();
    
    if (!profile) {
      return res.json([]);
    }

    // Fetch applications
    const applications = await knex('applications')
      .leftJoin('agencies', 'applications.agency_id', 'agencies.id')
      .leftJoin('agency_memberships as am', function () {
        this.on('am.agency_id', '=', 'agencies.id')
          .andOn('am.membership_role', '=', knex.raw('?', ['OWNER']))
          .andOn('am.status', '=', knex.raw('?', ['ACTIVE']));
      })
      .leftJoin('users', 'am.user_id', 'users.id')
      .where({ 'applications.profile_id': profile.id })
      .select(
        'applications.id',
        'applications.status',
        'applications.created_at as createdAt',
        'agencies.name as agencyName',
        'users.email as agencyEmail' // Fallback if name is missing
      )
      .orderBy('applications.created_at', 'desc');

    res.json(applications);
  } catch (error) {
    console.error('[API] Error fetching applications:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

/**
 * GET /api/analytics/talent
 * Stub for talent analytics
 */
router.get('/analytics/talent', requireRole('TALENT'), async (req, res) => {
  // Stub response for now
  res.json({
    success: true,
    analytics: {
      views: { total: 0, thisWeek: 0, thisMonth: 0 },
      downloads: { total: 0, thisWeek: 0, thisMonth: 0, byTheme: [] }
    }
  });
});

/**
 * GET /api/activity/talent
 * Stub for talent activity feed
 */
router.get('/activity/talent', requireRole('TALENT'), async (req, res) => {
  // Stub response for now
  res.json({
    success: true,
    activities: []
  });
});

/**
 * POST /api/talent/discoverability
 * Update discoverability setting
 */
router.post('/talent/discoverability', requireRole('TALENT'), async (req, res) => {
  try {
    const { isDiscoverable } = req.body;
    const userId = req.session.userId;
    
    await knex('profiles')
      .where({ user_id: userId })
      .update({ 
        is_discoverable: isDiscoverable,
        updated_at: knex.fn.now()
      });
      
    res.json({ success: true, isDiscoverable });
  } catch (error) {
    console.error('[API] Error updating discoverability:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
