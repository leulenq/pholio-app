/**
 * portfolioGapAnalysis.js — agency digitals checklist via structured shot/style fields.
 */

import {
  analyzeDigitalsReadiness,
  isHeadshotImage,
  isFullBodyImage,
  isSmileHeadshot,
} from './profileReadinessImages';
import { analyzePackageIntelligence } from './packageIntelligence';
import { DIGITALS_STALE_DAYS, BOOK_MIN_FRAME_COUNT } from '../constants/packageIntelligence';
import { READINESS_CHECKLIST_COPY } from '../constants/frameTaxonomy';

const STANDARD_CHECKLIST = [
  {
    id: 'headshot',
    ...READINESS_CHECKLIST_COPY.headshot,
    met: (images) => images.some(isHeadshotImage),
  },
  {
    id: 'fullbody',
    ...READINESS_CHECKLIST_COPY.fullbody,
    met: (images) => images.some(isFullBodyImage),
  },
  {
    id: 'side_profile',
    ...READINESS_CHECKLIST_COPY.side_profile,
    met: (images) => analyzeDigitalsReadiness(images).hasProfile,
  },
  {
    id: 'smile',
    ...READINESS_CHECKLIST_COPY.smile,
    met: (images) => images.some(isSmileHeadshot),
  },
  {
    id: 'editorial',
    ...READINESS_CHECKLIST_COPY.editorial,
    met: (images) => analyzeDigitalsReadiness(images).hasEditorial,
  },
  {
    id: 'back',
    ...READINESS_CHECKLIST_COPY.back,
    met: (images) => analyzeDigitalsReadiness(images).hasBack,
  },
  {
    id: 'lifestyle',
    ...READINESS_CHECKLIST_COPY.lifestyle,
    met: (images) => analyzeDigitalsReadiness(images).hasLifestyle,
  },
];

/** Checklist ids that coach for body imagery — withheld from unconsented minors. */
const BODY_IMAGERY_CHECK_IDS = new Set(['fullbody', 'back']);

export function analyzePortfolio(images = [], profile = null) {
  const list = Array.isArray(images) ? images : [];
  const pkg = analyzePackageIntelligence({ images: list, profile });
  const suppressBodyImagery = pkg.suppressBodyImagery;

  const checks = STANDARD_CHECKLIST.filter(
    (item) => !(suppressBodyImagery && BODY_IMAGERY_CHECK_IDS.has(item.id)),
  ).map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    met: item.met(list),
  }));

  const minCountMet = list.length >= BOOK_MIN_FRAME_COUNT;
  checks.unshift({
    id: 'min_count',
    ...READINESS_CHECKLIST_COPY.min_count,
    met: minCountMet,
  });

  checks.push({
    id: 'recency',
    label: READINESS_CHECKLIST_COPY.recency.label,
    description: `Reshoot your digitals within ${DIGITALS_STALE_DAYS} days to stay current.`,
    met: !pkg.recency.isStale,
  });

  const metCount = checks.filter((c) => c.met).length;
  const score = Math.round((metCount / checks.length) * 100);

  return {
    checks,
    score,
    missingCount: checks.length - metCount,
    isComplete: score === 100,
    digitals: pkg.digitals,
    package: pkg,
  };
}
