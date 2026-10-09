/**
 * LETTERS — the photograph doesn't stop where it ends: it carries on below,
 * inside her name. The front is the face first; the name is cut from the
 * same picture, set in compressed black capitals.
 * Back: a full length beside three frames, the name cut from the cover
 * picture again, the stats as a small grid.
 */
import { bookingLine, columnBack, grid, statTriples, TASTE, wordmark } from './kit';
import { text } from './shared';
import { rgbToLab } from '../model/palette';
import { solveCrop } from '../model/crop';

const PAPER = '#EEE8DF';
const INK = '#1B1A18';
const SOFT = 'rgba(27,26,24,0.5)';
const MARK = '#A8894E';
const LETTER = { family: 'archivo', weight: 900, stretch: 62, tracking: -0.014 };

/** How much colour the photograph's backdrop carries (a red seamless sings here). */
function backdropColour(it) {
  const p = it.perception;
  if (!p?.tone) return 0;
  let c = 0;
  let n = 0;
  for (let y = 0; y < p.tone.rows; y++) {
    for (let x = 0; x < p.tone.cols; x++) {
      if (p.mask && p.mask.person[Math.floor(((y + 0.5) / p.tone.rows) * p.mask.rows)][Math.floor(((x + 0.5) / p.tone.cols) * p.mask.cols)] > 0.2) continue;
      const [, a, b] = rgbToLab(p.tone.color[y][x]);
      c += Math.hypot(a, b);
      n++;
    }
  }
  return n ? c / n : 0;
}

/** The picture's full page rect for a crop on a frame (for filling type). */
function pictureRect(crop, frame) {
  const w = frame.w / crop.w;
  const h = frame.h / crop.h;
  return { kind: 'image', x: frame.x - crop.x * w, y: frame.y - crop.y * h, w, h };
}

function front(ctx) {
  const g = grid(ctx);
  const W = ctx.format.w;
  const H = ctx.format.h;
  const defaultCut = g.Hu - 58.5;
  const plan = (cut) => ({ safe: { x0: 0, y0: 0, x1: 1, y1: (cut - 3) / g.Hu }, target: { ty: (0.42 * cut) / g.Hu } });
  let role = 'portrait';
  const fitsAt = (it, cut) => solveCrop(it.subject, W / H, { role, ...plan(cut) }).feasible;
  const taste = (it) => TASTE.beauty(it) * 0.7 + Math.min(1.4, backdropColour(it) / 30);
  // The best photograph that leaves room above the cut — first at the
  // standard cut with the whole head, then with a lower cut, then as a
  // beauty crop (face protected, the top of the hair may trim).
  let hero = null;
  let cutU = defaultCut;
  search: for (const r of ['portrait', 'beauty']) {
    role = r;
    for (let cut = defaultCut; cut <= g.Hu - 34; cut += 2) {
      const h = ctx.pickHero(taste, (it) => fitsAt(it, cut));
      if (h && fitsAt(h, cut)) {
        hero = h;
        cutU = cut;
        break search;
      }
    }
  }
  const full = { x: 0, y: 0, w: W, h: H };
  let top;
  let picture; // the photograph's full page rect, for the letters
  if (hero) {
    // One photograph sized to the whole card; the head sits above the cut.
    const base = ctx.photo('front', hero, full, role, { target: { ty: (0.42 * cutU) / g.Hu }, safe: plan(cutU).safe });
    top = { ...base, ...g.r(0, 0, 100, cutU), crop: { ...base.crop, h: base.crop.h * (cutU / g.Hu) }, bleed: { t: 1, l: 1, r: 1 } };
    picture = base.crop ? pictureRect(base.crop, full) : null;
  } else {
    // Nothing leaves room above the cut: frame the photograph in the top
    // area alone; the letters carry on from that framing.
    hero = ctx.pickHero(taste);
    top = ctx.photo('front', hero, g.r(0, 0, 100, cutU), 'portrait', { bleed: { t: 1, l: 1, r: 1 }, target: { ty: 0.42 } });
    picture = top.crop ? pictureRect(top.crop, g.r(0, 0, 100, cutU)) : null;
  }
  const els = [top];

  // The name in two lines, each fitted, filled with the same photograph.
  const lines = ctx.name.last ? [ctx.name.first.toUpperCase(), ctx.name.last.toUpperCase()] : [ctx.name.first.toUpperCase()];
  let size = Math.min(g.pt(28.6), ...lines.map((l) => ctx.fitSize(l, LETTER, g.mm(93.6))));
  const capOf = (sz) => ctx.measure('H', { ...LETTER, size: sz }).cap;
  const lead = (sz) => (sz * 25.4) / 72 * 0.8;
  const room = H - g.mm(cutU + 3.4) - g.mm(4);
  const need = (sz) => capOf(sz) + lead(sz) * (lines.length - 1);
  if (need(size) > room) size *= room / need(size);
  const fill = picture;
  let y = g.mm(cutU + 3.4);
  for (const l of lines) {
    els.push(text(ctx, l, { ...LETTER, size }, g.mm(3.2), y, { color: INK, fill: fill && { ...fill, src: hero.src, imageId: hero.id } }).el);
    y += lead(size);
  }
  return { name: 'front', paper: PAPER, elements: els, hero, fill: fill && { ...fill, src: hero.src, imageId: hero.id } };
}

function back(ctx, f) {
  const g = grid(ctx);
  const Hu = g.Hu;
  const W = ctx.format.w;
  const els = columnBack(ctx, f.hero, { x: 5, y: 5, tallW: 44, colW: 44, gap: 2, bottom: Hu - 57.5 , taste: (it) => TASTE.colour(it) * 0.6 });

  // Name, cut from the cover picture (scaled to the line).
  const nf = { ...LETTER, size: g.pt(9.4), tracking: -0.01 };
  nf.size = Math.min(nf.size, ctx.fitSize(ctx.name.full.toUpperCase(), nf, g.mm(90)));
  const ny = g.mm(Hu - 51);
  const nw = ctx.measure(ctx.name.full.toUpperCase(), nf).width;
  const ph = f.hero?.subject;
  const aspect = ph ? ph.width / ph.height : 0.75;
  const fw = g.mm(64);
  const fill = f.hero ? { kind: 'image', src: f.hero.src, imageId: f.hero.id, x: g.mm(5), y: ny - (fw / aspect) * 0.38, w: fw, h: fw / aspect } : null;
  els.push(text(ctx, ctx.name.full.toUpperCase(), nf, g.mm(5), ny, { color: INK, fill: nw > 0 ? fill : null }).el);

  // Stats: label over value, four columns.
  const st = statTriples(ctx);
  const lab = { family: 'archivo', weight: 500, size: g.pt6(2.15) };
  const val = { family: 'archivo', weight: 700, size: g.pt6(2.15) };
  const alt = { family: 'archivo', weight: 500, size: g.pt6(2.15) };
  const colW = g.mm(22.5);
  const rowH = g.mm(6.8);
  st.forEach(([k, a, b], i) => {
    const x = g.mm(5) + (i % 4) * colW;
    const y = g.mm(Hu - 39.6) + Math.floor(i / 4) * rowH;
    els.push(text(ctx, k, lab, x, y, { color: SOFT }).el);
    const v = text(ctx, a, val, x, y + g.mm(2.7), { color: INK });
    els.push(v.el);
    if (b) els.push(text(ctx, b, alt, v.right + g.mm(0.8), y + g.mm(2.7), { color: SOFT }).el);
  });
  const bk = bookingLine(ctx);
  els.push(text(ctx, bk.label, { family: 'archivo', weight: 600, size: g.pt6(1.6), tracking: 0.2, caps: 'upper' }, g.mm(5), g.mm(Hu - 8.8), { color: SOFT }).el);
  const bf = { family: 'archivo', weight: 600, size: g.pt(2) };
  bf.size = Math.min(bf.size, ctx.fitSize(bk.text, bf, g.mm(70)));
  els.push(text(ctx, bk.text, bf, g.mm(5), g.mm(Hu - 5.9), { color: INK }).el);
  els.push(wordmark(ctx, W - g.mm(5), g.mm(Hu - 7.7), 2.3, MARK, 'right'));
  return { name: 'back', paper: PAPER, elements: els };
}

export default {
  id: 'letters',
  name: 'Letters',
  summary: 'The picture carries on in her name.',
  compose(ctx) {
    const f = front(ctx);
    return { pages: [f, back(ctx, f)] };
  },
};
