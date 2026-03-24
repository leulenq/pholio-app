/**
 * Applications Routes for Talent Dashboard
 * 
 * Handles application-related API endpoints
 */

const express = require('express');
const knex = require('../../db/knex');
const { requireRole } = require('../../middleware/auth');
const { asyncHandler, createErrorResponse, createSuccessResponse } = require('../../middleware/error-handler');

const router = express.Router();

/**
 * GET /api/talent/applications
 * Get all applications for the talent's profile
 */
router.get('/api/talent/applications', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const profile = await knex('profiles')
    .where({ user_id: req.session.userId })
    .first();

  if (!profile) {
    return res.json([]);
  }

  const applications = await knex('applications')
    .select(
      'applications.*',
      'agencies.name as agency_name',
      'users.email as agency_email'
    )
    .leftJoin('agencies', 'applications.agency_id', 'agencies.id')
    .leftJoin('agency_memberships as am', function () {
      this.on('am.agency_id', '=', 'agencies.id')
        .andOn('am.membership_role', '=', knex.raw('?', ['OWNER']))
        .andOn('am.status', '=', knex.raw('?', ['ACTIVE']));
    })
    .leftJoin('users', 'am.user_id', 'users.id')
    .where({ profile_id: profile.id })
    .orderBy('applications.created_at', 'desc');

  return res.json(applications.map(app => ({
    id: app.id,
    agencyName: app.agency_name || app.agency_email,
    agencyEmail: app.agency_email,
    status: app.status || 'pending',
    createdAt: app.created_at,
    acceptedAt: app.accepted_at,
    declinedAt: app.declined_at,
    invitedByAgency: !!app.invited_by_agency_id
  })));
}));

/**
 * POST /api/talent/discoverability
 * Toggle profile discoverability (Studio+ only)
 */
router.post('/api/talent/discoverability', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const { isDiscoverable } = req.body;
  const profile = await knex('profiles')
    .where({ user_id: req.session.userId })
    .first();

  if (!profile) {
    return res.status(404).json(createErrorResponse(
      new Error('Profile not found')
    ));
  }

  // Check if user has Studio+ subscription
  if (!profile.is_pro) {
    return res.status(403).json(createErrorResponse(
      new Error('Studio+ subscription required to enable discoverability')
    ));
  }

  // Update discoverability
  await knex('profiles')
    .where({ id: profile.id })
    .update({ is_discoverable: !!isDiscoverable });

  return res.json(createSuccessResponse({
    isDiscoverable: !!isDiscoverable
  }, 'Discoverability updated successfully'));
}));

module.exports = router;
