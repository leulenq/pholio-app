/**
 * Email Service
 * Handles all email notifications for the platform
 */

const nodemailer = require("nodemailer");
const config = require("../../config");
const {
  text: emailText,
  buildNewMessageEmailHtml,
  buildApplicationStatusEmailHtml,
  buildAgencyInviteEmailHtml,
  buildWelcomeTalentEmailHtml,
  buildWelcomeAgencyEmailHtml,
  buildAgencyActivationEmailHtml,
  buildEmailVerificationHtml,
  buildPasswordResetEmailHtml,
  buildSignInMethodNoticeEmailHtml,
  buildPasswordChangedEmailHtml,
  buildTeamInviteEmailHtml,
  buildNewDeviceSignInHtml,
  buildCardDeclinedEmailHtml,
  buildMaterialsRequestedEmailHtml,
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
 * Last-resort plain-text derivation, for templates that do not yet ship a
 * hand-written one (currently the agency family).
 *
 * The previous implementation was `html.replace(/<[^>]*>/g,"")`, which strips
 * tags but NOT the contents of <style> — so every text/plain part began with a
 * wall of CSS. That is a spam signal and it is what screen readers and watch
 * previews fall back to. Drop script/style wholesale before touching tags.
 */
function stripToText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/(p|div|tr|h1|h2|h3|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&middot;/g, "\u00b7")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Send email
 */
async function sendEmail({ to, subject, html, text, replyTo }) {
  try {
    const mailOptions = {
      from: config.smtp?.from || "Pholio <noreply@pholio.studio>",
      // A monitored inbox, not noreply@. Replies are an engagement signal, and
      // a talent answering a booker notification should reach a human.
      replyTo: replyTo || config.smtp?.replyTo || "support@pholio.studio",
      to,
      subject,
      html,
      text: text || stripToText(html),
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

  return sendEmail({
    to,
    subject,
    html,
    text: emailText.applicationStatus({ agencyName, status }),
  });
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
  return sendEmail({
    to,
    subject,
    html,
    text: emailText.newMessage({ senderName, agencyName: senderName, messagePreview, replyUrl }),
  });
}

/**
 * Agency Invite Notification (sent to talent when an agency invites them)
 */
async function sendAgencyInviteEmail({ talentEmail, talentName, agencyName }) {
  const subject = `${agencyName} has invited you to apply on Pholio`;
  const html = buildAgencyInviteEmailHtml({ talentName, agencyName });
  return sendEmail({
    to: talentEmail,
    subject,
    html,
    text: emailText.agencyInvite({ talentName, agencyName }),
  });
}

async function sendWelcomeTalentEmail({ to, firstName }) {
  const subject = "Welcome to Pholio";
  const html = buildWelcomeTalentEmailHtml({ firstName });
  return sendEmail({
    to,
    subject,
    html,
    text: emailText.welcomeTalent({ firstName }),
  });
}

async function sendWelcomeAgencyEmail({ to, contactName, agencyName }) {
  const subject = `Welcome to Pholio — ${agencyName}`;
  const html = buildWelcomeAgencyEmailHtml({ contactName, agencyName });
  return sendEmail({ to, subject, html });
}

async function sendAgencyActivationEmail({
  to,
  contactName,
  agencyName,
  activationUrl,
  expiresMinutes,
}) {
  const subject = `${agencyName || "Your agency"} is approved for Pholio`;
  const html = buildAgencyActivationEmailHtml({
    contactName,
    agencyName,
    activationUrl,
    expiresMinutes,
  });
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
  return sendEmail({
    to,
    subject,
    html,
    text: emailText.emailVerification({ firstName, verifyUrl, expiresMinutes }),
  });
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
  return sendEmail({
    to,
    subject,
    html,
    text: emailText.passwordReset({ firstName, resetUrl, expiresMinutes }),
  });
}

async function sendSignInMethodNoticeEmail({ to, firstName, providerLabel }) {
  const subject = "How to sign in to Pholio";
  const html = buildSignInMethodNoticeEmailHtml({ firstName, providerLabel });
  return sendEmail({
    to,
    subject,
    html,
    text: emailText.signInMethodNotice({ firstName, providerLabel }),
  });
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
  return sendEmail({
    to,
    subject,
    html,
    text: emailText.passwordChanged({ firstName, changedAt }),
  });
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
  return sendEmail({
    to,
    subject,
    html,
    text: emailText.guardianConsent({ guardianName, talentName, agencyName, consentUrl, expiresDays }),
  });
}


/**
 * A sign-in from a device Pholio has not seen. `session-registry.js` already
 * records the fingerprint, user agent and IP — nothing was ever sent.
 */
async function sendNewDeviceSignInEmail({ to, firstName, device, location, when }) {
  const html = buildNewDeviceSignInHtml({ firstName, device, location, when });
  return sendEmail({
    to,
    subject: `New sign-in on ${device || "a new device"}`,
    html,
    text: emailText.newDeviceSignIn({ firstName, device, location, when }),
  });
}

/**
 * A failed subscription payment.
 *
 * `reason` must be derived from Stripe's decline_code by the caller, not
 * guessed here:
 *   { kind: "stated", sentence }  — safe to name (expired_card,
 *                                   insufficient_funds, incorrect_cvc)
 *   { kind: "opaque" } or absent  — generic_decline / do_not_honor, AND the
 *                                   fraud codes, which must never be shown to
 *                                   the cardholder.
 */
async function sendCardDeclinedEmail({ to, reason, attempted, nextAttempt, pausesOn, amount }) {
  const html = buildCardDeclinedEmailHtml({ reason, attempted, nextAttempt, pausesOn, amount });
  return sendEmail({
    to,
    subject: "Your card was declined",
    html,
    text: emailText.cardDeclined({ reason, attempted, nextAttempt, pausesOn, amount }),
  });
}

/** An agency asked for more before deciding — the one talent-court state. */
async function sendMaterialsRequestedEmail({ to, agencyName, items }) {
  const html = buildMaterialsRequestedEmailHtml({ agencyName, items });
  return sendEmail({
    to,
    subject: `${agencyName || "An agency"} asked for more`,
    html,
    text: emailText.materialsRequested({ agencyName, items }),
  });
}

module.exports = {
  sendEmail,
  sendApplicationStatusEmail,
  sendNewMessageEmail,
  sendAgencyInviteEmail,
  sendWelcomeTalentEmail,
  sendWelcomeAgencyEmail,
  sendAgencyActivationEmail,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  sendSignInMethodNoticeEmail,
  sendPasswordChangedEmail,
  sendTeamInviteEmail,
  sendGuardianConsentEmail,
  sendNewDeviceSignInEmail,
  sendCardDeclinedEmail,
  sendMaterialsRequestedEmail,
};
