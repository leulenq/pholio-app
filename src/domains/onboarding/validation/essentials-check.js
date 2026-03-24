/**
 * Essentials Check Function
 * 
 * Validates that a profile has completed the essential onboarding requirements.
 * Used by both onboarding completion and dashboard gating.
 * 
 * Essentials include:
 * - Identity basics: first_name, last_name, city
 * - At least 1 uploaded photo
 * - Confirmed measurements: height_cm, bust, waist, hips
 * 
 * @param {Object|null} profile - Profile object from database
 * @param {Array} images - Array of image objects for the profile
 * @returns {Object} { ok: boolean, missing: string[], message: string }
 * 
 * @example
 * const result = checkEssentialsComplete(profile, images);
 * if (!result.ok) {
 *   console.log(`Missing: ${result.missing.join(', ')}`);
 * }
 */
function checkEssentialsComplete(profile, images = []) {
  if (!profile) {
    return {
      ok: false,
      missing: ['profile'],
      message: 'Profile not found'
    };
  }

  const missing = [];
  const imagesArray = Array.isArray(images) ? images : [];

  // Identity basics
  if (!profile.first_name || profile.first_name.trim() === '') {
    missing.push('first name');
  }
  if (!profile.last_name || profile.last_name.trim() === '') {
    missing.push('last name');
  }
  if (!profile.city || profile.city.trim() === '') {
    missing.push('city');
  }

  // Photo requirement (at least 1)
  if (imagesArray.length < 1) {
    missing.push('at least 1 photo');
  }

  // Measurements (must be > 0, not null/undefined)
  if (!profile.height_cm || profile.height_cm <= 0) {
    missing.push('height');
  }
  if (!profile.bust_cm || profile.bust_cm <= 0) {
    missing.push('bust');
  }
  if (!profile.waist_cm || profile.waist_cm <= 0) {
    missing.push('waist');
  }
  if (!profile.hips_cm || profile.hips_cm <= 0) {
    missing.push('hips');
  }

  const ok = missing.length === 0;
  const message = ok 
    ? 'All essentials complete'
    : `Missing: ${missing.join(', ')}`;

  return {
    ok,
    missing,
    message
  };
}

module.exports = {
  checkEssentialsComplete
};
