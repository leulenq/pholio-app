#!/usr/bin/env node
/**
 * Renders the Pholio Email Framework to browsable static previews:
 *   • A component gallery (every primitive in the kit, isolated).
 *   • The reference templates composed from those primitives.
 *
 * Usage: node scripts/preview-email-framework.js
 * Open:  scripts/previews/framework/index.html
 */

const fs = require("fs");
const path = require("path");
const { theme, kit, renderEmail, templates } = require("../src/shared/lib/email-kit");

const APP = "https://app.pholio.studio";

/* ---- A single email that showcases the whole component kit ---- */
const galleryContent =
  kit.hero({
    title: "The component kit",
    subtitle:
      "Every primitive below composes into a full email — one theme file drives all of it.",
  }) +
  `<div class="ph-pad" style="padding:36px 44px 40px;">` +
  kit.heading("Display heading") +
  kit.spacer(10) +
  kit.lead("A lead paragraph sits directly under the headline — no eyebrow, no kicker. The heading carries the message alone.") +
  kit.spacer(8) +
  kit.text("Body copy in Inter at a comfortable 15px / 1.65 line-height, in warm muted ink for long-form reading.") +
  kit.ornament() +
  kit.subheading("Buttons") +
  kit.spacer(16) +
  kit.button(APP, "Primary action", { width: 200 }) +
  kit.spacer(12) +
  kit.button(APP, "Secondary action", { variant: "secondary", width: 210 }) +
  kit.spacer(12) +
  kit.textCta(APP, "Quiet text CTA") +
  kit.divider() +
  kit.subheading("Stat row") +
  kit.spacer(16) +
  kit.statRow([
    { value: "1.2k", label: "Portfolios" },
    { value: "98%", label: "Open rate" },
    { value: "24h", label: "Avg reply" },
  ]) +
  kit.spacer(28) +
  kit.subheading("Detail list") +
  kit.spacer(16) +
  kit.detailList([
    { label: "Casting", value: "Spring Editorial" },
    { label: "When", value: "Thu, June 12 · 2:00 PM" },
    { label: "Location", value: "Studio 4, Brooklyn" },
  ]) +
  kit.spacer(28) +
  kit.subheading("Feature list") +
  kit.spacer(16) +
  kit.featureList([
    { icon: "&#9670;", title: "Editorial portfolio", description: "Curate hero shots and keep your book presentation-ready." },
    { icon: "&#9635;", title: "Comp card PDF", description: "Export a print-ready comp card with your best frames." },
  ]) +
  kit.spacer(28) +
  kit.subheading("Step list") +
  kit.spacer(16) +
  kit.stepList([
    { title: "Complete your essentials", description: "Measurements, location, bio, contact." },
    { title: "Upload strong images", description: "Lead with editorial quality." },
  ]) +
  kit.spacer(28) +
  kit.subheading("Quote") +
  kit.spacer(16) +
  kit.quote("We loved your submission for our Spring casting — are you free Thursday?") +
  kit.spacer(28) +
  kit.subheading("Code block") +
  kit.spacer(16) +
  kit.codeBlock("482913") +
  kit.spacer(28) +
  kit.subheading("Callout") +
  kit.spacer(16) +
  kit.callout("Reply to this email any time — a real human reads it.", { title: "Concierge" }) +
  kit.spacer(16) +
  kit.panel(kit.text("A plain nested panel for grouping related content.", { color: theme.muted })) +
  `</div>`;

const items = [
  {
    id: "component-gallery",
    name: "Component Gallery",
    subject: "The Pholio email component kit",
    description: "Every primitive in the framework, composed into one email.",
    html: renderEmail({
      title: "Pholio Email Framework",
      preheader: "Every component in the kit.",
      content: galleryContent,
      padded: false,
    }),
  },
  {
    id: "welcome-talent",
    name: "Welcome — Talent",
    subject: "Welcome to Pholio",
    description: "Hero band, stats, feature list, concierge callout.",
    html: templates.welcomeTalent({ firstName: "Nova" }),
  },
  {
    id: "verify-email",
    name: "Verify Email",
    subject: "Verify your email",
    description: "Auth flow with bulletproof button + one-time code fallback.",
    html: templates.verifyEmail({
      firstName: "Nova",
      verifyUrl: `${APP}/verify-email?token=sample`,
      code: "482913",
      expiresMinutes: 30,
    }),
  },
  {
    id: "new-message",
    name: "New Message",
    subject: "New message from Elite Models",
    description: "Agency → talent with quoted preview and magic-link reply.",
    html: templates.newMessage({
      recipientName: "Nova",
      senderName: "Elite Models",
      messagePreview:
        "Hi Nova — we loved your submission for our Spring casting. Are you available for a brief call this Thursday or Friday?",
      replyUrl: `${APP}/reply/sample-token`,
    }),
  },
];

const outDir = path.join(__dirname, "previews", "framework");
fs.mkdirSync(outDir, { recursive: true });
for (const it of items) {
  fs.writeFileSync(path.join(outDir, `${it.id}.html`), it.html, "utf8");
}

const index = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Pholio Email Framework — Preview</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:${theme.canvas};color:${theme.ink};line-height:1.5}
  .header{padding:56px 24px 36px;text-align:center;border-bottom:1px solid ${theme.border};background:${theme.surface}}
  .header h1{font-family:Georgia,serif;font-weight:500;font-size:2rem;letter-spacing:0.14em;color:${theme.gold};text-transform:uppercase;margin:0 0 10px}
  .header p{margin:0 auto;color:${theme.muted};max-width:560px}
  .wrap{max-width:1040px;margin:0 auto;padding:36px 20px 72px}
  .grid{display:grid;gap:18px}
  @media(min-width:680px){.grid{grid-template-columns:1fr 1fr}}
  .card{background:${theme.surface};border:1px solid ${theme.border};border-radius:14px;padding:22px;transition:box-shadow .2s ease,border-color .2s ease}
  .card:hover{border-color:${theme.goldLine};box-shadow:${theme.shadowSoft}}
  .card h3{margin:0 0 6px;font-size:1.05rem;font-weight:600}
  .card .subj{font-size:.8rem;color:${theme.faint};margin-bottom:10px;font-family:'Courier New',monospace}
  .card p{margin:0 0 18px;font-size:.9rem;color:${theme.muted}}
  .card a{display:inline-block;padding:9px 18px;background:${theme.gold};color:${theme.ink};text-decoration:none;border-radius:9px;font-size:.875rem;font-weight:600}
  .card a:hover{background:${theme.goldHover}}
</style></head><body>
<header class="header"><h1>Pholio</h1><p>Email Framework — a direct extension of the marketing site &amp; talent dashboard. Warm editorial luxury, fully inlined, dark-mode-proof, Outlook-hardened.</p></header>
<div class="wrap"><div class="grid">
${items
  .map(
    (it) => `<article class="card"><h3>${it.name}</h3><div class="subj">Subject: ${it.subject}</div><p>${it.description}</p><a href="./${it.id}.html" target="_blank">Open preview &rarr;</a></article>`,
  )
  .join("")}
</div></div></body></html>`;

fs.writeFileSync(path.join(outDir, "index.html"), index, "utf8");
console.log(`Generated ${items.length} framework previews in ${outDir}/`);
console.log("Open scripts/previews/framework/index.html");
