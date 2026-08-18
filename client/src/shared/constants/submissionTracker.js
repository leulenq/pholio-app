/**
 * Browser mirror of `src/shared/constants/submission-tracker.js`.
 *
 * Keep the values byte-identical to the server module — they cross the wire in
 * both directions, and `tests/migrations/trust-loop-schema.test.js` fails the
 * build if they drift. Only the vocabulary the SPA actually branches on lives
 * here.
 */

/**
 * `off_platform_submissions.status`. No "lapsed" member: ruling R1 computes
 * lapse at display time from `submittedOn + reviewWindowDays`.
 */
export const TRACKER_STATUSES = Object.freeze([
  'awaiting',
  'heard_back',
  'closed_by_talent',
]);

/** Named access to the same three values. */
export const TRACKER_STATUS = Object.freeze({
  AWAITING: 'awaiting',
  HEARD_BACK: 'heard_back',
  CLOSED_BY_TALENT: 'closed_by_talent',
});

export const DEFAULT_TRACKER_STATUS = TRACKER_STATUS.AWAITING;

/**
 * Fallback review window for a row that predates a stored value. Rows carry
 * their own `reviewWindowDays`; prefer that and use this only when it is
 * absent.
 */
export const DEFAULT_TRACKER_WINDOW_DAYS = 30;

/** Months before re-applying is conventional. Display copy only — nothing blocks. */
export const REAPPLY_CONVENTION_MONTHS = 6;

/**
 * `off_platform_submissions.channel` — spec-pack channel vocabulary without
 * `pholio_open_call` (that is an on-Pholio application), plus `other`.
 */
export const TRACKER_CHANNELS = Object.freeze([
  'official_web_form',
  'official_email',
  'official_walk_in',
  'agency_branded_third_party_form',
  'other',
]);

export const DEFAULT_TRACKER_CHANNEL = 'official_web_form';

/** `agency_verifications.registry`. Closed vocabulary. */
export const VERIFICATION_REGISTRIES = Object.freeze(['ny_dol']);

/** `agency_verifications.registry_status`, as published by the registry. */
export const VERIFICATION_REGISTRY_STATUSES = Object.freeze([
  'active',
  'expired',
  'revoked',
]);

export const DEFAULT_VERIFICATION_REGISTRY_STATUS = 'active';

/**
 * `agency_call_windows.weekday` — ISO 8601, 1 = Monday … 7 = Sunday.
 * `Date#getDay()` is 0 = Sunday; never pass one where the other is expected.
 */
export const ISO_WEEKDAYS = Object.freeze({
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7,
});
export const ISO_WEEKDAY_VALUES = Object.freeze(Object.values(ISO_WEEKDAYS));

/** Default IANA zone for `agency_call_windows.timezone`. */
export const DEFAULT_CALL_WINDOW_TIMEZONE = 'America/New_York';

/** `Date#getDay()` (0 = Sunday) → ISO weekday (7 = Sunday). */
export const isoWeekdayFromDate = (date) => {
  const day = date.getDay();
  return day === 0 ? ISO_WEEKDAYS.SUNDAY : day;
};

export const isTrackerStatus = (value) =>
  TRACKER_STATUSES.includes(String(value || '').toLowerCase());

export const isTrackerChannel = (value) =>
  TRACKER_CHANNELS.includes(String(value || '').toLowerCase());

export const isVerificationRegistry = (value) =>
  VERIFICATION_REGISTRIES.includes(String(value || '').toLowerCase());

export const isIsoWeekday = (value) =>
  Number.isInteger(value) && value >= 1 && value <= 7;
