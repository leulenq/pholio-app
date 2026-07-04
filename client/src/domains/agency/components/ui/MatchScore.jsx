import { normalizeScore, resolveTier } from '../../lib/matchTier';
import './MatchScore.css';

/**
 * MatchScore — editorial serif numeral, gradient fill.
 *
 * tone="light"   (default): numeral only, for cards and rows on cream/white
 * tone="overlay": numeral inside a dark semi-transparent mount, for photo contexts
 * tone="dark":   same as overlay — numeral shifts to cream fill on dark panels
 *
 * On overlay/dark, the outer wrapper (.match-score-mount) receives className
 * for layout positioning. On light, className applies to the numeral directly.
 */
export default function MatchScore({
  score = 0,
  tone = 'light',
  size = 'md',
  className = '',
}) {
  const normalized = normalizeScore(score);
  const strength = resolveTier(normalized);

  const numeral = (
    <span
      className={[
        'match-score',
        `match-score--${tone}`,
        `match-score--${size}`,
        `match-score--${strength}`,
      ].filter(Boolean).join(' ')}
      aria-label={`${normalized} match score`}
    >
      {normalized}
    </span>
  );

  if (tone === 'overlay' || tone === 'dark') {
    return (
      <span className={['match-score-mount', className].filter(Boolean).join(' ')}>
        {numeral}
      </span>
    );
  }

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
