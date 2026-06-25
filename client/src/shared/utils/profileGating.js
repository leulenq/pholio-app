/**
 * Profile gating — unified with agency-readiness scoring (`profileScoring.js`).
 *
 * Gates Market and Intel until the submission-core package is complete (60% required tier).
 */

import { calculateProfileStrength } from './profileScoring';
import {
  REQUIRED_READINESS_ITEMS,
  READINESS_KEY_TO_PROFILE_URL,
  buildReadinessLists,
} from '../../domains/talent/components/profileReadinessItems';

export const GATING_TIERS = {
  REQUIRED: 'required',
  STANDARD: 'standard',
  PROFESSIONAL: 'professional',
};

/** @deprecated Use readiness `look` + `measurements` fields instead. */
export const COMP_CARD_FIELDS = [
  'bust',
  'waist',
  'hips',
  'shoe_size',
  'hair_color',
  'eye_color',
];

const READINESS_GROUPS = {
  name: 'Identity',
  city: 'Identity',
  dob: 'Identity',
  gender: 'Identity',
  height: 'Measurements',
  measurements: 'Measurements',
  photo_headshot: 'Photos',
  photo_full_body: 'Photos',
};

const GATE_ACTIONS = {
  name: { task: 'Add your legal name', actionLabel: 'Open identity' },
  city: { task: 'Set your home city', actionLabel: 'Open identity' },
  dob: { task: 'Add your birth date', actionLabel: 'Open identity' },
  gender: { task: 'Select your gender', actionLabel: 'Open identity' },
  height: { task: 'Confirm your height', actionLabel: 'Open measurements' },
  measurements: { task: 'Add bust, waist, and hips', actionLabel: 'Open measurements' },
  photo_headshot: { task: 'Upload or tag a headshot', actionLabel: 'Open the book' },
  photo_full_body: { task: 'Upload or tag a full-body photo', actionLabel: 'Open the book' },
  guardian_consent: { task: 'Record guardian consent', actionLabel: 'Open identity' },
  work_permit: { task: 'Confirm work permit on file', actionLabel: 'Open identity' },
};

/** Derived from readiness essentials — kept for backward-compatible imports. */
export const REQUIRED_FIELDS = REQUIRED_READINESS_ITEMS.map((item) => ({
  key: item.key,
  label: item.label,
  group: READINESS_GROUPS[item.key] || 'Profile',
}));

export const RESTRICTED_TALENT_ROUTES = [
  '/dashboard/talent/applications',
  '/dashboard/talent/analytics',
];

export const isRestrictedTalentRoute = (pathname = '') =>
  RESTRICTED_TALENT_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

export const PROFILE_GATE_FEATURES = {
  '/dashboard/talent/analytics': {
    featureName: 'Intel',
    featureLabel: 'Intel locked',
    description:
      'Intel needs a complete submission package — identity, measurements, and digitals — before analytics can reflect agency-facing signals.',
  },
  '/dashboard/talent/applications': {
    featureName: 'Market',
    featureLabel: 'Market locked',
    description:
      'Agencies expect a headshot, full-body photo, and accurate stats before a submission is credible. Finish the essentials, then return to Market.',
  },
};

export function getProfileGateFeature(pathname = '') {
  const matched = Object.entries(PROFILE_GATE_FEATURES).find(
    ([route]) => pathname === route || pathname.startsWith(`${route}/`),
  );

  return (
    matched?.[1] || {
      featureName: 'This feature',
      featureLabel: 'Profile gate',
      description:
        'This feature relies on the submission-core profile essentials. Complete the missing items to continue.',
    }
  );
}

function gateHrefForKey(key) {
  const base = READINESS_KEY_TO_PROFILE_URL[key] || '/dashboard/talent/profile?tab=identity';
  if (base.startsWith('/dashboard/talent/media')) return base;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}gate=true`;
}

function toGatingField(item) {
  return {
    key: item.key,
    label: item.label,
    group: READINESS_GROUPS[item.key] || 'Profile',
    why: item.why,
  };
}

function toGatingTask(item) {
  const action = GATE_ACTIONS[item.key] || {};
  return {
    key: item.key,
    label: item.label,
    group: READINESS_GROUPS[item.key] || 'Profile',
    why: item.why,
    task: action.task || `Complete ${item.label}`,
    href: gateHrefForKey(item.key),
    actionLabel: action.actionLabel || 'Open profile',
  };
}

function emptyGatingResult() {
  const missingFields = REQUIRED_READINESS_ITEMS.map(toGatingField);
  const missingTasks = REQUIRED_READINESS_ITEMS.map(toGatingTask);
  return {
    isBlocked: true,
    isCoreReady: false,
    readinessScore: 0,
    missingFields,
    missingTasks,
    blockedReason: 'Create a profile before using gated talent features.',
    completionPercent: 0,
    completedCount: 0,
    totalRequired: REQUIRED_READINESS_ITEMS.length,
    missingByGroup: {
      Identity: missingFields.filter((field) => field.group === 'Identity'),
      Photos: missingFields.filter((field) => field.group === 'Photos'),
      Measurements: missingFields.filter((field) => field.group === 'Measurements'),
    },
  };
}

/**
 * @param {object|null} profile
 * @param {Array} [images] — book images from auth; required for photo gates
 */
export function checkGatingStatus(profile, images = []) {
  if (!profile) {
    return emptyGatingResult();
  }

  const strength = calculateProfileStrength({
    ...profile,
    email: profile.email || '',
    phone: profile.phone || '',
    images: Array.isArray(images) ? images : profile.images || [],
  });

  const { missingRequired, requiredItems } = buildReadinessLists(
    strength.fieldCompletion,
    profile,
  );
  const missingFields = missingRequired.map(toGatingField);
  const missingTasks = missingRequired.map(toGatingTask);
  const totalRequired = requiredItems.length;
  const completedCount = Math.max(0, totalRequired - missingRequired.length);
  const completionPercent = Math.round((completedCount / totalRequired) * 100);

  const missingByGroup = missingFields.reduce((groups, field) => {
    const groupName = field.group || 'Profile';
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push(field);
    return groups;
  }, {});

  return {
    isBlocked: !strength.isCoreReady,
    isCoreReady: strength.isCoreReady,
    readinessScore: strength.score,
    missingFields,
    missingTasks,
    blockedReason: strength.isCoreReady
      ? null
      : 'Complete the submission-core essentials to unlock gated talent features.',
    completionPercent,
    completedCount,
    totalRequired,
    missingByGroup,
  };
}
