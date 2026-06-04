/**
 * Emit notification when a profile drops out of submission-ready state.
 */

const knex = require("../db/knex");
const {
  calculateProfileStrength,
} = require("../../domains/talent/services/profile-strength");
const { notifyTalentProfileNotSubmissionReady } = require("./notifications");

async function loadProfileStrengthInput(profileId) {
  const profile = await knex("profiles").where({ id: profileId }).first();
  if (!profile) return null;

  const images = await knex("images")
    .where({ profile_id: profileId })
    .orderBy("sort", "asc")
    .select("id", "path", "label", "is_primary");

  const primary = images.find((img) => img.is_primary) || images[0];
  return {
    profile,
    data: {
      ...profile,
      images,
      profile_image:
        primary?.path || profile.profile_image || profile.hero_image_path,
    },
  };
}

function isSubmissionReady(data) {
  return calculateProfileStrength(data).isCoreReady;
}

async function notifyIfSubmissionReadinessLost(profileId, wasReadyBefore) {
  if (!wasReadyBefore) return;

  const loaded = await loadProfileStrengthInput(profileId);
  if (!loaded) return;

  const isReadyNow = isSubmissionReady(loaded.data);
  if (isReadyNow) return;

  const missingLabels =
    calculateProfileStrength(loaded.data).missingCoreItems || [];

  try {
    await notifyTalentProfileNotSubmissionReady({
      userId: loaded.profile.user_id,
      missingLabels,
    });
  } catch (err) {
    console.error("[Notifications] Profile readiness notify failed:", err);
  }
}

async function captureSubmissionReadiness(profileId) {
  const loaded = await loadProfileStrengthInput(profileId);
  if (!loaded) return false;
  return isSubmissionReady(loaded.data);
}

module.exports = {
  captureSubmissionReadiness,
  notifyIfSubmissionReadinessLost,
};
