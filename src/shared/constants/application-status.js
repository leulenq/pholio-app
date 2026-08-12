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
  OFFERED_APPLICATION_STATUSES,
  REPRESENTED_APPLICATION_STATUSES,
  WRITABLE_APPLICATION_STATUSES,
  isOfferedApplicationStatus,
  isRepresentedApplicationStatus,
};
