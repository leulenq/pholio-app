const {
  requireRole,
  requireAgencyOnboardingComplete,
  requireAgencyLegalAcceptance,
  loadAgencyPermissions,
  enforceAgencyRoutePermissions,
} = require("../../auth/middleware/require-auth");
const knex = require("../../../shared/db/knex");
const config = require("../../../config");
const {
  enforceMinorSubmissionAccess,
} = require("../services/minor-submission-access");

const AGENCY_ONBOARDING_ALLOW = [
  { method: "GET", path: "/me" },
  { method: "GET", path: "/legal-status" },
  { method: "POST", path: "/legal-acceptance" },
  { method: "GET", path: "/setup" },
  { method: "PATCH", pathPrefix: "/setup/" },
  { method: "POST", path: "/setup/complete" },
  { method: "POST", path: "/import-jobs" },
  // The setup flow invites bookers before the workspace opens. Only the
  // onboarding-complete gate is lifted here; role and route-permission checks
  // below still apply to these calls.
  { method: "GET", path: "/team" },
  { method: "POST", path: "/team" },
];

function mountAgencyApiGuard(router) {
  router.use(
    "/api/agency",
    requireRole("AGENCY"),
    requireAgencyOnboardingComplete({
      allow: AGENCY_ONBOARDING_ALLOW,
    }),
    requireAgencyLegalAcceptance(),
    loadAgencyPermissions,
    enforceAgencyRoutePermissions(),
    config.minorSubmissionEnforce
      ? enforceMinorSubmissionAccess(knex)
      : (_req, _res, next) => next(),
  );
}

module.exports = { mountAgencyApiGuard, AGENCY_ONBOARDING_ALLOW };
