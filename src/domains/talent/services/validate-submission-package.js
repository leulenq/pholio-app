"use strict";

const { evaluateSendReadiness } = require("./send-readiness");
const { hasCoreMeasurements } = require("../../../shared/lib/stats-formatter");

/**
 * Event-intake blockers, per open call.
 *
 * The organizer decides on their call whether a walk video, stated
 * availability or confirmed measurements are required; the applicant's UI
 * advises, and this is where it is actually enforced. The codes are stable
 * strings because the funnel logs them as `intake_blocked.reason` (design §g,
 * event 4) — renaming one silently breaks the only measurement of why
 * applications leak between started and completed.
 */
const EVENT_INTAKE_BLOCKER_CODES = Object.freeze({
  WALK_VIDEO: "event_walk_video_required",
  AVAILABILITY: "event_availability_required",
  MEASUREMENTS: "event_measurements_required",
});

function evaluateEventIntake(profile, intake = {}, submission = {}) {
  const blockers = [];

  if (intake.requiresWalkVideo === true && !submission.walkVideoUrl) {
    blockers.push({
      code: EVENT_INTAKE_BLOCKER_CODES.WALK_VIDEO,
      key: "walk_video",
      message:
        "This casting requires a walk video. Paste an unlisted YouTube, Vimeo or Drive link.",
    });
  }

  if (intake.requiresAvailability === true) {
    const availability = submission.availability;
    if (!availability?.from || !availability?.to) {
      blockers.push({
        code: EVENT_INTAKE_BLOCKER_CODES.AVAILABILITY,
        key: "availability",
        message:
          "This casting requires the dates you are available. Confirm the range before sending.",
      });
    }
  }

  // Measurements are already a general send requirement, so this only adds the
  // organizer's explicit confirmation step — the applicant asserting the
  // numbers are current for these dates, not merely present on the profile.
  if (intake.requiresMeasurements === true) {
    if (!hasCoreMeasurements(profile) || submission.measurementsConfirmed !== true) {
      blockers.push({
        code: EVENT_INTAKE_BLOCKER_CODES.MEASUREMENTS,
        key: "measurements",
        message:
          "This casting requires you to confirm your current measurements before sending.",
      });
    }
  }

  return blockers;
}

/**
 * Server-side mirror of Apply Send-scene gates (defense in depth).
 * @param {object} profile
 * @param {Array} images — package images (subset when submissionPackage.imageIds provided)
 * @param {{
 *   rightsMap?: Map<string, Record<string, unknown>>,
 *   agencyConsentGranted?: boolean,
 *   eventIntake?: { requiresWalkVideo?: boolean, requiresAvailability?: boolean, requiresMeasurements?: boolean },
 *   eventSubmission?: { availability?: { from?: string, to?: string } | null, walkVideoUrl?: string | null, measurementsConfirmed?: boolean },
 * }} [options]
 */
function validateSubmissionPackage(profile, images = [], options = {}) {
  const readiness = evaluateSendReadiness(
    profile,
    images,
    options.rightsMap || new Map(),
    { agencyConsentGranted: options.agencyConsentGranted === true },
  );
  const errors = readiness.sendBlockers.map((blocker) => ({
    code: blocker.code,
    message: blocker.message,
    ...(blocker.key ? { key: blocker.key } : {}),
  }));

  if (options.eventIntake) {
    for (const blocker of evaluateEventIntake(
      profile,
      options.eventIntake,
      options.eventSubmission || {},
    )) {
      errors.push(blocker);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    audit: readiness.audit,
    strength: readiness.strength,
  };
}

module.exports = {
  EVENT_INTAKE_BLOCKER_CODES,
  evaluateEventIntake,
  validateSubmissionPackage,
};
