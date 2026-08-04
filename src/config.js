const path = require("path");
const os = require("os");

const ROOT_DIR = path.join(__dirname, "..");
if (process.env.PHOLIO_SAFE_TEST_RUNNER !== "1") {
  require("dotenv").config({ path: path.join(ROOT_DIR, ".env") });
}

const COMMISSION_RATE = parseFloat(process.env.COMMISSION_RATE || "0.25");
const MAX_UPLOAD_MB = parseFloat(process.env.MAX_UPLOAD_MB || "25");

function readEnv(...keys) {
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
  }
  return undefined;
}

const firebaseProjectId = readEnv(
  "FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_PROJECT_ID",
);
const firebaseStorageBucket =
  readEnv("FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET") ||
  (firebaseProjectId ? `${firebaseProjectId}.appspot.com` : undefined);

// Detect serverless environment (Netlify Functions, AWS Lambda, etc.)
const isServerless = Boolean(
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NETLIFY ||
  process.env.NETLIFY_DEV ||
  process.env.VERCEL ||
  process.env._HANDLER,
);

// In serverless environments, use /tmp for temporary file storage
// Note: Files in /tmp are deleted after function execution, so cloud storage is required for persistence
const rootUploads = process.env.UPLOAD_DIR
  ? path.isAbsolute(process.env.UPLOAD_DIR)
    ? process.env.UPLOAD_DIR
    : path.join(__dirname, "..", "..", process.env.UPLOAD_DIR)
  : isServerless
    ? path.join(os.tmpdir(), "pholio-uploads")
    : path.join(__dirname, "..", "..", "uploads");

const nodeEnv = process.env.NODE_ENV || "development";

function resolveCsrfProtectionEnabled() {
  if (nodeEnv === "production") return true;
  if (process.env.CSRF_ENFORCE === "1") return true;
  if (process.env.CSRF_ENFORCE === "0") return false;
  return nodeEnv !== "test";
}

// Fail closed in production: a missing SESSION_SECRET must crash startup
// rather than silently signing sessions with a hardcoded, publicly-known
// fallback. In dev/test, fall back to a clearly-labeled dev-only secret.
function resolveSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.trim()) return secret;

  if (nodeEnv === "production") {
    throw new Error(
      "SESSION_SECRET is required when NODE_ENV=production. Set it in the environment before starting the server.",
    );
  }

  return "pholio-dev-secret-do-not-use-in-production";
}

// Known-deprecated Groq text models (provider shutdown scheduled). Matching
// only warns at startup — GROQ_TEXT_MODEL remains the rollback lever.
const DEPRECATED_GROQ_TEXT_MODELS = ["llama-3.3-70b-versatile"];
const groqTextModel = process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-120b";
if (DEPRECATED_GROQ_TEXT_MODELS.includes(groqTextModel)) {
  console.warn(
    `[config] Groq text model "${groqTextModel}" is deprecated and scheduled for provider shutdown — move to "openai/gpt-oss-120b" (or unset GROQ_TEXT_MODEL).`,
  );
}

// Stripe webhook signing secrets are `whsec_...`. The endpoint *identifier*
// shown next to it in the dashboard is `we_...`, and pasting that instead is
// silent: constructEvent only throws once a real event arrives, so every
// webhook 400s and no subscription ever activates. Catch it at startup.
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (stripeWebhookSecret && !stripeWebhookSecret.startsWith("whsec_")) {
  console.warn(
    `[config] STRIPE_WEBHOOK_SECRET does not look like a signing secret (expected "whsec_...", got "${stripeWebhookSecret.slice(0, 6)}..."). ` +
      "Every webhook will fail signature verification. Copy the signing secret from Stripe → Developers → Webhooks → your endpoint.",
  );
}

// Discover engine selector. DISCOVER_ENGINE takes precedence when set to a
// recognized value; DISCOVER_HYBRID=true remains a legacy alias for 'hybrid'.
const DISCOVER_ENGINES = ["launch", "hybrid", "browse"];
function resolveDiscoverEngine() {
  const raw = (process.env.DISCOVER_ENGINE || "").trim().toLowerCase();
  if (DISCOVER_ENGINES.includes(raw)) return raw;
  if (
    process.env.DISCOVER_HYBRID === "true" ||
    process.env.DISCOVER_HYBRID === "1"
  ) {
    return "hybrid";
  }
  return "hybrid";
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  nodeEnv,
  csrfProtectionEnabled: resolveCsrfProtectionEnabled(),
  sessionSecret: resolveSessionSecret(),
  dbClient: (process.env.DB_CLIENT || "sqlite3").toLowerCase(),
  databaseUrl: process.env.DATABASE_URL || "sqlite://./dev.sqlite3",
  commissionRate: Number.isFinite(COMMISSION_RATE) ? COMMISSION_RATE : 0.25,
  uploadsDir: rootUploads,
  isServerless,
  maxUploadBytes: Number.isFinite(MAX_UPLOAD_MB)
    ? MAX_UPLOAD_MB * 1024 * 1024
    : 8 * 1024 * 1024,
  // PDF Base URL: Use Netlify environment variables for proper URL resolution
  // DEPLOY_PRIME_URL is available for branch deployments (e.g., branch--site.netlify.app)
  // URL is the main production URL
  // PDF_BASE_URL can be used as a custom override
  // Fall back to localhost for local development
  pdfBaseUrl:
    process.env.DEPLOY_PRIME_URL ||
    process.env.URL ||
    process.env.PDF_BASE_URL ||
    "http://localhost:3000",
  // Firebase configuration
  firebase: {
    // Server-side (Admin SDK)
    projectId: firebaseProjectId,
    privateKey: process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
      : undefined,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    clientId: process.env.FIREBASE_CLIENT_ID,
    // Client-side (Web SDK)
    apiKey: readEnv("FIREBASE_API_KEY", "VITE_FIREBASE_API_KEY"),
    authDomain: readEnv("FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_AUTH_DOMAIN"),
    storageBucket: firebaseStorageBucket,
    messagingSenderId: readEnv(
      "FIREBASE_MESSAGING_SENDER_ID",
      "VITE_FIREBASE_MESSAGING_SENDER_ID",
    ),
    appId: readEnv("FIREBASE_APP_ID", "VITE_FIREBASE_APP_ID"),
    measurementId: readEnv(
      "FIREBASE_MEASUREMENT_ID",
      "VITE_FIREBASE_MEASUREMENT_ID",
    ),
  },
  // Stripe configuration
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: stripeWebhookSecret,
    priceId: process.env.STRIPE_PRICE_ID, // legacy / monthly fallback
    priceIdMonthly: process.env.STRIPE_PRICE_ID_MONTHLY,
    priceIdAnnual: process.env.STRIPE_PRICE_ID_ANNUAL,
    baseUrl:
      process.env.BASE_URL ||
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      "http://localhost:3000",
  },
  // Groq AI configuration
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    // Text/JSON: query understanding, rerank, chat. GROQ_TEXT_MODEL is the
    // rollback lever (deprecated defaults trigger a startup warning below).
    textModel: groqTextModel,
    // Vision: every image-analysis path (Scout, portfolio classification,
    // photo analysis, comp-card front jury) resolves its model from here — do
    // not hardcode a model id at a call site, or GROQ_VISION_MODEL stops being
    // a working rollback lever.
    //
    // meta-llama/llama-4-scout-17b-16e-instruct was decommissioned and now
    // returns model_not_found, which silently disabled every vision feature.
    // qwen/qwen3.6-27b is the vision-capable model on this Groq account. It
    // supports response_format json_object but NOT json_schema — callers must
    // use json_object and validate the shape themselves.
    visionModel: process.env.GROQ_VISION_MODEL || "qwen/qwen3.6-27b",
    // qwen3.6 is a REASONING model: left at default effort it spends the whole
    // max_completion_tokens budget thinking and returns an empty completion,
    // which Groq rejects as "Failed to validate JSON". "none" suppresses the
    // reasoning pass and yields the JSON directly. Set to "default" (or any
    // level) only if GROQ_VISION_MODEL is swapped for a non-reasoning model.
    visionReasoningEffort: process.env.GROQ_VISION_REASONING_EFFORT || "none",
  },
  // OpenAI — Discover semantic search embeddings (text-embedding-3-small)
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  // Content moderation (WS10 — manual review queue at launch).
  // provider: 'heuristic' (default) or 'hive'. With provider=hive and no
  // HIVE_API_KEY the pipeline logs once and degrades to the heuristic.
  // Hive flags to the review queue only — it never auto-rejects at launch.
  moderation: {
    provider:
      (process.env.MODERATION_PROVIDER || "heuristic").toLowerCase().trim() ||
      "heuristic",
    hiveApiKey: process.env.HIVE_API_KEY,
    // Monitored class score (general_nsfw / general_suggestive) at/above this
    // → review queue. Conservative default: 0.5 errs toward human review.
    hiveThreshold:
      parseFloat(process.env.MODERATION_HIVE_FLAG_THRESHOLD) || 0.5,
    hiveTimeoutMs: parseInt(process.env.MODERATION_HIVE_TIMEOUT_MS, 10) || 8000,
  },
  // Hybrid Discover retrieval (multi-channel + RRF + Groq rerank)
  discover: {
    // Engine selector (WS5). Values: 'launch' | 'hybrid' | 'browse'.
    // Precedence: DISCOVER_ENGINE wins when set to a valid value; otherwise the
    // legacy DISCOVER_HYBRID=true is honored as an alias for 'hybrid'. Default
    // 'hybrid' during rollout — flip to 'launch' once WS8 exit criteria are green.
    engine: resolveDiscoverEngine(),
    // Launch mode activates only below this eligible-pool size; above it the
    // engine logs and falls through to hybrid (filter-first at scale).
    corpusThreshold:
      parseInt(process.env.DISCOVER_CORPUS_THRESHOLD, 10) || 2500,
    hybrid:
      process.env.DISCOVER_HYBRID === "true" ||
      process.env.DISCOVER_HYBRID === "1",
    retrievalTopK: parseInt(process.env.DISCOVER_RETRIEVAL_TOP_K, 10) || 80,
    rerankTopK: parseInt(process.env.DISCOVER_RERANK_TOP_K, 10) || 50,
    rerankProvider: process.env.DISCOVER_RERANK_PROVIDER || "groq",
    minRerankScore: parseFloat(process.env.DISCOVER_MIN_RERANK_SCORE) || 40,
    rrfK: parseInt(process.env.DISCOVER_RRF_K, 10) || 60,
    // Legacy single-vector fusion (deprecated when hybrid on)
    maxDistance: parseFloat(process.env.DISCOVER_MAX_DISTANCE) || 0.55,
    fusionTextWeight:
      parseFloat(process.env.DISCOVER_FUSION_TEXT_WEIGHT) || 0.6,
    fusionImageWeight:
      parseFloat(process.env.DISCOVER_FUSION_IMAGE_WEIGHT) || 0.4,
  },
  // Cloudflare R2 configuration
  r2: {
    bucket: process.env.R2_BUCKET,
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    publicUrl:
      process.env.R2_PUBLIC_URL ||
      `https://${process.env.R2_BUCKET}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: "auto",
  },
  // Agency RBAC — set AGENCY_RBAC_ENFORCE=false to log-only during rollout.
  // KILLSWITCH: enforcement can NEVER be disabled in production. The
  // AGENCY_RBAC_ENFORCE=false / =0 escape hatch is honored only outside
  // production so a misconfigured prod env var can't silently open the
  // agency RBAC surface.
  agencyRbacEnforce:
    nodeEnv === "production"
      ? true
      : process.env.AGENCY_RBAC_ENFORCE !== "false" &&
        process.env.AGENCY_RBAC_ENFORCE !== "0",
  // Agency policy acceptance is a launch gate. Production cannot disable it;
  // tests opt in so hand-built schemas that predate the acceptance table keep
  // their narrow focus.
  agencyLegalEnforce:
    nodeEnv === "production"
      ? true
      : nodeEnv === "test"
        ? process.env.AGENCY_LEGAL_ENFORCE === "1"
        : process.env.AGENCY_LEGAL_ENFORCE !== "false" &&
          process.env.AGENCY_LEGAL_ENFORCE !== "0",
  // Minor-submission enforcement is always on outside tests. Focused tests
  // using hand-built pre-migration schemas opt in explicitly.
  minorSubmissionEnforce:
    nodeEnv === "production"
      ? true
      : nodeEnv === "test"
        ? process.env.MINOR_SUBMISSION_ENFORCE === "1"
        : true,
  appUrl:
    process.env.APP_URL ||
    process.env.BASE_URL ||
    process.env.URL ||
    "http://localhost:3000",
  // Instagram API with Instagram Login (Meta App Dashboard → Instagram → API setup)
  instagram: {
    appId: process.env.INSTAGRAM_APP_ID,
    appSecret: process.env.INSTAGRAM_APP_SECRET,
    redirectUri:
      process.env.INSTAGRAM_REDIRECT_URI ||
      `${process.env.APP_URL || "http://localhost:3000"}/api/auth/instagram/callback`,
    scope:
      process.env.INSTAGRAM_OAUTH_SCOPE || "instagram_business_basic",
  },
  // SMTP Email configuration
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || "Pholio <noreply@pholio.studio>",
  },
};
