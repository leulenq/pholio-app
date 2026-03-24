const express = require('express');
const router = express.Router();
const knex = require('../../shared/db/knex');
const { requireRole } = require('../../middleware/auth');
const { getDefaultTheme, getTheme, getAllThemes, getFreeThemes, getProThemes, getAvailableFonts, getAvailableColorPalettes } = require('../../lib/themes');
const { getAllLayoutPresets } = require('../../lib/pdf-layouts');
const { asyncHandler } = require('../../shared/middleware/error-handler');

/**
 * GET /api/talent/pdf-customization
 * Get PDF customization options and current state
 */
router.get('/pdf-customization', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  
  if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });
  
  // Customizations
  let customizations = {};
  if (profile.pdf_customizations) {
    try {
      customizations = typeof profile.pdf_customizations === 'string' 
        ? JSON.parse(profile.pdf_customizations) 
        : profile.pdf_customizations;
    } catch (e) {
      customizations = {};
    }
  }

  const currentTheme = profile.pdf_theme || getDefaultTheme();

  return res.json({
    success: true,
    data: {
      customizations,
      currentTheme,
      themes: {
        all: getAllThemes(),
        free: getFreeThemes(),
        pro: getProThemes()
      },
      fonts: getAvailableFonts(),
      palettes: getAvailableColorPalettes(),
      layouts: getAllLayoutPresets(),
      isPro: !!profile.is_pro
    }
  });
}));

/**
 * PUT /api/talent/pdf-customization
 * Update PDF customizations (Studio+ only)
 */
router.put('/pdf-customization', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const { theme, customizations } = req.body;
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  
  if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });
  if (!profile.is_pro) return res.status(403).json({ success: false, message: 'Studio+ required' });

  const updateData = { updated_at: knex.fn.now() };

  if (theme !== undefined) updateData.pdf_theme = theme;
  
  if (customizations !== undefined) {
    const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
    if (isPostgres) {
       updateData.pdf_customizations = customizations;
    } else {
       updateData.pdf_customizations = JSON.stringify(customizations);
    }
  }

  await knex('profiles').where({ id: profile.id }).update(updateData);

  return res.json({ success: true, message: 'PDF customizations saved' });
}));

module.exports = router;
