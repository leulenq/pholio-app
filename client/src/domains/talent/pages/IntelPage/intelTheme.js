/**
 * Intel chart system — colour, scales and formatters.
 *
 * Warm paper surface, warm ink. Nothing on this page is black or near-black
 * grey: the type scale runs espresso → walnut → bark, all warm and all at or
 * above AA on the #FAF9F7 canvas. Pale low-opacity greys are deliberately
 * absent — every label is a solid, measured colour.
 *
 * Every scale here is ORDINAL (stage or event sequence) or EMPHASIS
 * (this period against the last), so the page needs no hue rotation: one warm
 * ramp runs light → deep as signal gets stronger, a warm stone carries context,
 * and a single reserved ember marks "past the line" — always beside a word,
 * never as colour alone.
 *
 * The ramp is validated, not eyeballed (dataviz skill, ordinal checks against
 * #FAF9F7): monotone lightness PASS · adjacent ΔL ≥ 0.06 PASS · light end
 * 2.96:1 PASS · single hue, 16° spread PASS. Changing a step means re-running
 * scripts/validate_palette.js --ordinal.
 */

/** Light → deep sequence used for ordered marks, without a quality claim. */
export const RAMP = ['#B08D45', '#8A6A31', '#61441E', '#3D2913', '#1F1408'];

export const SURFACE = '#FFFFFF';
export const CANVAS = '#FAF9F7';

/**
 * Warm ink scale. Contrast on canvas: 15.3 / 8.95 / 4.90 — the third step is
 * still AA for body text, so no label on this page is decorative grey.
 */
export const INK = '#2A1F14';
export const INK_2 = '#55432F';
export const INK_3 = '#7E6A52';

export const RULE = 'rgba(42,31,20,0.20)';
export const RULE_SOFT = 'rgba(42,31,20,0.11)';
/** Inactive track behind a bar — the unspent part of the scale. */
export const TRACK = 'rgba(42,31,20,0.09)';

/** Prior period, baselines — everything that is context rather than subject. */
export const CONTEXT = '#8A7660';
/** Past the line. 6.23:1 on canvas, always paired with a word. */
export const ATTENTION = '#A33B21';
/** Confirmation. Used only where the answer is unambiguously good. */
export const AFFIRM = '#7A5C29';

/** Submission stages, light → deep as a submission travels. */
export const STAGE_INK = {
  sent: RAMP[0],
  opened: RAMP[1],
  advanced: RAMP[2],
  settled: RAMP[4],
};

/** Viewer source categories. Color distinguishes provenance, not quality. */
export const VIEWER_INK = {
  agency: RAMP[4],
  shared: RAMP[2],
  public: RAMP[0],
};

export const VIEWER_LABEL = {
  agency: 'Agency',
  shared: 'Shared link',
  public: 'Public',
};

/** Materials currency. `stale` is the only use of the reserved ember. */
export const CURRENCY_INK = {
  current: RAMP[1],
  aging: RAMP[2],
  stale: ATTENTION,
  missing: CONTEXT,
};

/** Read-clock states for an open submission. */
export const CLOCK_INK = {
  read: RAMP[4],
  normal: RAMP[1],
  late: RAMP[2],
  cold: ATTENTION,
};

export const CLOCK_LABEL = {
  read: 'Read',
  normal: 'Within the usual window',
  late: 'Past the usual window',
  cold: 'Long past — treat as closed',
};

// ---------------------------------------------------------------- formatters

export function pct(value, { sign = false } = {}) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const n = Math.round(Number(value) * 100);
  return `${sign && n > 0 ? '+' : ''}${n}%`;
}

export function plural(n, one, many) {
  return Number(n) === 1 ? one : many || `${one}s`;
}

export function days(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const v = Math.round(Number(n));
  return `${v} ${plural(v, 'day')}`;
}

export function shortDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function weekdayDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function dowName(dow) {
  return DOW[dow] ?? '';
}

/** "2–5pm" from a 24h block, in the reader's own zone (server bucketed it). */
export function hourRange(startHour, endHour) {
  const fmt = (h) => {
    const n = Number(h) % 24;
    if (n === 0) return '12am';
    if (n === 12) return 'noon';
    return n < 12 ? `${n}am` : `${n - 12}pm`;
  };
  return `${fmt(startHour)}–${fmt(endHour)}`;
}

const SOURCE_LABELS = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  twitter: 'X',
  search: 'Search',
  direct: 'Direct',
  share_link: 'Shared link',
  card_link: 'Card scan',
  agency: 'Agency',
};

export function sourceLabelFor(source) {
  if (SOURCE_LABELS[source]) return SOURCE_LABELS[source];
  const s = String(source ?? '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export const SPRING = { type: 'spring', stiffness: 55, damping: 16 };
export const EASE = [0.22, 1, 0.36, 1];
