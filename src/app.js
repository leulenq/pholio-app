const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const KnexSessionStore = require("connect-session-knex")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;
const config = require("./config");
const knex = require("./shared/db/knex");
const { attachLocals } = require("./shared/middleware/context");
const {
  initializeFirebaseAdmin,
} = require("./domains/auth/services/firebase-admin");
const { errorHandler } = require("./shared/middleware/error-handler");
const {
  sameOriginMutationGuard,
} = require("./shared/middleware/same-origin-mutation");
const {
  createTalentAiWriterRateLimit,
} = require("./shared/middleware/ai-writer-rate-limit");
const cookieParser = require("cookie-parser");
const { baseCookieOptions } = require("./shared/lib/cookie-domain");
const devAutoAuth = require("./shared/middleware/dev-auto-auth");
const {
  requireActiveAccount,
  requireTalentDashboardEligibility,
} = require("./domains/auth/middleware/require-auth");

// +++ 1. ADD THIS LINE +++
const ejs = require("ejs");
const ejsLayouts = require("express-ejs-layouts");

const authRoutes = require("./domains/auth/routes/auth");
const instagramAuthRoutes = require("./domains/auth/routes/instagram-auth");
// Casting-call onboarding API (source of truth for server routes under /onboarding/* and /casting/*).
// TODO(deprecation): `domains/onboarding/routes/apply-essentials.js` (EJS /apply/essentials) is not
// mounted here; the React SPA at /onboarding plus `domains/onboarding/routes/casting.js` are the
// supported flow. Remount only if product revives the wizard.
const onboardingRoutes = require("./domains/onboarding/routes/casting");
const dashboardTalentRoutes = require("./domains/talent/routes/index");
const pdfRoutes = require("./domains/pdf/routes/pdf");
const agencyDomainRoutes = require("./domains/agency/routes/index");
const proRoutes = require("./routes/pro");
const stripeRoutes = require("./routes/stripe");
const chatRoutes = require("./routes/chat");
const scoutRoutes = require("./routes/scout");
const apiRoutes = require("./routes/api");
const publicRoutes = require("./routes/api/public");
const portfolioRoutes = require("./routes/portfolio");
const moderationRoutes = require("./domains/moderation/routes/reports");
const guardianConsentRoutes = require("./domains/talent/routes/guardian-consent");
const internalAgencyRequestRoutes = require("./domains/internal/routes/agency-requests");

const app = express();

const cors = require("cors");

// Determine allowed origins based on environment
const allowedOrigins = [
  "http://localhost:5173", // Vite dev server (React SPA)
  "http://localhost:3001", // Next.js dev server (Landing page)
  "http://localhost:3002", // Next.js dev fallback
];

// Add production origins if in production
if (process.env.NODE_ENV === "production") {
  allowedOrigins.push(
    "https://www.pholio.studio", // Marketing site (Next.js)
    "https://app.pholio.studio", // App site (this server)
  );
}

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

// Handle unhandled promise rejections gracefully (especially for session and database errors)
// This prevents crashes from connection errors in serverless environments
process.on("unhandledRejection", (reason, promise) => {
  // Check if it's a session or database connection error (expected in serverless)
  if (reason && typeof reason === "object" && reason.message) {
    // Matched case-insensitively: knex raises "Knex: Timeout acquiring a
    // connection" with a capital T, which a lowercase "timeout" test misses.
    const message = String(reason.message);
    const lowered = message.toLowerCase();

    // Pool-acquire timeouts are checked FIRST and reported separately, because
    // they are the one "timeout" that is never routine. A dropped socket means
    // the platform recycled a connection under us; a KnexTimeoutError means
    // every connection in the pool was already checked out for the whole
    // acquire window - i.e. we are out of capacity or leaking connections
    // (a missing .transacting(trx), a query that never resolves, too many
    // concurrent lambdas for the configured pool). Folding this into the
    // "expected in serverless" bucket is what let real pool exhaustion sit
    // unnoticed in production behind a reassuring log line, so it gets its own
    // loud, greppable prefix instead.
    const isPoolExhaustion =
      reason.name === "KnexTimeoutError" ||
      lowered.includes("timeout acquiring a connection") ||
      lowered.includes("pool is probably full");

    if (isPoolExhaustion) {
      // Still don't crash - killing the container makes the capacity problem
      // worse for every in-flight request. But this is a bug to fix, not noise.
      console.error(
        "[Unhandled Rejection][DB POOL EXHAUSTION] Knex could not acquire a connection before the pool's acquire timeout. " +
          "This is NOT expected serverless behaviour - the connection pool is saturated or connections are being leaked " +
          "(missing .transacting(trx), unreleased connection, or too much concurrency for the configured pool size). " +
          "Requests are failing with 500s while this fires:",
        message.substring(0, 300),
      );
      return;
    }

    // Genuinely transient serverless conditions: the database or the platform
    // closed a connection out from under an in-flight query. Nothing is broken
    // on our side and the next request opens a fresh connection, so these are
    // logged and swallowed. "expired" and "timeout" are deliberately no longer
    // matched bare - unqualified they also caught pool exhaustion above, so
    // "expired" is now scoped to session/token/connection expiry noise and
    // timeouts are scoped to connect-level (socket) timeouts only.
    const isConnectionError =
      lowered.includes("connection terminated") ||
      (lowered.includes("connection") && lowered.includes("unexpectedly")) ||
      message.includes('select "sess" from "sessions"') ||
      message.includes('delete from "sessions"') ||
      (lowered.includes("expired") &&
        (lowered.includes("session") ||
          lowered.includes("token") ||
          lowered.includes("connection"))) ||
      lowered.includes("connection timeout") ||
      lowered.includes("connect timeout") ||
      reason.code === "ETIMEDOUT" ||
      reason.code === "ECONNRESET" ||
      reason.code === "EPIPE";

    if (isConnectionError) {
      // Log connection errors but don't crash (non-critical in serverless)
      // These are expected when database connections are terminated
      console.error(
        "[Unhandled Rejection] Database connection error (expected in serverless):",
        reason.message.substring(0, 150),
      );
      return; // Don't crash - this is expected behavior in serverless
    }
  }

  // For other unhandled rejections, log them but don't crash
  console.error("[Unhandled Rejection]", reason);
});

// Only create uploads directory if not in serverless environment
// In serverless, we use /tmp which is already available
if (!config.isServerless) {
  try {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") {
      console.warn(
        `Warning: Could not create upload directory: ${err.message}`,
      );
    }
  }
}

// Trust proxy settings for serverless environments (Netlify Functions)
// In serverless, we need to trust all proxies to correctly parse client IP from headers
// Setting to true trusts all proxies (safe in serverless where proxy chain is controlled)
app.set("trust proxy", true);

// +++ 2. SET UP THE NEW LAYOUT ENGINE +++
app.use(ejsLayouts);
// Register explicitly so Netlify's esbuild bundle resolves ejs (dynamic require in express/lib/view.js fails otherwise).
app.engine("ejs", ejs.__express);
app.set("view engine", "ejs");
// In serverless (Lambda), __dirname is the bundle root (/var/task) and included_files
// puts views/ directly there. In local dev, __dirname is src/ so we go up one level.
const appRoot = config.isServerless
  ? process.env.LAMBDA_TASK_ROOT || __dirname
  : path.join(__dirname, "..");
app.set("views", path.join(appRoot, "views"));
app.set("layout", "layout"); // Default to public layout (dashboard routes explicitly use 'layouts/dashboard')
// Disable EJS cache in development to see template changes immediately
if (process.env.NODE_ENV !== "production") {
  app.set("view cache", false);
}

// CRITICAL: Middleware to ensure req.ip is ALWAYS set BEFORE any rate limiters
// This MUST be the first middleware after trust proxy to prevent "undefined IP" errors
// In serverless (Netlify Functions), req.ip might be undefined even with trust proxy
app.use((req, res, next) => {
  // Netlify's own single-value client IP header is the most trustworthy source
  // here and cannot be spoofed by a client-supplied x-forwarded-for entry, so
  // prefer it before falling back to the proxy chain.
  let ip = req.headers["x-nf-client-connection-ip"];

  // Express computes req.ip from the connection via trust proxy. Under
  // serverless-http there is no real socket, so it is usually undefined — but
  // use it when present.
  if (!ip) {
    ip = req.ip;
  }

  // If still unset, take the client entry from the proxy chain.
  if (!ip || ip === undefined || ip === null || ip === "") {
    // Netlify Functions provide x-forwarded-for header with client IP
    const forwardedFor = req.headers["x-forwarded-for"];
    if (forwardedFor) {
      // x-forwarded-for format: "client-ip, proxy1-ip, proxy2-ip"
      // Take the first IP (client IP)
      ip = forwardedFor.split(",")[0]?.trim();
    }
  }

  // Fallback to other headers if still no IP
  if (!ip || ip === undefined || ip === null || ip === "") {
    ip =
      req.headers["x-real-ip"] ||
      req.headers["cf-connecting-ip"] ||
      req.headers["x-client-ip"] ||
      null;
  }

  // Clean up IP if we have one (remove IPv6 prefix, port, brackets, etc.)
  if (ip && typeof ip === "string") {
    // Remove brackets if present (e.g., "[2001:db8::1]" -> "2001:db8::1")
    ip = ip.replace(/^\[|\]$/g, "");
    // Remove IPv6 prefix if present (e.g., "::ffff:192.168.1.1" -> "192.168.1.1")
    ip = ip.replace(/^::ffff:/, "");
    // Remove port if present (e.g., "192.168.1.1:8080" -> "192.168.1.1")
    const parts = ip.split(":");
    if (parts.length === 2 && !ip.includes("::")) {
      // IPv4 with port: "192.168.1.1:8080"
      const port = parts[1];
      if (/^\d+$/.test(port) && parseInt(port) < 65536) {
        ip = parts[0];
      }
    } else if (parts.length > 2) {
      // IPv6: check if last segment is a port
      const lastPart = parts[parts.length - 1];
      if (
        /^\d+$/.test(lastPart) &&
        parseInt(lastPart) < 65536 &&
        parseInt(lastPart) > 0
      ) {
        // Last segment is a port, remove it
        ip = parts.slice(0, -1).join(":");
      }
    }
  }

  // `req.ip` is a GETTER on the Express request prototype with no setter, so
  // `req.ip = ...` silently does nothing. The resolved address therefore has to
  // live on our own property. Reading req.ip here would also re-enter the
  // getter, which runs proxyaddr() against the connection object synthesized
  // below and yields undefined — that is exactly how every unauthenticated
  // request ended up keyed "127.0.0.1", putting all logins into ONE shared
  // 15-per-minute bucket.
  const resolvedIp =
    ip && typeof ip === "string" && ip !== "" ? ip : "127.0.0.1";
  req.clientIp = resolvedIp;

  // Some libraries read these directly. Seed them from the resolved value, not
  // from req.ip.
  if (!req.connection) {
    req.connection = {};
  }
  if (!req.connection.remoteAddress) {
    req.connection.remoteAddress = resolvedIp;
  }

  if (!req.socket) {
    req.socket = {};
  }
  if (!req.socket.remoteAddress) {
    req.socket.remoteAddress = resolvedIp;
  }

  next();
});

// Custom key generator for rate limiting that works in serverless environments
// This ensures we always return a valid key for rate limiting
function rateLimitKeyGenerator(req) {
  // Authenticated requests: key on the stable user identity so a signed-in
  // user shares one bucket across requests.
  if (req.session && req.session.userId) {
    return `user:${req.session.userId}`;
  }

  // Unauthenticated requests: key on client IP. We deliberately do NOT key on
  // req.sessionID here — with saveUninitialized:false, express-session mints a
  // fresh sessionID for every cookieless request, so a scripted client that
  // drops cookies would get a unique bucket per request and bypass the limiter
  // entirely (audit finding H1). ipKeyGenerator is the IPv6-safe helper.
  // req.clientIp is set by the IP-resolution middleware above. It must come
  // first: req.ip is a getter that returns undefined under serverless-http, and
  // relying on it collapsed every anonymous caller into a single "127.0.0.1"
  // bucket — one shared 15-per-minute allowance for all logins platform-wide.
  const ip =
    req.clientIp ||
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    "127.0.0.1";
  return ipKeyGenerator(ip);
}

// --- 3. COMMENT OUT YOUR OLD MIDDLEWARE ---
/*
app.use((req, res, next) => {
  const originalRender = res.render.bind(res);
  res.render = (view, options = {}, callback) => {
    const layout = options.layout === undefined ? 'layout' : options.layout;
    const renderOptions = { ...res.locals, ...options };
    const done = callback || ((err, html) => (err ? next(err) : res.send(html)));

    req.app.render(view, renderOptions, (err, html) => {
      if (err) return done(err);
      if (!layout) return done(null, html);
      return req.app.render(layout, { ...renderOptions, body: html }, done);
    });
  };
  res.renderWithLayout = originalRender;
  next();
});
*/
// --- END OF COMMENTED-OUT BLOCK ---

// Baseline CSP, built on helmet's defaults (object-src 'none', base-uri 'self',
// font-src/style-src already allow https:/'unsafe-inline', which covers Google
// Fonts and the app's existing inline <style>/style= usage).
// Shipped in REPORT-ONLY mode: this app mixes an EJS-rendered shell (inline
// Firebase init <script>) with a React SPA, and there is no nonce/hash
// infrastructure today, so we can't safely verify a fully-enforced policy
// without a browser pass. Report-Only makes the policy active/observable via
// the Content-Security-Policy-Report-Only header with zero risk of breaking
// auth, uploads, or PDF rendering; flip `reportOnly` to false once violation
// reports come back clean.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      reportOnly: true,
      directives: {
        // Inline <script type="module"> Firebase bootstrap in views/layout.ejs
        // has no nonce yet, so 'unsafe-inline' is required for now.
        scriptSrc: ["'self'", "'unsafe-inline'", "https://www.gstatic.com"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.googleusercontent.com", // Google/Firebase auth avatars
          "https://*.firebasestorage.app",
          "https://*.appspot.com",
          "https://media.pholio.studio", // R2 custom domain (serves talent media)
          "https://*.r2.dev", // Cloudflare R2 public dev URL (legacy uploads)
          "https://*.r2.cloudflarestorage.com",
        ],
        connectSrc: [
          "'self'",
          "https://*.googleapis.com", // Firebase Auth/Firestore REST + Google Fonts CSS
          "https://*.firebaseio.com",
          "https://www.gstatic.com",
          "https://media.pholio.studio", // R2 custom domain (crop reads pixels via fetch/canvas)
          "https://*.r2.dev",
          "https://*.r2.cloudflarestorage.com",
        ],
        frameSrc: ["'self'", "https://*.firebaseapp.com"],
      },
    },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  }),
);
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Stripe webhook route must be registered BEFORE express.json() middleware
// because it needs raw body for signature verification
// Import the webhook handler directly
const stripeWebhookHandler = require("./routes/stripe-webhook");
app.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler,
);

app.use(express.json());

// Configure session store with serverless-friendly settings
const sessionStoreConfig = {
  knex,
  tablename: "sessions",
  // Test suites own their schema lifecycle. Disabling the store's background
  // create avoids racing migrations and teardown on short-lived SQLite files.
  createtable: process.env.NODE_ENV !== "test",
  // connect-session-knex@3 uses this boolean; `cleanupInterval = 0` is not a
  // supported option and leaves the cleanup timer running.
  disableDbCleanup: config.isServerless || process.env.NODE_ENV === "test",
};

if (sessionStoreConfig.disableDbCleanup) {
  console.log(
    "[Session Store] Automatic cleanup disabled for this ephemeral runtime",
  );
}

const sessionStore = new KnexSessionStore(sessionStoreConfig);

// Add error handler for session store events (safety net)
// This catches any errors during session operations, including cleanup if it runs
sessionStore.on("error", (error) => {
  // Log session store errors but don't crash
  // Connection errors are expected in serverless environments when functions end
  if (error && error.message) {
    const isConnectionError =
      error.message.includes("Connection terminated") ||
      (error.message.includes("connection") &&
        error.message.includes("unexpectedly")) ||
      error.message.includes("timeout") ||
      error.code === "ECONNRESET" ||
      error.code === "EPIPE" ||
      error.message.includes('select "sess" from "sessions"') ||
      error.message.includes('delete from "sessions"') ||
      error.message.includes("expired");

    if (isConnectionError) {
      // These are expected in serverless - connections can terminate unexpectedly
      // Log but don't throw - connection errors are non-critical for session operations
      console.error(
        "[Session Store] Connection error (expected in serverless, ignored):",
        error.message.substring(0, 100),
      );
    } else {
      // Other errors should be logged but not cause crashes
      console.error("[Session Store] Error:", error.message.substring(0, 200));
    }
  } else {
    console.error("[Session Store] Unknown error:", error);
  }
});

// Apply session middleware with error handling wrapper
// Wrap the session middleware to catch database connection errors gracefully
const sessionMiddleware = session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    // Shared scope helper: marketing (www) and app subdomains in production;
    // localhost in development so :3001 / :5173 / :3000 share the cookie.
    // Logout clears with the same attributes via clearCookieOptions().
    ...baseCookieOptions(),
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
  // Custom error handler for session store operations
  // This prevents session store errors from crashing the app
  genid: (req) => {
    // Use a fallback if database ID generation fails
    try {
      return require("uuid").v4();
    } catch (err) {
      // Fallback to simple ID if uuid fails
      return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }
  },
});

function isSessionConnectionError(err) {
  return Boolean(
    err &&
      err.message &&
      (err.message.includes("Connection terminated") ||
        (err.message.includes("connection") &&
          err.message.includes("unexpectedly")) ||
        err.message.includes("timeout") ||
        err.message.includes('select "sess" from "sessions"') ||
        err.code === "ECONNRESET" ||
        err.code === "EPIPE"),
  );
}

function runSessionMiddleware(req, res) {
  return new Promise((resolve, reject) => {
    sessionMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

// A serverless DB blip (e.g. a pooled/serverless Postgres connection that
// went idle — Neon suspending after inactivity is a known case — and needs a
// beat to reconnect) shouldn't cost a signed-in user their session for one
// unlucky request. Retry the whole session read before deciding what to do.
const SESSION_RETRY_DELAYS_MS = [250, 750];

// Wrap session middleware with error handling for connection failures
app.use(async (req, res, next) => {
  let lastErr = null;
  for (let attempt = 0; attempt <= SESSION_RETRY_DELAYS_MS.length; attempt++) {
    try {
      await runSessionMiddleware(req, res);
      return next();
    } catch (err) {
      lastErr = err;
      if (!isSessionConnectionError(err)) {
        // Not a connection-shaped error — pass through immediately, no retry.
        return next(err);
      }
      console.error(
        "[Session] Connection error reading session store:",
        err.message.substring(0, 150),
        { attempt: attempt + 1 },
      );
      if (attempt < SESSION_RETRY_DELAYS_MS.length) {
        await new Promise((resolve) =>
          setTimeout(resolve, SESSION_RETRY_DELAYS_MS[attempt]),
        );
      }
    }
  }

  // Exhausted retries on a connection-shaped error.
  // A request with NO session cookie has nothing to lose — continuing
  // anonymously is safe and matches the prior behavior.
  const hadSessionCookie = Boolean(
    req.headers.cookie && req.headers.cookie.includes("connect.sid="),
  );
  if (!hadSessionCookie) {
    req.session = req.session || {};
    req.session.cookie = req.session.cookie || { maxAge: null };
    return next();
  }

  // A request that DID present a session cookie is a different story: we
  // still cannot read the store, so we cannot tell whether this is a
  // signed-in user or not. Silently swapping in a blank/anonymous session
  // here is indistinguishable from "you got logged out" to every downstream
  // requireAuth/requireRole check. Fail with a retryable error instead of
  // guessing; the client already treats a non-401 error as retryable rather
  // than bouncing to /login.
  console.warn(
    "[Session] Connection error with a session cookie present, all retries exhausted — refusing to silently treat as signed-out:",
    { path: req.originalUrl || req.path },
  );
  res.set("Retry-After", "2");
  const acceptsHtml = (req.headers.accept || "").includes("text/html");
  if (acceptsHtml) {
    return res
      .status(503)
      .send("Temporarily unavailable — please refresh in a moment.");
  }
  return res.status(503).json({
    error: "Service temporarily unavailable",
    message: "Please try again in a moment.",
    retryable: true,
  });
});

// Initialize Firebase Admin SDK
initializeFirebaseAdmin();

// Dev auto-auth middleware (must come after session and before routes)
if (process.env.AUTH_PASSTHROUGH_ENABLED === "1") {
  app.use(devAutoAuth);
}

app.use(attachLocals);

// Rate limiters: always enabled. Serverless uses higher per-instance limits because
// the in-memory store is shared across users on the same Lambda instance.
const rateLimitMax = {
  auth: config.isServerless ? 15 : 10,
  // Onboarding is an interactive multi-step flow, not a credential endpoint:
  // one person walking through it normally issues far more than 15 requests a
  // minute, so sharing the auth ceiling 429'd real users mid-signup. Still
  // capped, just at a ceiling a human cannot reach by filling in forms.
  onboarding: config.isServerless ? 60 : 30,
  upload: config.isServerless ? 60 : 20,
  message: config.isServerless ? 30 : 15,
  report: config.isServerless ? 20 : 10,
  aiWriter: config.isServerless ? 20 : 10,
};

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: rateLimitMax.auth,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKeyGenerator,
  validate: { ip: false },
});

const onboardingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: rateLimitMax.onboarding,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKeyGenerator,
  validate: { ip: false },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: rateLimitMax.upload,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKeyGenerator,
  validate: { ip: false },
});

const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: rateLimitMax.message,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKeyGenerator,
  validate: { ip: false },
});

const reportsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: rateLimitMax.report,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKeyGenerator,
  validate: { ip: false },
});

const talentAiWriterLimiter = createTalentAiWriterRateLimit({
  max: rateLimitMax.aiWriter,
});

// NOTE: `/api/login` and `/api/logout` are separate aliases of the same route
// handlers (see domains/auth/routes/auth.js) and do NOT match the "/login" /
// "/logout" mount prefixes — they must be listed explicitly or the marketing
// site's session endpoints go unthrottled.
app.use(
  [
    "/login",
    "/signup",
    "/api/login",
    "/api/logout",
    "/api/auth/password-reset",
    "/api/dev/login",
    "/api/dev/bootstrap",
  ],
  authLimiter,
);
app.use(["/onboarding/entry", "/casting/entry"], onboardingLimiter);
app.use("/api/public/open-call", authLimiter);
app.use("/api/public/agency-access-requests", authLimiter);
app.use("/upload", uploadLimiter);
app.use("/api/talent/media", uploadLimiter);
app.use(["/onboarding/scout", "/casting/scout"], uploadLimiter);
app.use(talentAiWriterLimiter);
app.use((req, res, next) => {
  if (req.method !== "POST") return next();
  const path = (req.originalUrl || req.path || "").split("?")[0];
  const isAgencyMessage = /^\/api\/agency\/applications\/[^/]+\/messages$/.test(
    path,
  );
  const isTalentMessage = /^\/api\/talent\/applications\/[^/]+\/messages$/.test(
    path,
  );
  if (isAgencyMessage || isTalentMessage) {
    return messageLimiter(req, res, next);
  }
  return next();
});
app.use((req, res, next) => {
  if (req.method !== "POST") return next();
  const path = (req.originalUrl || req.path || "").split("?")[0];
  if (path === "/api/reports") {
    return reportsLimiter(req, res, next);
  }
  return next();
});

// Authenticated dashboard APIs return account-scoped data and must never be
// stored by browser/shared caches. Scoped to the authenticated API mounts
// only — public/static asset routes are untouched.
app.use(["/api/talent", "/api/agency", "/api/internal"], (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});

// Cookie-authenticated dashboard writes and token-authenticated reply writes
// must come from the Pholio app. The required custom header forces a CORS
// preflight for cross-site JavaScript; Origin/Referer validation also blocks
// forged form submissions that can carry the shared session cookie.
app.use(
  sameOriginMutationGuard({
    enabled: config.csrfProtectionEnabled,
  }),
);

// Migration endpoint (protected by secret token)
// Call this once after deployment to set up database tables
app.post("/api/migrate", async (req, res) => {
  try {
    // Check for migration secret (required for security)
    const migrationSecret = process.env.MIGRATION_SECRET;

    // Fail closed: an unset/empty MIGRATION_SECRET must refuse the request,
    // never run migrations over an unauthenticated HTTP endpoint.
    if (!migrationSecret) {
      return res.status(404).end();
    }

    const providedSecret =
      req.query.secret || req.headers["x-migration-secret"];

    if (providedSecret !== migrationSecret) {
      return res.status(401).json({
        error: "Unauthorized",
        message:
          "Invalid migration secret. Set MIGRATION_SECRET in environment variables and provide it as ?secret=... or X-Migration-Secret header.",
      });
    }

    console.log("[Migration] Starting database migrations...");

    // Run migrations
    const [batchNo, log] = await knex.migrate.latest();

    console.log("[Migration] Migrations completed:", {
      batchNo,
      migrationsRun: log.length,
      log: log,
    });

    // Get migration status
    const currentVersion = await knex.migrate.currentVersion();
    const status = await knex.migrate.status();

    return res.json({
      success: true,
      message: "Migrations completed successfully",
      batchNo,
      migrationsRun: log.length,
      currentVersion,
      status: status === 0 ? "up to date" : `${status} migrations pending`,
      log: log,
    });
  } catch (error) {
    console.error("[Migration] Error running migrations:", {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: "Migration failed",
      message: error.message,
      code: error.code,
      details: process.env.NODE_ENV !== "production" ? error.stack : undefined,
    });
  }
});

// Migration status endpoint (same fail-closed secret gate as POST /api/migrate
// — this exposes migration/schema internals and must not be public).
app.get("/api/migrate/status", async (req, res) => {
  try {
    const migrationSecret = process.env.MIGRATION_SECRET;

    if (!migrationSecret) {
      return res.status(404).end();
    }

    const providedSecret =
      req.query.secret || req.headers["x-migration-secret"];

    if (providedSecret !== migrationSecret) {
      return res.status(401).json({
        error: "Unauthorized",
        message:
          "Invalid migration secret. Set MIGRATION_SECRET in environment variables and provide it as ?secret=... or X-Migration-Secret header.",
      });
    }

    const currentVersion = await knex.migrate.currentVersion();
    const status = await knex.migrate.status();
    const list = await knex.migrate.list();

    return res.json({
      currentVersion,
      status:
        status === 0
          ? "up to date"
          : `${Math.abs(status)} migrations ${status > 0 ? "pending" : "ahead"}`,
      pending: status,
      list: list,
    });
  } catch (error) {
    console.error("[Migration Status] Error:", error.message);
    return res.status(500).json({
      error: "Failed to get migration status",
      message: error.message,
      code: error.code,
    });
  }
});

// Authentication routes (early for session establishment)
app.use(instagramAuthRoutes);
app.use("/", authRoutes);

// Magic-link message replies (token auth, no login required)
app.use("/", require("./domains/messaging/routes/message-reply"));

// High-frequency API routes (chat/scout - used in onboarding flow)
// These are moved higher to reduce middleware processing overhead
app.use("/", chatRoutes);
app.use("/", scoutRoutes);

// API Routes
app.use("/", internalAgencyRequestRoutes);
app.use("/api", apiRoutes);
app.use("/api/public", publicRoutes);
app.use("/api", moderationRoutes);
// Guardian consent (token-verified). Mounted before onboarding-gated routes so the
// public guardian-facing surfaces (page + verify) are reachable without a session.
app.use("/", guardianConsentRoutes);
// Casting onboarding API must run before requireActiveAccount so stale/deleted
// sessions do not block new Google/email sign-up at POST /onboarding/entry.
app.use("/", onboardingRoutes);
app.use("/", requireActiveAccount(), agencyDomainRoutes); // Agency domain routes (inbox, overview, roster)

// Application/onboarding routes mounted above (casting API)

// Onboarding redirect middleware (applied to dashboard routes)
const {
  requireOnboardingComplete,
} = require("./shared/middleware/onboarding-redirect");

// Public portfolio (EJS) — mount before onboarding-gated talent shell
app.use("/", portfolioRoutes);

// Dashboard routes (protected by onboarding middleware).
// requireProfileUnlocked is not applied here: it only redirects HTML and would block
// /api/talent/* needed to complete essentials; comp card / PDF locking stays per-route in domain routers.
app.use(
  "/",
  requireOnboardingComplete,
  requireActiveAccount(),
  requireTalentDashboardEligibility(),
  dashboardTalentRoutes,
);
// Agency dashboard routes handled by agencyDomainRoutes above

// PDF generation routes (public viewing routes don't need unlock check)
// Locking is handled per-route for customization endpoints that already have requireRole('TALENT')
app.use("/", pdfRoutes);

// File upload routes

// Pro routes
app.use("/", proRoutes);

// Payment routes (Stripe)
app.use("/stripe", stripeRoutes);

// Static file serving - AFTER routes so routes take precedence over static HTML files
// Disable caching for CSS/JS in development
const staticOptions =
  process.env.NODE_ENV === "production"
    ? {}
    : {
        etag: false,
        lastModified: false,
        setHeaders: (res, path) => {
          if (path.endsWith(".css") || path.endsWith(".js")) {
            res.set(
              "Cache-Control",
              "no-cache, no-store, must-revalidate, max-age=0",
            );
            res.set("Pragma", "no-cache");
            res.set("Expires", "0");
            res.set("X-Content-Type-Options", "nosniff");
          }
        },
      };
app.use(express.static(path.join(appRoot, "public"), staticOptions));

// Only serve uploads directory if not in serverless environment
// In serverless, uploads should be served via CDN or cloud storage
// Netlify will serve static files from the public directory automatically
if (
  !config.isServerless &&
  (config.nodeEnv !== "production" || process.env.SERVE_UPLOADS === "true")
) {
  // Use config.uploadsDir to match where files are actually stored
  // This ensures consistency between where files are saved and where they're served
  app.use("/uploads", express.static(config.uploadsDir));
} else {
  // In serverless, files in /tmp are temporary and not accessible via HTTP
  // For production, configure cloud storage (S3, Netlify Blob, etc.)
  // and update image paths in the database to use cloud storage URLs
  app.use("/uploads", (req, res) => {
    res.status(404).json({
      error: "File not found",
      message:
        "Uploads are not available in serverless environment. Cloud storage integration required for file persistence.",
    });
  });
}

// Serve React SPA only for specific app routes (not all routes)
// This allows the app to be served from a subdomain (app.pholio.studio)
// while marketing pages are served from a separate domain (www.pholio.studio)
app.get(
  [
    "/dashboard",
    "/dashboard/*",
    "/onboarding",
    "/onboarding/*",
    "/reveal",
    "/apply",
    "/login",
    "/reply",
    "/reply/*",
    "/opencall",
    "/opencall/*",
    "/internal",
    "/internal/*",
  ],
  (req, res) => {
    // Development: Redirect to Vite dev server
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.NODE_ENV !== "staging"
    ) {
      return res.redirect("http://localhost:5173" + req.originalUrl);
    }

    // Production: Serve React app
    res.sendFile(path.join(appRoot, "public", "dashboard-app", "index.html"));
  },
);

// Root route handler - Fixes 404 on localhost:3000
app.get("/", (req, res) => {
  // If request accepts HTML (browser), redirect to landing page
  if (req.accepts("html")) {
    if (process.env.NODE_ENV !== "production") {
      return res.redirect("http://localhost:3001"); // Redirect to Next.js Landing Page
    }
    // app.pholio.studio serves the React SPA; marketing lives on www
    return res.redirect("/dashboard/talent");
  }

  // API clients get a status message
  return res.json({
    status: "online",
    service: "Pholio API",
    version: "1.0.0",
  });
});

// Catch-all for unknown routes → 404
app.use((req, res) => {
  // For HTML requests, return 404 page
  if (req.accepts("html")) {
    return res.status(404).send("404 Not Found");
  }
  // For API/JSON requests, return JSON error
  return res.status(404).json({ error: "Not found" });
});

// Use centralized error handler
app.use(errorHandler);

module.exports = app;
