/**
 * COVER
 *
 * Front: the photograph, full bleed. The first name is set across the top as
 * a masthead and the subject's head rises in front of it — the cut-out laid
 * over the type, the way a printed cover is made. The full name, agency and
 * height sit small where the picture leaves room.
 *
 * Back: an editorial page. A full length stands cut out against a colour
 * panel taken from the cover, its head breaking the panel's top edge; the
 * other photographs and the record are set beside it.
 */
import { altUnit, splitStats, text } from './shared';
import { requiredRegion } from '../model/crop';
import { castType, nameCase, readCharacter } from '../model/typefaces';
import { readRect, spaceMap } from '../model/clearings';
import { backdrop, deepen, groundFor, inkFor } from '../model/imagery';
import { hex, lch, toLch } from '../model/palette';

const ALLOWED = ['couture', 'sharp', 'modernist', 'punchy', 'avant', 'editorial'];
const INKS = { dark: [16, 16, 16], light: [250, 250, 247] };

/** Face share of the page height for a cover, by how the photo is framed. */
const FACE_SHARE = { 'close-up': 0.26, 'head-and-shoulders': 0.21, half: 0.16, 'three-quarter': 0.12, 'full-length': 0.075 };

/**
 * A crop that puts the crown at page height `yHead` with the face at a
 * cover's scale. Returns null when the photograph can't be framed so.
 */
function coverCrop(s, W, H, yHead, allowExtend = false) {
  if (!s.known || !s.face || !s.head) return null;
  const imgAspect = s.width / s.height;
  const pageAspect = W / H;
  let ch = (s.face.size * H) / ((FACE_SHARE[s.framing] || 0.18) * H);
  // Head must be reachable: the crown can't sit lower in the crop than the
  // image allows — unless the backdrop is extended above the photograph.
  if (!allowExtend) ch = Math.min(ch, (s.head.y0 * H) / Math.max(1, yHead));
  // ...and the crop must not run off the bottom of the photograph either
  // (zoom in rather than let the crown drift down from its line).
  ch = Math.min(ch, (1 - s.head.y0) / Math.max(0.05, 1 - yHead / H));
  ch = Math.min(ch, 1, (1 * imgAspect) / pageAspect);
  const cw = (ch * pageAspect) / imgAspect;
  if (ch <= 0.05 || cw > 1.0001) {
    return null;
  }
  let cy = s.head.y0 - (yHead / H) * ch;
  cy = Math.min(1 - ch, cy);
  if (!allowExtend) cy = Math.max(0, cy);
  // Extension is for headroom only, and modest: at most 40% of the page.
  if (cy < -0.4 * ch) return null;
  const lead = (s.face.yaw || 0) * 0.08 * cw;
  let cx = s.face.cx + lead - cw / 2;
  cx = Math.max(0, Math.min(1 - cw, cx));
  // The whole head (hair included) must be inside.
  if (s.head.x0 < cx || s.head.x1 > cx + cw || s.head.y0 < Math.max(0, cy) - 0.0001 || s.head.y1 > cy + ch) {
    return null;
  }
  return { x: cx, y: cy, w: cw, h: ch };
}

/**
 * Ink for type that sits BEHIND the subject: only the backdrop around it
 * matters (the head will cover the rest). Median luminance of backdrop
 * cells under the type decides.
 */
function mastheadInk(item, crop, frame, rect) {
  const p = item?.perception;
  if (!p?.tone || !crop) return '#FAFAF7';
  const { tone, mask } = p;
  const lums = [];
  for (let py = rect.y; py <= rect.y + rect.h; py += 2) {
    for (let px = rect.x; px <= rect.x + rect.w; px += 2) {
      const ix = crop.x + ((px - frame.x) / frame.w) * crop.w;
      const iy = crop.y + ((py - frame.y) / frame.h) * crop.h;
      if (ix < 0 || iy < 0 || ix > 1 || iy > 1) continue;
      if (mask) {
        const my = Math.min(mask.rows - 1, Math.floor(iy * mask.rows));
        const mx = Math.min(mask.cols - 1, Math.floor(ix * mask.cols));
        if (mask.person[my][mx] > 0.25) continue;
      }
      const c = tone.color[Math.min(tone.rows - 1, Math.floor(iy * tone.rows))][Math.min(tone.cols - 1, Math.floor(ix * tone.cols))];
      lums.push(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
    }
  }
  if (!lums.length) return '#FAFAF7';
  lums.sort((a, b) => a - b);
  const med = lums[Math.floor(lums.length / 2)];
  return med > 150 ? '#141413' : '#FAFAF7';
}

/** Share of a page rect covered by the subject's silhouette. */
function occlusion(item, crop, frame, rect) {
  const mask = item?.perception?.mask;
  if (!mask) return 0;
  let n = 0;
  let hit = 0;
  for (let py = rect.y; py <= rect.y + rect.h; py += 1.5) {
    for (let px = rect.x; px <= rect.x + rect.w; px += 1.5) {
      const ix = crop.x + ((px - frame.x) / frame.w) * crop.w;
      const iy = crop.y + ((py - frame.y) / frame.h) * crop.h;
      n++;
      if (ix < 0 || iy < 0 || ix >= 1 || iy >= 1) continue;
      const v = mask.person[Math.floor(iy * mask.rows)][Math.floor(ix * mask.cols)];
      if (v > 0.5) hit++;
    }
  }
  return n ? hit / n : 0;
}

function front(ctx, cast) {
  const { format } = ctx;
  const W = format.w;
  const H = format.h;
  const m = 8;
  const hero = ctx.hero;
  const s = hero?.subject;
  const els = [];

  // The masthead: first name, fitted to the measure — or narrower, if the
  // photograph needs it narrower to stay legible behind the subject.
  const mast = nameCase(ctx.name.first || ctx.name.full, cast);
  const mf = { ...cast.display };
  const fullSize = Math.min(150, ctx.fitSize(mast, mf, W - 2 * m, { max: 150 }));
  const mastY = m + 2;
  const frame0 = { x: 0, y: 0, w: W, h: H };
  let crop = null;
  let size = fullSize;
  let mastAtFoot = false;
  let extended = null;
  if (s) {
    search: for (const scale of [1, 0.86, 0.74, 0.64]) {
      const sz = fullSize * scale;
      const capS = ctx.measure(mast, { ...mf, size: sz }).cap;
      const wS = ctx.measure(mast, { ...mf, size: sz }).width;
      const rect = { x: (W - wS) / 2, y: mastY, w: wS, h: capS };
      // Lower the crown into the letters only as far as the name stays
      // legible: at most ~24% of the masthead behind the silhouette.
      for (const f of [0.42, 0.5, 0.58, 0.66, 0.74, 0.82, 0.9, 1.0, 1.15]) {
        const c = coverCrop(s, W, H, mastY + capS * f);
        if (!c) continue;
        if (occlusion(hero, c, frame0, rect) <= 0.32) {
          crop = c;
          size = sz;
          break search;
        }
      }
    }
    // No headroom in the photograph: if its backdrop is even (a seamless,
    // a wall), extend it above the picture and set the masthead there.
    const bd = backdrop(hero);
    if (!crop && bd && bd.evenness > 0.5) {
      extendSearch: for (const scale of [1, 0.86, 0.74]) {
        const sz = fullSize * scale;
        const capS = ctx.measure(mast, { ...mf, size: sz }).cap;
        const wS = ctx.measure(mast, { ...mf, size: sz }).width;
        const rect = { x: (W - wS) / 2, y: mastY, w: wS, h: capS };
        for (const f of [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
          const c = coverCrop(s, W, H, mastY + capS * f, true);
          if (!c) continue;
          if (occlusion(hero, c, frame0, rect) <= 0.32) {
            crop = c;
            size = sz;
            extended = bd;
            break extendSearch;
          }
        }
      }
    }
    if (!crop) mastAtFoot = true;
  }
  const mfont = { ...mf, size };
  const cap = ctx.measure(mast, mfont).cap;

  const cut = ctx.cutout(hero);
  const frame = { x: 0, y: 0, w: W, h: H };
  const photo = ctx.photo('front', hero, frame, 'portrait', { bleed: { t: 1, r: 1, b: 1, l: 1 } });
  // A cover crop keeps the whole head (checked in coverCrop) at cover scale;
  // shoulders may fall outside — so it promises the face and head, no more.
  if (crop) {
    photo.crop = crop;
    photo.role = 'beauty';
  }
  let cutFrame = frame;
  let cutCrop = crop;
  if (crop && crop.y < 0) {
    // The photograph starts below the top of the page; above it, its own
    // backdrop continues, and the seam dissolves.
    const y0 = (-crop.y / crop.h) * H;
    els.push({ type: 'rect', x: 0, y: 0, w: W, h: H, fill: hex(extended.rgb), bleed: { t: 1, r: 1, b: 1, l: 1 } });
    photo.y = y0;
    photo.h = H - y0;
    photo.crop = { x: crop.x, y: 0, w: crop.w, h: crop.h + crop.y };
    photo.bleed = { r: 1, b: 1, l: 1 };
    photo.fade = { t: Math.min(14, (H - y0) * 0.12) };
    cutFrame = { x: 0, y: y0, w: W, h: H - y0 };
    cutCrop = photo.crop;
  }
  els.push(photo);

  // Ink for the masthead from the pixels behind it (ignoring the head,
  // which will sit in front of the type anyway).
  const map = crop ? spaceMap(hero, crop, frame, -1000, INKS) : null;
  if (mastAtFoot) {
    // No room above the head: the name runs across the foot of the cover,
    // in front of the photograph, where the pixels let it read.
    // Search upward from the foot for a band clear of the head that reads.
    const smap = spaceMap(hero, photo.crop, frame, 3, INKS);
    let placed = null;
    footSearch: for (const scale of [1, 0.85, 0.72, 0.6, 0.5]) {
      const f2 = { ...mfont, size: size * scale };
      const capF = ctx.measure(mast, f2).cap;
      const mw = ctx.measure(mast, f2).width;
      for (let y = H - m - capF - 16; y > H * 0.45; y -= 2) {
        const r = smap ? readRect(smap, { x: (W - mw) / 2, y, w: mw, h: capF }, 3) : null;
        if (r) {
          placed = { y, font: f2, ink: r.ink === 'dark' ? '#141413' : '#FAFAF7' };
          break footSearch;
        }
      }
    }
    if (placed) els.push(text(ctx, mast, placed.font, W / 2, placed.y, { align: 'center', color: placed.ink }).el);
  } else {
    const mastInk = extended ? hex(inkFor(extended.rgb)) : mastheadInk(hero, crop || photo.crop, frame, { x: m, y: mastY, w: W - 2 * m, h: cap });
    els.push(text(ctx, mast, mfont, W / 2, mastY, { align: 'center', color: mastInk }).el);
  }

  // The head in front of the type.
  if (crop && cut && !mastAtFoot) {
    els.push({ type: 'photo', slot: 'front-cutout', imageId: hero.id, src: hero.src, cutout: cut.url, role: 'portrait', ...cutFrame, crop: cutCrop, bleed: photo.bleed, decorative: true });
  }

  // Small matter: full name, agency or city, height — where the picture
  // leaves room at the foot (left or right), in the label voice.
  const lines = [ctx.name.full.toUpperCase()];
  const sub = [ctx.contact.mode === 'agency' ? ctx.contact.agencyName : ctx.city].filter(Boolean);
  const h = ctx.stats.items.find((i) => i.key === 'height');
  if (h) sub.push(`${h.value}  ${altUnit(h, ctx.stats.units)}`);
  const lf = cast.label;
  const lcap = ctx.measure('H', { ...lf, caps: null }).cap;
  const blockW = Math.max(...[...lines, ...sub].map((l) => ctx.measure(l.toUpperCase(), { ...lf, caps: null }).width));
  const blockH = lcap + sub.length * (lcap + 2.6);
  const tries = [
    { align: 'left', x: m, y: H - m - blockH },
    { align: 'right', x: W - m, y: H - m - blockH },
  ];
  let place = null;
  let ink = '#FAFAF7';
  const pmap = spaceMap(hero, photo.crop, { x: photo.x, y: photo.y, w: photo.w, h: photo.h }, 2, INKS);
  if (pmap) {
    // Foot corners first, then rising up either side.
    for (let lift = 0; lift < 40 && !place; lift += 4) {
      for (const t of tries) {
        const rx = t.align === 'left' ? t.x : t.x - blockW;
        const r = readRect(pmap, { x: rx, y: t.y - lift, w: blockW, h: blockH }, 4.5);
        if (r) {
          place = { ...t, y: t.y - lift };
          ink = r.ink === 'dark' ? '#141413' : '#FAFAF7';
          break;
        }
      }
    }
  }
  if (!place && pmap) {
    // Nothing reads perfectly: still keep off the head, accept less contrast.
    for (let lift = 0; lift < 60 && !place; lift += 4) {
      for (const t of tries) {
        const rx = t.align === 'left' ? t.x : t.x - blockW;
        if (readRect(pmap, { x: rx, y: t.y - lift, w: blockW, h: blockH }, 1)) {
          place = { ...t, y: t.y - lift };
          break;
        }
      }
    }
    if (place) ink = mastheadInk(hero, photo.crop, { x: photo.x, y: photo.y, w: photo.w, h: photo.h }, { x: place.align === 'left' ? place.x : place.x - blockW, y: place.y, w: blockW, h: blockH });
  }
  if (!place) {
    // Nowhere passes outright: take the ink from the pixels under the text.
    place = tries[0];
    ink = mastheadInk(hero, photo.crop, { x: photo.x, y: photo.y, w: photo.w, h: photo.h }, { x: place.x, y: place.y, w: blockW, h: blockH });
  }
  let y = place.y;
  els.push(text(ctx, lines[0], { ...lf, weight: (lf.weight || 500) + 100 }, place.x, y, { align: place.align, color: ink }).el);
  y += lcap + 2.6;
  for (const l of sub) {
    els.push(text(ctx, l, lf, place.x, y, { align: place.align, color: ink }).el);
    y += lcap + 2.6;
  }
  return { name: 'front', paper: '#FFFFFF', elements: els };
}

function back(ctx, cast) {
  const { format } = ctx;
  const W = format.w;
  const H = format.h;
  const m = 9;
  const g = 3;
  const els = [];
  const paper = '#F7F5F1';
  els.push({ type: 'rect', x: 0, y: 0, w: W, h: H, fill: paper, bleed: { t: 1, r: 1, b: 1, l: 1 } });

  const items = ctx.picks.back.filter(Boolean);
  // The full length a booker reads proportion from: upright, narrow stance.
  const stance = (it) => {
    const s0 = it.subject;
    const span = ((s0.feetY ?? s0.body.y1) - s0.head.y0) * s0.height;
    return span > 0 ? ((s0.body.x1 - s0.body.x0) * s0.width) / span : 9;
  };
  const full = ctx.pool.filter((p) => p.subject.feetInFrame && p.subject.head && ctx.cutout(p) && !p.flags.includes('other-people')).sort((a, b) => stance(a) - stance(b))[0] || null;
  const others = items.filter((i) => i !== full);

  // Record first (bottom), measured, so the pictures take what is left.
  const { measures, features } = splitStats(ctx.stats);
  const rows = [...measures, ...features];
  const tf = cast.text;
  const lf = cast.label;
  const lead = 4.4;
  const half = Math.ceil(rows.length / 2);
  const recordH = 10 + half * lead + 10;
  const c = ctx.contact;
  const contact = c.mode === 'agency' ? [c.agencyName, ...c.lines] : [...c.lines, c.portfolio].filter(Boolean);
  const top = m;
  const bottom = H - m - recordH - 6;

  // Left: the full length on a colour panel, head breaking its edge.
  const panelW = full ? (W - 2 * m) * 0.5 : 0;
  if (full) {
    const sig = backdrop(ctx.hero);
    const base = sig && sig.C > 6 ? sig.rgb : groundFor([ctx.hero, ...items]).rgb;
    const { L, C, h } = toLch(base);
    const panel = lch(Math.max(55, Math.min(78, L)), Math.min(Math.max(C, 10), 28), h);
    const s = full.subject;
    // Scale by the crop guarantee's own protected region (head to soles with
    // padding) so nothing of the figure is ever clipped.
    const req = requiredRegion(s, 'full');
    const ry0 = Math.max(0, req.y0);
    const ry1 = Math.min(1, req.y1);
    const rx0 = Math.max(0, req.x0);
    const rx1 = Math.min(1, req.x1);
    const figH = bottom - top - 2;
    const span = ry1 - ry0;
    const k = Math.min(figH / (span * s.height), (panelW * 0.96) / ((rx1 - rx0) * s.width)); // mm per px
    const imgW = s.width * k;
    const imgH = s.height * k;
    const cx = m + panelW / 2;
    const imgLeft = cx - ((rx0 + rx1) / 2) * imgW;
    const imgTop = bottom - ry1 * imgH;
    const crown = imgTop + s.head.y0 * imgH;
    // The panel stops below the crown so the head breaks its edge.
    const panelTop = Math.max(top, crown + (bottom - crown) * 0.16);
    els.push({ type: 'rect', x: m, y: panelTop, w: panelW, h: bottom - panelTop, fill: hex(panel) });
    // The figure, uncropped, drawn over the panel and above its top edge.
    const frame = { x: imgLeft, y: imgTop, w: imgW, h: imgH };
    const visible = { x: m, y: top, w: panelW, h: bottom - top };
    const fx0 = Math.max(frame.x, visible.x);
    const fx1 = Math.min(frame.x + frame.w, visible.x + visible.w);
    const fy0 = Math.max(frame.y, visible.y);
    const fy1 = Math.min(frame.y + frame.h, visible.y + visible.h);
    if (fx1 > fx0 && fy1 > fy0) {
      els.push({
        type: 'photo', slot: 'back-1', imageId: full.id, src: full.src, cutout: ctx.cutout(full).url, role: 'full',
        x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0,
        crop: { x: (fx0 - frame.x) / frame.w, y: (fy0 - frame.y) / frame.h, w: (fx1 - fx0) / frame.w, h: (fy1 - fy0) / frame.h },
        shadow: `drop-shadow(0 0.8mm 1.4mm ${hex(deepen(panel, 30))}66)`,
      });
    }
  }

  // Right (or full width): the other photographs, stacked.
  const colX = full ? m + panelW + g * 2 : m;
  const colW = W - m - colX;
  const n = Math.min(others.length, full ? 3 : 4);
  const list = others.slice(0, n);
  if (list.length) {
    const aspects = list.map((it) => Math.max(0.66, Math.min(1.4, it.subject.width / it.subject.height)));
    if (full) {
      const hs = aspects.map((a) => colW / a);
      const total = hs.reduce((a, b) => a + b, 0) + g * (list.length - 1);
      const kk = Math.min(1, (bottom - top) / total);
      let y = top;
      list.forEach((it, i) => {
        const w = colW * kk;
        els.push(ctx.photo(`back-${i + 2}`, it, { x: colX + colW - w, y, w, h: hs[i] * kk }, ctx.roleOf(it)));
        y += hs[i] * kk + g;
      });
    } else {
      const cols = list.length > 2 ? 2 : list.length;
      const rowsN = Math.ceil(list.length / cols);
      const cw = (colW - g * (cols - 1)) / cols;
      const chh = (bottom - top - g * (rowsN - 1)) / rowsN;
      list.forEach((it, i) => els.push(ctx.photo(`back-${i + 2}`, it, { x: colX + (i % cols) * (cw + g), y: top + Math.floor(i / cols) * (chh + g), w: cw, h: chh }, ctx.roleOf(it))));
    }
  }

  // The record.
  const ink = '#151413';
  const grey = '#827C74';
  let y = bottom + 9;
  const nameFont = { ...cast.display, size: 18 };
  const nm = nameCase(ctx.name.full, cast);
  const nameSize = Math.min(18, ctx.fitSize(nm, nameFont, W - 2 * m));
  const nt = text(ctx, nm, { ...nameFont, size: nameSize }, m, y, { color: ink });
  els.push(nt.el);
  y = nt.bottom + 6;
  const colW2 = (W - 2 * m) * 0.3;
  const labelW = Math.max(0, ...rows.map((r) => ctx.measure(r.label.toUpperCase(), { ...lf, caps: null }).width)) + 3;
  rows.forEach((r, i) => {
    const col = i < half ? 0 : 1;
    const row = i < half ? i : i - half;
    const x = m + col * colW2;
    const ry = y + row * lead;
    els.push(text(ctx, r.label, lf, x, ry + 0.3, { color: grey }).el);
    const alt = altUnit(r, ctx.stats.units);
    els.push(text(ctx, alt ? `${r.value}   ${alt}` : r.value, tf, x + labelW, ry, { color: ink }).el);
  });
  const cx2 = m + colW2 * 2 + 4;
  els.push(text(ctx, c.label, lf, cx2, y + 0.3, { color: grey }).el);
  contact.forEach((l, i) => els.push(text(ctx, l, tf, cx2, y + (i + 1) * lead, { color: ink }).el));
  return { name: 'back', paper, elements: els };
}

export default {
  id: 'cover',
  name: 'Cover',
  summary: 'A magazine cover: the name as a masthead, the subject in front of it.',
  compose(ctx) {
    const character = readCharacter([ctx.hero, ...ctx.picks.back], ctx.labels);
    const cast = castType(ALLOWED, character, ctx.settings.type);
    return { pages: [front(ctx, cast), back(ctx, cast)], casting: cast.id };
  },
};
