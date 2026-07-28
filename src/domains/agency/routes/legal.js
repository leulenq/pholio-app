const express = require("express");
const { requireRole } = require("../../auth/middleware/require-auth");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const {
  getAgencyLegalStatus,
  recordAgencyLegalAcceptance,
} = require("../services/legal-acceptance");
const { recordAuditEvent } = require("../services/audit");

const router = express.Router();
mountAgencyApiGuard(router);

function sendLegalGateError(res, error) {
  if (
    error.code !== "AGENCY_POLICY_MANIFEST_STALE" &&
    error.code !== "ACTIVE_AGENCY_MEMBERSHIP_REQUIRED" &&
    error.code !== "AGENCY_POLICY_MANIFEST_UNAVAILABLE"
  ) {
    return false;
  }
  res.status(error.status || 403).json({
    success: false,
    error: error.code,
    message: error.message,
  });
  return true;
}

router.get(
  "/api/agency/legal-status",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      return res.json({
        success: true,
        data: await getAgencyLegalStatus(req.session),
      });
    } catch (error) {
      if (sendLegalGateError(res, error)) return undefined;
      return next(error);
    }
  },
);

router.post(
  "/api/agency/legal-acceptance",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const data = await recordAgencyLegalAcceptance(req.session, req.body, {
        // req.clientIp first — req.ip is undefined under serverless-http, which
        // was storing legal acceptances with no IP on record.
        ipAddress: req.clientIp || req.ip || null,
        userAgent: req.get("user-agent"),
      });
      await recordAuditEvent({
        agencyId: req.session.agencyId || req.session.userId,
        actorMembershipId: req.session.agencyMembershipId || null,
        actorUserId: req.session.memberUserId || req.session.userId,
        eventType: "agency_legal_acceptance",
        targetType: "agency_member",
        targetId: req.session.memberUserId || req.session.userId,
        summary: "Agency member accepted current workspace policies",
        afterState: {
          manifestVersion: data.manifestVersion,
          versions: data.versions,
        },
        req,
      });
      return res.json({ success: true, data });
    } catch (error) {
      if (sendLegalGateError(res, error)) return undefined;
      return next(error);
    }
  },
);

module.exports = router;
