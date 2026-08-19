/**
 * Profile gating — unified with agency-readiness scoring (`profileScoring.js`).
 *
 * Gates Market until the submission-core package is complete (60% required tier).
 */

import { calculateProfileStrength } from './profileScoring';
import {
  REQUIRED_READINESS_ITEMS,
  READINESS_KEY_TO_PROFILE_URL,
  buildReadinessLists,
} from '../../domains/talent/components/profileReadinessItems';
import { resolveReadinessGuidance, analyzePackageIntelligence } from './packageIntelligence';
import { evaluateSendReadiness } from './sendReadiness';

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
  photo_headshot: { task: 'Add a clean digital headshot', actionLabel: 'Open the book' },
  photo_full_body: { task: 'Add a clean digital full-length shot', actionLabel: 'Open the book' },
  guardian_consent: { task: 'Record guardian consent', actionLabel: 'Open identity' },
  work_permit: { task: 'Confirm work permit on file', actionLabel: 'Open identity' },
};

/** Derived from readiness essentials — kept for backward-compatible imports. */
export const REQUIRED_FIELDS = REQUIRED_READINESS_ITEMS.map((item) => ({
  key: item.key,
  label: item.label,
  group: READINESS_GROUPS[item.key] || 'Profile',
}));

/**
 * Routes a blocked profile cannot open at all.
 *
 * Market used to be one of them, with the requirements page carved back out as
 * an exemption — which meant the one surface that works before a profile is
 * finished hung off a nav item that rendered locked, reachable only by typing
 * the URL. The gate now sits on the action instead: Market opens, the banner
 * still states what is missing, and every on-Pholio submission CTA stays
 * disabled until `isCoreReady`. Preparing a package for an agency Pholio does
 * not deliver to is never gated — those are the talent's own files, and the
 * export route carries the same ruling (§1701; see `POST /spec-registry/export`).
 */
export const RESTRICTED_TALENT_ROUTES = [];

export const isRestrictedTalentRoute = (pathname = '') =>
  RESTRICTED_TALENT_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

export const PROFILE_GATE_FEATURES = {
  '/dashboard/talent/applications': {
    featureName: 'Market',
    featureLabel: 'Market locked',
    description:
      'Agencies expect a digital headshot, full-length digital, and accurate stats before a submission is credible. Finish the essentials, then return to Market.',
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
    isSendReady: false,
    sendBlockers: [{
      code: 'profile_incomplete',
      key: 'core',
      message: 'Complete submission-core essentials before applying.',
    }],
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
export function checkGatingStatus(profile, images = [], options = {}) {
  if (!profile) {
    return emptyGatingResult();
  }

  const imageList = Array.isArray(images) ? images : profile.images || [];
  const pkg = analyzePackageIntelligence({ images: imageList });
  const sendReadiness = evaluateSendReadiness(profile, imageList, {
    ...options,
    includeDistributionRights: false,
  });

  const strength = calculateProfileStrength({
    ...profile,
    email: profile.email || '',
    phone: profile.phone || '',
    images: imageList,
  });

  const { missingRequired, requiredItems } = buildReadinessLists(
    strength.fieldCompletion,
    profile,
    imageList,
  );

  const stepByKey = Object.fromEntries(strength.allNextSteps.map((step) => [step.key, step]));

  const missingFields = missingRequired.map((item) => {
    const step = stepByKey[item.key];
    return toGatingField({
      ...item,
      label: step?.label || item.label,
      why: step?.why || item.why,
    });
  });

  const missingTasks = missingRequired.map((item) => {
    const step = stepByKey[item.key];
    const action = GATE_ACTIONS[item.key] || {};
    const guided = resolveReadinessGuidance(item.key, pkg.advisories, {
      label: item.label,
      why: item.why,
      task: action.task || `Complete ${item.label}`,
    });
    return toGatingTask({
      ...item,
      label: step?.label || guided.label || item.label,
      why: step?.why || guided.why || item.why,
      task: guided.task || action.task || `Complete ${item.label}`,
    });
  });
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
    isSendReady: sendReadiness.isSendReady,
    sendBlockers: sendReadiness.sendBlockers,
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
