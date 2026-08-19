/**
 * Instagram OAuth routes (server-side redirect flow + Firebase custom token bridge)
 */

const express = require("express");
const crypto = require("crypto");
const config = require("../../../config");
const knex = require("../../../shared/db/knex");
const { deleteUserAccount } = require("../../../shared/lib/account-deletion");
const { revokeAllSessions } = require("../../../shared/lib/session-registry");
const {
  isInstagramConfigured,
  buildInstagramAuthorizeUrl,
  verifyInstagramCode,
  verifyInstagramSignedRequest,
} = require("../../onboarding/services/providers/instagram");
const {
  createCustomToken,
  revokeRefreshTokens,
} = require("../services/firebase-admin");

const router = express.Router();
const INSTAGRAM_OAUTH_MAX_AGE_MS = 10 * 60 * 1000;

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

function instagramFirebaseUid(instagramUserId) {
  return `instagram:${String(instagramUserId)}`;
}

function dataDeletionStatusUrl(confirmationCode, status) {
  const url = new URL(
    "/api/auth/instagram/data-deletion/status",
    config.appUrl || "http://localhost:3000",
  );
  url.searchParams.set("code", confirmationCode);
  url.searchParams.set("status", status);
  return url.toString();
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

router.post("/api/auth/instagram/deauthorize", async (req, res) => {
  let payload;
  try {
    payload = verifyInstagramSignedRequest(req.body?.signed_request);
  } catch (error) {
    console.warn("[Instagram OAuth] Deauthorization rejected:", error.message);
    return res
      .status(400)
      .json({ success: false, error: "INVALID_SIGNED_REQUEST" });
  }

  const firebaseUid = instagramFirebaseUid(payload.user_id);
  const user = await knex("users")
    .where({ firebase_uid: firebaseUid })
    .select("id")
    .first();

  if (user) {
    await Promise.all([
      revokeAllSessions(knex, user.id),
      revokeRefreshTokens(firebaseUid),
    ]);
  }

  return res.status(200).json({ success: true });
});

router.post("/api/auth/instagram/data-deletion", async (req, res) => {
  let payload;
  try {
    payload = verifyInstagramSignedRequest(req.body?.signed_request);
  } catch (error) {
    console.warn("[Instagram OAuth] Data deletion rejected:", error.message);
    return res
      .status(400)
      .json({ success: false, error: "INVALID_SIGNED_REQUEST" });
  }

  const firebaseUid = instagramFirebaseUid(payload.user_id);
  const user = await knex("users")
    .where({ firebase_uid: firebaseUid })
    .select("id")
    .first();

  let status = "complete";
  if (user) {
    const result = await deleteUserAccount(knex, user.id);
    status = result.fullyErased ? "complete" : "processing";
  }

  const confirmationCode = crypto.randomBytes(16).toString("hex");
  return res.json({
    url: dataDeletionStatusUrl(confirmationCode, status),
    confirmation_code: confirmationCode,
  });
});

router.get("/api/auth/instagram/data-deletion/status", (req, res) => {
  const confirmationCode = String(req.query.code || "");
  if (!/^[a-f0-9]{32}$/.test(confirmationCode)) {
    return res
      .status(400)
      .json({ success: false, error: "INVALID_CONFIRMATION_CODE" });
  }

  const status = req.query.status === "processing" ? "processing" : "complete";
  res.set("Cache-Control", "no-store");
  return res.json({
    success: true,
    confirmation_code: confirmationCode,
    status,
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

  if (
    !Number.isFinite(sessionState.createdAt) ||
    Date.now() - sessionState.createdAt > INSTAGRAM_OAUTH_MAX_AGE_MS
  ) {
    delete req.session.instagramOAuth;
    return fail("Instagram sign-in expired. Please try again.");
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

    const firebaseUid = instagramFirebaseUid(instagramUser.instagram_id);
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
  if (
    !Number.isFinite(pending.createdAt) ||
    Date.now() - pending.createdAt > INSTAGRAM_OAUTH_MAX_AGE_MS
  ) {
    delete req.session.instagramOAuth;
    return res.status(410).json({
      success: false,
      error: "Instagram sign-in session expired. Please try again.",
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
