/**
 * Email Service
 * Handles all email notifications for the platform
 */

const nodemailer = require("nodemailer");

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
 * Email Templates
 */
function getBaseTemplate(content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #8b5cf6; color: white; padding: 20px; text-align: center; }
    .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; }
    .button { display: inline-block; padding: 12px 24px; background: #8b5cf6; color: white; text-decoration: none; border-radius: 6px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Pholio</h1></div>
    <div class="content">${content}</div>
    <div class="footer"><p>© 2026 Pholio. All rights reserved.</p></div>
  </div>
</body>
</html>
  `;
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
      subject: `🎉 Your application to ${agencyName} has been accepted!`,
      message: `Congratulations! ${agencyName} has accepted your application.`,
    },
    declined: {
      subject: `Application update from ${agencyName}`,
      message: `${agencyName} has declined your application at this time.`,
    },
  };

  const { subject, message } = messages[status] || {
    subject: `Application update`,
    message: `Your application status has been updated.`,
  };

  const html = getBaseTemplate(
    `<h2>Hi ${talentName},</h2><p>${message}</p><p>Best regards,<br>The Pholio Team</p>`,
  );

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
}) {
  const subject = `💬 New message from ${senderName}`;
  const html = getBaseTemplate(
    `<h2>Hi ${recipientName},</h2><p>You have a new message from <strong>${senderName}</strong>:</p><blockquote style="border-left: 4px solid #8b5cf6; padding-left: 16px; margin: 20px 0; color: #6b7280;">${messagePreview}</blockquote><p>Best regards,<br>The Pholio Team</p>`,
  );
  return sendEmail({ to, subject, html });
}

/**
 * Agency Invite Notification (sent to talent when an agency invites them)
 */
async function sendAgencyInviteEmail({ talentEmail, talentName, agencyName }) {
  const subject = `${agencyName} has invited you to apply on Pholio`;
  const html = getBaseTemplate(`
    <h2>Hi ${talentName},</h2>
    <p><strong>${agencyName}</strong> has discovered your portfolio on Pholio and would like to work with you.</p>
    <p>Log in to your Pholio account to review the invitation and respond.</p>
    <p style="margin-top: 24px;">
      <a href="${process.env.APP_URL || "https://app.pholio.studio"}/dashboard/talent" class="button">View Invitation</a>
    </p>
    <p>Best regards,<br>The Pholio Team</p>
  `);
  return sendEmail({ to: talentEmail, subject, html });
}

module.exports = {
  sendEmail,
  sendApplicationStatusEmail,
  sendNewMessageEmail,
  sendAgencyInviteEmail,
};
