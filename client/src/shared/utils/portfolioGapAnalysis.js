/**
 * portfolioGapAnalysis.js — agency digitals checklist via structured shot/style fields.
 */

import {
  analyzeDigitalsReadiness,
  isHeadshotImage,
  isFullBodyImage,
  isSmileHeadshot,
} from './profileReadinessImages';

const STANDARD_CHECKLIST = [
  {
    id: 'headshot',
    label: 'Clean Headshot',
    description: 'Face forward, neutral expression, minimal makeup.',
    met: (images) => images.some(isHeadshotImage),
  },
  {
    id: 'fullbody',
    label: 'Full Body Shot',
    description: 'Shows your proportions and physique clearly.',
    met: (images) => images.some(isFullBodyImage),
  },
  {
    id: 'side_profile',
    label: 'Side Profile',
    description: 'Profile view of your face (left or right).',
    met: (images) => analyzeDigitalsReadiness(images).hasProfile,
  },
  {
    id: 'smile',
    label: 'Smile / Commercial',
    description: 'Warm, approachable smile showing teeth.',
    met: (images) => images.some(isSmileHeadshot),
  },
  {
    id: 'editorial',
    label: 'Editorial / Creative',
    description: 'High-fashion or styled creative work.',
    met: (images) => analyzeDigitalsReadiness(images).hasEditorial,
  },
  {
    id: 'back',
    label: 'Back View',
    description: 'Shows hair and back of head — common digitals slot.',
    met: (images) => analyzeDigitalsReadiness(images).hasBack,
  },
  {
    id: 'lifestyle',
    label: 'Commercial / Lifestyle',
    description: 'Styled portfolio shot for commercial or lifestyle markets.',
    met: (images) => analyzeDigitalsReadiness(images).hasLifestyle,
  },
];

export function analyzePortfolio(images = []) {
  const list = Array.isArray(images) ? images : [];
  const checks = STANDARD_CHECKLIST.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    met: item.met(list),
  }));

  const minCountMet = list.length >= 5;
  checks.unshift({
    id: 'min_count',
    label: 'At least 5 photos',
    description: 'Agencies need to see variety.',
    met: minCountMet,
  });

  const metCount = checks.filter((c) => c.met).length;
  const score = Math.round((metCount / checks.length) * 100);

  return {
    checks,
    score,
    missingCount: checks.length - metCount,
    isComplete: score === 100,
    digitals: analyzeDigitalsReadiness(list),
  };
}
