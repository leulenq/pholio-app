/**
 * Email Service
 * Handles all email notifications for the platform
 */

const nodemailer = require("nodemailer");
const config = require("../../config");
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
  buildGuardianConsentEmailHtml,
} = require("./pholio-email");

/**
 * Extract just the domain of an address for logging. We never want to log a
 * full recipient address (or message bodies / tokens / links — guardian
 * consent links are secrets) so log output stays safe to paste into tickets.
 */
function emailDomain(address) {
  const match = /@([^,>\s]+)/.exec(String(address || ""));
  return match ? match[1] : "unknown";
}

// Create transporter: use SMTP if configured, otherwise fallback to development mock logger
let transporter;
const smtpConfigured = Boolean(config.smtp?.host);

if (smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
  console.log("[Email] Initialized REAL SMTP transporter with host:", config.smtp.host);

  // Non-fatal connectivity/auth check. This never blocks startup, but a
  // failure here means every real send below will also fail — surfacing it
  // now (in boot logs) instead of only on first send makes misconfiguration
  // visible immediately instead of silently. Guarded because test doubles
  // for nodemailer (jest.mock) may not implement verify().
  if (typeof transporter.verify === "function") {
    Promise.resolve()
      .then(() => transporter.verify())
      .then(() => {
        console.log(
          "[Email] SMTP transporter verify() OK — host:",
          config.smtp.host,
        );
      })
      .catch((err) => {
        console.error(
          "[Email] SMTP transporter verify() FAILED — host:",
          config.smtp.host,
          "— emails will likely fail to send until this is fixed. Reason:",
          err.message,
        );
      });
  }
} else {
  transporter = {
    sendMail: async (mailOptions) => {
      console.log("[Email] MOCK — SMTP not configured, NOT sending a real email:", {
        to: emailDomain(mailOptions.to),
        subject: mailOptions.subject,
      });
      return { messageId: "mock-" + Date.now() };
    },
  };

  if (config.nodeEnv === "production") {
    // Loud and unmistakable: in production with no SMTP configured, every
    // outbound email (guardian consent, application status, agency invites,
    // new-message notifications, etc.) is silently discarded by the mock
    // transporter above. We do not crash the server for this — some deploys
    // may intentionally run without email — but it must be impossible to
    // miss in logs/alerting.
    console.error(
      "\n" +
        "############################################################\n" +
        "# [Email] PRODUCTION MISCONFIGURATION: SMTP_HOST is not set. #\n" +
        "# ALL outbound email (guardian consent, application status,  #\n" +
        "# agency invites, new-message notifications, etc.) is being  #\n" +
        "# silently swallowed by the MOCK transporter.                #\n" +
        "# Set SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS /         #\n" +
        "# EMAIL_FROM in the production environment.                  #\n" +
        "# See docs/email-setup.md.                                   #\n" +
        "############################################################\n",
    );
  } else {
    console.log(
      "[Email] Initialized MOCK development transporter (SMTP not configured)",
    );
  }
}

/**
 * Send email
 */
async function sendEmail({ to, subject, html, text }) {
  try {
    const mailOptions = {
      from: config.smtp?.from || "Pholio <noreply@pholio.studio>",
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ""),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("[Email] Sent:", info.messageId, "to domain:", emailDomain(to));
    return info;
  } catch (error) {
    // Recipient domain + subject only — never the full address, body, or any
    // token/link embedded in the body (e.g. guardian consent links).
    console.error(
      "[Email] Failed to send — to domain:",
      emailDomain(to),
      "subject:",
      subject,
      "reason:",
      error.message,
    );
    throw error;
  }
}

/**
 * Application Status Change Notification
 */
async function sendApplicationStatusEmail({
  to,
  talentName,
  agencyName,
  status,
}) {
  const messages = {
    accepted: {
      subject: `Representation update from ${agencyName}`,
    },
    declined: {
      subject: `Application update from ${agencyName}`,
    },
  };

  const { subject } = messages[status] || {
    subject: "Application update",
  };

  const html = buildApplicationStatusEmailHtml({
    talentName,
    agencyName,
    status,
  });

  return sendEmail({ to, subject, html });
}

/**
 * New Message Notification
 */
async function sendNewMessageEmail({
  to,
  recipientName,
  senderName,
  messagePreview,
  replyUrl,
}) {
  const subject = `New message from ${senderName}`;
  const html = buildNewMessageEmailHtml({
    recipientName,
    senderName,
    messagePreview,
    replyUrl,
  });
  return sendEmail({ to, subject, html });
}

/**
 * Agency Invite Notification (sent to talent when an agency invites them)
 */
async function sendAgencyInviteEmail({ talentEmail, talentName, agencyName }) {
  const subject = `${agencyName} has invited you to apply on Pholio`;
  const html = buildAgencyInviteEmailHtml({ talentName, agencyName });
  return sendEmail({ to: talentEmail, subject, html });
}

async function sendWelcomeTalentEmail({ to, firstName }) {
  const subject = "Welcome to Pholio";
  const html = buildWelcomeTalentEmailHtml({ firstName });
  return sendEmail({ to, subject, html });
}

async function sendWelcomeAgencyEmail({ to, contactName, agencyName }) {
  const subject = `Welcome to Pholio — ${agencyName}`;
  const html = buildWelcomeAgencyEmailHtml({ contactName, agencyName });
  return sendEmail({ to, subject, html });
}

async function sendEmailVerificationEmail({
  to,
  firstName,
  verifyUrl,
  verificationCode,
  expiresMinutes,
}) {
  const subject = "Verify your email address";
  const html = buildEmailVerificationHtml({
    firstName,
    verifyUrl,
    verificationCode,
    expiresMinutes,
  });
  return sendEmail({ to, subject, html });
}

async function sendPasswordResetEmail({
  to,
  firstName,
  resetUrl,
  expiresMinutes,
}) {
  const subject = "Reset your Pholio password";
  const html = buildPasswordResetEmailHtml({
    firstName,
    resetUrl,
    expiresMinutes,
  });
  return sendEmail({ to, subject, html });
}

async function sendPasswordChangedEmail({
  to,
  firstName,
  changedAt,
  supportUrl,
}) {
  const subject = "Your Pholio password was changed";
  const html = buildPasswordChangedEmailHtml({
    firstName,
    changedAt,
    supportUrl,
  });
  return sendEmail({ to, subject, html });
}

async function sendMagicSignInEmail({
  to,
  firstName,
  signInUrl,
  expiresMinutes,
}) {
  const subject = "Your Pholio sign-in link";
  const html = buildMagicSignInEmailHtml({
    firstName,
    signInUrl,
    expiresMinutes,
  });
  return sendEmail({ to, subject, html });
}

async function sendTeamInviteEmail({
  to,
  inviteeName,
  agencyName,
  inviterName,
  roleLabel,
  acceptUrl,
}) {
  const subject = `You've been invited to ${agencyName} on Pholio`;
  const html = buildTeamInviteEmailHtml({
    inviteeName,
    agencyName,
    inviterName,
    roleLabel,
    acceptUrl,
  });
  return sendEmail({ to, subject, html });
}

async function sendGuardianConsentEmail({
  to,
  guardianName,
  talentName,
  talentPhotoUrl,
  talentCity,
  agencyName,
  consentUrl,
  expiresDays = 7,
}) {
  const subject = agencyName
    ? talentName
      ? `Consent requested for ${talentName} to submit to ${agencyName}`
      : `Guardian authorization requested for a submission to ${agencyName}`
    : talentName
      ? `Consent requested for ${talentName} on Pholio`
      : "Guardian consent requested on Pholio";
  const html = buildGuardianConsentEmailHtml({
    guardianName,
    talentName,
    talentPhotoUrl,
    talentCity,
    agencyName,
    consentUrl,
    expiresDays,
  });
  return sendEmail({ to, subject, html });
}

module.exports = {
  sendEmail,
  sendApplicationStatusEmail,
  sendNewMessageEmail,
  sendAgencyInviteEmail,
  sendWelcomeTalentEmail,
  sendWelcomeAgencyEmail,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendMagicSignInEmail,
  sendTeamInviteEmail,
  sendGuardianConsentEmail,
};
