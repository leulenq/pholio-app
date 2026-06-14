const express = require("express");
const knex = require("../../../shared/db/knex");
const logActivity = require("../../agency/routes/agency-log-activity");
const {
  validateReplyToken,
  touchReplyToken,
} = require("../services/message-reply-tokens");

const router = express.Router();

async function loadReplyContext(req, res, next) {
  try {
    const ctx = await validateReplyToken(req.params.token);
    if (!ctx) {
      return res.status(404).json({
        success: false,
        error: "Invalid or expired link",
        message:
          "This reply link is no longer valid. Sign in to Pholio to view your messages.",
      });
    }
    req.replyContext = ctx;
    return next();
  } catch (error) {
    console.error("[Message Reply] Token validation error:", error);
    return res.status(500).json({ error: "Failed to validate reply link" });
  }
}

// GET /api/reply/:token — thread for magic-link page (no session required)
router.get("/api/reply/:token", loadReplyContext, async (req, res) => {
  try {
    const {
      applicationId,
      agencyName,
      talentFirstName,
      talentLastName,
      expiresAt,
      tokenId,
    } = req.replyContext;

    const messages = await knex("messages")
      .where({ application_id: applicationId })
      .orderBy("created_at", "asc")
      .select(
        "id",
        "sender_type",
        "message",
        "attachment_url",
        "is_read",
        "created_at",
      );

    await knex("messages")
      .where({
        application_id: applicationId,
        sender_type: "AGENCY",
        is_read: false,
      })
      .update({ is_read: true, read_at: knex.fn.now() });

    await touchReplyToken(tokenId);

    return res.json({
      success: true,
      data: {
        applicationId,
        agencyName,
        talentName: [talentFirstName, talentLastName].filter(Boolean).join(" "),
        expiresAt,
        messages,
      },
    });
  } catch (error) {
    console.error("[Message Reply] GET thread error:", error);
    return res.status(500).json({ error: "Failed to load conversation" });
  }
});

// POST /api/reply/:token/messages — send reply as talent (no session required)
router.post(
  "/api/reply/:token/messages",
  loadReplyContext,
  async (req, res) => {
    try {
      const { message } = req.body || {};
      const trimmed = typeof message === "string" ? message.trim() : "";

      if (!trimmed) {
        return res.status(400).json({ error: "Message is required" });
      }

      if (trimmed.length > 4000) {
        return res.status(400).json({ error: "Message is too long" });
      }

      const { applicationId, talentUserId, agencyId, tokenId } =
        req.replyContext;
      const { v4: uuidv4 } = require("uuid");
      const messageId = uuidv4();

      await knex("messages").insert({
        id: messageId,
        application_id: applicationId,
        sender_id: talentUserId,
        sender_type: "TALENT",
        message: trimmed,
        is_read: false,
        created_at: knex.fn.now(),
      });

      await logActivity(
        { session: { userId: talentUserId } },
        knex,
        applicationId,
        agencyId,
        "message_sent",
        "Talent replied via magic link",
        { message_preview: trimmed.substring(0, 100), via: "magic_link" },
      );

      await touchReplyToken(tokenId);

      const newMessage = await knex("messages")
        .where({ id: messageId })
        .first();

      return res.json({
        success: true,
        data: newMessage,
      });
    } catch (error) {
      console.error("[Message Reply] POST message error:", error);
      return res.status(500).json({ error: "Failed to send message" });
    }
  },
);

// POST /api/reply/:token/session — optional full-app session bootstrap
router.post("/api/reply/:token/session", loadReplyContext, async (req, res) => {
  try {
    const { talentUserId } = req.replyContext;

    req.session.userId = talentUserId;
    req.session.role = "TALENT";

    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    return res.json({
      success: true,
      data: {
        redirectTo: "/dashboard/talent/applications",
      },
    });
  } catch (error) {
    console.error("[Message Reply] Session bootstrap error:", error);
    return res.status(500).json({ error: "Failed to start session" });
  }
});

module.exports = router;
