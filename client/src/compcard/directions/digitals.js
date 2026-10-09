/**
 * DIGITALS — the working card a new face is asked for: natural light, plain
 * clothes, as she is. A digital mounted on grey stock like a print, the
 * name typed beneath.
 * Back: the digitals set on a black panel, each frame named for the shot
 * it is (full length, figure, profile, three-quarter), the stats typed.
 */
import { bookingLine, grid, statTriples, TASTE, viewLabel, wordmark } from './kit';
import { issueDate, text } from './shared';

const MONO_INK = '#1A1917';
const MONO_SOFT = 'rgba(26,25,23,0.55)';
const MARK = '#A8894E';
const mono = (size, weight = 400, tracking = 0.02) => ({ family: 'mono', weight, size, tracking });

function front(ctx) {
  const g = grid(ctx);
  const hero = ctx.pickHero(TASTE.natural);
  const ph = g.Hu - 30.5;
  const card = g.r(8, 9, 84, ph);
  const spin = { deg: -1.2, ox: card.x + card.w / 2, oy: card.y + card.h / 2 };
  const els = [
    { type: 'rect', ...card, fill: '#FBFAF7', spin, boxShadow: '0 0.3mm 0.5mm rgba(0,0,0,0.18), 0 2.6mm 5.8mm -3.2mm rgba(0,0,0,0.35)' },
  ];
  const photo = ctx.photo('front', hero, g.r(12, 13, 76, ph - 24), 'portrait', { target: { ty: 0.42 }, spin });
  els.push(photo);
  const nf = mono(g.pt(4.4), 500);
  nf.size = Math.min(nf.size, ctx.fitSize(ctx.name.full.toUpperCase(), nf, g.mm(76)));
  els.push(text(ctx, ctx.name.full.toUpperCase(), nf, g.mm(12), g.mm(9 + ph - 14.2), { color: MONO_INK, spin }).el);
  els.push(text(ctx, `DIGITALS · ${issueDate(ctx).toUpperCase()}`, mono(g.pt6(1.9)), g.mm(12), g.mm(9 + ph - 7.6), { color: MONO_SOFT, spin }).el);
  return { name: 'front', paper: '#D6D1C8', elements: els, hero };
}

/** Four different views, the frames a casting asks for. */
function viewSet(ctx, hero, max = 4) {
  const order = ['Full length', 'Figure', 'Profile', 'Three-quarter', 'Smile'];
  const pool = ctx.pool.filter((p) => p !== hero && p.subject.known && !p.flags.includes('other-people'));
  const byView = new Map();
  for (const it of [...pool].sort((a, b) => b.quality + TASTE.natural(b) * 0.4 - (a.quality + TASTE.natural(a) * 0.4))) {
    const v = viewLabel(it);
    if (!byView.has(v)) byView.set(v, it);
  }
  const out = [];
  for (const v of order) if (byView.has(v) && out.length < max) out.push([byView.get(v), v]);
  for (const it of pool) if (out.length < max && !out.some(([o]) => o === it)) out.push([it, viewLabel(it)]);
  return out;
}

function back(ctx, hero) {
  const g = grid(ctx);
  const Hu = g.Hu;
  const W = ctx.format.w;
  const panelH = Hu - 51.5;
  const els = [{ type: 'rect', ...g.r(4, 4, 92, panelH), fill: '#141312' }];
  const pitch = (panelH - 6) / 2;
  const fh = pitch - 5.5;
  // Only views that fill their frame without cutting the subject.
  const views = viewSet(ctx, hero, 8);
  const placed = [];
  for (const [it, label] of views) {
    if (placed.length >= 4) break;
    const i = placed.length;
    const x = 7 + (i % 2) * 44;
    const y = 7 + Math.floor(i / 2) * pitch;
    const role = it.subject.feetInFrame ? 'full' : label === 'Figure' ? 'figure' : 'portrait';
    const ph = ctx.photo(`back-${i + 1}`, it, g.r(x, y, 42, fh), role, { target: { ty: it.subject.feetInFrame ? 0.15 : 0.36 } });
    if (ph.contained) continue;
    placed.push([ph, label, x, y]);
  }
  placed.forEach(([ph, label, x, y], i) => {
    els.push(ph);
    els.push(text(ctx, `${String(i + 1).padStart(2, '0')}  ${label.toUpperCase()}`, mono(g.pt6(1.55), 400, 0.06), g.mm(x), g.mm(y + fh + 1.3), { color: 'rgba(237,234,228,0.6)' }).el);
  });
  const nf = mono(g.pt(3.2), 500);
  nf.size = Math.min(nf.size, ctx.fitSize(ctx.name.full.toUpperCase(), nf, g.mm(90)));
  els.push(text(ctx, ctx.name.full.toUpperCase(), nf, g.mm(5), g.mm(Hu - 41.8), { color: MONO_INK }).el);
  const sf = mono(g.pt6(2));
  statTriples(ctx).forEach(([k, a, b], i) => {
    const x = g.mm(5 + (i % 2) * 40);
    const y = g.mm(Hu - 34.8 + Math.floor(i / 2) * 3.4);
    els.push(text(ctx, k.toUpperCase(), sf, x, y, { color: 'rgba(26,25,23,0.5)' }).el);
    const v = text(ctx, a.toUpperCase(), sf, x + g.mm(10), y, { color: MONO_INK });
    els.push(v.el);
    if (b) els.push(text(ctx, ` / ${b}`.toUpperCase(), sf, v.right, y, { color: 'rgba(26,25,23,0.5)' }).el);
  });
  const bk = bookingLine(ctx);
  const bf = mono(g.pt6(1.85));
  const line = `${bk.label.toUpperCase()}  ${bk.text}`;
  bf.size = Math.min(bf.size, ctx.fitSize(line, bf, g.mm(72)));
  els.push(text(ctx, line, bf, g.mm(5), g.mm(Hu - 7), { color: 'rgba(26,25,23,0.75)' }).el);
  els.push(wordmark(ctx, W - g.mm(5), g.mm(Hu - 7.4), 2.1, MARK, 'right'));
  return { name: 'back', paper: '#EDEAE4', elements: els };
}

export default {
  id: 'digitals',
  name: 'Digitals',
  summary: 'Natural light, as she is: a digital mounted like a print.',
  compose(ctx) {
    const f = front(ctx);
    return { pages: [f, back(ctx, f.hero)] };
  },
};
