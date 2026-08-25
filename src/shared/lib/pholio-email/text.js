/**
 * Pholio Email — plain-text alternatives.
 *
 * Written by hand, one per template. They are NOT derived from the HTML: the
 * old `html.replace(/<[^>]*>/g,"")` stripped tags but kept the contents of
 * <style>, so every text/plain part opened with a wall of CSS. That is a live
 * spam signal, and it is what a watch preview and a screen reader fall back to.
 *
 * These read as real messages on their own — which is mostly a side effect of
 * the emails having few elements in the first place.
 */

const { getEmailAppBaseUrl, getMarketingSiteUrl } = require("./urls");

const app = () => getEmailAppBaseUrl();
const site = () => getMarketingSiteUrl();

/** Footer, matched to the HTML tier so the two versions cannot drift. */
function tail(tier, { reason, preference, extra } = {}) {
  const out = ["", "—", ""];
  if (reason) out.push(reason);
  if (tier === "secure") {
    out.push("Pholio will never ask for your password or a code by phone, message or reply.");
  }
  if (tier === "record" && preference) {
    out.push(`${preference.label}: ${preference.href}${preference.note ? ` (${preference.note})` : ""}`);
  }
  if (extra) out.push(`${extra.label}: ${extra.href}`);
  out.push(`support@pholio.studio · ${site()}/terms · ${site()}/privacy`);
  return out.join("\n");
}

const j = (...lines) => lines.filter((l) => l !== null && l !== undefined).join("\n");

/* ------------------------------------------------------------------ access */

const emailVerification = ({ firstName, verifyUrl, expiresMinutes }) =>
  j(
    "Confirm your email.",
    "",
    `${firstName ? `Hi ${firstName} — c` : "C"}onfirm this address and you can carry on setting up your account.`,
    "",
    verifyUrl,
    "",
    `Works once, expires in ${expiresMinutes || 30} minutes. Then head back to the tab you left open — it'll pick up on its own.`,
    "",
    "If you didn't start this, ignore it. Nothing happens until the link is used.",
    tail("secure", { reason: "Sent because this address was entered at pholio.studio." }),
  );

const passwordReset = ({ firstName, resetUrl, expiresMinutes, context }) =>
  j(
    "Reset your password.",
    "",
    `${firstName ? `Hi ${firstName} — s` : "S"}omeone asked to reset the password on this account.`,
    "",
    resetUrl,
    "",
    `Works once, expires in ${expiresMinutes || 60} minutes.`,
    context?.device ? `\nThe request\n  Device    ${context.device}\n  Location  ${context.location || "—"}\n  When      ${context.when || "—"}` : null,
    "",
    "Nothing's changed yet. If this wasn't you, ignore it — your current password still works.",
    tail("secure", { reason: "Sent because a password reset was requested for this address." }),
  );

const signInMethodNotice = ({ firstName, providerLabel }) =>
  j(
    `You sign in with ${providerLabel || "a connected account"}.`,
    "",
    `${firstName ? `Hi ${firstName} — s` : "S"}omeone asked to reset a password for this account, but there isn't one to reset.`,
    "",
    `${app()}/login`,
    "",
    "If that wasn't you, nothing's changed and there's nothing to do.",
    tail("secure", { reason: "Sent because a password reset was requested for this address." }),
  );

const passwordChanged = ({ firstName, changedAt }) =>
  j(
    "Your password was changed.",
    "",
    `${firstName ? `Hi ${firstName} — t` : "T"}he password on your Pholio account was changed${changedAt ? ` on ${changedAt}` : ""}.`,
    "",
    "If that was you, you're all set — nothing else to do.",
    "",
    "If it wasn't, someone else may be able to get in. Reset it again and sign out everywhere:",
    `${app()}/login`,
    tail("secure", { reason: "Sent because the password on this account was changed." }),
  );

const newDeviceSignIn = ({ firstName, device, location, when }) =>
  j(
    "New sign-in on a device we haven't seen.",
    "",
    `${firstName ? `Hi ${firstName}. ` : ""}Your account was signed in on a device Pholio doesn't recognise.`,
    "",
    `  Device    ${device || "Unknown device"}`,
    `  Location  ${location || "Location unavailable"}`,
    `  When      ${when || "Just now"}`,
    "",
    "If that was you, there's nothing to do.",
    "",
    "If it wasn't: open pholio.studio yourself — from your own bookmark, not from this email — then change your password and sign out of every other device.",
    tail("secure", { reason: "Sent because your account was signed in on a new device." }),
  );

/* ----------------------------------------------------------------- account */

const welcomeTalent = ({ firstName, nextStep, signInMethod, email }) =>
  j(
    `You're in${firstName ? `, ${firstName}` : ""}.`,
    "",
    "Your account's set up and your headshot is saved. From here, Pholio keeps your photos, measurements and card together, and formats them the way each agency asks for them.",
    "",
    "NEXT STEP",
    nextStep?.title || "A full-length digital.",
    nextStep?.why || "Agencies ask for one alongside the headshot.",
    nextStep?.impact || "It's the biggest gap in your profile right now.",
    "",
    nextStep?.href || `${app()}/dashboard/talent/media`,
    "",
    "Nothing's shared with anyone until you send it.",
    signInMethod || email ? `\nAccount\n${signInMethod ? `  Signed in with  ${signInMethod}\n` : ""}${email ? `  Email           ${email}` : ""}` : null,
    tail("record", {
      reason: "You're getting this because you created a Pholio account today.",
      preference: { label: "Email preferences", href: `${app()}/dashboard/talent/settings` },
    }),
  );

const cardDeclined = ({ reason, attempted, nextAttempt, pausesOn, amount }) =>
  j(
    reason?.kind === "stated" ? "Your card was declined." : "Your bank declined the payment.",
    "",
    reason?.kind === "stated"
      ? reason.sentence
      : "They didn't tell us why — banks usually don't. It's often a block on a first charge from a company they don't recognise, and one call to them clears it.",
    "",
    `  ${attempted?.date || ""}   Studio+ monthly · declined   ${amount || ""}`,
    `  ${nextAttempt?.date || ""}   Next attempt on this card   ${amount || ""}`,
    pausesOn ? `\n  Studio+ pauses: ${pausesOn.date}` : null,
    "",
    `Use a different card: ${app()}/dashboard/talent/settings`,
    "",
    "Your book, your photos and every card you've made stay exactly as they are. Pausing doesn't delete anything.",
    tail("secure", {
      reason: "You're getting this because a payment on your Pholio account failed. If the retry fails too, we'll write again.",
      extra: { label: "Billing", href: `${app()}/dashboard/talent/settings` },
    }),
  );

const trialEnding = ({ firstName, trialEndLabel, priceLabel, manageUrl }) => {
  const amount = priceLabel || "$9.99/month";
  const when = trialEndLabel || null;
  return j(
    when ? `Your trial ends ${when}.` : "Your Studio+ trial ends soon.",
    "",
    `${firstName ? `${firstName}, o` : "O"}n that date your card is charged ${amount}, and again each period until you cancel.`,
    "",
    `  Trial ends   ${when || "Soon"}`,
    `  Then         ${amount}`,
    "  Cancel in    Settings \u2192 Membership",
    "",
    "Cancelling before that date costs nothing. You keep Studio+ until the trial runs out, and the card is never charged.",
    "",
    `Open billing settings: ${manageUrl || `${app()}/dashboard/talent/settings/subscription`}`,
    "",
    "Everything you have made stays yours either way. Ending Studio+ does not delete your book, your photos or your cards.",
    tail("secure", {
      reason: "You're getting this because a paid trial on your account is about to convert. It's a billing notice, so it goes out regardless of your notification preferences.",
      extra: { label: "Billing", href: `${app()}/dashboard/talent/settings/subscription` },
    }),
  );
};

/* ------------------------------------------------------------- submissions */

const applicationStatus = ({ agencyName, status, board, staleDigitals, submittedOn, detail }) => {
  const agency = agencyName || "The agency";
  const copy = {
    kept_on_file: [`${agency} kept your book on file.`, "That's not a no.", `It means they'd consider you when a place opens${board ? ` on ${board}` : ""} — and when they look again, they'll see whatever's in your profile then, not what you sent before.`],
    shortlisted: [`${agency} shortlisted you.`, "You're through the first read.", `They've put you on a shorter list${board ? ` for ${board}` : ""} and will look again before deciding.`],
    development: [`${agency} wants to develop you.`, "This is a new-face offer, not a signing.", "It means they'd work with you before full representation. Read anything they send carefully, and take your time."],
    accepted: [`${agency} wants to sign you.`, "", "They'll contact you directly about next steps. Nothing's agreed until you've spoken to them and read whatever they send you.\n\nTake your time over the contract, and don't sign anything you don't understand. A real agency will wait."],
    represented: [`You're represented by ${agency}.`, "The agreement is complete.", "They'll be in touch about onboarding \u2014 your book with them, how they want to be reached, and what they need from you first.\n\nKeep your measurements and digitals current here too. Agencies check them more often than they ask for them."],
    declined: [`${agency} passed on your submission.`, "", "They don't give a reason, and there isn't one to read into it. Agencies pass on board space, market and timing far more often than on the work itself."],
  };
  const [head, rule, defaultBody] = copy[status] || copy.declined;
  // Same rule as the HTML: a stated reason replaces the "they don't give a
  // reason" body, it does not sit beside it.
  const body =
    detail && (status === "declined" || status === "passed")
      ? String(detail)
      : defaultBody;
  return j(
    head, "", rule || null, rule ? "" : null, body,
    staleDigitals ? `\nYour digitals are ${staleDigitals} days old. Most agencies want a set from the last three months.\n${app()}/dashboard/talent/media` : null,
    tail("record", {
      reason: `You're getting this because you sent your book to ${agency}${submittedOn ? ` on ${submittedOn}` : ""}.`,
      preference: { label: "Turn off submission updates", href: `${app()}/dashboard/talent/settings`, note: "messages from bookers still reach you" },
    }),
  );
};

const materialsRequested = ({ agencyName, items = [] }) => {
  const agency = agencyName || "The agency";
  return j(
    `${agency} asked for more.`,
    "",
    "They want another look before deciding. Here's what they've asked for:",
    "",
    ...items.map((i) => `  — ${i}`),
    "",
    `Send them: ${app()}/dashboard/talent/media`,
    "",
    "Agencies don't ask unless they're interested. Sooner beats perfect.",
    tail("record", {
      reason: `You're getting this because ${agency} asked for more from your submission.`,
      preference: { label: "Turn off submission updates", href: `${app()}/dashboard/talent/settings`, note: "messages from bookers still reach you" },
    }),
  );
};

const newMessage = ({ senderName, senderRole, agencyName, messagePreview, sentAt, replyUrl }) => {
  const sender = senderName || agencyName || "Pholio";
  return j(
    `${sender}${senderRole ? ` · ${senderRole}` : ""}${agencyName ? ` · ${agencyName}` : ""}${sentAt ? `\n${sentAt}` : ""}`,
    "",
    messagePreview || "Open the conversation to read it.",
    "",
    `Reply: ${replyUrl || `${app()}/dashboard/talent/messages`}`,
    "",
    `Your reply stays attached to your ${agencyName || "agency"} submission.`,
    tail("record", {
      reason: `Sent because ${sender} messaged you${agencyName ? ` about your ${agencyName} submission` : ""}.`,
      preference: { label: "Message settings", href: `${app()}/dashboard/talent/settings` },
    }),
  );
};

const agencyInvite = ({ talentName, agencyName, agencyCity, board, applyUrl }) => {
  const agency = agencyName || "An agency";
  return j(
    `${agency} asked to see your book.`,
    "",
    `${talentName ? `Hi ${String(talentName).split(" ")[0]} — ` : ""}${agency}${agencyCity ? `, a modelling agency in ${agencyCity},` : ""} has invited you to submit${board ? ` to their ${board} board` : ""}.`,
    "",
    "An invitation isn't an offer. It means a booker saw your profile and wants a proper look.",
    "",
    applyUrl || `${app()}/dashboard/talent/applications`,
    "",
    "Have a look at them before you send anything. A legitimate agency never asks you to pay to be represented.",
    tail("record", {
      reason: `You're getting this because ${agency} invited you through Pholio.`,
      preference: { label: "Turn off submission updates", href: `${app()}/dashboard/talent/settings`, note: "messages from bookers still reach you" },
    }),
  );
};

const guardianConsent = ({ guardianName, talentName, agencyName, consentUrl, expiresDays = 7 }) => {
  const talent = talentName || "a minor in your care";
  return j(
    agencyName ? "Review this submission first." : "Review this consent request.",
    "",
    agencyName
      ? `${guardianName ? `${guardianName},` : "Hello,"} ${talent} would like to send a representation submission to ${agencyName}. Because the talent is under 18, Pholio requires your authorization before profile details, measurements, images, or contact details are disclosed.`
      : `${guardianName ? `${guardianName},` : "Hello,"} ${talent} would like to use Pholio. Because the talent is under 18, Pholio requires guardian consent before measurements, full-length images, or public sharing are enabled.`,
    agencyName
      ? `\n  Agency      ${agencyName}\n  Disclosure  Profile details, measurements, digitals, selected portfolio images, comp card, contact details, and optional note or social links\n\nThis authorization applies only to ${agencyName}. A submission to another agency requires a separate guardian authorization.`
      : "\nNothing sensitive is shared or made public until you authorize it.",
    "",
    consentUrl,
    "",
    `This request expires in ${expiresDays} day${Number(expiresDays) === 1 ? "" : "s"}. If you were not expecting it, ignore this email and no disclosure will happen.`,
    tail("secure", { reason: "Sent because guardian authorization was requested on Pholio." }),
  );
};

module.exports = {
  emailVerification, passwordReset, signInMethodNotice, passwordChanged, newDeviceSignIn,
  welcomeTalent, cardDeclined, trialEnding,
  applicationStatus, materialsRequested, newMessage, agencyInvite, guardianConsent,
};
