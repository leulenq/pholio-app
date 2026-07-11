const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;

const DEFAULT_MAX = 20;
const DEFAULT_WINDOW_MS = 60 * 1000;

function envInt(name, fallback) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function discoverRateLimitKeyGenerator(req) {
  // Prefer the account identity so opening a new session cannot reset an
  // agency's Discover quota. Session and IP are fail-safe fallbacks for
  // requests that reach the limiter before authentication has completed.
  if (req.session?.userId) {
    return `user:${req.session.userId}`;
  }
  if (req.sessionID) {
    return `session:${req.sessionID}`;
  }

  const ip =
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    "127.0.0.1";
  return ipKeyGenerator(ip);
}

/**
 * Rate limiter for the agency Discover surface (search + invite). Applied
 * route-level in domains/agency/routes/inbox.js. Defaults to 20 req/min,
 * tunable via DISCOVER_RATE_LIMIT_MAX / DISCOVER_RATE_LIMIT_WINDOW_MS.
 */
function createDiscoverRateLimit(options = {}) {
  return rateLimit({
    windowMs:
      options.windowMs || envInt("DISCOVER_RATE_LIMIT_WINDOW_MS", DEFAULT_WINDOW_MS),
    max: options.max || envInt("DISCOVER_RATE_LIMIT_MAX", DEFAULT_MAX),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: discoverRateLimitKeyGenerator,
    validate: { ip: false },
    handler: (_req, res) =>
      res.status(429).json({
        error: "DISCOVER_RATE_LIMITED",
        message:
          "Too many discovery requests. Please wait a minute and try again.",
      }),
  });
}

module.exports = {
  createDiscoverRateLimit,
  discoverRateLimitKeyGenerator,
};
