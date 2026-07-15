const express = require("express");
const knex = require("../../../shared/db/knex");
const logActivity = require("../../agency/routes/agency-log-activity");
const {
  notifyAgencyNewMessage,
} = require("../../../shared/services/agency-notifications");
const {
  validateReplyToken,
  touchReplyToken,
  issueReplySessionToken,
  consumeReplySessionToken,
} = require("../services/message-reply-tokens");

const router = express.Router();

async function loadReplyContext(req, res, next) {
  try {
    // SEC-0.8: validateReplyToken resolves the row via findByRawToken(), i.e. by
    // hashing the raw token from the URL and matching the stored token_hash. All
    // three consumers below (GET thread, POST message, POST session) go through
    // this middleware, so none of them ever touch a plaintext token column.
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

      try {
        const talentName = [
          req.replyContext.talentFirstName,
          req.replyContext.talentLastName,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();
        await notifyAgencyNewMessage({
          agencyId,
          applicationId,
          talentName: talentName || "A talent",
          preview: trimmed.substring(0, 80),
        });
      } catch (notifyErr) {
        console.error("[Message Reply] Agency notification failed:", notifyErr);
      }

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

// POST /api/reply/:token/session-token — exchange the emailed reply bearer for a
// fresh, ten-minute, one-time dashboard bootstrap credential. Only one can be
// issued per emailed-token rotation, so replaying the long-lived reply bearer
// cannot mint repeated authenticated sessions.
router.post(
  "/api/reply/:token/session-token",
  loadReplyContext,
  async (req, res) => {
    try {
      const sessionToken = await issueReplySessionToken(req.replyContext);
      await touchReplyToken(req.replyContext.tokenId);
      return res.status(201).json({ success: true, data: sessionToken });
    } catch (error) {
      if (error.code === "REPLY_SESSION_TOKEN_ALREADY_ISSUED") {
        return res.status(409).json({
          success: false,
          error: {
            code: error.code,
            message:
              "Dashboard access was already started from this link. Request a new message link if you still need access.",
          },
        });
      }
      console.error("[Message Reply] Session token issue error:", error);
      return res.status(500).json({ error: "Failed to start dashboard access" });
    }
  },
);

// POST /api/reply/:token/session — optional full-app session bootstrap. Here
// :token is the short-lived bootstrap credential, never the emailed reply bearer.
router.post("/api/reply/:token/session", async (req, res) => {
  try {
    const bootstrapContext = await consumeReplySessionToken(req.params.token);
    if (!bootstrapContext) {
      return res.status(410).json({
        success: false,
        error: {
          code: "REPLY_SESSION_TOKEN_INVALID_OR_USED",
          message:
            "This dashboard access token is invalid, expired, or has already been used.",
        },
      });
    }

    const { talentUserId, applicationId } = bootstrapContext;

    console.warn(
      "[Message Reply][SECURITY] Full session bootstrap via magic link",
      { applicationId, talentUserId },
    );

    // Regenerate the session id before establishing the authenticated session
    // (SEC-0.7: session-fixation gap) — consistent with the /login handlers.
    // The pre-bootstrap session carries no state we need to preserve here.
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

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
