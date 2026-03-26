const express = require("express");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { v4: uuidv4 } = require("uuid");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const logActivity = require("./agency-log-activity");

const router = express.Router();
mountAgencyApiGuard(router);

// ============================================================================
// Interview Scheduling API
// ============================================================================

// POST /api/agency/applications/:applicationId/interviews - Schedule interview
router.post(
  "/api/agency/applications/:applicationId/interviews",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationId } = req.params;
      const {
        proposed_datetime,
        duration_minutes = 30,
        interview_type,
        location,
        meeting_url,
        notes,
      } = req.body;
      const agencyId = req.session.userId;

      // Validate required fields
      if (!proposed_datetime || !interview_type) {
        return res.status(400).json({
          error: "Proposed date/time and interview type are required",
        });
      }

      // Verify application belongs to this agency
      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const interviewId = uuidv4();

      await knex("interviews").insert({
        id: interviewId,
        application_id: applicationId,
        agency_id: agencyId,
        talent_id: application.talent_id,
        proposed_datetime,
        duration_minutes,
        interview_type,
        location: location || null,
        meeting_url: meeting_url || null,
        notes: notes || null,
        status: "pending",
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

      // Log activity
      await logActivity(
        knex,
        applicationId,
        agencyId,
        agencyId,
        "interview_scheduled",
        "Interview scheduled",
        {
          interview_id: interviewId,
          datetime: proposed_datetime,
          type: interview_type,
        },
      );

      const interview = await knex("interviews")
        .where({ id: interviewId })
        .first();

      return res.json({
        success: true,
        data: interview,
        message: "Interview scheduled successfully",
      });
    } catch (error) {
      console.error("[Interviews API] Error scheduling interview:", error);
      return res.status(500).json({ error: "Failed to schedule interview" });
    }
  },
);

// GET /api/agency/interviews - Get all interviews for agency
router.get(
  "/api/agency/interviews",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;
      const { status, upcoming } = req.query;

      let query = knex("interviews")
        .where({ "interviews.agency_id": agencyId })
        .leftJoin(
          "applications",
          "interviews.application_id",
          "applications.id",
        )
        .leftJoin("users as talent", "interviews.talent_id", "talent.id")
        .leftJoin("profiles", "talent.id", "profiles.user_id")
        .select(
          "interviews.*",
          "talent.name as talent_name",
          "talent.email as talent_email",
          "profiles.slug as talent_slug",
        );

      // Filter by status
      if (status) {
        query = query.where({ "interviews.status": status });
      }

      // Filter for upcoming interviews only
      if (upcoming === "true") {
        query = query
          .where("interviews.proposed_datetime", ">=", knex.fn.now())
          .whereIn("interviews.status", ["pending", "accepted"]);
      }

      const interviews = await query.orderBy(
        "interviews.proposed_datetime",
        "asc",
      );

      return res.json({
        success: true,
        data: interviews,
      });
    } catch (error) {
      console.error("[Interviews API] Error fetching interviews:", error);
      return res.status(500).json({ error: "Failed to load interviews" });
    }
  },
);

// GET /api/agency/applications/:applicationId/interviews - Get interviews for specific application
router.get(
  "/api/agency/applications/:applicationId/interviews",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationId } = req.params;
      const agencyId = req.session.userId;

      // Verify application belongs to this agency
      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const interviews = await knex("interviews")
        .where({ application_id: applicationId })
        .orderBy("proposed_datetime", "desc");

      return res.json({
        success: true,
        data: interviews,
      });
    } catch (error) {
      console.error(
        "[Interviews API] Error fetching application interviews:",
        error,
      );
      return res.status(500).json({ error: "Failed to load interviews" });
    }
  },
);

// PATCH /api/agency/interviews/:interviewId - Update/reschedule interview
router.patch(
  "/api/agency/interviews/:interviewId",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { interviewId } = req.params;
      const {
        proposed_datetime,
        duration_minutes,
        interview_type,
        location,
        meeting_url,
        notes,
        status,
      } = req.body;
      const agencyId = req.session.userId;

      // Verify interview belongs to this agency
      const interview = await knex("interviews")
        .where({ id: interviewId, agency_id: agencyId })
        .first();

      if (!interview) {
        return res.status(404).json({ error: "Interview not found" });
      }

      const updates = { updated_at: knex.fn.now() };

      if (proposed_datetime !== undefined)
        updates.proposed_datetime = proposed_datetime;
      if (duration_minutes !== undefined)
        updates.duration_minutes = duration_minutes;
      if (interview_type !== undefined) updates.interview_type = interview_type;
      if (location !== undefined) updates.location = location;
      if (meeting_url !== undefined) updates.meeting_url = meeting_url;
      if (notes !== undefined) updates.notes = notes;
      if (status !== undefined) updates.status = status;

      await knex("interviews").where({ id: interviewId }).update(updates);

      // Log activity if rescheduled
      if (proposed_datetime !== undefined) {
        await logActivity(
          knex,
          interview.application_id,
          agencyId,
          agencyId,
          "interview_rescheduled",
          "Interview rescheduled",
          {
            interview_id: interviewId,
            old_datetime: interview.proposed_datetime,
            new_datetime: proposed_datetime,
          },
        );
      }

      const updated = await knex("interviews")
        .where({ id: interviewId })
        .first();

      return res.json({
        success: true,
        data: updated,
        message: "Interview updated successfully",
      });
    } catch (error) {
      console.error("[Interviews API] Error updating interview:", error);
      return res.status(500).json({ error: "Failed to update interview" });
    }
  },
);

// DELETE /api/agency/interviews/:interviewId - Cancel interview
router.delete(
  "/api/agency/interviews/:interviewId",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { interviewId } = req.params;
      const agencyId = req.session.userId;

      // Verify interview belongs to this agency
      const interview = await knex("interviews")
        .where({ id: interviewId, agency_id: agencyId })
        .first();

      if (!interview) {
        return res.status(404).json({ error: "Interview not found" });
      }

      // Mark as cancelled instead of deleting
      await knex("interviews").where({ id: interviewId }).update({
        status: "cancelled",
        updated_at: knex.fn.now(),
      });

      // Log activity
      await logActivity(
        knex,
        interview.application_id,
        agencyId,
        agencyId,
        "interview_cancelled",
        "Interview cancelled",
        {
          interview_id: interviewId,
          datetime: interview.proposed_datetime,
        },
      );

      return res.json({
        success: true,
        message: "Interview cancelled successfully",
      });
    } catch (error) {
      console.error("[Interviews API] Error cancelling interview:", error);
      return res.status(500).json({ error: "Failed to cancel interview" });
    }
  },
);

module.exports = router;
