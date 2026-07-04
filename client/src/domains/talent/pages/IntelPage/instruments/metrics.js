/**
 * Shared, component-free constants and formatters for the Intel instruments.
 * Kept separate from parts.jsx (which exports React components) so fast-refresh
 * boundaries stay clean — components in one module, values in another.
 */

export const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

/**
 * Signal-tier ramp — an ordinal sequential scale, deep→pale, so Tier 1 (a
 * booker reviewed you) reads as the heaviest ink and Tier 5 (raw reach) as the
 * lightest. Monotonic in lightness, which keeps it legible under colour-vision
 * deficiency without relying on hue alone.
 */
export const TIER_RAMP = ['#3D2E14', '#6B4F2A', '#97753C', '#C9A55A', '#E0CFA8'];

export const TIER_META = [
  { tier: 1, key: 'reviews', label: 'Reviewed', hint: 'A booker reviewed your submission' },
  { tier: 2, key: 'advances', label: 'Advanced', hint: 'A submission moved forward' },
  { tier: 3, key: 'pulls', label: 'Pulled', hint: 'Your card was pulled or a link opened' },
  { tier: 4, key: 'qualified', label: 'Qualified', hint: 'A real visit — dwell, referral, images viewed' },
  { tier: 5, key: 'reach', label: 'Reach', hint: 'Passing traffic and social taps' },
];

export function nf(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US');
}

export function pct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}
