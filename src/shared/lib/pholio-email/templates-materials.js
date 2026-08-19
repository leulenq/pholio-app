/**
 * Pholio Email — the shortlist-stage materials request, for an applicant with
 * no account.
 *
 * WHY THIS IS NOT `templates-submissions.buildMaterialsRequestedEmailHtml`
 *
 * That template already says the right thing to a *signed-in* talent: its call
 * to action is `${app()}/dashboard/talent/media`, a dashboard behind a login. An
 * unclaimed open-call applicant (identity-ladder state 2 — no `users` row, no
 * credentials, no session) cannot open it, and design ruling Q8 is explicit
 * about why they must not be made to:
 *
 *   > Fulfilment happens on a tokenized page, no account needed — a shortlisted
 *   > applicant forced through account creation to answer the organizer is the
 *   > original wall rebuilt in the middle of the funnel.
 *
 * So the only substantive difference is the destination: one tokenized URL
 * (`applicant_claim_tokens`, purpose `materials`) instead of a dashboard path.
 * Everything else — the ask band, the deadline sentence, the "agencies don't ask
 * unless they're interested" advisory — is deliberately the same voice, because
 * it is the same message. The existing template and `email.js` are untouched.
 *
 * The deadline is stated in the copy rather than implied, per design §2.3: "the
 * system, not the organizer, doing the chasing and the deadline."
 */

const { esc, space, hairline } = require("./primitives");
const B = require("./blocks");
const { footer } = require("./footer");

const { COLOR } = require("./tokens");
const { document_, shell } = require("./primitives");

function render({ title, preheader, rows }) {
  return document_({ title, body: shell({ preheader, rows }) });
}

/** "by Friday 3 October" — a date an applicant can act on, or nothing. */
function formatDueDate(dueAt) {
  if (!dueAt) return null;
  const date = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * @param {object} params
 * @param {string} params.agencyName      Who is asking.
 * @param {string[]} params.items         Human labels for the requested keys.
 * @param {string} params.fulfilUrl       The tokenized fulfilment page.
 * @param {string|Date|null} [params.dueAt]
 * @param {string|null} [params.eventName]
 */
function buildApplicantMaterialsRequestEmailHtml({
  agencyName,
  items = [],
  fulfilUrl,
  dueAt = null,
  eventName = null,
} = {}) {
  const agency = agencyName || "The organizer";
  const due = formatDueDate(dueAt);
  const event = eventName ? ` for ${esc(eventName)}` : "";

  return render({
    title: `${agency} shortlisted you`,
    preheader: due
      ? `They need a few more things by ${due}.`
      : "They need a few more things.",
    rows: [
      space(40),
      B.wordmark(),
      space(46),
      B.statement(`${esc(agency)} shortlisted you.`),
      space(18),
      B.prose(
        `You are through the first read${event}. Before they decide, they need a few more things from you${
          due ? ` by <strong style="color:${COLOR.ink};font-weight:600;">${esc(due)}</strong>` : ""
        }:`,
        { size: 16 },
      ),
      space(32),
      B.askBand({ source: `The request &middot; ${agency}`, items }),
      space(36),
      B.act("Send your materials", fulfilUrl),
      space(14),
      // The one thing this email must say that the account-backed one does not.
      B.prose(
        "No account needed — the link above opens straight onto the form, and it only works for you.",
        { size: 12.5 },
      ),
      space(26),
      B.advisory(
        "Organizers don't ask unless they're interested. Sooner beats perfect.",
      ),
      space(38),
      hairline(),
      space(20),
      B.signature(),
      footer("record", {
        reason: `You're getting this because you applied to ${agency} through Pholio and they shortlisted your application.`,
      }),
    ],
  });
}

/** Plain-text alternative. Same facts, no markup. */
function buildApplicantMaterialsRequestEmailText({
  agencyName,
  items = [],
  fulfilUrl,
  dueAt = null,
} = {}) {
  const agency = agencyName || "The organizer";
  const due = formatDueDate(dueAt);
  return [
    `${agency} shortlisted you.`,
    "",
    `Before they decide, they need a few more things from you${due ? ` by ${due}` : ""}:`,
    ...items.map((item) => `  - ${item}`),
    "",
    `Send them here: ${fulfilUrl}`,
    "",
    "No account needed — the link opens straight onto the form, and it only works for you.",
  ].join("\n");
}

module.exports = {
  buildApplicantMaterialsRequestEmailHtml,
  buildApplicantMaterialsRequestEmailText,
  formatDueDate,
};
