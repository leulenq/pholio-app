/**
 * Profile Completeness Calculation
 * Computes profile completeness and services locking based on essentials checklist
 * 
 * Essentials (70 points total):
 * - At least 1 profile_photos: 20 points
 * - height_cm present: 20 points
 * - At least one of bust/waist/hips present: 20 points
 * - city present: 10 points
 * 
 * Optional (30 points total):
 * - Bio, socials, languages, etc.: 30 points distributed
 */

const knex = require('../db/knex');

const { calculateProfileStrength } = require('./shared/profile-strength.cjs');

/**
 * Check if a value is truly present (not null, undefined, or empty string)
 */
function hasValue(val) {
  if (val === null || val === undefined || val === '') return false;
  if (typeof val === 'number' && val <= 0) return false;
  return true;
}

/**
 * Compute profile completeness and services locking
 * @param {string} profileId - Profile UUID
 * @returns {Promise<{percentage: number, servicesLocked: boolean, essentialsMet: boolean, essentials: Object, optional: Object, isCoreReady: boolean, nextSteps: Array, missingCoreItems: Array}>}
 */
async function computeProfileCompleteness(profileId) {
  if (!profileId) {
    return {
      percentage: 0,
      servicesLocked: true,
      essentialsMet: false,
      isCoreReady: false,
      missingCoreItems: [],
      nextSteps: [],
      essentials: { photos: false, height: false, measurements: false, city: false },
      optional: {}
    };
  }

  // Load profile and photos
  const profile = await knex('profiles').where({ id: profileId }).first();
  if (!profile) {
    return {
      percentage: 0,
      servicesLocked: true,
      essentialsMet: false,
      isCoreReady: false,
      missingCoreItems: [],
      nextSteps: [],
      essentials: { photos: false, height: false, measurements: false, city: false },
      optional: {}
    };
  }

  // Check both profile_photos (new table) and images (existing table) for backward compatibility
  const profilePhotos = await knex('profile_photos').where({ profile_id: profileId }).catch(() => []);
  const images = await knex('images').where({ profile_id: profileId }).catch(() => []);
  
  // Create a combined data object for the shared algorithm
  const dataForAlgorithm = {
    ...profile,
    images: images.length > 0 ? images : profilePhotos
  };

  // Run the shared algorithm
  const strengthResult = calculateProfileStrength(dataForAlgorithm);

  // Maintain backward compatibility for essentials
  const essentials = {
    photos: profilePhotos.length > 0 || images.length > 0,
    height: hasValue(profile.height_cm),
    measurements: hasValue(profile.bust_cm) || hasValue(profile.waist_cm) || hasValue(profile.hips_cm),
    city: hasValue(profile.city)
  };

  const essentialsMet = essentials.photos && essentials.height && essentials.measurements && essentials.city;

  const optional = {
    bio: hasValue(profile.bio_raw) || hasValue(profile.bio_curated),
    social: hasValue(profile.instagram_handle) || hasValue(profile.twitter_handle) || hasValue(profile.tiktok_handle),
    languages: profile.languages && (Array.isArray(profile.languages) ? profile.languages.length > 0 : typeof profile.languages === 'string' && profile.languages.trim() !== ''),
    experience: hasValue(profile.experience_level) || hasValue(profile.experience_details) || hasValue(profile.training),
    availability: hasValue(profile.availability_schedule) || profile.availability_travel !== null,
    specialties: profile.specialties && (Array.isArray(profile.specialties) ? profile.specialties.length > 0 : typeof profile.specialties === 'string' && profile.specialties.trim() !== '')
  };

  return {
    percentage: strengthResult.score,
    servicesLocked: !strengthResult.isCoreReady, // Update services locked based on the new core ready flag
    isCoreReady: strengthResult.isCoreReady,
    missingCoreItems: strengthResult.missingCoreItems,
    nextSteps: strengthResult.nextSteps,
    essentialsMet, // kept for backward compatibility if any older logic uses it
    essentials, // kept for backward compatibility if any older logic uses it
    optional // kept for backward compatibility if any older logic uses it
  };
}

/**
 * Update profile with computed completeness and services_locked
 * @param {string} profileId - Profile UUID
 * @returns {Promise<Object>} Completeness result
 */
async function updateProfileCompleteness(profileId) {
  const result = await computeProfileCompleteness(profileId);
  
  await knex('profiles')
    .where({ id: profileId })
    .update({
      profile_completeness: result.percentage,
      services_locked: result.servicesLocked,
      updated_at: knex.fn.now()
    });
  
  return result;
}

module.exports = {
  computeProfileCompleteness,
  updateProfileCompleteness
};
