import React from 'react';
import { Figure } from './Figure';
import { scoreFigure, SCORE_TIER_LABELS } from './metaFormat';
import './meta-system.css';

/**
 * MatchFigure — a fit score against a board.
 *
 * There were two components for this (`MatchScore`, `MatchMeasure`) plus a
 * raw `${score} / 100` string in the record panels, with three different tier
 * thresholds between them. This is the one readout; tiers come from
 * `scoreTier` so the bands cannot drift again.
 *
 * A score is a FIGURE, so it gets no container. The previous `MatchScore`
 * rendered a tinted rounded chip pinned to the corner of a talent card,
 * which is the "tiny metadata chip on a card corner" pattern the system
 * bans by name.
 *
 * The tier label is what carries the meaning for anyone who cannot use the
 * colour — it is on the accessible name in every variant.
 *
 * @param {number} score  0–100. Anything unparseable renders nothing.
 * @param {boolean} [showTier] Print the tier under the figure.
 */
export function MatchFigure({ score, size = 'md', showTier = false, className = '', ...rest }) {
  const f = scoreFigure(score);
  if (!f) return null;

  return (
    <Figure
      label="Match"
      value={f.value}
      verdict={showTier ? SCORE_TIER_LABELS[f.tier] : null}
      size={size}
      tone={f.tier}
      className={className}
      role="img"
      aria-label={`Match ${f.value} out of 100 — ${SCORE_TIER_LABELS[f.tier]}`}
      {...rest}
    />
  );
}

export default MatchFigure;
