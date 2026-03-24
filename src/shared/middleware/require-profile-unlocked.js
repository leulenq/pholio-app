/**
 * Middleware: Require Profile Unlocked
 * Blocks access to services (comp card, agency applications, portfolio) if services_locked is true
 */

const knex = require('../db/knex');
const { addMessage } = require('./context');

/**
 * Middleware to require profile to be unlocked (essentials complete)
 * Redirects to dashboard with message if locked
 */
async function requireProfileUnlocked(req, res, next) {
  try {
    // Only check for TALENT users
    if (!req.session || req.session.role !== 'TALENT' || !req.session.userId) {
      return next();
    }

    const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
    
    if (!profile) {
      addMessage(req, 'error', 'Profile not found. Please complete onboarding.');
      return res.redirect('/onboarding');
    }

    // Check if services are locked
    if (profile.services_locked) {
      addMessage(req, 'info', 'Finish essentials to unlock Pholio services.');
      return res.redirect('/dashboard/talent');
    }

    // Services unlocked, continue
    next();
  } catch (error) {
    console.error('[Require Profile Unlocked] Error:', error);
    // On error, allow through (don't block on errors)
    next();
  }
}

module.exports = {
  requireProfileUnlocked
};
