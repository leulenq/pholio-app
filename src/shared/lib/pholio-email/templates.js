const { esc, heading, paragraph, signoff, goldRule, button, codePanel, detailList, callout, personCard, note, renderEmail } = require("./components");
const { getEmailAppBaseUrl } = require("./urls");

const appUrl = () => getEmailAppBaseUrl();
const greet = (name) => (name ? `${esc(name)},` : "Hello,");
const strong = (value) => `<strong style="color:#F5F1EA;font-weight:650;">${esc(value)}</strong>`;

function buildWelcomeTalentEmailHtml({ firstName } = {}) {
  return renderEmail({
    previewText: "Your Pholio workspace is ready.",
    blocks: [
      heading("Your studio is open."),
      goldRule(),
      paragraph(`${greet(firstName)} Pholio is ready for your book, digitals, measurements, comp card, and agency submissions.`),
      paragraph("Start with the pieces an agency can actually judge: current digitals, accurate measurements, and a focused portfolio edit."),
      button("Open your studio", `${appUrl()}/dashboard/talent`),
      signoff(),
    ],
  });
}

function buildWelcomeAgencyEmailHtml({ contactName, agencyName } = {}) {
  return renderEmail({
    previewText: "Your Pholio agency workspace is ready.",
    blocks: [
      heading("Your board is ready."),
      goldRule(),
      paragraph(`${greet(contactName)} ${agencyName ? `${strong(agencyName)} now has` : "your agency now has"} a workspace for submissions, messaging, discovery, and casting work.`),
      button("Open agency workspace", `${appUrl()}/dashboard/agency`),
      signoff(),
    ],
  });
}

/**
 * The first email an approved agency receives.
 *
 * This is an activation, not a password reset: the account was created during
 * review with a password that was never disclosed, so this link is how the
 * owner sets a real one for the first time. It must read as access granted.
 */
function buildAgencyActivationEmailHtml({ contactName, agencyName, activationUrl, expiresMinutes } = {}) {
  return renderEmail({
    previewText: `${agencyName || "Your agency"} has been approved for Pholio.`,
    blocks: [
      heading("Your access is granted."),
      goldRule(),
      paragraph(`${greet(contactName)} ${agencyName ? strong(agencyName) : "your agency"} has been reviewed and accepted into Pholio.`),
      paragraph("Set a password to open the workspace. You will then confirm the details we hold on file, choose your boards, configure intake, and invite your team — most of it is confirmation rather than new information."),
      button("Set your password", activationUrl),
      note(`This link expires in ${expiresMinutes || 60} minutes and can be used once. If it has lapsed, request a new one from the sign-in page or reply to this email.`),
      signoff(),
    ],
  });
}

function buildEmailVerificationHtml({ firstName, verifyUrl, verificationCode, expiresMinutes } = {}) {
  return renderEmail({
    previewText: "Confirm your email to continue your Pholio screen test.",
    blocks: [
      heading("Confirm your email."),
      goldRule(),
      paragraph(`${greet(firstName)} confirm this address so Pholio can protect your account and keep agency communication tied to the right inbox.`),
      ...(verificationCode ? [codePanel(verificationCode, { caption: "Verification code" })] : []),
      ...(verifyUrl ? [button("Confirm email", verifyUrl)] : []),
      note(`This ${verificationCode ? "code" : "link"} expires in ${expiresMinutes || 30} minutes. If you did not create a Pholio account, ignore this email.`),
      signoff(),
    ],
  });
}

function buildPasswordResetEmailHtml({ firstName, resetUrl, expiresMinutes } = {}) {
  return renderEmail({
    previewText: "Reset your Pholio password.",
    blocks: [
      heading("Reset your password."),
      goldRule(),
      paragraph(`${greet(firstName)} use the secure link below to set a new password for your Pholio account.`),
      button("Reset password", resetUrl),
      note(`This link expires in ${expiresMinutes || 60} minutes. If you did not request it, no action is needed and your current password remains active.`),
      signoff(),
    ],
  });
}

/**
 * Sent instead of a password-reset link when the account has no password to
 * reset — it signed in through Google, Instagram, or another provider only.
 * Firebase's own reset-link generation refuses accounts with no `password`
 * entry in `providerData`, so the caller must branch before ever asking
 * Firebase for a link. See `services/email-verification.js`.
 */
function buildSignInMethodNoticeEmailHtml({ firstName, providerLabel } = {}) {
  const provider = providerLabel || "a connected account";
  return renderEmail({
    previewText: `Your Pholio account signs in with ${provider}, not a password.`,
    blocks: [
      heading("You already have a way in."),
      goldRule(),
      paragraph(`${greet(firstName)} this Pholio account signs in with ${strong(provider)} — it has no password to reset.`),
      paragraph(`Use "Continue with ${esc(provider)}" on the sign-in page to get back in.`),
      button("Go to sign in", `${appUrl()}/login`),
      note("If you did not request this, no action is needed — your account is unaffected."),
      signoff(),
    ],
  });
}

function buildPasswordChangedEmailHtml({ firstName, changedAt, supportUrl } = {}) {
  return renderEmail({
    previewText: "Your Pholio password was changed.",
    blocks: [
      heading("Your password changed."),
      goldRule(),
      paragraph(`${greet(firstName)} the password on your Pholio account was updated.`),
      detailList([{ label: "Changed", value: changedAt || "Just now" }]),
      note(`If this was not you, ${supportUrl ? `<a href="${esc(supportUrl)}" style="color:#C9A55A;text-decoration:none;border-bottom:1px solid #3A3023;">contact Pholio support</a>` : "contact Pholio support"} immediately.`, { tone: "danger" }),
      signoff(),
    ],
  });
}

function buildMagicSignInEmailHtml({ firstName, signInUrl, expiresMinutes } = {}) {
  return renderEmail({
    previewText: "Use this secure link to sign in to Pholio.",
    blocks: [
      heading("Your sign-in link."),
      goldRule(),
      paragraph(`${greet(firstName)} this link signs you in to Pholio once.`),
      button("Sign in", signInUrl),
      note(`This link expires in ${expiresMinutes || 15} minutes. If you did not request it, ignore this email.`),
      signoff(),
    ],
  });
}

function buildApplicationStatusEmailHtml({ talentName, agencyName, status } = {}) {
  const agency = agencyName || "the agency";
  const accepted = status === "accepted";
  return renderEmail({
    previewText: accepted ? `${agency} wants to move forward with representation.` : `${agency} sent an update on your submission.`,
    blocks: [
      heading(accepted ? "The agency wants to move forward." : "A decision on your submission."),
      goldRule(),
      paragraph(accepted ? `${greet(talentName)} ${strong(agency)} would like to move forward with representation and will follow up with next steps. Keep your book and measurements current in the meantime.` : `${greet(talentName)} ${strong(agency)} is not moving forward this time. That is a normal part of representation submissions — keep your digitals current and your package ready for the next review.`),
      button("View submissions", `${appUrl()}/dashboard/talent/applications`),
      signoff(),
    ],
  });
}

function buildNewMessageEmailHtml({ recipientName, senderName, messagePreview, replyUrl } = {}) {
  const sender = senderName || "Pholio";
  return renderEmail({
    previewText: messagePreview ? `${sender}: ${messagePreview}` : `New message from ${sender}.`,
    blocks: [
      heading("A message is waiting."),
      goldRule(),
      paragraph(`${greet(recipientName)} ${strong(sender)} sent you a message in Pholio.`),
      ...(messagePreview ? [callout(esc(messagePreview), { label: sender })] : []),
      button("Reply in Pholio", replyUrl || `${appUrl()}/dashboard/talent/applications`),
      signoff(),
    ],
  });
}

function buildAgencyInviteEmailHtml({ talentName, agencyName } = {}) {
  const agency = agencyName || "An agency";
  return renderEmail({
    previewText: `${agency} invited you to submit on Pholio.`,
    blocks: [
      heading("An agency wants to see your package."),
      goldRule(),
      paragraph(`${greet(talentName)} ${strong(agency)} invited you to send a representation submission through Pholio.`),
      paragraph("Review the agency before you submit. Your submission should be current: digitals, measurements, selected portfolio images, and your comp card."),
      button("Review invitation", `${appUrl()}/dashboard/talent/applications`),
      signoff(),
    ],
  });
}

function buildTeamInviteEmailHtml({ inviteeName, agencyName, inviterName, roleLabel, acceptUrl } = {}) {
  const agency = agencyName || "an agency";
  return renderEmail({
    previewText: `${inviterName || "A teammate"} invited you to ${agency} on Pholio.`,
    blocks: [
      heading("Join the agency workspace."),
      goldRule(),
      paragraph(`${greet(inviteeName)} ${inviterName ? strong(inviterName) : "A teammate"} invited you to work inside ${strong(agency)} on Pholio.`),
      detailList([{ label: "Agency", value: agency }, ...(roleLabel ? [{ label: "Role", value: roleLabel }] : [])]),
      button("Accept invitation", acceptUrl),
      signoff(),
    ],
  });
}

function buildGuardianConsentEmailHtml({ guardianName, talentName, talentPhotoUrl, talentCity, agencyName, consentUrl, expiresDays = 7 } = {}) {
  const talent = talentName || "a minor in your care";
  return renderEmail({
    previewText: agencyName ? `Authorization is requested before ${talent} submits to ${agencyName}.` : `Guardian consent is requested for ${talent} on Pholio.`,
    blocks: [
      heading(agencyName ? "Review this submission first." : "Review this consent request."),
      goldRule(),
      paragraph(agencyName ? `${greet(guardianName)} ${strong(talent)} would like to send a representation submission to ${strong(agencyName)}. Because the talent is under 18, Pholio requires your authorization before profile details, measurements, images, or contact details are disclosed.` : `${greet(guardianName)} ${strong(talent)} would like to use Pholio. Because the talent is under 18, Pholio requires guardian consent before measurements, full-length images, or public sharing are enabled.`),
      personCard({ name: talentName || "Pending talent", meta: talentCity, photoUrl: talentPhotoUrl }),
      ...(agencyName ? [detailList([{ label: "Agency", value: agencyName }, { label: "Disclosure", value: "Profile details, measurements, digitals, selected portfolio images, comp card, contact details, and optional note or social links" }])] : []),
      paragraph(agencyName ? `This authorization applies only to ${strong(agencyName)}. A submission to another agency requires a separate guardian authorization.` : "Nothing sensitive is shared or made public until you authorize it."),
      button(agencyName ? "Review authorization" : "Review request", consentUrl),
      note(`This request expires in ${expiresDays} day${Number(expiresDays) === 1 ? "" : "s"}. If you were not expecting it, ignore this email and no disclosure will happen.`),
      signoff(),
    ],
  });
}

module.exports = { buildWelcomeTalentEmailHtml, buildWelcomeAgencyEmailHtml, buildAgencyActivationEmailHtml, buildEmailVerificationHtml, buildPasswordResetEmailHtml, buildSignInMethodNoticeEmailHtml, buildPasswordChangedEmailHtml, buildMagicSignInEmailHtml, buildApplicationStatusEmailHtml, buildNewMessageEmailHtml, buildAgencyInviteEmailHtml, buildTeamInviteEmailHtml, buildGuardianConsentEmailHtml };
