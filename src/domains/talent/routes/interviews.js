const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const asyncHandler = require("express-async-handler");
const logActivity = require("../../agency/routes/agency-log-activity");
const {
  notifyAgencyInterviewResponse,
} = require("../../../shared/services/agency-notifications");

// Statuses still awaiting the talent's response.
const RESPONDABLE = new Set(["pending", "rescheduled"]);

/**
 * GET /api/talent/interviews
 * All interviews scheduled for the current talent, newest first.
 */
router.get(
  "/",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const talentUserId = req.session.userId;
    const interviews = await knex("interviews")
      .where({ "interviews.talent_id": talentUserId })
      .leftJoin("agencies", "interviews.agency_id", "agencies.id")
      .select("interviews.*", "agencies.name as agency_name")
      .orderBy("interviews.proposed_datetime", "desc");

    res.json({ success: true, data: interviews });
  }),
);

/**
 * POST /api/talent/interviews/:id/respond
 * Talent accepts or declines a proposed interview.
 * Body: { action: 'accept' | 'decline', message?: string }
 */
router.post(
  "/:id/respond",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { action, message } = req.body || {};
    const talentUserId = req.session.userId;

    const status =
      action === "accept"
        ? "accepted"
        : action === "decline"
          ? "declined"
          : null;
    if (!status) {
      return res.status(400).json({
        success: false,
        error: "Invalid action",
        message: "Action must be 'accept' or 'decline'.",
      });
    }

    const interview = await knex("interviews")
      .where({ id, talent_id: talentUserId })
      .first();
    if (!interview) {
      return res.status(404).json({
        success: false,
        error: "Interview not found",
        message: "Interview not found",
      });
    }
    if (!RESPONDABLE.has(interview.status)) {
      return res.status(400).json({
        success: false,
        error: "Already responded",
        message: "You've already responded to this interview.",
      });
    }

    await knex("interviews")
      .where({ id })
      .update({
        status,
        response_message: message || null,
        responded_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

    await logActivity(
      req,
      knex,
      interview.application_id,
      interview.agency_id,
      "interview_response",
      `Interview ${status}`,
      { interview_id: id, response: status },
    );

    try {
      const profile = await knex("profiles")
        .where({ user_id: talentUserId })
        .select("first_name", "last_name", "name")
        .first();
      const talentName = profile
        ? [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
          profile.name ||
          "Talent"
        : "Talent";
      await notifyAgencyInterviewResponse({
        agencyId: interview.agency_id,
        applicationId: interview.application_id,
        interviewId: id,
        talentName,
        response: status,
      });
    } catch (notifyErr) {
      console.error("[Talent Interviews] Response notification failed:", notifyErr);
    }

    const updated = await knex("interviews").where({ id }).first();
    res.json({ success: true, data: updated });
  }),
);

module.exports = router;
