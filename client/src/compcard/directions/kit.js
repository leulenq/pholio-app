/**
 * The house kit every direction is drawn with.
 *
 * Cards are laid out in `u`: a hundredth of the card's width. A 5.5 × 8.5
 * card is 100 × 154.5 u; an A5 card is 100 × 141.9 u. Vertical positions of
 * the foot (name, stats, bookings) are measured from the bottom edge, so
 * one drawing serves both sizes.
 */
import { runs, text } from './shared';
import { photoLightness, rgbToLab } from '../model/palette';

const meanL = (it) => photoLightness(it.perception);
function chroma(it) {
  const t = it.perception?.tone;
  if (!t) return 10;
  let c = 0;
  let n = 0;
  for (const row of t.color) for (const px of row) {
    const [, a, b] = rgbToLab(px);
    c += Math.hypot(a, b);
    n++;
  }
  return c / n;
}

export function grid(ctx) {
  const U = ctx.format.w / 100;
  const Hu = ctx.format.h / U;
  return {
    U,
    Hu,
    /** u → mm */
    mm: (u) => u * U,
    /** u → pt (font sizes are drawn in u, like the rest of the card) */
    pt: (u) => (u * U * 72) / 25.4,
    /** u → pt, never below the 6pt print floor */
    pt6: (u) => Math.max(6, (u * U * 72) / 25.4),
    /** rect in u → mm */
    r: (x, y, w, h) => ({ x: x * U, y: y * U, w: w * U, h: h * U }),
  };
}

/** Stats in agency order as [label, value, other-unit]. */
export function statTriples(ctx) {
  const metric = ctx.stats.units === 'metric';
  return ctx.stats.items.map((it) => {
    if (it.key === 'height') return metric ? [it.label, `${it.value} cm`, it.alt] : [it.label, it.value, `${it.alt} cm`];
    if (it.unit === 'cm') return [it.label, it.value, `${it.alt}″`];
    if (it.unit === 'in') return [it.label, `${it.value}″`, it.alt];
    if (it.unit === 'EU' || it.unit === 'US') return [it.label, `${it.unit} ${it.value}`, it.alt || null];
    return [it.label, it.value, it.alt || null];
  });
}

/** Where to book: one line, agency first. */
export function bookingLine(ctx) {
  const c = ctx.contact;
  if (c.mode === 'agency') return { label: c.label, text: [c.agencyName, c.lines.find((l) => /\./.test(l) && !/@/.test(l)) || c.lines[0]].filter(Boolean).join('  ·  ') };
  const bits = [...c.lines.slice(0, 1), c.portfolio].filter(Boolean);
  return { label: c.label, text: bits.join('  ·  ') };
}

/** The Pholio wordmark, as a booking line carries it. */
export function wordmark(ctx, x, y, sizeU, color, align = 'left', fill) {
  const g = grid(ctx);
  return text(ctx, 'PHOLIO', { family: 'noto', weight: 400, size: g.pt(sizeU), tracking: 0.2 }, x, y, { color, align, fill }).el;
}

/** A row of stats ([label, value, alt]) as runs; shrinks to fit `maxW` mm. */
export function statRow(ctx, triples, x, y, { font, labelColor, valueColor, altColor, gapU = 3.4, align = 'left', maxW, sep = ' / ', z, fill }) {
  const g = grid(ctx);
  const build = (f) => {
    const list = [];
    triples.forEach(([k, a, b], i) => {
      list.push({ t: k, font: f, color: labelColor, gap: g.mm(f.labelGap ?? 1.1), fill });
      list.push({ t: a, font: f, color: valueColor, gap: b ? 0 : i < triples.length - 1 ? g.mm(gapU) : 0, fill });
      if (b) list.push({ t: `${sep}${b}`, font: f, color: altColor ?? labelColor, gap: i < triples.length - 1 ? g.mm(gapU) : 0, fill });
    });
    return list;
  };
  let f = font;
  let r = runs(ctx, build(f), x, y, { align, z });
  if (maxW && r.width > maxW) {
    f = { ...font, size: (font.size * maxW) / r.width };
    r = runs(ctx, build(f), x, y, { align, z });
  }
  return r;
}

/** What a casting director calls a frame. */
export function viewLabel(item) {
  const s = item?.subject;
  if (!s?.known) return 'Frame';
  if (s.feetInFrame) return 'Full length';
  if (s.face && Math.abs(s.face.yaw) > 0.55) return 'Profile';
  if (s.framing === 'three-quarter' || s.framing === 'half') return 'Figure';
  if (s.face?.smile) return 'Smile';
  return 'Three-quarter';
}

/**
 * The classic back: one tall frame (the full length) beside a column of
 * three. Rects in u. Returns photo elements.
 */
export function columnBack(ctx, front, { x, y, tallW, colW, gap, bottom, tallTy = 0.15, stackTy = [0.42, 0.4, 0.32], stackZoom = [1, 1, 1.15], taste }) {
  const g = grid(ctx);
  const h = bottom - y;
  const items = ctx.backFor(front, 8, taste);
  const layout = (k) => {
    const sh = (h - (k - 1) * gap) / k;
    return [
      { id: 'back-1', ...g.r(x, y, tallW, h), role: 'full', prefer: (it) => (it.subject.feetInFrame ? 2 : it.subject.framing === 'three-quarter' ? 0.6 : -0.5) },
      ...Array.from({ length: k }, (_, i) => ({ id: `back-${i + 2}`, ...g.r(x + tallW + gap, y + i * (sh + gap), colW, sh), role: 'portrait', prefer: (it) => (it.subject.feetInFrame ? -1 : 0) })),
    ];
  };
  // Three in the column when the library can fill them; otherwise the
  // column re-flows to two (or one) taller frames — never an empty slot.
  let slots = layout(3);
  let assigned = ctx.assign(slots, items);
  for (const k of [2, 1]) {
    if (slots.every((sl) => assigned.has(sl.id))) break;
    slots = layout(k);
    assigned = ctx.assign(slots, items);
  }
  const els = [];
  slots.forEach((sl, i) => {
    const it = assigned.get(sl.id);
    if (!it) return;
    const role = i === 0 ? (it.subject.feetInFrame ? 'full' : 'figure') : 'portrait';
    const target = i === 0 ? { ty: tallTy } : { ty: stackTy[i - 1] ?? 0.4, zoom: stackZoom[i - 1] ?? 1 };
    els.push(ctx.photo(sl.id, it, sl, role, { target }));
  });
  return els;
}

/** Hero tastes (added to general quality). */
export const TASTE = {
  editorial: (it) => {
    const s = it.subject;
    let v = 0;
    if (s.framing === 'half' || s.framing === 'three-quarter') v += 1;
    else if (s.framing === 'head-and-shoulders') v += 0.5;
    if (s.head && s.head.y0 > 0.12) v += 0.6;
    if (s.face?.smile) v -= 0.6;
    return v;
  },
  beauty: (it) => {
    const s = it.subject;
    let v = 0;
    if (s.framing === 'close-up' || s.framing === 'head-and-shoulders') v += 1.2;
    v -= Math.abs(s.face?.yaw || 0) * 0.8;
    if (s.face?.smile) v -= 0.5;
    return v;
  },
  smile: (it) => (it.subject.face?.smile ? 1.6 : 0) + (it.subject.framing === 'close-up' || it.subject.framing === 'head-and-shoulders' || it.subject.framing === 'half' ? 0.5 : 0),
  /** Mood of a frame: low-key (dark), high-key (light). */
  lowkey: (it) => Math.max(-1, Math.min(1, (50 - meanL(it)) / 20)),
  highkey: (it) => Math.max(-1, Math.min(1, (meanL(it) - 55) / 20)),
  colour: (it) => Math.min(1, chroma(it) / 25),
  mono: (it) => Math.max(0, 1 - chroma(it) / 6),
  natural: (it) => (it.subject.calm ?? 0) * 1.2 + (it.image_type === 'digital' ? 1 : 0) + (it.subject.framing === 'head-and-shoulders' || it.subject.framing === 'close-up' ? 0.6 : 0) - (it.subject.face?.smile ? 0.3 : 0),
};
