/**
 * POSTER
 *
 * A field of colour from the talent's own pictures, the name set enormous
 * across it, and the figure standing in front of the letters. Loud where
 * Seamless is quiet; the face always clear, the letters always readable.
 */
import { altUnit, splitStats, text } from './shared';
import { castType, nameCase, readCharacter } from '../model/typefaces';
import { colourWorld, contrast, hex, photoLightness, signatureColour } from '../model/palette';
import { requiredRegion } from '../model/crop';

const ALLOWED = ['street', 'avant', 'punchy', 'expressive', 'modernist', 'couture'];

function world(ctx) {
  const items = [ctx.hero, ...ctx.picks.back].filter(Boolean);
  const sig = signatureColour(items);
  const L = items.reduce((s, it) => s + photoLightness(it.perception), 0) / Math.max(1, items.length);
  if (sig.neutral) return colourWorld({ ...sig, C: 6 }, L < 42 ? 'deep' : 'light');
  return colourWorld(sig, L < 40 ? 'deep' : 'vivid');
}

/** The cut-out sized so its protected region fills a box, anchored low. */
function figure(ctx, item, box) {
  const s = item.subject;
  const cut = ctx.cutout(item);
  if (!cut || !s.known) return null;
  const role = s.feetInFrame ? 'full' : 'portrait';
  const req = requiredRegion(s, role);
  const rx0 = Math.max(0, req.x0);
  const rx1 = Math.min(1, req.x1);
  const ry0 = Math.max(0, req.y0);
  const ry1 = Math.min(1, req.y1);
  // Busts are anchored at the photo's own bottom edge, so scale by the
  // span from the crown to that edge; full lengths by crown-to-soles.
  const spanY = s.feetInFrame ? ry1 - ry0 : 1 - ry0;
  const k = Math.min(box.h / (spanY * s.height), box.w / ((rx1 - rx0) * s.width));
  const imgW = s.width * k;
  const imgH = s.height * k;
  const left = box.x + box.w / 2 - ((rx0 + rx1) / 2) * imgW;
  const top = s.feetInFrame ? box.y + box.h - ry1 * imgH : box.y + box.h - imgH;
  return {
    el: { type: 'photo', slot: 'front', imageId: item.id, src: item.src, cutout: cut.url, role: 'whole', x: left, y: top, w: imgW, h: imgH, crop: { x: 0, y: 0, w: 1, h: 1 } },
    faceTop: s.face ? top + s.face.box.y * imgH : top + (s.head?.y0 ?? 0.1) * imgH,
    faceBottom: s.face ? top + (s.face.box.y + s.face.box.h) * imgH : top + 0.3 * imgH,
    crown: top + (s.head?.y0 ?? 0) * imgH,
  };
}

/** Colours under a page rect: the figure's pixels where it covers, field elsewhere. */
function sampleBehind(item, fig, rect, field) {
  const tone = item?.perception?.tone;
  const mask = item?.perception?.mask;
  const out = [];
  for (let py = rect.y; py <= rect.y + rect.h; py += 2) {
    for (let px = rect.x; px <= rect.x + rect.w; px += 2) {
      const ix = (px - fig.x) / fig.w;
      const iy = (py - fig.y) / fig.h;
      if (tone && mask && ix >= 0 && iy >= 0 && ix < 1 && iy < 1 && mask.person[Math.floor(iy * mask.rows)][Math.floor(ix * mask.cols)] > 0.5) {
        out.push(tone.color[Math.floor(iy * tone.rows)][Math.floor(ix * tone.cols)]);
      } else out.push(field);
    }
  }
  return out;
}

/** The candidate ink with the best worst-case contrast over the samples. */
function pickInk(samples, inks) {
  let best = inks[0];
  let bestV = -1;
  for (const ink of inks) {
    const v = Math.min(...samples.map((c) => contrast(ink, c)));
    if (v > bestV) {
      bestV = v;
      best = ink;
    }
  }
  return best;
}

function front(ctx, cast, w) {
  const { format } = ctx;
  const W = format.w;
  const H = format.h;
  const m = 7;
  const els = [];
  const field = hex(w.field);
  const ink = hex(w.ink);
  els.push({ type: 'rect', x: 0, y: 0, w: W, h: H, fill: field, bleed: { t: 1, r: 1, b: 1, l: 1 } });

  // The name: each line set to the full measure.
  const words = [ctx.name.first, ctx.name.last].filter(Boolean).map((x) => nameCase(x, cast));
  const lines = words.length ? words : [nameCase(ctx.name.full, cast)];
  const fonts = lines.map((l) => ({ ...cast.display, size: Math.min(260, ctx.fitSize(l, cast.display, W - 2 * m, { max: 260 })) }));
  const caps = fonts.map((f, i) => ctx.measure(lines[i], f).cap);
  const gap = 3;
  let total = caps.reduce((a, b) => a + b, 0) + gap * (lines.length - 1);
  // Keep the block within ~62% of the page height.
  const maxH = H * 0.62;
  if (total > maxH) {
    const k = maxH / total;
    fonts.forEach((f, i) => {
      f.size *= k;
      caps[i] *= k;
    });
    total = maxH;
  }

  const pendingFront = [];
  // The name block hangs from the top margin.
  const y = m + 2;
  const textEls = [];
  let ty = y;
  const lineBottoms = [];
  lines.forEach((l, i) => {
    const t = text(ctx, l, fonts[i], W / 2, ty, { align: 'center', color: ink });
    textEls.push(t.el);
    lineBottoms.push(t.bottom);
    ty = t.bottom + gap;
  });
  els.push(...textEls);

  // The figure: crown rising into the first line, face entirely below it.
  const hero = ctx.hero;
  const s = hero?.subject;
  const cut = hero && ctx.cutout(hero);
  if (cut && s?.known && s.head) {
    const faceY = s.face ? s.face.box.y : s.head.y0 + (s.head.y1 - s.head.y0) * 0.25;
    const bottomPx = s.feetInFrame ? s.feetY ?? s.body.y1 : 1;
    const floorY = s.feetInFrame ? H - m - 14 : H;
    // Try crowns from inside the first line downward until the face clears it.
    let el = null;
    for (const f of [0.35, 0.55, 0.75, 1.0, 1.3, 1.7]) {
      const crownY = y + caps[0] * f;
      const k = (floorY - crownY) / ((bottomPx - s.head.y0) * s.height);
      const imgW = s.width * k;
      const imgH = s.height * k;
      const top = crownY - s.head.y0 * imgH;
      const faceTop = top + faceY * imgH;
      if (faceTop < lineBottoms[0] + 2.5) continue;
      const cx = s.face ? s.face.cx : (s.body.x0 + s.body.x1) / 2;
      let left = W / 2 - cx * imgW;
      // Keep the body's own extent on the page where it fits.
      const bx0 = left + s.body.x0 * imgW;
      const bx1 = left + s.body.x1 * imgW;
      if (bx1 - bx0 < W) left += Math.max(0, -bx0 + 2) - Math.max(0, bx1 - W + 2);
      el = { type: 'photo', slot: 'front', imageId: hero.id, src: hero.src, cutout: cut.url, role: 'whole', x: left, y: top, w: imgW, h: imgH, crop: { x: 0, y: 0, w: 1, h: 1 }, bleed: { b: 1 }, shadow: 'drop-shadow(0 1mm 2.5mm rgba(0,0,0,0.18))' };
      break;
    }
    if (el && lines.length > 1 && s.face) {
      // Sandwich: the surname moves below the chin, across the chest, so the
      // face sits between the two words and never behind the letters.
      // Clear the whole head outline (a smile drops the jaw below the face box).
      const chinY = el.y + Math.max(s.face.box.y + s.face.box.h, s.head.y1) * el.h + 6;
      const small0 = 3 * (ctx.measure('H', { ...cast.label, caps: null }).cap + 2.4) + 4;
      const room = H - m - small0 - chinY;
      const capLast = caps[caps.length - 1];
      const idx = els.indexOf(textEls[textEls.length - 1]);
      // Interleave: the first name behind the head, the surname IN FRONT of
      // the body — its ink read from what is actually under it.
      els.splice(idx, 1);
      let lastFont = fonts[fonts.length - 1];
      let capL = capLast;
      if (room < capLast) {
        const sz = lastFont.size * (room / capLast);
        lastFont = sz >= 18 ? { ...lastFont, size: sz } : null;
        capL = lastFont ? ctx.measure(lines[lines.length - 1], lastFont).cap : 0;
      }
      if (lastFont) {
        const yLast = chinY + Math.max(0, room - capL) * 0.15;
        const wL = ctx.measure(lines[lines.length - 1], lastFont).width;
        const under = sampleBehind(hero, el, { x: (W - wL) / 2, y: yLast, w: wL, h: capL }, w.field);
        const inkL = pickInk(under, [w.ink, [250, 250, 247], [16, 16, 16]]);
        pendingFront.push(text(ctx, lines[lines.length - 1], lastFont, W / 2, yLast, { align: 'center', color: hex(inkL), z: 4 }).el);
      }
    }
    if (el) {
      if (s.feetInFrame) {
        const cw = (s.body.x1 - s.body.x0) * el.w * 1.3;
        els.push({ type: 'rect', x: el.x + ((s.body.x0 + s.body.x1) / 2) * el.w - cw / 2, y: floorY - cw * 0.06, w: cw, h: cw * 0.12, gradient: 'radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, transparent 70%)' });
      }
      els.push(el);
      els.push(...pendingFront);
    }
  } else if (hero) {
    els.push(ctx.photo('front', hero, { x: m, y: ty + 6, w: W - 2 * m, h: H - ty - 6 - m }, 'portrait'));
  }

  // Small matter, in front, at the foot.
  // The full name, always readable, with agency and height.
  const small = [ctx.name.full.toUpperCase(), ctx.contact.mode === 'agency' ? ctx.contact.agencyName : ctx.city].filter(Boolean);
  const h = ctx.stats.items.find((i) => i.key === 'height');
  if (h) small.push(`${h.value}  ${altUnit(h, ctx.stats.units)}`);
  const lcap = ctx.measure('H', { ...cast.label, caps: null }).cap;
  let sy = H - m - small.length * (lcap + 2.4) + 2.4;
  for (const l of small) {
    els.push(text(ctx, l, cast.label, m, sy, { color: ink, z: 3 }).el);
    // (sits over the field or the figure's clothing at the foot)
    sy += lcap + 2.4;
  }
  return { name: 'front', paper: field, elements: els };
}

function back(ctx, cast, w) {
  const { format } = ctx;
  const W = format.w;
  const H = format.h;
  const m = 7;
  const els = [];
  const field = hex(w.field);
  const ink = hex(w.ink);
  els.push({ type: 'rect', x: 0, y: 0, w: W, h: H, fill: field, bleed: { t: 1, r: 1, b: 1, l: 1 } });

  // Measurements as display figures across the top.
  const { measures, features } = splitStats(ctx.stats);
  const show = measures.slice(0, 6);
  const fig = { ...cast.figure };
  let y = m + 1;
  if (show.length) {
    const cols = Math.min(3, show.length);
    const rowsN = Math.ceil(show.length / cols);
    const colW = (W - 2 * m) / cols;
    const size = Math.min(40, ...show.map((it) => ctx.fitSize(it.value, fig, colW - 5, { max: 40 })));
    const fcap = ctx.measure('8', { ...fig, size }).cap;
    const lcap = ctx.measure('H', { ...cast.label, caps: null }).cap;
    for (let r = 0; r < rowsN; r++) {
      for (let c = 0; c < cols; c++) {
        const it = show[r * cols + c];
        if (!it) continue;
        const x = m + c * colW;
        els.push(text(ctx, it.value, { ...fig, size }, x, y, { color: ink }).el);
        const alt = altUnit(it, ctx.stats.units);
        els.push(text(ctx, `${it.label}${alt ? `  ${alt}` : ''}`, cast.label, x, y + fcap + 2.6, { color: ink }).el);
      }
      y += fcap + 2.6 + lcap + 6;
    }
  }
  if (features.length) {
    els.push(text(ctx, features.map((f) => `${f.label} ${f.value}`).join('    '), cast.label, m, y, { color: ink }).el);
    y += 8;
  }

  // The other looks, cut out, standing together at the foot.
  const c = ctx.contact;
  const contact = c.mode === 'agency' ? [`${c.label} ${c.agencyName}`, ...c.lines] : [...c.lines, c.portfolio].filter(Boolean);
  const tcap = ctx.measure('H', cast.text).cap;
  const footH = contact.length * (tcap + 2.4);
  const stageBottom = H - m - footH - 6;
  const pool = ctx.pool.filter((p) => p !== ctx.hero && ctx.cutout(p) && p.subject.known && !p.flags.includes('other-people')).slice(0, 3);
  if (pool.length) {
    const slotW = (W - 2 * m) / pool.length;
    pool.forEach((it, i) => {
      // Busts stay at a human scale beside each other: cap the face size.
      const s0 = it.subject;
      const boxH = stageBottom - y - 4;
      const maxFace = boxH * 0.26;
      const natural = s0.face ? (s0.face.size / (1 - (s0.head?.y0 ?? 0))) * boxH : 0;
      const hgt = s0.feetInFrame || !natural || natural <= maxFace ? boxH : boxH * (maxFace / natural);
      const f = figure(ctx, it, { x: m + i * slotW - slotW * 0.08, y: stageBottom - hgt, w: slotW * 1.16, h: hgt });
      if (f) {
        f.el.slot = `back-${i + 1}`;
        f.el.z = pool.length - i;
        els.push(f.el);
      }
    });
  } else {
    const list = ctx.picks.back.slice(0, 2);
    list.forEach((it, i) => els.push(ctx.photo(`back-${i + 1}`, it, { x: m + i * ((W - 2 * m) / 2 + 1.5), y: y + 4, w: (W - 2 * m) / 2 - 1.5, h: stageBottom - y - 4 }, ctx.roleOf(it))));
  }
  // A band of field closes the stage so cut bodies sit on something.
  els.push({ type: 'rect', x: 0, y: stageBottom, w: W, h: H - stageBottom, fill: field, z: 6, bleed: { l: 1, r: 1, b: 1 } });
  contact.forEach((l, i) => els.push(text(ctx, l, cast.text, m, stageBottom + 6 + i * (tcap + 2.4), { color: ink, z: 7 }).el));
  return { name: 'back', paper: field, elements: els };
}

export default {
  id: 'poster',
  name: 'Poster',
  summary: 'A field of colour, the name enormous, the figure standing in front of it.',
  compose(ctx) {
    const character = readCharacter([ctx.hero, ...ctx.picks.back], ctx.labels);
    const cast = castType(ALLOWED, character, ctx.settings.type);
    const w = world(ctx);
    return { pages: [front(ctx, cast, w), back(ctx, cast, w)], casting: cast.id };
  },
};
