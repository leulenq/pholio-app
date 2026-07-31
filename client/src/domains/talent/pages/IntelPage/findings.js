/**
 * Choosing what the answer is.
 *
 * A block's headline must be the most consequential thing that happened, not
 * whichever metric happens to sit in slot one. The momentum block shipped with
 * the opposite: it compared agency reviews only, so a period where intent
 * collapsed 54 → 0 was headlined "Level" — the largest type on the page
 * asserting that nothing changed, while the one alarming number sat in the
 * smallest line beneath it.
 *
 * Candidates are scored by how much they moved, weighted by how much the move
 * matters. A metric going to zero, or off zero, outranks any percentage swing —
 * those are state changes, not fluctuations.
 */

/**
 * A state change (something stopping, or starting) always outranks a swing,
 * however large. Without this, "submissions sent 1 → 6" (a 500% rise) ties with
 * "intent 54 → 0" and wins on list order — which is how the alarming fact ends
 * up unreported.
 */
const TIER_STATE_CHANGE = 2;
const TIER_SWING = 1;
const TIER_DORMANT = 0;

/**
 * @param {Array<{key,label,now,then,weight}>} candidates
 * @returns the winning candidate annotated with `shape`
 */
export function mostConsequential(candidates) {
  const scored = candidates
    .filter((c) => Number.isFinite(c.now) && Number.isFinite(c.then))
    .map((c) => {
      const weight = c.weight ?? 1;

      if (c.then > 0 && c.now === 0) {
        return { ...c, shape: 'collapse', tier: TIER_STATE_CHANGE, score: weight * 1000 + c.then };
      }
      if (c.then === 0 && c.now > 0) {
        return { ...c, shape: 'breakout', tier: TIER_STATE_CHANGE, score: weight * 1000 + c.now };
      }
      if (c.then === 0 && c.now === 0) {
        return { ...c, shape: 'dormant', tier: TIER_DORMANT, score: 0 };
      }

      const rel = Math.abs(c.now - c.then) / Math.max(c.then, 1);
      return {
        ...c,
        shape: c.now === c.then ? 'level' : c.now > c.then ? 'up' : 'down',
        tier: c.now === c.then ? TIER_DORMANT : TIER_SWING,
        score: rel * weight,
      };
    })
    .sort((a, b) => b.tier - a.tier || b.score - a.score);

  return scored[0] ?? null;
}

/** True when every candidate is flat at zero — the block has no story at all. */
export function allDormant(candidates) {
  return candidates.every((c) => (c.now ?? 0) === 0 && (c.then ?? 0) === 0);
}
