"use strict";

const { calculateProfileStrength } = require("./profile-strength");
const { auditSubmissionPackage } = require("./package-intelligence");
const {
  validateImagesForDistribution,
} = require("../../../shared/lib/image-rights");
const { isMinorProfile, hasGuardianConsent } = require("../../../shared/lib/talent-age");
const { hasCoreMeasurements } = require("../../../shared/lib/stats-formatter");

// Canonical presence check (audit P1-3): the shared formatter decides the core
// circumference per stats_track — chest_cm satisfies menswear/ungendered so a
// male "Chest" no longer fails readiness; bust_cm satisfies womenswear (with a
// legacy cross-fallback). Height + core + waist + hips are all required.
function hasRequiredMeasurements(profile) {
  return hasCoreMeasurements(profile);
}

function hasRequiredContact(profile) {
  const email = typeof profile?.email === "string" ? profile.email.trim() : "";
  const phone = typeof profile?.phone === "string" ? profile.phone.trim() : "";
  return Boolean(email && phone);
}

function evaluateSendReadiness(
  profile,
  images = [],
  rightsMap = new Map(),
  options = {},
) {
  const list = Array.isArray(images) ? images : [];
  const strength = calculateProfileStrength({ ...(profile || {}), images: list });
  const audit = auditSubmissionPackage({ images: list });
  const sendBlockers = [];
  const rightsValidation = validateImagesForDistribution(list, rightsMap, {
    requireGuardianRelease: isMinorProfile(profile),
  });

  if (isMinorProfile(profile) && !hasGuardianConsent(profile)) {
    sendBlockers.push({
      code: "minor_guardian_consent_required",
      key: "guardian_consent",
      message:
        "A parent or guardian must verify consent before a minor can submit to an agency.",
    });
  } else if (isMinorProfile(profile) && options.agencyConsentGranted !== true) {
    sendBlockers.push({
      code: "guardian_agency_consent_required",
      key: "guardian_agency_consent",
      message:
        "A parent or guardian must authorize this submission to the selected agency.",
    });
  }
  if (!strength.isCoreReady) {
    sendBlockers.push({
      code: "profile_incomplete",
      key: "core",
      message: "Complete submission-core essentials before applying.",
    });
  }
  if (!audit.slots.headshot) {
    sendBlockers.push({
      code: "missing_digital_headshot",
      key: "photo_headshot",
      message: "Add a clean digital headshot to your package.",
    });
  }
  if (!audit.slots.fullBody) {
    sendBlockers.push({
      code: "missing_digital_full_length",
      key: "photo_full_body",
      message: "Add a clean digital full-length shot to your package.",
    });
  }
  if (audit.recency.isStale) {
    sendBlockers.push({
      code: "stale_digitals",
      key: "digitals_recency",
      message: "Refresh your digitals - your set is out of date for agency review.",
    });
  }
  const retouchedDigitals = list.filter(
    (image) =>
      String(image?.image_type || "").toLowerCase() === "digital" &&
      Boolean(image?.retouched_at),
  );
  if (retouchedDigitals.length > 0) {
    sendBlockers.push({
      code: "retouched_digital_not_allowed",
      key: "digitals_retouching",
      message:
        "Agency digitals must be unretouched. Replace any digital marked as retouched.",
      imageIds: retouchedDigitals.map((image) => image.id).filter(Boolean),
    });
  }
  if (!hasRequiredMeasurements(profile)) {
    sendBlockers.push({
      code: "missing_measurements",
      key: "measurements",
      message: "Complete height and core measurements.",
    });
  }
  if (!hasRequiredContact(profile)) {
    sendBlockers.push({
      code: "missing_contact",
      key: "contact",
      message: "Add email and phone in settings.",
    });
  }
  if (!rightsValidation.ok) {
    sendBlockers.push({
      code: "missing_distribution_rights",
      key: "distribution_rights",
      message:
        "Some package images are missing distribution rights. Add rights details before applying.",
      errors: rightsValidation.errors,
    });
  }

  return {
    isCoreReady: !!strength.isCoreReady,
    isSendReady: sendBlockers.length === 0,
    sendBlockers,
    strength,
    audit,
  };
}

module.exports = {
  evaluateSendReadiness,
};
