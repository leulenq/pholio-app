import {
  analyzeDigitalsReadiness,
  analyzeDigitalsSet,
  analyzeBookRange,
  isHeadshotImage,
  isFullBodyImage,
  isBookFullLengthImage,
  isBookHeadshotImage,
  isDigitalSlot,
} from './profileReadinessImages';
import { isMinorProfile, minorSensitiveFieldsUnlocked } from './talentAge';
import { DIGITALS_STALE_DAYS } from '../constants/packageIntelligence';
import { PACKAGE_ADVISORY_COPY, advisoryInline } from '../constants/frameTaxonomy';

/**
 * Body imagery (full-length / ¾ / back framing + measurement-adjacent coaching)
 * must be withheld from a minor who lacks guardian consent. Mirrors the
 * minorSensitiveFieldsUnlocked gate the readiness path already enforces, so the
 * /media "Digitals read" panel and the profile readiness checklist agree.
 */
export function shouldSuppressBodyImagery(profile = null, now = new Date()) {
  if (!profile) return false;
  return isMinorProfile(profile, now) && !minorSensitiveFieldsUnlocked(profile, now);
}

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

/**
 * Digitals recency.
 *
 * ---------------------------------------------------------------------------
 * The canonical rule lives in `src/domains/talent/services/digitals-freshness.js`
 * on the server. This is a browser-side mirror of the part of it the client
 * needs; there is no shared build between `src/` and `client/src/`, so the two
 * are kept in step by hand. **Change both, or neither.**
 * ---------------------------------------------------------------------------
 *
 * This used to return only `isStale` / `oldestDays`, and returned
 * `isStale: false` when *nothing* carried a date — so every caller reading
 * `!isStale` as "current" treated a set of unknown age as a met requirement.
 * That is exactly what the server engine refuses to do: an undated set is not
 * current, because "current" is a claim about the whole set and one unknown
 * makes it unsupportable.
 *
 * So `isCurrent` is now its own answer rather than the negation of `isStale`.
 * `isStale` keeps its original meaning — genuinely past the window — because
 * callers that want "old" mean old, not "not known to be fresh".
 */
function analyzeRecency(images, now = new Date()) {
  const digitals = digitalSlotImages(images);
  const ages = digitals
    .map((img) => ({ id: img.id, days: getImageAgeDays(img, now) }))
    .filter((x) => x.days != null);

  const undatedImageIds = digitals
    .filter((img) => getImageAgeDays(img, now) == null)
    .map((img) => img.id);
  const isUndated = undatedImageIds.length > 0;

  if (!ages.length) {
    return {
      // No dated frame anywhere. Not stale — nobody knows — and emphatically
      // not current.
      isStale: false,
      isCurrent: false,
      isUndated: digitals.length > 0,
      state: digitals.length > 0 ? 'undated' : 'none',
      oldestDays: null,
      staleImageIds: [],
      undatedImageIds,
    };
  }

  const oldest = ages.reduce((a, b) => (a.days >= b.days ? a : b));
  const staleImageIds = ages
    .filter((a) => a.days > DIGITALS_STALE_DAYS)
    .map((a) => a.id);
  const isStale = oldest.days > DIGITALS_STALE_DAYS;

  return {
    isStale,
    // Dated, inside the window, and nothing of unknown age alongside it.
    isCurrent: !isStale && !isUndated,
    isUndated,
    state: isUndated ? 'undated' : isStale ? 'stale' : 'current',
    oldestDays: oldest.days,
    staleImageIds,
    undatedImageIds,
  };
}

function buildAdvisories(images, slots, recency, options = {}) {
  const { suppressBodyImagery = false } = options;
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
  // Full-length / body-imagery coaching is withheld from an unconsented minor —
  // the readiness path withholds the same slot, so the surfaces must agree.
  if (!slots.fullBody && !suppressBodyImagery) {
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

export function analyzePackageIntelligence({ images = [], profile = null, now = new Date() } = {}) {
  const list = Array.isArray(images) ? images : [];
  const suppressBodyImagery = shouldSuppressBodyImagery(profile, now);
  const digitals = analyzeDigitalsReadiness(list);
  const digitalsSet = analyzeDigitalsSet(list, { suppressBodyImagery });
  const bookRange = analyzeBookRange(list);
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
  const advisories = buildAdvisories(list, slots, recency, { suppressBodyImagery });
  // When body imagery is suppressed the talent cannot be asked for a full-length
  // frame, so it must not gate submission readiness.
  const isSubmissionReady =
    slots.headshot && (slots.fullBody || suppressBodyImagery) && !recency.isStale;
  return {
    slots,
    recency,
    advisories,
    digitals,
    digitalsSet,
    bookRange,
    suppressBodyImagery,
    isSubmissionReady,
  };
}

export function auditSubmissionPackage({ images = [], profile = null, now = new Date() } = {}) {
  const intel = analyzePackageIntelligence({ images, profile, now });
  return {
    ...intel,
    blockers: intel.advisories.filter((a) => a.severity === 'warn'),
    canSend: intel.isSubmissionReady,
  };
}

export { analyzeRecency, buildAdvisories };
