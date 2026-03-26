const express = require("express");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { v4: uuidv4 } = require("uuid");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const logActivity = require("./agency-log-activity");

const router = express.Router();
mountAgencyApiGuard(router);

// ============================================================================
// Reminders API
// ============================================================================

// POST /api/agency/applications/:applicationId/reminders - Create reminder
router.post(
  "/api/agency/applications/:applicationId/reminders",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationId } = req.params;
      const {
        reminder_type,
        reminder_date,
        title,
        notes,
        priority = "normal",
      } = req.body;
      const agencyId = req.session.userId;

      // Validate required fields
      if (!reminder_type || !reminder_date || !title) {
        return res
          .status(400)
          .json({ error: "Reminder type, date, and title are required" });
      }

      // Verify application belongs to this agency
      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const reminderId = uuidv4();

      await knex("reminders").insert({
        id: reminderId,
        application_id: applicationId,
        agency_id: agencyId,
        reminder_type,
        reminder_date,
        title,
        notes: notes || null,
        priority,
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
        "reminder_created",
        "Reminder set",
        {
          reminder_id: reminderId,
          reminder_date,
          title,
        },
      );

      const reminder = await knex("reminders")
        .where({ id: reminderId })
        .first();

      return res.json({
        success: true,
        data: reminder,
        message: "Reminder created successfully",
      });
    } catch (error) {
      console.error("[Reminders API] Error creating reminder:", error);
      return res.status(500).json({ error: "Failed to create reminder" });
    }
  },
);

// GET /api/agency/reminders - Get all reminders for agency
router.get(
  "/api/agency/reminders",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;
      const { status, due, priority } = req.query;

      let query = knex("reminders")
        .where({ "reminders.agency_id": agencyId })
        .leftJoin("applications", "reminders.application_id", "applications.id")
        .leftJoin("users as talent", "applications.talent_id", "talent.id")
        .leftJoin("profiles", "talent.id", "profiles.user_id")
        .select(
          "reminders.*",
          "talent.name as talent_name",
          "talent.email as talent_email",
          "profiles.slug as talent_slug",
        );

      // Filter by status
      if (status) {
        query = query.where({ "reminders.status": status });
      }

      // Filter by priority
      if (priority) {
        query = query.where({ "reminders.priority": priority });
      }

      // Filter for due reminders (due today or overdue)
      if (due === "true") {
        query = query
          .where("reminders.reminder_date", "<=", knex.fn.now())
          .where({ "reminders.status": "pending" });
      }

      const reminders = await query.orderBy("reminders.reminder_date", "asc");

      return res.json({
        success: true,
        data: reminders,
      });
    } catch (error) {
      console.error("[Reminders API] Error fetching reminders:", error);
      return res.status(500).json({ error: "Failed to load reminders" });
    }
  },
);

// GET /api/agency/reminders/due - Get count of due reminders
router.get(
  "/api/agency/reminders/due",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;

      const result = await knex("reminders")
        .where({ agency_id: agencyId, status: "pending" })
        .where("reminder_date", "<=", knex.fn.now())
        .count("* as count")
        .first();

      return res.json({
        success: true,
        data: { count: parseInt(result.count) },
      });
    } catch (error) {
      console.error(
        "[Reminders API] Error fetching due reminders count:",
        error,
      );
      return res
        .status(500)
        .json({ error: "Failed to get due reminders count" });
    }
  },
);

// GET /api/agency/applications/:applicationId/reminders - Get reminders for specific application
router.get(
  "/api/agency/applications/:applicationId/reminders",
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

      const reminders = await knex("reminders")
        .where({ application_id: applicationId })
        .orderBy("reminder_date", "asc");

      return res.json({
        success: true,
        data: reminders,
      });
    } catch (error) {
      console.error(
        "[Reminders API] Error fetching application reminders:",
        error,
      );
      return res.status(500).json({ error: "Failed to load reminders" });
    }
  },
);

// PATCH /api/agency/reminders/:reminderId - Update reminder
router.patch(
  "/api/agency/reminders/:reminderId",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { reminderId } = req.params;
      const { reminder_type, reminder_date, title, notes, priority, status } =
        req.body;
      const agencyId = req.session.userId;

      // Verify reminder belongs to this agency
      const reminder = await knex("reminders")
        .where({ id: reminderId, agency_id: agencyId })
        .first();

      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }

      const updates = { updated_at: knex.fn.now() };

      if (reminder_type !== undefined) updates.reminder_type = reminder_type;
      if (reminder_date !== undefined) updates.reminder_date = reminder_date;
      if (title !== undefined) updates.title = title;
      if (notes !== undefined) updates.notes = notes;
      if (priority !== undefined) updates.priority = priority;
      if (status !== undefined) {
        updates.status = status;
        if (status === "completed") {
          updates.completed_at = knex.fn.now();
        }
      }

      await knex("reminders").where({ id: reminderId }).update(updates);

      const updated = await knex("reminders").where({ id: reminderId }).first();

      return res.json({
        success: true,
        data: updated,
        message: "Reminder updated successfully",
      });
    } catch (error) {
      console.error("[Reminders API] Error updating reminder:", error);
      return res.status(500).json({ error: "Failed to update reminder" });
    }
  },
);

// POST /api/agency/reminders/:reminderId/complete - Mark reminder as completed
router.post(
  "/api/agency/reminders/:reminderId/complete",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { reminderId } = req.params;
      const agencyId = req.session.userId;

      // Verify reminder belongs to this agency
      const reminder = await knex("reminders")
        .where({ id: reminderId, agency_id: agencyId })
        .first();

      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }

      await knex("reminders").where({ id: reminderId }).update({
        status: "completed",
        completed_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

      // Log activity
      await logActivity(
        knex,
        reminder.application_id,
        agencyId,
        agencyId,
        "reminder_completed",
        "Reminder completed",
        {
          reminder_id: reminderId,
          title: reminder.title,
        },
      );

      return res.json({
        success: true,
        message: "Reminder marked as completed",
      });
    } catch (error) {
      console.error("[Reminders API] Error completing reminder:", error);
      return res.status(500).json({ error: "Failed to complete reminder" });
    }
  },
);

// POST /api/agency/reminders/:reminderId/snooze - Snooze reminder
router.post(
  "/api/agency/reminders/:reminderId/snooze",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { reminderId } = req.params;
      const { snooze_until } = req.body;
      const agencyId = req.session.userId;

      if (!snooze_until) {
        return res.status(400).json({ error: "Snooze until date is required" });
      }

      // Verify reminder belongs to this agency
      const reminder = await knex("reminders")
        .where({ id: reminderId, agency_id: agencyId })
        .first();

      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }

      await knex("reminders").where({ id: reminderId }).update({
        status: "snoozed",
        snoozed_until: snooze_until,
        updated_at: knex.fn.now(),
      });

      return res.json({
        success: true,
        message: "Reminder snoozed",
      });
    } catch (error) {
      console.error("[Reminders API] Error snoozing reminder:", error);
      return res.status(500).json({ error: "Failed to snooze reminder" });
    }
  },
);

// DELETE /api/agency/reminders/:reminderId - Delete reminder
router.delete(
  "/api/agency/reminders/:reminderId",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { reminderId } = req.params;
      const agencyId = req.session.userId;

      // Verify reminder belongs to this agency
      const reminder = await knex("reminders")
        .where({ id: reminderId, agency_id: agencyId })
        .first();

      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }

      // Soft delete by marking as cancelled
      await knex("reminders").where({ id: reminderId }).update({
        status: "cancelled",
        updated_at: knex.fn.now(),
      });

      return res.json({
        success: true,
        message: "Reminder cancelled",
      });
    } catch (error) {
      console.error("[Reminders API] Error deleting reminder:", error);
      return res.status(500).json({ error: "Failed to delete reminder" });
    }
  },
);

module.exports = router;
