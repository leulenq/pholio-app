"use strict";

/**
 * Product-level PITS simulation — models what talent sees across surfaces
 * using server readiness/package modules + Apply/Gating logic mirrored from client.
 */

const { calculateProfileStrength } = require("../../src/domains/talent/services/profile-strength");
const {
  analyzePackageIntelligence,
  auditSubmissionPackage,
  resolveReadinessGuidance,
} = require("../../src/domains/talent/services/package-intelligence");
const {
  analyzeDigitalsReadiness,
  isHeadshotImage,
  isFullBodyImage,
  isDigitalSlot,
  isBookFullLengthImage,
  isBookHeadshotImage,
} = require("../../src/domains/talent/services/profile-readiness-images");
const { applyClassificationPolicy } = require("../../src/domains/talent/services/image-classification-policy");

const {
  formatFrameTypeLabel,
  DIGITALS_ADVISORY_ITEMS,
} = require("../../src/shared/constants/frame-taxonomy");

const DIGITALS_ADVISORY = DIGITALS_ADVISORY_ITEMS;

const BASE_PROFILE = {
  first_name: "Alex",
  last_name: "River",
  city: "New York",
  date_of_birth: "1998-01-01",
  gender: "Female",
  height_cm: 175,
  bust_cm: 86,
  waist_cm: 61,
  hips_cm: 90,
  email: "alex@example.com",
  phone: "555-0100",
};

const NOW = new Date("2026-06-24T12:00:00.000Z");

function daysAgo(days, now = NOW) {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function frameCaption(image) {
  return formatFrameTypeLabel(image?.shot_type, image?.image_type, image?.style_type) || "Untyped";
}

/** Mirrors ApplyExperience checks + buildFitSignals */
function simulateApply({ profile, images, now = NOW }) {
  const list = Array.isArray(images) ? images : [];
  const packageAudit = auditSubmissionPackage({ images: list, now });
  const hasHeadshot = list.some(isHeadshotImage);
  const hasFullBody = list.some(isFullBodyImage);
  const hasMeasurements =
    !!profile?.height_cm &&
    !!profile?.bust_cm &&
    !!profile?.waist_cm &&
    !!profile?.hips_cm;
  const hasContact = !!profile?.email && !!profile?.phone;
  const recencyIsFresh = !packageAudit.recency.isStale;

  const checks = [
    { label: "Digital headshot", complete: hasHeadshot },
    { label: "Full-length digital", complete: hasFullBody },
    { label: "Current digitals", complete: recencyIsFresh },
    { label: "Measurements", complete: hasMeasurements },
    { label: "Contact", complete: hasContact },
  ];

  const digitalsReadiness = analyzeDigitalsReadiness(list);
  const digitalsGaps = DIGITALS_ADVISORY.filter((item) => !digitalsReadiness[item.key]);
  const untypedCount = list.filter((img) => !String(img?.shot_type || "").trim()).length;

  const has = (label) => !!checks.find((c) => c.label === label)?.complete;
  const fitSignals = {
    recentDigitalsMet: recencyIsFresh,
    headshotMet: has("Digital headshot"),
    fullBodyMet: has("Full-length digital"),
  };

  const gatingBlocked = !calculateProfileStrength({ ...profile, images: list }).isCoreReady;
  const missingChecks = checks.filter((c) => !c.complete);
  const canSubmit = !gatingBlocked && missingChecks.length === 0;

  return {
    checks,
    missingChecks,
    canSubmit,
    packageAudit,
    digitalsGaps,
    untypedCount,
    fitSignals,
    advisoryIds: packageAudit.advisories.map((a) => a.id),
  };
}

/** Mirrors checkGatingStatus essentials */
function simulateGating({ profile, images, now = NOW }) {
  const list = Array.isArray(images) ? images : [];
  const strength = calculateProfileStrength({ ...profile, images: list });
  const pkg = analyzePackageIntelligence({ images: list, now });
  const photoFields = strength.allNextSteps.filter((s) =>
    ["photo_headshot", "photo_full_body"].includes(s.key),
  );
  const hasContact = !!String(profile?.email || "").trim() && !!String(profile?.phone || "").trim();
  const sendBlockers = [];
  if (!strength.isCoreReady) {
    sendBlockers.push("Complete submission-core essentials before applying.");
  }
  if (!hasContact) {
    sendBlockers.push("Add email and phone in settings.");
  }
  if (!pkg.slots.headshot) {
    sendBlockers.push("Add a clean digital headshot to your package.");
  }
  if (!pkg.slots.fullBody) {
    sendBlockers.push("Add a clean digital full-length shot to your package.");
  }
  if (pkg.recency.isStale) {
    sendBlockers.push("Refresh your digitals - your set is out of date for agency review.");
  }

  return {
    isBlocked: !strength.isCoreReady,
    isCoreReady: strength.isCoreReady,
    isSendReady: sendBlockers.length === 0,
    sendBlockers,
    missingPhotoKeys: photoFields.map((s) => s.key),
    photoGuidance: Object.fromEntries(
      photoFields.map((s) => [s.key, { title: s.title, why: s.why }]),
    ),
    hasBookFullLengthAdvisory: pkg.advisories.some(
      (a) => a.id === "book_full_length_not_digital",
    ),
    hasBookHeadshotAdvisory: pkg.advisories.some(
      (a) => a.id === "book_headshot_not_digital",
    ),
  };
}

function simulateReadiness({ profile, images, now = NOW }) {
  const list = Array.isArray(images) ? images : [];
  const strength = calculateProfileStrength({ ...profile, images: list });
  const pkg = analyzePackageIntelligence({ images: list, now });

  const fullBodyGuidance = resolveReadinessGuidance("photo_full_body", pkg.advisories, {
    label: "Full-Length Digital",
    why: "default",
  });
  const headshotGuidance = resolveReadinessGuidance("photo_headshot", pkg.advisories, {
    label: "Digital Headshot",
    why: "default",
  });

  return {
    isCoreReady: strength.isCoreReady,
    fieldCompletion: strength.fieldCompletion,
    fullBodyGuidance,
    headshotGuidance,
    slots: pkg.slots,
    advisoryIds: pkg.advisories.map((a) => a.id),
  };
}

function simulateMedia({ images, now = NOW }) {
  const list = Array.isArray(images) ? images : [];
  const pkg = analyzePackageIntelligence({ images: list, now });

  const captions = list.map((img) => ({
    id: img.id,
    caption: frameCaption(img),
    isDigital: isDigitalSlot(img),
    isBookFullLength: isBookFullLengthImage(img),
    isBookHeadshot: isBookHeadshotImage(img),
  }));

  const gapIds = ["headshot", "fullbody"].filter((id) => {
    if (id === "headshot") return !list.some(isHeadshotImage);
    return !list.some(isFullBodyImage);
  });

  const suppressFullbody = pkg.advisories.some((a) => a.id === "book_full_length_not_digital");
  const suppressHeadshot = pkg.advisories.some((a) => a.id === "book_headshot_not_digital");

  const bookIntelSuggestionIds = [
    ...pkg.advisories
      .filter((a) =>
        [
          "book_full_length_not_digital",
          "book_headshot_not_digital",
          "stale_digitals",
          "portfolio_as_digital",
        ].includes(a.id),
      )
      .map((a) => a.id),
    ...(suppressFullbody ? [] : gapIds.includes("fullbody") ? ["fullbody"] : []),
    ...(suppressHeadshot ? [] : gapIds.includes("headshot") ? ["headshot"] : []),
  ];

  return {
    captions,
    gapIds,
    bookIntelSuggestionIds,
    showsBookFullLengthAdvisory: pkg.advisories.some(
      (a) => a.id === "book_full_length_not_digital",
    ),
  };
}

function simulateClassificationWrite(imageRow, classification) {
  return applyClassificationPolicy({ imageRow, classification });
}

function detectDrift({ profile, images, now = NOW }) {
  const list = Array.isArray(images) ? images : [];
  const readiness = simulateReadiness({ profile, images: list, now });
  const apply = simulateApply({ profile, images: list, now });
  const gating = simulateGating({ profile, images: list, now });
  const drifts = [];

  const strengthHeadshot = readiness.fieldCompletion.photo_headshot;
  const applyHeadshot = apply.checks.find((c) => c.label === "Digital headshot")?.complete;
  if (strengthHeadshot !== applyHeadshot) {
    drifts.push({
      code: "headshot_gate_mismatch",
      detail: `Readiness headshot=${strengthHeadshot}, Apply headshot=${applyHeadshot}`,
    });
  }

  const strengthFullBody = readiness.fieldCompletion.photo_full_body;
  const applyFullBody = apply.checks.find((c) => c.label === "Full-length digital")?.complete;
  if (strengthFullBody !== applyFullBody) {
    drifts.push({
      code: "fullbody_gate_mismatch",
      detail: `Readiness full-body=${strengthFullBody}, Apply full-body=${applyFullBody}`,
    });
  }

  if (apply.packageAudit.canSend && !apply.canSubmit && apply.missingChecks.length > 0) {
    drifts.push({
      code: "audit_can_send_vs_apply",
      detail: "auditSubmissionPackage.canSend true but Apply blocks on additional checks",
    });
  }

  if (!apply.packageAudit.canSend && apply.canSubmit) {
    drifts.push({
      code: "apply_allows_incomplete_audit",
      detail: "Apply canSubmit true while auditSubmissionPackage.canSend false",
    });
  }

  if (apply.fitSignals.recentDigitalsMet && apply.packageAudit.recency.isStale) {
    drifts.push({
      code: "fit_recent_digitals_vs_recency",
      detail: 'Dossier "Recent digitals" met but package recency is stale',
    });
  }

  if (
    !apply.fitSignals.recentDigitalsMet &&
    !apply.packageAudit.recency.isStale &&
    apply.checks.find((c) => c.label === "Digital headshot")?.complete &&
    apply.checks.find((c) => c.label === "Full-length digital")?.complete
  ) {
    drifts.push({
      code: "fit_recent_digitals_vs_optional_gaps",
      detail:
        'Dossier "Recent digitals" false due to optional digitals gaps, not staleness',
    });
  }

  if (gating.isBlocked !== !readiness.isCoreReady) {
    drifts.push({
      code: "gating_vs_readiness_core",
      detail: `Gating blocked=${gating.isBlocked}, coreReady=${readiness.isCoreReady}`,
    });
  }

  if (
    readiness.slots.hasBookFullLength &&
    !readiness.slots.fullBody &&
    !readiness.fullBodyGuidance.why.includes("book")
  ) {
    drifts.push({
      code: "missing_book_full_length_guidance",
      detail: "Book full-length exists but readiness lacks contextual guidance",
    });
  }

  return drifts;
}

function simulateProduct({ profile = BASE_PROFILE, images = [], now = NOW } = {}) {
  const readiness = simulateReadiness({ profile, images, now });
  const apply = simulateApply({ profile, images, now });
  const gating = simulateGating({ profile, images, now });
  const media = simulateMedia({ images, now });
  const drifts = detectDrift({ profile, images, now });

  return { readiness, apply, gating, media, drifts };
}

module.exports = {
  BASE_PROFILE,
  NOW,
  daysAgo,
  simulateProduct,
  simulateApply,
  simulateGating,
  simulateReadiness,
  simulateMedia,
  simulateClassificationWrite,
  detectDrift,
  frameCaption,
};
