/**
 * Type casting.
 *
 * A casting is a complete typographic voice: a display face for the name,
 * a text face for the record, and a label style — set with the tracking,
 * case and weight a designer would give them. Each composition says which
 * castings suit it; the talent's material decides among those.
 *
 * Character is read from the photography as a whole (not one picture):
 * high- or low-key, colourful or quiet, warm or cool, smiling or still,
 * studio or location, and the talent's own editorial/commercial labels.
 */
import { photoLightness, photoClusters } from './palette';

export const CASTINGS = {
  couture: {
    title: 'Couture',
    display: { family: 'bodoni', weight: 400, tracking: -0.01 },
    displayItalic: { family: 'bodoni', weight: 400, style: 'italic', tracking: -0.01 },
    text: { family: 'inter', weight: 400, size: 7, tracking: 0.005 },
    label: { family: 'inter', weight: 500, size: 6, tracking: 0.16, caps: 'upper' },
    figure: { family: 'bodoni', weight: 400, numeric: 'lining' },
    caseName: 'upper',
    profile: { editorial: 1, quiet: 0.4, studio: 0.6, cool: 0.3 },
  },
  editorial: {
    title: 'Editorial',
    display: { family: 'instrument', weight: 400, tracking: -0.015 },
    displayItalic: { family: 'instrument', weight: 400, style: 'italic', tracking: -0.01 },
    text: { family: 'hanken', weight: 400, size: 7, tracking: 0.01 },
    label: { family: 'hanken', weight: 600, size: 6, tracking: 0.14, caps: 'upper' },
    figure: { family: 'instrument', weight: 400 },
    caseName: 'title',
    profile: { editorial: 0.8, location: 0.4, warm: 0.2 },
  },
  literary: {
    title: 'Literary',
    display: { family: 'newsreader', weight: 300, style: 'italic', tracking: -0.02 },
    displayItalic: { family: 'newsreader', weight: 300, style: 'italic', tracking: -0.02 },
    text: { family: 'newsreader', weight: 400, size: 7.6, tracking: 0, numeric: 'oldstyle' },
    label: { family: 'newsreader', weight: 500, size: 7, tracking: 0.08, caps: 'small' },
    figure: { family: 'newsreader', weight: 300 },
    caseName: 'title',
    profile: { quiet: 0.8, warm: 0.5, location: 0.5, still: 0.5 },
  },
  classic: {
    title: 'Classic',
    display: { family: 'cormorant', weight: 300, tracking: 0 },
    displayItalic: { family: 'cormorant', weight: 300, style: 'italic', tracking: 0 },
    text: { family: 'cormorant', weight: 500, size: 8.4, tracking: 0.01, numeric: 'oldstyle' },
    label: { family: 'cormorant', weight: 600, size: 7.4, tracking: 0.12, caps: 'upper' },
    figure: { family: 'cormorant', weight: 300 },
    caseName: 'title',
    profile: { quiet: 0.9, highkey: 0.5, still: 0.6, warm: 0.3 },
  },
  airy: {
    title: 'Airy',
    display: { family: 'italiana', weight: 400, tracking: 0.08 },
    displayItalic: { family: 'italiana', weight: 400, tracking: 0.08 },
    text: { family: 'isans', weight: 400, size: 6.8, tracking: 0.02 },
    label: { family: 'isans', weight: 500, size: 6, tracking: 0.2, caps: 'upper' },
    figure: { family: 'italiana', weight: 400 },
    caseName: 'upper',
    profile: { highkey: 1, quiet: 0.7, studio: 0.5 },
  },
  sharp: {
    title: 'Sharp',
    display: { family: 'gloock', weight: 400, tracking: -0.015 },
    displayItalic: { family: 'gloock', weight: 400, tracking: -0.015 },
    text: { family: 'schibsted', weight: 400, size: 7, tracking: 0 },
    label: { family: 'schibsted', weight: 600, size: 6, tracking: 0.12, caps: 'upper' },
    figure: { family: 'gloock', weight: 400 },
    caseName: 'title',
    profile: { editorial: 0.6, lowkey: 0.6, vivid: 0.3 },
  },
  punchy: {
    title: 'Display',
    display: { family: 'dmserif', weight: 400, tracking: -0.02 },
    displayItalic: { family: 'dmserif', weight: 400, style: 'italic', tracking: -0.02 },
    text: { family: 'schibsted', weight: 400, size: 7, tracking: 0 },
    label: { family: 'schibsted', weight: 700, size: 6, tracking: 0.12, caps: 'upper' },
    figure: { family: 'dmserif', weight: 400 },
    caseName: 'title',
    profile: { vivid: 0.8, smile: 0.6, commercial: 0.6, warm: 0.4 },
  },
  warm: {
    title: 'Warm',
    display: { family: 'fraunces', weight: 380, tracking: -0.02, axes: { SOFT: 100, WONK: 0 } },
    displayItalic: { family: 'fraunces', weight: 300, style: 'italic', tracking: -0.02, axes: { SOFT: 100, WONK: 1 } },
    text: { family: 'hanken', weight: 400, size: 7, tracking: 0.01 },
    label: { family: 'hanken', weight: 600, size: 6, tracking: 0.14, caps: 'upper' },
    figure: { family: 'fraunces', weight: 400, axes: { SOFT: 100 } },
    caseName: 'title',
    profile: { warm: 1, smile: 0.8, commercial: 0.7, location: 0.4 },
  },
  modernist: {
    title: 'Modernist',
    display: { family: 'inter', weight: 600, tracking: -0.045 },
    displayItalic: { family: 'inter', weight: 300, tracking: -0.03 },
    text: { family: 'inter', weight: 400, size: 7, tracking: 0 },
    label: { family: 'inter', weight: 600, size: 6, tracking: 0.08, caps: 'upper' },
    figure: { family: 'inter', weight: 300, tracking: -0.03 },
    caseName: 'title',
    profile: { studio: 0.7, cool: 0.6, quiet: 0.4, commercial: 0.3 },
  },
  street: {
    title: 'Street',
    display: { family: 'archivo', weight: 900, stretch: 62, tracking: -0.01 },
    displayItalic: { family: 'archivo', weight: 900, stretch: 62, tracking: -0.01 },
    text: { family: 'archivo', weight: 400, size: 7, stretch: 100 },
    label: { family: 'archivo', weight: 700, size: 6, stretch: 100, tracking: 0.1, caps: 'upper' },
    figure: { family: 'archivo', weight: 800, stretch: 62 },
    caseName: 'upper',
    profile: { vivid: 0.7, location: 0.8, lowkey: 0.3, commercial: 0.3 },
  },
  avant: {
    title: 'Avant',
    display: { family: 'syne', weight: 800, tracking: -0.03 },
    displayItalic: { family: 'syne', weight: 500, tracking: -0.02 },
    text: { family: 'mono', weight: 400, size: 6.4, stretch: 100, tracking: 0 },
    label: { family: 'mono', weight: 400, size: 6, stretch: 87, tracking: 0.04, caps: 'upper' },
    figure: { family: 'syne', weight: 700 },
    caseName: 'upper',
    profile: { editorial: 0.7, vivid: 0.6, lowkey: 0.5, cool: 0.4 },
  },
  expressive: {
    title: 'Expressive',
    display: { family: 'bricolage', weight: 700, stretch: 100, tracking: -0.04 },
    displayItalic: { family: 'bricolage', weight: 300, stretch: 100, tracking: -0.03 },
    text: { family: 'bricolage', weight: 400, size: 7, stretch: 100 },
    label: { family: 'bricolage', weight: 600, size: 6, stretch: 100, tracking: 0.06, caps: 'upper' },
    figure: { family: 'bricolage', weight: 600, stretch: 90 },
    caseName: 'lower',
    profile: { vivid: 0.9, smile: 0.5, commercial: 0.5 },
  },
};

/** The talent's photographic character, 0..1 per trait. */
export function readCharacter(items, labels = []) {
  const list = items.filter(Boolean);
  if (!list.length) return {};
  const L = list.reduce((s, it) => s + photoLightness(it.perception), 0) / list.length;
  let C = 0;
  let warmth = 0;
  let n = 0;
  for (const it of list) {
    for (const cl of photoClusters(it.perception, { k: 4 })) {
      C += cl.C * cl.weight;
      // Warm hues (reds/oranges/yellows) ~ 20..100 degrees in LCh.
      const warm = Math.cos(((cl.h - 60) * Math.PI) / 180);
      warmth += warm * Math.min(1, cl.C / 25) * cl.weight;
      n += cl.weight;
    }
  }
  C /= n || 1;
  warmth /= n || 1;
  const smile = list.filter((it) => it.subject?.face?.smile).length / list.length;
  const studio = list.filter((it) => (it.subject?.calm ?? 0) > 0.75).length / list.length;
  const ed = labels.filter((l) => /editorial|runway|high.?fashion/i.test(l)).length;
  const co = labels.filter((l) => /commercial|lifestyle|fitness|catalog/i.test(l)).length;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  return {
    highkey: clamp((L - 55) / 25),
    lowkey: clamp((45 - L) / 25),
    vivid: clamp((C - 14) / 22),
    quiet: clamp((22 - C) / 14),
    warm: clamp(warmth * 2),
    cool: clamp(-warmth * 2),
    smile,
    still: 1 - smile,
    studio,
    location: 1 - studio,
    editorial: ed ? clamp(ed / (ed + co)) : 0.5,
    commercial: co ? clamp(co / (ed + co)) : 0.4,
  };
}

/** Choose a casting from a composition's allowed list for this character. */
export function castType(allowed, character, override) {
  if (override && allowed.includes(override)) return { id: override, ...CASTINGS[override] };
  let best = allowed[0];
  let bestScore = -Infinity;
  allowed.forEach((id, i) => {
    const prof = CASTINGS[id].profile;
    let score = 0;
    let w = 0;
    for (const [k, v] of Object.entries(prof)) {
      score += v * (character[k] ?? 0.4);
      w += v;
    }
    // Normalise, and give the composition's own order a gentle say.
    score = score / (w || 1) - i * 0.03;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  });
  return { id: best, ...CASTINGS[best] };
}

/** Apply a casting's name case. */
export function nameCase(s, casting) {
  if (casting.caseName === 'upper') return s.toUpperCase();
  if (casting.caseName === 'lower') return s.toLowerCase();
  return s;
}
