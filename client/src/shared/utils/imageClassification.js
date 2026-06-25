/**
 * Client helpers for image intelligence display.
 */

const SHOT_LABELS = {
  headshot: 'Headshot',
  beauty: 'Beauty close-up',
  half_body: 'Half body',
  three_quarter: 'Three-quarter',
  full_length: 'Full length',
  profile: 'Profile',
  profile_left: 'Profile (left)',
  profile_right: 'Profile (right)',
  back: 'Back',
  detail: 'Detail',
};

const IMAGE_TYPE_LABELS = {
  digital: 'Digitals',
  portfolio: 'Book',
  comp_card: 'Comp card',
  campaign: 'Campaign',
  test: 'Test shoot',
  editorial: 'Editorial',
  runway: 'Runway',
};

const STYLE_LABELS = {
  editorial: 'Editorial',
  commercial: 'Commercial',
  lifestyle: 'Lifestyle',
  beauty: 'Beauty',
  ecommerce: 'E-commerce',
  swimwear: 'Swimwear',
  fitness: 'Fitness',
  couture: 'Couture',
};

function fallbackLabel(value) {
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseMetadata(image) {
  if (!image?.metadata) return {};
  if (typeof image.metadata === 'object') return image.metadata;
  try {
    return JSON.parse(image.metadata);
  } catch {
    return {};
  }
}

const INTERNAL_REASONING = new Set([
  'no_face_detected',
  'no_vlm',
]);

export function getClassificationState(image) {
  const meta = parseMetadata(image);
  const ai = meta?.ai?.classification;
  const band = ai?.band;
  const status =
    image?.classification_status ||
    (band === 'pending' ? 'pending' : 'ready');

  const rawReasoning = ai?.reasoning || '';
  const reasoning = INTERNAL_REASONING.has(rawReasoning) ? '' : rawReasoning;

  return {
    status,
    band: band || 'pending',
    shotType: image?.shot_type || ai?.shot_type?.value || null,
    imageType: image?.image_type || ai?.image_type?.value || null,
    styleType: image?.style_type || ai?.style_type?.value || null,
    suggestedShot: ai?.shot_type?.value || null,
    suggestedImageType: ai?.image_type?.value || null,
    reasoning,
    source: ai?.source || null,
  };
}

export function formatTypeLabel(shotType, imageType, styleType) {
  return typeSignalParts(shotType, imageType, styleType)
    .map((part) => part.label)
    .join(' · ');
}

export function typeSignalParts(shotType, imageType, styleType) {
  const parts = [];
  if (shotType) {
    parts.push({
      key: 'framing',
      label: SHOT_LABELS[shotType] || fallbackLabel(shotType),
    });
  }
  if (imageType) {
    parts.push({
      key: 'use',
      label: IMAGE_TYPE_LABELS[imageType] || fallbackLabel(imageType),
    });
  }
  if (styleType) {
    parts.push({
      key: 'register',
      label: STYLE_LABELS[styleType] || fallbackLabel(styleType),
    });
  }
  return parts;
}

export function imageNeedsReview(image) {
  const meta = parseMetadata(image);
  if (meta?.ai?.classification?.review_deferred) return false;
  const state = getClassificationState(image);
  if (state.status === 'pending') return true;
  return state.band === 'suggest' || state.band === 'ask';
}

/** Prefill FrameEditor from persisted columns or the current frame read. */
export function classificationFormDefaults(image) {
  const meta = parseMetadata(image);
  const cls = meta?.ai?.classification;
  const signals = meta?.ai?.signals || cls?.signals || {};
  return {
    shot_type: image?.shot_type ?? cls?.shot_type?.value ?? '',
    image_type: image?.image_type ?? cls?.image_type?.value ?? '',
    style_type: image?.style_type ?? cls?.style_type?.value ?? '',
    expression: signals.expression ?? '',
  };
}

export function shotLabel(shotType) {
  if (!shotType) return '';
  return SHOT_LABELS[shotType] || fallbackLabel(shotType);
}
