/**
 * Curation — choosing the photographs a booker would choose.
 *
 * Industry rules encoded here:
 *  - the front is one strong, clear image of the face;
 *  - the back shows range: a full length is not optional, then a close
 *    portrait, then different looks — never two versions of the same frame;
 *  - one person per photograph; group shots and crowded rooms don't belong;
 *  - resolution must survive print at the size the photo is used.
 *
 * The talent's own signals (cover photo, their shot labels) are respected
 * as tie-breakers, but what the image actually contains (perception) wins.
 */
import { describeSubject } from './subject';

const hamming = (a, b) => {
  if (!a || !b) return 64;
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
};

const PORTRAITISH = new Set(['close-up', 'head-and-shoulders', 'half', 'three-quarter']);

function meanColor(tone) {
  if (!tone) return null;
  let r = 0, g = 0, b = 0, n = 0;
  for (const row of tone.color) for (const c of row) { r += c[0]; g += c[1]; b += c[2]; n++; }
  return [r / n, g / n, b / n];
}

/** Prepare every usable image with its subject and a base quality score. */
export function buildPool(images) {
  const pool = [];
  for (const img of images) {
    const p = img.perception || null;
    const s = describeSubject(p, { width: img.width, height: img.height });
    const minSide = Math.min(s.width, s.height);
    let q = 0;
    const flags = [];
    if (minSide < 700) { q -= 1.2; flags.push('low-resolution'); }
    else if (minSide < 1100) q -= 0.35;
    // More pixels is more printable, up to the point it stops mattering.
    q += Math.max(0, Math.min(1, (minSide - 1000) / 1600)) * 0.5;
    // 9:16-ish frames are phone captures (selfies, screenshots), rarely a booker's pick.
    if (s.aspect > 0.48 && s.aspect < 0.6) { q -= 0.2; flags.push('phone-frame'); }
    if (s.known && s.people > 1) { q -= 1.6; flags.push('other-people'); }
    if (s.known && !s.face) { q -= 0.8; flags.push('no-face'); }
    if (s.noPerson) { q -= 3; flags.push('no-person'); }
    if (s.face?.eyeOpen != null && s.face.eyeOpen < 0.12) { q -= 0.5; flags.push('eyes-closed'); }
    if (s.calm != null) q += (s.calm - 0.5) * 0.9;
    if (s.aspect > 1.15) { q -= 0.35; flags.push('landscape'); }
    if (img.is_primary) q += 0.35;
    pool.push({ ...img, subject: s, quality: q, flags, color: meanColor(p?.tone), hash: p?.hash || null });
  }
  return dedupe(pool);
}

/** Drop near-duplicates (same frame, re-uploaded or burst), keeping the stronger file. */
function dedupe(pool) {
  const out = [];
  const dropped = [];
  const sorted = [...pool].sort((a, b) => b.quality - a.quality || b.subject.width * b.subject.height - a.subject.width * a.subject.height);
  for (const item of sorted) {
    const twin = out.find((o) => item.hash && o.hash && hamming(item.hash, o.hash) <= 5);
    if (twin) dropped.push({ id: item.id, twinOf: twin.id });
    else out.push(item);
  }
  out.duplicates = dropped;
  return out;
}

function heroScore(item) {
  const s = item.subject;
  if (!s.known) return item.quality - 0.5;
  if (!s.face || s.face.fromPose) return item.quality - 1.2;
  let v = item.quality;
  if (PORTRAITISH.has(s.framing)) v += 0.8;
  if (s.framing === 'head-and-shoulders' || s.framing === 'half') v += 0.3;
  v -= Math.max(0, Math.abs(s.face.yaw) - 0.35) * 1.2;
  // The front sells the eyes: open, direct eyes over squints and half-lids.
  if (s.face.eyeOpen != null) v += Math.max(0, Math.min(1, (s.face.eyeOpen - 0.12) / 0.16)) * 0.5;
  if (s.aspect > 1) v -= 0.6;
  return v;
}

function diversity(item, chosen) {
  if (!chosen.length) return 0;
  let minHash = 64;
  let minColor = Infinity;
  let sameFraming = 0;
  for (const c of chosen) {
    minHash = Math.min(minHash, hamming(item.hash, c.hash));
    if (item.color && c.color) {
      const d = Math.hypot(item.color[0] - c.color[0], item.color[1] - c.color[1], item.color[2] - c.color[2]);
      minColor = Math.min(minColor, d);
    }
    if (item.subject.framing === c.subject.framing) sameFraming++;
  }
  let v = (minHash / 64) * 0.8;
  if (minColor !== Infinity) v += Math.min(1, minColor / 90) * 0.5;
  v -= sameFraming * 0.55;
  return v;
}

/**
 * Pick the card's photographs.
 * @param pool   buildPool() output
 * @param pins   { heroId?, backIds?: [] } talent choices that override curation
 * @returns { hero, back: [], fullLength, notes }
 */
export function curate(pool, pins = {}) {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const usable = pool.filter((p) => !p.flags.includes('no-person'));

  const hero = (pins.heroId && byId.get(pins.heroId)) || [...usable].sort((a, b) => heroScore(b) - heroScore(a))[0] || null;

  const rest = usable.filter((p) => p !== hero);
  const fullLengths = rest.filter((p) => p.subject.feetInFrame).sort((a, b) => b.quality - a.quality);
  const heroIsOnlyFull = !fullLengths.length && hero?.subject.feetInFrame;

  let back = [];
  if (pins.backIds?.length) {
    back = pins.backIds.map((id) => byId.get(id)).filter(Boolean);
  } else {
    const fl = pins.taste ? [...fullLengths].sort((a, b) => b.quality + pins.taste(b) - (a.quality + pins.taste(a))) : fullLengths;
    if (fl[0]) back.push(fl[0]);
    else if (heroIsOnlyFull) back.push(hero);
    const candidates = rest.filter((p) => !back.includes(p));
    while (candidates.length) {
      let best = null;
      let bestV = -Infinity;
      for (const c of candidates) {
        const v = c.quality + diversity(c, [hero, ...back].filter(Boolean)) + (c.subject.framing === 'close-up' || c.subject.framing === 'head-and-shoulders' ? 0.15 : 0) + (pins.taste ? pins.taste(c) : 0);
        if (v > bestV) {
          bestV = v;
          best = c;
        }
      }
      // Don't pad the card with weak frames: a photo with real problems
      // only goes on when the card would otherwise be bare.
      if (bestV < -1.4 && back.length >= 2) break;
      back.push(best);
      candidates.splice(candidates.indexOf(best), 1);
    }
  }

  // A one-photo library still needs a working back: show the hero again,
  // whole, beside the stats (the review asks for more photos).
  if (!back.length && hero) back = [hero];

  return {
    hero,
    back,
    fullLength: back.find((p) => p.subject.feetInFrame) || null,
    duplicates: pool.duplicates || [],
  };
}

/**
 * The booker's read of the material — plain statements, worst first.
 * level: 'needs' (the card is weaker without fixing it) | 'note'
 */
export function review({ pool, picks, stats, images, contact }) {
  const notes = [];
  const used = [picks.hero, ...picks.back].filter(Boolean);
  if (!images.length) {
    notes.push({ level: 'needs', text: 'Add photos to your media library to build a card.' });
    return notes;
  }
  if (!picks.fullLength) {
    notes.push({ level: 'needs', text: 'Add a full-length photo. Bookers read proportion from it first, and a card without one looks unfinished.' });
  }
  if (used.length < 4) {
    notes.push({ level: 'needs', text: `The back works best with four or five photos showing range. You have ${Math.max(0, used.length - 1)} besides the front.` });
  }
  const crowded = used.filter((p) => p.flags.includes('other-people'));
  if (crowded.length) notes.push({ level: 'needs', text: `${crowded.length === 1 ? 'One photo has' : `${crowded.length} photos have`} other people in frame. Use photos of you alone.` });
  const low = used.filter((p) => p.flags.includes('low-resolution'));
  if (low.length) notes.push({ level: 'needs', text: `${low.length === 1 ? 'One photo is' : `${low.length} photos are`} too small to print sharply. Upload the original files.` });
  if (picks.hero && picks.hero.subject.known && (!picks.hero.subject.face || picks.hero.subject.face.fromPose)) {
    notes.push({ level: 'needs', text: 'The front photo should show your face clearly. Choose a closer frame for the front.' });
  }
  const missing = [];
  const keys = new Set(stats.items.map((i) => i.key));
  if (!keys.has('height')) missing.push('height');
  if (stats.track === 'women') ['bust', 'waist', 'hips'].forEach((k) => !keys.has(k) && missing.push(k));
  if (stats.track === 'men') ['chest', 'waist'].forEach((k) => !keys.has(k) && missing.push(k));
  if (!keys.has('shoes')) missing.push('shoe size');
  if (missing.length) notes.push({ level: 'needs', text: `Add your ${listJoin(missing)} in your profile. Cards are booked off these numbers.` });
  if (contact.mode === 'direct' && !contact.lines.length) notes.push({ level: 'needs', text: 'Add a booking contact so the card can be acted on.' });
  if (pool.duplicates?.length) notes.push({ level: 'note', text: `Left out ${pool.duplicates.length === 1 ? 'a near-duplicate photo' : `${pool.duplicates.length} near-duplicate photos`}.` });
  return notes;
}

function listJoin(xs) {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
