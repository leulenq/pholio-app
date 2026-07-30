/**
 * Client mirror of profile-readiness-images digitals helpers.
 */

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function parseMetadataRole(img) {
  try {
    const meta = typeof img?.metadata === 'string' ? JSON.parse(img.metadata) : img?.metadata;
    return normalizeToken(meta?.role);
  } catch {
    return '';
  }
}

function parseAiSignals(img) {
  try {
    const meta = typeof img?.metadata === 'string' ? JSON.parse(img.metadata) : img?.metadata;
    return meta?.ai?.signals || meta?.ai?.classification?.signals || {};
  } catch {
    return {};
  }
}

export function isDigitalSlot(img) {
  if (!img) return false;
  const imageType = normalizeToken(img?.image_type);
  if (imageType === 'digital') return true;
  if (imageType === 'portfolio' || imageType === 'comp_card' || imageType === 'campaign') {
    return false;
  }
  if (!imageType) {
    return false;
  }
  return false;
}

function hasShotType(img, types) {
  const shot = normalizeToken(img?.shot_type);
  return types.some((type) => type === shot);
}

export function isHeadshotImage(img) {
  if (!img || !isDigitalSlot(img)) return false;
  if (hasShotType(img, ['headshot'])) return true;
  const role = parseMetadataRole(img);
  return role === 'headshot';
}

function hasFullLengthFraming(img) {
  if (!img) return false;
  if (hasShotType(img, ['full_length', 'full_body', 'three_quarter'])) return true;
  return parseMetadataRole(img) === 'full_body';
}

/** Head-to-toe framing only (excludes ¾) — used for the discrete digitals-set slot. */
function hasHeadToToeFraming(img) {
  if (!img) return false;
  if (hasShotType(img, ['full_length', 'full_body'])) return true;
  return parseMetadataRole(img) === 'full_body';
}

export function isFullBodyImage(img) {
  if (!img || !isDigitalSlot(img)) return false;
  return hasFullLengthFraming(img);
}

/** Discrete digitals-set slot: a raw full-length (head-to-toe) frame, ¾ excluded. */
export function isDigitalFullLengthImage(img) {
  if (!img || !isDigitalSlot(img)) return false;
  return hasHeadToToeFraming(img);
}

/** Discrete digitals-set slot: a raw three-quarter (¾) frame. */
export function isDigitalThreeQuarterImage(img) {
  if (!img || !isDigitalSlot(img)) return false;
  return hasShotType(img, ['three_quarter']);
}

/** Discrete digitals-set slot: a raw side-profile frame. */
export function isDigitalProfileImage(img) {
  if (!img || !isDigitalSlot(img)) return false;
  return hasShotType(img, ['profile', 'profile_left', 'profile_right']);
}

/** Discrete digitals-set slot: a raw back-view frame. */
export function isDigitalBackImage(img) {
  if (!img || !isDigitalSlot(img)) return false;
  return hasShotType(img, ['back']);
}

/** Full-length framing in book/portfolio work — does not satisfy digitals readiness. */
export function isBookFullLengthImage(img) {
  if (!img || isDigitalSlot(img)) return false;
  return hasFullLengthFraming(img);
}

/** Headshot framing in book/portfolio work — does not satisfy digitals readiness. */
export function isBookHeadshotImage(img) {
  if (!img || isDigitalSlot(img)) return false;
  if (hasShotType(img, ['headshot'])) return true;
  return parseMetadataRole(img) === 'headshot';
}

export function isSmileHeadshot(img) {
  if (!isHeadshotImage(img)) return false;
  return String(parseAiSignals(img).expression || '').toLowerCase() === 'smile';
}

export function analyzeBookReadiness(images = []) {
  const list = Array.isArray(images) ? images : [];
  const hasHeadshot = list.some(isHeadshotImage);
  const hasFullBody = list.some(isFullBodyImage);
  const hasAnyImage = list.length > 0;
  const taggedCount = list.filter(
    (img) =>
      normalizeToken(img?.shot_type) ||
      normalizeToken(img?.image_type) ||
      parseMetadataRole(img),
  ).length;

  return {
    hasAnyImage,
    hasHeadshot,
    hasFullBody,
    hasBookBasics: hasHeadshot && hasFullBody,
    taggedCount,
    imageCount: list.length,
  };
}

export function analyzeDigitalsReadiness(images = []) {
  const list = Array.isArray(images) ? images : [];
  const book = analyzeBookReadiness(list);
  return {
    ...book,
    hasProfile: list.some(isDigitalProfileImage),
    hasSmile: list.some(isSmileHeadshot),
    hasBack: list.some(isDigitalBackImage),
    hasEditorial: list.some(
      (img) =>
        normalizeToken(img?.style_type) === 'editorial' &&
        normalizeToken(img?.image_type) === 'portfolio',
    ),
    hasLifestyle: list.some((img) => {
      const style = normalizeToken(img?.style_type);
      return (
        (style === 'lifestyle' || style === 'commercial') &&
        normalizeToken(img?.image_type) === 'portfolio'
      );
    }),
  };
}

/**
 * The five canonical digitals slots, in the order a booker reads them: the face
 * first, then the body. Both dashboards draw from this one list so the sheet a
 * talent works against and the sheet an agency judges are the same sheet.
 *
 * `body: true` marks the slots withheld from a minor without guardian consent.
 */
export const DIGITALS_SLOTS = [
  { key: 'headshot', label: 'Headshot', body: false },
  { key: 'profile', label: 'Profile', body: false },
  { key: 'three_quarter', label: 'Three-quarter', body: true },
  { key: 'full_length', label: 'Full length', body: true },
  { key: 'back', label: 'Back', body: true },
];

/**
 * The predicates `analyzeDigitalsSet` counts with, keyed by slot — so a picture
 * and the coverage number can never disagree. A styled book frame never stands
 * in for a raw digital.
 */
const SLOT_PREDICATE = {
  headshot: isHeadshotImage,
  profile: isDigitalProfileImage,
  three_quarter: isDigitalThreeQuarterImage,
  full_length: isDigitalFullLengthImage,
  back: isDigitalBackImage,
};

/** The frame filling a digitals slot, or null when the slot is empty. */
export function frameForSlot(images, slot) {
  const predicate = SLOT_PREDICATE[slot];
  if (!predicate) return null;
  return (images || []).find(predicate) || null;
}

/**
 * The canonical RAW digitals set — 5 discrete slots, image_type:'digital' only.
 * headshot · three_quarter (¾) · full_length · profile · back.
 * Styled book frames never count here (that's the Book range, see analyzeBookRange).
 *
 * @param {Array} images
 * @param {{ suppressBodyImagery?: boolean }} [options] — when a minor lacks
 *   guardian consent, body-imagery slots (¾ / full_length / back) are withheld
 *   from coverage so the talent is never coached to add them.
 */
export function analyzeDigitalsSet(images = [], options = {}) {
  const { suppressBodyImagery = false } = options;
  const list = Array.isArray(images) ? images : [];

  const slots = {
    headshot: list.some(isHeadshotImage),
    three_quarter: list.some(isDigitalThreeQuarterImage),
    full_length: list.some(isDigitalFullLengthImage),
    profile: list.some(isDigitalProfileImage),
    back: list.some(isDigitalBackImage),
  };

  // Body-imagery slots are withheld for unconsented minors so they neither show
  // as gaps nor drag coverage down.
  const BODY_SLOTS = ['three_quarter', 'full_length', 'back'];
  const activeSlotKeys = Object.keys(slots).filter(
    (key) => !(suppressBodyImagery && BODY_SLOTS.includes(key)),
  );

  const filledSlots = activeSlotKeys.filter((key) => slots[key]);
  const missingSlots = activeSlotKeys.filter((key) => !slots[key]);

  return {
    slots,
    suppressedBodySlots: suppressBodyImagery ? BODY_SLOTS : [],
    filledCount: filledSlots.length,
    requiredCount: activeSlotKeys.length,
    missingSlots,
    isComplete: missingSlots.length === 0,
  };
}

/**
 * The Book range — styled editorial / lifestyle / commercial registers drawn from
 * image_type:'portfolio'. These NEVER count toward digitals-set completeness; they
 * describe the breadth of styled work the book shows.
 */
export function analyzeBookRange(images = []) {
  const list = Array.isArray(images) ? images : [];

  const isStyledBook = (img) => normalizeToken(img?.image_type) === 'portfolio';

  const registers = {
    editorial: list.some(
      (img) => isStyledBook(img) && normalizeToken(img?.style_type) === 'editorial',
    ),
    lifestyle: list.some(
      (img) => isStyledBook(img) && normalizeToken(img?.style_type) === 'lifestyle',
    ),
    commercial: list.some(
      (img) => isStyledBook(img) && normalizeToken(img?.style_type) === 'commercial',
    ),
  };

  const registerKeys = Object.keys(registers);
  const coveredCount = registerKeys.filter((key) => registers[key]).length;

  return {
    registers,
    coveredCount,
    registerCount: registerKeys.length,
    hasAnyRange: coveredCount > 0,
  };
}
