/**
 * Frame reads model. Turns a stored image row (columns + the PITS provenance
 * in metadata.ai.classification) into what a frame card shows, and a talent's
 * decision back into the update payload. Pure, no React.
 *
 * PITS writes three fields, each with its own confidence:
 *   shot_type  -> framing
 *   image_type -> the section of the book the frame files into
 *   style_type -> the look
 * Thresholds mirror src/domains/talent/services/image-classification-policy.js.
 */

import {
  labelForShot,
  labelForStyle,
  labelForSignal,
  labelForExpression,
} from '../../../../shared/constants/frameTaxonomy';

export const FIELDS = ['shot', 'use', 'look'];

const COLUMN = { shot: 'shot_type', use: 'image_type', look: 'style_type' };

const THRESHOLDS = {
  shot: { sure: 0.88, likely: 0.65 },
  use: { sure: 0.8, likely: 0.55 },
  look: { sure: 0.8, likely: 0.55 },
};

export const FIELD_NAMES = { shot: 'Framing', use: 'Section', look: 'Look' };

/* Picker options, in the order agencies think about them. */
const SECTIONS = [
  { value: 'digital', name: 'Digitals' },
  { value: 'portfolio', name: 'Book' },
  { value: 'test', name: 'Tests' },
  { value: 'campaign', name: 'Campaigns' },
  { value: 'tearsheet', name: 'Tearsheets' },
];
const SECTION_ALIASES = { editorial: 'portfolio', runway: 'portfolio', comp_card: 'portfolio' };

export const OPTIONS = {
  shot: [
    'close_up', 'headshot', 'waist_up', 'three_quarter', 'full_length',
    'beauty', 'portrait_length', 'half_body', 'mid_length', 'profile', 'back', 'detail',
  ],
  use: SECTIONS.map((s) => s.value),
  look: ['editorial', 'commercial', 'lifestyle', 'beauty', 'ecommerce', 'swimwear', 'fitness', 'couture'],
};

/** The look most often confused with each look: the second answer to offer. */
const LOOK_RIVAL = {
  editorial: 'commercial',
  commercial: 'lifestyle',
  lifestyle: 'commercial',
  beauty: 'editorial',
  ecommerce: 'commercial',
  swimwear: 'fitness',
  fitness: 'lifestyle',
  couture: 'editorial',
};

export function labelFor(field, value) {
  if (!value) return '';
  if (field === 'shot') return labelForShot(value);
  if (field === 'use') return SECTIONS.find((s) => s.value === (SECTION_ALIASES[value] || value))?.name || '';
  return labelForStyle(value);
}

export function parseMeta(image) {
  if (!image?.metadata) return {};
  if (typeof image.metadata === 'object') return image.metadata;
  try {
    return JSON.parse(image.metadata);
  } catch {
    return {};
  }
}

export function imageSrc(image) {
  const v = image?.public_url || image?.path || '';
  if (!v) return '';
  if (v.startsWith('http') || v.startsWith('/')) return v;
  return `/uploads/${v.replace(/^\/+/, '')}`;
}

function certaintyOf(field, confidence, downgraded) {
  const c = Number(confidence) || 0;
  const t = THRESHOLDS[field];
  let level = c >= t.sure ? 'sure' : c >= t.likely ? 'likely' : 'unsure';
  if (downgraded) level = level === 'sure' ? 'likely' : 'unsure';
  return level;
}

function closeShotAlternates(cls) {
  const primary = Number(cls?.shot_type?.confidence) || 0;
  const alts = Array.isArray(cls?.shot_type_alternates) ? cls.shot_type_alternates : [];
  if (!alts.length) return false;
  const ranked = [primary, ...alts.map((a) => Number(a?.confidence) || 0)].sort((a, b) => b - a);
  return ranked.length >= 2 && ranked[0] - ranked[1] < 0.15;
}

function rivalFor(field, value, cls) {
  if (!value) return null;
  if (field === 'shot') {
    const alts = Array.isArray(cls?.shot_type_alternates) ? cls.shot_type_alternates : [];
    const best = alts
      .filter((a) => a?.value && a.value !== value && labelForShot(a.value))
      .sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0))[0];
    return best?.value || null;
  }
  if (field === 'use') return value === 'digital' ? 'portfolio' : 'digital';
  return LOOK_RIVAL[value] || null;
}

const OBSERVATION_KEYS = ['background', 'styling_register', 'makeup_level', 'retouch_likelihood', 'pose_yaw'];

/** Plain-language observations PITS recorded. Evidence, never editable. */
function observationsOf(signals = {}) {
  const out = [];
  for (const key of OBSERVATION_KEYS) {
    const label = labelForSignal(key, signals[key]);
    if (label) out.push(label);
  }
  const expression = labelForExpression(signals.expression);
  if (expression) out.push(expression);
  return out;
}

/** Everything a frame card needs about one image. */
export function readOf(image, { timedOut = false } = {}) {
  const meta = parseMeta(image);
  const cls = meta?.ai?.classification || {};
  const pending = image?.classification_status === 'pending' || cls.band === 'pending';
  const byTalent = cls.source === 'user';
  const downgraded =
    (Array.isArray(cls.uncertainty_factors) && cls.uncertainty_factors.length >= 2) ||
    closeShotAlternates(cls);

  const fields = {};
  for (const field of FIELDS) {
    const column = image?.[COLUMN[field]] || null;
    const proposed = cls?.[COLUMN[field]]?.value || null;
    const value = byTalent ? column || proposed : proposed || column;
    const fromPholio = !byTalent && !!proposed;
    fields[field] = {
      value,
      certainty: !value
        ? 'unread'
        : fromPholio
          ? certaintyOf(field, cls?.[COLUMN[field]]?.confidence, downgraded)
          : 'talent',
      rival: fromPholio ? rivalFor(field, value, cls) : null,
    };
  }

  return {
    id: image.id,
    src: imageSrc(image),
    pending: pending && !timedOut,
    fields,
    observations: observationsOf(meta?.ai?.signals || cls.signals || {}),
  };
}

export function draftOf(read) {
  return {
    shot: read.fields.shot.value || '',
    use: read.fields.use.value || '',
    look: read.fields.look.value || '',
  };
}

/**
 * The update payload for a confirmed read. Sending shot_type makes the server
 * lock the read as the talent's (source "user", band "confirmed"), which keeps
 * later classification passes from overwriting it, and logs any correction.
 */
export function savePayload(image, draft, { digitalsSetId = null } = {}) {
  const payload = {
    shot_type: draft.shot || null,
    image_type: draft.use || null,
    style_type: draft.look || null,
    metadata: {
      ai: { classification: { source: 'user', confirmed: true, band: 'confirmed' } },
    },
  };
  // A frame filed into Digitals joins the current dated set, otherwise the
  // Digitals section (which shows only the current set) would not show it.
  if (draft.use === 'digital' && digitalsSetId && !image.set_id) {
    payload.set_id = digitalsSetId;
  }
  return payload;
}

/** Leave the read unconfirmed and take the frame out of Frame reads. */
export function skipPayload() {
  return { metadata: { ai: { classification: { review_deferred: true } } } };
}
