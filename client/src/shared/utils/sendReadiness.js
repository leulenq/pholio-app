import { calculateProfileStrength } from './profileScoring';
import { auditSubmissionPackage } from './packageIntelligence';
import { hasGuardianConsent, isMinorProfile } from './talentAge';
import {
  buildImageRightsMapFromImages,
  validateImagesForDistribution,
} from './imageRights';

function isPresent(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function measurementValue(profile, keys) {
  for (const key of keys) {
    const value = profile?.[key];
    if (isPresent(value)) return value;
  }
  return null;
}

function isMensProfile(profile) {
  const normalizedGender = String(profile?.gender || '').trim().toLowerCase();
  return ['male', 'man', 'men', 'masculine', 'boy'].includes(normalizedGender);
}

function hasRequiredMeasurements(profile) {
  const hasHeight = !!measurementValue(profile, ['height_cm']);
  const hasWaist = !!measurementValue(profile, ['waist', 'waist_cm']);
  const hasHips = !!measurementValue(profile, ['hips', 'hips_cm']);
  const hasBustOrChest = !!measurementValue(profile, ['bust', 'bust_cm', 'chest', 'chest_cm']);
  const hasChest = !!measurementValue(profile, ['chest', 'chest_cm']);
  const hasCoreMeasurement = isMensProfile(profile) ? hasChest : hasBustOrChest;

  return hasHeight && hasCoreMeasurement && hasWaist && hasHips;
}

function hasRequiredContact(profile) {
  const email = typeof profile?.email === 'string' ? profile.email.trim() : '';
  const phone = typeof profile?.phone === 'string' ? profile.phone.trim() : '';
  return Boolean(email && phone);
}

/** User-facing copy for a send blocker object or legacy string. */
export function sendBlockerLabel(blocker) {
  if (typeof blocker === 'string') return blocker;
  return blocker?.message || blocker?.task || blocker?.label || 'Complete this requirement';
}

/**
 * Shared Apply/send gate readiness.
 * Core readiness remains the platform gate; send readiness adds contact and package recency checks.
 */
export function evaluateSendReadiness(profile, images = [], options = {}) {
  const imageList = Array.isArray(images) ? images : [];
  const strength = calculateProfileStrength({
    ...(profile || {}),
    images: imageList,
  });
  const audit = auditSubmissionPackage({ images: imageList });
  const sendBlockers = [];
  const rightsMap =
    options.rightsMap instanceof Map
      ? options.rightsMap
      : buildImageRightsMapFromImages(imageList);
  const rightsValidation = validateImagesForDistribution(imageList, rightsMap, {
    requireGuardianRelease: isMinorProfile(profile),
  });

  if (isMinorProfile(profile) && !hasGuardianConsent(profile)) {
    sendBlockers.push({
      code: 'minor_guardian_consent_required',
      key: 'guardian_consent',
      message:
        'A parent or guardian must verify consent before a minor can submit to an agency.',
    });
  } else if (isMinorProfile(profile) && options.agencyConsentGranted !== true) {
    sendBlockers.push({
      code: 'guardian_agency_consent_required',
      key: 'guardian_agency_consent',
      message: 'A parent or guardian must authorize this submission to the selected agency.',
    });
  }
  if (!strength.isCoreReady) {
    sendBlockers.push({
      code: 'profile_incomplete',
      key: 'core',
      message: 'Complete submission-core essentials before applying.',
    });
  }
  if (!audit.slots.headshot) {
    sendBlockers.push({
      code: 'missing_digital_headshot',
      key: 'photo_headshot',
      message: 'Add a clean digital headshot to your package.',
    });
  }
  if (!audit.slots.fullBody) {
    sendBlockers.push({
      code: 'missing_digital_full_length',
      key: 'photo_full_body',
      message: 'Add a clean digital full-length shot to your package.',
    });
  }
  if (audit.recency.isStale) {
    sendBlockers.push({
      code: 'stale_digitals',
      key: 'digitals_recency',
      message: 'Refresh your digitals - your set is out of date for agency review.',
    });
  }
  const retouchedDigitals = imageList.filter(
    (image) =>
      String(image?.image_type || '').toLowerCase() === 'digital' &&
      Boolean(image?.retouched_at),
  );
  if (retouchedDigitals.length > 0) {
    sendBlockers.push({
      code: 'retouched_digital_not_allowed',
      key: 'digitals_retouching',
      message: 'Agency digitals must be unretouched. Replace any digital marked as retouched.',
      imageIds: retouchedDigitals.map((image) => image.id).filter(Boolean),
    });
  }
  if (!hasRequiredMeasurements(profile)) {
    sendBlockers.push({
      code: 'missing_measurements',
      key: 'measurements',
      message: 'Complete height and core measurements.',
    });
  }
  if (!hasRequiredContact(profile)) {
    sendBlockers.push({
      code: 'missing_contact',
      key: 'contact',
      message: 'Add email and phone in settings.',
    });
  }
  if (options.includeDistributionRights !== false && !rightsValidation.ok) {
    sendBlockers.push({
      code: 'missing_distribution_rights',
      key: 'distribution_rights',
      message:
        'Some package images are missing distribution rights. Add rights details before applying.',
      errors: rightsValidation.errors,
    });
  }

  return {
    isCoreReady: strength.isCoreReady,
    isSendReady: sendBlockers.length === 0,
    sendBlockers,
    strength,
    audit,
  };
}
