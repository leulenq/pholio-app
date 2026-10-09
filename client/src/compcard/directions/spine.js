/**
 * SPINE — the commercial card. The name stands up the spine of the card in
 * a light display serif, the way a book's title does, and the picture
 * fills the rest edge to edge. Commercial work books on warmth, so the
 * front leads with a smile when there is one.
 * Back: the name up the spine again, a full length beside three frames,
 * the stats set as a small serif table.
 */
import { bookingLine, columnBack, grid, statTriples, TASTE, wordmark } from './kit';
import { text } from './shared';

const IVORY = '#F3EDE3';
const INK = '#1E1A15';
const SOFT = 'rgba(30,26,21,0.5)';
const MARK = '#A8894E';
const NOTO = { family: 'noto', weight: 300, tracking: -0.02 };

/** A name rotated to read bottom-to-top, centred on column x (mm). */
function spineName(ctx, g, sizeU, cx, bottomU, lengthU) {
  const f = { ...NOTO, size: g.pt(sizeU) };
  f.size = Math.min(f.size, ctx.fitSize(ctx.name.full, f, g.mm(lengthU)));
  const m = ctx.measure(ctx.name.full, f);
  return {
    type: 'text',
    lines: [ctx.name.full],
    font: f,
    color: INK,
    x: cx - m.cap / 2,
    y: g.mm(bottomU) - m.width,
    w: m.cap,
    h: m.width + 1,
    rotate: -90,
  };
}

function front(ctx) {
  const g = grid(ctx);
  const hero = ctx.pickHero(TASTE.smile);
  const els = [ctx.photo('front', hero, g.r(21, 0, 79, g.Hu), 'portrait', { bleed: { t: 1, r: 1, b: 1 }, target: { ty: 0.3, tx: 0.48 } })];
  els.push(spineName(ctx, g, 12.4, g.mm(10.6), g.Hu - 5.5, g.Hu - 11));
  return { name: 'front', paper: IVORY, elements: els, hero };
}

function back(ctx, hero) {
  const g = grid(ctx);
  const Hu = g.Hu;
  const W = ctx.format.w;
  const els = [spineName(ctx, g, 7.2, g.mm(12.6), Hu - 5.5, Hu - 11)];
  els.push(...columnBack(ctx, hero, { x: 21, y: 5, tallW: 36, colW: 36, gap: 2, bottom: Hu - 57.5 , taste: (it) => TASTE.smile(it) * 0.4 + TASTE.highkey(it) * 0.4 }));
  const lab = { family: 'noto', weight: 400, style: 'italic', size: g.pt6(1.95) };
  const val = { family: 'noto', weight: 400, size: g.pt(3) };
  const alt = { family: 'inter', weight: 400, size: g.pt6(1.5) };
  statTriples(ctx).forEach(([k, a, b], i) => {
    const x = g.mm(21 + (i % 4) * 18.6);
    const y = g.mm(Hu - 49.6 + Math.floor(i / 4) * 12.4);
    els.push(text(ctx, k, lab, x, y, { color: SOFT }).el);
    const v = text(ctx, a, val, x, y + g.mm(3), { color: INK });
    els.push(v.el);
    if (b) els.push(text(ctx, b, alt, x, v.bottom + g.mm(1.8), { color: SOFT }).el);
  });
  const bk = bookingLine(ctx);
  els.push(text(ctx, 'Bookings' === bk.label ? 'Bookings' : bk.label, { ...lab, size: g.pt(2) }, g.mm(21), g.mm(Hu - 10.2), { color: SOFT }).el);
  const bf = { family: 'inter', weight: 500, size: g.pt(2) };
  bf.size = Math.min(bf.size, ctx.fitSize(bk.text, bf, g.mm(56)));
  els.push(text(ctx, bk.text, bf, g.mm(21), g.mm(Hu - 6.9), { color: INK }).el);
  els.push(wordmark(ctx, W - g.mm(5), g.mm(Hu - 7.6), 2.3, MARK, 'right'));
  return { name: 'back', paper: IVORY, elements: els };
}

export default {
  id: 'spine',
  name: 'Spine',
  summary: 'The commercial card: her name up the spine, the picture edge to edge.',
  compose(ctx) {
    const f = front(ctx);
    return { pages: [f, back(ctx, f.hero)] };
  },
};
