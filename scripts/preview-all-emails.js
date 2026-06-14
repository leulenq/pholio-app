#!/usr/bin/env node
/**
 * Renders all Pholio transactional email templates to static HTML previews.
 *
 * Usage: node scripts/preview-all-emails.js
 * Open:  scripts/previews/index.html
 */

const fs = require("fs");
const path = require("path");
const {
  buildNewMessageEmailHtml,
  buildApplicationStatusEmailHtml,
  buildAgencyInviteEmailHtml,
  buildWelcomeTalentEmailHtml,
  buildWelcomeAgencyEmailHtml,
  buildEmailVerificationHtml,
  buildPasswordResetEmailHtml,
  buildPasswordChangedEmailHtml,
  buildMagicSignInEmailHtml,
  buildTeamInviteEmailHtml,
} = require("../src/shared/lib/email-templates");

const APP = "https://app.pholio.studio";

const templates = [
  {
    id: "welcome-talent",
    category: "Auth & onboarding",
    subject: "Welcome to Pholio",
    description:
      "Sent after a new talent account is created (email or Google sign-up).",
    html: buildWelcomeTalentEmailHtml({ firstName: "Nova" }),
  },
  {
    id: "welcome-agency",
    category: "Auth & onboarding",
    subject: "Welcome to Pholio — Elite Models",
    description: "Sent after agency / partners sign-up is complete.",
    html: buildWelcomeAgencyEmailHtml({
      contactName: "Sarah",
      agencyName: "Elite Models",
    }),
  },
  {
    id: "verify-email",
    category: "Auth & onboarding",
    subject: "Verify your email address",
    description:
      "Email verification with button + optional 6-digit code fallback.",
    html: buildEmailVerificationHtml({
      firstName: "Nova",
      verifyUrl: `${APP}/verify-email?token=sample-verify-token`,
      verificationCode: "482913",
      expiresMinutes: 30,
    }),
  },
  {
    id: "password-reset",
    category: "Auth & security",
    subject: "Reset your Pholio password",
    description:
      "Password reset request (replaces generic Firebase email when wired).",
    html: buildPasswordResetEmailHtml({
      firstName: "Nova",
      resetUrl: `${APP}/reset-password?token=sample-reset-token`,
      expiresMinutes: 60,
    }),
  },
  {
    id: "password-changed",
    category: "Auth & security",
    subject: "Your Pholio password was changed",
    description: "Security confirmation after a successful password change.",
    html: buildPasswordChangedEmailHtml({
      firstName: "Nova",
      changedAt: "June 7, 2026 at 2:34 PM",
    }),
  },
  {
    id: "magic-sign-in",
    category: "Auth & security",
    subject: "Your Pholio sign-in link",
    description: "Passwordless one-tap sign-in link.",
    html: buildMagicSignInEmailHtml({
      firstName: "Nova",
      signInUrl: `${APP}/auth/magic?token=sample-signin-token`,
      expiresMinutes: 15,
    }),
  },
  {
    id: "new-message",
    category: "Agency ↔ Talent",
    subject: "New message from Elite Models",
    description: "Agency message notification with magic-link reply.",
    html: buildNewMessageEmailHtml({
      recipientName: "Nova",
      senderName: "Elite Models",
      messagePreview:
        "Hi Nova — we loved your submission for our Spring casting. Are you available for a brief video call this Thursday or Friday?",
      replyUrl: `${APP}/reply/sample-token-preview-only`,
    }),
  },
  {
    id: "application-accepted",
    category: "Agency ↔ Talent",
    subject: "Your application to Elite Models has been accepted",
    description: "Talent notified when an agency accepts their application.",
    html: buildApplicationStatusEmailHtml({
      talentName: "Nova",
      agencyName: "Elite Models",
      status: "accepted",
    }),
  },
  {
    id: "application-declined",
    category: "Agency ↔ Talent",
    subject: "Application update from Elite Models",
    description: "Talent notified when an agency passes on their application.",
    html: buildApplicationStatusEmailHtml({
      talentName: "Nova",
      agencyName: "Elite Models",
      status: "declined",
    }),
  },
  {
    id: "agency-invite-talent",
    category: "Agency ↔ Talent",
    subject: "Elite Models has invited you to apply on Pholio",
    description: "Agency discovers talent on Discover and sends an invite.",
    html: buildAgencyInviteEmailHtml({
      talentName: "Nova",
      agencyName: "Elite Models",
    }),
  },
  {
    id: "team-invite",
    category: "Agency team",
    subject: "You've been invited to Elite Models on Pholio",
    description: "Agency owner invites a booker, agent, or scout to the team.",
    html: buildTeamInviteEmailHtml({
      inviteeName: "Jordan",
      agencyName: "Elite Models",
      inviterName: "Sarah Chen",
      roleLabel: "Agent · Booker",
      acceptUrl: `${APP}/dashboard/agency/team/accept?token=sample-team-token`,
    }),
  },
];

const outDir = path.join(__dirname, "previews");
fs.mkdirSync(outDir, { recursive: true });

for (const t of templates) {
  const file = path.join(outDir, `${t.id}.html`);
  fs.writeFileSync(file, t.html, "utf8");
}

const categories = [...new Set(templates.map((t) => t.category))];

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pholio Email Templates — Preview</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #FAF8F5;
      color: #1A1815;
      line-height: 1.5;
    }
    .header {
      padding: 48px 24px 32px;
      text-align: center;
      border-bottom: 1px solid #EDE9E3;
      background: #fff;
    }
    .header h1 {
      font-family: Georgia, 'Times New Roman', serif;
      font-weight: 400;
      font-size: 2rem;
      letter-spacing: 0.08em;
      color: #C9A55A;
      text-transform: uppercase;
      margin: 0 0 8px;
    }
    .header p { margin: 0; color: #6B6560; max-width: 520px; margin-inline: auto; }
    .wrap { max-width: 960px; margin: 0 auto; padding: 32px 20px 64px; }
    .category { margin-bottom: 40px; }
    .category h2 {
      font-family: Georgia, serif;
      font-size: 1.125rem;
      font-weight: 400;
      color: #1A1815;
      margin: 0 0 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #EDE9E3;
    }
    .grid { display: grid; gap: 16px; }
    @media (min-width: 640px) { .grid { grid-template-columns: 1fr 1fr; } }
    .card {
      background: #fff;
      border: 1px solid #EDE9E3;
      border-radius: 12px;
      padding: 20px;
      transition: box-shadow 0.2s ease, border-color 0.2s ease;
    }
    .card:hover {
      border-color: rgba(201,165,90,0.35);
      box-shadow: 0 4px 20px rgba(26,24,21,0.06);
    }
    .card h3 { margin: 0 0 6px; font-size: 1rem; font-weight: 600; }
    .card .subject { font-size: 0.8125rem; color: #9C958E; margin-bottom: 8px; font-family: 'Courier New', monospace; }
    .card p { margin: 0 0 16px; font-size: 0.875rem; color: #6B6560; }
    .card a {
      display: inline-block;
      padding: 8px 16px;
      background: #C9A55A;
      color: #fff;
      text-decoration: none;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 600;
    }
    .card a:hover { background: #B8956A; }
    .note {
      margin-top: 32px;
      padding: 16px 20px;
      background: #fff;
      border: 1px solid #EDE9E3;
      border-radius: 12px;
      font-size: 0.875rem;
      color: #6B6560;
    }
    .note strong { color: #1A1815; }
  </style>
</head>
<body>
  <header class="header">
    <h1>Pholio</h1>
    <p>Transactional email template previews — warm editorial luxury, inline-styled for email clients.</p>
  </header>
  <div class="wrap">
    ${categories
      .map(
        (cat) => `
    <section class="category">
      <h2>${cat}</h2>
      <div class="grid">
        ${templates
          .filter((t) => t.category === cat)
          .map(
            (t) => `
        <article class="card">
          <h3>${t.id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</h3>
          <div class="subject">Subject: ${t.subject}</div>
          <p>${t.description}</p>
          <a href="./${t.id}.html" target="_blank">Open preview →</a>
        </article>`,
          )
          .join("")}
      </div>
    </section>`,
      )
      .join("")}
    <div class="note">
      <strong>Today in production:</strong> Password reset uses Firebase's default email (not yet these templates).
      Application status, agency invites, and new-message notifications use <code>src/shared/lib/email.js</code>.
      Auth templates above are ready to wire when you switch to a custom email provider (Resend, SendGrid, Postmark).
    </div>
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(outDir, "index.html"), indexHtml, "utf8");

console.log(`Generated ${templates.length} email previews in ${outDir}/`);
console.log("Open scripts/previews/index.html in your browser.");
