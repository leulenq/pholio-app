const {
  requireRole,
  requireAgencyOnboardingComplete,
} = require("../../auth/middleware/require-auth");

const AGENCY_ONBOARDING_ALLOW = [
  { method: "GET", path: "/me" },
  { method: "PUT", path: "/profile" },
  { method: "POST", path: "/branding" },
  { method: "PUT", path: "/settings" },
  { method: "GET", path: "/team" },
  { method: "POST", path: "/team" },
  { method: "PATCH", pathPrefix: "/team/" },
  { method: "DELETE", pathPrefix: "/team/" },
  { method: "POST", path: "/onboarding/complete" },
];

function mountAgencyApiGuard(router) {
  router.use(
    "/api/agency",
    requireRole("AGENCY"),
    requireAgencyOnboardingComplete({
      allow: AGENCY_ONBOARDING_ALLOW,
    }),
  );
}

module.exports = { mountAgencyApiGuard, AGENCY_ONBOARDING_ALLOW };
