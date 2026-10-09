/**
 * SHOW — the show card, as the Paris and Milan agencies make them for the
 * season. White stock, one beauty image, the name small in widely spaced
 * capitals, nothing else. The restraint is the direction.
 * Back: two tall frames side by side over one wide one; the name and the
 * stats centred beneath in the same spaced capitals.
 */
import { bookingLine, grid, statRow, statTriples, TASTE, wordmark } from './kit';
import { runs, text } from './shared';

const PAPER = '#FBFAF8';
const INK = '#111111';
const SOFT = 'rgba(17,17,17,0.42)';
const MARK = '#A8894E';

function nameLine(ctx, g, sizeU, y) {
  const f = { family: 'archivo', weight: 500, size: g.pt(sizeU), tracking: 0.62, caps: 'upper' };
  f.size = Math.min(f.size, ctx.fitSize(ctx.name.full.toUpperCase(), { ...f, caps: null }, g.mm(86)));
  return text(ctx, ctx.name.full, f, ctx.format.w / 2, y, { align: 'center', color: INK }).el;
}

function front(ctx) {
  const g = grid(ctx);
  const hero = ctx.pickHero(TASTE.beauty);
  const els = [ctx.photo('front', hero, g.r(6, 6, 88, g.Hu - 30.5), 'portrait', { target: { ty: 0.42, zoom: 1.04 } })];
  els.push(nameLine(ctx, g, 2.7, g.mm(g.Hu - 14.6)));
  return { name: 'front', paper: PAPER, elements: els, hero };
}

function back(ctx, hero) {
  const g = grid(ctx);
  const Hu = g.Hu;
  const els = [];
  const items = ctx.backFor(hero, 8, (it) => TASTE.highkey(it) * 0.5 + TASTE.mono(it) * 0.5);
  const wideH = 34 * (Hu / 154.5);
  const tallH = Hu - 6 - 2 - wideH - 30.5;
  const slots = [
    { id: 'back-1', ...g.r(6, 6, 43, tallH), role: 'full', prefer: (it) => (it.subject.feetInFrame ? 2 : 0) },
    { id: 'back-2', ...g.r(51, 6, 43, tallH), role: 'portrait', prefer: (it) => (it.subject.feetInFrame ? -0.5 : 0.3) },
    { id: 'back-3', ...g.r(6, 6 + tallH + 2, 88, wideH), role: 'beauty', prefer: (it) => (it.subject.aspect > 1 ? 1 : 0) + (Math.abs(it.subject.face?.yaw || 0) > 0.5 ? 0.6 : 0) },
  ];
  const a = ctx.assign(slots, items);
  const targets = [{ ty: 0.14 }, { ty: 0.4 }, { ty: 0.5, zoom: 1.08 }];
  slots.forEach((sl, i) => {
    const it = a.get(sl.id);
    if (!it) return;
    const role = i === 0 ? (it.subject.feetInFrame ? 'full' : 'figure') : sl.role;
    els.push(ctx.photo(sl.id, it, sl, role, { target: targets[i] }));
  });
  els.push(nameLine(ctx, g, 2.2, g.mm(Hu - 23.6)));
  const st = statTriples(ctx);
  const f = { family: 'archivo', weight: 400, size: g.pt6(1.62), tracking: 0.24, caps: 'upper', labelGap: 0.8 };
  const rows = st.length > 4 ? [st.slice(0, 4), st.slice(4)] : [st];
  rows.forEach((row, i) => els.push(...statRow(ctx, row, ctx.format.w / 2, g.mm(Hu - 18 + i * 4), { font: f, labelColor: SOFT, valueColor: INK, altColor: INK, gapU: 2.6, align: 'center', maxW: g.mm(88) }).els));
  const b = bookingLine(ctx);
  const bf = { family: 'archivo', weight: 400, size: g.pt6(1.62), tracking: 0.18 };
  els.push(...runs(ctx, [{ t: b.label, font: bf, color: SOFT, gap: g.mm(1.6) }, { t: b.text, font: bf, color: INK }], ctx.format.w / 2, g.mm(Hu - 8.2), { align: 'center' }).els);
  els.push(wordmark(ctx, ctx.format.w / 2, g.mm(Hu - 4.6), 1.7, MARK, 'center'));
  return { name: 'back', paper: PAPER, elements: els };
}

export default {
  id: 'show',
  name: 'Show',
  summary: 'White stock, one beauty image, the name in spaced capitals.',
  compose(ctx) {
    const f = front(ctx);
    return { pages: [f, back(ctx, f.hero)] };
  },
};
