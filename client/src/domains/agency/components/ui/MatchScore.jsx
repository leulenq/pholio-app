import { normalizeScore, resolveTier } from '../../lib/matchTier';
import './MatchScore.css';

/**
 * MatchScore — plain inline match score for agency scanning.
 *
 * tone="light"   (default): numeral only, for cards and rows on cream/white
 * Scores are never rendered as a badge, chip, or gradient-text ornament.
 */
export default function MatchScore({
  score = 0,
  tone = 'light',
  size = 'md',
  className = '',
}) {
  const normalized = normalizeScore(score);
  const strength = resolveTier(normalized);

  return (
    <span
      className={[
        'match-score',
        `match-score--${tone}`,
        `match-score--${size}`,
        `match-score--${strength}`,
        className,
      ].filter(Boolean).join(' ')}
      aria-label={`${normalized} match score`}
    >
      {normalized}
    </span>
  );
}
