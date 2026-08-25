"use strict";

/**
 * The one-click decline vocabulary.
 *
 * Plan §9.3 pairs auto-close with "one-click templated decline", and §9.6 ranks
 * auto-close as "the cheapest trust feature in the industry; only Storm even
 * publishes a policy today". The reason a talent almost never hears back is not
 * cruelty, it is cost: writing an individual no to four hundred submissions is
 * not work anyone will do. So the answer is not to ask agencies to write more,
 * it is to make the honest no cost one click.
 *
 * Three rules govern this list, and they are why it is short.
 *
 * 1. A reason is OPTIONAL. `null` is a first-class value and always will be.
 *    An agency that does not want to say why still declines, and the talent
 *    still gets the answer — which is the part that actually matters. A product
 *    that forces a reason gets a garbage reason.
 *
 * 2. Every reason describes the AGENCY'S SITUATION, never the person. "Our
 *    board is full" is a fact about the agency. "Not conventionally attractive
 *    enough" is a judgement about a human being, and no amount of UI softening
 *    makes it survivable at scale. This is the same line the product draws
 *    everywhere else: describe the photograph, never the face.
 *
 * 3. The talent-facing text is FIXED. The agency picks from the list; it does
 *    not compose. That is what keeps this one click, and it is also what keeps
 *    a bad day from being sent to four hundred people. An agency with something
 *    specific to say can already message the talent directly.
 *
 * `materials` is the only reason that points at the submission rather than the
 * agency, and it is here deliberately: it is the one decline a talent can act
 * on. Paired with the digitals-freshness work it is the whole retention loop —
 * a talent who is told their digitals could not be assessed can shoot new ones
 * and come back, which is a better outcome for both sides than silence.
 */

/**
 * @typedef {object} DeclineReason
 * @property {string} id            stored in `applications.decline_reason`
 * @property {string} agencyLabel   what the reviewer picks from
 * @property {string} talentMessage what the talent reads, verbatim
 * @property {boolean} invitesReturn whether this decline says "come back"
 */

/** @type {ReadonlyArray<DeclineReason>} */
const DECLINE_REASONS = Object.freeze([
  Object.freeze({
    id: "board_full",
    agencyLabel: "Board is full",
    talentMessage:
      "Their board is full at the moment, so they are not taking on new talent in this division right now.",
    invitesReturn: true,
  }),
  Object.freeze({
    id: "not_a_fit",
    agencyLabel: "Not a fit for the current board",
    talentMessage:
      "The board they are building this season needs something different. That is a decision about their roster, not a judgement about your work.",
    invitesReturn: true,
  }),
  Object.freeze({
    id: "market",
    agencyLabel: "Wrong market",
    talentMessage:
      "They are not the right market for you at the moment — an agency in another market is likelier to be the right home.",
    invitesReturn: false,
  }),
  Object.freeze({
    id: "materials",
    agencyLabel: "Could not assess from the materials",
    talentMessage:
      "They could not assess your submission from the materials sent. Current, clearly lit digitals are usually what is missing — worth shooting a fresh set before you apply again.",
    invitesReturn: true,
  }),
  Object.freeze({
    id: "experience",
    agencyLabel: "Looking for more experience",
    talentMessage:
      "They are looking for more experience than this submission showed. Building a book with smaller clients first is the usual route back.",
    invitesReturn: true,
  }),
]);

const BY_ID = new Map(DECLINE_REASONS.map((reason) => [reason.id, reason]));

/**
 * Validate a reason id off the wire.
 *
 * Absent, null and empty string all mean "declined without a reason", which is
 * valid and must never be coerced into a reason nobody chose.
 *
 * @param {unknown} value
 * @returns {{ ok: true, id: string|null } | { ok: false, error: string }}
 */
function normalizeDeclineReason(value) {
  if (value == null || value === "") return { ok: true, id: null };
  if (typeof value !== "string") {
    return { ok: false, error: "decline_reason must be a string or null" };
  }
  const id = value.trim();
  if (!BY_ID.has(id)) {
    return {
      ok: false,
      error: `Unknown decline_reason "${id}". Expected one of: ${DECLINE_REASONS.map((r) => r.id).join(", ")}, or null.`,
    };
  }
  return { ok: true, id };
}

/**
 * The reason record for a stored id, or null.
 *
 * @param {string|null|undefined} id
 * @returns {DeclineReason|null}
 */
function declineReason(id) {
  if (!id) return null;
  return BY_ID.get(id) || null;
}

/**
 * What the talent reads. Null when no reason was given — the caller renders the
 * plain decline rather than inventing an explanation.
 *
 * @param {string|null|undefined} id
 * @returns {string|null}
 */
function talentMessageFor(id) {
  return declineReason(id)?.talentMessage || null;
}

/**
 * The picker's options. Shipped to the client so the vocabulary has exactly one
 * definition and the two sides cannot drift.
 *
 * @returns {Array<{id: string, label: string, talentMessage: string}>}
 */
function declineReasonOptions() {
  return DECLINE_REASONS.map((reason) => ({
    id: reason.id,
    label: reason.agencyLabel,
    // The reviewer sees the exact words the talent will read before sending.
    // Nobody should send a message they have not been shown.
    talentMessage: reason.talentMessage,
  }));
}

module.exports = {
  DECLINE_REASONS,
  declineReason,
  declineReasonOptions,
  normalizeDeclineReason,
  talentMessageFor,
};
