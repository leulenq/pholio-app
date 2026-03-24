const express = require('express');
const router = express.Router();
const knex = require('../../shared/db/knex');
const { requireRole } = require('../../middleware/auth');
const { ensureUniqueSlug } = require('../../shared/lib/slugify');
const { asyncHandler } = require('../../shared/middleware/error-handler');

/**
 * GET /api/talent/settings
 * Get talent settings (slug, visibility, notifications)
 */
router.get('/settings', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  const user = await knex('users').where({ id: req.session.userId }).first();
  
  if (!profile) {
    return res.json({
      success: true,
      settings: {
        slug: null,
        isPublic: false,
        isDiscoverable: false,
        notifications: {} 
      }
    });
  }

  return res.json({
    success: true,
    settings: {
      slug: profile.slug,
      isPublic: !!profile.is_public,
      isDiscoverable: !!profile.is_discoverable,
      notifications: {} // Placeholder for future implementation
    }
  });
}));

/**
 * PUT /api/talent/settings
 * Update settings
 */
router.put('/settings', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const { slug, isPublic, notifications } = req.body;
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  
  if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

  const updateData = { updated_at: knex.fn.now() };

  if (slug !== undefined) {
    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (cleanSlug && cleanSlug !== profile.slug) {
      updateData.slug = await ensureUniqueSlug(knex, 'profiles', cleanSlug);
    }
  }

  if (isPublic !== undefined) {
    updateData.is_public = !!isPublic;
    // Legacy mapping: if setting is_public=true, assume discoverable? Or keep separate?
    // Plan separates discoverability into applications.api.js or similar.
    // We'll keep them somewhat linked or just update is_public here.
  }

  if (Object.keys(updateData).length > 1) { // updated_at is always there
    await knex('profiles').where({ id: profile.id }).update(updateData);
  }

  // Handle notifications update if we had a table for it
  
  const updatedProfile = await knex('profiles').where({ id: profile.id }).first();
  
  return res.json({
    success: true,
    settings: {
      slug: updatedProfile.slug,
      isPublic: !!updatedProfile.is_public,
      isDiscoverable: !!updatedProfile.is_discoverable,
      notifications: notifications || {}
    }
  });
}));

module.exports = router;
