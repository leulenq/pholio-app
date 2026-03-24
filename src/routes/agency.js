const express = require('express');
const knex = require('../db/knex');
const { requireRole } = require('../middleware/auth');
const { addMessage } = require('../middleware/context');
const { sendRejectedApplicantEmail, sendApplicationStatusChangeEmail, sendAgencyInviteEmail } = require('../lib/email');
const { getSessionActorUserId, getSessionAgencyId } = require('../lib/agency-context');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();


// POST /agency/claim - Claim a talent for commission tracking
router.post('/agency/claim', requireRole('AGENCY'), async (req, res, next) => {
  try {
    const agencyId = getSessionAgencyId(req.session);
    const { slug } = req.body;

    if (!slug) {
      if (req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ error: 'Talent slug is required' });
      }
      addMessage(req, 'error', 'Invalid talent selection');
      return res.redirect('/dashboard/agency');
    }

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

    if (profile.partner_agency_id && profile.partner_agency_id !== agencyId) {
      if (req.headers.accept?.includes('application/json')) {
        return res.status(409).json({ error: 'Talent already claimed by another agency' });
      }
      addMessage(req, 'error', 'This talent has already been claimed by another agency');
      return res.redirect('/dashboard/agency');
    }

    await knex('profiles')
      .where({ id: profile.id })
      .update({
        partner_agency_id: agencyId,
        partner_claimed_at: knex.fn.now(),
        updated_at: knex.fn.now()
      });

    const talentName = `${profile.first_name} ${profile.last_name}`;

    if (req.headers.accept?.includes('application/json')) {
      return res.json({
        success: true,
        talent: talentName,
        message: profile.partner_agency_id === agencyId
          ? 'Claim refreshed successfully'
          : 'Talent claimed successfully'
      });
    }

    addMessage(
      req,
      'success',
      profile.partner_agency_id === agencyId
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

// POST /dashboard/agency/applications/:applicationId/accept
// POST /dashboard/agency/applications/:applicationId/decline
// POST /dashboard/agency/applications/:applicationId/archive
router.post('/dashboard/agency/applications/:applicationId/:action', requireRole('AGENCY'), async (req, res, next) => {
  try {
    const agencyId = getSessionAgencyId(req.session);
    const actorUserId = getSessionActorUserId(req.session);
    const { applicationId, action } = req.params;

    if (!['accept', 'archive', 'decline'].includes(action)) {
      if (req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ error: 'Invalid action' });
      }
      addMessage(req, 'error', 'Invalid action');
      return res.redirect('/dashboard/agency/applicants');
    }

    const application = await knex('applications')
      .where({ id: applicationId, agency_id: agencyId })
      .first();

    if (!application) {
      if (req.headers.accept?.includes('application/json')) {
        return res.status(404).json({ error: 'Application not found' });
      }
      addMessage(req, 'error', 'Application not found');
      return res.redirect('/dashboard/agency/applicants');
    }

    const updateData = {
      status: action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'archived',
      updated_at: knex.fn.now()
    };

    if (action === 'accept') {
      updateData.accepted_at = knex.fn.now();
      updateData.declined_at = null;
    } else if (action === 'decline') {
      updateData.declined_at = knex.fn.now();
      updateData.accepted_at = null;
    } else {
      updateData.declined_at = null;
      updateData.accepted_at = null;
    }

    await knex('applications')
      .where({ id: applicationId })
      .update(updateData);

    try {
      const profile = await knex('profiles')
        .where({ id: application.profile_id })
        .first();
      
      if (profile) {
        const talentUser = await knex('users')
          .where({ id: profile.user_id })
          .first();
        
        const [agency, actorUser] = await Promise.all([
          knex('agencies').where({ id: agencyId }).first(),
          knex('users').where({ id: actorUserId }).first()
        ]);

        if (talentUser && agency) {
          if (action === 'decline') {
            await sendRejectedApplicantEmail({
              talentEmail: talentUser.email,
              talentName: `${profile.first_name} ${profile.last_name}`,
              agencyName: agency.name,
              agencyEmail: actorUser?.email || null
            });
          } else if (action === 'accept') {
            await sendApplicationStatusChangeEmail({
              talentEmail: talentUser.email,
              talentName: `${profile.first_name} ${profile.last_name}`,
              agencyName: agency.name,
              status: 'accepted'
            });
          }
        }
      }
    } catch (emailError) {
      console.error('[Application] Email send error:', emailError);
    }

    if (req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, action });
    }

    addMessage(req, 'success', `Application ${action}ed successfully`);
    return res.redirect('/dashboard/agency/applicants');
  } catch (error) {
    console.error('[Application] Error:', error);
    return next(error);
  }
});

// GET /api/agency/discover/:profileId/preview - Get profile preview data
router.get('/api/agency/discover/:profileId/preview', requireRole('AGENCY'), async (req, res, next) => {
  try {
    const { profileId } = req.params;

    const profile = await knex('profiles')
      .where({ id: profileId, is_discoverable: true })
      .first();

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found or not discoverable' });
    }

    // Get images
    const images = await knex('images')
      .where({ profile_id: profileId })
      .orderBy(['sort', 'created_at'])
      .limit(5);

    return res.json({
      success: true,
      profile: {
        ...profile,
        images: images.map(img => ({
          path: img.path.startsWith('http') ? img.path : '/' + img.path,
          alt: img.alt || `${profile.first_name} ${profile.last_name}`
        }))
      }
    });
  } catch (error) {
    console.error('[Discover Preview] Error:', error);
    return res.status(500).json({ error: 'Failed to load profile preview' });
  }
});

// POST /dashboard/agency/discover/:profileId/invite - Invite talent from Discover
router.post('/dashboard/agency/discover/:profileId/invite', requireRole('AGENCY'), async (req, res, next) => {
  try {
    const { profileId } = req.params;
    const agencyId = getSessionAgencyId(req.session);

    const profile = await knex('profiles')
      .where({ id: profileId, is_discoverable: true })
      .first();

    if (!profile) {
      if (req.headers.accept?.includes('application/json')) {
        return res.status(404).json({ error: 'Profile not found or not discoverable' });
      }
      addMessage(req, 'error', 'Profile not found or not discoverable');
      return res.redirect('/dashboard/agency/discover');
    }

    const existingApplication = await knex('applications')
      .where({ profile_id: profileId, agency_id: agencyId })
      .first();

    if (existingApplication) {
      if (req.headers.accept?.includes('application/json')) {
        return res.status(409).json({ error: 'Application already exists' });
      }
      addMessage(req, 'error', 'You have already invited this talent');
      return res.redirect('/dashboard/agency/discover');
    }

    const applicationId = uuidv4();
    await knex('applications').insert({
      id: applicationId,
      profile_id: profileId,
      agency_id: agencyId,
      status: 'pending',
      invited_by_agency_id: agencyId,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    });

    try {
      const talentUser = await knex('users')
        .where({ id: profile.user_id })
        .first();
      
      const agency = await knex('agencies')
        .where({ id: agencyId })
        .first();

      if (talentUser && agency) {
        await sendAgencyInviteEmail({
          talentEmail: talentUser.email,
          talentName: `${profile.first_name} ${profile.last_name}`,
          agencyName: agency.name
        });
      }
    } catch (emailError) {
      console.error('[Discover Invite] Email send error:', emailError);
    }

    if (req.headers.accept?.includes('application/json')) {
      return res.json({ success: true });
    }

    addMessage(req, 'success', `Invitation sent to ${profile.first_name} ${profile.last_name}`);
    return res.redirect('/dashboard/agency/discover');
  } catch (error) {
    console.error('[Discover Invite] Error:', error);
    return next(error);
  }
});

module.exports = router;
