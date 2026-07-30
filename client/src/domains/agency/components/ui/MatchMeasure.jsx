import { normalizeScore, resolveTier, MATCH_TIER_LABELS } from '../../lib/matchTier';
import './MatchMeasure.css';

/**
 * MatchMeasure — match strength as an editorial grade notation ("the Hallmark").
 *
 * A tabular numeral ruled beneath by a hairline, with the tier set as a micro
 * caption below — the score read as a struck grade rather than a bare figure.
 * The tier accent is carried by the numeral's own underline (gold only at the
 * exceptional tier); a low score recedes toward muted ink. One ink-and-gold
 * voice, calm enough to repeat forty times across the Submissions ledger.
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
      <span className="match-measure__num">{normalized}</span>
      <span className="match-measure__tier">{MATCH_TIER_LABELS[tier]}</span>
    </span>
  );
}
