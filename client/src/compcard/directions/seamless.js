/**
 * SEAMLESS
 *
 * The card is one studio. Every photograph's own background is replaced by
 * a single seamless — the hero's backdrop when it is clean, otherwise a
 * quiet ground drawn from the set — so a library shot in different rooms
 * reads as one sitting. Figures stand on the floor with a soft contact
 * shadow; portraits rise from the foot of the page.
 *
 * Type is set quietly: the photograph and the ground do the work.
 */
import { altUnit, splitStats, text } from './shared';
import { castType, nameCase, readCharacter } from '../model/typefaces';
import { backdrop, deepen, groundFor, inkFor } from '../model/imagery';
import { hex, lch, toLch } from '../model/palette';
import { requiredRegion } from '../model/crop';

const ALLOWED = ['classic', 'airy', 'editorial', 'modernist', 'literary', 'warm'];

function ground(ctx) {
  const items = [ctx.hero, ...ctx.picks.back].filter(Boolean);
  const bd = backdrop(ctx.hero);
  if (bd && bd.evenness > 0.55 && bd.L > 55 && bd.L < 97) return bd.rgb;
  const g = groundFor(items, 'light');
  return g.rgb;
}

/** A cut-out placed on the page so its protected region fills `box`. */
function placeCutout(ctx, item, box, { anchor = 'floor', z } = {}) {
  const s = item.subject;
  const cut = ctx.cutout(item);
  if (!cut || !s.known) return null;
  const role = s.feetInFrame ? 'full' : 'portrait';
  const req = requiredRegion(s, role);
  const rx0 = Math.max(0, req.x0);
  const rx1 = Math.min(1, req.x1);
  const ry0 = Math.max(0, req.y0);
  const ry1 = Math.min(1, req.y1);
  const k = Math.min(box.h / ((ry1 - ry0) * s.height), box.w / ((rx1 - rx0) * s.width));
  const imgW = s.width * k;
  const imgH = s.height * k;
  const cx = box.x + box.w / 2;
  const left = cx - ((rx0 + rx1) / 2) * imgW;
  // Floor: soles on the box's bottom edge. Foot: body runs off the bottom.
  const top = anchor === 'floor' ? box.y + box.h - ry1 * imgH : box.y + box.h - imgH * Math.min(1, ry1 + 0.02);
  return { type: 'photo', slot: item.id, imageId: item.id, src: item.src, cutout: cut.url, role: 'whole', x: left, y: top, w: imgW, h: imgH, crop: { x: 0, y: 0, w: 1, h: 1 }, z, feetY: s.feetY != null ? top + s.feetY * imgH : null, scale: k };
}

function contactShadow(x, y, w, color) {
  return { type: 'rect', x: x - w / 2, y: y - w * 0.05, w, h: w * 0.12, gradient: `radial-gradient(ellipse at center, ${color} 0%, transparent 70%)` };
}

function front(ctx, cast, g) {
  const { format } = ctx;
  const W = format.w;
  const H = format.h;
  const m = 9;
  const els = [];
  const floor = deepen(g, 7);
  els.push({ type: 'rect', x: 0, y: 0, w: W, h: H, gradient: `linear-gradient(to bottom, ${hex(g)} 0%, ${hex(g)} 55%, ${hex(floor)} 100%)`, bleed: { t: 1, r: 1, b: 1, l: 1 } });
  const ink = hex(inkFor(g));
  const soft = hex(lch(toLch(g).L - 38, Math.min(12, toLch(g).C), toLch(g).h));
  const hero = ctx.hero;
  const s = hero?.subject;

  // Name and details: quiet, top left.
  const display = { ...cast.display };
  const nm = nameCase(ctx.name.full, cast);
  const nameSize = Math.min(30, ctx.fitSize(nm, display, W - 2 * m));
  const n = text(ctx, nm, { ...display, size: nameSize }, m, m + 2, { color: ink });
  els.push(n.el);
  const details = [ctx.contact.mode === 'agency' ? ctx.contact.agencyName : ctx.city].filter(Boolean);
  const h = ctx.stats.items.find((i) => i.key === 'height');
  if (h) details.push(`${h.value}  ${altUnit(h, ctx.stats.units)}`);
  let dy = n.bottom + 5;
  for (const d of details) {
    const t = text(ctx, d, cast.label, m, dy, { color: soft });
    els.push(t.el);
    dy = t.bottom + 2.6;
  }

  const cut = hero && ctx.cutout(hero);
  if (cut && s?.known) {
    if (s.feetInFrame) {
      const box = { x: m, y: dy + 8, w: W - 2 * m, h: H - dy - 8 - H * 0.07 };
      const fig = placeCutout(ctx, hero, box, { anchor: 'floor' });
      if (fig) {
        els.push(contactShadow(fig.x + fig.w * ((s.body.x0 + s.body.x1) / 2), box.y + box.h, (s.body.x1 - s.body.x0) * fig.w * 1.3, 'rgba(0,0,0,0.22)'));
        fig.shadow = 'drop-shadow(0 0.4mm 0.8mm rgba(0,0,0,0.12))';
        els.push(fig);
      }
    } else {
      // A portrait rises from the foot of the page, filling the width.
      const fig = placeCutout(ctx, hero, { x: -W * 0.06, y: dy + 10, w: W * 1.12, h: H - dy - 10 }, { anchor: 'foot' });
      if (fig) {
        fig.bleed = { b: 1 };
        els.push(fig);
      }
    }
  } else if (hero) {
    // Not cut out yet: the photograph dissolves into the ground instead.
    els.push(ctx.photo('front', hero, { x: 0, y: H * 0.22, w: W, h: H * 0.78 }, 'portrait', { bleed: { r: 1, b: 1, l: 1 } }));
    els[els.length - 1].fade = { t: 22 };
  }
  return { name: 'front', paper: hex(g), elements: els };
}

function back(ctx, cast, g) {
  const { format } = ctx;
  const W = format.w;
  const H = format.h;
  const m = 9;
  const els = [];
  const floor = deepen(g, 7);
  els.push({ type: 'rect', x: 0, y: 0, w: W, h: H, gradient: `linear-gradient(to bottom, ${hex(g)} 0%, ${hex(g)} 50%, ${hex(floor)} 100%)`, bleed: { t: 1, r: 1, b: 1, l: 1 } });
  const ink = hex(inkFor(g));
  const soft = hex(lch(toLch(g).L - 38, Math.min(12, toLch(g).C), toLch(g).h));

  // The record at the foot, measured first.
  const { measures, features } = splitStats(ctx.stats);
  const rows = [...measures, ...features];
  const tf = cast.text;
  const lf = cast.label;
  const lead = 4.3;
  const perCol = Math.ceil(rows.length / 2);
  const c = ctx.contact;
  const contact = c.mode === 'agency' ? [c.agencyName, ...c.lines] : [...c.lines, c.portfolio].filter(Boolean);
  const recH = 8 + Math.max(perCol, contact.length + 1) * lead;
  const recTop = H - m - recH;

  // The looks, all on this ground.
  const pool = ctx.pool.filter((p) => p !== ctx.hero && ctx.cutout(p) && p.subject.known && !p.flags.includes('other-people'));
  // Upright stances only in a line-up; a dramatic pose doesn't stand in a row.
  const stance = (it) => {
    const s0 = it.subject;
    const span = ((s0.feetY ?? s0.body.y1) - (s0.head?.y0 ?? s0.body.y0)) * s0.height;
    return span > 0 ? ((s0.body.x1 - s0.body.x0) * s0.width) / span : 9;
  };
  const fulls = pool.filter((p) => p.subject.feetInFrame && stance(p) < 0.55).sort((a, b) => stance(a) - stance(b)).slice(0, 4);
  const busts = pool.filter((p) => !p.subject.feetInFrame).slice(0, 4);
  const stage = { x: m, y: m + 4, w: W - 2 * m, h: recTop - m - 10 };
  if (fulls.length >= 2) {
    // A line-up: same crown height, one floor, slight overlap.
    const n = fulls.length;
    const slotW = stage.w / n;
    fulls.forEach((it, i) => {
      const box = { x: stage.x + i * slotW - slotW * 0.08, y: stage.y, w: slotW * 1.16, h: stage.h };
      const fig = placeCutout(ctx, it, box, { anchor: 'floor', z: i % 2 ? 2 : 1 });
      if (!fig) return;
      const s = it.subject;
      els.push(contactShadow(fig.x + fig.w * ((s.body.x0 + s.body.x1) / 2), stage.y + stage.h, (s.body.x1 - s.body.x0) * fig.w * 1.3, 'rgba(0,0,0,0.2)'));
      els.push(fig);
    });
  } else if (busts.length || fulls.length) {
    // Portraits rise together from the stage floor, heads level.
    const list = [...fulls, ...busts].slice(0, 3);
    const n = list.length;
    const slotW = stage.w / n;
    list.forEach((it, i) => {
      const box = { x: stage.x + i * slotW - slotW * 0.06, y: stage.y + 6, w: slotW * 1.12, h: stage.h - 6 };
      const fig = placeCutout(ctx, it, box, { anchor: it.subject.feetInFrame ? 'floor' : 'foot', z: n - i });
      if (fig) els.push(fig);
    });
    // The foot of the busts is cut by a quiet band so they sit on something.
    els.push({ type: 'rect', x: 0, y: stage.y + stage.h, w: W, h: H - stage.y - stage.h, fill: hex(g), z: 5, bleed: { l: 1, r: 1, b: 1 } });
  }

  // Record.
  const z = 6;
  const nm = nameCase(ctx.name.full, cast);
  const nt = text(ctx, nm, { ...cast.display, size: Math.min(16, ctx.fitSize(nm, cast.display, W - 2 * m)) }, m, recTop, { color: ink, z });
  els.push(nt.el);
  const y0 = nt.bottom + 5;
  // Contact on the right, measured; stats in two columns in what remains.
  const contactW = Math.max(ctx.measure(c.label.toUpperCase(), { ...lf, caps: null }).width, ...contact.map((l) => ctx.measure(l, tf).width));
  const statsW = W - 2 * m - contactW - 8;
  const half = Math.ceil(rows.length / 2);
  const colW = statsW / 2;
  const labelW = Math.max(0, ...rows.map((r) => ctx.measure(r.label.toUpperCase(), { ...lf, caps: null }).width)) + 2.6;
  rows.forEach((r, i) => {
    const col = i < half ? 0 : 1;
    const row = i < half ? i : i - half;
    const x = m + col * colW;
    const y = y0 + row * lead;
    els.push(text(ctx, r.label, lf, x, y + 0.3, { color: soft, z }).el);
    const alt = altUnit(r, ctx.stats.units);
    els.push(text(ctx, alt ? `${r.value}  ${alt}` : r.value, tf, x + labelW, y, { color: ink, z }).el);
  });
  const cx = W - m;
  els.push(text(ctx, c.label, lf, cx, y0 + 0.3, { align: 'right', color: soft, z }).el);
  contact.forEach((l, i) => els.push(text(ctx, l, tf, cx, y0 + (i + 1) * lead, { align: 'right', color: ink, z }).el));
  return { name: 'back', paper: hex(g), elements: els };
}

export default {
  id: 'seamless',
  name: 'Seamless',
  summary: 'One studio: every look on a single seamless, figures standing on the floor.',
  compose(ctx) {
    const character = readCharacter([ctx.hero, ...ctx.picks.back], ctx.labels);
    const cast = castType(ALLOWED, character, ctx.settings.type);
    const g = ground(ctx);
    return { pages: [front(ctx, cast, g), back(ctx, cast, g)], casting: cast.id };
  },
};
