
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

export const RESTRICTED_TALENT_ROUTES = [
  '/dashboard/talent/analytics',
  '/dashboard/talent/applications'
];

export const isRestrictedTalentRoute = (pathname = '') =>
  RESTRICTED_TALENT_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

export const checkGatingStatus = (profile) => {
  if (!profile) {
    return {
      isBlocked: true,
      missingFields: REQUIRED_FIELDS,
      completionPercent: 0,
      completedCount: 0,
      totalRequired: REQUIRED_FIELDS.length,
      missingByGroup: {
        Identity: REQUIRED_FIELDS.filter((field) => field.group === 'Identity'),
        Photos: REQUIRED_FIELDS.filter((field) => field.group === 'Photos'),
        Measurements: REQUIRED_FIELDS.filter((field) => field.group === 'Measurements')
      }
    };
  }

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

  const totalRequired = REQUIRED_FIELDS.length;
  const completedCount = Math.max(0, totalRequired - missing.length);
  const completionPercent = Math.round((completedCount / totalRequired) * 100);
  const missingByGroup = missing.reduce((groups, field) => {
    const groupName = field.group || 'Other';
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push(field);
    return groups;
  }, {});

  return {
    isBlocked: missing.length > 0,
    missingFields: missing,
    blockedReason: missing.length > 0 ? 'Complete your profile to unlock all dashboard features.' : null,
    completionPercent,
    completedCount,
    totalRequired,
    missingByGroup
  };
};
