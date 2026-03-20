const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const KnexSessionStore = require('connect-session-knex')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const knex = require('./db/knex');
const { attachLocals } = require('./middleware/context');
const { initializeFirebaseAdmin } = require('./lib/firebase-admin');
const { errorHandler } = require('./middleware/error-handler');
const cookieParser = require('cookie-parser');

// +++ 1. ADD THIS LINE +++
const ejsLayouts = require('express-ejs-layouts');

const authRoutes = require('./routes/auth');
const onboardingRoutes = require('./routes/onboarding'); // Phase 2: Onboarding API
const dashboardTalentRoutes = require('./routes/talent/index');
const pdfRoutes = require('./routes/pdf');
const agencyRoutes = require('./routes/agency');
const agencyApiRoutes = require('./routes/api/agency');
const agencyOverviewRoutes = require('./routes/api/agency-overview')
const proRoutes = require('./routes/pro');
const stripeRoutes = require('./routes/stripe');
const chatRoutes = require('./routes/chat');
const scoutRoutes = require('./routes/scout');
const apiRoutes = require('./routes/api');
const publicRoutes = require('./routes/api/public');


const app = express();

const cors = require('cors');

// Determine allowed origins based on environment
const allowedOrigins = [
  'http://localhost:5173',  // Vite dev server (React SPA)
  'http://localhost:3001',  // Next.js dev server (Landing page)
  'http://localhost:3002',  // Next.js dev fallback
];

// Add production origins if in production
if (process.env.NODE_ENV === 'production') {
  allowedOrigins.push(
    'https://www.pholio.studio',      // Marketing site (Next.js)
    'https://app.pholio.studio'       // App site (this server)
  );
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// Handle unhandled promise rejections gracefully (especially for session and database errors)
// This prevents crashes from connection errors in serverless environments
process.on('unhandledRejection', (reason, promise) => {
  // Check if it's a session or database connection error (expected in serverless)
  if (reason && typeof reason === 'object' && reason.message) {
    const isConnectionError = (
      reason.message.includes('Connection terminated') ||
      reason.message.includes('connection') && reason.message.includes('unexpectedly') ||
      reason.message.includes('select "sess" from "sessions"') ||
      reason.message.includes('delete from "sessions"') ||
      reason.message.includes('expired') ||
      reason.message.includes('timeout') ||
      reason.code === 'ECONNRESET' ||
      reason.code === 'EPIPE'
    );

    if (isConnectionError) {
      // Log connection errors but don't crash (non-critical in serverless)
      // These are expected when database connections are terminated
      console.error('[Unhandled Rejection] Database connection error (expected in serverless):', reason.message.substring(0, 150));
      return; // Don't crash - this is expected behavior in serverless
    }
  }

  // For other unhandled rejections, log them but don't crash
  console.error('[Unhandled Rejection]', reason);
});

// Only create uploads directory if not in serverless environment
// In serverless, we use /tmp which is already available
if (!config.isServerless) {
  try {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.warn(`Warning: Could not create upload directory: ${err.message}`);
    }
  }
}

// Trust proxy settings for serverless environments (Netlify Functions)
// In serverless, we need to trust all proxies to correctly parse client IP from headers
// Setting to true trusts all proxies (safe in serverless where proxy chain is controlled)
app.set('trust proxy', true);

// +++ 2. SET UP THE NEW LAYOUT ENGINE +++
app.use(ejsLayouts);
app.set('view engine', 'ejs');
// In serverless (Lambda), __dirname is the bundle root (/var/task) and included_files
// puts views/ directly there. In local dev, __dirname is src/ so we go up one level.
const appRoot = config.isServerless
  ? (process.env.LAMBDA_TASK_ROOT || __dirname)
  : path.join(__dirname, '..');
app.set('views', path.join(appRoot, 'views'));
app.set('layout', 'layout'); // Default to public layout (dashboard routes explicitly use 'layouts/dashboard')
// Disable EJS cache in development to see template changes immediately
if (process.env.NODE_ENV !== 'production') {
  app.set('view cache', false);
}

// CRITICAL: Middleware to ensure req.ip is ALWAYS set BEFORE any rate limiters
// This MUST be the first middleware after trust proxy to prevent "undefined IP" errors
// In serverless (Netlify Functions), req.ip might be undefined even with trust proxy
app.use((req, res, next) => {
  // Express should set req.ip automatically with trust proxy, but verify it's set
  // In serverless, we need to manually extract IP from headers
  let ip = req.ip;

  // If req.ip is not set or invalid, get it from headers
  if (!ip || ip === undefined || ip === null || ip === '') {
    // Netlify Functions provide x-forwarded-for header with client IP
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      // x-forwarded-for format: "client-ip, proxy1-ip, proxy2-ip"
      // Take the first IP (client IP)
      ip = forwardedFor.split(',')[0]?.trim();
    }
  }

  // Fallback to other headers if still no IP
  if (!ip || ip === undefined || ip === null || ip === '') {
    ip = req.headers['x-real-ip'] ||
      req.headers['cf-connecting-ip'] ||
      req.headers['x-client-ip'] ||
      null;
  }

  // Clean up IP if we have one (remove IPv6 prefix, port, brackets, etc.)
  if (ip && typeof ip === 'string') {
    // Remove brackets if present (e.g., "[2001:db8::1]" -> "2001:db8::1")
    ip = ip.replace(/^\[|\]$/g, '');
    // Remove IPv6 prefix if present (e.g., "::ffff:192.168.1.1" -> "192.168.1.1")
    ip = ip.replace(/^::ffff:/, '');
    // Remove port if present (e.g., "192.168.1.1:8080" -> "192.168.1.1")
    const parts = ip.split(':');
    if (parts.length === 2 && !ip.includes('::')) {
      // IPv4 with port: "192.168.1.1:8080"
      const port = parts[1];
      if (/^\d+$/.test(port) && parseInt(port) < 65536) {
        ip = parts[0];
      }
    } else if (parts.length > 2) {
      // IPv6: check if last segment is a port
      const lastPart = parts[parts.length - 1];
      if (/^\d+$/.test(lastPart) && parseInt(lastPart) < 65536 && parseInt(lastPart) > 0) {
        // Last segment is a port, remove it
        ip = parts.slice(0, -1).join(':');
      }
    }
  }

  // CRITICAL: Always set req.ip to a valid string value
  // express-rate-limit requires req.ip to be defined, even if we use a custom keyGenerator
  req.ip = (ip && typeof ip === 'string' && ip !== '') ? ip : '127.0.0.1';

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
  // Use req.ip (which we ensure is set above) as primary identifier
  // This should now always be set thanks to our middleware
  let ip = req.ip;

  // Clean up IP if needed (remove IPv6 prefix, port, etc.)
  if (ip && ip !== '0.0.0.0') {
    // Remove IPv6 prefix if present
    ip = ip.replace(/^::ffff:/, '');
    // Remove port if present
    const parts = ip.split(':');
    if (parts.length > 2) {
      // IPv6 with port
      ip = parts.slice(0, -1).join(':');
    } else if (parts.length === 2 && !ip.includes('::')) {
      // IPv4 with port
      ip = parts[0];
    }
    return ip;
  }

  // Fallback to session ID if available (more reliable in serverless)
  if (req.session && req.sessionID) {
    return `session:${req.sessionID}`;
  }

  // Fallback to user ID if authenticated
  if (req.session && req.session.userId) {
    return `user:${req.session.userId}`;
  }

  // Final fallback: use a combination that's unique enough
  // This should rarely be used since we ensure req.ip is set
  const userAgent = (req.headers['user-agent'] || 'unknown').substring(0, 50);
  const path = req.path || req.url || 'unknown';
  return `fallback:${path}:${userAgent}`;
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

app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Stripe webhook route must be registered BEFORE express.json() middleware
// because it needs raw body for signature verification
// Import the webhook handler directly
const stripeWebhookHandler = require('./routes/stripe-webhook');
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json());

// Configure session store with serverless-friendly settings
const sessionStoreConfig = {
  knex,
  tablename: 'sessions'
};

// In serverless environments, disable automatic cleanup to prevent connection errors
// Automatic cleanup runs on a timer and can execute after connections are closed
// In serverless, functions are short-lived and connections can terminate unexpectedly
if (config.isServerless) {
  // Disable automatic cleanup in serverless to prevent connection errors
  // In connect-session-knex, cleanupInterval defaults to 15 minutes (900000 ms)
  // Setting it to 0 explicitly disables the cleanup interval
  sessionStoreConfig.cleanupInterval = 0; // 0 = disabled (no cleanup)

  console.log('[Session Store] Automatic cleanup disabled for serverless environment (cleanupInterval: 0)');
}

const sessionStore = new KnexSessionStore(sessionStoreConfig);

// Add error handler for session store events (safety net)
// This catches any errors during session operations, including cleanup if it runs
sessionStore.on('error', (error) => {
  // Log session store errors but don't crash
  // Connection errors are expected in serverless environments when functions end
  if (error && error.message) {
    const isConnectionError = (
      error.message.includes('Connection terminated') ||
      error.message.includes('connection') && error.message.includes('unexpectedly') ||
      error.message.includes('timeout') ||
      error.code === 'ECONNRESET' ||
      error.code === 'EPIPE' ||
      error.message.includes('select "sess" from "sessions"') ||
      error.message.includes('delete from "sessions"') ||
      error.message.includes('expired')
    );

    if (isConnectionError) {
      // These are expected in serverless - connections can terminate unexpectedly
      // Log but don't throw - connection errors are non-critical for session operations
      console.error('[Session Store] Connection error (expected in serverless, ignored):', error.message.substring(0, 100));
    } else {
      // Other errors should be logged but not cause crashes
      console.error('[Session Store] Error:', error.message.substring(0, 200));
    }
  } else {
    console.error('[Session Store] Unknown error:', error);
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
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7,
    // Allow cookies across subdomains (www.pholio.studio and app.pholio.studio)
    domain: config.nodeEnv === 'production' ? '.pholio.studio' : undefined
  },
  // Custom error handler for session store operations
  // This prevents session store errors from crashing the app
  genid: (req) => {
    // Use a fallback if database ID generation fails
    try {
      return require('uuid').v4();
    } catch (err) {
      // Fallback to simple ID if uuid fails
      return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }
  }
});

// Wrap session middleware with error handling for connection failures
app.use((req, res, next) => {
  // Execute session middleware, but catch connection errors
  sessionMiddleware(req, res, (err) => {
    // Catch session store errors and handle gracefully
    if (err) {
      // Check if it's a connection error
      if (err.message && (
        err.message.includes('Connection terminated') ||
        (err.message.includes('connection') && err.message.includes('unexpectedly')) ||
        err.message.includes('timeout') ||
        err.message.includes('select "sess" from "sessions"') ||
        err.code === 'ECONNRESET' ||
        err.code === 'EPIPE'
      )) {
        // Connection error - log but continue without session
        console.error('[Session] Connection error (continuing without session):', err.message.substring(0, 150));
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

app.use(attachLocals);

// Rate limiters with custom key generator for serverless compatibility
// Note: req.ip is always set by our middleware above, preventing "undefined IP" errors
// In serverless environments (Netlify Functions), req.ip might be undefined initially
// We provide a custom keyGenerator that always returns a valid key, so we can safely
// disable IP validation to prevent "undefined request.ip" errors
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKeyGenerator,
  validate: { ipAddress: false }
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKeyGenerator,
  validate: { ipAddress: false }
});

app.use(['/login', '/signup'], authLimiter);
app.use('/upload', uploadLimiter);





// Migration endpoint (protected by secret token)
// Call this once after deployment to set up database tables
app.post('/api/migrate', async (req, res) => {
  try {
    // Check for migration secret (required for security)
    const migrationSecret = process.env.MIGRATION_SECRET;
    const providedSecret = req.query.secret || req.headers['x-migration-secret'];

    if (migrationSecret && providedSecret !== migrationSecret) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid migration secret. Set MIGRATION_SECRET in environment variables and provide it as ?secret=... or X-Migration-Secret header.'
      });
    }

    // If no secret is set, warn but allow (for initial setup)
    if (!migrationSecret) {
      console.warn('[Migration] WARNING: MIGRATION_SECRET not set. Migration endpoint is unprotected!');
    }

    console.log('[Migration] Starting database migrations...');

    // Run migrations
    const [batchNo, log] = await knex.migrate.latest();

    console.log('[Migration] Migrations completed:', {
      batchNo,
      migrationsRun: log.length,
      log: log
    });

    // Get migration status
    const currentVersion = await knex.migrate.currentVersion();
    const status = await knex.migrate.status();

    return res.json({
      success: true,
      message: 'Migrations completed successfully',
      batchNo,
      migrationsRun: log.length,
      currentVersion,
      status: status === 0 ? 'up to date' : `${status} migrations pending`,
      log: log
    });
  } catch (error) {
    console.error('[Migration] Error running migrations:', {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Migration failed',
      message: error.message,
      code: error.code,
      details: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Migration status endpoint (read-only, no secret required)
app.get('/api/migrate/status', async (req, res) => {
  try {
    const currentVersion = await knex.migrate.currentVersion();
    const status = await knex.migrate.status();
    const list = await knex.migrate.list();

    return res.json({
      currentVersion,
      status: status === 0 ? 'up to date' : `${Math.abs(status)} migrations ${status > 0 ? 'pending' : 'ahead'}`,
      pending: status,
      list: list
    });
  } catch (error) {
    console.error('[Migration Status] Error:', error.message);
    return res.status(500).json({
      error: 'Failed to get migration status',
      message: error.message,
      code: error.code
    });
  }
});

// Authentication routes (early for session establishment)
app.use('/', authRoutes);

// High-frequency API routes (chat/scout - used in onboarding flow)
// These are moved higher to reduce middleware processing overhead
app.use('/', chatRoutes);
app.use('/', scoutRoutes);

// API Routes
app.use('/api', apiRoutes);
app.use('/api/public', publicRoutes);
app.use('/', agencyApiRoutes); // Agency API routes (includes /api/agency/* endpoints)
app.use('/', agencyOverviewRoutes)


// Application/onboarding routes
app.use('/', onboardingRoutes); // Phase 2: Onboarding API Routes

// Onboarding redirect middleware (applied to dashboard routes)
const { requireOnboardingComplete } = require('./middleware/onboarding-redirect');
const { requireProfileUnlocked } = require('./middleware/require-profile-unlocked');

// Dashboard routes (protected by onboarding middleware)
app.use('/', requireOnboardingComplete, dashboardTalentRoutes);
// Agency dashboard routes now handled by agencyRoutes below

// Public portfolio routes


// PDF generation routes (public viewing routes don't need unlock check)
// Locking is handled per-route for customization endpoints that already have requireRole('TALENT')
app.use('/', pdfRoutes);

// File upload routes


// Agency and Pro routes
app.use('/', agencyRoutes);
app.use('/', proRoutes);

// Payment routes (Stripe)
app.use('/stripe', stripeRoutes);

// Static file serving - AFTER routes so routes take precedence over static HTML files
// Disable caching for CSS/JS in development
const staticOptions = process.env.NODE_ENV === 'production' ? {} : {
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    if (path.endsWith('.css') || path.endsWith('.js')) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('X-Content-Type-Options', 'nosniff');
    }
  }
};
app.use(express.static(path.join(appRoot, 'public'), staticOptions));

// Only serve uploads directory if not in serverless environment
// In serverless, uploads should be served via CDN or cloud storage
// Netlify will serve static files from the public directory automatically
if (!config.isServerless && (config.nodeEnv !== 'production' || process.env.SERVE_UPLOADS === 'true')) {
  // Use config.uploadsDir to match where files are actually stored
  // This ensures consistency between where files are saved and where they're served
  app.use('/uploads', express.static(config.uploadsDir));
} else {
  // In serverless, files in /tmp are temporary and not accessible via HTTP
  // For production, configure cloud storage (S3, Netlify Blob, etc.)
  // and update image paths in the database to use cloud storage URLs
  app.use('/uploads', (req, res) => {
    res.status(404).json({
      error: 'File not found',
      message: 'Uploads are not available in serverless environment. Cloud storage integration required for file persistence.'
    });
  });
}

// Serve React SPA only for specific app routes (not all routes)
// This allows the app to be served from a subdomain (app.pholio.studio)
// while marketing pages are served from a separate domain (www.pholio.studio)
app.get([
  '/dashboard',
  '/dashboard{/*path}',
  '/onboarding',
  '/onboarding{/*path}',
  '/reveal'
], (req, res) => {
  // Development: Redirect to Vite dev server
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging') {
    return res.redirect('http://localhost:5173' + req.originalUrl);
  }

  // Production: Serve React app
  res.sendFile(path.join(appRoot, 'public', 'dashboard-app', 'index.html'));
});

// Root route handler - Fixes 404 on localhost:3000
app.get('/', (req, res) => {
  // If request accepts HTML (browser), redirect to landing page
  if (req.accepts('html')) {
    if (process.env.NODE_ENV !== 'production') {
      return res.redirect('http://localhost:3001'); // Redirect to Next.js Landing Page
    }
    // In production, we might want to redirect to the main site or dashboard
    return res.redirect('https://www.pholio.studio');
  }
  
  // API clients get a status message
  return res.json({ 
    status: 'online', 
    service: 'Pholio API',
    version: '1.0.0' 
  });
});

// Catch-all for unknown routes → 404
app.use((req, res) => {
  // For HTML requests, return 404 page
  if (req.accepts('html')) {
    return res.status(404).send('404 Not Found');
  }
  // For API/JSON requests, return JSON error
  return res.status(404).json({ error: 'Not found' });
});

// Use centralized error handler
app.use(errorHandler);

module.exports = app;

