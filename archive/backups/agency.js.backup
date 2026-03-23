// Create new file: src/routes/agency.js
// OR add to existing dashboard.js after agency dashboard GET route

const express = require('express');
const knex = require('../db/knex');
const { requireRole } = require('../middleware/auth');
const { addMessage } = require('../middleware/context');

const router = express.Router();

// POST /agency/claim - Claim a talent for commission tracking
router.post('/agency/claim', requireRole('AGENCY'), async (req, res, next) => {
  try {
    const { slug } = req.body;

    if (!slug) {
      if (req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ error: 'Talent slug is required' });
      }
      addMessage(req, 'error', 'Invalid talent selection');
      return res.redirect('/dashboard/agency');
    }

    // Find the profile
    const profile = await knex('profiles')
      .where({ slug })
      .first();

    if (!profile) {
      if (req.headers.accept?.includes('application/json')) {
        return res.status(404).json({ error: 'Talent not found' });
      }
      addMessage(req, 'error', 'Talent profile not found');
      return res.redirect('/dashboard/agency');
    }

    // Check if already claimed by someone else
    if (profile.partner_agency_id && profile.partner_agency_id !== req.session.userId) {
      if (req.headers.accept?.includes('application/json')) {
        return res.status(409).json({ error: 'Talent already claimed by another agency' });
      }
      addMessage(req, 'error', 'This talent has already been claimed by another agency');
      return res.redirect('/dashboard/agency');
    }

    // Update or refresh claim
    await knex('profiles')
      .where({ id: profile.id })
      .update({
        partner_agency_id: req.session.userId,
        partner_claimed_at: knex.fn.now(),
        updated_at: knex.fn.now()
      });

    const talentName = `${profile.first_name} ${profile.last_name}`;

    // JSON response for AJAX requests
    if (req.headers.accept?.includes('application/json')) {
      return res.json({
        success: true,
        talent: talentName,
        message: profile.partner_agency_id === req.session.userId
          ? 'Claim refreshed successfully'
          : 'Talent claimed successfully'
      });
    }

    // Regular form submission
    addMessage(
      req,
      'success',
      profile.partner_agency_id === req.session.userId
        ? `Claim for ${talentName} has been refreshed`
        : `You've successfully claimed ${talentName}`
    );

    return res.redirect('/dashboard/agency');
  } catch (error) {
    console.error('Agency claim error:', error);

    if (req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ error: 'Failed to claim talent' });
    }

    addMessage(req, 'error', 'An error occurred. Please try again.');
    return res.redirect('/dashboard/agency');
  }
});

module.exports = router;