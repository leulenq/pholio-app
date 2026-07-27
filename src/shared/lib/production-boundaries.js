/**
 * Production-only boundaries between the app and marketing origins.
 *
 * The marketing site is intentionally a separate application. It must not be
 * able to establish, read, or mutate an app.pholio.studio browser session just
 * because both hosts sit under pholio.studio. These helpers keep the app's
 * session cookie and credentialed CORS surface host-only in production.
 */

const APP_ORIGIN = "https://app.pholio.studio";
const LEGACY_SHARED_COOKIE_DOMAIN = ".pholio.studio";
const CLIENT_INTENT_HEADER = "x-pholio-request";
const CLIENT_INTENT_VALUE = "same-origin";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function credentialedCorsOrigins() {
  if (isProduction()) {
    return [APP_ORIGIN];
  }

  return [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:3001",
    "http://localhost:3002",
  ];
}

function sessionMutationOrigins() {
  return new Set(
    isProduction()
      ? [APP_ORIGIN]
      : ["http://localhost:3000", "http://localhost:5173"],
  );
}

/**
 * Overrides the legacy shared-domain cookie helper for authenticated sessions.
 * Setting `domain` to undefined deliberately omits Domain from Set-Cookie,
 * making the cookie host-only at app.pholio.studio.
 */
function sessionCookieScope() {
  return isProduction() ? { domain: undefined } : {};
}

function legacySharedSessionCookieOptions() {
  return {
    domain: LEGACY_SHARED_COOKIE_DOMAIN,
    path: "/",
    sameSite: "lax",
    secure: true,
    httpOnly: true,
  };
}

function requestOrigin(req) {
  const raw = req.get("origin") || req.get("referer");
  if (!raw) return null;

  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function sendClientIntentError(res, reason) {
  return res.status(403).json({
    success: false,
    error: {
      code: "SAME_ORIGIN_REQUIRED",
      message: "This request could not be verified as coming from Pholio.",
      reason,
    },
  });
}

/**
 * Protects auth/session lifecycle writes that predate the generic dashboard
 * mutation guard. Requiring the non-simple header prevents HTML-form CSRF;
 * requiring a recognized Origin/Referer prevents a trusted sibling origin
 * from using a server-side proxy as an app-session bridge.
 */
function requireSessionMutationClientIntent(options = {}) {
  const enabled = options.enabled !== false;

  return function sessionMutationClientIntent(req, res, next) {
    if (!enabled || ["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next();
    }

    const origin = requestOrigin(req);
    const pathname = (req.originalUrl || req.path || "").split("?")[0];
    const isDevBootstrap =
      process.env.NODE_ENV !== "production" &&
      ["/api/dev/login", "/api/dev/bootstrap"].includes(pathname);

    // Existing Vite dev bootstraps cannot send a custom header yet, but their
    // browser Origin is still mandatory and narrowed to the Vite/app origins.
    // Production never takes this branch because dev bootstrap is disabled.
    if (
      isDevBootstrap &&
      origin &&
      sessionMutationOrigins().has(origin) &&
      req.get(CLIENT_INTENT_HEADER) !== CLIENT_INTENT_VALUE
    ) {
      return next();
    }

    if (req.get(CLIENT_INTENT_HEADER) !== CLIENT_INTENT_VALUE) {
      return sendClientIntentError(res, "missing_request_header");
    }

    if (!origin || !sessionMutationOrigins().has(origin)) {
      return sendClientIntentError(res, "untrusted_origin");
    }

    return next();
  };
}

module.exports = {
  APP_ORIGIN,
  CLIENT_INTENT_HEADER,
  CLIENT_INTENT_VALUE,
  credentialedCorsOrigins,
  sessionMutationOrigins,
  sessionCookieScope,
  legacySharedSessionCookieOptions,
  requireSessionMutationClientIntent,
};
