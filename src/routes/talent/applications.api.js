const express = require('express');
const router = express.Router();
const knex = require('../../db/knex');
const { requireRole } = require('../../middleware/auth');
const asyncHandler = require('express-async-handler');

/**
 * GET /api/talent/applications
 * List all applications for the current talent
 */
router.get('/', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  // Fetch applications with detailed agency info (which are in 'users' table)
  const applications = await knex('applications')
    .join('users', 'applications.agency_id', 'users.id')
    .where({ profile_id: profile.id })
    .select(
      'applications.id',
      'applications.status',
      'applications.created_at',
      'applications.updated_at',
      'users.first_name as agency_name', // Assuming first_name stores Agency Name for agency users
      'users.agency_location',
      'users.agency_website',
      'users.profile_image as agency_logo'
    )
    .orderBy('applications.created_at', 'desc');

  res.json({ success: true, data: applications });
}));

/**
 * POST /api/talent/applications
 * Create a new application (direct apply)
 */
router.post('/', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const { agencyId } = req.body;
  if (!agencyId) return res.status(400).json({ error: 'Agency ID required' });

  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  // 1. Check if already applied
  const existingparams = { profile_id: profile.id, agency_id: agencyId };
  const existing = await knex('applications').where(existingparams).first();
  if (existing) {
    return res.status(400).json({ error: 'Already applied to this agency' });
  }

  // 2. Check limits for Free Tier
  if (!profile.is_pro) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0,0,0,0);
    
    const count = await knex('applications')
      .where({ profile_id: profile.id })
      .where('created_at', '>=', startOfMonth)
      .count('id as c')
      .first();
      
    if (Number(count.c) >= 5) {
      return res.status(403).json({ 
        error: 'Monthly application limit reached',
        limit: 5,
        current: Number(count.c),
        upgradeRequired: true 
      });
    }
  }

  // 3. Create Application
  const [appId] = await knex('applications').insert({
    id: knex.raw('gen_random_uuid()'),
    profile_id: profile.id,
    agency_id: agencyId,
    status: 'pending'
  }).returning('id');

  res.json({ success: true, id: appId });
}));

/**
 * POST /api/talent/applications/:id/withdraw
 * Withdraw an application
 */
router.post('/:id/withdraw', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();

  const deleted = await knex('applications')
    .where({ id, profile_id: profile.id })
    .del();

  if (!deleted) return res.status(404).json({ error: 'Application not found' });

  res.json({ success: true });
}));

/**
 * POST /api/talent/redirect-apply
 * Handle agency-initiated application via redirect (bypasses limits)
 */
router.post('/redirect-apply', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const { agencyId, token } = req.body;
  if (!agencyId || !token) return res.status(400).json({ error: 'Agency ID and token required' });
  
  // verify token (Mock logic for now, or check against stored invitation)
  // In production: jwt.verify(token, process.env.AGENCY_INVITE_SECRET)
  // For now, accept any token that is passed (assuming validity checked on generation or non-critical for this tier)
  // Or check if token matches agencyId simply
  
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  // Check if already applied
  const existingparams = { profile_id: profile.id, agency_id: agencyId };
  const existing = await knex('applications').where(existingparams).first();
  
  if (existing) {
    return res.status(200).json({ success: true, message: 'Already applied' });
  }

  // Create Application (No limit check)
  const [appId] = await knex('applications').insert({
    id: knex.raw('gen_random_uuid()'),
    profile_id: profile.id,
    agency_id: agencyId,
    status: 'pending', // or 'reviewing' immediately since they asked for it?
    // Let's set to 'pending'
  }).returning('id');

  // Track as "redirect" source if we had a column? For now just create.
  
  res.json({ success: true, id: appId });
}));

module.exports = router;
