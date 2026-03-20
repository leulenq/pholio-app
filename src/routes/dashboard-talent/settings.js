/**
 * Settings Routes for Talent Dashboard
 * 
 * Handles settings pages and updates
 */

const express = require('express');
const knex = require('../../db/knex');
const { requireRole } = require('../../middleware/auth');
const { addMessage } = require('../../middleware/context');
const { ensureUniqueSlug } = require('../../lib/slugify');
const { getDefaultTheme, getTheme, getAllThemes, getFreeThemes, getProThemes, getAvailableFonts, getAvailableColorPalettes } = require('../../lib/themes');
const { getAllLayoutPresets } = require('../../lib/pdf-layouts');
const { asyncHandler } = require('../../middleware/error-handler');

const router = express.Router();

/**
 * GET /dashboard/pdf-customizer
 * PDF customizer page (Studio+ only)
 */
router.get('/dashboard/pdf-customizer', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  
  if (!profile) {
    addMessage(req, 'error', 'Profile not found.');
    return res.redirect('/apply');
  }
  
  if (!profile.is_pro) {
    addMessage(req, 'error', 'Studio+ account required to customize PDF comp cards.');
    return res.redirect('/dashboard/talent');
  }
  
  // Load customizations
  let customizations = null;
  if (profile.pdf_customizations) {
    try {
      customizations = typeof profile.pdf_customizations === 'string'
        ? JSON.parse(profile.pdf_customizations)
        : profile.pdf_customizations;
    } catch (err) {
      console.error('Error parsing customizations:', err);
      customizations = null;
    }
  }
  
  // Get current theme
  const currentTheme = profile.pdf_theme || getDefaultTheme();
  const theme = getTheme(currentTheme);
  
  // Get all themes, fonts, color palettes, and layouts
  const allThemes = getAllThemes();
  const freeThemes = getFreeThemes();
  const proThemes = getProThemes();
  const availableFonts = getAvailableFonts();
  const colorPalettes = getAvailableColorPalettes();
  const layoutPresets = getAllLayoutPresets();
  
  const currentUser = await knex('users')
    .where({ id: req.session.userId })
    .first();
  
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  return res.render('dashboard/pdf-customizer', {
    title: 'PDF Customizer',
    profile,
    customizations: customizations || {},
    currentTheme,
    theme,
    allThemes,
    freeThemes,
    proThemes,
    availableFonts,
    colorPalettes,
    layoutPresets,
    user: currentUser,
    currentUser,
    isDashboard: true,
    layout: 'layouts/dashboard',
    baseUrl,
    profileSlug: profile.slug
  });
}));

/**
 * GET /dashboard/settings
 * Main settings page
 */
router.get('/dashboard/settings', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  const currentUser = await knex('users')
    .where({ id: req.session.userId })
    .first();
  
  // Allow settings access even without profile - user can set account preferences
  return res.render('dashboard/settings/index', {
    title: 'Settings',
    profile: profile || null,
    user: currentUser,
    currentUser,
    currentPage: 'settings',
    layout: 'layouts/dashboard',
    section: 'account' // Default section
  });
}));

/**
 * GET /dashboard/settings/:section
 * Settings section page
 */
router.get('/dashboard/settings/:section', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const { section } = req.params;
  const validSections = ['account', 'profile', 'notifications', 'privacy', 'billing'];
  
  if (!validSections.includes(section)) {
    addMessage(req, 'error', 'Invalid settings section.');
    return res.redirect('/dashboard/settings');
  }
  
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  const currentUser = await knex('users')
    .where({ id: req.session.userId })
    .first();
  
  // Allow settings access even without profile - user can set account preferences
  return res.render('dashboard/settings/index', {
    title: `${section.charAt(0).toUpperCase() + section.slice(1)} Settings`,
    profile: profile || null,
    user: currentUser,
    currentUser,
    currentPage: 'settings',
    layout: 'layouts/dashboard',
    section
  });
}));

/**
 * POST /dashboard/settings/slug
 * Update portfolio slug
 */
router.post('/dashboard/settings/slug', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const { slug } = req.body;
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  
  if (!profile) {
    addMessage(req, 'error', 'Profile not found.');
    return res.redirect('/dashboard/settings');
  }
  
  if (!slug || slug.trim().length === 0) {
    addMessage(req, 'error', 'Portfolio slug is required.');
    return res.redirect('/dashboard/settings/profile');
  }
  
  const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  
  if (cleanSlug !== profile.slug) {
    const uniqueSlug = await ensureUniqueSlug(knex, 'profiles', cleanSlug);
    await knex('profiles')
      .where({ id: profile.id })
      .update({ slug: uniqueSlug, updated_at: knex.fn.now() });
    
    addMessage(req, 'success', 'Portfolio slug updated successfully.');
  }
  
  return res.redirect('/dashboard/settings/profile');
}));

/**
 * POST /dashboard/settings/visibility
 * Update profile visibility
 */
router.post('/dashboard/settings/visibility', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const { visibility } = req.body;
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  
  if (!profile) {
    addMessage(req, 'error', 'Profile not found.');
    return res.redirect('/dashboard/settings');
  }
  
  const isPublic = visibility === 'public';
  
  // Check if is_public column exists before updating
  try {
    await knex('profiles')
      .where({ id: profile.id })
      .update({ 
        is_public: isPublic,
        updated_at: knex.fn.now()
      });
    
    addMessage(req, 'success', `Profile visibility set to ${isPublic ? 'public' : 'private'}.`);
  } catch (error) {
    // Column might not exist in older database schemas
    console.warn('[Settings] is_public column may not exist:', error.message);
    addMessage(req, 'info', 'Visibility setting not available in this version.');
  }
  
  return res.redirect('/dashboard/settings/privacy');
}));

module.exports = router;
