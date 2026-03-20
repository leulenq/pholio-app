/**
 * Server-side profile status computation.
 *
 * Mirrors the isCoreReady logic in client/src/utils/profileScoring.js.
 * Called after every profile save to keep profile_status in sync.
 *
 * Returns 'active' when all 8 core sections are complete, 'incomplete' otherwise.
 */

function computeProfileStatus(profile) {
  if (!profile) return 'incomplete';

  const hasValue = (v) => v !== null && v !== undefined && v !== '';

  const parseJson = (v) => {
    if (!v) return null;
    try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; }
  };

  const hasArrayValue = (v) => {
    const parsed = parseJson(v);
    return Array.isArray(parsed) ? parsed.length > 0 : hasValue(v);
  };

  // A. Personal — first_name, last_name, city, date_of_birth
  const personalCore = hasValue(profile.first_name)
    && hasValue(profile.last_name)
    && hasValue(profile.city)
    && hasValue(profile.date_of_birth);

  // B. Heritage — ethnicity
  const heritageCore = hasArrayValue(profile.ethnicity);

  // C. Physicals — height, weight, eye, hair color/length, bust, waist, hips
  const physicalsCore = hasValue(profile.height_cm)
    && hasValue(profile.weight_kg)
    && hasValue(profile.eye_color)
    && hasValue(profile.hair_color)
    && hasValue(profile.hair_length)
    && hasValue(profile.bust_cm)
    && hasValue(profile.waist_cm)
    && hasValue(profile.hips_cm);

  // D. Credits — experience_level
  const creditsCore = hasValue(profile.experience_level);

  // E. Training — training summary > 50 chars (stored as 'training' in DB)
  const trainingCore = hasValue(profile.training) && String(profile.training).length > 50;

  // F. Roles — work_status
  const rolesCore = hasValue(profile.work_status);

  // G. Representation — seeking_representation flag OR current_agency set
  const repCore = profile.seeking_representation !== null
    && profile.seeking_representation !== undefined
    || hasValue(profile.current_agency);

  // H. Socials — instagram_handle OR portfolio_url
  const socialsCore = hasValue(profile.instagram_handle) || hasValue(profile.portfolio_url);

  const isCoreReady = personalCore
    && heritageCore
    && physicalsCore
    && creditsCore
    && trainingCore
    && rolesCore
    && repCore
    && socialsCore;

  return isCoreReady ? 'active' : 'incomplete';
}

module.exports = { computeProfileStatus };
