/**
 * Intel page — shared constants and pure helpers.
 * Kept in a component-free module so Fast Refresh stays happy and the
 * instrument files export only their component.
 */

// House spring physics (DESIGN.md) and the editorial section easing.
export const SPRING = { type: 'spring', stiffness: 55, damping: 16 };
export const SECTION_EASE = [0.22, 1, 0.36, 1];

// Signal-tier ink ramp: tier 1 (a booker reviewed you) is the darkest,
// tier 5 (raw reach) the faintest. The colour IS the quality signal.
export const TIER_INK = {
  1: '#1A1815',
  2: '#5B4A3A',
  3: '#8A6F4E',
  4: '#B8956A',
  5: 'rgba(184,149,106,0.35)',
};

export const TIER_LABEL = {
  reviews: 'Reviewed',
  advances: 'Advanced',
  pulls: 'Pulled / opened',
  qualified: 'Qualified visits',
  reach: 'Reach',
};

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function cap(value) {
  const s = String(value ?? '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function pluralize(n, singular, plural) {
  return Number(n) === 1 ? singular : plural ?? `${singular}s`;
}

/** "today" / "yesterday" / "3 days ago" from a whole-day offset. */
export function agoLabel(daysAgo) {
  const n = Number(daysAgo);
  if (!Number.isFinite(n) || n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  return `${n} days ago`;
}

export function dowName(dow) {
  return DOW[dow] ?? '';
}

/** Part of the day for the Rhythm caption ("Tuesday evenings"). */
export function hourPart(hour) {
  const h = Number(hour);
  if (h < 5) return 'nights';
  if (h < 12) return 'mornings';
  if (h < 17) return 'afternoons';
  if (h < 21) return 'evenings';
  return 'nights';
}

export function weeksFromDays(days) {
  const n = Number(days);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n / 7));
}

export function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function pct(share) {
  return Math.round(clamp01(share) * 100);
}

/** A zone is locked (free upsell) only when the server withheld it on free
 * tier — never for minors, whose missing zones simply do not exist. */
export function isLocked(zoneData, meta) {
  return zoneData == null && meta?.tier === 'free' && !meta?.minor;
}

const SOURCE_LABELS = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  search: 'Search',
  direct: 'Direct',
  share_link: 'Shared link',
  card_link: 'Card scan',
  agency: 'Agency',
};

export function sourceLabel(source) {
  return SOURCE_LABELS[source] ?? cap(source);
}

const SOURCE_MEANING = {
  instagram: 'Social taps — reach, not intent.',
  tiktok: 'Social taps — reach, not intent.',
  search: 'They looked for you by name.',
  share_link: 'Your shared link is being opened.',
  card_link: 'Someone scanned your card.',
  direct: 'Typed or bookmarked — direct interest.',
  agency: 'Agency-side attention.',
};

export function sourceMeaning(source) {
  return SOURCE_MEANING[source] ?? 'Referred traffic.';
}

/** State → ring treatment for the Agency Lens currency rings. */
export const RING_STATE_COLOR = {
  current: '#C9A55A',
  aging: '#B98B3E',
  stale: 'rgba(120,110,96,0.55)',
  missing: 'rgba(120,110,96,0.4)',
};
