import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import { SPRING, RING_STATE_COLOR } from './intelUtils';

const RING_R = 34;
const RING_C = 2 * Math.PI * RING_R;

function ringCaption(ring) {
  if (ring.key === 'card') {
    if (ring.state === 'missing') return 'none yet';
    if (ring.state === 'stale') return 'book changed since';
    return 'matches your book';
  }
  if (ring.ageDays == null) {
    return ring.key === 'measurements' ? 'not confirmed' : 'none yet';
  }
  const weeks = Math.round(ring.ageDays / 7);
  const window = ring.windowDays ? `${Math.round(ring.windowDays / 7)} wk window` : '';
  return `${weeks} wks · ${window}`.trim().replace(/·\s*$/, '');
}

function CurrencyRing({ ring, index }) {
  const reduce = useReducedMotion();
  const remaining = Math.min(1, Math.max(0, Number(ring.remaining) || 0));
  const color = RING_STATE_COLOR[ring.state] || RING_STATE_COLOR.stale;
  const target = RING_C * (1 - remaining);

  return (
    <div className={`intel2-ring intel2-ring--${ring.state}`}>
      <svg viewBox="0 0 88 88" className="intel2-ring-svg" role="img"
        aria-label={`${ring.label}: ${ring.state}`}>
        <circle cx="44" cy="44" r={RING_R} fill="none" stroke="rgba(26,24,21,0.08)" strokeWidth="5" />
        <motion.circle
          cx="44" cy="44" r={RING_R} fill="none"
          stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={RING_C}
          transform="rotate(-90 44 44)"
          initial={{ strokeDashoffset: reduce ? target : RING_C }}
          whileInView={{ strokeDashoffset: target }}
          viewport={{ once: true, margin: '-40px' }}
          transition={reduce ? { duration: 0 } : { ...SPRING, delay: index * 0.12 }}
        />
        <text x="44" y="42" textAnchor="middle" className="intel2-ring-num">
          {ring.ageDays == null ? '—' : `${ring.ageDays}d`}
        </text>
        <text x="44" y="56" textAnchor="middle" className="intel2-ring-state">
          {ring.state}
        </text>
      </svg>
      <span className="intel2-ring-label">{ring.label}</span>
      <span className="intel2-ring-caption">{ringCaption(ring)}</span>
    </div>
  );
}

const RANGE_REASON = {
  headshot: 'The first thing a booker scans for — a clean, current headshot.',
  full_length: 'Bookers check proportions before anything else — one honest full length.',
  profile: 'Casting reads bone structure from the side — a left or right profile.',
};

function RangeRead({ range }) {
  const rows = Array.isArray(range) ? range : [];
  if (rows.length === 0) return null;
  return (
    <div className="intel2-range">
      <h3 className="intel2-subhead">What a booker scans for</h3>
      <ul className="intel2-range-list">
        {rows.map((row) => (
          <li key={row.key} className={`intel2-range-row${row.present ? ' is-present' : ''}`}>
            <span className="intel2-range-mark" aria-hidden>
              {row.present ? <Check size={13} /> : <span className="intel2-range-gap" />}
            </span>
            <span className="intel2-range-name">{row.label}</span>
            <span className="intel2-range-reason">
              {row.present ? 'In your book.' : RANGE_REASON[row.key] || 'Missing from your book.'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NextMoves({ moves }) {
  const rows = Array.isArray(moves) ? moves : [];
  if (rows.length === 0) {
    return (
      <p className="intel2-moves-clear">
        Nothing to fix. Your materials read as current — use them while they are.
      </p>
    );
  }
  return (
    <div className="intel2-moves">
      <h3 className="intel2-subhead">Next moves</h3>
      <ol className="intel2-moves-list">
        {rows.map((move, i) => (
          <li key={move.key} className="intel2-move">
            <span className="intel2-move-index">{i + 1}</span>
            <div className="intel2-move-body">
              <p className="intel2-move-observation">{move.observation}</p>
              <p className="intel2-move-reason">{move.reason}</p>
              <PholioButton to={move.to} variant="meta" className="intel2-move-action">
                {move.action}
              </PholioButton>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Zone 6 — The Agency Lens. Your profile read through a booker's eyes:
 * depleting Currency Rings timed to real industry windows, the range read,
 * and at most three ranked Next Moves. Replaces completeness bars and
 * horoscope tips.
 */
export default function AgencyLens({ lens }) {
  if (!lens) return null;
  const rings = Array.isArray(lens.rings) ? lens.rings : [];
  return (
    <div className="intel2-lens">
      {rings.length > 0 && (
        <div className="intel2-rings">
          {rings.map((ring, i) => (
            <CurrencyRing key={ring.key} ring={ring} index={i} />
          ))}
        </div>
      )}
      <RangeRead range={lens.range} />
      <NextMoves moves={lens.nextMoves} />
    </div>
  );
}
