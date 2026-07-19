import { normalizeScore, resolveTier, MATCH_TIER_LABELS } from '../../lib/matchTier';
import './MatchMeasure.css';

/**
 * MatchMeasure — match strength as typography (the ledger expression).
 *
 * A tabular numeral over a 2px rule filled to the score, in the warm agency
 * palette: gold marks exceptional, ink strong, muted grays fair/low. Same
 * tiers as the ink-chip MatchScore (via matchTier) but flat and data-native —
 * built for dense Submissions surfaces where forty dark chips would shout.
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
      <span className="match-measure__num" aria-hidden="true">{normalized}</span>
      <span className="match-measure__track" aria-hidden="true">
        <span className="match-measure__fill" style={{ width: `${normalized}%` }} />
      </span>
    </span>
  );
}
