/**
 * Pholio Email — talent-facing templates.
 *
 * Cream vocabulary, drawn from the shipped talent dashboard. Each template
 * composes semantic blocks; there is no shared "content" skeleton, because a
 * security record, a financial statement and a booker's message are different
 * kinds of document and forcing them into one shape is what made the earlier
 * versions read as a template.
 *
 * Agency-facing templates deliberately remain on the older dark system in
 * ./templates-agency.js — that surface is out of scope for this pass.
 */

const { COLOR } = require("./tokens");
const { esc, space, hairline, row, shell, document_ } = require("./primitives");
const B = require("./blocks");
const { footer } = require("./footer");
const { getEmailAppBaseUrl } = require("./urls");

const app = () => getEmailAppBaseUrl();
const strong = (v) => `<strong style="color:${COLOR.ink};font-weight:600;">${esc(v)}</strong>`;

function render({ title, preheader, rows }) {
  return document_({ title, body: shell({ preheader, rows }) });
}

/* ============================================================ ACCESS */

function buildEmailVerificationHtml({ firstName, verifyUrl, expiresMinutes } = {}) {
  const mins = expiresMinutes || 30;
  return render({
    title: "Confirm your email",
    preheader: "One click and you're back where you left off.",
    rows: [
      space(44), B.wordmark(), space(44),
      B.statement("Confirm your email."),
      space(22),
      B.prose(`${firstName ? `Hi ${esc(firstName)} &mdash; c` : "C"}onfirm this address and you can carry on setting up your account.`, { size: 15.5 }),
      space(30),
      B.act("Confirm your email", verifyUrl || `${app()}/login`),
      space(13),
      B.actNote(`Works once &middot; expires in ${mins} minutes`),
      space(26),
      B.prose("Then head back to the tab you left open &mdash; it'll pick up on its own.", { size: 14 }),
      space(10),
      B.prose("If you didn't start this, ignore it. Nothing happens until the link is used.", { size: 14 }),
      footer("secure", { reason: "Sent because this address was entered at pholio.studio." }),
    ],
  });
}

function buildPasswordResetEmailHtml({ firstName, resetUrl, expiresMinutes, context } = {}) {
  const mins = expiresMinutes || 60;
  const rows = [
    space(44), B.wordmark(), space(44),
    B.statement("Reset your password."),
    space(22),
    B.prose(`${firstName ? `Hi ${esc(firstName)} &mdash; s` : "S"}omeone asked to reset the password on this account.`, { size: 15.5 }),
    space(30),
    B.act("Choose a new password", resetUrl || `${app()}/login`),
    space(13),
    B.actNote(`Works once &middot; expires in ${mins} minutes`),
  ];

  // Request context, when the caller can supply it. Absent today — the live
  // sender passes none — so the block simply does not render rather than
  // printing "Unknown" three times.
  const facts = [
    context?.device && { label: "Device", value: context.device },
    context?.location && { label: "Location", value: context.location },
    context?.when && { label: "When", value: context.when },
  ].filter(Boolean);

  if (facts.length) {
    rows.push(space(46), B.kicker("The request"), space(12), B.sweep(), B.record(facts));
  }

  rows.push(
    space(26),
    B.advisory("Nothing's changed yet. If this wasn't you, ignore it &mdash; your current password still works."),
    footer("secure", { reason: "Sent because a password reset was requested for this address." }),
  );

  return render({ title: "Reset your password", preheader: "The link works once and expires in an hour.", rows });
}

function buildSignInMethodNoticeEmailHtml({ firstName, providerLabel } = {}) {
  const provider = providerLabel || "a connected account";
  return render({
    title: "How to sign in",
    preheader: `There's no password on this account to reset.`,
    rows: [
      space(44), B.wordmark(), space(44),
      B.statement(`You sign in with ${esc(provider)}.`),
      space(22),
      B.prose(`${firstName ? `Hi ${esc(firstName)} &mdash; s` : "S"}omeone asked to reset a password for this account, but there isn't one to reset.`, { size: 15.5 }),
      space(30),
      B.act(`Sign in with ${provider}`, `${app()}/login`),
      space(26),
      B.prose("If that wasn't you, nothing's changed and there's nothing to do.", { size: 14 }),
      footer("secure", { reason: "Sent because a password reset was requested for this address." }),
    ],
  });
}

function buildPasswordChangedEmailHtml({ firstName, changedAt, supportUrl } = {}) {
  return render({
    title: "Your password was changed",
    preheader: "If that was you, there's nothing to do.",
    rows: [
      space(44), B.wordmark(), space(44),
      B.statement("Your password was changed."),
      space(22),
      B.prose(`${firstName ? `Hi ${esc(firstName)} &mdash; t` : "T"}he password on your Pholio account was changed${changedAt ? ` on ${esc(changedAt)}` : ""}.`, { size: 15.5 }),
      space(20),
      B.prose("If that was you, you're all set &mdash; nothing else to do.", { size: 14 }),
      space(26),
      B.advisory("If it wasn't, someone else may be able to get in. Reset it again and sign out everywhere.", { tone: "attention" }),
      space(24),
      B.act("Secure your account", supportUrl && supportUrl.startsWith("http") ? supportUrl : `${app()}/login`),
      footer("secure", { reason: "Sent because the password on this account was changed." }),
    ],
  });
}

function buildNewDeviceSignInHtml({ firstName, device, location, when } = {}) {
  return render({
    title: "New sign-in",
    preheader: `${device || "A new device"} &middot; ${when || "just now"}. Was that you?`,
    rows: [
      space(44), B.wordmark(), space(44),
      B.statement("New sign-in on a device we haven't seen."),
      space(22),
      B.prose(`${firstName ? `Hi ${esc(firstName)}. ` : ""}Your account was signed in on a device Pholio doesn't recognise.`, { size: 15.5 }),
      space(32),
      B.kicker("The sign-in"), space(12), B.sweep(),
      B.record([
        { label: "Device", value: device || "Unknown device" },
        { label: "Location", value: location || "Location unavailable" },
        { label: "When", value: when || "Just now" },
      ]),
      space(26),
      B.prose("If that was you, there's nothing to do.", { size: 14 }),
      space(12),
      // No button, deliberately: the standard security-alert pattern tells the
      // recipient to navigate manually rather than training them to click links
      // in alarming mail. Talent are a documented phishing target.
      B.advisory("If it wasn't: open pholio.studio yourself &mdash; from your own bookmark, not from this email &mdash; then change your password and sign out of every other device.", { tone: "attention" }),
      footer("secure", { reason: "Sent because your account was signed in on a new device." }),
    ],
  });
}

/* ============================================================ ACCOUNT */

function buildWelcomeTalentEmailHtml({ firstName, nextStep, signInMethod, email } = {}) {
  const step = nextStep || {
    title: "A full-length digital.",
    why: "Agencies ask for one alongside the headshot.",
    impact: "It's the biggest gap in your profile right now.",
    label: "Add a full-length",
    href: `${app()}/dashboard/talent/media`,
  };

  const facts = [
    signInMethod && { label: "Signed in with", value: signInMethod, caps: true },
    email && { label: "Email", value: email },
  ].filter(Boolean);

  const rows = [
    space(44), B.wordmark(), space(52),
    B.statement(`You're in${firstName ? `, ${esc(firstName)}` : ""}.`, { size: 34 }),
    space(22),
    B.lede("Your account's set up and your headshot is saved."),
    space(10),
    B.prose("From here, Pholio keeps your photos, measurements and card together, and formats them the way each agency asks for them."),
    space(46),
    B.sweep(), space(18),
    B.kicker("Next step"), space(14),
    B.subStatement(esc(step.title)), space(12),
    B.prose(esc(step.why)), space(8),
    B.advisory(esc(step.impact)), space(30),
    B.act(step.label, step.href), space(22),
    B.lede("Nothing's shared with anyone until you send it."),
  ];

  if (facts.length) {
    rows.push(space(48), hairline(COLOR.ruleStrong), space(26),
      row(`<div style="font-family:'SF Mono',Consolas,'Courier New',monospace;font-size:10px;line-height:14px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:${COLOR.body};">Account</div>`),
      space(10), B.factList(facts));
  }

  rows.push(footer("record", {
    reason: "You're getting this because you created a Pholio account today.",
    preference: { label: "Email preferences", href: `${app()}/dashboard/talent/settings` },
  }));

  return render({ title: "You're in", preheader: "Your account's ready. One thing left to do.", rows });
}

/* ============================================================ BILLING */

/**
 * Card declined. `reason` is derived from Stripe's decline_code by the caller:
 *   "stated"  — safe to name (expired_card, insufficient_funds, incorrect_cvc)
 *   "opaque"  — generic_decline / do_not_honor, and also what we show for the
 *               fraud codes, which must never be surfaced to the cardholder.
 * No gold anywhere in this email; the absence is the tone.
 */
function buildCardDeclinedEmailHtml({ reason, attempted, nextAttempt, pausesOn, amount } = {}) {
  const opaque = !reason || reason.kind !== "stated";
  const headline = opaque ? "Your bank declined the payment." : "Your card was declined.";
  const explain = opaque
    ? "They didn't tell us why &mdash; banks usually don't. It's often a block on a first charge from a company they don't recognise, and one call to them clears it."
    : esc(reason.sentence);

  return render({
    title: "Your card was declined",
    preheader: `We'll try again ${esc(nextAttempt?.day || "shortly")}. Nothing's lost meanwhile.`,
    rows: [
      space(44), B.wordmark({ tone: "ink" }), space(20), hairline(), space(38),
      B.statement(headline, { size: 27 }),
      space(16),
      B.prose(explain, { size: 15 }),
      space(36),
      B.statement_ledger({
        lines: [
          { date: attempted?.date || "", description: "Studio+ monthly", note: "declined", amount: amount || "", settled: true },
          { date: nextAttempt?.date || "", description: `Next attempt on this card${nextAttempt?.day ? ` &mdash; ${esc(nextAttempt.day)}` : ""}`, amount: amount || "" },
        ],
        bottom: pausesOn && {
          label: `Studio+ pauses${pausesOn.day ? ` &middot; ${pausesOn.day}` : ""}`,
          value: pausesOn.date,
          note: nextAttempt?.date ? `Nothing changes if the ${nextAttempt.date} attempt goes through.` : undefined,
        },
      }),
      space(34),
      B.act("Use a different card", `${app()}/dashboard/talent/settings`),
      space(34), hairline(), space(20),
      B.prose("Your book, your photos and every card you've made stay exactly as they are. Pausing doesn't delete anything.", { size: 14 }),
      footer("secure", {
        reason: "You're getting this because a payment on your Pholio account failed. If the retry fails too, we'll write again.",
        extra: { label: "Billing", href: `${app()}/dashboard/talent/settings` },
      }),
    ],
  });
}

/**
 * The pre-charge notice for a Studio+ trial about to convert.
 *
 * A compliance document, not marketing. ROSCA (15 U.S.C. §8403) and the FTC's
 * negative-option rule expect a clear statement, before the first charge, of
 * WHEN it lands, HOW MUCH it is and HOW to stop it. So those three facts lead
 * and sit in a fact list — reference data the reader scans for correctness —
 * rather than being narrated. No countdown, no benefit re-sell, no "don't miss
 * out". Ink wordmark, no gold: money is not a celebration.
 */
function buildTrialEndingEmailHtml({ firstName, trialEndLabel, priceLabel, manageUrl } = {}) {
  const amount = priceLabel || "$9.99/month";
  const when = trialEndLabel || null;

  return render({
    title: "Your Studio+ trial ends soon",
    preheader: `${when ? `Ends ${esc(when)}` : "Ending soon"} \u2014 then ${esc(amount)}. Cancel any time before then.`,
    rows: [
      space(44), B.wordmark({ tone: "ink" }), space(20), hairline(), space(38),
      B.statement(when ? `Your trial ends ${esc(when)}.` : "Your Studio+ trial ends soon.", { size: 27 }),
      space(18),
      B.lede(`${firstName ? `${esc(firstName)}, o` : "O"}n that date your card is charged ${strong(amount)}, and again each period until you cancel.`),
      space(32),
      B.factList([
        { label: "Trial ends", value: when || "Soon" },
        { label: "Then", value: amount },
        { label: "Cancel in", value: "Settings \u2192 Membership" },
      ]),
      space(30),
      B.prose("Cancelling before that date costs nothing. You keep Studio+ until the trial runs out, and the card is never charged.", { size: 15 }),
      space(32),
      B.act("Open billing settings", manageUrl || `${app()}/dashboard/talent/settings/subscription`),
      space(34), hairline(), space(20),
      B.prose("Everything you have made stays yours either way. Ending Studio+ does not delete your book, your photos or your cards.", { size: 14 }),
      footer("secure", {
        reason: "You're getting this because a paid trial on your account is about to convert. It's a billing notice, so it goes out regardless of your notification preferences.",
        extra: { label: "Billing", href: `${app()}/dashboard/talent/settings/subscription` },
      }),
    ],
  });
}

module.exports = {
  buildEmailVerificationHtml,
  buildPasswordResetEmailHtml,
  buildSignInMethodNoticeEmailHtml,
  buildPasswordChangedEmailHtml,
  buildNewDeviceSignInHtml,
  buildWelcomeTalentEmailHtml,
  buildCardDeclinedEmailHtml,
  buildTrialEndingEmailHtml,
};
