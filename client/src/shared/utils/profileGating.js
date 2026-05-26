
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
  '/dashboard/talent/applications',
  '/dashboard/talent/analytics'
];

export const isRestrictedTalentRoute = (pathname = '') =>
  RESTRICTED_TALENT_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

const FIELD_ACTIONS = {
  first_name: {
    task: 'Add your first name',
    href: '/dashboard/talent/profile?gate=true#identity',
    actionLabel: 'Open identity',
  },
  last_name: {
    task: 'Add your last name',
    href: '/dashboard/talent/profile?gate=true#identity',
    actionLabel: 'Open identity',
  },
  city: {
    task: 'Set your primary city',
    href: '/dashboard/talent/profile?gate=true#identity',
    actionLabel: 'Open identity',
  },
  gender: {
    task: 'Select your gender',
    href: '/dashboard/talent/profile?gate=true#identity',
    actionLabel: 'Open identity',
  },
  date_of_birth: {
    task: 'Add your date of birth',
    href: '/dashboard/talent/profile?gate=true#identity',
    actionLabel: 'Open identity',
  },
  profile_image: {
    task: 'Choose a headshot',
    href: '/dashboard/talent/media',
    actionLabel: 'Open the book',
  },
  height_cm: {
    task: 'Confirm your height',
    href: '/dashboard/talent/profile?gate=true#appearance',
    actionLabel: 'Open measurements',
  },
  bust: {
    task: 'Add bust or chest',
    href: '/dashboard/talent/profile?gate=true#appearance',
    actionLabel: 'Open measurements',
  },
  waist: {
    task: 'Add waist',
    href: '/dashboard/talent/profile?gate=true#appearance',
    actionLabel: 'Open measurements',
  },
  hips: {
    task: 'Add hips',
    href: '/dashboard/talent/profile?gate=true#appearance',
    actionLabel: 'Open measurements',
  },
};

export const PROFILE_GATE_FEATURES = {
  '/dashboard/talent/analytics': {
    featureName: 'Intel',
    featureLabel: 'Intel locked',
    description:
      'Profile analytics depend on agency-facing identity, measurements, and book signals. Finish the required fields before Intel can read the profile correctly.',
  },
  '/dashboard/talent/applications': {
    featureName: 'Market',
    featureLabel: 'Market locked',
    description:
      'Agencies need a complete profile before a submission is credible. Complete the missing essentials, then return to Market.',
  },
};

export function getProfileGateFeature(pathname = '') {
  const matched = Object.entries(PROFILE_GATE_FEATURES).find(
    ([route]) => pathname === route || pathname.startsWith(`${route}/`),
  );

  return matched?.[1] || {
    featureName: 'This feature',
    featureLabel: 'Profile gate',
    description:
      'This feature relies on the required profile essentials. Complete the missing fields to continue.',
  };
}

function toMissingTasks(missingFields = []) {
  return missingFields.map((field) => {
    const action = FIELD_ACTIONS[field.key] || {};
    return {
      ...field,
      task: action.task || `Complete ${field.label}`,
      href: action.href || '/dashboard/talent/profile?gate=true',
      actionLabel: action.actionLabel || 'Open profile',
    };
  });
}

export const checkGatingStatus = (profile) => {
  if (!profile) {
    const missingTasks = toMissingTasks(REQUIRED_FIELDS);
    return {
      isBlocked: true,
      missingFields: REQUIRED_FIELDS,
      missingTasks,
      completionPercent: 0,
      completedCount: 0,
      totalRequired: REQUIRED_FIELDS.length,
      blockedReason: 'Create a profile before using gated talent features.',
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
    const val = profile[field.key];
    const isValid = field.check
      ? field.check(profile)
      : val !== null && val !== undefined && val !== '' && val !== 0;

    if (!isValid) {
      missing.push(field);
    }
  }

  const totalRequired = REQUIRED_FIELDS.length;
  const completedCount = Math.max(0, totalRequired - missing.length);
  const completionPercent = Math.round((completedCount / totalRequired) * 100);
  const missingTasks = toMissingTasks(missing);
  const missingByGroup = missing.reduce((groups, field) => {
    const groupName = field.group || 'Other';
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push(field);
    return groups;
  }, {});

  return {
    isBlocked: missing.length > 0,
    missingFields: missing,
    missingTasks,
    blockedReason: missing.length > 0
      ? 'Complete the required profile essentials to unlock gated talent features.'
      : null,
    completionPercent,
    completedCount,
    totalRequired,
    missingByGroup
  };
};
