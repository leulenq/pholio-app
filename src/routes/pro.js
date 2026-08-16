const express = require('express');
const { requireRole } = require('../domains/auth/middleware/require-auth');

const router = express.Router();

/**
 * Legacy entry point. The upgrade surface is the React settings membership
 * panel; the EJS view this route used to render no longer exists (it 500'd).
 * Redirect instead of rendering, so old links keep working.
 */
const SUBSCRIPTION_SETTINGS_PATH = '/dashboard/talent/settings/subscription';

router.get('/pro/upgrade', requireRole('TALENT'), (req, res) => {
  return res.redirect(302, SUBSCRIPTION_SETTINGS_PATH);
});

module.exports = router;
