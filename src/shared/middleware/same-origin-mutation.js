const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PROTECTED_API_PREFIXES = [
  "/api/agency",
  "/api/talent",
  "/api/reply",
  "/api/internal",
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

  return function guardSameOriginMutation(req, res, next) {
    if (!enabled || SAFE_METHODS.has(req.method)) return next();

    const pathname = (req.originalUrl || req.path || "").split("?")[0];
    if (!isProtectedApiPath(pathname)) return next();

    if (req.get(REQUEST_HEADER) !== REQUEST_HEADER_VALUE) {
      return sendSameOriginError(res, "missing_request_header");
    }

    const sourceOrigin = getRequestSourceOrigin(req);
    if (!sourceOrigin || !allowedOrigins.has(sourceOrigin)) {
      return sendSameOriginError(res, "untrusted_origin");
    }

    return next();
  };
}

module.exports = {
  REQUEST_HEADER,
  REQUEST_HEADER_VALUE,
  getAllowedAppOrigins,
  isProtectedApiPath,
  sameOriginMutationGuard,
};
