/**
 * Instagram OAuth routes (server-side redirect flow + Firebase custom token bridge)
 */

const express = require("express");
const crypto = require("crypto");
const config = require("../../../config");
const {
  isInstagramConfigured,
  buildInstagramAuthorizeUrl,
  verifyInstagramCode,
} = require("../../onboarding/services/providers/instagram");
const { createCustomToken } = require("../services/firebase-admin");

const router = express.Router();

function clientAppUrl(path = "") {
  const base =
    process.env.NODE_ENV === "production"
      ? config.appUrl || "http://localhost:3000"
      : "http://localhost:5173";
  return `${base.replace(/\/$/, "")}${path}`;
}

function safeNext(input) {
  if (!input || typeof input !== "string") return null;
  if (!input.startsWith("/")) return null;
  if (input.startsWith("//")) return null;
  return input;
}

function safeFlow(input) {
  return input === "signup" ? "signup" : "login";
}

router.get("/api/auth/instagram/status", (req, res) => {
  res.json({
    success: true,
    configured: isInstagramConfigured(),
  });
});

router.get("/api/auth/instagram/start", (req, res) => {
  if (!isInstagramConfigured()) {
    return res.status(503).json({
      success: false,
      error:
        "Instagram sign-in is not configured yet. Use Google or email instead.",
    });
  }

  const flow = safeFlow(req.query.flow);
  const nextPath = safeNext(req.query.next);
  const state = crypto.randomBytes(24).toString("hex");

  req.session.instagramOAuth = {
    state,
    flow,
    next: nextPath,
    createdAt: Date.now(),
  };

  try {
    const authorizeUrl = buildInstagramAuthorizeUrl(state);
    return res.redirect(authorizeUrl);
  } catch (error) {
    console.error("[Instagram OAuth] Start error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Unable to start Instagram sign-in.",
    });
  }
});

router.get("/api/auth/instagram/callback", async (req, res) => {
  const { code, state, error, error_reason: errorReason } = req.query;
  const sessionState = req.session?.instagramOAuth;

  const fail = (message) => {
    const params = new URLSearchParams({ error: message });
    return res.redirect(`${clientAppUrl("/auth/instagram/callback")}?${params}`);
  };

  if (error) {
    const message =
      error === "access_denied"
        ? "Instagram sign-in was cancelled."
        : errorReason || "Instagram sign-in failed.";
    return fail(message);
  }

  if (!code || !state || !sessionState?.state) {
    return fail("Missing Instagram authorization data.");
  }

  if (state !== sessionState.state) {
    return fail("Instagram sign-in state mismatch. Please try again.");
  }

  const flow = sessionState.flow || "login";
  const nextPath = sessionState.next;

  try {
    const instagramUser = await verifyInstagramCode(code);
    if (!instagramUser.instagram_id || !instagramUser.handle) {
      return fail("Instagram profile is missing required account details.");
    }

    const firebaseUid = `instagram:${instagramUser.instagram_id}`;
    const customToken = await createCustomToken(firebaseUid, {
      provider: "instagram",
      instagram_handle: instagramUser.handle,
      username: instagramUser.handle.replace(/^@/, ""),
      picture: instagramUser.picture || null,
    });

    req.session.instagramOAuth = {
      customToken,
      flow,
      next: nextPath,
      createdAt: Date.now(),
    };

    const params = new URLSearchParams({ flow });
    if (nextPath) params.set("next", nextPath);
    return res.redirect(
      `${clientAppUrl("/auth/instagram/callback")}?${params.toString()}`,
    );
  } catch (callbackError) {
    console.error("[Instagram OAuth] Callback error:", callbackError.message);
    return fail(callbackError.message || "Instagram sign-in failed.");
  }
});

router.get("/api/auth/instagram/complete", (req, res) => {
  const pending = req.session?.instagramOAuth;
  if (!pending?.customToken) {
    return res.status(404).json({
      success: false,
      error: "No pending Instagram sign-in.",
    });
  }

  const { customToken, flow, next } = pending;
  delete req.session.instagramOAuth;

  return res.json({
    success: true,
    custom_token: customToken,
    flow: flow || "login",
    next: next || null,
  });
});

module.exports = router;
