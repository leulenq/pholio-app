/**
 * Main Router for Talent Dashboard
 * 
 * Combines all talent dashboard route modules
 */

const express = require('express');
const profileRoutes = require('./profile');
const mediaRoutes = require('./media');
const analyticsRoutes = require('./analytics');
const settingsRoutes = require('./settings');
const applicationsRoutes = require('./applications');

const router = express.Router();

// Mount all route modules
router.use(profileRoutes);
router.use(mediaRoutes);
router.use(analyticsRoutes);
router.use(settingsRoutes);
router.use(applicationsRoutes);

module.exports = router;
