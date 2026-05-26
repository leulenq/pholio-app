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

/** Nav section id → has at least one incomplete field in that section. */
export function buildNavGapBySection(fieldCompletion) {
  const gaps = {};
  const allItems = [...REQUIRED_READINESS_ITEMS, ...IMPROVE_READINESS_ITEMS];
  for (const item of allItems) {
    if (fieldCompletion[item.key]) continue;
    const navId = READINESS_KEY_TO_NAV_ID[item.key];
    if (navId) gaps[navId] = true;
  }
  return gaps;
}
