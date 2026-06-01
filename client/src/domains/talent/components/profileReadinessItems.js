/** Shared readiness checklist definitions (used by glance rail + full audit). */

export const REQUIRED_READINESS_ITEMS = [
  { label: 'Legal Name', key: 'name' },
  { label: 'Home City', key: 'city' },
  { label: 'Birth Date', key: 'dob' },
  { label: 'Gender', key: 'gender' },
  { label: 'Height', key: 'height' },
  { label: 'Measurements (Bust/Waist/Hips)', key: 'measurements' },
  { label: 'Primary Photo', key: 'photo' },
];

export const IMPROVE_READINESS_ITEMS = [
  { label: 'Professional Bio', key: 'bio' },
  { label: 'Weight', key: 'weight' },
  { label: 'Eye & Hair Color', key: 'appearance' },
  { label: 'Shoe Size', key: 'shoe' },
  { label: 'Skin Tone & Details', key: 'skin' },
  { label: 'Work Status', key: 'status' },
  { label: 'Experience Level', key: 'exp' },
  { label: 'Training & Specialties', key: 'training' },
  { label: 'Social Links', key: 'social' },
  { label: 'Emergency Contact', key: 'emergency' },
];

/** Map profile strength field keys → ProfileNav section ids for gap dots. */
export const READINESS_KEY_TO_NAV_ID = {
  name: 'identity',
  city: 'identity',
  dob: 'identity',
  gender: 'identity',
  bio: 'identity',
  photo: 'photos',
  height: 'appearance',
  measurements: 'appearance',
  weight: 'appearance',
  appearance: 'appearance',
  shoe: 'appearance',
  skin: 'appearance',
  status: 'roles',
  exp: 'credits',
  training: 'training',
  social: 'socials',
  emergency: 'contact',
};

/** Maps each readiness key to the Profile deep-link URL that scrolls to the correct section. */
export const READINESS_KEY_TO_PROFILE_URL = {
  name:         '/dashboard/talent/profile?tab=identity',
  city:         '/dashboard/talent/profile?tab=identity',
  dob:          '/dashboard/talent/profile?tab=identity',
  gender:       '/dashboard/talent/profile?tab=identity',
  bio:          '/dashboard/talent/profile?tab=identity',
  photo:        '/dashboard/talent/profile?tab=photos',
  height:       '/dashboard/talent/profile?tab=appearance',
  measurements: '/dashboard/talent/profile?tab=appearance',
  weight:       '/dashboard/talent/profile?tab=appearance',
  appearance:   '/dashboard/talent/profile?tab=appearance',
  shoe:         '/dashboard/talent/profile?tab=appearance',
  skin:         '/dashboard/talent/profile?tab=appearance',
  status:       '/dashboard/talent/profile?tab=roles',
  exp:          '/dashboard/talent/profile?tab=credits',
  training:     '/dashboard/talent/profile?tab=training',
  social:       '/dashboard/talent/profile?tab=socials',
  emergency:    '/dashboard/talent/profile?tab=contact',
};

export function buildReadinessLists(fieldCompletion) {
  const requiredItems = REQUIRED_READINESS_ITEMS.map((item) => ({
    ...item,
    isComplete: !!fieldCompletion[item.key],
  }));

  const improveItems = IMPROVE_READINESS_ITEMS.map((item) => ({
    ...item,
    isComplete: !!fieldCompletion[item.key],
  }));

  const missingRequired = requiredItems.filter((i) => !i.isComplete);
  const missingImprove = improveItems.filter((i) => !i.isComplete);

  const topGaps = [
    ...missingRequired.map((i) => ({ ...i, tier: 'required' })),
    ...missingImprove.map((i) => ({ ...i, tier: 'improve' })),
  ].slice(0, 3);

  return { requiredItems, improveItems, missingRequired, missingImprove, topGaps };
}

/** Nav section id → gap tier: required fields missing, or improve-only fields open. */
export function buildNavGapBySection(fieldCompletion) {
  const gaps = {};

  for (const item of REQUIRED_READINESS_ITEMS) {
    if (fieldCompletion?.[item.key]) continue;
    const navId = READINESS_KEY_TO_NAV_ID[item.key];
    if (navId) gaps[navId] = 'required';
  }

  for (const item of IMPROVE_READINESS_ITEMS) {
    if (fieldCompletion?.[item.key]) continue;
    const navId = READINESS_KEY_TO_NAV_ID[item.key];
    if (navId && gaps[navId] !== 'required') gaps[navId] = 'improve';
  }

  return gaps;
}
