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
const {
  requireActiveAgencyMember,
} = require("../services/legal-acceptance");

const AGENCY_ONBOARDING_ALLOW = [
  { method: "GET", path: "/me" },
  { method: "GET", path: "/legal-status" },
  { method: "POST", path: "/legal-acceptance" },
  { method: "GET", path: "/setup" },
  { method: "PATCH", pathPrefix: "/setup/" },
  { method: "POST", path: "/setup/complete" },
  // The setup flow invites bookers before the workspace opens. Only the
  // onboarding-complete gate is lifted here; role and route-permission checks
  // below still apply to these calls.
  { method: "GET", path: "/team" },
  { method: "POST", path: "/team" },
];

async function loadCurrentAgencyMembership(req, res, next) {
  if (req.currentAgencyMembership) {
    req.session.agencyMembershipRole =
      req.currentAgencyMembership.membershipRole;
    return next();
  }

  try {
    const actor = await requireActiveAgencyMember(req.session);
    req.session.agencyMembershipRole = actor.membershipRole;
    req.currentAgencyMembership = actor;
    return next();
  } catch (error) {
    if (error.code === "ACTIVE_AGENCY_MEMBERSHIP_REQUIRED") {
      return res.status(error.status || 403).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }
    return next(error);
  }
}

function mountAgencyApiGuard(router) {
  router.use(
    "/api/agency",
    requireRole("AGENCY"),
    loadCurrentAgencyMembership,
    requireAgencyOnboardingComplete({
      allow: AGENCY_ONBOARDING_ALLOW,
    }),
    requireAgencyLegalAcceptance(),
    loadAgencyPermissions,
    enforceAgencyRoutePermissions(),
    process.env.NODE_ENV !== "test" || config.minorSubmissionEnforce
      ? enforceMinorSubmissionAccess(knex)
      : (_req, _res, next) => next(),
  );
}

module.exports = {
  mountAgencyApiGuard,
  AGENCY_ONBOARDING_ALLOW,
  loadCurrentAgencyMembership,
};
