import {
  analyzeDigitalsReadiness,
  isHeadshotImage,
  isFullBodyImage,
  isBookFullLengthImage,
  isBookHeadshotImage,
  isDigitalSlot,
} from './profileReadinessImages';
import { DIGITALS_STALE_DAYS } from '../constants/packageIntelligence';
import { PACKAGE_ADVISORY_COPY, advisoryInline } from '../constants/frameTaxonomy';

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function parseSignals(img) {
  const meta = parseMetadata(img?.metadata);
  return meta?.ai?.signals || meta?.ai?.classification?.signals || {};
}

export function getImageAgeDays(img, now = new Date()) {
  const raw = img?.captured_at || img?.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((now.getTime() - d.getTime()) / 86400000);
}

function digitalSlotImages(images) {
  return (images || []).filter(isDigitalSlot);
}

function analyzeRecency(images, now = new Date()) {
  const digitals = digitalSlotImages(images);
  const ages = digitals
    .map((img) => ({ id: img.id, days: getImageAgeDays(img, now) }))
    .filter((x) => x.days != null);
  if (!ages.length) {
    return { isStale: false, oldestDays: null, staleImageIds: [] };
  }
  const oldest = ages.reduce((a, b) => (a.days >= b.days ? a : b));
  const staleImageIds = ages
    .filter((a) => a.days > DIGITALS_STALE_DAYS)
    .map((a) => a.id);
  return {
    isStale: oldest.days > DIGITALS_STALE_DAYS,
    oldestDays: oldest.days,
    staleImageIds,
  };
}

function buildAdvisories(images, slots, recency) {
  const advisories = [];
  const list = images || [];

  if (recency.isStale) {
    advisories.push({
      id: 'stale_digitals',
      severity: 'warn',
      message: `Your digitals are ${recency.oldestDays} days old. Agencies expect a fresh set within ${DIGITALS_STALE_DAYS} days.`,
      imageIds: recency.staleImageIds,
    });
  }

  for (const img of list) {
    if (!isDigitalSlot(img)) continue;
    const signals = parseSignals(img);
    const styling = String(signals.styling_register || '').toLowerCase();
    const retouch = String(signals.retouch_likelihood || '').toLowerCase();
    if (styling === 'editorial' || styling === 'polished' || retouch === 'heavy') {
      advisories.push({
        id: 'portfolio_as_digital',
        severity: 'warn',
        message: advisoryInline('portfolio_as_digital'),
        imageIds: [img.id],
      });
    }
    const bg = String(signals.background || '').toLowerCase();
    if (bg === 'environmental') {
      advisories.push({
        id: 'busy_background',
        severity: 'info',
        message: advisoryInline('busy_background'),
        imageIds: [img.id],
      });
    }
  }

  if (!slots.headshot) {
    const bookHeadshots = list.filter(isBookHeadshotImage);
    if (bookHeadshots.length) {
      advisories.push({
        id: 'book_headshot_not_digital',
        severity: 'warn',
        message: advisoryInline('book_headshot_not_digital'),
        imageIds: bookHeadshots.map((i) => i.id),
        slot: 'headshot',
      });
    } else {
      advisories.push({
        id: 'missing_slot',
        severity: 'warn',
        message: advisoryInline('missing_slot_headshot'),
        imageIds: [],
        slot: 'headshot',
      });
    }
  }
  if (!slots.fullBody) {
    const bookFullLength = list.filter(isBookFullLengthImage);
    if (bookFullLength.length) {
      advisories.push({
        id: 'book_full_length_not_digital',
        severity: 'warn',
        message: advisoryInline('book_full_length_not_digital'),
        imageIds: bookFullLength.map((i) => i.id),
        slot: 'full_body',
      });
    } else {
      advisories.push({
        id: 'missing_slot',
        severity: 'warn',
        message: advisoryInline('missing_slot_full_body'),
        imageIds: [],
        slot: 'full_body',
      });
    }
  }

  const untyped = list.filter((img) => !img?.shot_type);
  if (untyped.length) {
    advisories.push({
      id: 'pending_classification',
      severity: 'info',
      message: `${untyped.length} frame${untyped.length === 1 ? '' : 's'} still need a type read.`,
      imageIds: untyped.map((i) => i.id),
    });
  }

  return advisories;
}

const READINESS_KEY_TO_SLOT = {
  photo_headshot: 'headshot',
  photo_full_body: 'full_body',
};

const SLOT_GUIDANCE = {
  book_headshot_not_digital: {
    label: PACKAGE_ADVISORY_COPY.book_headshot_not_digital.readinessLabel,
    task: PACKAGE_ADVISORY_COPY.book_headshot_not_digital.readinessTask,
  },
  book_full_length_not_digital: {
    label: PACKAGE_ADVISORY_COPY.book_full_length_not_digital.readinessLabel,
    task: PACKAGE_ADVISORY_COPY.book_full_length_not_digital.readinessTask,
  },
};

export function resolveReadinessGuidance(key, advisories = [], defaults = {}) {
  const slot = READINESS_KEY_TO_SLOT[key];
  if (!slot) return defaults;

  const contextual = (advisories || []).find(
    (a) =>
      a.slot === slot &&
      (a.id === 'book_full_length_not_digital' || a.id === 'book_headshot_not_digital'),
  );
  if (contextual) {
    const guide = SLOT_GUIDANCE[contextual.id] || {};
    return {
      ...defaults,
      why: contextual.message,
      label: guide.label || defaults.label,
      task: guide.task || defaults.task,
    };
  }

  const missing = (advisories || []).find(
    (a) => a.slot === slot && a.id === 'missing_slot',
  );
  if (missing?.message) {
    return { ...defaults, why: missing.message };
  }

  return defaults;
}

export function analyzePackageIntelligence({ images = [], now = new Date() } = {}) {
  const list = Array.isArray(images) ? images : [];
  const digitals = analyzeDigitalsReadiness(list);
  const recency = analyzeRecency(list, now);
  const slots = {
    headshot: list.some(isHeadshotImage),
    fullBody: list.some(isFullBodyImage),
    profile: digitals.hasProfile,
    smile: digitals.hasSmile,
    back: digitals.hasBack,
    editorial: digitals.hasEditorial,
    lifestyle: digitals.hasLifestyle,
    hasStyledHeadshot: list.some(
      (img) =>
        String(img?.shot_type) === 'headshot' &&
        String(img?.image_type) === 'portfolio',
    ),
    hasBookFullLength: list.some(isBookFullLengthImage),
    hasBookHeadshot: list.some(isBookHeadshotImage),
    bookFullLengthCount: list.filter(isBookFullLengthImage).length,
  };
  const advisories = buildAdvisories(list, slots, recency);
  return {
    slots,
    recency,
    advisories,
    digitals,
    isSubmissionReady: slots.headshot && slots.fullBody && !recency.isStale,
  };
}

export function auditSubmissionPackage({ images = [], now = new Date() } = {}) {
  const intel = analyzePackageIntelligence({ images, now });
  return {
    ...intel,
    blockers: intel.advisories.filter((a) => a.severity === 'warn'),
    canSend: intel.isSubmissionReady,
  };
}

export { analyzeRecency, buildAdvisories };
