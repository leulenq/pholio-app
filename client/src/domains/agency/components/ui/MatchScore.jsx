import { normalizeScore, resolveTier } from '../../lib/matchTier';
import './MatchScore.css';

/**
 * MatchScore — the core match score figure, number-only.
 *
 * The design lives in the numeral itself: a serif figure with a metallic tonal
 * fill and material depth, no container. Strength is read through tone and
 * presence (high = gold + weight + lift; low = muted + recessive), all within
 * one system.
 *
 * @param {number} score   0–100
 * @param {'light'|'dark'|'overlay'} tone  rendering surface (default light)
 * @param {'xs'|'sm'|'md'|'lg'} size       optical size (default md)
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
