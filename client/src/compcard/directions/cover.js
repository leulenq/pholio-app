/**
 * COVER — a magazine cover she is the whole of.
 *
 * Front: the strongest editorial frame, full bleed. The surname is the
 * masthead; the first name sits above it in italic. When the backdrop is
 * clean enough to cut the head out invisibly, the head rises in front of
 * the masthead — and only the head, only over the letters, so a cut-out
 * edge never appears anywhere else. Otherwise the frame is set so the
 * crown sits just below the masthead.
 * Back: black stock, a full length beside three frames, the name in
 * italic, the stats on two lines, the booking line in gold.
 */
import { bookingLine, columnBack, grid, statRow, statTriples, TASTE, wordmark } from './kit';
import { text } from './shared';
import { solveCrop } from '../model/crop';

const INK = '#121110';
const CREAM = '#F1ECE3';
const SOFT = 'rgba(241,236,227,0.62)';
const GOLD = '#C9A55A';

/** Median luminance of the backdrop under a page band (subject excluded). */
function bandIsLight(item, crop, W, H, band) {
  const p = item?.perception;
  if (!p?.tone || !crop) return true;
  const lums = [];
  for (let py = band.y; py <= band.y + band.h; py += 2) {
    for (let px = band.x; px <= band.x + band.w; px += 2) {
      const ix = crop.x + (px / W) * crop.w;
      const iy = crop.y + (py / H) * crop.h;
      if (ix < 0 || iy < 0 || ix >= 1 || iy >= 1) continue;
      if (p.mask && p.mask.person[Math.floor(iy * p.mask.rows)][Math.floor(ix * p.mask.cols)] > 0.25) continue;
      const c = p.tone.color[Math.floor(iy * p.tone.rows)][Math.floor(ix * p.tone.cols)];
      lums.push(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
    }
  }
  if (!lums.length) return true;
  lums.sort((a, b) => a - b);
  return lums[Math.floor(lums.length / 2)] > 140;
}

function front(ctx) {
  const g = grid(ctx);
  const W = ctx.format.w;
  const H = ctx.format.h;
  const hero = ctx.pickHero(TASTE.editorial);
  const s = hero?.subject;
  const els = [];

  const surname = (ctx.name.last || ctx.name.first).toUpperCase();
  const first = ctx.name.last ? ctx.name.first : '';
  const mastFont = { family: 'bodoni', weight: 500, tracking: -0.035, size: 10 };
  mastFont.size = Math.min(g.pt(20.4), ctx.fitSize(surname, mastFont, g.mm(92), { max: g.pt(20.4) }));
  const capM = ctx.measure(surname, mastFont).cap;
  const mastY = g.mm(12);
  const mastBottom = mastY + capM;

  // Frame the photograph: try for the crown inside the masthead (cut-out
  // in front), then just below it, at a few scales.
  const cut = hero && ctx.cutout(hero);
  const cleanBackdrop = (s?.calm ?? 0) >= 0.55;
  let chosen = null;
  if (s?.known && s.face && s.head) {
    const fcy = s.face.box.y + s.face.box.h / 2;
    const plans = [];
    if (cut && cleanBackdrop) plans.push({ crownAt: mastY + capM * 0.48, layered: true });
    plans.push({ crownAt: mastBottom + g.mm(2.5), layered: false });
    outer: for (const plan of plans) {
      for (const zoom of [1, 1.1, 1.22, 1.35]) {
        const imgAspect = s.width / s.height;
        const ch = Math.min(1, imgAspect / (W / H)) / zoom;
        const ty = plan.crownAt / H - (s.head.y0 - fcy) / ch;
        const c = solveCrop(s, W / H, { role: 'portrait', frameHeightIn: H / 25.4, target: { ty, zoom }, adjust: ctx.settings.slots.front?.adjust });
        if (!c.feasible) continue;
        const crown = ((s.head.y0 - c.y) / c.h) * H;
        const faceTop = ((s.face.box.y - c.y) / c.h) * H;
        if (Math.abs(crown - plan.crownAt) > g.mm(3)) continue;
        if (faceTop < mastBottom + g.mm(1)) continue;
        chosen = { crop: c, layered: plan.layered };
        break outer;
      }
    }
  }

  const photo = ctx.photo('front', hero, { x: 0, y: 0, w: W, h: H }, 'portrait', { bleed: { t: 1, r: 1, b: 1, l: 1 }, target: { ty: 0.3 } });
  if (chosen) photo.crop = chosen.crop;
  els.push(photo);

  if (!chosen) {
    // No headroom in any framing: the photograph stops short of the foot and
    // the masthead is set on the paper beneath it.
    const bandH = capM + g.mm(16);
    const ph = { x: 0, y: 0, w: W, h: H - bandH };
    els[0] = ctx.photo('front', hero, ph, 'portrait', { bleed: { t: 1, r: 1, l: 1 }, target: { ty: 0.4 } });
    els.unshift({ type: 'rect', x: 0, y: 0, w: W, h: H, fill: '#E9E6E1', bleed: { t: 1, r: 1, b: 1, l: 1 } });
    const y = H - g.mm(8) - capM;
    const ink = INK;
    els.push(text(ctx, surname, mastFont, W / 2, y, { align: 'center', color: ink }).el);
    if (first) els.push(text(ctx, first, { family: 'bodoni', style: 'italic', weight: 400, size: g.pt(5.4) }, g.mm(4.6), y - g.mm(5.8), { color: ink }).el);
    return { name: 'front', paper: '#E9E6E1', elements: els, hero };
  }
  const light = bandIsLight(hero, chosen.crop, W, H, { x: g.mm(4), y: mastY, w: g.mm(92), h: capM });
  const ink = light ? INK : CREAM;
  if (first) els.push(text(ctx, first, { family: 'bodoni', style: 'italic', weight: 400, size: g.pt(5.4) }, g.mm(4.6), mastY - g.mm(5.2), { color: ink }).el);
  els.push(text(ctx, surname, mastFont, W / 2, mastY, { align: 'center', color: ink }).el);

  if (chosen.layered) {
    // The head in front of the letters: a cut-out confined to the masthead's
    // band, aligned pixel for pixel with the photograph beneath it.
    const band = { x: 0, y: mastY - g.mm(2), w: W, h: capM + g.mm(4) };
    const c = chosen.crop;
    const sub = { x: c.x, y: c.y + (band.y / H) * c.h, w: c.w, h: (band.h / H) * c.h };
    els.push({ type: 'photo', slot: 'front-layer', imageId: hero.id, src: hero.src, cutout: cut.url, role: 'beauty', ...band, crop: sub, decorative: true, bleed: { l: 1, r: 1 } });
  }
  return { name: 'front', paper: '#E9E6E1', elements: els, hero };
}

function back(ctx, hero) {
  const g = grid(ctx);
  const W = ctx.format.w;
  const Hu = g.Hu;
  const els = [{ type: 'rect', x: 0, y: 0, w: W, h: ctx.format.h, fill: INK, bleed: { t: 1, r: 1, b: 1, l: 1 } }];
  els.push(...columnBack(ctx, hero, { x: 6, y: 6, tallW: 47, colW: 39, gap: 2, bottom: Hu - 44.5 , taste: (it) => TASTE.lowkey(it) * 0.5 + TASTE.editorial(it) * 0.3 }));

  const nameFont = { family: 'bodoni', style: 'italic', weight: 400, tracking: -0.02, size: g.pt(6.6) };
  nameFont.size = Math.min(nameFont.size, ctx.fitSize(ctx.name.full, nameFont, g.mm(88)));
  els.push(text(ctx, ctx.name.full, nameFont, g.mm(6), g.mm(Hu - 37.4), { color: CREAM }).el);

  const st = statTriples(ctx);
  const f = { family: 'bodoni', weight: 400, size: g.pt6(2.45) };
  const rows = st.length > 4 ? [st.slice(0, 4), st.slice(4)] : [st];
  rows.forEach((row, i) => els.push(...statRow(ctx, row, g.mm(6), g.mm(Hu - 26.4 + i * 5), { font: f, labelColor: SOFT, valueColor: CREAM, maxW: g.mm(88) }).els));

  const b = bookingLine(ctx);
  els.push(text(ctx, b.label, { family: 'inter', weight: 500, size: g.pt6(1.45), tracking: 0.3, caps: 'upper' }, g.mm(6), g.mm(Hu - 8.6), { color: GOLD }).el);
  const bf = { family: 'inter', weight: 400, size: g.pt6(1.9), tracking: 0.04 };
  bf.size = Math.min(bf.size, ctx.fitSize(b.text, bf, g.mm(70)));
  els.push(text(ctx, b.text, bf, g.mm(6), g.mm(Hu - 5.8), { color: CREAM }).el);
  els.push(wordmark(ctx, g.mm(94), g.mm(Hu - 7.6), 2.5, GOLD, 'right'));
  return { name: 'back', paper: INK, elements: els };
}

export default {
  id: 'cover',
  name: 'Cover',
  summary: 'Her surname as the masthead, her head in front of it; black stock behind.',
  compose(ctx) {
    const f = front(ctx);
    return { pages: [f, back(ctx, f.hero || ctx.hero)] };
  },
};
