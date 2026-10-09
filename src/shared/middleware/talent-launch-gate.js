"use strict";

const { isSafetyExit } = require("./launch-age-policy");
const {
  launchNotifyUrl,
  launchPendingBody,
  sessionHasTalentAccess,
} = require("../lib/talent-launch");

// Talent account creation. Closed to everyone without access, signed in or not.
const SIGNUP_PATH = /^\/(?:signup|onboarding|casting)(?:\/|$)/;

// Talent product surfaces. Closed to TALENT sessions without access.
const TALENT_PATH = /^\/(?:api\/talent|dashboard\/talent|reveal|stripe|pro)(?:\/|$)/;

function wantsJson(req, pathname) {
  const method = String(req.method || "GET").toUpperCase();
  return (
    pathname.startsWith("/api/") ||
    method !== "GET" ||
    (req.headers.accept || "").includes("application/json") ||
    req.xhr
  );
}

/**
 * Holds talent out of the product until launch (see shared/lib/talent-launch.js).
 *
 * Mounted before the auth routes so /signup is covered. Agency sessions pass
 * untouched. Login itself refuses TALENT accounts in auth.js, so this mostly
 * catches sessions that predate the gate and direct hits on signup paths.
 * Safety exits (delete account, export data, withdraw) stay reachable.
 */
function requireTalentLaunchOpen() {
  return (req, res, next) => {
    if (req.session?.role === "AGENCY") return next();
    if (sessionHasTalentAccess(req.session)) return next();

    const pathname = (req.originalUrl || req.path || "").split("?")[0];
    const isTalentSession = req.session?.role === "TALENT" && Boolean(req.session.userId);
    const blocked =
      SIGNUP_PATH.test(pathname) ||
      (isTalentSession && TALENT_PATH.test(pathname) && !isSafetyExit(req));
    if (!blocked) return next();

    if (wantsJson(req, pathname)) {
      return res.status(403).json(launchPendingBody());
    }
    return res.redirect(303, launchNotifyUrl());
  };
}

module.exports = { requireTalentLaunchOpen };
