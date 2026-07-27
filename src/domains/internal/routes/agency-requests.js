"use strict";

const express = require("express");
const asyncHandler = require("express-async-handler");
const {
  createRequirePlatformAdmin,
} = require("../middleware/require-platform-admin");
const {
  createAgencyRequestReviewService,
  REVIEW_STATUSES,
} = require("../services/agency-request-review");

function cleanNotes(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    const error = new Error("Review notes must be text.");
    error.code = "INVALID_REVIEW_NOTES";
    error.status = 400;
    throw error;
  }
  const notes = value.trim();
  if (notes.length > 5000) {
    const error = new Error("Review notes must be 5,000 characters or fewer.");
    error.code = "INVALID_REVIEW_NOTES";
    error.status = 400;
    throw error;
  }
  return notes || null;
}

function cleanDeclineReason(value) {
  const reason = cleanNotes(value);
  if (!reason) {
    const error = new Error("A decline reason is required.");
    error.code = "DECLINE_REASON_REQUIRED";
    error.status = 400;
    throw error;
  }
  return reason;
}

function actorFromRequest(req) {
  return {
    userId: req.platformAdmin.user_id,
    email: req.session.email || null,
    ip: req.ip || null,
  };
}

function createAgencyRequestsRouter(options = {}) {
  const router = express.Router();
  const service =
    options.service || createAgencyRequestReviewService(options.dependencies);
  const requirePlatformAdmin =
    options.requirePlatformAdmin ||
    createRequirePlatformAdmin({ db: options.dependencies?.db });

  // Scope the staff guard to this internal namespace. This router is mounted
  // at `/`, so an unscoped router.use would otherwise intercept every talent
  // and agency API registered after it in app.js.
  router.use("/api/internal/agency-requests", requirePlatformAdmin);

  router.get(
    "/api/internal/agency-requests",
    asyncHandler(async (req, res) => {
      const status = req.query.status ? String(req.query.status) : null;
      if (status && !Object.values(REVIEW_STATUSES).includes(status)) {
        return res.status(400).json({
          success: false,
          error: "INVALID_REQUEST_STATUS",
          message: "Unknown agency request status.",
        });
      }
      const data = await service.listRequests({
        status,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      return res.json({ success: true, data });
    }),
  );

  router.get(
    "/api/internal/agency-requests/:requestId",
    asyncHandler(async (req, res) => {
      const data = await service.getRequest(req.params.requestId);
      return res.json({ success: true, data });
    }),
  );

  router.patch(
    "/api/internal/agency-requests/:requestId/qualification-call",
    asyncHandler(async (req, res) => {
      const data = await service.scheduleQualificationCall(
        req.params.requestId,
        {
          callAt: req.body?.callAt,
          notes: cleanNotes(req.body?.notes),
          actor: actorFromRequest(req),
        },
      );
      return res.json({ success: true, data });
    }),
  );

  router.post(
    "/api/internal/agency-requests/:requestId/approve",
    asyncHandler(async (req, res) => {
      const data = await service.approveRequest(req.params.requestId, {
        notes: cleanNotes(req.body?.notes),
        actor: actorFromRequest(req),
      });
      return res.json({ success: true, data });
    }),
  );

  router.post(
    "/api/internal/agency-requests/:requestId/resend-invitation",
    asyncHandler(async (req, res) => {
      const data = await service.resendApprovalInvite(req.params.requestId, {
        actor: actorFromRequest(req),
      });
      return res.json({ success: true, data });
    }),
  );

  router.post(
    "/api/internal/agency-requests/:requestId/decline",
    asyncHandler(async (req, res) => {
      const data = await service.declineRequest(req.params.requestId, {
        notes: cleanDeclineReason(req.body?.notes),
        actor: actorFromRequest(req),
      });
      return res.json({ success: true, data });
    }),
  );

  router.use((error, _req, res, next) => {
    if (!error.status || error.status >= 500) return next(error);
    return res.status(error.status).json({
      success: false,
      error: error.code || "INTERNAL_REVIEW_ERROR",
      message: error.message,
    });
  });

  return router;
}

const router = createAgencyRequestsRouter();

module.exports = router;
module.exports.createAgencyRequestsRouter = createAgencyRequestsRouter;
