#!/usr/bin/env node
/**
 * Renders the new-message email template to a static HTML file for browser preview.
 *
 * Usage: node scripts/preview-new-message-email.js
 * Open:  scripts/previews/new-message-email.html
 */

const fs = require("fs");
const path = require("path");
const {
  buildNewMessageEmailHtml,
} = require("../src/shared/lib/email-templates");

const sample = buildNewMessageEmailHtml({
  recipientName: "Nova",
  senderName: "Elite Models",
  messagePreview:
    "Hi Nova — we loved your submission for our Spring casting. Are you available for a brief video call this Thursday or Friday? We'd love to learn more about your experience.",
  replyUrl: "https://app.pholio.studio/reply/sample-token-preview-only",
});

const outDir = path.join(__dirname, "previews");
const outFile = path.join(outDir, "new-message-email.html");

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, sample, "utf8");

console.log(`Preview written to ${outFile}`);
console.log("Open in your browser to see the email.");
