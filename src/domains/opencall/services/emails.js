"use strict";

/**
 * Applicant-facing mail for the anonymous open-call flow
 * (`docs/open-call-applicant-flow-design-2026-08.md` §5.2).
 *
 * One function, one message: the receipt that is also the claim. It is composed
 * in `src/shared/lib/pholio-email/templates-opencall.js` and sent through
 * `sendEmail` — the shared sender is not extended with a `sendOpenCall…`
 * wrapper, because `email.js` is the transport and this is the only surface
 * that speaks to an applicant who has no account.
 *
 * FAILURE POSTURE. `sendEmail` throws on transport failure and this function
 * lets it, but callers on the submit path must NOT let it fail the submission:
 * the application is already with the organizer, and a bounced receipt is a
 * lost receipt, not a lost application. `sendOpenCallReceiptEmail` therefore
 * returns a result object for the fire-and-forget case and the route decides.
 */

const { sendEmail } = require("../../../shared/lib/email");
const {
  OPEN_CALL_RECEIPT_SUBJECT,
  buildOpenCallReceiptHtml,
  openCallReceiptText,
} = require("../../../shared/lib/pholio-email/templates-opencall");

/**
 * The receipt-and-claim email.
 *
 * @param {object} input
 * @param {string} input.to                      the address as the applicant typed it
 * @param {string} [input.agencyName]
 * @param {string} [input.eventName]
 * @param {string} [input.eventDatesLabel]       pre-formatted, e.g. "October 4–10"
 * @param {string} [input.claimUrl]              claim-purpose magic link (§5.2)
 * @param {string} [input.disownUrl]             disown-purpose magic link (§5.5)
 * @param {boolean} [input.alreadyHadAccount]    §5.3 row 1 — sign-in CTA instead
 * @param {string} [input.firstName]
 * @returns {Promise<object>} nodemailer info
 */
async function sendOpenCallReceiptEmail({
  to,
  agencyName,
  eventName,
  eventDatesLabel,
  claimUrl,
  disownUrl,
  alreadyHadAccount = false,
  firstName,
} = {}) {
  if (!to) {
    const error = new Error("A recipient address is required");
    error.code = "RECEIPT_RECIPIENT_REQUIRED";
    throw error;
  }

  const payload = {
    agencyName,
    eventName,
    eventDatesLabel,
    claimUrl,
    disownUrl,
    alreadyHadAccount,
    firstName,
  };

  return sendEmail({
    to,
    subject: OPEN_CALL_RECEIPT_SUBJECT,
    html: buildOpenCallReceiptHtml(payload),
    text: openCallReceiptText(payload),
  });
}

/**
 * The same send, with the submit path's failure posture applied: never throws.
 * Use this from a route that has already written the application.
 *
 * @returns {Promise<{sent: boolean, error?: string}>}
 */
async function sendOpenCallReceiptEmailQuietly(input) {
  try {
    await sendOpenCallReceiptEmail(input);
    return { sent: true };
  } catch (error) {
    // The address domain and the reason only — `sendEmail` already logs at that
    // granularity and never logs the token-bearing body.
    console.error(
      "[OpenCall Receipt] Send failed:",
      error?.code || error?.message || "unknown",
    );
    return { sent: false, error: error?.message || "send failed" };
  }
}

module.exports = {
  sendOpenCallReceiptEmail,
  sendOpenCallReceiptEmailQuietly,
};
