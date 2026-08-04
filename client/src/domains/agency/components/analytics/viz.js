/**
 * Season analytics — chart palette and shared chart math.
 *
 * The palette is the agency design system's own material (cream surface, one
 * editorial gold) resolved into data-visualisation roles, then validated with
 * the dataviz six checks against the white panel surface these charts render on:
 *
 *   depth ordinal ramp  #C9A55A → #B0873F → #8E6B31 → #5F4623
 *       monotone lightness, adjacent ΔL ≥ 0.06, light end 2.33:1, hue spread 10°.
 *       Encodes pipeline depth, which is an ordered quantity — so the reader
 *       sees the order in the colour rather than having to learn a key.
 *   exit neutral        #948C82 (3.32:1)
 *       Passed is an exit lane, not a rung on the ramp, so it sits outside the
 *       hue. In stacks it is only ever adjacent to the darkest ramp step
 *       (ΔE 23.5 normal / 23.2 CVD); beside #C9A55A that pair measures 12.8,
 *       under the 15 floor, so the stack order below is load-bearing.
 *   heat sequential     #F7EFDF → … → #5C441F
 *       Magnitude only (punchcard, cohort grid). The light end recedes toward
 *       the surface by design — that is the sequential contract, not the
 *       ordinal one.
 *   series pair         #A8803A bronze ↔ #3B6FA8 slate
 *       Two-series comparisons (roster vs incoming). All-pairs PASS:
 *       CVD ΔE 19.7, normal-vision 22.6, both ≥ 3:1. Also the diverging pair.
 *
 * #C9A55A sits at 2.33:1, below the 3:1 mark floor, so the relief rule applies:
 * every panel ships direct labels and a table view. Do not add a ninth colour —
 * fold to "Other" or facet instead.
 */

export const VIZ = {
  surface: '#FFFFFF',
  plane: '#F7F3EC',
  ink: '#1A1815',
  inkSecondary: '#6B6560',
  inkMuted: '#8A837B',
  grid: '#EDE9E1',
  axis: '#D8D2C8',

  /** Pipeline depth, light (just arrived) → dark (signed). */
  depth: ['#C9A55A', '#B0873F', '#8E6B31', '#5F4623'],
  exit: '#948C82',
  /** Distinct closed outcomes; direct labels and table twins remain required. */
  keptOnFile: '#3B6FA8',
  withdrawn: '#756378',

  /** Magnitude ramp for heat surfaces (sequential — the light end may recede). */
  heat: ['#F7EFDF', '#E9D5AC', '#D9BE88', '#C9A55A', '#AC8440', '#86642E', '#5C441F'],

  /**
   * Five-step ordinal ramp for discrete ordered bands (latency, tenure).
   * Validated with `--ordinal`: monotone L, adjacent ΔL ≥ 0.06, light end
   * 2.33:1, hue spread 9°. Unlike `heat` every step clears the 2:1 floor,
   * because these are marks a reader has to identify, not a magnitude wash.
   */
  ordinal: ['#C9A55A', '#B0873F', '#8E6B31', '#74562A', '#4E3A1D'],

  /** The only two identity slots this surface uses. */
  series: ['#A8803A', '#3B6FA8'],

  status: {
    good: '#2D8A56',
    warning: '#C2850E',
    critical: '#C0392B',
  },
};

export const STAGE_COLOR = {
  Applied: VIZ.depth[0],
  Shortlisted: VIZ.depth[1],
  Offered: VIZ.depth[2],
  Represented: VIZ.depth[3],
  Passed: VIZ.exit,
};

/**
 * Stack order for the volume chart, bottom → top. Passed sits at the bottom so
 * it only ever touches the darkest depth step; putting it beside Applied would
 * drop the adjacent pair under the normal-vision floor.
 */
export const VOLUME_STACK = [
  { key: 'withdrawn', label: 'Withdrawn', color: VIZ.withdrawn },
  { key: 'keptOnFile', label: 'Kept on file', color: VIZ.keptOnFile },
  { key: 'passed', label: 'Passed', color: VIZ.exit },
  { key: 'signed', label: 'Signed', color: VIZ.depth[3] },
  { key: 'offered', label: 'Offered', color: VIZ.depth[2] },
  { key: 'shortlisted', label: 'Shortlisted', color: VIZ.depth[1] },
  { key: 'applied', label: 'Still applied', color: VIZ.depth[0] },
];

/** 2px of surface is what separates touching marks — never a stroke. */
export const SURFACE_GAP = 2;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function compact(value) {
  if (value == null || Number.isNaN(value)) return '—';
  const n = Number(value);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}K`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${Math.round(n * 10) / 10}`;
}

export function formatValue(value, unit) {
  if (value == null || Number.isNaN(value)) return '—';
  if (unit === 'percent') return `${Math.round(value)}%`;
  if (unit === 'hours') return value < 1 ? `${Math.round(value * 60)}m` : `${Math.round(value * 10) / 10}h`;
  if (unit === 'days') return `${Math.round(value * 10) / 10}d`;
  return compact(value);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatBucket(key, granularity) {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  if (granularity === 'month') return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
  return `${MONTHS[m - 1]} ${d}`;
}

export function formatMonth(key) {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

export const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function formatHour(hour) {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}

/** Human label for a raw enum coming off the database. */
export function humanize(value) {
  if (!value) return 'Unspecified';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Scale helpers
// ---------------------------------------------------------------------------

/**
 * An axis top plus its ticks, chosen so the labels are clean numbers.
 *
 * Picking a nice *maximum* and then dividing it by the tick count is what
 * produces axes labelled 0 / 3 / 5 / 8 / 10 — the step is chosen first, and for
 * count data it is forced to a whole number so no tick ever reads "2.5 people".
 */
export function axisScale(rawMax, { count = 4, integer = true } = {}) {
  const target = Math.max(integer ? 1 : Number.EPSILON, rawMax || 0);
  const rough = target / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough || 1));
  const candidates = [1, 2, 2.5, 5, 10].map((c) => c * magnitude);
  let step =
    candidates.find((c) => c * count >= target) || candidates[candidates.length - 1];
  if (integer) {
    step = Math.max(1, Math.ceil(step));
    while (step * count < target) step += 1;
  }
  const max = step * count;
  return {
    max,
    ticks: Array.from({ length: count + 1 }, (_, i) => i * step),
  };
}

/** Index into the heat ramp for a 0..1 intensity. */
export function heatStep(intensity) {
  if (!intensity) return VIZ.heat[0];
  const index = Math.min(
    VIZ.heat.length - 1,
    Math.max(0, Math.round(intensity * (VIZ.heat.length - 1))),
  );
  return VIZ.heat[index];
}

/** Ink that clears contrast against a heat cell it sits inside. */
export function inkOn(fill) {
  const index = VIZ.heat.indexOf(fill);
  return index >= 4 ? '#FFFFFF' : VIZ.ink;
}
