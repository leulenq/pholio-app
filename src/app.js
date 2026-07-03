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
  createTalentAiWriterRateLimit,
} = require("./shared/middleware/ai-writer-rate-limit");
const cookieParser = require("cookie-parser");
const devAutoAuth = require("./shared/middleware/dev-auto-auth");
const { requireActiveAccount } = require("./domains/auth/middleware/require-auth");

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
    const isConnectionError =
      reason.message.includes("Connection terminated") ||
      (reason.message.includes("connection") &&
        reason.message.includes("unexpectedly")) ||
      reason.message.includes('select "sess" from "sessions"') ||
      reason.message.includes('delete from "sessions"') ||
      reason.message.includes("expired") ||
      reason.message.includes("timeout") ||
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
  // Express should set req.ip automatically with trust proxy, but verify it's set
  // In serverless, we need to manually extract IP from headers
  let ip = req.ip;

  // If req.ip is not set or invalid, get it from headers
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

  // CRITICAL: Always set req.ip to a valid string value
  // express-rate-limit requires req.ip to be defined, even if we use a custom keyGenerator
  req.ip = ip && typeof ip === "string" && ip !== "" ? ip : "127.0.0.1";

  // Also ensure req.connection.remoteAddress is set (some libraries check this)
  if (!req.connection) {
    req.connection = {};
  }
  if (!req.connection.remoteAddress) {
    req.connection.remoteAddress = req.ip;
  }

  // Ensure req.socket.remoteAddress is set (additional fallback)
  if (!req.socket) {
    req.socket = {};
  }
  if (!req.socket.remoteAddress) {
    req.socket.remoteAddress = req.ip;
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
  const ip =
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
          "https://*.r2.dev", // Cloudflare R2 public uploads bucket
          "https://*.r2.cloudflarestorage.com",
        ],
        connectSrc: [
          "'self'",
          "https://*.googleapis.com", // Firebase Auth/Firestore REST + Google Fonts CSS
          "https://*.firebaseio.com",
          "https://www.gstatic.com",
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
};

// In serverless environments, disable automatic cleanup to prevent connection errors
// Automatic cleanup runs on a timer and can execute after connections are closed
// In serverless, functions are short-lived and connections can terminate unexpectedly
if (config.isServerless) {
  // Disable automatic cleanup in serverless to prevent connection errors
  // In connect-session-knex, cleanupInterval defaults to 15 minutes (900000 ms)
  // Setting it to 0 explicitly disables the cleanup interval
  sessionStoreConfig.cleanupInterval = 0; // 0 = disabled (no cleanup)

  console.log(
    "[Session Store] Automatic cleanup disabled for serverless environment (cleanupInterval: 0)",
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
    httpOnly: true,
    sameSite: "lax",
    secure: config.nodeEnv === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7,
    // Share session across marketing (www) and app subdomains in production;
    // in development, pin to localhost so :3001 / :5173 / :3000 share the cookie.
    domain:
      process.env.COOKIE_DOMAIN ||
      (config.nodeEnv === "production" ? ".pholio.studio" : "localhost"),
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

// Wrap session middleware with error handling for connection failures
app.use((req, res, next) => {
  // Execute session middleware, but catch connection errors
  sessionMiddleware(req, res, (err) => {
    // Catch session store errors and handle gracefully
    if (err) {
      // Check if it's a connection error
      if (
        err.message &&
        (err.message.includes("Connection terminated") ||
          (err.message.includes("connection") &&
            err.message.includes("unexpectedly")) ||
          err.message.includes("timeout") ||
          err.message.includes('select "sess" from "sessions"') ||
          err.code === "ECONNRESET" ||
          err.code === "EPIPE")
      ) {
        // Connection error - log but continue without session
        console.error(
          "[Session] Connection error (continuing without session):",
          err.message.substring(0, 150),
        );
        // Create a minimal session object to prevent errors downstream
        req.session = req.session || {};
        req.session.cookie = req.session.cookie || { maxAge: null };
        return next(); // Continue without crashing
      }
      // Other errors - pass through
      return next(err);
    }
    next();
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

app.use(["/login", "/signup"], authLimiter);
app.use(["/onboarding/entry", "/casting/entry"], authLimiter);
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
app.use(["/api/talent", "/api/agency"], (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});

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
app.use("/", requireOnboardingComplete, requireActiveAccount(), dashboardTalentRoutes);
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
