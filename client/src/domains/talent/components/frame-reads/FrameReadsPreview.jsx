import React, { useEffect, useState } from 'react';
import FrameReads from './FrameReads';

/**
 * DEV-only harness (/dev/preview/frame-reads). Fixture rows shaped exactly like
 * GET /api/talent media payloads, one per PITS case; saves are simulated.
 */

const cls = (over) => ({
  model: 'fixture',
  band: 'suggest',
  source: 'suggested',
  confirmed: false,
  ...over,
});

const FIXTURES = [
  {
    id: 'f-close-alternates',
    public_url: '/assets/model_full_body.jpg',
    metadata: {
      ai: {
        classification: cls({
          shot_type: { value: 'three_quarter', confidence: 0.71 },
          image_type: { value: 'portfolio', confidence: 0.86 },
          style_type: { value: 'editorial', confidence: 0.81 },
          shot_type_alternates: [{ value: 'full_length', confidence: 0.63 }],
          signals: {
            background: 'studio', styling_register: 'editorial', makeup_level: 'styled',
            retouch_likelihood: 'light', pose_yaw: 'three_quarter', expression: 'serious',
          },
          reasoning: 'Styled wardrobe and a lit studio set; the frame ends around the knee.',
        }),
      },
    },
  },
  {
    id: 'f-digital-or-book',
    public_url: '/assets/model_studio_warm.jpg',
    metadata: {
      ai: {
        classification: cls({
          shot_type: { value: 'headshot', confidence: 0.93 },
          image_type: { value: 'digital', confidence: 0.58 },
          style_type: { value: 'commercial', confidence: 0.84 },
          signals: {
            background: 'plain', styling_register: 'polished', makeup_level: 'minimal',
            retouch_likelihood: 'light', pose_yaw: 'front', expression: 'smile',
          },
          reasoning: 'Plain backdrop and a straight-on pose, but the grooming reads polished.',
        }),
      },
    },
  },
  {
    id: 'f-unsure-look',
    public_url: '/assets/model_golden_hour.jpg',
    metadata: {
      ai: {
        classification: cls({
          band: 'ask',
          shot_type: { value: 'waist_up', confidence: 0.9 },
          image_type: { value: 'portfolio', confidence: 0.9 },
          style_type: { value: 'lifestyle', confidence: 0.41 },
          signals: { background: 'environmental', styling_register: 'natural', expression: 'neutral' },
          reasoning: 'Outdoor light and casual styling.',
        }),
      },
    },
  },
  {
    id: 'f-heuristic-only',
    public_url: '/assets/login_hero.webp',
    metadata: {
      ai: {
        classification: cls({
          band: 'ask',
          model: 'heuristic-only',
          shot_type: { value: 'close_up', confidence: 0.6 },
          image_type: { value: null, confidence: 0 },
          style_type: { value: null, confidence: 0 },
          reasoning: 'no_vlm',
        }),
      },
    },
  },
  {
    id: 'f-pending',
    public_url: '/assets/model_bw_contrast.jpg',
    classification_status: 'pending',
    metadata: { ai: { classification: cls({ band: 'pending', source: 'pending' }) } },
  },
  // Settled frames: give the section counts something real.
  ...['digital', 'digital', 'portfolio', 'portfolio', 'portfolio', 'test'].map((t, i) => ({
    id: `settled-${i}`,
    public_url: '/assets/model_studio_warm.jpg',
    image_type: t,
    metadata: { ai: { classification: { band: 'confirmed', source: 'user', confirmed: true } } },
  })),
];

const READY_PENDING = cls({
  shot_type: { value: 'full_length', confidence: 0.77 },
  image_type: { value: 'portfolio', confidence: 0.88 },
  style_type: { value: 'editorial', confidence: 0.9 },
  shot_type_alternates: [{ value: 'three_quarter', confidence: 0.66 }],
  signals: { background: 'studio', styling_register: 'editorial', retouch_likelihood: 'heavy', expression: 'serious' },
  reasoning: 'High-contrast black and white with art direction.',
});

export default function FrameReadsPreview() {
  const [images, setImages] = useState(FIXTURES);

  useEffect(() => {
    const t = setTimeout(() => {
      setImages((list) => list.map((img) => (img.id === 'f-pending'
        ? { ...img, classification_status: 'ready', metadata: { ai: { classification: READY_PENDING } } }
        : img)));
    }, 7000);
    return () => clearTimeout(t);
  }, []);

  const save = async (id, payload) => {
    await new Promise((r) => setTimeout(r, 350));
    const img = images.find((i) => i.id === id);
    const prev = img.metadata.ai.classification;
    const next = {
      ...img,
      ...(Object.hasOwn(payload, 'shot_type') ? {
        shot_type: payload.shot_type, image_type: payload.image_type, style_type: payload.style_type,
      } : {}),
      metadata: { ai: { classification: { ...prev, ...payload.metadata.ai.classification } } },
    };
    return { image: next };
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FAF8F5', padding: 'clamp(16px, 4vw, 56px)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <FrameReads
          images={images}
          save={save}
          onSaved={(id, next) => setImages((list) => list.map((i) => (i.id === id ? next : i)))}
        />
      </div>
    </div>
  );
}
