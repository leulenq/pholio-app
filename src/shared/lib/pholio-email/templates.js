/**
 * Pholio Email — Templates.
 *
 * Each template assembles blocks from components.js into one email. Copy is
 * editorial and calm: a serif headline, a short human line, one clear action.
 * No exclamation-driven SaaS voice, no decorative chrome.
 *
 * These functions intentionally mirror the legacy module's names and argument
 * shapes so the new system is a drop-in replacement (email.js / routes unchanged).
 */

const {
  esc,
  heading,
  paragraph,
  signoff,
  goldRule,
  divider,
  button,
  codePanel,
  detailList,
  callout,
  personCard,
  note,
  renderEmail,
} = require("./components");
const { getEmailAppBaseUrl } = require("./urls");

const greet = (name) => (name ? `${esc(name)},` : "Hello,");
const appUrl = () => getEmailAppBaseUrl();

/* ── Onboarding ─────────────────────────────────────────────────────────── */

function buildWelcomeTalentEmailHtml({ firstName } = {}) {
  return renderEmail({
    subject: "Welcome to Pholio",
    previewText: "Your studio is open — let's build your portfolio.",
    blocks: [
      heading("Welcome to Pholio."),
      goldRule(),
      paragraph(
        `${greet(firstName)} your studio is open. Pholio is where your portfolio, comp card, and submissions live in one place — built to be sent, and ready when an agency is looking.`,
      ),
      paragraph(
        "Start by adding your first images and your measurements. The rest of your package builds from there.",
      ),
      button("Build your portfolio", `${appUrl()}/dashboard/talent`),
      signoff(),
    ],
  });
}

function buildWelcomeAgencyEmailHtml({ contactName, agencyName } = {}) {
  return renderEmail({
    subject: agencyName ? `Welcome to Pholio — ${agencyName}` : "Welcome to Pholio",
    previewText: "Your agency workspace is ready.",
    blocks: [
      heading("Welcome to Pholio."),
      goldRule(),
      paragraph(
        `${greet(contactName)} ${agencyName ? `<strong style="color:#1A1815;font-weight:600;">${esc(agencyName)}</strong> is` : "your agency is"} set up on Pholio. Your roster, inbound submissions, and casting all run from one workspace.`,
      ),
      button("Open your workspace", `${appUrl()}/dashboard/agency`),
      signoff(),
    ],
  });
}

/* ── Auth & security ────────────────────────────────────────────────────── */

function buildEmailVerificationHtml({
  firstName,
  verifyUrl,
  verificationCode,
  expiresMinutes,
} = {}) {
  return renderEmail({
    subject: "Confirm your email",
    previewText: "Confirm your email to finish setting up Pholio.",
    blocks: [
      heading("Confirm your email."),
      goldRule(),
      paragraph(
        `${greet(firstName)} enter this code in Pholio to confirm your address${verifyUrl ? ", or use the button below" : ""}.`,
      ),
      ...(verificationCode ? [codePanel(verificationCode, { caption: "Verification code" })] : []),
      ...(verifyUrl ? [button("Confirm email", verifyUrl)] : []),
      note(
        `This ${verificationCode ? "code" : "link"} expires in ${expiresMinutes || 30} minutes. If you didn't create a Pholio account, you can ignore this email.`,
      ),
      signoff(),
    ],
  });
}

function buildPasswordResetEmailHtml({ firstName, resetUrl, expiresMinutes } = {}) {
  return renderEmail({
    subject: "Reset your Pholio password",
    previewText: "Reset your Pholio password.",
    blocks: [
      heading("Reset your password."),
      goldRule(),
      paragraph(
        `${greet(firstName)} use the button below to set a new password for your Pholio account.`,
      ),
      button("Reset password", resetUrl),
      note(
        `This link expires in ${expiresMinutes || 60} minutes. If you didn't request a reset, no action is needed — your password stays the same.`,
      ),
      signoff(),
    ],
  });
}

function buildPasswordChangedEmailHtml({ firstName, changedAt, supportUrl } = {}) {
  return renderEmail({
    subject: "Your Pholio password was changed",
    previewText: "Your Pholio password was changed.",
    blocks: [
      heading("Your password was changed."),
      goldRule(),
      paragraph(`${greet(firstName)} the password on your Pholio account was just updated.`),
      detailList([
        { label: "Account", value: "Pholio" },
        { label: "Changed", value: changedAt || "Just now" },
      ]),
      note(
        `If this was you, you're all set. If it wasn't, ${
          supportUrl
            ? `<a href="${esc(supportUrl)}" target="_blank" rel="noopener" style="color:#A8894E;text-decoration:none;border-bottom:1px solid #EFE4CC;">contact us right away</a>`
            : "contact us right away"
        }.`,
      ),
      signoff(),
    ],
  });
}

function buildMagicSignInEmailHtml({ firstName, signInUrl, expiresMinutes } = {}) {
  return renderEmail({
    subject: "Your Pholio sign-in link",
    previewText: "Your sign-in link to Pholio.",
    blocks: [
      heading("Your sign-in link."),
      goldRule(),
      paragraph(`${greet(firstName)} use the button below to sign in to Pholio. No password needed.`),
      button("Sign in to Pholio", signInUrl),
      note(
        `This link expires in ${expiresMinutes || 15} minutes and can be used once. If you didn't request it, you can ignore this email.`,
      ),
      signoff(),
    ],
  });
}

/* ── Activity & notifications ───────────────────────────────────────────── */

function buildApplicationStatusEmailHtml({ talentName, agencyName, status } = {}) {
  const agency = agencyName || "An agency";
  const isAccepted = status === "accepted";
  return renderEmail({
    subject: isAccepted
      ? `Your application to ${agency} has been accepted`
      : `Application update from ${agency}`,
    previewText: isAccepted
      ? `${agency} accepted your submission.`
      : `An update on your submission to ${agency}.`,
    blocks: [
      heading(isAccepted ? "You've been accepted." : "An update on your submission."),
      goldRule(),
      paragraph(
        isAccepted
          ? `${greet(talentName)} <strong style="color:#1A1815;font-weight:600;">${esc(agency)}</strong> accepted your submission. Expect to hear from them directly — keep your book current in the meantime.`
          : `${greet(talentName)} <strong style="color:#1A1815;font-weight:600;">${esc(agency)}</strong> isn't moving forward this time. It's a common part of the process — keep your digitals fresh and your package ready for the next one.`,
      ),
      button(
        isAccepted ? "View in Pholio" : "View your submissions",
        `${appUrl()}/dashboard/talent/applications`,
      ),
      signoff(),
    ],
  });
}

function buildNewMessageEmailHtml({
  recipientName,
  senderName,
  messagePreview,
  replyUrl,
} = {}) {
  const sender = senderName || "Someone";
  return renderEmail({
    subject: `New message from ${sender}`,
    previewText: messagePreview ? `${sender}: ${messagePreview}` : `New message from ${sender}.`,
    blocks: [
      heading(`${sender} sent you a message.`),
      goldRule(),
      paragraph(`${greet(recipientName)} you have a new message in Pholio.`),
      ...(messagePreview ? [callout(esc(messagePreview), { label: sender })] : []),
      button("Reply in Pholio", replyUrl || `${appUrl()}/dashboard`),
      signoff(),
    ],
  });
}

function buildAgencyInviteEmailHtml({ talentName, agencyName } = {}) {
  const agency = agencyName || "An agency";
  return renderEmail({
    subject: `${agency} has invited you to apply on Pholio`,
    previewText: `${agency} invited you to apply.`,
    blocks: [
      heading(`${agency} invited you to apply.`),
      goldRule(),
      paragraph(
        `${greet(talentName)} <strong style="color:#1A1815;font-weight:600;">${esc(agency)}</strong> saw your profile and invited you to submit. Open Pholio to review the agency and send your package.`,
      ),
      button("Review the invitation", `${appUrl()}/dashboard/talent/applications`),
      signoff(),
    ],
  });
}

function buildTeamInviteEmailHtml({
  inviteeName,
  agencyName,
  inviterName,
  roleLabel,
  acceptUrl,
} = {}) {
  const agency = agencyName || "an agency";
  return renderEmail({
    subject: `You've been invited to ${agency} on Pholio`,
    previewText: `${inviterName || "A teammate"} invited you to ${agency}.`,
    blocks: [
      heading(`Join ${agency} on Pholio.`),
      goldRule(),
      paragraph(
        `${greet(inviteeName)} ${inviterName ? `<strong style="color:#1A1815;font-weight:600;">${esc(inviterName)}</strong> invited you` : "you've been invited"} to join the team on Pholio.`,
      ),
      detailList(
        [
          { label: "Agency", value: agency },
          ...(roleLabel ? [{ label: "Role", value: roleLabel }] : []),
        ].filter(Boolean),
      ),
      button("Accept invitation", acceptUrl),
      signoff(),
    ],
  });
}

/* ── Compliance ─────────────────────────────────────────────────────────── */

function buildGuardianConsentEmailHtml({
  guardianName,
  talentName,
  talentPhotoUrl,
  talentCity,
  agencyName,
  consentUrl,
  expiresDays = 7,
} = {}) {
  const talent = talentName || "a minor in your care";
  const agency = agencyName || null;
  const safeAgency = agency ? esc(agency) : null;
  return renderEmail({
    subject: agency
      ? `Consent requested for ${talent} to submit to ${agency}`
      : talentName
        ? `Consent requested for ${talentName} on Pholio`
        : "Guardian consent requested on Pholio",
    previewText: agency
      ? `Your authorization is requested for ${talent} to submit to ${agency}.`
      : `Your consent is requested for ${talent} on Pholio.`,
    blocks: [
      heading(
        agency
          ? `Authorization to submit to ${agency}.`
          : "A consent request for your review.",
      ),
      goldRule(),
      paragraph(
        agency
          ? `${greet(guardianName)} <strong style="color:#1A1815;font-weight:600;">${esc(talent)}</strong> would like to send a representation submission to <strong style="color:#1A1815;font-weight:600;">${safeAgency}</strong>. Because they're under 18, Pholio requires your authorization before any profile details, measurements, or images can be disclosed to this agency.`
          : `${greet(guardianName)} <strong style="color:#1A1815;font-weight:600;">${esc(talent)}</strong> would like to use Pholio to build a modeling portfolio. Because they're under 18, Pholio requires a parent or guardian's consent before any measurements, full-length photos, or public sharing can be enabled.`,
      ),
      personCard({
        name: talentName || "Pending talent",
        meta: talentCity || undefined,
        photoUrl: talentPhotoUrl || undefined,
      }),
      ...(agency
        ? [
            detailList([
              { label: "Agency", value: agency },
              {
                label: "Shared",
                value:
                  "Profile and contact details, measurements, digitals, selected portfolio images, comp card, and optional note or social links",
              },
            ]),
          ]
        : []),
      paragraph(
        agency
          ? `This authorization applies only to ${safeAgency}. A submission to another agency requires a separate guardian authorization. Nothing from this submission is sent to this agency until you confirm.`
          : "Review the request and decide what you're comfortable with. Nothing sensitive is shared or made public until you say so.",
      ),
      button(agency ? "Review & authorize" : "Review & respond", consentUrl),
      note(
        agency
          ? `This request expires in ${expiresDays} day${Number(expiresDays) === 1 ? "" : "s"}. If you weren't expecting it or do not authorize disclosure to ${safeAgency}, ignore this email and the submission will remain locked.`
          : `This request expires in ${expiresDays} day${Number(expiresDays) === 1 ? "" : "s"}. If you weren't expecting it, you can safely ignore this email and no profile will be activated.`,
      ),
      signoff(),
    ],
  });
}

module.exports = {
  buildWelcomeTalentEmailHtml,
  buildWelcomeAgencyEmailHtml,
  buildEmailVerificationHtml,
  buildPasswordResetEmailHtml,
  buildPasswordChangedEmailHtml,
  buildMagicSignInEmailHtml,
  buildApplicationStatusEmailHtml,
  buildNewMessageEmailHtml,
  buildAgencyInviteEmailHtml,
  buildTeamInviteEmailHtml,
  buildGuardianConsentEmailHtml,
};
