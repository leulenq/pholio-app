#!/usr/bin/env node
/**
 * Publish the Pholio brand mark for inbox sender avatars (Gravatar / BIMI)
 * and print setup steps for the transactional sender address.
 *
 * Usage: node scripts/setup-email-sender-avatar.js
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "client/public/brand/pholio-brand-mark.png");
const PUBLIC_BRAND_DIR = path.join(ROOT, "public/brand");
const SENDER_AVATAR = path.join(PUBLIC_BRAND_DIR, "pholio-sender-avatar.png");
const GRAVATAR_256 = path.join(PUBLIC_BRAND_DIR, "pholio-sender-avatar-256.png");
const DEFAULT_SENDER = "noreply@pholio.studio";

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Missing source brand mark: ${SOURCE}`);
    process.exit(1);
  }

  fs.mkdirSync(PUBLIC_BRAND_DIR, { recursive: true });
  await fs.promises.copyFile(SOURCE, SENDER_AVATAR);
  await sharp(SOURCE).resize(256, 256).png().toFile(GRAVATAR_256);

  const senderEmail =
    process.env.EMAIL_FROM?.match(/<([^>]+)>/)?.[1] ||
    process.env.EMAIL_FROM ||
    DEFAULT_SENDER;
  const hash = crypto
    .createHash("md5")
    .update(String(senderEmail).trim().toLowerCase())
    .digest("hex");

  const appUrl = (
    process.env.APP_URL || "https://app.pholio.studio"
  ).replace(/\/$/, "");

  console.log("Email sender avatar assets published:");
  console.log(`  ${SENDER_AVATAR}`);
  console.log(`  ${GRAVATAR_256}`);
  console.log(`  Public URL: ${appUrl}/brand/pholio-sender-avatar.png`);
  console.log("");
  console.log("Inbox sender profile picture (manual one-time setup):");
  console.log("  1. Sign in at https://gravatar.com");
  console.log(`  2. Add address: ${senderEmail}`);
  console.log(`  3. Upload: ${GRAVATAR_256} (256×256 square)`);
  console.log(`  4. Verify avatar resolves: https://www.gravatar.com/avatar/${hash}?s=256`);
  console.log("");
  console.log(
    "Gmail/Apple Mail pull sender avatars from Gravatar for the From address.",
  );
  console.log(
    "BIMI (optional, DNS + VMC) can also use the hosted mark at the URL above.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
