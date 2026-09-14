"use strict";

const { isMinorProfile } = require("../lib/talent-age");

// Keep privacy/safety exits usable even if onboarding or legal acceptance is
// incomplete. This is a narrow allowlist, not a bypass for every settings write.
function isSafetyExit(req) {
  const pathname = (req.originalUrl || req.path || "").split("?")[0].replace(/\/+$/, "");
  const method = String(req.method || "GET").toUpperCase();
  return (method === "DELETE" && /^\/api\/talent\/(?:settings\/(?:account|sessions(?:\/[^/]+)?)|media\/[^/]+|external-comp-cards\/[^/]+)$/.test(pathname)) ||
    (method === "POST" && /^\/api\/talent\/(?:applications\/[^/]+\/withdraw|settings\/(?:data-export|deactivate)|guardian-consent\/revoke)$/.test(pathname));
}

function requireLaunchAgeEligibility(db) {
  return async (req, res, next) => {
    if (req.session?.role !== "TALENT" || !req.session.userId || isSafetyExit(req)) return next();
    const method = String(req.method || "GET").toUpperCase();
    const pathname = (req.originalUrl || req.path || "").split("?")[0];
    // Read-only self-management stays available; public/agency exposure has its
    // own authoritative age checks and does not depend on the viewer session.
    if (["GET", "HEAD", "OPTIONS"].includes(method) && !pathname.startsWith("/stripe/")) return next();
    if (pathname === "/api/reports" || pathname.startsWith("/api/reports/")) return next();
    try {
      const profile = await db("profiles").where({ user_id: req.session.userId }).first("date_of_birth");
      if (!isMinorProfile(profile)) return next();
      return res.status(403).json({
        success: false,
        error: "ADULTS_ONLY_LAUNCH",
        message: "Pholio is currently available to adults aged 18 and over. You can still withdraw submissions, export your data, or delete your account.",
      });
    } catch (error) { return next(error); }
  };
}

module.exports = { isSafetyExit, requireLaunchAgeEligibility };
