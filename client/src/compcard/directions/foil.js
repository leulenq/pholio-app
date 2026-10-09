/**
 * FOIL — the black book. Black stock, the photograph sunk into it, the name
 * in gold foil. Evening, editorial, luxury.
 * Back: a full length beside three frames, everything set in foil and
 * centred.
 */
import { bookingLine, columnBack, grid, statRow, statTriples, TASTE, wordmark } from './kit';
import { text } from './shared';
import { photoLightness } from '../model/palette';

const BLACK = '#12100E';
const FOIL = { kind: 'gradient', css: 'linear-gradient(100deg, #7c6230 0%, #c9a55a 22%, #f6e7bd 38%, #b8924a 50%, #e9d29a 64%, #8d7036 82%, #c9a55a 100%)' };

function front(ctx) {
  const g = grid(ctx);
  // Low-key, editorial frames sink into black stock best.
  const hero = ctx.pickHero((it) => TASTE.editorial(it) * 0.6 + Math.max(0, (55 - photoLightness(it.perception)) / 25));
  const els = [ctx.photo('front', hero, g.r(8, 8, 84, g.Hu - 38.5), 'portrait', { target: { ty: 0.3 } })];
  const nf = { family: 'bodoni', weight: 500, size: g.pt(6.6), tracking: 0.16, caps: 'upper' };
  nf.size = Math.min(nf.size, ctx.fitSize(ctx.name.full.toUpperCase(), { ...nf, caps: null }, g.mm(84)));
  els.push(text(ctx, ctx.name.full, nf, ctx.format.w / 2, g.mm(g.Hu - 20.8), { align: 'center', color: '#C9A55A', fill: FOIL }).el);
  return { name: 'front', paper: BLACK, elements: [{ type: 'rect', x: 0, y: 0, w: ctx.format.w, h: ctx.format.h, fill: BLACK, bleed: { t: 1, r: 1, b: 1, l: 1 } }, ...els], hero };
}

function back(ctx, hero) {
  const g = grid(ctx);
  const Hu = g.Hu;
  const W = ctx.format.w;
  const els = [{ type: 'rect', x: 0, y: 0, w: W, h: ctx.format.h, fill: BLACK, bleed: { t: 1, r: 1, b: 1, l: 1 } }];
  els.push(...columnBack(ctx, hero, { x: 8, y: 8, tallW: 41, colW: 41, gap: 2, bottom: Hu - 50.5 , taste: (it) => TASTE.lowkey(it) * 0.8 }));
  const nf = { family: 'bodoni', weight: 500, size: g.pt(4.2), tracking: 0.16, caps: 'upper' };
  nf.size = Math.min(nf.size, ctx.fitSize(ctx.name.full.toUpperCase(), { ...nf, caps: null }, g.mm(84)));
  els.push(text(ctx, ctx.name.full, nf, W / 2, g.mm(Hu - 41.2), { align: 'center', color: '#C9A55A', fill: FOIL }).el);
  const st = statTriples(ctx);
  const f = { family: 'bodoni', weight: 400, size: g.pt6(2.05), tracking: 0.14, caps: 'upper', labelGap: 0.9 };
  const rows = st.length > 4 ? [st.slice(0, 4), st.slice(4)] : [st];
  rows.forEach((row, i) => els.push(...statRow(ctx, row, W / 2, g.mm(Hu - 32 + i * 5), { font: f, labelColor: 'rgba(201,165,90,0.62)', valueColor: '#C9A55A', altColor: '#C9A55A', gapU: 2.8, align: 'center', maxW: g.mm(86), fill: FOIL }).els));
  const bk = bookingLine(ctx);
  const bf = { family: 'inter', weight: 400, size: g.pt6(1.7), tracking: 0.22, caps: 'upper' };
  const line = `${bk.label}  ${bk.text}`;
  bf.size = Math.min(bf.size, ctx.fitSize(line.toUpperCase(), { ...bf, caps: null }, g.mm(86)));
  els.push(text(ctx, line, bf, W / 2, g.mm(Hu - 12.4), { align: 'center', color: 'rgba(233,210,154,0.75)' }).el);
  els.push(wordmark(ctx, W / 2, g.mm(Hu - 7.2), 2.3, '#C9A55A', 'center', FOIL));
  return { name: 'back', paper: BLACK, elements: els };
}

export default {
  id: 'foil',
  name: 'Foil',
  summary: 'Black stock, the name in gold foil.',
  compose(ctx) {
    const f = front(ctx);
    return { pages: [f, back(ctx, f.hero)] };
  },
};
