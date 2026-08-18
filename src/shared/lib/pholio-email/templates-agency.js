/**
 * Pholio Email — agency-facing templates.
 *
 * Deliberately left on the older dark composition. The talent email system was
 * rebuilt on the cream dashboard vocabulary; the agency surface is a separate
 * design system and was explicitly out of scope for that pass. Do not migrate
 * these by halves — port the agency family as its own piece of work, against
 * client/src/domains/agency/DESIGN.md, or leave them alone.
 */

const { esc, heading, paragraph, signoff, goldRule, button, detailList, note, renderEmail } = require("./components");
const { getEmailAppBaseUrl } = require("./urls");

const appUrl = () => getEmailAppBaseUrl();
const greet = (name) => (name ? `${esc(name)},` : "Hello,");
const strong = (value) => `<strong style="color:#F5F1EA;font-weight:650;">${esc(value)}</strong>`;

function buildWelcomeAgencyEmailHtml({ contactName, agencyName } = {}) {
  return renderEmail({
    previewText: "Your Pholio agency workspace is ready.",
    blocks: [
      heading("Your board is ready."),
      goldRule(),
      paragraph(`${greet(contactName)} ${agencyName ? `${strong(agencyName)} now has` : "your agency now has"} a workspace for submissions, roster review, messaging, and casting work.`),
      button("Open agency workspace", `${appUrl()}/dashboard/agency`),
      signoff(),
    ],
  });
}

function buildAgencyActivationEmailHtml({ contactName, agencyName, activationUrl, expiresMinutes } = {}) {
  return renderEmail({
    previewText: `${agencyName || "Your agency"} has been approved for Pholio.`,
    blocks: [
      heading("Your access is granted."),
      goldRule(),
      paragraph(`${greet(contactName)} ${agencyName ? strong(agencyName) : "your agency"} has been reviewed and accepted into Pholio.`),
      paragraph("Set a password to open the workspace. You will then confirm the details we hold on file, choose your boards, and decide how your roster arrives — most of it is confirmation rather than new information."),
      button("Set your password", activationUrl),
      note(`This link expires in ${expiresMinutes || 60} minutes and can be used once. If it has lapsed, request a new one from the sign-in page or reply to this email.`),
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

module.exports = {
  buildWelcomeAgencyEmailHtml,
  buildAgencyActivationEmailHtml,
  buildTeamInviteEmailHtml,
};
