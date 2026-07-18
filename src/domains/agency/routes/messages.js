const express = require("express");
const knex = require("../../../shared/db/knex");
const {
  requireRole,
  requireActiveAccount,
} = require("../../auth/middleware/require-auth");
const {
  isAgencyBlockedForTalent,
  validateHttpsAttachmentUrl,
} = require("../../../shared/lib/blocked-agencies");
const { sendNewMessageEmail } = require("../../../shared/lib/email");
const {
  issueReplyTokenForApplication,
} = require("../../messaging/services/message-reply-tokens");
const {
  notifyTalentNewMessage,
} = require("../../../shared/services/notifications");
const { getSessionActorUserId } = require("../services/context");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const logActivity = require("./agency-log-activity");
const {
  applyMinorSubmissionFilter,
} = require("../services/minor-submission-access");

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
      const threads = await applyMinorSubmissionFilter(knex("messages as m")
        .join("applications as a", "m.application_id", "a.id")
        .join("profiles as p", "a.profile_id", "p.id")
        .leftJoin("board_applications as ba", "ba.application_id", "a.id")
        .leftJoin("boards as b", "ba.board_id", "b.id")
        .join(latestMessageSubquery, function () {
          this.on("m.application_id", "=", "latest_msgs.application_id");
          this.andOn("m.created_at", "=", "latest_msgs.max_created_at");
        })
        .where("a.agency_id", agencyId)
        .whereNot("a.status", "withdrawn")
        .select([
          "a.id as id",
          knex.raw("p.first_name || ' ' || p.last_name as \"senderName\""),
          "b.name as board_name",
          "m.message as preview",
          "m.created_at as timestamp",
          "p.id as profile_id",
        ])
        .orderBy("m.created_at", "desc"), {
          alias: "a",
          allowMinor: req.allowMinorSubmissions,
        });

      // Get unread counts for each application
      const unreadCounts = await applyMinorSubmissionFilter(knex("messages")
        .join("applications", "messages.application_id", "applications.id")
        .where("applications.agency_id", agencyId)
        .whereNot("applications.status", "withdrawn")
        .where("messages.is_read", false)
        .where("messages.sender_type", "TALENT")
        .groupBy("messages.application_id")
        .select("messages.application_id")
        .count("* as count"), {
          alias: "applications",
          allowMinor: req.allowMinorSubmissions,
        });

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
      if (application.status === "withdrawn") {
        return res.status(410).json({
          error: "application_withdrawn",
          message: "This submission was withdrawn and its thread is closed.",
        });
      }

      // Get all messages for this application
      const messages = await knex("messages")
        .where({ application_id: applicationId })
        .leftJoin("users", "messages.sender_id", "users.id")
        .select(
          "messages.*",
          "users.email as sender_email",
          knex.raw(
            "TRIM(COALESCE(users.first_name, '') || ' ' || COALESCE(users.last_name, '')) as sender_name",
          ),
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
  requireActiveAccount(),
  async (req, res, next) => {
    try {
      const { applicationId } = req.params;
      const { message, attachment_url } = req.body;
      const agencyId = req.session.userId;
      const actorUserId = getSessionActorUserId(req.session);

      if (!message || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

      if (message.trim().length > 4000) {
        return res.status(400).json({ error: "Message is too long" });
      }

      const attachmentCheck = validateHttpsAttachmentUrl(attachment_url);
      if (!attachmentCheck.ok) {
        return res.status(400).json({ error: attachmentCheck.error });
      }

      // Verify application belongs to this agency
      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }
      if (application.status === "withdrawn") {
        return res.status(410).json({
          error: "application_withdrawn",
          message: "This submission was withdrawn and its thread is closed.",
        });
      }

      const talentProfile = await knex("profiles")
        .where({ id: application.profile_id })
        .select("user_id")
        .first();

      if (
        talentProfile?.user_id &&
        (await isAgencyBlockedForTalent(
          knex,
          talentProfile.user_id,
          agencyId,
        ))
      ) {
        return res.status(403).json({
          error: "Contact blocked",
          message: "This talent has blocked contact from your agency.",
        });
      }

      const { v4: uuidv4 } = require("uuid");
      const messageId = uuidv4();

      await knex("messages").insert({
        id: messageId,
        application_id: applicationId,
        sender_id: actorUserId,
        sender_type: "AGENCY",
        message: message.trim(),
        attachment_url: attachmentCheck.value,
        is_read: false,
        created_at: knex.fn.now(),
      });

      // Log activity
      await logActivity(
        req,
        knex,
        applicationId,
        agencyId,
        "message_sent",
        "Message sent to talent",
        { message_preview: message.trim().substring(0, 100) },
      );

      // In-app talent notification (bell) — the counterpart to the email below,
      // so the message surfaces inside Pholio even if the email is missed.
      if (talentProfile?.user_id) {
        try {
          const agencyRow = await knex("agencies")
            .where({ id: agencyId })
            .select("name")
            .first();
          await notifyTalentNewMessage({
            userId: talentProfile.user_id,
            applicationId,
            agencyId,
            agencyName: agencyRow?.name || "An agency",
            preview: message.trim(),
          });
        } catch (notifyErr) {
          console.error(
            "[Messages API] Talent notification failed:",
            notifyErr,
          );
        }
      }

      // Send email notification with magic reply link (async, non-blocking)
      (async () => {
        try {
          const talent = await knex("applications as a")
            .join("profiles as p", "a.profile_id", "p.id")
            .join("users as u", "p.user_id", "u.id")
            .where("a.id", applicationId)
            .select(
              "u.email",
              "u.first_name",
              "u.last_name",
              "p.first_name as profile_first_name",
              "p.last_name as profile_last_name",
            )
            .first();

          const agency = await knex("agencies").where({ id: agencyId }).first();
          const replyToken = await issueReplyTokenForApplication(applicationId);

          if (talent && talent.email && agency) {
            const messagePreview =
              message.trim().length > 150
                ? message.trim().substring(0, 150) + "..."
                : message.trim();

            const recipientName =
              [talent.profile_first_name, talent.profile_last_name]
                .filter(Boolean)
                .join(" ") ||
              [talent.first_name, talent.last_name].filter(Boolean).join(" ") ||
              "there";

            await sendNewMessageEmail({
              to: talent.email,
              recipientName,
              senderName: agency.name || "An agency",
              messagePreview,
              replyUrl: replyToken?.replyUrl || null,
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
          knex.raw(
            "TRIM(COALESCE(users.first_name, '') || ' ' || COALESCE(users.last_name, '')) as sender_name",
          ),
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

// POST /api/agency/messages/read-all - Mark every visible talent message as read
router.post(
  "/api/agency/messages/read-all",
  requireRole("AGENCY"),
  async (req, res) => {
    try {
      const agencyId = req.session.userId;
      const visibleApplicationIds = knex("applications")
        .select("id")
        .where({ agency_id: agencyId })
        .whereNot("status", "withdrawn");
      applyMinorSubmissionFilter(visibleApplicationIds, {
        alias: "applications",
        allowMinor: req.allowMinorSubmissions,
      });

      const updated = await knex("messages")
        .whereIn("application_id", visibleApplicationIds)
        .where({ is_read: false, sender_type: "TALENT" })
        .update({
          is_read: true,
          read_at: knex.fn.now(),
        });

      return res.json({
        success: true,
        data: { updated: Number(updated) || 0 },
      });
    } catch (error) {
      console.error("[Messages API] Error marking all messages as read:", error);
      return res.status(500).json({ error: "Failed to mark messages as read" });
    }
  },
);

// POST /api/agency/messages/:messageId/read - Mark one talent message as read
router.post(
  "/api/agency/messages/:messageId/read",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { messageId } = req.params;
      const agencyId = req.session.userId;

      // Get message and verify access
      const message = await applyMinorSubmissionFilter(knex("messages")
        .where({ "messages.id": messageId })
        .where({ "messages.sender_type": "TALENT" })
        .join("applications", "messages.application_id", "applications.id")
        .where({ "applications.agency_id": agencyId })
        .whereNot("applications.status", "withdrawn")
        .select("messages.*")
        .first(), {
          alias: "applications",
          allowMinor: req.allowMinorSubmissions,
        });

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

      const result = await applyMinorSubmissionFilter(knex("messages")
        .join("applications", "messages.application_id", "applications.id")
        .where({ "applications.agency_id": agencyId })
        .whereNot("applications.status", "withdrawn")
        .where({ "messages.is_read": false })
        .where("messages.sender_type", "TALENT")
        .count("* as count")
        .first(), {
          alias: "applications",
          allowMinor: req.allowMinorSubmissions,
        });

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
