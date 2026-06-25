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

export function isFullBodyImage(img) {
  if (!img || !isDigitalSlot(img)) return false;
  return hasFullLengthFraming(img);
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
    hasProfile: list.some(
      (img) =>
        isDigitalSlot(img) &&
        hasShotType(img, ['profile', 'profile_left', 'profile_right']),
    ),
    hasSmile: list.some(isSmileHeadshot),
    hasBack: list.some((img) => isDigitalSlot(img) && hasShotType(img, ['back'])),
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
