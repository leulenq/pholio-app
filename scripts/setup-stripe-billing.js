#!/usr/bin/env node
/**
 * Provision Stripe product + prices to match src/shared/lib/billing-plan.js.
 *
 * Creates (or reuses) a single Studio+ product with:
 *   - $9.99/month recurring
 *   - $95.88/year recurring
 *
 * Trial (14 days) is applied at Checkout session creation in code — not on the Price.
 *
 * Usage:
 *   node scripts/setup-stripe-billing.js          # create/find + print env vars
 *   node scripts/setup-stripe-billing.js --write  # also append missing keys to .env
 *   node scripts/setup-stripe-billing.js --brand  # upload Pholio logo/icon + account branding
 *   node scripts/setup-stripe-billing.js --write-live  # write live IDs to .env.live (use sk_live_... key)
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const Stripe = require("stripe");
const { STUDIO_PLUS_PLAN } = require("../src/shared/lib/billing-plan");
const { PHOLIO_CHECKOUT_BRAND } = require("../src/shared/lib/stripe-checkout-branding");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const ENV_LIVE_PATH = path.join(ROOT, ".env.live");
const BRAND_DIR = path.join(ROOT, "public", "brand");

const BRAND_FILES = {
  icon: path.join(BRAND_DIR, "pholio-brand-mark.png"),
  logo: path.join(BRAND_DIR, "pholio-wordmark-lockup-on-ink.png"),
};

const ACCOUNT_BRANDING = {
  primary_color: PHOLIO_CHECKOUT_BRAND.buttonColor,
  secondary_color: "#050505",
};

const PRODUCT_NAME = "Studio+";
const PRODUCT_METADATA = {
  pholio_plan_id: STUDIO_PLUS_PLAN.id,
  pholio_product: "studio_plus",
};

const PRICES = {
  monthly: {
    unit_amount: 999,
    currency: "usd",
    recurring: { interval: "month" },
    nickname: "Studio+ Monthly",
    metadata: { pholio_interval: "monthly" },
  },
  annual: {
    unit_amount: 9588,
    currency: "usd",
    recurring: { interval: "year" },
    nickname: "Studio+ Annual",
    metadata: { pholio_interval: "annual" },
  },
};

function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function findExistingProduct(stripe) {
  const products = await stripe.products.list({ limit: 100, active: true });
  return (
    products.data.find(
      (p) =>
        p.metadata?.pholio_plan_id === STUDIO_PLUS_PLAN.id ||
        p.name === PRODUCT_NAME,
    ) || null
  );
}

async function findPriceForProduct(stripe, productId, interval) {
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  });

  const expectedAmount = PRICES[interval].unit_amount;
  const expectedInterval = PRICES[interval].recurring.interval;

  return (
    prices.data.find(
      (price) =>
        price.unit_amount === expectedAmount &&
        price.currency === "usd" &&
        price.recurring?.interval === expectedInterval,
    ) || null
  );
}

async function ensureProduct(stripe) {
  let product = await findExistingProduct(stripe);
  if (product) {
    console.log(`Found existing product: ${product.id} (${product.name})`);
    return product;
  }

  product = await stripe.products.create({
    name: PRODUCT_NAME,
    description:
      "Premium talent portfolio tools — analytics, comp cards, and unlimited agency applications. Includes a 14-day free trial.",
    metadata: PRODUCT_METADATA,
  });
  console.log(`Created product: ${product.id} (${product.name})`);
  return product;
}

async function ensurePrice(stripe, productId, interval) {
  const existing = await findPriceForProduct(stripe, productId, interval);
  if (existing) {
    console.log(
      `Found existing ${interval} price: ${existing.id} (${formatMoney(existing.unit_amount)}/${existing.recurring.interval})`,
    );
    return existing;
  }

  const spec = PRICES[interval];
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: spec.unit_amount,
    currency: spec.currency,
    recurring: spec.recurring,
    nickname: spec.nickname,
    metadata: spec.metadata,
  });
  console.log(
    `Created ${interval} price: ${price.id} (${formatMoney(price.unit_amount)}/${price.recurring.interval})`,
  );
  return price;
}

function upsertEnvVars(vars, targetPath = ENV_PATH) {
  let content = fs.existsSync(targetPath)
    ? fs.readFileSync(targetPath, "utf8")
    : "";

  const lines = [];
  for (const [key, value] of Object.entries(vars)) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(content)) {
      content = content.replace(pattern, `${key}=${value}`);
      lines.push(`Updated ${key}`);
    } else {
      content = `${content.replace(/\s*$/, "")}\n${key}=${value}\n`;
      lines.push(`Appended ${key}`);
    }
  }

  fs.writeFileSync(targetPath, content);
  return lines;
}

async function uploadBrandFile(stripe, filePath, purpose) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Brand asset not found: ${filePath}`);
  }

  const file = await stripe.files.create({
    purpose,
    file: {
      data: fs.readFileSync(filePath),
      name: path.basename(filePath),
      type: "image/png",
    },
  });

  return file.id;
}

async function configureCheckoutBranding(stripe, writeEnv, envTarget = ENV_PATH) {
  console.log("\n--- Checkout branding (Pholio) ---");

  for (const [key, filePath] of Object.entries(BRAND_FILES)) {
    if (!fs.existsSync(filePath)) {
      console.warn(`  Missing ${key} asset at ${filePath} — run from repo with public/brand assets`);
    }
  }

  const iconId = await uploadBrandFile(
    stripe,
    BRAND_FILES.icon,
    "business_icon",
  );
  const logoId = await uploadBrandFile(
    stripe,
    BRAND_FILES.logo,
    "business_logo",
  );

  console.log(`  Uploaded icon: ${iconId}`);
  console.log(`  Uploaded logo: ${logoId}`);

  try {
    const account = await stripe.accounts.retrieve();
    await stripe.accounts.update(account.id, {
      settings: {
        branding: {
          icon: iconId,
          logo: logoId,
          ...ACCOUNT_BRANDING,
        },
      },
    });
    console.log(
      `  Account branding updated (${account.id}) — primary ${ACCOUNT_BRANDING.primary_color}`,
    );
  } catch (error) {
    console.warn(
      "  Account branding API skipped (standard accounts: set logo/colors in Dashboard → Settings → Branding).",
    );
    console.warn(`  ${error.message}`);
    console.warn(
      "  Per-session checkout branding still applies via branding_settings + file IDs.",
    );
  }

  const brandEnv = {
    STRIPE_BRAND_ICON_FILE_ID: iconId,
    STRIPE_BRAND_LOGO_FILE_ID: logoId,
  };

  console.log("\n--- Brand file IDs ---");
  for (const [key, value] of Object.entries(brandEnv)) {
    console.log(`${key}=${value}`);
  }

  if (writeEnv) {
    const changes = upsertEnvVars(brandEnv, envTarget);
    console.log(`\n${path.basename(envTarget)} branding updates:`);
    for (const line of changes) console.log(`  ${line}`);
  }

  return brandEnv;
}

async function main() {
  const writeEnv = process.argv.includes("--write");
  const writeLive = process.argv.includes("--write-live");
  const configureBrand = process.argv.includes("--brand");
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    console.error("STRIPE_SECRET_KEY is not set in .env");
    process.exit(1);
  }

  const isLiveKey = secretKey.startsWith("sk_live_");
  const envTarget = writeLive ? ENV_LIVE_PATH : ENV_PATH;
  const shouldWrite = writeEnv || writeLive;

  if (writeLive && !isLiveKey) {
    console.error(
      "--write-live requires a live secret key (sk_live_...). Pass inline:\n" +
        "  STRIPE_SECRET_KEY=sk_live_... node scripts/setup-stripe-billing.js --brand --write-live",
    );
    process.exit(1);
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2024-12-18.acacia" });

  console.log("Pholio Stripe billing setup");
  console.log(`Mode: ${isLiveKey ? "LIVE" : "test"}`);
  console.log("Source of truth: src/shared/lib/billing-plan.js");
  console.log(
    `Plan: ${STUDIO_PLUS_PLAN.name} — ${STUDIO_PLUS_PLAN.intervals.monthly.renewalLabel}, ${STUDIO_PLUS_PLAN.intervals.annual.renewalLabel}, ${STUDIO_PLUS_PLAN.trialDays}-day trial at checkout\n`,
  );

  const product = await ensureProduct(stripe);
  const monthly = await ensurePrice(stripe, product.id, "monthly");
  const annual = await ensurePrice(stripe, product.id, "annual");

  const envVars = {
    STRIPE_PRICE_ID_MONTHLY: monthly.id,
    STRIPE_PRICE_ID_ANNUAL: annual.id,
  };

  console.log("\n--- Add to .env / Netlify ---");
  for (const [key, value] of Object.entries(envVars)) {
    console.log(`${key}=${value}`);
  }

  if (shouldWrite) {
    const changes = upsertEnvVars(envVars, envTarget);
    console.log(`\n${path.basename(envTarget)} updates:`);
    for (const line of changes) console.log(`  ${line}`);
  } else {
    console.log("\nRun with --write (test) or --write-live (production) to save price IDs");
  }

  if (configureBrand) {
    await configureCheckoutBranding(stripe, shouldWrite, envTarget);
  } else {
    console.log("\nRun with --brand to upload Pholio logo/icon and set account branding");
  }

  console.log("\n--- Manual dashboard steps still required ---");
  console.log("1. STRIPE_WEBHOOK_SECRET — create webhook endpoint:");
  console.log("   Dev:  stripe listen --forward-to localhost:3000/stripe/webhook");
  console.log("   Prod: https://app.pholio.studio/stripe/webhook");
  console.log("   Events: checkout.session.completed, customer.subscription.*, invoice.paid, invoice.payment_failed");
  console.log("2. Customer Portal — Stripe Dashboard → Settings → Billing → Customer portal (enable)");
  console.log("3. Checkout branding — run: node scripts/setup-stripe-billing.js --brand --write");
  console.log("   Or Dashboard → Settings → Branding (logo, icon, colors #C9A55A / #FAF8F5)");
  console.log("4. Enterprise/agencies — contact sales only; do NOT add agency Stripe products");
  console.log("\nProduct ID (reference):", product.id);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
