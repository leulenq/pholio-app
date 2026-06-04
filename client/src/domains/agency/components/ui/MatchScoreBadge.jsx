import './MatchScoreBadge.css';

function normalizeScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export default function MatchScoreBadge({
  score = 0,
  size = 'sm',
  tone = 'light',
  className = '',
}) {
  const normalized = normalizeScore(score);

  return (
    <span
      className={[
        'match-score-badge',
        `match-score-badge--${size}`,
        `match-score-badge--${tone}`,
        className,
      ].filter(Boolean).join(' ')}
      aria-label={`${normalized} match score`}
    >
      {normalized}
    </span>
  );
}
