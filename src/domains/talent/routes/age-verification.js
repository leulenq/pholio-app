"use strict";

const express = require("express");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const {
  createVerificationSession,
  getAdultContext,
  getVerificationStatus,
  syncVerification,
  updateAdultContext,
} = require("../services/age-verification");

const router = express.Router();

async function ownProfile(req) {
  return knex("profiles").where({ user_id: req.session.userId }).first();
}

router.get(
  "/age-verification",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await ownProfile(req);
    if (!profile) return apiResponse.error(res, "Profile not found", 404);
    let status = await getVerificationStatus(profile.id);
    if (["requires_input", "processing"].includes(status.status)) {
      const latest = await knex("age_verifications")
        .where({ profile_id: profile.id })
        .orderBy("created_at", "desc")
        .first();
      if (latest?.provider_session_id) {
        status = (await syncVerification(latest.provider_session_id)) || status;
      }
    }
    return apiResponse.success(res, status);
  }),
);

router.post(
  "/age-verification/session",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await ownProfile(req);
    if (!profile) return apiResponse.error(res, "Profile not found", 404);
    try {
      const { session } = await createVerificationSession(profile);
      return apiResponse.success(res, { url: session.url, status: session.status }, 201);
    } catch (error) {
      const status = error.code === "DOB_REQUIRED" ? 422 : error.code === "ADULT_ONLY" ? 403 : 503;
      return apiResponse.error(res, error.message || "Age verification could not start", status, {
        code: error.code || "AGE_VERIFICATION_UNAVAILABLE",
      });
    }
  }),
);

router.get(
  "/adult-context",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await ownProfile(req);
    if (!profile) return apiResponse.error(res, "Profile not found", 404);
    return apiResponse.success(res, await getAdultContext(profile.id));
  }),
);

router.put(
  "/adult-context",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await ownProfile(req);
    if (!profile) return apiResponse.error(res, "Profile not found", 404);
    try {
      const context = await updateAdultContext(profile.id, req.body || {});
      return apiResponse.success(res, context);
    } catch (error) {
      const status = error.code === "ADULT_VERIFICATION_REQUIRED" ? 403 : 422;
      return apiResponse.error(res, error.message || "Adult context could not be saved", status, {
        code: error.code || "ADULT_CONTEXT_INVALID",
      });
    }
  }),
);

module.exports = router;
