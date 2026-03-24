/**
 * Onboarding Redirect Middleware
 *
 * Redirects talent users who haven't completed onboarding to /onboarding.
 * Applied to dashboard routes to ensure users complete onboarding first.
 */

const knex = require("../db/knex");

const OnboardingAnalytics = require("../../domains/onboarding/analytics/onboarding-events");
const {
  getCurrentStep,
} = require("../../domains/onboarding/services/state-machine");

/**
 * Middleware to require onboarding completion for talent users
 *
 * If user is TALENT and onboarding is not completed, redirect to /onboarding.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function requireOnboardingComplete(req, res, next) {
  try {
    // Only apply to talent users
    if (req.session && req.session.role === "TALENT" && req.session.userId) {
      const profile = await knex("profiles")
        .where({ user_id: req.session.userId })
        .first();

      if (profile && !profile.onboarding_completed_at) {
        const currentStep = getCurrentStep(profile);

        // Double check state machine - if they are in 'done' state, let them through
        // to avoid redirect loop during the completion process
        if (currentStep === "done") {
          return next();
        }

        // Track re-entry via analytics
        await OnboardingAnalytics.trackEntry(
          profile.id,
          currentStep || "identity",
          {
            reason: "redirect_middleware",
            original_url: req.originalUrl,
          },
        );

        // For API requests, return 403 instead of redirecting
        const isApi =
          req.path.startsWith("/api/") ||
          req.xhr ||
          (req.get("accept") && req.get("accept").includes("application/json"));
        if (isApi) {
          return res.status(403).json({
            error: "onboarding_required",
            message: "Onboarding required",
            current_step: currentStep,
          });
        }

        // Onboarding not completed, redirect to /onboarding
        return res.redirect("/onboarding");
      }
    }

    // Onboarding complete or not a talent user, continue
    next();
  } catch (error) {
    console.error("[Onboarding Redirect Middleware] Error:", error);
    next();
  }
}

module.exports = {
  requireOnboardingComplete,
};
