const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;

const TALENT_AI_WRITER_POST_PATHS = new Set([
  "/api/talent/submission-note/draft",
  "/api/talent/submission-note/sharpen",
  "/api/talent/submission-note/shorten",
  "/api/talent/bio/refine",
  "/api/talent/bio/generate",
  "/api/talent/training-summary/format",
  "/api/talent/training-summary/summarize",
  "/api/talent/training-summary/expand",
  "/api/talent/message-polish/polish",
]);

function requestPath(req) {
  return String(req.originalUrl || req.path || "").split("?")[0];
}

function isTalentAiWriterPost(req) {
  return (
    String(req.method || "").toUpperCase() === "POST" &&
    TALENT_AI_WRITER_POST_PATHS.has(requestPath(req))
  );
}

function talentAiWriterKeyGenerator(req) {
  // Prefer the account identity so opening a new session cannot reset a paid
  // account's AI quota. Session and IP are fail-safe fallbacks for requests
  // that reach the limiter before authentication has completed.
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

function createTalentAiWriterRateLimit(options = {}) {
  const limiter = rateLimit({
    windowMs: options.windowMs || 60 * 1000,
    max: options.max || 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: talentAiWriterKeyGenerator,
    validate: { ip: false },
    handler: (_req, res) =>
      res.status(429).json({
        error: "AI_WRITER_RATE_LIMITED",
        message:
          "Too many AI writing requests. Please wait a minute and try again.",
      }),
  });

  return (req, res, next) => {
    if (!isTalentAiWriterPost(req)) {
      return next();
    }
    return limiter(req, res, next);
  };
}

module.exports = {
  TALENT_AI_WRITER_POST_PATHS,
  createTalentAiWriterRateLimit,
  isTalentAiWriterPost,
  talentAiWriterKeyGenerator,
};
