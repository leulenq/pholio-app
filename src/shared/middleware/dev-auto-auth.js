"use strict";

const {
  isDevSeedAuthEnabled,
  establishDevSeedSession,
} = require("../lib/dev-seed-session");

/**
 * Dev Auto-Auth Middleware
 *
 * Automatically signs in a seeded principal in development when no usable
 * session exists. Role is inferred from dashboard path / Referer.
 *
 * Prefer the explicit /api/dev/bootstrap call from SessionGates — this
 * middleware remains as a safety net for API/referer-driven entry.
 */
async function devAutoAuth(req, res, next) {
  if (!isDevSeedAuthEnabled()) {
    return next();
  }

  const path = req.originalUrl || req.path || "";
  const referer = (req.get && req.get("referer")) || req.headers?.referer || "";

  let targetRole = null;
  const inferredFromReferer =
    typeof referer === "string" && referer.includes("/dashboard/agency")
      ? "AGENCY"
      : typeof referer === "string" &&
          (referer.includes("/dashboard/talent") ||
            referer.includes("/onboarding"))
        ? "TALENT"
        : null;

  if (
    path.includes("/dashboard/agency") ||
    path.includes("/api/agency") ||
    (path.includes("/api/session") && inferredFromReferer === "AGENCY")
  ) {
    targetRole = "AGENCY";
  } else if (
    path.includes("/dashboard/talent") ||
    path.includes("/api/talent") ||
    path.includes("/onboarding") ||
    (path.includes("/api/session") && inferredFromReferer === "TALENT")
  ) {
    targetRole = "TALENT";
  }

  if (!targetRole) {
    return next();
  }

  try {
    // Keep an existing authenticated session unless this is an explicit
    // dashboard/session entry for the other role. Prevents /api/talent or
    // /onboarding calls from silently stealing an agency workspace session.
    if (req.session?.userId && req.session?.role) {
      if (req.session.role === targetRole) {
        return next();
      }

      const isExplicitEntry =
        path.includes("/dashboard/") ||
        path.includes("/api/session") ||
        path.includes("/api/dev/");

      if (!isExplicitEntry) {
        return next();
      }
    }

    const result = await establishDevSeedSession(req, targetRole);
    if (result.ok) {
      console.log(
        `[DevAutoAuth] Automatically signed in as ${result.email} for path ${path}`,
      );
    } else if (result.status !== 404) {
      console.warn(`[DevAutoAuth] ${result.error}`);
    }
    return next();
  } catch (error) {
    console.error("[DevAutoAuth] Error during auto-login:", error);
    return next();
  }
}

module.exports = devAutoAuth;
