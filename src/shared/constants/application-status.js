"use strict";

/**
 * Canonical application outcomes.
 *
 * `accepted` means the agency has made an offer / wants to move forward.
 * `represented` means the agreement is complete. A confirmed client booking is
 * a separate operating lifecycle and must never be stored on an application.
 */
const REPRESENTED_APPLICATION_STATUSES = Object.freeze(["represented"]);
const OFFERED_APPLICATION_STATUSES = Object.freeze(["accepted"]);

/**
 * Written by the auto-close job, never by an agency — which is why it is
 * absent from `WRITABLE_APPLICATION_STATUSES`. An agency that let the review
 * window lapse has not decided anything, and a status it can set by hand would
 * let silence be recorded as a decision it never made.
 */
const AUTO_CLOSED_APPLICATION_STATUS = "closed_no_response";

/**
 * Statuses where the agency holds the next move, so the review window is
 * theirs to run down. `requested_more` and `meeting_requested` are waiting on
 * the talent; `development` and `kept_on_file` are outcomes an agency chose
 * deliberately. None of those are silence.
 */
const AWAITING_AGENCY_APPLICATION_STATUSES = Object.freeze([
  "pending",
  "submitted",
  "shortlisted",
]);

const WRITABLE_APPLICATION_STATUSES = Object.freeze([
  "submitted",
  "shortlisted",
  "requested_more",
  "meeting_requested",
  "development",
  ...OFFERED_APPLICATION_STATUSES,
  ...REPRESENTED_APPLICATION_STATUSES,
  "passed",
  "declined",
  "archived",
  "kept_on_file",
]);

/** Talent-initiated exit from a live application. Predates event casting. */
const WITHDRAWN_APPLICATION_STATUS = "withdrawn";

/**
 * The applicant's answer to an event slot offer.
 *
 * `confirmed` is deliberately not `represented`: representation drives the
 * roster, DivisionMark identity and the represented counter, and a one-week
 * event booking is none of those. `declined_by_talent` is deliberately not
 * `withdrawn` (which triggers package redaction and hides the row from the
 * organizer, who still needs to refill the slot) and not `declined` (whose
 * notification copy casts the agency as the actor).
 *
 * Both are written by the applicant only. They are therefore absent from
 * `WRITABLE_APPLICATION_STATUSES` — an organizer must not be able to record a
 * confirmation the talent never gave — and absent from
 * `AWAITING_AGENCY_APPLICATION_STATUSES`, because once the applicant has
 * answered nobody is waiting on the agency.
 */
const CONFIRMED_APPLICATION_STATUS = "confirmed";
const TALENT_DECLINED_APPLICATION_STATUS = "declined_by_talent";

const TALENT_WRITABLE_APPLICATION_STATUSES = Object.freeze([
  CONFIRMED_APPLICATION_STATUS,
  TALENT_DECLINED_APPLICATION_STATUS,
]);

/**
 * Every value `applications.status` may legally hold — the single source the
 * status CHECK constraint is generated from, so the database and the code can
 * never disagree about the vocabulary.
 *
 * Derived, not hand-maintained: anything reachable through one of the role
 * lists above is in here by construction. `tests/migrations/
 * event-casting-schema.test.js` guards it against ever narrowing.
 */
const ALL_APPLICATION_STATUSES = Object.freeze([
  ...new Set([
    ...AWAITING_AGENCY_APPLICATION_STATUSES,
    ...WRITABLE_APPLICATION_STATUSES,
    WITHDRAWN_APPLICATION_STATUS,
    AUTO_CLOSED_APPLICATION_STATUS,
    ...TALENT_WRITABLE_APPLICATION_STATUSES,
  ]),
]);

function isRepresentedApplicationStatus(status) {
  return REPRESENTED_APPLICATION_STATUSES.includes(String(status || "").toLowerCase());
}

function isOfferedApplicationStatus(status) {
  return OFFERED_APPLICATION_STATUSES.includes(String(status || "").toLowerCase());
}

function isTalentWritableApplicationStatus(status) {
  return TALENT_WRITABLE_APPLICATION_STATUSES.includes(
    String(status || "").toLowerCase(),
  );
}

module.exports = {
  ALL_APPLICATION_STATUSES,
  AUTO_CLOSED_APPLICATION_STATUS,
  AWAITING_AGENCY_APPLICATION_STATUSES,
  CONFIRMED_APPLICATION_STATUS,
  OFFERED_APPLICATION_STATUSES,
  REPRESENTED_APPLICATION_STATUSES,
  TALENT_DECLINED_APPLICATION_STATUS,
  TALENT_WRITABLE_APPLICATION_STATUSES,
  WITHDRAWN_APPLICATION_STATUS,
  WRITABLE_APPLICATION_STATUSES,
  isOfferedApplicationStatus,
  isRepresentedApplicationStatus,
  isTalentWritableApplicationStatus,
};
