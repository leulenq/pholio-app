import { normalizeScore, resolveTier, MATCH_TIER_LABELS } from '../../lib/matchTier';
import './MatchMeasure.css';

/**
 * MatchMeasure — match strength as typography (the ledger expression).
 *
 * A bold tabular numeral whose color carries the tier — the same four-tier
 * hue system as the ink-chip MatchScore (via matchTier), expressed flat for
 * dense Submissions surfaces where forty dark chips would shout.
 */
export default function MatchMeasure({ score = 0, size = 'md', className = '' }) {
  const normalized = normalizeScore(score);
  const tier = resolveTier(normalized);

  const classes = [
    'match-measure',
    `match-measure--${size}`,
    `match-measure--${tier}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={classes} aria-label={`${normalized} match score, ${MATCH_TIER_LABELS[tier]}`}>
      {normalized}
    </span>
  );
}
