"use strict";

/**
 * Event-casting vocabulary — the single place these strings are spelled.
 *
 * Per `docs/event-casting-design-2026-08.md` §(h), Lane 0 owns every literal
 * in this file and no other lane writes one by hand. An open call is either a
 * standing representation call or a one-off event cast; the distinction fans
 * out into consent copy, directory visibility, status labels and retention, so
 * a typo in a single branch is a wrong disclosure, not a cosmetic bug.
 */

/** `agency_open_call_links.call_kind`. */
const CALL_KINDS = Object.freeze({
  REPRESENTATION: "representation",
  EVENT_CASTING: "event_casting",
});
const CALL_KIND_VALUES = Object.freeze(Object.values(CALL_KINDS));
const DEFAULT_CALL_KIND = CALL_KINDS.REPRESENTATION;

/** `applications.call_purpose` mirrors the kind of the call it came from. */
const CALL_PURPOSES = CALL_KINDS;
const CALL_PURPOSE_VALUES = CALL_KIND_VALUES;
const DEFAULT_CALL_PURPOSE = DEFAULT_CALL_KIND;

/**
 * `agency_open_call_links.compensation_type`. Mandatory on an event call: the
 * consent copy restates it verbatim, so there is no "unspecified" option —
 * unpaid is a statement an organizer makes, not a field they leave blank.
 */
const COMPENSATION_TYPES = Object.freeze({
  PAID: "paid",
  UNPAID: "unpaid",
  STIPEND: "stipend",
});
const COMPENSATION_TYPE_VALUES = Object.freeze(Object.values(COMPENSATION_TYPES));

/**
 * `event_pick_selections.mark` — a designer's private opinion, never an
 * application status. N designers can disagree; only the organizer's explicit
 * offer moves the application.
 */
const PICK_MARKS = Object.freeze({
  PICK: "pick",
  MAYBE: "maybe",
  PASS: "pass",
});
const PICK_MARK_VALUES = Object.freeze(Object.values(PICK_MARKS));

/** `event_pick_lists.status`. */
const PICK_LIST_STATUSES = Object.freeze({
  DRAFT: "draft",
  OPEN: "open",
  CLOSED: "closed",
  REVOKED: "revoked",
});
const PICK_LIST_STATUS_VALUES = Object.freeze(Object.values(PICK_LIST_STATUSES));

/** `event_casting_funnel_events.event_type` — design §(g), the eight steps. */
const FUNNEL_EVENT_TYPES = Object.freeze({
  CALL_VIEWED: "call_viewed",
  APPLICATION_STARTED: "application_started",
  APPLICATION_COMPLETED: "application_completed",
  INTAKE_BLOCKED: "intake_blocked",
  PROFILE_COMPLETED_AT_SUBMIT: "profile_completed_at_submit",
  PAYOFF_VIEWED: "payoff_viewed",
  SECOND_RECIPIENT_SUBMITTED: "second_recipient_submitted",
  RETURNED_D30: "returned_d30",
});
const FUNNEL_EVENT_TYPE_VALUES = Object.freeze(Object.values(FUNNEL_EVENT_TYPES));

/**
 * `agencies.org_kind` — design A1. Governs directory visibility and label
 * vocabulary only; it is not an authorization claim, and the self-declared
 * `agencies.agency_type` remains display copy.
 */
const ORG_KINDS = Object.freeze({
  AGENCY: "agency",
  EVENT_ORGANIZER: "event_organizer",
});
const ORG_KIND_VALUES = Object.freeze(Object.values(ORG_KINDS));
const DEFAULT_ORG_KIND = ORG_KINDS.AGENCY;

/**
 * Ruling R6. A representation agency needs a handful of live entry links; a
 * multi-edition event organizer runs a new call per city per season and hits
 * 20 in a year. A per-kind constant answers that without a column nobody
 * maintains.
 */
const MAX_LINKS_BY_ORG_KIND = Object.freeze({
  [ORG_KINDS.AGENCY]: 20,
  [ORG_KINDS.EVENT_ORGANIZER]: 60,
});

/** `agency_open_call_links.offer_response_window_hours` default. */
const DEFAULT_OFFER_RESPONSE_WINDOW_HOURS = 72;

/** Ruling R4: event submission packages expire 90 days after the event ends. */
const EVENT_PACKAGE_RETENTION_DAYS = 90;

/** Unknown or absent kinds fall back to the stricter agency ceiling. */
function maxOpenCallLinksForOrgKind(orgKind) {
  const key = String(orgKind || "").toLowerCase();
  return MAX_LINKS_BY_ORG_KIND[key] ?? MAX_LINKS_BY_ORG_KIND[DEFAULT_ORG_KIND];
}

function isEventCastingCallKind(value) {
  return String(value || "").toLowerCase() === CALL_KINDS.EVENT_CASTING;
}

module.exports = {
  CALL_KINDS,
  CALL_KIND_VALUES,
  CALL_PURPOSES,
  CALL_PURPOSE_VALUES,
  COMPENSATION_TYPES,
  COMPENSATION_TYPE_VALUES,
  DEFAULT_CALL_KIND,
  DEFAULT_CALL_PURPOSE,
  DEFAULT_OFFER_RESPONSE_WINDOW_HOURS,
  DEFAULT_ORG_KIND,
  EVENT_PACKAGE_RETENTION_DAYS,
  FUNNEL_EVENT_TYPES,
  FUNNEL_EVENT_TYPE_VALUES,
  MAX_LINKS_BY_ORG_KIND,
  ORG_KINDS,
  ORG_KIND_VALUES,
  PICK_LIST_STATUSES,
  PICK_LIST_STATUS_VALUES,
  PICK_MARKS,
  PICK_MARK_VALUES,
  isEventCastingCallKind,
  maxOpenCallLinksForOrgKind,
};
