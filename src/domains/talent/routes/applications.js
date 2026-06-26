const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole, requireActiveAccount } = require("../../auth/middleware/require-auth");
const { isAgencyBlockedForTalent } = require("../../../shared/lib/blocked-agencies");
const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const {
  notifyTalentApplicationSubmitted,
} = require("../../../shared/services/notifications");
const {
  notifyAgencyNewApplication,
  notifyAgencyApplicationWithdrawn,
  notifyAgencyNewMessage,
} = require("../../../shared/services/agency-notifications");
const {
  validateSubmissionPackage,
} = require("../services/validate-submission-package");
const { loadImageRightsMap } = require("../../../shared/lib/image-rights");
const logActivity = require("../../agency/routes/agency-log-activity");
const { v4: uuidv4 } = require("uuid");

// Statuses a talent may withdraw from (still in process). Terminal states stay put.
const WITHDRAWABLE_STATUSES = new Set([
  "pending",
  "submitted",
  "reviewing",
  "shortlisted",
]);

async function getProfileBySessionUserId(userId) {
  return knex("profiles").where({ user_id: userId }).first();
}

/**
 * Verify an agency-invitation token for the /redirect-apply flow.
 *
 * Fail-closed HMAC verification. The invite link that lands a talent on a
 * portfolio (`?ref=agency&agencyId=<id>&token=<token>`) MUST carry a token
 * minted by the agency-invite issuance side using the SAME secret/scheme:
 *
 *   token = HMAC_SHA256(process.env.AGENCY_INVITE_SECRET, `${agencyId}`)
 *           encoded as lowercase hex
 *
 * Optionally the token may be bound to a specific profile by signing
 * `${agencyId}:${profileId}` instead; we accept either binding so issuance can
 * choose. There is currently NO issuance code in the repo that mints this
 * token — until that is built, this endpoint correctly rejects every request.
 *
 * Security notes:
 * - If AGENCY_INVITE_SECRET is unset, we reject (never accept arbitrary tokens).
 * - Comparison uses crypto.timingSafeEqual to avoid timing oracles.
 *
 * @param {string} token - hex-encoded HMAC from the invite link
 * @param {string} agencyId - agency the invite is for
 * @param {string} profileId - the authenticated talent's profile id
 * @returns {boolean} true only if the token is a valid signature
 */
function verifyAgencyInviteToken(token, agencyId, profileId) {
  const secret = process.env.AGENCY_INVITE_SECRET;
  if (!secret || typeof token !== "string" || !agencyId) {
    return false;
  }

  // Token must be lowercase hex of the right length for an SHA-256 HMAC (64 chars).
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    return false;
  }

  const providedBuf = Buffer.from(token, "hex");

  // Accept either an agency-only binding or an agency+profile binding so the
  // issuance side can pick the stricter form without breaking verification.
  const payloads = [`${agencyId}`, `${agencyId}:${profileId}`];
  for (const payload of payloads) {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest();
    if (
      providedBuf.length === expected.length &&
      crypto.timingSafeEqual(providedBuf, expected)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * GET /api/talent/applications
 * List all applications for the current talent
 */
router.get(
  "/",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    // Fetch applications with organization-backed agency info
    const applications = await knex("applications")
      .leftJoin("agencies", "applications.agency_id", "agencies.id")
      .leftJoin("agency_memberships as am", function () {
        this.on("am.agency_id", "=", "agencies.id")
          .andOn("am.membership_role", "=", knex.raw("?", ["OWNER"]))
          .andOn("am.status", "=", knex.raw("?", ["ACTIVE"]));
      })
      .leftJoin("users", "am.user_id", "users.id")
      .where({ profile_id: profile.id })
      .select(
        "applications.id",
        "applications.agency_id",
        "applications.status",
        "applications.created_at",
        "applications.updated_at",
        "agencies.name as agency_name",
        "agencies.location as agency_location",
        "agencies.website as agency_website",
        "agencies.logo_path as agency_logo",
        // The talent's submitted note lives in the messages table as the first
        // TALENT-authored message for the application (see POST "/" below).
        knex("messages as note_msg")
          .select("note_msg.message")
          .whereRaw("note_msg.application_id = applications.id")
          .where("note_msg.sender_type", "TALENT")
          .orderBy("note_msg.created_at", "asc")
          .limit(1)
          .as("note"),
      )
      .orderBy("applications.created_at", "desc");

    res.json({ success: true, data: applications });
  }),
);

/**
 * GET /api/talent/applications/prompt-context
 * Determine if talent should see a targeted agency apply prompt
 */
router.get(
  "/prompt-context",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    // Redirect/invite source-of-truth: latest app rows with invited_by_agency_id.
    // redirect-apply writes invited_by_agency_id below, so both flows are normalized.
    const latestRedirectSignal = await knex("applications as a")
      .leftJoin("agencies as ag", "ag.id", "a.invited_by_agency_id")
      .where("a.profile_id", profile.id)
      .whereNotNull("a.invited_by_agency_id")
      .select(
        "a.invited_by_agency_id",
        "a.created_at",
        "ag.id as agency_id",
        "ag.name as agency_name",
        "ag.location as agency_location",
        "ag.logo_path as agency_logo",
        "ag.website as agency_website",
      )
      .orderBy("a.created_at", "desc")
      .first();

    const targetAgencyId = latestRedirectSignal?.invited_by_agency_id || null;
    let alreadyAppliedToTarget = false;

    if (targetAgencyId) {
      const existing = await knex("applications")
        .where({ profile_id: profile.id, agency_id: targetAgencyId })
        .first();
      alreadyAppliedToTarget = !!existing;
    }

    return res.json({
      success: true,
      data: {
        hasRedirectSignal: !!latestRedirectSignal,
        targetAgency: latestRedirectSignal
          ? {
              id: latestRedirectSignal.agency_id,
              name: latestRedirectSignal.agency_name,
              location: latestRedirectSignal.agency_location,
              logo: latestRedirectSignal.agency_logo,
              website: latestRedirectSignal.agency_website,
            }
          : null,
        alreadyAppliedToTarget,
      },
    });
  }),
);

/**
 * POST /api/talent/applications
 * Create a new application (direct apply)
 */
router.post(
  "/",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { agencyId, note, submissionPackage } = req.body;
    if (!agencyId) {
      return res.status(400).json({
        success: false,
        error: "Agency ID required",
        message: "Agency ID required",
      });
    }

    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    if (await isAgencyBlockedForTalent(knex, req.session.userId, agencyId)) {
      return res.status(403).json({
        success: false,
        error: "Agency blocked",
        message: "You have blocked this agency.",
      });
    }

    // 1. Check if already applied. A previously withdrawn application can be
    //    resubmitted (we revive that row below to preserve its history).
    const existingparams = { profile_id: profile.id, agency_id: agencyId };
    const existing = await knex("applications").where(existingparams).first();
    if (existing && existing.status !== "withdrawn") {
      return res.status(400).json({
        success: false,
        error: "Already applied to this agency",
        message: "You've already applied to this agency.",
      });
    }
    const reapplying = !!existing;

    const profileImages = await knex("images")
      .where({ profile_id: profile.id })
      .orderBy("sort", "asc");
    let packageImages = profileImages;
    const submittedImageIds = submissionPackage?.imageIds;
    if (Array.isArray(submittedImageIds) && submittedImageIds.length > 0) {
      const idSet = new Set(submittedImageIds);
      packageImages = profileImages.filter((img) => idSet.has(img.id));
    }
    const rightsMap = await loadImageRightsMap(
      knex,
      packageImages.map((img) => img.id),
    );
    const packageValidation = validateSubmissionPackage(profile, packageImages, {
      rightsMap,
    });
    if (!packageValidation.ok) {
      return res.status(400).json({
        success: false,
        error: "submission_package_incomplete",
        message:
          packageValidation.errors[0]?.message ||
          "Your submission package is not ready to send.",
        errors: packageValidation.errors,
      });
    }

    // 2. Check limits for Free Tier
    if (!profile.is_pro) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const count = await knex("applications")
        .where({ profile_id: profile.id })
        .where("created_at", ">=", startOfMonth)
        .count("id as c")
        .first();

      if (Number(count.c) >= 5) {
        return res.status(403).json({
          success: false,
          error: "Monthly application limit reached",
          message: "Monthly application limit reached",
          limit: 5,
          current: Number(count.c),
          upgradeRequired: true,
        });
      }
    }

    // 3. Create (or revive a withdrawn) Application
    let applicationId;
    if (reapplying) {
      await knex("applications")
        .where({ id: existing.id })
        .update({ status: "pending", updated_at: knex.fn.now() });
      applicationId = existing.id;
      await logActivity(
        req,
        knex,
        applicationId,
        agencyId,
        "status_change",
        "Application resubmitted",
        { old_status: "withdrawn", new_status: "pending" },
      );
    } else {
      const [insertedApplication] = await knex("applications")
        .insert({
          id: knex.raw("gen_random_uuid()"),
          profile_id: profile.id,
          agency_id: agencyId,
          status: "pending",
        })
        .returning("id");

      applicationId =
        typeof insertedApplication === "object"
          ? insertedApplication.id
          : insertedApplication;
    }

    const applicationNote = typeof note === "string" ? note.trim() : "";
    const hasSubmissionPackagesTable = await knex.schema.hasTable(
      "talent_submission_packages",
    );
    if (
      hasSubmissionPackagesTable &&
      submissionPackage &&
      typeof submissionPackage === "object"
    ) {
      await knex("talent_submission_packages").insert({
        id: knex.raw("gen_random_uuid()"),
        user_id: req.session.userId,
        profile_id: profile.id,
        label: `Application to ${agencyId}`,
        payload: {
          applicationId,
          agencyId,
          mediaSetId: submissionPackage.mediaSetId || null,
          mediaSetName: submissionPackage.mediaSetName || null,
          compCardId: submissionPackage.compCardId || null,
          compCardName: submissionPackage.compCardName || null,
          imageIds: Array.isArray(submissionPackage.imageIds)
            ? submissionPackage.imageIds
            : [],
          readiness: submissionPackage.readiness || null,
          consentConfirmed: !!submissionPackage.consentConfirmed,
          submittedAt: new Date().toISOString(),
        },
      });
    }

    if (applicationNote) {
      await knex("messages").insert({
        application_id: applicationId,
        sender_id: req.session.userId,
        sender_type: "TALENT",
        message: applicationNote.slice(0, 1200),
        is_read: false,
      });
    }

    const agency = await knex("agencies")
      .where({ id: agencyId })
      .select("name")
      .first();

    try {
      await notifyTalentApplicationSubmitted({
        userId: req.session.userId,
        applicationId,
        agencyId,
        agencyName: agency?.name,
      });
    } catch (notifyErr) {
      console.error(
        "[Applications] Submission notification failed:",
        notifyErr,
      );
    }

    const talentName = [profile.first_name, profile.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    try {
      await notifyAgencyNewApplication({
        agencyId,
        applicationId,
        talentName: talentName || profile.name || "A talent",
      });
    } catch (notifyErr) {
      console.error("[Applications] Agency notification failed:", notifyErr);
    }

    res.json({ success: true, id: applicationId });
  }),
);

/**
 * POST /api/talent/applications/:id/withdraw
 * Withdraw an application
 */
router.post(
  "/:id/withdraw",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    const application = await knex("applications")
      .where({ id, profile_id: profile.id })
      .first();

    if (!application) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
        message: "Application not found",
      });
    }

    if (!WITHDRAWABLE_STATUSES.has(application.status)) {
      return res.status(400).json({
        success: false,
        error: "Cannot withdraw",
        message: "This application can no longer be withdrawn.",
      });
    }

    const previousStatus = application.status;

    await knex("applications")
      .where({ id, profile_id: profile.id })
      .update({ status: "withdrawn", updated_at: knex.fn.now() });

    // Preserve the journey: record the withdrawal in application history.
    await logActivity(
      req,
      knex,
      id,
      application.agency_id,
      "status_change",
      "Application withdrawn",
      { old_status: previousStatus, new_status: "withdrawn" },
    );

    // Let the agency know the talent stepped back.
    try {
      const talentName = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      await notifyAgencyApplicationWithdrawn({
        agencyId: application.agency_id,
        applicationId: id,
        talentName: talentName || profile.name || "A talent",
      });
    } catch (notifyErr) {
      console.error("[Applications] Withdrawal notification failed:", notifyErr);
    }

    res.json({ success: true });
  }),
);

/**
 * GET /api/talent/applications/:id/activity
 * Status-change history (the lifecycle timeline) for one of the talent's
 * applications. Read-only; scoped to the requesting talent's own profile.
 */
router.get(
  "/:id/activity",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    const application = await knex("applications")
      .where({ id, profile_id: profile.id })
      .first();
    if (!application) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
        message: "Application not found",
      });
    }

    const rows = await knex("application_activities")
      .where({ application_id: id, activity_type: "status_change" })
      .orderBy("created_at", "asc")
      .select("id", "activity_type", "description", "metadata", "created_at");

    const data = rows.map((row) => {
      let metadata = row.metadata;
      if (typeof metadata === "string") {
        try {
          metadata = JSON.parse(metadata);
        } catch {
          metadata = {};
        }
      }
      return {
        id: row.id,
        type: row.activity_type,
        description: row.description,
        metadata: metadata || {},
        created_at: row.created_at,
      };
    });

    res.json({ success: true, data });
  }),
);

/**
 * GET /api/talent/applications/:id/messages
 * Conversation thread for one of the talent's applications. Marks the agency's
 * messages as read on view.
 */
router.get(
  "/:id/messages",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found", message: "Profile not found" });
    }

    const application = await knex("applications")
      .where({ id, profile_id: profile.id })
      .first();
    if (!application) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
        message: "Application not found",
      });
    }

    const messages = await knex("messages")
      .where({ application_id: id })
      .orderBy("created_at", "asc")
      .select("id", "sender_type", "message", "attachment_url", "is_read", "created_at");

    await knex("messages")
      .where({ application_id: id, sender_type: "AGENCY", is_read: false })
      .update({ is_read: true, read_at: knex.fn.now() });

    res.json({ success: true, data: messages });
  }),
);

/**
 * POST /api/talent/applications/:id/messages
 * Talent sends a message to the agency from inside the dashboard.
 */
router.post(
  "/:id/messages",
  requireRole("TALENT"),
  requireActiveAccount(),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const trimmed = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!trimmed) {
      return res
        .status(400)
        .json({ success: false, error: "Message required", message: "Message is required." });
    }
    if (trimmed.length > 4000) {
      return res
        .status(400)
        .json({ success: false, error: "Too long", message: "Message is too long." });
    }

    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found", message: "Profile not found" });
    }

    const application = await knex("applications")
      .where({ id, profile_id: profile.id })
      .first();
    if (!application) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
        message: "Application not found",
      });
    }

    const messageId = uuidv4();
    await knex("messages").insert({
      id: messageId,
      application_id: id,
      sender_id: req.session.userId,
      sender_type: "TALENT",
      message: trimmed,
      is_read: false,
      created_at: knex.fn.now(),
    });

    await logActivity(
      req,
      knex,
      id,
      application.agency_id,
      "message_sent",
      "Talent sent a message",
      { message_preview: trimmed.substring(0, 100), via: "dashboard" },
    );

    try {
      const talentName =
        [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
        profile.name ||
        "A talent";
      await notifyAgencyNewMessage({
        agencyId: application.agency_id,
        applicationId: id,
        talentName,
        preview: trimmed.substring(0, 80),
      });
    } catch (notifyErr) {
      console.error("[Applications] Message notification failed:", notifyErr);
    }

    const newMessage = await knex("messages").where({ id: messageId }).first();
    res.json({ success: true, data: newMessage });
  }),
);

/**
 * POST /api/talent/redirect-apply
 * Handle agency-initiated application via redirect (bypasses limits)
 */
router.post(
  "/redirect-apply",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { agencyId, token } = req.body;
    if (!agencyId || !token) {
      return res.status(400).json({
        success: false,
        error: "Agency ID and token required",
        message: "Agency ID and token required",
      });
    }

    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    if (await isAgencyBlockedForTalent(knex, req.session.userId, agencyId)) {
      return res.status(403).json({
        success: false,
        error: "Agency blocked",
        message: "You have blocked this agency.",
      });
    }

    // Verify the agency-invite token before bypassing the application limit.
    // Fail-closed: forged/missing tokens (and an unset secret) are rejected.
    // See verifyAgencyInviteToken() for the expected token format that the
    // invite-issuance side must produce.
    if (!verifyAgencyInviteToken(token, agencyId, profile.id)) {
      return res.status(403).json({
        success: false,
        error: "Invalid invitation token",
        message: "Invalid invitation token",
      });
    }

    // Check if already applied
    const existingparams = { profile_id: profile.id, agency_id: agencyId };
    const existing = await knex("applications").where(existingparams).first();

    if (existing) {
      return res
        .status(200)
        .json({ success: true, message: "Already applied" });
    }

    // Create Application (No limit check)
    const [appId] = await knex("applications")
      .insert({
        id: knex.raw("gen_random_uuid()"),
        profile_id: profile.id,
        agency_id: agencyId,
        invited_by_agency_id: agencyId,
        status: "pending", // or 'reviewing' immediately since they asked for it?
        // Let's set to 'pending'
      })
      .returning("id");

    const applicationId = typeof appId === "object" ? appId.id : appId;

    const agency = await knex("agencies")
      .where({ id: agencyId })
      .select("name")
      .first();
    const talentName = [profile.first_name, profile.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();

    try {
      await notifyTalentApplicationSubmitted({
        userId: req.session.userId,
        applicationId,
        agencyId,
        agencyName: agency?.name,
      });
      await notifyAgencyNewApplication({
        agencyId,
        applicationId,
        talentName: talentName || "A talent",
      });
    } catch (notifyErr) {
      console.error("[Redirect Apply] Notification failed:", notifyErr);
    }

    res.json({ success: true, id: applicationId });
  }),
);

module.exports = router;
