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

function isRepresentedApplicationStatus(status) {
  return REPRESENTED_APPLICATION_STATUSES.includes(String(status || "").toLowerCase());
}

function isOfferedApplicationStatus(status) {
  return OFFERED_APPLICATION_STATUSES.includes(String(status || "").toLowerCase());
}

module.exports = {
  AUTO_CLOSED_APPLICATION_STATUS,
  AWAITING_AGENCY_APPLICATION_STATUSES,
  OFFERED_APPLICATION_STATUSES,
  REPRESENTED_APPLICATION_STATUSES,
  WRITABLE_APPLICATION_STATUSES,
  isOfferedApplicationStatus,
  isRepresentedApplicationStatus,
};
