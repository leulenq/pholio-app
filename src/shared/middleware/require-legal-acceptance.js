const knex = require("../db/knex");
const { requireLegalAcceptance } = require("../lib/legal-acceptance");

const EXEMPT_SUFFIXES = [
  "/settings/legal-acceptance",
  "/settings/legal-status",
  "/applications/submission-program-status",
  "/applications/submission-program-acknowledgment",
];

function resolveTalentApiPath(req) {
  const raw = (req.originalUrl || req.path || "").split("?")[0];
  const marker = "/api/talent";
  const idx = raw.indexOf(marker);
  if (idx >= 0) {
    const suffix = raw.slice(idx + marker.length);
    return suffix || "/";
  }
  return raw;
}

function isExemptPath(req) {
  const path = resolveTalentApiPath(req);
  const method = (req.method || "GET").toUpperCase();

  if (EXEMPT_SUFFIXES.some((suffix) => path.endsWith(suffix))) {
    return true;
  }

  // Dashboard bootstrap: allow read-only profile load while legal gate is shown.
  if (method === "GET" && path === "/profile") {
    return true;
  }

  return false;
}

function isApiRequest(req) {
  const accept = req.get && req.get("accept") ? req.get("accept") : "";
  const path = req.originalUrl || req.path || "";
  return (
    path.startsWith("/api/") ||
    (typeof accept === "string" && accept.includes("application/json")) ||
    Boolean(req.xhr)
  );
}

/**
 * Require stored Terms + Privacy acceptance for TALENT API routes.
 */
function requireTalentLegalAcceptance() {
  return async (req, res, next) => {
    if (!req.session?.userId || req.session.role !== "TALENT") {
      return next();
    }

    if (isExemptPath(req)) {
      return next();
    }

    try {
      const user = await knex("users").where({ id: req.session.userId }).first();
      if (!user) {
        return next();
      }

      if (requireLegalAcceptance(user, { throwOnMissing: false })) {
        return next();
      }

      if (isApiRequest(req)) {
        return res.status(403).json({
          error: "LEGAL_ACCEPTANCE_REQUIRED",
          message:
            "Please accept the current Terms of Service and Privacy Policy to continue.",
        });
      }

      return res.redirect("/login?legal=required");
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  requireTalentLegalAcceptance,
};
