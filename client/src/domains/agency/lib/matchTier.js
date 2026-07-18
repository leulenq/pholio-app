// Shared match-score numeric helpers (kept out of the component file for
// react-refresh: component modules must only export components).

export function normalizeScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

// One 4-tier strength spectrum everywhere a match score appears. Each tier
// has a deliberately distinct hue for quick scanning in dense agency views.
// Cut points: exceptional ≥90, strong ≥80, fair ≥70, low <70.
// Adjust here only — every render site resolves through this one function.
export function resolveTier(score) {
  const n = normalizeScore(score);
  if (n >= 90) return 'exceptional';
  if (n >= 80) return 'strong';
  if (n >= 70) return 'fair';
  return 'low';
}

// Human labels for the tiers (aria / tooltips / future copy).
export const MATCH_TIER_LABELS = {
  exceptional: 'Exceptional',
  strong: 'Strong',
  fair: 'Fair',
  low: 'Low',
};
