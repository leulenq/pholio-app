const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Cookie-authenticated dashboard writes. These are only ever issued by the
// Pholio app origin, so both the custom header and a recognized Origin/Referer
// are required.
const PROTECTED_API_PREFIXES = [
  "/api/agency",
  "/api/talent",
  "/api/reply",
  "/api/internal",
  // Designer pick lists. Not cookie-authenticated — the credential is the raw
  // token in the URL — but the same reasoning applies: a forwarded link opened
  // in a browser must not let a third-party page drive writes against it, so a
  // designer's marks have to come from the Pholio page they are looking at.
  "/api/picks",
];

// Session lifecycle endpoints. The marketing site (www.pholio.studio) calls
// these too — but it reaches Express through the Next.js server-side rewrite in
// pholio-landing (`next.config.ts` proxies /api/* to this app), so we cannot
// rely on a browser Origin header surviving that hop.
//
// The custom header is the load-bearing control here and it is sufficient on
// its own: an HTML form cannot set a request header, and cross-origin JS cannot
// set one without a preflight that our CORS allowlist rejects. Origin/Referer
// is checked as defense in depth when present, and a request that presents
// neither is allowed through on the strength of the header alone.
const HEADER_ONLY_API_PATHS = [
  "/api/login",
  "/api/logout",
  "/api/auth/password-reset",
];

const REQUEST_HEADER = "x-pholio-request";
const REQUEST_HEADER_VALUE = "same-origin";

function normalizeOrigin(value) {
  if (!value || typeof value !== "string") return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isProtectedApiPath(pathname) {
  return PROTECTED_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isHeaderOnlyApiPath(pathname) {
  return HEADER_ONLY_API_PATHS.includes(pathname);
}

function getRequestSourceOrigin(req) {
  const originHeader = req.get("origin");
  if (originHeader !== undefined) {
    return normalizeOrigin(originHeader);
  }

  return normalizeOrigin(req.get("referer"));
}

function getAllowedAppOrigins() {
  const origins = new Set([
    "http://localhost:3000",
    "http://localhost:5173",
    "https://app.pholio.studio",
  ]);

  [process.env.APP_URL, process.env.DEPLOY_PRIME_URL, process.env.URL]
    .map(normalizeOrigin)
    .filter(Boolean)
    .forEach((origin) => origins.add(origin));

  return origins;
}

// Session lifecycle is the one surface the marketing site shares with the app,
// so it — and only it — additionally trusts the marketing origin. Dashboard
// mutation paths keep the narrower app-only allowlist above.
function getAllowedSessionOrigins() {
  const origins = getAllowedAppOrigins();

  origins.add("http://localhost:3001");
  origins.add("http://localhost:3002");
  origins.add("https://www.pholio.studio");

  const marketing = normalizeOrigin(process.env.MARKETING_SITE_URL);
  if (marketing) origins.add(marketing);

  return origins;
}

function sendSameOriginError(res, reason) {
  return res.status(403).json({
    success: false,
    error: {
      code: "SAME_ORIGIN_REQUIRED",
      message: "This request could not be verified as coming from Pholio.",
      reason,
    },
  });
}

function sameOriginMutationGuard(options = {}) {
  const enabled = options.enabled !== false;
  const allowedOrigins = options.allowedOrigins || getAllowedAppOrigins();
  const allowedSessionOrigins =
    options.allowedSessionOrigins || getAllowedSessionOrigins();

  return function guardSameOriginMutation(req, res, next) {
    if (!enabled || SAFE_METHODS.has(req.method)) return next();

    const pathname = (req.originalUrl || req.path || "").split("?")[0];
    const headerOnly = isHeaderOnlyApiPath(pathname);
    if (!headerOnly && !isProtectedApiPath(pathname)) return next();

    if (req.get(REQUEST_HEADER) !== REQUEST_HEADER_VALUE) {
      return sendSameOriginError(res, "missing_request_header");
    }

    const sourceOrigin = getRequestSourceOrigin(req);

    if (headerOnly) {
      // Absent Origin/Referer is tolerated here (the marketing proxy hop may
      // drop it); a present-but-unrecognized one is still rejected.
      if (sourceOrigin && !allowedSessionOrigins.has(sourceOrigin)) {
        return sendSameOriginError(res, "untrusted_origin");
      }
      return next();
    }

    if (!sourceOrigin || !allowedOrigins.has(sourceOrigin)) {
      return sendSameOriginError(res, "untrusted_origin");
    }

    return next();
  };
}

module.exports = {
  REQUEST_HEADER,
  REQUEST_HEADER_VALUE,
  HEADER_ONLY_API_PATHS,
  getAllowedAppOrigins,
  getAllowedSessionOrigins,
  isProtectedApiPath,
  isHeaderOnlyApiPath,
  sameOriginMutationGuard,
};
