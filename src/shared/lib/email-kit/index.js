/**
 * Pholio Email Framework — Public API
 * ------------------------------------------------------------------
 * import { theme, kit, renderEmail, templates } from "shared/lib/email-kit"
 *
 *   theme       → design tokens (single source of truth)
 *   kit         → composable components (heading, button, quote, …)
 *   renderEmail → bulletproof document shell
 *   templates   → reference compositions built on the kit
 *
 * Authoring a new email is three lines:
 *
 *   const { renderEmail, kit } = require("shared/lib/email-kit");
 *   const content = kit.heading("…") + kit.spacer(16) + kit.text("…")
 *                 + kit.spacer(28) + kit.button(url, "Open Pholio");
 *   const html = renderEmail({ title, preheader, content });
 *
 * These references deliberately avoid every banned UI pattern
 * (no eyebrow/kicker, no Live/Beta badge, no corner chips).
 */

const { theme, appBaseUrl } = require("./theme");
const kit = require("./components");
const { renderEmail } = require("./shell");

const { spacer } = kit;

/* ================================================================ *
 * Reference template: Welcome (talent)
 * ================================================================ */

function welcomeTalent({ firstName } = {}) {
  const app = appBaseUrl();
  const name = kit.escapeHtml(firstName || "there");

  const content =
    kit.hero({
      title: `Welcome, ${name}`,
      subtitle:
        "Your editorial workspace is live — build a portfolio agencies actually want to open.",
    }) +
    `<div class="ph-pad" style="padding:36px 44px 40px;">` +
    kit.lead(
      "Pholio is built for the moment before the room: when your book needs to feel intentional and your first impression should land like a casting folder, not a feed.",
    ) +
    spacer(28) +
    kit.statRow([
      { value: "PDF", label: "Comp cards" },
      { value: "AI", label: "Photo curation" },
      { value: "1:1", label: "Agency apply" },
    ]) +
    spacer(30) +
    kit.featureList([
      {
        icon: "&#9670;",
        title: "Editorial portfolio",
        description:
          "Curate hero shots, set order, and keep your book presentation-ready.",
      },
      {
        icon: "&#9635;",
        title: "Comp card PDF",
        description:
          "Export a print-ready comp card with your measurements and best frames.",
      },
      {
        icon: "&rarr;",
        title: "Agency applications",
        description:
          "Apply with context — agencies see your full submission, not a DM thread.",
      },
    ]) +
    spacer(32) +
    kit.button(`${app}/dashboard/talent`, "Open your dashboard", {
      width: 240,
    }) +
    spacer(16) +
    kit.textCta(`${app}/dashboard/talent/profile`, "Start with your profile") +
    spacer(28) +
    kit.callout(
      `Questions while you set up? Just reply to this email — we're here for your first book.`,
      { title: "Concierge" },
    ) +
    `</div>`;

  return renderEmail({
    title: "Welcome to Pholio",
    preheader: "Your talent portfolio starts here.",
    content,
    padded: false,
    footerLinks: [
      {
        href: `${app}/dashboard/talent/settings`,
        label: "Notification preferences",
      },
    ],
  });
}

/* ================================================================ *
 * Reference template: Email verification
 * ================================================================ */

function verifyEmail({ firstName, verifyUrl, code, expiresMinutes = 30 } = {}) {
  const content =
    kit.heading("Confirm your email") +
    spacer(12) +
    kit.text(
      `Hi ${kit.strong(kit.escapeHtml(firstName || "there"))} — confirm this address to secure your account and start receiving application updates.`,
    ) +
    spacer(28) +
    kit.button(verifyUrl, "Verify email address", { width: 232 }) +
    (code ? spacer(24) + kit.codeBlock(code) : "") +
    spacer(20) +
    kit.fallbackLink(verifyUrl) +
    spacer(20) +
    kit.text(
      `This link expires in ${expiresMinutes} minutes. If you didn't create a Pholio account, you can safely ignore this email.`,
      { color: theme.faint, size: 13 },
    );

  return renderEmail({
    title: "Verify your email",
    preheader: "Confirm your email to activate your Pholio account.",
    content,
  });
}

/* ================================================================ *
 * Reference template: New message (agency → talent, magic reply)
 * ================================================================ */

function newMessage({ recipientName, senderName, messagePreview, replyUrl }) {
  const app = appBaseUrl();
  const sender = kit.strong(kit.escapeHtml(senderName || "An agency"));
  const href = replyUrl || `${app}/login`;

  const content =
    kit.heading(`A message from ${kit.escapeHtml(senderName || "an agency")}`, {
      size: 26,
    }) +
    spacer(14) +
    kit.text(`Hi ${kit.escapeHtml(recipientName || "there")}, ${sender} just reached out.`) +
    spacer(22) +
    kit.quote(kit.escapeHtml(messagePreview || "")) +
    spacer(28) +
    kit.button(href, replyUrl ? "Reply on Pholio" : "View on Pholio", {
      width: 220,
    }) +
    (replyUrl
      ? spacer(14) +
        kit.text("One tap to reply — no password needed. Expires in 7 days.", {
          color: theme.faint,
          size: 13,
        })
      : "") +
    kit.divider({ space: 28 }) +
    kit.text(`Sent via Pholio on behalf of ${kit.escapeHtml(senderName || "the agency")}.`, {
      color: theme.faint,
      size: 13,
    });

  return renderEmail({
    title: `New message from ${senderName || "an agency"}`,
    preheader: `${senderName}: "${(messagePreview || "").slice(0, 80)}"`,
    content,
  });
}

module.exports = {
  theme,
  appBaseUrl,
  kit,
  renderEmail,
  templates: { welcomeTalent, verifyEmail, newMessage },
};
