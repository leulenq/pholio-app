const { addMessage } = require("../../../shared/middleware/context");
const config = require("../../../config");
const knex = require("../../../shared/db/knex");
const { hasPermission } = require("../../agency/lib/permissions");
const {
  resolveEffectivePermissionsFromSession,
} = require("../../agency/services/permissions");
const {
  resolveRoutePermission,
} = require("../../agency/lib/route-permissions");
const {
  hasCurrentAgencyLegalAcceptance,
} = require("../../agency/services/legal-acceptance");

function ensureSignedIn(req) {
  return Boolean(req.session && req.session.userId);
}

function isApiRequest(req) {
  const accept = req.get && req.get("accept") ? req.get("accept") : "";
  // Use req.originalUrl first (always the full path, unaffected by router mount stripping)
  // then fall back to req.path (may be stripped by router.use prefix matching).
  const path = req.originalUrl || req.path || "";
  // Treat any /api/* or /onboarding/* route as API, plus explicit JSON Accept or XHR
  return (
    path.startsWith("/api/") ||
    path.startsWith("/onboarding/") ||
    (typeof accept === "string" && accept.includes("application/json")) ||
    Boolean(req.xhr)
  );
}

function requireAuth(req, res, next) {
  if (!ensureSignedIn(req)) {
    if (isApiRequest(req)) {
      return res.status(401).json({
        error: "Authentication required",
        message: "Please sign in to continue.",
      });
    }
    addMessage(req, "error", "Please sign in to continue.");
    // Redirect to Client Login (Port 5173 in dev, /login in prod)
    const loginUrl =
      process.env.NODE_ENV === "production"
        ? "/login"
        : "http://localhost:5173/login";
    return res.redirect(loginUrl);
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!ensureSignedIn(req)) {
      if (isApiRequest(req)) {
        return res.status(401).json({
          error: "Authentication required",
          message: "Please sign in to continue.",
        });
      }
      addMessage(req, "error", "Please sign in to continue.");
      // Redirect to Client Login (Port 5173 in dev, /login in prod)
      const loginUrl =
        process.env.NODE_ENV === "production"
          ? "/login"
          : "http://localhost:5173/login";
      return res.redirect(loginUrl);
    }
    const userRole = req.session.role;
    if (roles.length && !roles.includes(userRole)) {
      if (isApiRequest(req)) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to access this resource.",
          requiredRoles: roles,
          role: userRole || null,
        });
      }
      return res.status(403).render("errors/403", { title: "Forbidden" });
    }
    return next();
  };
}

function requireAgencyMembershipRole(...membershipRoles) {
  return (req, res, next) => {
    if (!ensureSignedIn(req)) {
      if (isApiRequest(req)) {
        return res.status(401).json({
          error: "Authentication required",
          message: "Please sign in to continue.",
        });
      }
      addMessage(req, "error", "Please sign in to continue.");
      const loginUrl =
        process.env.NODE_ENV === "production"
          ? "/login"
          : "http://localhost:5173/login";
      return res.redirect(loginUrl);
    }

    if (req.session.role !== "AGENCY") {
      if (isApiRequest(req)) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to access this resource.",
          requiredRoles: ["AGENCY"],
          role: req.session.role || null,
        });
      }
      return res.status(403).render("errors/403", { title: "Forbidden" });
    }

    const membershipRole = req.session.agencyMembershipRole || null;
    if (
      !membershipRole ||
      (membershipRoles.length && !membershipRoles.includes(membershipRole))
    ) {
      if (isApiRequest(req)) {
        return res.status(403).json({
          error: "Forbidden",
          message:
            "Your agency membership does not have permission to access this resource.",
          requiredMembershipRoles: membershipRoles,
          membershipRole,
        });
      }
      return res.status(403).render("errors/403", { title: "Forbidden" });
    }

    return next();
  };
}
function routeMatchesAllow(req, rule) {
  const method = (req.method || "GET").toUpperCase();
  if (rule.method && rule.method.toUpperCase() !== method) return false;

  const original = (req.originalUrl || req.path || "").split("?")[0];
  const normalized = original.startsWith("/api/agency")
    ? original.slice("/api/agency".length) || "/"
    : original;

  if (rule.path && normalized === rule.path) return true;
  if (rule.pathPrefix && normalized.startsWith(rule.pathPrefix)) return true;
  return false;
}

function requireAgencyOnboardingComplete(options = {}) {
  const allow = Array.isArray(options.allow) ? options.allow : [];
  return (req, res, next) => {
    if (!req.session || req.session.role !== "AGENCY") {
      return next();
    }

    if (req.session.agencyOnboardingCompletedAt) {
      return next();
    }

    if (allow.some((rule) => routeMatchesAllow(req, rule))) {
      return next();
    }

    if (isApiRequest(req)) {
      return res.status(403).json({
        success: false,
        error: "AGENCY_SETUP_REQUIRED",
        message: "Complete agency setup before using the agency dashboard.",
        redirect: "/dashboard/agency/setup",
      });
    }

    return res.redirect("/dashboard/agency/setup");
  };
}

function requireAgencyLegalAcceptance() {
  return async (req, res, next) => {
    if (!req.session || req.session.role !== "AGENCY") {
      return next();
    }

    if (!config.agencyLegalEnforce && process.env.NODE_ENV !== "production") {
      return next();
    }

    const normalizedPath = (req.originalUrl || req.path || "")
      .split("?")[0]
      .replace(/^\/api\/agency/, "") || "/";
    const legalExempt =
      (req.method === "GET" && normalizedPath === "/legal-status") ||
      (req.method === "POST" && normalizedPath === "/legal-acceptance");
    if (legalExempt) {
      return next();
    }

    try {
      if (await hasCurrentAgencyLegalAcceptance(req.session)) {
        return next();
      }
      return res.status(403).json({
        success: false,
        error: "AGENCY_LEGAL_ACCEPTANCE_REQUIRED",
        message:
          "Accept the current agency workspace policies before continuing.",
      });
    } catch (error) {
      if (
        error.code === "ACTIVE_AGENCY_MEMBERSHIP_REQUIRED" ||
        error.code === "AGENCY_POLICY_MANIFEST_UNAVAILABLE"
      ) {
        return res.status(error.status || 403).json({
          success: false,
          error: error.code,
          message: error.message,
        });
      }
      return next(error);
    }
  };
}

async function loadAgencyPermissions(req, _res, next) {
  if (!req.session || req.session.role !== "AGENCY") {
    return next();
  }

  try {
    if (!req.agencyPermissions) {
      req.agencyPermissions = await resolveEffectivePermissionsFromSession(
        req.session,
      );
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAgencyPermission(...permissions) {
  return async (req, res, next) => {
    if (!ensureSignedIn(req)) {
      if (isApiRequest(req)) {
        return res.status(401).json({
          error: "Authentication required",
          message: "Please sign in to continue.",
        });
      }
      addMessage(req, "error", "Please sign in to continue.");
      const loginUrl =
        process.env.NODE_ENV === "production"
          ? "/login"
          : "http://localhost:5173/login";
      return res.redirect(loginUrl);
    }

    if (req.session.role !== "AGENCY") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Agency access required.",
      });
    }

    if (!req.agencyPermissions) {
      req.agencyPermissions = await resolveEffectivePermissionsFromSession(
        req.session,
      );
    }

    const missing = permissions.filter(
      (p) => !hasPermission(req.agencyPermissions, p),
    );

    if (missing.length) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to perform this action.",
        requiredPermissions: permissions,
        missingPermissions: missing,
        presetRole: req.session.agencyMembershipRole || null,
      });
    }

    return next();
  };
}

function resolveAccountUserId(session) {
  if (!session) return null;
  if (session.role === "AGENCY" && session.memberUserId) {
    return session.memberUserId;
  }
  return session.userId || null;
}

function requireActiveAccount() {
  return async (req, res, next) => {
    if (!ensureSignedIn(req)) {
      return next();
    }

    const accountUserId = resolveAccountUserId(req.session);
    if (!accountUserId) {
      return next();
    }

    try {
      // Missing user row — this destroys the session outright, so a request
      // landing here right after the row was just written (session.regenerate()
      // in /login or /onboarding/entry runs immediately after the insert/lookup
      // that established req.session.userId) must not be confused with a
      // genuinely deleted account: a transient read miss (a lagging
      // pooled/serverless-DB connection — e.g. Neon resuming from an idle
      // suspend — or a brief connection hiccup) would otherwise silently and
      // permanently kill a session that is actually fine, with no trace in
      // the logs. Retry with backoff (300ms, then 900ms — 1.2s total, well
      // inside the function's own timeout budget) before concluding the
      // account is genuinely gone; a real deletion still gets caught at the
      // end of the retries.
      const RETRY_DELAYS_MS = [300, 900];
      let user = await knex("users")
        .where({ id: accountUserId })
        .select("account_status")
        .first();

      for (let attempt = 0; !user && attempt < RETRY_DELAYS_MS.length; attempt++) {
        console.warn(
          "[requireActiveAccount] users row not found — retrying before treating as deleted:",
          {
            userId: accountUserId,
            path: req.originalUrl || req.path,
            attempt: attempt + 1,
            delayMs: RETRY_DELAYS_MS[attempt],
          },
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        user = await knex("users")
          .where({ id: accountUserId })
          .select("account_status")
          .first();
      }

      if (!user) {
        console.warn(
          "[requireActiveAccount] users row still not found after all retries — destroying session:",
          { userId: accountUserId, path: req.originalUrl || req.path },
        );
        return req.session.destroy((destroyErr) => {
          if (destroyErr) return next(destroyErr);
          return next();
        });
      }

      const status = user.account_status || "active";
      if (status !== "suspended" && status !== "banned") {
        return next();
      }

      if (isApiRequest(req)) {
        return res.status(403).json({
          error: "Account restricted",
          message:
            status === "banned"
              ? "Your account has been banned."
              : "Your account is suspended.",
          accountStatus: status,
        });
      }

      return res.status(403).render("errors/403", { title: "Account restricted" });
    } catch (error) {
      return next(error);
    }
  };
}

function enforceAgencyRoutePermissions() {
  return async (req, res, next) => {
    if (!req.session || req.session.role !== "AGENCY") {
      return next();
    }

    const path = req.originalUrl?.split("?")[0] || req.path || "";
    if (!path.startsWith("/api/agency")) {
      return next();
    }

    // KILLSWITCH (defense in depth): production ALWAYS enforces regardless of
    // config/env — mirrors config.agencyRbacEnforce, but recomputed here so a
    // stale/overridden config value can never open the surface in prod.
    const enforce =
      config.agencyRbacEnforce || process.env.NODE_ENV === "production";

    const method = (req.method || "GET").toUpperCase();
    const required = resolveRoutePermission(method, path);

    if (!required) {
      // Unmapped route. Fail CLOSED for unsafe methods (a write with no
      // permission mapping is a coverage gap, not an intentional allow), but
      // allow safe reads during the transition so a missed GET mapping does
      // not take down a read surface. Every case is logged for cleanup.
      const isSafeMethod = method === "GET" || method === "HEAD";
      if (isSafeMethod) {
        console.warn("[RBAC] Unmapped agency route (allowing safe method):", {
          path,
          method,
        });
        return next();
      }

      console.warn(
        "[RBAC] Unmapped agency write route (fail closed):",
        { path, method, presetRole: req.session.agencyMembershipRole },
      );
      if (!enforce) {
        return next();
      }
      return res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to perform this action.",
        reason: "unmapped_route",
      });
    }

    if (!req.agencyPermissions) {
      req.agencyPermissions = await resolveEffectivePermissionsFromSession(
        req.session,
      );
    }

    if (hasPermission(req.agencyPermissions, required)) {
      return next();
    }

    if (!enforce) {
      console.warn("[RBAC] Permission violation (enforce off):", {
        path,
        method,
        required,
        presetRole: req.session.agencyMembershipRole,
        memberUserId: req.session.memberUserId,
      });
      return next();
    }

    return res.status(403).json({
      error: "Forbidden",
      message: "You do not have permission to perform this action.",
      requiredPermissions: [required],
      missingPermissions: [required],
      presetRole: req.session.agencyMembershipRole || null,
    });
  };
}

module.exports = {
  requireAuth,
  requireRole,
  requireAgencyMembershipRole,
  requireAgencyOnboardingComplete,
  requireAgencyLegalAcceptance,
  loadAgencyPermissions,
  requireAgencyPermission,
  enforceAgencyRoutePermissions,
  requireActiveAccount,
};
