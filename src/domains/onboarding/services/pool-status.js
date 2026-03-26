/**
 * Pool Status Derivation
 * 
 * Derives pool status from existing profile fields:
 * - REFERRAL_LOCKED: profile.partner_agency_id is set
 * - DISCOVERABLE: profile.is_pro && profile.is_discoverable are both true
 * - PRIVATE_INTAKE: default (all other cases)
 * 
 * Pool status is NOT stored as a separate enum field to avoid redundancy.
 * It is computed on-demand from existing fields.
 */

/**
 * Get pool status for a profile
 * 
 * @param {Object|null} profile - Profile object from database
 * @returns {string} Pool status: 'REFERRAL_LOCKED' | 'DISCOVERABLE' | 'PRIVATE_INTAKE'
 * 
 * @example
 * const status = getPoolStatus(profile);
 * // Returns: 'REFERRAL_LOCKED', 'DISCOVERABLE', or 'PRIVATE_INTAKE'
 */
function getPoolStatus(profile) {
  if (!profile) {
    return 'PRIVATE_INTAKE';
  }

  // REFERRAL_LOCKED: Profile is locked to a specific agency via referral
  if (profile.partner_agency_id) {
    return 'REFERRAL_LOCKED';
  }

  // DISCOVERABLE: Studio+ member who has opted into global discoverability
  if (profile.is_pro && profile.is_discoverable) {
    return 'DISCOVERABLE';
  }

  // PRIVATE_INTAKE: Default status (not referred, not discoverable)
  return 'PRIVATE_INTAKE';
}

/**
 * Get human-readable pool status label
 * 
 * @param {Object|null} profile - Profile object from database
 * @returns {string} Human-readable status label
 * 
 * @example
 * const label = getPoolStatusLabel(profile);
 * // Returns: 'Referral Locked', 'Discoverable', or 'Private Intake Pool'
 */
function getPoolStatusLabel(profile) {
  const status = getPoolStatus(profile);
  
  const labels = {
    'REFERRAL_LOCKED': 'Referral Locked',
    'DISCOVERABLE': 'Discoverable',
    'PRIVATE_INTAKE': 'Private Intake Pool'
  };

  return labels[status] || 'Private Intake Pool';
}

/**
 * Get pool status description for UI
 * 
 * @param {Object|null} profile - Profile object from database
 * @returns {string} Description text for display
 * 
 * @example
 * const description = getPoolStatusDescription(profile);
 * // Returns description text for the finish screen or dashboard
 */
function getPoolStatusDescription(profile) {
  const status = getPoolStatus(profile);
  
  const descriptions = {
    'REFERRAL_LOCKED': 'You are applying directly to a partner agency.',
    'DISCOVERABLE': 'You are discoverable across all agencies.',
    'PRIVATE_INTAKE': 'You are currently in a Private Intake Pool.'
  };

  return descriptions[status] || descriptions['PRIVATE_INTAKE'];
}

module.exports = {
  getPoolStatus,
  getPoolStatusLabel,
  getPoolStatusDescription
};
