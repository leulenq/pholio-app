const { addMessage } = require("./context");

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
  const allow = Array.isArray(options.allow) ? options.allow : [];

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
      return next();
    }

    const requestPath = req.path || req.originalUrl || "";
    const requestMethod = (req.method || "GET").toUpperCase();
    const isAllowed = allow.some((entry) => {
      const method = entry?.method ? String(entry.method).toUpperCase() : null;
      if (method && method !== requestMethod) {
        return false;
      }

      if (entry?.path && requestPath === entry.path) {
        return true;
      }

      if (entry?.pathPrefix && requestPath.startsWith(entry.pathPrefix)) {
        return true;
      }

      return false;
    });

    if (isAllowed || req.session.agencyOnboardingCompletedAt) {
      return next();
    }

    if (isApiRequest(req)) {
      return res.status(403).json({
        error: "Agency onboarding incomplete",
        message:
          "Complete first-login onboarding before accessing this resource.",
        redirect: "/dashboard/agency/onboarding",
      });
    }

    return res.redirect("/dashboard/agency/onboarding");
  };
}

module.exports = {
  requireAuth,
  requireRole,
  requireAgencyMembershipRole,
  requireAgencyOnboardingComplete,
};
