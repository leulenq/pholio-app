const path = require('path');
const os = require('os');
require('dotenv').config();

const COMMISSION_RATE = parseFloat(process.env.COMMISSION_RATE || '0.25');
const MAX_UPLOAD_MB = parseFloat(process.env.MAX_UPLOAD_MB || '8');

function readEnv(...keys) {
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
  }
  return undefined;
}

const firebaseProjectId = readEnv('FIREBASE_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID');
const firebaseStorageBucket =
  readEnv('FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_STORAGE_BUCKET') ||
  (firebaseProjectId ? `${firebaseProjectId}.appspot.com` : undefined);

// Detect serverless environment (Netlify Functions, AWS Lambda, etc.)
const isServerless = Boolean(
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NETLIFY ||
  process.env.NETLIFY_DEV ||
  process.env.VERCEL ||
  process.env._HANDLER
);

// In serverless environments, use /tmp for temporary file storage
// Note: Files in /tmp are deleted after function execution, so cloud storage is required for persistence
const rootUploads = process.env.UPLOAD_DIR
  ? path.isAbsolute(process.env.UPLOAD_DIR)
    ? process.env.UPLOAD_DIR
    : path.join(__dirname, '..', '..', process.env.UPLOAD_DIR)
  : isServerless
    ? path.join(os.tmpdir(), 'pholio-uploads')
    : path.join(__dirname, '..', '..', 'uploads');

module.exports = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'pholio-secret',
  dbClient: (process.env.DB_CLIENT || 'sqlite3').toLowerCase(),
  databaseUrl: process.env.DATABASE_URL || 'sqlite://./dev.sqlite3',
  commissionRate: Number.isFinite(COMMISSION_RATE) ? COMMISSION_RATE : 0.25,
  uploadsDir: rootUploads,
  isServerless,
  maxUploadBytes: Number.isFinite(MAX_UPLOAD_MB) ? MAX_UPLOAD_MB * 1024 * 1024 : 8 * 1024 * 1024,
  // PDF Base URL: Use Netlify environment variables for proper URL resolution
  // DEPLOY_PRIME_URL is available for branch deployments (e.g., branch--site.netlify.app)
  // URL is the main production URL
  // PDF_BASE_URL can be used as a custom override
  // Fall back to localhost for local development
  pdfBaseUrl: process.env.DEPLOY_PRIME_URL || process.env.URL || process.env.PDF_BASE_URL || 'http://localhost:3000',
  // Firebase configuration
  firebase: {
    // Server-side (Admin SDK)
    projectId: firebaseProjectId,
    privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    clientId: process.env.FIREBASE_CLIENT_ID,
    // Client-side (Web SDK)
    apiKey: readEnv('FIREBASE_API_KEY', 'VITE_FIREBASE_API_KEY'),
    authDomain: readEnv('FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_AUTH_DOMAIN'),
    storageBucket: firebaseStorageBucket,
    messagingSenderId: readEnv('FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: readEnv('FIREBASE_APP_ID', 'VITE_FIREBASE_APP_ID'),
    measurementId: readEnv('FIREBASE_MEASUREMENT_ID', 'VITE_FIREBASE_MEASUREMENT_ID')
  },
  // Stripe configuration
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    priceId: process.env.STRIPE_PRICE_ID,
    baseUrl: process.env.BASE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:3000'
  },
  // Groq AI configuration
  groq: {
    apiKey: process.env.GROQ_API_KEY
  },
  // Cloudflare R2 configuration
  r2: {
    bucket: process.env.R2_BUCKET,
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    publicUrl: process.env.R2_PUBLIC_URL || `https://${process.env.R2_BUCKET}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: 'auto'
  }
};
