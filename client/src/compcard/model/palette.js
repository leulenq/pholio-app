/**
 * Palette — colour taken from the talent's own photographs.
 *
 * Colours are clustered in CIELAB from each photo's tone grid, weighted
 * toward the background (the photographer's chosen world) rather than skin
 * or clothing. Directions turn a cluster into a printable colour world: a
 * field, an ink and a soft secondary — with contrast guaranteed, never
 * assumed.
 */

// --- colour science -------------------------------------------------------

const toLin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (l) => {
  const v = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055;
  return v * 255;
};

export function rgbToLab([r, g, b]) {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToRgbRaw([L, a, b]) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883;
  const R = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  const G = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  const B = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  return [toSrgb(R), toSrgb(G), toSrgb(B)];
}

const inGamut = (rgb) => rgb.every((v) => v >= -0.5 && v <= 255.5);

/** LCh → sRGB, reducing chroma until the colour is printable on screen. */
export function lch(L, C, h) {
  let c = C;
  for (let i = 0; i < 40; i++) {
    const rad = (h * Math.PI) / 180;
    const rgb = labToRgbRaw([L, c * Math.cos(rad), c * Math.sin(rad)]);
    if (inGamut(rgb)) return rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))));
    c *= 0.9;
  }
  return labToRgbRaw([L, 0, 0]).map((v) => Math.max(0, Math.min(255, Math.round(v))));
}

export function toLch(rgb) {
  const [L, a, b] = rgbToLab(rgb);
  return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

export function relLum([r, g, b]) {
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}
export function contrast(a, b) {
  const la = relLum(a);
  const lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export const hex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

// --- extraction -------------------------------------------------------------

/**
 * Cluster a photo's colours. Returns clusters sorted by weight:
 * { rgb, L, C, h, weight, background } (background = share from non-subject cells).
 */
export function photoClusters(perception, { k = 5, backgroundBias = 2.2 } = {}) {
  const tone = perception?.tone;
  if (!tone) return [];
  const mask = perception.mask;
  const pts = [];
  for (let y = 0; y < tone.rows; y++) {
    for (let x = 0; x < tone.cols; x++) {
      let person = 0;
      if (mask) {
        const my = Math.min(mask.rows - 1, Math.floor(((y + 0.5) / tone.rows) * mask.rows));
        const mx = Math.min(mask.cols - 1, Math.floor(((x + 0.5) / tone.cols) * mask.cols));
        person = mask.person[my][mx];
      }
      const rgb = tone.color[y][x];
      pts.push({ lab: rgbToLab(rgb), rgb, w: 1 + (1 - person) * (backgroundBias - 1), bg: 1 - person });
    }
  }
  // Deterministic k-means++-ish seeding: spread seeds across lightness.
  const sorted = [...pts].sort((p, q) => p.lab[0] - q.lab[0]);
  let centers = Array.from({ length: k }, (_, i) => sorted[Math.floor(((i + 0.5) / k) * sorted.length)].lab.slice());
  let assign = new Array(pts.length).fill(0);
  for (let it = 0; it < 12; it++) {
    assign = pts.map((p) => {
      let best = 0;
      let bd = Infinity;
      centers.forEach((c, i) => {
        const d = (p.lab[0] - c[0]) ** 2 + (p.lab[1] - c[1]) ** 2 + (p.lab[2] - c[2]) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    });
    centers = centers.map((c, i) => {
      let W = 0;
      const s = [0, 0, 0];
      pts.forEach((p, j) => {
        if (assign[j] !== i) return;
        W += p.w;
        s[0] += p.lab[0] * p.w;
        s[1] += p.lab[1] * p.w;
        s[2] += p.lab[2] * p.w;
      });
      return W ? s.map((v) => v / W) : c;
    });
  }
  const total = pts.reduce((s, p) => s + p.w, 0);
  return centers
    .map((c, i) => {
      const members = pts.filter((_, j) => assign[j] === i);
      const W = members.reduce((s, p) => s + p.w, 0);
      const bg = members.length ? members.reduce((s, p) => s + p.bg, 0) / members.length : 0;
      const rgb = labToRgbRaw(c).map((v) => Math.max(0, Math.min(255, Math.round(v))));
      return { rgb, L: c[0], C: Math.hypot(c[1], c[2]), h: ((Math.atan2(c[2], c[1]) * 180) / Math.PI + 360) % 360, weight: W / total, background: bg };
    })
    .filter((c) => c.weight > 0.02)
    .sort((a, b) => b.weight - a.weight);
}

/** Mean luminance of a photo (0..100 L*). */
export function photoLightness(perception) {
  const tone = perception?.tone;
  if (!tone) return 55;
  let s = 0;
  let n = 0;
  for (const row of tone.color) for (const c of row) { s += rgbToLab(c)[0]; n++; }
  return s / n;
}

/**
 * The signature colour of a set of photos: the most present, most
 * characterful background colour. Neutral sets return a neutral with a
 * faint cast taken from the photos (never a dead grey).
 */
export function signatureColour(items) {
  const all = [];
  items.forEach((it, i) => {
    const w = i === 0 ? 1.6 : 1; // the hero speaks loudest
    for (const c of photoClusters(it?.perception)) all.push({ ...c, weight: c.weight * w });
  });
  if (!all.length) return { L: 60, C: 4, h: 60, neutral: true };
  const score = (c) => c.weight * (0.35 + c.background) * (0.4 + Math.min(c.C, 45) / 30) * (c.L > 12 && c.L < 94 ? 1 : 0.3);
  const best = [...all].sort((a, b) => score(b) - score(a))[0];
  return { L: best.L, C: best.C, h: best.h, neutral: best.C < 9 };
}

/**
 * A printable colour world from a signature colour.
 * mode: 'light' (pale field, deep ink), 'deep' (dark field, pale ink),
 *       'vivid' (saturated field, near-black or white ink).
 */
export function colourWorld(sig, mode) {
  const { h } = sig;
  const C = sig.neutral ? Math.max(3, sig.C) : sig.C;
  let field;
  let ink;
  let soft;
  if (mode === 'deep') {
    field = lch(20, Math.min(C * 0.75, 30), h);
    ink = lch(94, Math.min(C * 0.18, 7), h);
    soft = lch(68, Math.min(C * 0.4, 18), h);
  } else if (mode === 'vivid') {
    const L = Math.max(46, Math.min(78, sig.L));
    field = lch(L, Math.max(C, 38), h);
    const dark = lch(12, Math.min(C * 0.4, 16), h);
    ink = contrast(field, dark) >= contrast(field, [255, 255, 255]) ? dark : [255, 255, 255];
    soft = contrast(field, dark) >= contrast(field, [255, 255, 255]) ? lch(L - 30, Math.min(C, 40), h) : lch(Math.min(96, L + 30), 12, h);
  } else {
    field = lch(91, Math.min(C * 0.32, 13), h);
    ink = lch(17, Math.min(C * 0.55, 24), h);
    soft = lch(52, Math.min(C * 0.45, 22), h);
  }
  // Guarantee legibility: walk the ink away from the field until it reads.
  const target = 7;
  for (let i = 0; i < 20 && contrast(field, ink) < target; i++) {
    const { L, C: c, h: hh } = toLch(ink);
    ink = lch(relLum(field) > 0.3 ? Math.max(0, L - 4) : Math.min(100, L + 4), c, hh);
  }
  return { field, ink, soft, mode };
}
