/**
 * Server-side profile status — aligned with agency-readiness scoring.
 *
 * `active` when the submission package is strong (≥85% readiness with images).
 * `incomplete` otherwise.
 */

const { calculateProfileStrength } = require("./profile-strength");

function computeProfileStatus(profile, images = []) {
  if (!profile) return "incomplete";

  const strength = calculateProfileStrength({
    ...profile,
    email: profile.email,
    images: Array.isArray(images) ? images : [],
  });

  if (strength.score >= 85 && strength.isCoreReady) {
    return "active";
  }

  return "incomplete";
}

module.exports = { computeProfileStatus };
