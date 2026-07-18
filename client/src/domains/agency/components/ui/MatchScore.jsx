import { normalizeScore, resolveTier, MATCH_TIER_LABELS } from '../../lib/matchTier';
import './MatchScore.css';

/**
 * MatchScore — match strength as a status chip (the "ink chip").
 *
 * A constant dark chip carries contrast on any surface or photo; the number's
 * color carries strength (exceptional / strong / fair / low). The chip is the
 * same on cream, dark chrome, and over imagery — `tone` and `size` only tune
 * scale and spacing.
 */
export default function MatchScore({
  score = 0,
  tone = 'light',
  size = 'md',
  className = '',
}) {
  const normalized = normalizeScore(score);
  const tier = resolveTier(normalized);

  const classes = [
    'match-score',
    `match-score--${tone}`,
    `match-score--${size}`,
    `match-score--${tier}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <span
      className={classes}
      aria-label={`${normalized} match score, ${MATCH_TIER_LABELS[tier]}`}
    >
      <span className="match-score__label">Match</span>
      <span className="match-score__num">{normalized}</span>
    </span>
  );
}
