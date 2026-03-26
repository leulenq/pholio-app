const express = require("express");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { sendNewMessageEmail } = require("../../../shared/lib/email");
const { getSessionActorUserId } = require("../services/context");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const logActivity = require("./agency-log-activity");

const router = express.Router();
mountAgencyApiGuard(router);

// ============================================================================
// Messaging API
// ============================================================================

// GET /api/agency/messages/threads - Get all conversation threads for agency
router.get(
  "/api/agency/messages/threads",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;

      // Subquery to get the latest message for each application
      const latestMessageSubquery = knex("messages")
        .select("application_id")
        .max("created_at as max_created_at")
        .groupBy("application_id")
        .as("latest_msgs");

      // Get threads with latest message info
      const threads = await knex("messages as m")
        .join("applications as a", "m.application_id", "a.id")
        .join("profiles as p", "a.profile_id", "p.id")
        .leftJoin("board_applications as ba", "ba.application_id", "a.id")
        .leftJoin("boards as b", "ba.board_id", "b.id")
        .join(latestMessageSubquery, function () {
          this.on("m.application_id", "=", "latest_msgs.application_id");
          this.andOn("m.created_at", "=", "latest_msgs.max_created_at");
        })
        .where("a.agency_id", agencyId)
        .select([
          "a.id as id",
          knex.raw("p.first_name || ' ' || p.last_name as \"senderName\""),
          "b.name as board_name",
          "m.message as preview",
          "m.created_at as timestamp",
          "p.id as profile_id",
        ])
        .orderBy("m.created_at", "desc");

      // Get unread counts for each application
      const unreadCounts = await knex("messages")
        .join("applications", "messages.application_id", "applications.id")
        .where("applications.agency_id", agencyId)
        .where("messages.is_read", false)
        .where("messages.sender_type", "TALENT")
        .groupBy("messages.application_id")
        .select("messages.application_id")
        .count("* as count");

      const unreadMap = {};
      unreadCounts.forEach((row) => {
        unreadMap[row.application_id] = parseInt(row.count);
      });

      // Get primary images for avatars
      const profileIds = threads.map((t) => t.profile_id);
      const images =
        profileIds.length > 0
          ? await knex("images")
              .whereIn("profile_id", profileIds)
              .where("is_primary", true)
          : [];

      const imageMap = {};
      images.forEach((img) => {
        imageMap[img.profile_id] = img.path;
      });

      // Format threads for frontend
      const formattedThreads = threads.map((t) => ({
        id: t.id,
        senderName: t.senderName,
        senderAvatar: imageMap[t.profile_id]
          ? `/${imageMap[t.profile_id]}`
          : null,
        applicationLabel: `Application #${t.id.substring(0, 4).toUpperCase()} · ${t.board_name || "General"}`,
        preview: t.preview,
        timestamp: t.timestamp,
        unread: !!unreadMap[t.id],
        unreadCount: unreadMap[t.id] || 0,
      }));

      return res.json({
        success: true,
        data: formattedThreads,
      });
    } catch (error) {
      console.error("[Messages API] Error fetching threads:", error);
      return res
        .status(500)
        .json({ error: "Failed to load conversation threads" });
    }
  },
);

// GET /api/agency/applications/:applicationId/messages - Get all messages for an application
router.get(
  "/api/agency/applications/:applicationId/messages",
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

      // Get all messages for this application
      const messages = await knex("messages")
        .where({ application_id: applicationId })
        .leftJoin("users", "messages.sender_id", "users.id")
        .select(
          "messages.*",
          "users.email as sender_email",
          "users.name as sender_name",
        )
        .orderBy("messages.created_at", "asc");

      return res.json({
        success: true,
        data: messages,
      });
    } catch (error) {
      console.error("[Messages API] Error fetching messages:", error);
      return res.status(500).json({ error: "Failed to load messages" });
    }
  },
);

// POST /api/agency/applications/:applicationId/messages - Send a message
router.post(
  "/api/agency/applications/:applicationId/messages",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationId } = req.params;
      const { message, attachment_url } = req.body;
      const agencyId = req.session.userId;
      const actorUserId = getSessionActorUserId(req.session);

      if (!message || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Verify application belongs to this agency
      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const { v4: uuidv4 } = require("uuid");
      const messageId = uuidv4();

      await knex("messages").insert({
        id: messageId,
        application_id: applicationId,
        sender_id: actorUserId,
        sender_type: "AGENCY",
        message: message.trim(),
        attachment_url: attachment_url || null,
        is_read: false,
        created_at: knex.fn.now(),
      });

      // Log activity
      await logActivity(
        knex,
        applicationId,
        agencyId,
        agencyId,
        "message_sent",
        "Message sent to talent",
        { message_preview: message.trim().substring(0, 100) },
      );

      // Send email notification (async, non-blocking)
      (async () => {
        try {
          // Get talent info
          const talent = await knex("users")
            .where({ id: application.talent_id })
            .first();

          // Get agency info
          const agency = await knex("agencies").where({ id: agencyId }).first();

          if (talent && talent.email && agency) {
            const messagePreview =
              message.trim().length > 150
                ? message.trim().substring(0, 150) + "..."
                : message.trim();

            await sendNewMessageEmail({
              to: talent.email,
              recipientName: talent.name || "there",
              senderName: agency.name || "An agency",
              messagePreview,
            });
          }
        } catch (emailError) {
          console.error("[Send Message] Email notification error:", emailError);
          // Don't fail the main operation if email fails
        }
      })();

      const newMessage = await knex("messages")
        .where({ id: messageId })
        .leftJoin("users", "messages.sender_id", "users.id")
        .select(
          "messages.*",
          "users.email as sender_email",
          "users.name as sender_name",
        )
        .first();

      return res.json({
        success: true,
        data: newMessage,
      });
    } catch (error) {
      console.error("[Messages API] Error sending message:", error);
      return res.status(500).json({ error: "Failed to send message" });
    }
  },
);

// POST /api/agency/messages/:messageId/read - Mark message as read
router.post(
  "/api/agency/messages/:messageId/read",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { messageId } = req.params;
      const agencyId = req.session.userId;

      // Get message and verify access
      const message = await knex("messages")
        .where({ "messages.id": messageId })
        .join("applications", "messages.application_id", "applications.id")
        .where({ "applications.agency_id": agencyId })
        .select("messages.*")
        .first();

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Mark as read
      await knex("messages").where({ id: messageId }).update({
        is_read: true,
        read_at: knex.fn.now(),
      });

      return res.json({
        success: true,
        data: { message: "Message marked as read" },
      });
    } catch (error) {
      console.error("[Messages API] Error marking message as read:", error);
      return res.status(500).json({ error: "Failed to mark message as read" });
    }
  },
);

// GET /api/agency/messages/unread-count - Get unread message count
router.get(
  "/api/agency/messages/unread-count",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;

      const result = await knex("messages")
        .join("applications", "messages.application_id", "applications.id")
        .where({ "applications.agency_id": agencyId })
        .where({ "messages.is_read": false })
        .where("messages.sender_type", "!=", "AGENCY") // Only count messages FROM talent
        .count("* as count")
        .first();

      return res.json({
        success: true,
        data: {
          unread_count: parseInt(result.count || 0),
        },
      });
    } catch (error) {
      console.error("[Messages API] Error getting unread count:", error);
      return res.status(500).json({ error: "Failed to get unread count" });
    }
  },
);

module.exports = router;
