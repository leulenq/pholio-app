/**
 * Pholio Email — the open-call applicant receipt.
 *
 * ONE EMAIL, TWO JOBS (`docs/open-call-applicant-flow-design-2026-08.md` §5.2).
 * The confirmation and the claim are the same message, sent on submit whichever
 * button the applicant pressed on the payoff screen, because the receipt is
 * owed either way:
 *
 *   Your application is in.
 *   Fashion Week Brooklyn has your submission for the October 4–10 season.
 *   You built a profile getting here — digitals, stats and a comp card.
 *   [ Keep it — takes one tap ]
 *   Didn't apply to this? [ That wasn't me ]
 *
 * The third line is the whole strategy of this flow in one sentence: the
 * account is not charged as the price of entry, it is issued as the receipt.
 *
 * The disown link (§5.5) is small and quiet but ALWAYS present. Because the
 * flow accepts an unverified email by design, someone can apply using another
 * person's address; that person receives this email, and "that wasn't me" is
 * the only honest thing to offer them. It is a requirement, not a nicety, and
 * it must not be dropped to tidy up the layout.
 *
 * ONE-SIDED BRANCH: an address that already has a Pholio profile gets the same
 * receipt with a sign-in CTA instead of a claim CTA (§5.3's table). The branch
 * lives here, in the email, precisely because the *form* must never branch —
 * telling an anonymous visitor whether an address has an account is an
 * account-existence oracle.
 *
 * Cream vocabulary, composed from the same semantic blocks as
 * ./templates-talent.js. Plain text is hand-written below, never derived from
 * the HTML (see ./text.js's header for why).
 */

const { COLOR } = require("./tokens");
const { esc, space, shell, document_ } = require("./primitives");
const B = require("./blocks");
const { footer } = require("./footer");
const { getEmailAppBaseUrl, getMarketingSiteUrl } = require("./urls");

const app = () => getEmailAppBaseUrl();
const site = () => getMarketingSiteUrl();

function render({ title, preheader, rows }) {
  return document_({ title, body: shell({ preheader, rows }) });
}

/** The quiet secondary action. Body-grey underline, matching the footer's. */
function quietLink(label, href) {
  return `<a href="${esc(href)}" style="color:${COLOR.body};text-decoration:underline;">${esc(label)}</a>`;
}

const OPEN_CALL_RECEIPT_SUBJECT = "Your application is in.";

/**
 * @param {object} input
 * @param {string} [input.agencyName]        the organizer, as they are named on the call
 * @param {string} [input.eventName]
 * @param {string} [input.eventDatesLabel]   e.g. "October 4–10" — already formatted
 * @param {string} [input.claimUrl]          claim-purpose magic link
 * @param {string} [input.disownUrl]         disown-purpose magic link
 * @param {boolean} [input.alreadyHadAccount]
 * @param {string} [input.firstName]
 */
function buildOpenCallReceiptHtml({
  agencyName,
  eventName,
  eventDatesLabel,
  claimUrl,
  disownUrl,
  alreadyHadAccount = false,
  firstName,
} = {}) {
  const organizer = agencyName || "The organizer";
  // "…has your submission for the October 4–10 season" degrades cleanly when a
  // call carries no event name or dates — a representation call has neither.
  const forWhat = [
    eventName ? esc(eventName) : null,
    eventDatesLabel ? `${esc(eventDatesLabel)}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const rows = [
    space(44),
    B.wordmark(),
    space(44),
    B.statement("Your application is in."),
    space(22),
    B.lede(
      `${esc(organizer)} has your submission${forWhat ? ` for ${forWhat}` : ""}.`,
    ),
    space(18),
  ];

  if (alreadyHadAccount) {
    rows.push(
      B.prose(
        "We attached this to your Pholio profile &mdash; your digitals, your stats and your comp card are already there.",
        { size: 15.5 },
      ),
      space(30),
      B.act("Sign in to see it", `${app()}/login`),
      space(13),
      B.actNote("Your existing account &middot; nothing changed"),
    );
  } else {
    rows.push(
      B.prose(
        `${firstName ? `${esc(firstName)}, y` : "Y"}ou built the start of a Pholio profile getting here &mdash; your digitals, your stats and a comp card. It's yours if you want it.`,
        { size: 15.5 },
      ),
      space(30),
      B.act("Keep it — takes one tap", claimUrl || `${app()}/login`),
      space(13),
      B.actNote("Works once &middot; no password needed"),
      space(26),
      B.prose(
        "Nothing else is asked of you. Your application is already with the organizer either way.",
        { size: 14 },
      ),
    );
  }

  rows.push(
    space(26),
    B.prose(
      `Didn't apply to this? ${quietLink("That wasn't me", disownUrl || `${site()}/privacy`)}.`,
      { size: 14 },
    ),
    footer("secure", {
      reason: "Sent because this address was entered on an open call at pholio.studio.",
    }),
  );

  return render({
    title: "Your application is in",
    preheader: alreadyHadAccount
      ? "Attached to your Pholio profile."
      : "You built a profile getting here. Keep it in one tap.",
    rows,
  });
}

const j = (...lines) => lines.filter((l) => l !== null && l !== undefined).join("\n");

/** Hand-written plain-text alternative. */
function openCallReceiptText({
  agencyName,
  eventName,
  eventDatesLabel,
  claimUrl,
  disownUrl,
  alreadyHadAccount = false,
  firstName,
} = {}) {
  const organizer = agencyName || "The organizer";
  const forWhat = [eventName, eventDatesLabel].filter(Boolean).join(", ");

  return j(
    "Your application is in.",
    "",
    `${organizer} has your submission${forWhat ? ` for ${forWhat}` : ""}.`,
    "",
    alreadyHadAccount
      ? "We attached this to your Pholio profile — your digitals, your stats and your comp card are already there."
      : `${firstName ? `${firstName}, y` : "Y"}ou built the start of a Pholio profile getting here — your digitals, your stats and a comp card. It's yours if you want it.`,
    "",
    alreadyHadAccount
      ? `Sign in to see it: ${app()}/login`
      : `Keep it — takes one tap: ${claimUrl || `${app()}/login`}`,
    "",
    alreadyHadAccount
      ? null
      : "Nothing else is asked of you. Your application is already with the organizer either way.",
    alreadyHadAccount ? null : "",
    `Didn't apply to this? That wasn't me: ${disownUrl || `${site()}/privacy`}`,
    "",
    "—",
    "",
    "Sent because this address was entered on an open call at pholio.studio.",
    "Pholio will never ask for your password or a code by phone, message or reply.",
    `support@pholio.studio · ${site()}/terms · ${site()}/privacy`,
  );
}

module.exports = {
  OPEN_CALL_RECEIPT_SUBJECT,
  buildOpenCallReceiptHtml,
  openCallReceiptText,
};
