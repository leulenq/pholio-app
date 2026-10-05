/**
 * EDITORIAL
 *
 * White paper, photography first. On the front the photograph dissolves
 * into the paper — a long, soft fade where the picture becomes page — and
 * the name is set across that transition in a large italic serif. On the
 * back the pictures are layered: one bleeds off the page and fades into it,
 * two smaller ones overlap beside it like prints laid on a table.
 */
import { altUnit, splitStats, text } from './shared';
import { castType, nameCase, readCharacter } from '../model/typefaces';
import { readRect, spaceMap } from '../model/clearings';

const ALLOWED = ['literary', 'editorial', 'couture', 'classic', 'warm', 'sharp'];
const PAPER = '#FBFAF7';
const INK = '#161514';
const GREY = '#8B857D';
const INKS = { dark: [22, 21, 20], light: [251, 250, 247] };

function front(ctx, cast) {
  const { format } = ctx;
  const W = format.w;
  const H = format.h;
  const m = 10;
  const els = [];
  const hero = ctx.hero;
  const role = hero?.subject?.framing === 'close-up' || hero?.subject?.framing === 'head-and-shoulders' ? 'portrait' : 'figure';
  const photoH = H * 0.8;
  const photo = ctx.photo('front', hero, { x: 0, y: 0, w: W, h: photoH }, role, { bleed: { t: 1, r: 1, l: 1 } });
  // The fade begins below the chin — the face is never dissolved — and runs
  // as long as the picture allows.
  let fadeLen = H * 0.2;
  const s = hero?.subject;
  if (s?.head && photo.crop) {
    const chinY = ((s.head.y1 - photo.crop.y) / photo.crop.h) * photoH;
    fadeLen = Math.max(16, Math.min(H * 0.3, photoH - (chinY + 8)));
  }
  photo.fade = { b: fadeLen };
  els.push(photo);

  // Name: italic display across the fade, two lines when it reads better.
  const disp = { ...cast.displayItalic };
  const name = nameCase(ctx.name.full, cast);
  let lines = [name];
  let size = Math.min(54, ctx.fitSize(name, disp, W - 2 * m, { max: 54 }));
  if (size < 34 && ctx.name.last) {
    lines = [nameCase(ctx.name.first, cast), nameCase(ctx.name.last, cast)];
    size = Math.min(54, ...lines.map((l) => ctx.fitSize(l, disp, W - 2 * m, { max: 54 })));
  }
  const font = { ...disp, size };
  const cap = ctx.measure('H', font).cap;
  const lead = cap * 1.18;
  const details = [ctx.contact.mode === 'agency' ? ctx.contact.agencyName : ctx.city].filter(Boolean);
  const h = ctx.stats.items.find((i) => i.key === 'height');
  if (h) details.push(`${h.value}  ${altUnit(h, ctx.stats.units)}`);
  const lcap = ctx.measure('H', { ...cast.label, caps: null }).cap;
  const detH = 6 + lcap;
  const blockH = cap + lead * (lines.length - 1) + detH;
  const y = H - m - blockH;
  // The name sits over the faded photograph: confirm it reads there.
  const map = spaceMap(hero, photo.crop, { x: 0, y: 0, w: W, h: photoH }, 3, INKS);
  let ink = INK;
  if (map) {
    // Only the part still above the fade's midpoint carries image; check it.
    const r = readRect(map, { x: m, y, w: W - 2 * m, h: Math.max(0, Math.min(cap, photoH - fadeLen * 0.5 - y)) }, 3);
    if (r && r.ink === 'light' && y + cap < photoH - fadeLen * 0.6) ink = '#FBFAF7';
  }
  lines.forEach((l, i) => els.push(text(ctx, l, font, m, y + i * lead, { color: ink }).el));
  const dy = y + cap + lead * (lines.length - 1) + 6;
  els.push(text(ctx, details.join('     '), cast.label, m, dy, { color: GREY }).el);
  return { name: 'front', paper: PAPER, elements: els };
}

function back(ctx, cast) {
  const { format } = ctx;
  const W = format.w;
  const H = format.h;
  const m = 10;
  const els = [];
  const items = ctx.picks.back.filter(Boolean);
  const lead0 = items.find((i) => i.subject.feetInFrame) || items[0];
  const rest = items.filter((i) => i !== lead0).slice(0, 2);

  // The record at the foot first.
  const { measures, features } = splitStats(ctx.stats);
  const rows = [...measures, ...features];
  const half = Math.ceil(rows.length / 2);
  const lineH = 4.5;
  const c = ctx.contact;
  const contact = c.mode === 'agency' ? [c.agencyName, ...c.lines] : [...c.lines, c.portfolio].filter(Boolean);
  const recH = 14 + Math.max(half, contact.length + 1) * lineH;
  const recTop = H - m - recH;

  // Lead: bleeds off the left, top and the record's edge, fades into paper on the right.
  if (lead0) {
    const leadW = rest.length ? W * 0.62 : W;
    const p = ctx.photo('back-1', lead0, { x: 0, y: 0, w: leadW, h: recTop - 6 }, ctx.roleOf(lead0), { bleed: { t: 1, l: 1, ...(rest.length ? {} : { r: 1 }) } });
    if (rest.length) p.fade = { r: leadW * 0.18 };
    els.push(p);
  }
  // Two prints laid over the right side, overlapping.
  if (rest.length) {
    const pw = W * 0.4;
    const ar = (it) => Math.max(0.68, Math.min(1.1, it.subject.width / it.subject.height));
    const h1 = pw / ar(rest[0]);
    const x1 = W - m - pw;
    const y1 = m + 6;
    els.push({ ...ctx.photo('back-2', rest[0], { x: x1, y: y1, w: pw, h: h1 }, ctx.roleOf(rest[0])), shadow: undefined, z: 2 });
    els[els.length - 1].style = undefined;
    if (rest[1]) {
      const pw2 = pw * 0.86;
      const h2 = pw2 / ar(rest[1]);
      const x2 = W - m - pw2 - pw * 0.34;
      const y2 = Math.min(y1 + h1 * 0.7, recTop - 10 - h2);
      els.push({ ...ctx.photo('back-3', rest[1], { x: x2, y: y2, w: pw2, h: h2 }, ctx.roleOf(rest[1])), z: 3 });
    }
  }

  // Record.
  const nm = nameCase(ctx.name.full, cast);
  const nt = text(ctx, nm, { ...cast.displayItalic, size: Math.min(20, ctx.fitSize(nm, cast.displayItalic, W - 2 * m)) }, m, recTop + 4, { color: INK });
  els.push(nt.el);
  const y0 = nt.bottom + 6;
  const contactW = Math.max(ctx.measure(c.label.toUpperCase(), { ...cast.label, caps: null }).width, ...contact.map((l) => ctx.measure(l, cast.text).width));
  const colW = (W - 2 * m - contactW - 8) / 2;
  const labelW = Math.max(0, ...rows.map((r) => ctx.measure(r.label.toUpperCase(), { ...cast.label, caps: null }).width)) + 2.6;
  rows.forEach((r, i) => {
    const col = i < half ? 0 : 1;
    const row = i < half ? i : i - half;
    const x = m + col * colW;
    const y = y0 + row * lineH;
    els.push(text(ctx, r.label, cast.label, x, y + 0.3, { color: GREY }).el);
    const alt = altUnit(r, ctx.stats.units);
    els.push(text(ctx, alt ? `${r.value}  ${alt}` : r.value, cast.text, x + labelW, y, { color: INK }).el);
  });
  els.push(text(ctx, c.label, cast.label, W - m, y0 + 0.3, { align: 'right', color: GREY }).el);
  contact.forEach((l, i) => els.push(text(ctx, l, cast.text, W - m, y0 + (i + 1) * lineH, { align: 'right', color: INK }).el));
  return { name: 'back', paper: PAPER, elements: els };
}

export default {
  id: 'editorial',
  name: 'Editorial',
  summary: 'White paper; the photograph dissolves into the page beneath an italic name.',
  compose(ctx) {
    const character = readCharacter([ctx.hero, ...ctx.picks.back], ctx.labels);
    const cast = castType(ALLOWED, character, ctx.settings.type);
    return { pages: [front(ctx, cast), back(ctx, cast)], casting: cast.id };
  },
};
