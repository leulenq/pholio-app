/**
 * Talent age + minor compliance policy (server canonical).
 * Keep in sync with client/src/shared/utils/talentAge.js
 */

const MINOR_AGE_THRESHOLD = 18;

const SENSITIVE_MEASUREMENT_FIELDS = new Set([
  "bust",
  "waist",
  "hips",
  "bust_cm",
  "waist_cm",
  "hips_cm",
  "inseam_cm",
  "weight",
  "weight_kg",
  "weight_lbs",
  "measurements",
]);

const SENSITIVE_IMAGE_SHOT_TYPES = new Set([
  "full_length",
  "full_body",
]);

/**
 * @param {Date|string|null|undefined} dob
 * @returns {{ year: number, month: number, day: number }|null}
 */
function parseDateOfBirthParts(dob) {
  if (dob == null || dob === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dob).trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return { year, month, day };
}

/**
 * @param {Date|string|null|undefined} dob
 * @param {Date} [referenceDate]
 * @returns {number|null}
 */
function computeAge(dob, referenceDate = new Date()) {
  const parts = parseDateOfBirthParts(dob);
  if (!parts) return null;
  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  let age = ref.getUTCFullYear() - parts.year;
  const beforeBirthday =
    ref.getUTCMonth() + 1 < parts.month ||
    (ref.getUTCMonth() + 1 === parts.month && ref.getUTCDate() < parts.day);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/**
 * @param {object|null|undefined} profile
 * @param {Date} [referenceDate]
 * @returns {boolean}
 */
function isMinorProfile(profile, referenceDate = new Date()) {
  const age = computeAge(profile?.date_of_birth ?? profile?.dob, referenceDate);
  return age != null && age < MINOR_AGE_THRESHOLD;
}

/**
 * @param {object|null|undefined} profile
 * @returns {boolean}
 */
function hasGuardianConsent(profile) {
  return Boolean(profile?.guardian_consent_at);
}

/**
 * @param {object|null|undefined} profile
 * @returns {boolean}
 */
function hasWorkPermitOnFile(profile) {
  return profile?.work_permit_on_file === true || profile?.work_permit_on_file === 1;
}

/**
 * @param {object|null|undefined} profile
 * @param {Date} [referenceDate]
 * @returns {boolean}
 */
function minorSensitiveFieldsUnlocked(profile, referenceDate = new Date()) {
  if (!isMinorProfile(profile, referenceDate)) return true;
  return hasGuardianConsent(profile);
}

/**
 * @param {object|null|undefined} profile
 * @returns {boolean}
 */
function hasRecordedDateOfBirth(profile) {
  return parseDateOfBirthParts(profile?.date_of_birth ?? profile?.dob) != null;
}

/**
 * Sensitive stats require DOB on file and minor consent when under 18.
 *
 * Fail-closed on age: without a present, valid DOB we cannot prove the talent is
 * an adult, so sensitive measurement collection is denied. Returning false for a
 * missing/unparseable DOB is intentional and must not be relaxed.
 *
 * @param {object|null|undefined} profile
 * @param {Date} [referenceDate]
 * @returns {boolean}
 */
function canCollectSensitiveProfileFields(profile, referenceDate = new Date()) {
  // No verifiable age on file => deny (fail closed).
  if (!hasRecordedDateOfBirth(profile)) return false;
  return minorSensitiveFieldsUnlocked(profile, referenceDate);
}

/**
 * @param {Record<string, unknown>} data
 * @returns {string[]}
 */
function listSensitiveProfileUpdateFields(data = {}) {
  return Object.keys(data).filter((key) => SENSITIVE_MEASUREMENT_FIELDS.has(key));
}

/**
 * @param {string|null|undefined} shotType
 * @returns {boolean}
 */
function isSensitiveImageShotType(shotType) {
  if (!shotType) return false;
  return SENSITIVE_IMAGE_SHOT_TYPES.has(String(shotType).toLowerCase());
}

/**
 * Public portfolio / comp-card exposure allowed for this profile.
 *
 * Fail-closed on age: a profile with no recorded (or unparseable) DOB is NOT
 * cleared for public exposure / contact display. Previously a missing DOB made
 * `isMinorProfile` return false, which let an age-unknown profile pass as if it
 * were an adult. Because minors are self-declared via a NULLABLE date_of_birth,
 * "age unknown" must be treated as "not cleared" until a valid DOB (and, when it
 * indicates a minor, guardian consent) is on file.
 *
 * Allowed only when: a valid DOB is present AND (the talent is an adult OR a
 * minor with guardian consent recorded). A normal adult with a valid DOB still
 * passes unchanged.
 *
 * @param {object|null|undefined} profile
 * @param {Date} [referenceDate]
 * @returns {boolean}
 */
function minorPublicExposureAllowed(profile, referenceDate = new Date()) {
  // No verifiable age on file => deny (fail closed).
  if (!hasRecordedDateOfBirth(profile)) return false;
  // Adults with a valid DOB are allowed; minors require guardian consent.
  if (!isMinorProfile(profile, referenceDate)) return true;
  return hasGuardianConsent(profile);
}

module.exports = {
  MINOR_AGE_THRESHOLD,
  SENSITIVE_MEASUREMENT_FIELDS,
  SENSITIVE_IMAGE_SHOT_TYPES,
  parseDateOfBirthParts,
  computeAge,
  isMinorProfile,
  hasGuardianConsent,
  hasWorkPermitOnFile,
  minorSensitiveFieldsUnlocked,
  hasRecordedDateOfBirth,
  canCollectSensitiveProfileFields,
  listSensitiveProfileUpdateFields,
  isSensitiveImageShotType,
  minorPublicExposureAllowed,
};
