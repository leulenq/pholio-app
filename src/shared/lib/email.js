/**
 * Email Service
 * Handles all email notifications for the platform
 */

const nodemailer = require("nodemailer");
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
} = require("./email-templates");

// Create transporter (development mode - logs to console)
const transporter = {
  sendMail: async (mailOptions) => {
    console.log("[Email] Would send:", {
      to: mailOptions.to,
      subject: mailOptions.subject,
      text: mailOptions.text?.substring(0, 200) + "...",
    });
    return { messageId: "dev-" + Date.now() };
  },
};

/**
 * Send email
 */
async function sendEmail({ to, subject, html, text }) {
  try {
    const mailOptions = {
      from: "Pholio <noreply@pholio.studio>",
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ""),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("[Email] Sent:", info.messageId, "to", to);
    return info;
  } catch (error) {
    console.error("[Email] Error sending email:", error);
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
      subject: `Your application to ${agencyName} has been accepted`,
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
};
