const {
  requireRole,
  requireAgencyOnboardingComplete,
  loadAgencyPermissions,
  enforceAgencyRoutePermissions,
} = require("../../auth/middleware/require-auth");

const AGENCY_ONBOARDING_ALLOW = [
  { method: "GET", path: "/me" },
  { method: "GET", path: "/setup" },
  { method: "PATCH", pathPrefix: "/setup/" },
  { method: "POST", path: "/setup/complete" },
  { method: "POST", path: "/import-jobs" },
];

function mountAgencyApiGuard(router) {
  router.use(
    "/api/agency",
    requireRole("AGENCY"),
    requireAgencyOnboardingComplete({
      allow: AGENCY_ONBOARDING_ALLOW,
    }),
    loadAgencyPermissions,
    enforceAgencyRoutePermissions(),
  );
}

module.exports = { mountAgencyApiGuard, AGENCY_ONBOARDING_ALLOW };
