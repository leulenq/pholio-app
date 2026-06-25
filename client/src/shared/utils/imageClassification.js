/**
 * Client helpers for image intelligence display.
 */

import {
  frameTypeParts,
  formatFrameTypeLabel,
  labelForShot,
} from '../constants/frameTaxonomy';

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
  return formatFrameTypeLabel(shotType, imageType, styleType);
}

export { frameTypeParts, labelForShot as shotLabel };

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
