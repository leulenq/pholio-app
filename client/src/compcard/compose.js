/**
 * composeCard — data + perception + the talent's choices → a printable scene.
 *
 * Layout is a pure function of its inputs. Directions are written as real
 * art direction (each owns its grid, type and photographic logic); this
 * module provides what they share: formats, content, curation, the crop
 * guarantee, and slot assignment.
 */
import { buildPool, curate, review } from './model/curate';
import { buildContact, buildStats, cityName, defaultUnits, displayName, resolveTrack } from './model/content';
import { scoreFit, solveCrop } from './model/crop';
import { partitions, roleOf } from './model/partitions';
import { measure, fitSize, wrap } from './render/measure';
import { DIRECTIONS } from './directions';

export const FORMATS = {
  us: { id: 'us', label: '5.5 × 8.5 in', w: 139.7, h: 215.9, bleed: 3.175 },
  a5: { id: 'a5', label: 'A5', w: 148, h: 210, bleed: 3 },
};

export const DEFAULT_SETTINGS = {
  direction: 'cover',
  format: 'us',
  units: null, // null → from market
  track: null, // null → from profile
  nameStyle: 'full',
  showEmail: true,
  showPhone: false,
  slots: {}, // slotId → { imageId?, adjust?: {x,y,zoom} }
};

const MM_PER_IN = 25.4;

/** Every permutation-free assignment of items to slots maximising total fit. */
function bestAssignment(slots, items, frameIn) {
  const n = slots.length;
  const used = new Array(items.length).fill(false);
  let best = { score: -Infinity, pick: null };
  const cur = [];
  // Precompute fits.
  const fit = slots.map((sl) =>
    items.map((it) => {
      const role = sl.role === 'auto' ? roleOf(it) : sl.role;
      let v = scoreFit(it.subject, sl.w / sl.h, role, frameIn(sl), sl.safe).score;
      if (v === -Infinity) return v;
      if (sl.prefer) v += sl.prefer(it);
      // The dominant frame is where the full length belongs.
      if (sl.lead && it.subject.feetInFrame) v += 1.2;
      if (!sl.lead && it.subject.feetInFrame && slots.some((o) => o.lead)) v -= 0.4;
      return v;
    }),
  );
  const rec = (i, acc) => {
    if (i === n) {
      if (acc > best.score) best = { score: acc, pick: [...cur] };
      return;
    }
    for (let j = 0; j < items.length; j++) {
      if (used[j] || fit[i][j] === -Infinity) continue;
      used[j] = true;
      cur.push(j);
      rec(i + 1, acc + fit[i][j]);
      cur.pop();
      used[j] = false;
    }
  };
  rec(0, 0);
  return best;
}

export function composeCard(data, perceptions, rawSettings = {}, extras = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...rawSettings, slots: { ...(rawSettings.slots || {}) } };
  const format = FORMATS[settings.format] || FORMATS.us;
  const direction = DIRECTIONS.find((d) => d.id === settings.direction) || DIRECTIONS[0];
  const profile = data.profile;

  const images = (data.images || []).map((img) => ({ ...img, perception: perceptions[img.id] || null }));
  const pool = buildPool(images);
  const byId = new Map(pool.map((p) => [p.id, p]));
  // Duplicates are still choosable when pinned.
  const allById = new Map(images.map((i) => [i.id, i]));

  const units = settings.units || defaultUnits(profile);
  const track = settings.track || resolveTrack(profile);
  const stats = buildStats(profile, { units, track });
  const contact = buildContact(data, { showEmail: settings.showEmail, showPhone: settings.showPhone });
  const name = displayName(profile, settings.nameStyle);
  const city = cityName(profile);

  const heroPin = settings.slots.front?.imageId;
  const picks = curate(pool, { heroId: heroPin && byId.has(heroPin) ? heroPin : null });

  const resolveItem = (id) => {
    if (!id) return null;
    if (byId.has(id)) return byId.get(id);
    const raw = allById.get(id);
    return raw ? buildPool([raw])[0] : null;
  };

  /** Build a photo element for a slot with the guaranteed crop. */
  const photo = (slot, item, rect, role, extra = {}) => {
    const adjust = settings.slots[slot]?.adjust;
    const aspect = rect.w / rect.h;
    const frameHeightIn = rect.h / MM_PER_IN;
    // Try the intended role, then progressively less demanding ones. The
    // head is never relaxed away: if even 'beauty' fails, the photo is shown
    // whole on paper instead of being cut.
    const chain = { full: ['full', 'whole', 'figure', 'portrait'], whole: ['whole', 'figure', 'portrait'], figure: ['figure', 'portrait', 'beauty'], portrait: ['portrait', 'beauty'], beauty: ['beauty'] };
    let crop = null;
    let usedRole = role;
    if (item) {
      for (const r of chain[role] || [role]) {
        const c = solveCrop(item.subject, aspect, { role: r, frameHeightIn, adjust, safe: extra.safe });
        if (c.feasible) {
          crop = c;
          usedRole = r;
          break;
        }
      }
    }
    return {
      type: 'photo',
      slot,
      imageId: item?.id || null,
      src: item?.src || null,
      role: usedRole,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      crop: crop || (item ? containCrop(item.subject, aspect) : null),
      contained: Boolean(item && !crop),
      fill: extra.fill,
      bleed: extra.bleed,
      z: extra.z,
      ppi: crop?.ppi ?? null,
    };
  };

  /**
   * Assign photos to slots. Slots: [{ id, x,y,w,h, role, prefer?(item) }].
   * Talent pins win; remaining slots are filled by best total fit.
   */
  const assign = (slots, items) => {
    const out = new Map();
    const free = [];
    const taken = new Set();
    for (const sl of slots) {
      const pin = settings.slots[sl.id]?.imageId;
      const item = pin ? resolveItem(pin) : null;
      if (item) {
        out.set(sl.id, item);
        taken.add(item.id);
      } else free.push(sl);
    }
    const avail = items.filter((it) => it && !taken.has(it.id));
    if (free.length && avail.length) {
      const k = Math.min(free.length, avail.length);
      const { pick, score } = bestAssignment(free.slice(0, k), avail, (sl) => sl.h / MM_PER_IN);
      if (pick) pick.forEach((j, i) => out.set(free[i].id, avail[j]));
      else free.slice(0, k).forEach((sl, i) => out.set(sl.id, avail[i]));
      out.score = pick ? score : -Infinity;
    } else out.score = free.length ? -Infinity : 0;
    return out;
  };

  /**
   * Choose among candidate arrangements (each a list of slots) the one whose
   * slots the photographs fill best. An arrangement that would force any
   * photo into a frame it can't fill safely is not eligible.
   * Candidates may carry `bias` (art-direction preference).
   */
  const arrange = (candidates, items) => {
    let best = null;
    for (const cand of candidates) {
      if (!cand.slots.length) continue;
      if (cand.slots.length > items.length) continue;
      const a = assign(cand.slots, items);
      if (a.size < cand.slots.length || a.score === -Infinity) continue;
      const total = a.score / cand.slots.length + (cand.bias || 0) + cand.slots.length * 0.6;
      if (!best || total > best.total) best = { ...cand, assigned: a, total };
    }
    return best;
  };

  const ctx = {
    format,
    settings,
    profile,
    name,
    city,
    stats,
    contact,
    pool,
    picks,
    resolveItem,
    photo,
    assign,
    arrange,
    partitions,
    roleOf,
    solveCrop,
    measure,
    fitSize,
    wrap,
    hero: resolveItem(heroPin) || picks.hero,
    // Print-grade cutouts (decontaminated RGBA, aligned 1:1 with the photo)
    // when they have been computed; directions fall back without them.
    cutout: (item) => (item && extras.cutouts ? extras.cutouts[item.id] || null : null),
    labels: data.labels || [],
  };

  const scene = direction.compose(ctx);
  const notes = review({ pool, picks, stats, images, contact });
  for (const p of scene.pages) {
    for (const el of p.elements) {
      if (el.type === 'photo' && el.ppi != null && el.ppi < 150 && el.imageId) {
        notes.push({ level: 'needs', text: 'A photo is printed larger than its file supports. Upload a higher-resolution original.', imageId: el.imageId });
      }
    }
  }
  return { scene: { ...scene, format, direction: direction.id }, picks, notes, stats, units, track, contact, nameShown: name.full, pool };
}

/** Whole image letterboxed inside the frame (only when no safe crop exists). */
function containCrop(s, aspect) {
  const ia = s.width / s.height;
  if (ia > aspect) {
    const h = ia / aspect;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  const w = aspect / ia;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}
