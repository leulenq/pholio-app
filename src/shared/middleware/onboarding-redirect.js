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

function requestWantsApiResponse(req) {
  return (
    req.path.startsWith("/api/") ||
    !!req.xhr ||
    (req.get("accept") && req.get("accept").includes("application/json"))
  );
}

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

      const onboardingIncomplete = !profile || !profile.onboarding_completed_at;

      if (onboardingIncomplete) {
        const currentStep = profile ? getCurrentStep(profile) : "entry";

        // Double check state machine - if they are in 'done' state, let them through
        // to avoid redirect loop during the completion process (requires a profile row)
        if (profile && currentStep === "done") {
          return next();
        }

        // Track re-entry via analytics (no-op when profile row is missing)
        await OnboardingAnalytics.trackEntry(
          profile?.id,
          currentStep || "entry",
          {
            reason: "redirect_middleware",
            original_url: req.originalUrl,
            missing_profile: !profile,
          },
        );

        // For API requests, return 403 instead of redirecting
        if (requestWantsApiResponse(req)) {
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
    if (requestWantsApiResponse(req)) {
      return res.status(503).json({
        error: "service_unavailable",
        message:
          "Unable to verify onboarding status. Please try again in a moment.",
      });
    }
    if (req.accepts("html")) {
      return res
        .status(503)
        .send("Service temporarily unavailable. Please try again in a moment.");
    }
    return res.status(503).json({
      error: "service_unavailable",
      message:
        "Unable to verify onboarding status. Please try again in a moment.",
    });
  }
}

module.exports = {
  requireOnboardingComplete,
};
