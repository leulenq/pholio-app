/**
 * Age verification — the pure half of the flow.
 *
 * The backend (src/domains/talent/routes/age-verification.js →
 * services/age-verification.js) reports two facts that move independently:
 *
 *   - `verifiedAdult` / `verifiedAt` — the durable result stored on
 *     `adult_context`. Editing the profile date of birth clears that flag
 *     WITHOUT touching the underlying `age_verifications` row, so a stale
 *     `status: 'verified'` legitimately arrives next to `verifiedAdult: false`.
 *     That pair *is* the DOB-edit invalidation, which is why this resolver
 *     reads the flag first and the session status second.
 *   - `status` / `failureCode` — the latest Stripe Identity session.
 *
 * Everything here is data in / copy out so the state machine can be tested
 * without rendering, and so the component never re-derives copy inline.
 */

export const AGE_VERIFICATION_STATES = Object.freeze({
  MINOR: 'minor',
  DOB_MISSING: 'dob_missing',
  LOCKED: 'locked',
  INVALIDATED: 'invalidated',
  PROCESSING: 'processing',
  REQUIRES_INPUT: 'requires_input',
  CANCELED: 'canceled',
  DOB_MISMATCH: 'dob_mismatch',
  FAILED: 'failed',
  VERIFIED: 'verified',
});

/** Repeated verbatim in every state — it mirrors what the backend actually does. */
export const PRIVACY_BOUNDARY =
  'Private to you. Shared only if you attach it to a specific submission.';

/** The three-line data story shown before any handoff to Stripe. */
export const DATA_STORY = Object.freeze([
  'Stripe checks a government ID and a selfie — Pholio never sees them',
  'We store only the result: verified 18+, and whether the birthdate matches your profile',
  'Stripe deletes the documents after evaluation — we ask for redaction automatically.',
]);

export const CONSENT_NOTE =
  'Continuing shares your ID and selfie with Stripe for this check.';

export const DOB_INVALIDATION_NOTE =
  'Editing your date of birth afterwards ends the verification, and you run the check again.';

/**
 * Only `processing` is a genuine "Stripe is thinking" state. `creating` means
 * our own row exists but the talent has not been handed off yet, so it belongs
 * with the untouched states rather than with the spinner.
 */
const POLLING_STATUSES = new Set(['processing']);

export function isPollingStatus(status) {
  return POLLING_STATUSES.has(status);
}

const POLL_BASE_MS = 3000;
const POLL_MAX_MS = 30000;
const POLL_FACTOR = 1.6;

/**
 * Backoff for the status poll: 3s, 4.8s, 7.7s … capped at 30s. React Query
 * pauses interval refetches while the tab is hidden, and the section also
 * refetches on window focus, so there is no need for a hard stop.
 */
export function nextPollDelay(attempt = 0) {
  const n = Number.isFinite(attempt) && attempt > 0 ? attempt : 0;
  return Math.min(Math.round(POLL_BASE_MS * POLL_FACTOR ** n), POLL_MAX_MS);
}

const FAILURE_REASONS = {
  abandoned: 'The check was left unfinished at Stripe.',
  consent_declined: 'The check stopped at Stripe’s consent step.',
  country_not_supported:
    'Stripe does not support identity documents from that country yet.',
  device_not_supported: 'That device could not complete Stripe’s camera step.',
  document_expired: 'The document Stripe saw has expired.',
  document_type_not_supported: 'Stripe does not accept that document type.',
  document_unverified_other: 'Stripe could not read the document clearly.',
  dob_mismatch: 'The ID’s birthdate doesn’t match your profile',
  selfie_document_missing_photo:
    'The document Stripe saw has no photo to match the selfie against.',
  selfie_face_mismatch: 'The selfie did not match the photo on the document.',
  selfie_manipulated: 'Stripe could not accept that selfie.',
  selfie_unverified_other: 'Stripe could not complete the selfie match.',
  under_18: 'The ID’s birthdate puts you under 18, so adult context stays closed.',
  under_supported_age:
    'Stripe does not run identity checks for that age in your region.',
};

export function describeFailure(failureCode) {
  if (!failureCode) return 'The check was left unfinished at Stripe.';
  return FAILURE_REASONS[failureCode] || 'Stripe could not complete the check.';
}

/**
 * Dates arrive either as `YYYY-MM-DD` or as a full ISO timestamp (the
 * PostgreSQL quirk documented in CLAUDE.md). Formatting in UTC keeps a
 * date-only value from sliding a day backwards west of Greenwich.
 */
export function formatVerifiedDate(value) {
  if (!value) return null;
  const raw = value instanceof Date ? value.toISOString() : String(value).trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const instant = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
    : new Date(raw);
  if (Number.isNaN(instant.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(instant);
}

export function verifiedProvenanceLine(verifiedAt) {
  const date = formatVerifiedDate(verifiedAt);
  return date
    ? `Verified 18+ · documents redacted by Stripe · ${date}`
    : 'Verified 18+ · documents redacted by Stripe';
}

const HANDOFF_DEFAULTS = {
  showExplainer: true,
  actionLabel: 'Try again',
  actionVariant: 'secondary',
  entryLabel: 'Resume',
};

/**
 * @param {object} args
 * @param {{verifiedAdult?: boolean, verifiedAt?: string|null, status?: string, failureCode?: string|null}} [args.verification]
 * @param {number|null} [args.age] Age computed from the profile date of birth.
 */
export function resolveAgeVerificationState({ verification, age } = {}) {
  if (age != null && age < 18) {
    return {
      id: AGE_VERIFICATION_STATES.MINOR,
      summaryLine: null,
      statusLine: null,
      entryLabel: null,
      showExplainer: false,
      showForm: false,
      showDobFix: false,
      actionLabel: null,
      actionVariant: null,
      isPolling: false,
    };
  }

  if (age == null) {
    return {
      id: AGE_VERIFICATION_STATES.DOB_MISSING,
      summaryLine: 'Optional. Add your date of birth in Identity to use this.',
      statusLine:
        'This needs your date of birth first — Stripe compares the ID against it.',
      entryLabel: 'Set up',
      showExplainer: false,
      showForm: false,
      showDobFix: true,
      actionLabel: null,
      actionVariant: null,
      isPolling: false,
    };
  }

  const {
    verifiedAdult = false,
    verifiedAt = null,
    status = 'not_started',
    failureCode = null,
  } = verification || {};

  if (verifiedAdult === true) {
    return {
      id: AGE_VERIFICATION_STATES.VERIFIED,
      summaryLine: verifiedProvenanceLine(verifiedAt),
      statusLine: verifiedProvenanceLine(verifiedAt),
      entryLabel: 'Open',
      showExplainer: false,
      showForm: true,
      showDobFix: false,
      actionLabel: null,
      actionVariant: null,
      isPolling: false,
    };
  }

  // A 'verified' session with the flag cleared can only mean the profile date
  // of birth changed after the check. Say so instead of silently resetting.
  if (status === 'verified') {
    return {
      ...HANDOFF_DEFAULTS,
      id: AGE_VERIFICATION_STATES.INVALIDATED,
      summaryLine: 'Your date of birth changed, so the earlier check no longer applies.',
      statusLine:
        'Not verified — your date of birth changed after the last check, which ended it.',
      entryLabel: 'Set up',
      actionLabel: 'Verify with Stripe',
      actionVariant: 'primary',
      showForm: false,
      showDobFix: false,
      isPolling: false,
    };
  }

  if (status === 'processing') {
    return {
      id: AGE_VERIFICATION_STATES.PROCESSING,
      summaryLine: 'Stripe is reviewing your check.',
      statusLine:
        'Stripe is reviewing — usually under a minute; this page updates itself',
      entryLabel: 'View',
      showExplainer: false,
      showForm: false,
      showDobFix: false,
      actionLabel: null,
      actionVariant: null,
      isPolling: true,
    };
  }

  if (status === 'requires_input') {
    return {
      ...HANDOFF_DEFAULTS,
      id: AGE_VERIFICATION_STATES.REQUIRES_INPUT,
      summaryLine: 'Your check needs one more step.',
      statusLine: describeFailure(failureCode),
      showForm: false,
      showDobFix: false,
      isPolling: false,
    };
  }

  if (status === 'canceled') {
    return {
      ...HANDOFF_DEFAULTS,
      id: AGE_VERIFICATION_STATES.CANCELED,
      summaryLine: 'The last check was canceled.',
      statusLine: 'The check was canceled before it finished. Nothing was stored.',
      showForm: false,
      showDobFix: false,
      isPolling: false,
    };
  }

  if (status === 'failed' && failureCode === 'dob_mismatch') {
    return {
      ...HANDOFF_DEFAULTS,
      id: AGE_VERIFICATION_STATES.DOB_MISMATCH,
      summaryLine: 'The ID’s birthdate doesn’t match your profile.',
      statusLine: 'The ID’s birthdate doesn’t match your profile',
      showForm: false,
      showDobFix: true,
      isPolling: false,
    };
  }

  if (status === 'failed') {
    return {
      ...HANDOFF_DEFAULTS,
      id: AGE_VERIFICATION_STATES.FAILED,
      summaryLine: 'The last check did not pass.',
      statusLine: describeFailure(failureCode),
      showForm: false,
      showDobFix: false,
      isPolling: false,
    };
  }

  return {
    ...HANDOFF_DEFAULTS,
    id: AGE_VERIFICATION_STATES.LOCKED,
    summaryLine: 'Optional. Never shown to agencies or in discovery.',
    statusLine: 'Not verified.',
    entryLabel: 'Set up',
    actionLabel: 'Verify with Stripe',
    actionVariant: 'primary',
    showForm: false,
    showDobFix: false,
    isPolling: false,
  };
}
