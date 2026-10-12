"use strict";

// Product/utility routes must not become search results. Public EJS portfolios
// (/portfolio/:slug and /p/:slug) intentionally retain indexing eligibility.
const PRIVATE_PREFIXES = ["login", "reset-password", "onboarding", "dashboard", "dashboard-app", "reply", "picks", "opencall", "internal", "auth", "socials", "dev", "api", "pdf", "stripe", "guardian-consent", "compcard", "casting", "pro", "agency"];
const PRIVATE_PATHS = new Set(["/", "/apply", "/messages", "/activity", "/reveal", "/signup", "/partners", "/logout", "/upload", "/health"]);

function isPrivateSearchPath(pathname) {
  const path = String(pathname || "").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return PRIVATE_PATHS.has(path) || PRIVATE_PREFIXES.some((prefix) =>
    path === `/${prefix}` || path.startsWith(`/${prefix}/`),
  );
}

function searchIndexing(req, res, next) {
  if (isPrivateSearchPath(req.path)) res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
}

module.exports = { searchIndexing, isPrivateSearchPath };
