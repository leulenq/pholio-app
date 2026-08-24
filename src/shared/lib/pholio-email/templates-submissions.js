/**
 * Pholio Email — submission and correspondence templates.
 *
 * The agency speaks first in this family: no wordmark at the top, Pholio signs
 * at the foot. These are also the emails where a verdict must never be
 * tabulated — a decision is a sentence, and a rejection rendered as a data
 * readout reads like a coroner's report.
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

const submissionPref = {
  label: "Turn off submission updates",
  href: `${app()}/dashboard/talent/settings`,
  note: "messages from bookers still reach you",
};

/* ------------------------------------------------------------- decisions */

/**
 * One template, branched by status. Copy per state comes from the industry
 * reading, not a generic "your application was updated": kept_on_file and
 * shortlisted are soft yeses and must never read as rejections.
 */
const DECISIONS = {
  kept_on_file: {
    subject: (a) => `${a} kept your book on file`,
    preheader: "Not a no. Here's what it actually means.",
    headline: (a) => `${esc(a)} kept your book on file.`,
    rule: "That's not a no.",
    body: (a, board) =>
      `It means they'd consider you when a place opens${board ? ` on ${esc(board)}` : ""} &mdash; and when they look again, they'll see whatever's in your profile then, not what you sent before.`,
    standing: "Kept on file",
  },
  shortlisted: {
    headline: (a) => `${esc(a)} shortlisted you.`,
    rule: "You're through the first read.",
    body: (a, board) => `They've put you on a shorter list${board ? ` for ${esc(board)}` : ""} and will look again before deciding.`,
    standing: "Shortlisted",
  },
  development: {
    headline: (a) => `${esc(a)} wants to develop you.`,
    rule: "This is a new-face offer, not a signing.",
    body: () => "It means they'd work with you before full representation. Read anything they send carefully, and take your time.",
    standing: "Development",
  },
  accepted: {
    headline: (a) => `${esc(a)} wants to sign you.`,
    rule: "",
    body: () =>
      "They'll contact you directly about next steps. Nothing's agreed until you've spoken to them and read whatever they send you.",
    closing: "Take your time over the contract, and don't sign anything you don't understand. A real agency will wait.",
    standing: "Signed",
  },
  represented: {
    preheader: "The agreement is done. Here's what changes.",
    headline: (a) => `You're represented by ${esc(a)}.`,
    rule: "The agreement is complete.",
    body: () =>
      "They'll be in touch about onboarding \u2014 your book with them, how they want to be reached, and what they need from you first.",
    closing: "Keep your measurements and digitals current here too. Agencies check them more often than they ask for them.",
    standing: "Represented",
  },
  declined: {
    headline: (a) => `${esc(a)} passed on your submission.`,
    rule: "",
    body: () =>
      "They don't give a reason, and there isn't one to read into it. Agencies pass on board space, market and timing far more often than on the work itself.",
    standing: "Closed",
  },
};
DECISIONS.passed = DECISIONS.declined;

function buildApplicationStatusEmailHtml({ talentName, agencyName, status, board, staleDigitals, submittedOn, detail } = {}) {
  const agency = agencyName || "The agency";
  const d = DECISIONS[status] || DECISIONS.declined;

  const rows = [
    space(58),
    B.statement(d.headline(agency), { size: 29 }),
    space(20),
  ];

  if (d.rule) {
    rows.push(
      row(`<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16.5px;line-height:24px;color:${COLOR.ink};font-weight:500;">${esc(d.rule)}</div>`),
      space(10),
    );
  }

  // A templated decline reason replaces the body rather than joining it. The
  // default declined copy says "They don't give a reason, and there isn't one to
  // read into it" — true of most declines, and a flat contradiction of an email
  // that is about to state the reason. Only one of the two can ship.
  const declineDetail =
    detail && (status === "declined" || status === "passed") ? String(detail) : null;
  rows.push(
    B.prose(declineDetail || d.body(agency, board), { size: 15.5 }),
    space(26),
  );

  if (d.standing) rows.push(B.standing(d.standing));

  // The stale-digitals note sits BELOW a hairline, after the verdict has
  // closed. Floating it beside the standing would manufacture the reading
  // "they filed me because my pictures are bad."
  if (staleDigitals && (status === "kept_on_file" || status === "shortlisted")) {
    rows.push(
      space(30), hairline(), space(24),
      B.advisory(`Your digitals are ${esc(String(staleDigitals))} days old. Most agencies want a set from the last three months.`),
      space(18),
      B.act("Update your digitals", `${app()}/dashboard/talent/media`),
    );
  } else if (status === "accepted" || status === "development" || status === "represented") {
    rows.push(space(30), B.act("Read their message", `${app()}/dashboard/talent/messages`));
    if (d.closing) rows.push(space(24), B.advisory(d.closing));
  } else if (status === "declined" || status === "passed") {
    rows.push(space(30), B.act("See other agencies", `${app()}/dashboard/talent/applications`));
  }

  rows.push(
    space(40), B.sweep(), space(16), B.signature(),
    footer("record", {
      reason: `You're getting this because you sent your book to ${agency}${submittedOn ? ` on ${submittedOn}` : ""}.`,
      preference: submissionPref,
    }),
  );

  return render({
    title: d.headline(agency).replace(/<[^>]+>/g, ""),
    preheader: d.preheader || "",
    rows,
  });
}

/* ------------------------------------------------- more materials requested */

function buildMaterialsRequestedEmailHtml({ agencyName, items = [] } = {}) {
  const agency = agencyName || "The agency";
  return render({
    title: `${agency} asked for more`,
    preheader: "Here's exactly what they've asked for.",
    rows: [
      space(40), B.wordmark(), space(46),
      B.statement(`${esc(agency)} asked for more.`),
      space(18),
      B.prose("They want another look before deciding. Here's what they've asked for:", { size: 16 }),
      space(32),
      B.askBand({ source: `The request &middot; ${agency}`, items }),
      space(36),
      B.act("Send them", `${app()}/dashboard/talent/media`),
      space(26),
      B.advisory("Agencies don't ask unless they're interested. Sooner beats perfect."),
      footer("record", {
        reason: `You're getting this because ${agency} asked for more from your submission.`,
        preference: submissionPref,
      }),
    ],
  });
}

/* --------------------------------------------------------------- messages */

function buildNewMessageEmailHtml({ recipientName, senderName, senderRole, agencyName, messagePreview, sentAt, replyUrl } = {}) {
  const sender = senderName || agencyName || "Pholio";
  return render({
    title: `${sender} sent you a message`,
    preheader: messagePreview ? String(messagePreview).slice(0, 120) : `New message from ${sender}.`,
    rows: [
      space(44),
      B.correspondent({ name: sender, role: senderRole || "Booker", org: agencyName, when: sentAt || "" }),
      space(20),
      B.messageInset(esc(messagePreview || "Open the conversation to read it.")),
      space(28),
      B.act(`Reply to ${String(sender).split(" ")[0]}`, replyUrl || `${app()}/dashboard/talent/messages`),
      space(14),
      B.prose(`Your reply stays attached to your ${agencyName ? esc(agencyName) : "agency"} submission.`, { size: 12.5 }),
      space(38), hairline(), space(20), B.signature(),
      footer("record", {
        reason: `Sent because ${sender} messaged you${agencyName ? ` about your ${agencyName} submission` : ""}.`,
        preference: { label: "Message settings", href: `${app()}/dashboard/talent/settings` },
      }),
    ],
  });
}

/* ----------------------------------------------------------- invitations */

function buildAgencyInviteEmailHtml({ talentName, agencyName, agencyCity, board, applyUrl } = {}) {
  const agency = agencyName || "An agency";
  const where = agencyCity ? `, a modelling agency in ${esc(agencyCity)},` : "";
  return render({
    title: `${agency} asked to see your book`,
    preheader: "An invitation isn't an offer — here's what it means.",
    rows: [
      space(44), B.wordmark(), space(46),
      B.statement(`${esc(agency)} asked to see your book.`),
      space(22),
      B.prose(`${talentName ? `Hi ${esc(String(talentName).split(" ")[0])} &mdash; ` : ""}${strong(agency)}${where} has invited you to submit${board ? ` to their ${esc(board)} board` : ""}.`, { size: 15.5 }),
      space(20),
      B.prose("An invitation isn't an offer. It means a booker saw your profile and wants a proper look.", { size: 15 }),
      space(32),
      B.act("Review the invitation", applyUrl || `${app()}/dashboard/talent/applications`),
      space(26),
      B.advisory("Have a look at them before you send anything. A legitimate agency never asks you to pay to be represented."),
      footer("record", {
        reason: `You're getting this because ${agency} invited you through Pholio.`,
        preference: submissionPref,
      }),
    ],
  });
}

module.exports = {
  buildApplicationStatusEmailHtml,
  buildMaterialsRequestedEmailHtml,
  buildNewMessageEmailHtml,
  buildAgencyInviteEmailHtml,
};
