"use strict";

/**
 * Talent trust loop vocabulary — the single place these strings are spelled.
 *
 * Per `docs/talent-trust-loop-design-2026-08.md` §(e), Lane 0 owns every
 * literal in this file; no other lane writes `'ny_dol'` or a tracker status by
 * hand. These values are stored in `off_platform_submissions`,
 * `agency_verifications` and `agency_call_windows` and cross the wire to the
 * SPA, so a typo is a row that never renders, not a cosmetic bug.
 */

/**
 * `off_platform_submissions.status`.
 *
 * Three states, and deliberately no fourth for "lapsed". Ruling R1 makes lapse
 * a display-time computation from `submitted_on + review_window_days` — a
 * stored lapse status would need a daily job to maintain and would be wrong
 * for exactly as long as that job was down.
 *
 * `closed_by_talent` is the talent saying "I'm done waiting", which is a
 * different fact from the convention-driven lapse the UI computes, and from
 * `heard_back`, which says nothing about the answer. What the agency actually
 * said goes in `outcome_note`; Pholio does not model an outcome it never saw.
 */
const TRACKER_STATUSES = Object.freeze([
  "awaiting",
  "heard_back",
  "closed_by_talent",
]);

/** Named access to the same three values. */
const TRACKER_STATUS = Object.freeze({
  AWAITING: "awaiting",
  HEARD_BACK: "heard_back",
  CLOSED_BY_TALENT: "closed_by_talent",
});

const DEFAULT_TRACKER_STATUS = TRACKER_STATUS.AWAITING;

/**
 * `off_platform_submissions.review_window_days` default — the industry "no
 * answer is the answer" convention, matched to `DEFAULT_REVIEW_WINDOW_DAYS` in
 * `src/shared/lib/application-auto-close.js` so an off-platform submission and
 * an on-Pholio application lapse on the same clock in the merged ledger.
 *
 * Stored per row rather than read from here at display time: per-agency
 * response policies are deferred, and when they arrive they must not require a
 * migration.
 */
const DEFAULT_TRACKER_WINDOW_DAYS = 30;

/**
 * Months before re-applying to the same agency is conventional. Display-only
 * (ruling R1) — nothing enforces it, and the copy says "opens", not "blocked".
 */
const REAPPLY_CONVENTION_MONTHS = 6;

/**
 * `off_platform_submissions.channel` — the spec-pack `scope.channel.type`
 * vocabulary (`data/spec-registry/v1/schemas/spec-revision.schema.json`) minus
 * `pholio_open_call`, plus `other`.
 *
 * `pholio_open_call` is excluded by definition: a submission through Pholio's
 * own intake link is an `applications` row, not something the talent tracks by
 * hand. `other` exists because the tracker must accept an agency that publishes
 * no channel at all — refusing to record a real submission would send the
 * talent straight back to the Notes app this table replaces.
 */
const TRACKER_CHANNELS = Object.freeze([
  "official_web_form",
  "official_email",
  "official_walk_in",
  "agency_branded_third_party_form",
  "other",
]);

const DEFAULT_TRACKER_CHANNEL = "official_web_form";

/**
 * `agency_verifications.registry`. Closed vocabulary — a registry is only
 * listed here once a snapshot of it is committed under `data/trust-registry/`
 * (ruling R4).
 */
const VERIFICATION_REGISTRIES = Object.freeze(["ny_dol"]);

/** `agency_verifications.registry_status`, as published by the registry. */
const VERIFICATION_REGISTRY_STATUSES = Object.freeze([
  "active",
  "expired",
  "revoked",
]);

const DEFAULT_VERIFICATION_REGISTRY_STATUS = "active";

/**
 * `agency_call_windows.weekday` — ISO 8601, 1 = Monday … 7 = Sunday.
 *
 * Spelled out because the JavaScript alternative is `Date#getDay()`, which is
 * 0 = Sunday. Mixing the two shifts every published open call by a day, in a
 * way that looks plausible on screen.
 */
const ISO_WEEKDAYS = Object.freeze({
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7,
});
const ISO_WEEKDAY_VALUES = Object.freeze(Object.values(ISO_WEEKDAYS));

/** Default IANA zone for `agency_call_windows.timezone`. */
const DEFAULT_CALL_WINDOW_TIMEZONE = "America/New_York";

/** `Date#getDay()` (0 = Sunday) → ISO weekday (7 = Sunday). */
function isoWeekdayFromDate(date) {
  const day = date.getDay();
  return day === 0 ? ISO_WEEKDAYS.SUNDAY : day;
}

function isTrackerStatus(value) {
  return TRACKER_STATUSES.includes(String(value || "").toLowerCase());
}

function isTrackerChannel(value) {
  return TRACKER_CHANNELS.includes(String(value || "").toLowerCase());
}

function isVerificationRegistry(value) {
  return VERIFICATION_REGISTRIES.includes(String(value || "").toLowerCase());
}

function isIsoWeekday(value) {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

module.exports = {
  DEFAULT_CALL_WINDOW_TIMEZONE,
  DEFAULT_TRACKER_CHANNEL,
  DEFAULT_TRACKER_STATUS,
  DEFAULT_TRACKER_WINDOW_DAYS,
  DEFAULT_VERIFICATION_REGISTRY_STATUS,
  ISO_WEEKDAYS,
  ISO_WEEKDAY_VALUES,
  REAPPLY_CONVENTION_MONTHS,
  TRACKER_CHANNELS,
  TRACKER_STATUS,
  TRACKER_STATUSES,
  VERIFICATION_REGISTRIES,
  VERIFICATION_REGISTRY_STATUSES,
  isIsoWeekday,
  isTrackerChannel,
  isTrackerStatus,
  isVerificationRegistry,
  isoWeekdayFromDate,
};
