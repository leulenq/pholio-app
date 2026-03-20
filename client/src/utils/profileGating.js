
/**
 * Profile Gating System
 * 
 * Defines the tiered requirements for talent profiles.
 * 
 * TIER 1: REQUIRED (Block ALL features until complete)
 * TIER 2: STANDARD (Block Application submission)
 * TIER 3: PROFESSIONAL (Block 'Studio' verification)
 */

export const GATING_TIERS = {
  REQUIRED: 'required',
  STANDARD: 'standard',
  PROFESSIONAL: 'professional'
};

export const COMP_CARD_FIELDS = [
  'bust', 'waist', 'hips', 'shoe_size', 'hair_color', 'eye_color'
];

// Tier 1: Required Fields
// These must be present to use the platform at all.
export const REQUIRED_FIELDS = [
  { key: 'first_name', label: 'First Name', group: 'Identity' },
  { key: 'last_name', label: 'Last Name', group: 'Identity' },
  { key: 'profile_image', label: 'Headshot', group: 'Photos', check: (p) => p.profile_image || p.primary_photo_id || (p.images && p.images.length > 0) || p.hero_image_path },
  { key: 'height_cm', label: 'Height', group: 'Measurements' },
  { key: 'gender', label: 'Gender', group: 'Identity' },
  { key: 'city', label: 'City', group: 'Identity' },
  { key: 'date_of_birth', label: 'Date of Birth', group: 'Identity' },
  // Measurements
  { key: 'bust', label: 'Bust', group: 'Measurements', check: (p) => p.bust || p.bust_cm || p.chest || p.chest_cm },
  { key: 'waist', label: 'Waist', group: 'Measurements', check: (p) => p.waist || p.waist_cm },
  { key: 'hips', label: 'Hips', group: 'Measurements', check: (p) => p.hips || p.hips_cm }
];

export const checkGatingStatus = (profile, user) => {
  if (!profile) return { isBlocked: true, missingFields: REQUIRED_FIELDS };

  const missing = [];

  // Check Required Fields
  for (const field of REQUIRED_FIELDS) {
    let isValid = false;
    
    if (field.check) {
      isValid = field.check(profile);
    } else {
      const val = profile[field.key];
      isValid = val !== null && val !== undefined && val !== '' && val !== 0;
    }

    if (!isValid) {
      missing.push(field);
    }
  }
  
  // Specific Check for Email if it matches user record (optional, usually guaranteed by auth)
  if (user && !user.email) {
      missing.push({ key: 'email', label: 'Email', group: 'Identity' });
  }

  return {
    isBlocked: missing.length > 0,
    missingFields: missing,
    blockedReason: missing.length > 0 ? 'Complete your profile to access the dashboard.' : null
  };
};
