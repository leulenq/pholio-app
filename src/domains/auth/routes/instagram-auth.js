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

function adultDateOfBirth(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;

  const [year, month, day] = value.split("-").map(Number);
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (
    birth.getUTCFullYear() !== year ||
    birth.getUTCMonth() !== month - 1 ||
    birth.getUTCDate() !== day
  ) {
    return null;
  }

  const calendar = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .forEach(({ type, value: part }) => {
      if (type !== "literal") calendar[type] = Number(part);
    });

  let age = calendar.year - year;
  if (
    calendar.month < month ||
    (calendar.month === month && calendar.day < day)
  ) {
    age -= 1;
  }

  return age >= 18 && age < 130 ? value : null;
}

router.get("/api/auth/instagram/status", (req, res) => {
  res.json({
    success: true,
    configured: isInstagramConfigured(),
  });
});

async function startInstagramAuth(req, res) {
  if (!isInstagramConfigured()) {
    return res.status(503).json({
      success: false,
      error:
        "Instagram sign-in is not configured yet. Use Google or email instead.",
    });
  }

  const flow = safeFlow(req.query.flow);
  const nextPath = safeNext(req.query.next);
  const dateOfBirth = req.body?.date_of_birth;

  if (flow === "signup" && !adultDateOfBirth(dateOfBirth)) {
    return res.status(400).json({
      success: false,
      error: "ADULT_ELIGIBILITY_REQUIRED",
      message: "A valid adult date of birth is required before Instagram sign-up.",
    });
  }

  const state = crypto.randomBytes(24).toString("hex");

  req.session.instagramOAuth = {
    state,
    flow,
    next: nextPath,
    dateOfBirth: flow === "signup" ? dateOfBirth : null,
    createdAt: Date.now(),
  };

  try {
    const authorizeUrl = buildInstagramAuthorizeUrl(state);
    if (req.method === "POST") {
      return res.json({ success: true, authorize_url: authorizeUrl });
    }
    return res.redirect(authorizeUrl);
  } catch (error) {
    console.error("[Instagram OAuth] Start error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Unable to start Instagram sign-in.",
    });
  }
}

router.get("/api/auth/instagram/start", startInstagramAuth);
router.post("/api/auth/instagram/start", startInstagramAuth);

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
      dateOfBirth: sessionState.dateOfBirth || null,
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

  const { customToken, flow, next, dateOfBirth } = pending;
  delete req.session.instagramOAuth;

  return res.json({
    success: true,
    custom_token: customToken,
    flow: flow || "login",
    next: next || null,
    date_of_birth: flow === "signup" ? dateOfBirth || null : null,
  });
});

module.exports = router;
