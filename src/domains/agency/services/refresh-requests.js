"use strict";

/**
 * "Your digitals have aged out — please reshoot."
 *
 * The distinction from a materials request is not cosmetic. A materials request
 * asks for something the organizer has never had, and is validated against the
 * call's shortlist-stage fields. A refresh request asks for something the talent
 * ALREADY sent, which has since aged past what the trade accepts.
 *
 * The rule that keeps this from becoming a nag: an organizer may only request a
 * refresh when the digitals are ACTUALLY not current. `digitals-freshness.js`
 * decides that, not the reviewer, and not a date arithmetic re-implemented here.
 * Three of its four states justify the ask:
 *
 *   aging   — past 90 days, the convention agencies work to
 *   stale   — past 180 days
 *   undated — no capture date, so nobody can say how old they are
 *
 * `current` does not. An agency asking a talent to reshoot a set from last week
 * is not requesting a refresh, it is issuing an instruction, and this endpoint
 * refuses to be the mechanism for it.
 *
 * The undated case is the one worth having: it is the only route by which a
 * talent learns their frames carry no capture date at all, which is a thing they
 * can fix once and never hit again.
 */

const {
  STATES,
  digitalsFreshness,
} = require("../../talent/services/digitals-freshness");

/** The apply-stage digitals a refresh asks to be reshot. */
const DIGITALS_KEYS = Object.freeze([
  "digital_headshot",
  "digital_full_length",
  "digital_profile",
]);

/** Freshness states that justify asking for a reshoot. */
const REFRESHABLE_STATES = Object.freeze([
  STATES.AGING,
  STATES.STALE,
  STATES.UNDATED,
]);

/**
 * May this submission's digitals be asked for again?
 *
 * @param {Array<object>} images raw image rows (need image_type / captured_at)
 * @param {Date} [now]
 * @returns {{ allowed: boolean, state: string|null, reason: string|null }}
 */
function refreshEligibility(images, now = new Date()) {
  const rows = Array.isArray(images) ? images : [];

  // No image carries a type, so nothing can be classified. Refusing is the
  // honest answer: the alternative asserts the digitals are stale on the basis
  // of no evidence at all.
  if (!rows.some((image) => image && image.image_type)) {
    return {
      allowed: false,
      state: null,
      reason:
        "This submission's frames are not classified, so their age cannot be judged.",
    };
  }

  const freshness = digitalsFreshness(rows, now);

  if (!freshness.hasDigitals) {
    return {
      allowed: false,
      state: freshness.state,
      // Nothing to refresh — that is a materials request, a different ask.
      reason:
        "This applicant has not sent digitals, so there is nothing to refresh. Ask for them as materials instead.",
    };
  }

  if (!REFRESHABLE_STATES.includes(freshness.state)) {
    return {
      allowed: false,
      state: freshness.state,
      reason:
        "These digitals are current. A refresh can only be asked for once a set has aged past three months, or when it carries no capture date.",
    };
  }

  return { allowed: true, state: freshness.state, reason: null };
}

/**
 * What the talent is told, in terms of why. Each states the situation and the
 * fix; none of them evaluates the person or the pictures.
 *
 * @param {string} state one of the freshness states
 * @param {string} agencyName
 * @returns {string}
 */
function refreshMessage(state, agencyName) {
  const agency = agencyName || "The agency";
  if (state === STATES.UNDATED) {
    return `${agency} could not tell when your digitals were taken — they carry no capture date. Sending a fresh, dated set is the quickest fix, and it stops the same question coming up everywhere else you apply.`;
  }
  if (state === STATES.STALE) {
    return `${agency} has asked for current digitals. The set on your submission is more than six months old, and agencies work to a three-month convention.`;
  }
  return `${agency} has asked for current digitals. The set on your submission is more than three months old, which is the convention most agencies work to.`;
}

module.exports = {
  DIGITALS_KEYS,
  REFRESHABLE_STATES,
  refreshEligibility,
  refreshMessage,
};
