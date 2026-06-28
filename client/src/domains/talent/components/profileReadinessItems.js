/** Agency-aligned readiness checklist (sidebar + audit). */

import {
  hasGuardianConsent,
  hasWorkPermitOnFile,
  isMinorProfile,
  minorSensitiveFieldsUnlocked,
} from '../../../shared/utils/talentAge';
import { analyzePackageIntelligence, resolveReadinessGuidance } from '../../../shared/utils/packageIntelligence';
import { readinessFieldLabel } from '../../../shared/constants/frameTaxonomy';
import {
  getDivisionReadinessConfig,
  resolveTalentDivision,
} from '../../../shared/constants/profileDivision';

export const MINOR_REQUIRED_READINESS_ITEMS = [
  {
    key: 'guardian_consent',
    label: 'Guardian Consent',
    why: 'A parent or guardian must consent before we collect measurements or full-length imagery.',
  },
  {
    key: 'work_permit',
    label: 'Work Permit on File',
    why: 'Minors need a current work permit on record before booking in most markets.',
  },
];

export const REQUIRED_READINESS_ITEMS = [
  {
    key: 'name',
    label: 'Legal Name',
    why: 'Agencies file submissions under your legal name for contracts and casting.',
  },
  {
    key: 'city',
    label: 'Home City',
    why: 'Bookers match you to local castings and travel radius first.',
  },
  {
    key: 'dob',
    label: 'Birth Date',
    why: 'Age range is a primary filter before your book is reviewed.',
  },
  {
    key: 'gender',
    label: 'Gender',
    why: 'Board fit and category routing depend on accurate gender presentation.',
  },
  {
    key: 'height',
    label: 'Height',
    why: 'Height is the first stat agents scan on every submission.',
  },
  {
    key: 'measurements',
    label: 'Measurements (Bust/Waist/Hips)',
    why: 'Core stats let agencies assess fit without a fitting.',
  },
  {
    key: 'photo_headshot',
    label: readinessFieldLabel('photo_headshot', 'Digital Headshot'),
    why: 'A clean, natural headshot opens every agency digitals set.',
  },
  {
    key: 'photo_full_body',
    label: readinessFieldLabel('photo_full_body', 'Full-Length Digital'),
    why: 'A head-to-toe digital frame verifies proportions and stance.',
  },
];

export const IMPROVE_READINESS_ITEMS = [
  {
    key: 'bio',
    label: 'Professional Bio',
    why: 'Context beyond stats — training, market, and personality.',
  },
  {
    key: 'look',
    label: 'Eye & Hair Color',
    why: 'Standard on every comp-card stats block.',
  },
  {
    key: 'shoe',
    label: 'Shoe Size',
    why: 'Footwear sizing appears on agency stats sheets.',
  },
  {
    key: 'weight',
    label: 'Weight',
    why: 'Some markets list weight alongside measurements.',
  },
  {
    key: 'skin',
    label: 'Skin Tone & Markings',
    why: 'Tattoos, piercings, and skin tone prevent set-day surprises.',
  },
  {
    key: 'status',
    label: 'Work Status',
    why: 'Signals whether you can take bookings now.',
  },
  {
    key: 'exp',
    label: 'Experience Level',
    why: 'New faces and working talent are pitched differently.',
  },
  {
    key: 'training',
    label: 'Training & Specialties',
    why: 'Skills and languages show bookers what you can do once the brief fits.',
  },
  {
    key: 'social',
    label: 'Social or Portfolio Link',
    why: 'Scouts verify your current look through Instagram or a portfolio.',
  },
  {
    key: 'contact',
    label: 'Email & Phone',
    why: 'Direct contact details for follow-up on submissions.',
  },
  {
    key: 'photo_profile',
    label: readinessFieldLabel('photo_profile', 'Side Profile'),
    why: 'Bookers assess bone structure from a left or right profile digital.',
  },
  {
    key: 'photo_smile',
    label: readinessFieldLabel('photo_smile', 'Smiling Headshot'),
    why: 'Commercial boards want at least one approachable smile in the set.',
  },
  {
    key: 'photo_back',
    label: readinessFieldLabel('photo_back', 'Back View'),
    why: 'A full-length back frame completes the standard digitals set.',
  },
  {
    key: 'photo_editorial',
    label: readinessFieldLabel('photo_editorial', 'Editorial / Creative'),
    why: 'Styled editorial work shows high-fashion range beyond digitals.',
  },
  {
    key: 'photo_lifestyle',
    label: readinessFieldLabel('photo_lifestyle', 'Commercial / Lifestyle'),
    why: 'Relatable lifestyle or commercial frames round out your book.',
  },
  {
    key: 'digitals_recency',
    label: readinessFieldLabel('digitals_recency', 'Current Digitals'),
    why: 'Agencies expect digitals refreshed every 8-12 weeks.',
  },
];

const SENSITIVE_READINESS_KEYS = new Set(['measurements', 'photo_full_body', 'weight']);

/**
 * Improve-tier keys that coach for body imagery / measurement-adjacent frames.
 * Withheld from a minor without guardian consent so /media and the readiness
 * checklist never ask an unconsented minor for body imagery.
 */
const SENSITIVE_IMPROVE_KEYS = new Set(['weight', 'photo_back']);

/** Map profile strength field keys → ProfileNav section ids for gap dots. */
export const READINESS_KEY_TO_NAV_ID = {
  name: 'identity',
  city: 'identity',
  dob: 'identity',
  gender: 'identity',
  bio: 'identity',
  guardian_consent: 'identity',
  work_permit: 'identity',
  height: 'appearance',
  measurements: 'appearance',
  look: 'appearance',
  shoe: 'appearance',
  weight: 'appearance',
  skin: 'appearance',
  status: 'roles',
  exp: 'credits',
  training: 'training',
  social: 'socials',
  contact: 'contact',
  photo_headshot: 'media',
  photo_full_body: 'media',
  photo_profile: 'media',
  photo_smile: 'media',
  photo_back: 'media',
  photo_editorial: 'media',
  photo_lifestyle: 'media',
  digitals_recency: 'media',
};

/** Maps each readiness key to the Profile deep-link URL that scrolls to the correct section. */
export const READINESS_KEY_TO_PROFILE_URL = {
  name: '/dashboard/talent/profile?tab=identity',
  city: '/dashboard/talent/profile?tab=identity',
  dob: '/dashboard/talent/profile?tab=identity',
  gender: '/dashboard/talent/profile?tab=identity',
  bio: '/dashboard/talent/profile?tab=identity',
  guardian_consent: '/dashboard/talent/profile?tab=identity',
  work_permit: '/dashboard/talent/profile?tab=identity',
  photo_headshot: '/dashboard/talent/media',
  photo_full_body: '/dashboard/talent/media',
  photo_profile: '/dashboard/talent/media',
  photo_smile: '/dashboard/talent/media',
  photo_back: '/dashboard/talent/media',
  photo_editorial: '/dashboard/talent/media',
  photo_lifestyle: '/dashboard/talent/media',
  digitals_recency: '/dashboard/talent/media',
  height: '/dashboard/talent/profile?tab=appearance',
  measurements: '/dashboard/talent/profile?tab=appearance',
  look: '/dashboard/talent/profile?tab=appearance',
  shoe: '/dashboard/talent/profile?tab=appearance',
  weight: '/dashboard/talent/profile?tab=appearance',
  skin: '/dashboard/talent/profile?tab=appearance',
  status: '/dashboard/talent/profile?tab=roles',
  exp: '/dashboard/talent/profile?tab=credits',
  training: '/dashboard/talent/profile?tab=training',
  social: '/dashboard/talent/profile?tab=socials',
  contact: '/dashboard/talent/settings',
};

function buildMinorFieldCompletion(profile = {}, fieldCompletion = {}) {
  return {
    ...fieldCompletion,
    guardian_consent: hasGuardianConsent(profile),
    work_permit: hasWorkPermitOnFile(profile),
  };
}

function activeRequiredItems(profile = null) {
  const minor = isMinorProfile(profile);
  const unlocked = minorSensitiveFieldsUnlocked(profile);

  if (!minor) {
    return REQUIRED_READINESS_ITEMS;
  }

  const base = REQUIRED_READINESS_ITEMS.filter((item) => {
    if (!unlocked && SENSITIVE_READINESS_KEYS.has(item.key)) return false;
    return true;
  });

  return [...MINOR_REQUIRED_READINESS_ITEMS, ...base];
}

function sortImproveByDivision(items = [], config = null) {
  if (!config) return items;

  const emphasizeOrder = new Map(
    (config.emphasizeImproveKeys || []).map((key, index) => [key, index]),
  );
  const deemphasizeKeys = new Set(config.deemphasizeImproveKeys || []);

  const priorityBand = (key) => {
    if (emphasizeOrder.has(key)) return 0;
    if (deemphasizeKeys.has(key)) return 2;
    return 1;
  };

  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const bandDiff = priorityBand(a.item.key) - priorityBand(b.item.key);
      if (bandDiff !== 0) return bandDiff;

      if (priorityBand(a.item.key) === 0) {
        return emphasizeOrder.get(a.item.key) - emphasizeOrder.get(b.item.key);
      }

      return a.index - b.index;
    })
    .map(({ item }) => item);
}

export function buildReadinessLists(fieldCompletion = {}, profile = null, images = [], division = null) {
  const completion = buildMinorFieldCompletion(profile, fieldCompletion);
  const requiredDefs = activeRequiredItems(profile);
  const minor = isMinorProfile(profile);
  const unlocked = minorSensitiveFieldsUnlocked(profile);
  const resolvedDivision = division || resolveTalentDivision(profile);
  const divisionConfig = getDivisionReadinessConfig(resolvedDivision);
  const pkg = Array.isArray(images) && images.length
    ? analyzePackageIntelligence({ images, profile })
    : null;

  const applyGuidance = (item) => {
    if (!pkg) return item;
    const guided = resolveReadinessGuidance(item.key, pkg.advisories, {
      label: item.label,
      why: item.why,
    });
    return { ...item, label: guided.label, why: guided.why };
  };

  const requiredItems = requiredDefs.map((item) =>
    applyGuidance({
      ...item,
      isComplete: !!completion[item.key],
    }),
  );

  const improveItems = IMPROVE_READINESS_ITEMS.filter((item) => {
    if (minor && !unlocked && SENSITIVE_IMPROVE_KEYS.has(item.key)) return false;
    return true;
  }).map((item) =>
    applyGuidance({
      ...item,
      isComplete: !!completion[item.key],
    }),
  );

  const missingRequired = requiredItems.filter((i) => !i.isComplete);
  const missingImprove = sortImproveByDivision(
    improveItems.filter((i) => !i.isComplete),
    divisionConfig,
  );

  const topGaps = [
    ...missingRequired.map((i) => ({ ...i, tier: 'required' })),
    ...missingImprove.map((i) => ({ ...i, tier: 'improve' })),
  ].slice(0, 5);

  return {
    requiredItems,
    improveItems,
    missingRequired,
    missingImprove,
    topGaps,
    division: resolvedDivision,
    divisionConfig,
  };
}

/** Nav section id → gap tier: required fields missing, or improve-only fields open. */
export function buildNavGapBySection(fieldCompletion = {}, profile = null) {
  const completion = buildMinorFieldCompletion(profile, fieldCompletion);
  const gaps = {};

  for (const item of activeRequiredItems(profile)) {
    if (completion[item.key]) continue;
    const navId = READINESS_KEY_TO_NAV_ID[item.key];
    if (navId) gaps[navId] = 'required';
  }

  const minor = isMinorProfile(profile);
  const unlocked = minorSensitiveFieldsUnlocked(profile);

  for (const item of IMPROVE_READINESS_ITEMS) {
    if (minor && !unlocked && SENSITIVE_IMPROVE_KEYS.has(item.key)) continue;
    if (completion[item.key]) continue;
    const navId = READINESS_KEY_TO_NAV_ID[item.key];
    if (navId && gaps[navId] !== 'required') gaps[navId] = 'improve';
  }

  return gaps;
}
