"use strict";

const { calculateProfileStrength } = require("./profile-strength");
const { auditSubmissionPackage } = require("./package-intelligence");
const {
  validateImagesForDistribution,
} = require("../../../shared/lib/image-rights");

function isPresent(value) {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "string") return value.trim() !== "";
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
  const normalizedGender = String(profile?.gender || "").trim().toLowerCase();
  return ["male", "man", "men", "masculine", "boy"].includes(normalizedGender);
}

function hasRequiredMeasurements(profile) {
  const hasHeight = !!measurementValue(profile, ["height_cm"]);
  const hasWaist = !!measurementValue(profile, ["waist", "waist_cm"]);
  const hasHips = !!measurementValue(profile, ["hips", "hips_cm"]);
  const hasBustOrChest = !!measurementValue(profile, [
    "bust",
    "bust_cm",
    "chest",
    "chest_cm",
  ]);
  const hasChest = !!measurementValue(profile, ["chest", "chest_cm"]);
  const hasCoreMeasurement = isMensProfile(profile) ? hasChest : hasBustOrChest;

  return hasHeight && hasCoreMeasurement && hasWaist && hasHips;
}

function hasRequiredContact(profile) {
  const email = typeof profile?.email === "string" ? profile.email.trim() : "";
  const phone = typeof profile?.phone === "string" ? profile.phone.trim() : "";
  return Boolean(email && phone);
}

function evaluateSendReadiness(profile, images = [], rightsMap = new Map()) {
  const list = Array.isArray(images) ? images : [];
  const strength = calculateProfileStrength({ ...(profile || {}), images: list });
  const audit = auditSubmissionPackage({ images: list });
  const sendBlockers = [];
  const rightsValidation = validateImagesForDistribution(list, rightsMap);

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
