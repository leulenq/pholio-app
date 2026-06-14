const { addMessage } = require("../../../shared/middleware/context");
const config = require("../../../config");
const { hasPermission } = require("../../agency/lib/permissions");
const {
  resolveEffectivePermissionsFromSession,
} = require("../../agency/services/permissions");
const {
  resolveRoutePermission,
} = require("../../agency/lib/route-permissions");

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
function requireAgencyOnboardingComplete(options = {}) {
  return (req, res, next) => next();
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

function enforceAgencyRoutePermissions() {
  return async (req, res, next) => {
    if (!req.session || req.session.role !== "AGENCY") {
      return next();
    }

    const path = req.originalUrl?.split("?")[0] || req.path || "";
    if (!path.startsWith("/api/agency")) {
      return next();
    }

    const required = resolveRoutePermission(req.method, path);
    if (!required) {
      return next();
    }

    if (!req.agencyPermissions) {
      req.agencyPermissions = await resolveEffectivePermissionsFromSession(
        req.session,
      );
    }

    if (hasPermission(req.agencyPermissions, required)) {
      return next();
    }

    if (!config.agencyRbacEnforce) {
      console.warn("[RBAC] Permission violation (enforce off):", {
        path,
        method: req.method,
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
  loadAgencyPermissions,
  requireAgencyPermission,
  enforceAgencyRoutePermissions,
};
