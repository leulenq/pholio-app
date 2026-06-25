/**
 * Talent age + minor compliance policy (client mirror).
 * Keep in sync with src/shared/lib/talent-age.js
 */

export const MINOR_AGE_THRESHOLD = 18;

const SENSITIVE_MEASUREMENT_FIELDS = new Set([
  'bust',
  'waist',
  'hips',
  'bust_cm',
  'waist_cm',
  'hips_cm',
  'inseam_cm',
  'weight',
  'weight_kg',
  'weight_lbs',
  'measurements',
]);

export function parseDateOfBirthParts(dob) {
  if (dob == null || dob === '') return null;
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

export function computeAge(dob, referenceDate = new Date()) {
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

export function isMinorProfile(profile, referenceDate = new Date()) {
  const age = computeAge(profile?.date_of_birth ?? profile?.dob, referenceDate);
  return age != null && age < MINOR_AGE_THRESHOLD;
}

export function hasGuardianConsent(profile) {
  return Boolean(profile?.guardian_consent_at);
}

export function hasWorkPermitOnFile(profile) {
  return profile?.work_permit_on_file === true || profile?.work_permit_on_file === 1;
}

export function minorSensitiveFieldsUnlocked(profile, referenceDate = new Date()) {
  if (!isMinorProfile(profile, referenceDate)) return true;
  return hasGuardianConsent(profile);
}

export function hasRecordedDateOfBirth(profile) {
  return parseDateOfBirthParts(profile?.date_of_birth ?? profile?.dob) != null;
}

export function canCollectSensitiveProfileFields(profile, referenceDate = new Date()) {
  if (!hasRecordedDateOfBirth(profile)) return false;
  return minorSensitiveFieldsUnlocked(profile, referenceDate);
}

export function minorPublicExposureAllowed(profile, referenceDate = new Date()) {
  if (!isMinorProfile(profile, referenceDate)) return true;
  return hasGuardianConsent(profile);
}

export function isSensitiveReadinessKey(key) {
  return key === 'measurements' || key === 'photo_full_body' || key === 'weight';
}
