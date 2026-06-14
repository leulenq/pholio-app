// Shared match-score numeric helpers (kept out of the component file for
// react-refresh: component modules must only export components).

export function normalizeScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

// One tier scale everywhere a match score appears: high ≥90, mid ≥75, low <75.
export function resolveTier(score) {
  const normalized = normalizeScore(score);
  return normalized >= 90 ? 'high' : normalized >= 75 ? 'mid' : 'low';
}
