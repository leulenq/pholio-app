import React, { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Check, Circle, ArrowRight } from 'lucide-react';
import { SPRING } from './parts';
import './AgencyLens.css';

/**
 * Zone 6 — The Agency Lens. The talent's profile read through a booker's
 * eyes: what's current, what a booker scans for, and the ranked moves that
 * would change the read fastest. This is the improvement engine — the most
 * actionable zone on the page. No completeness bars, no generic tips: a
 * depleting ring for currency, a plain range check, and a short ranked list
 * of moves that replace them.
 */

const RING_SIZE = 132;
const RING_STROKE = 9;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

const STATE_COLOR = {
  current: '#C9A55A',
  aging: '#C08A3E',
  stale: '#B8B2A8',
  missing: '#D8D3CA',
};

function ageLine(ring) {
  if (ring.state === 'missing') {
    if (ring.key === 'digitals') return 'No digitals yet';
    if (ring.key === 'measurements') return 'No measurements on file';
    return 'No comp card yet';
  }
  if (ring.key === 'card' && ring.state === 'stale') {
    return 'Book changed since';
  }
  const days = Number(ring.ageDays) || 0;
  if (ring.windowDays && days >= 14) {
    const weeks = Math.round(days / 7);
    return `${weeks} week${weeks === 1 ? '' : 's'} old`;
  }
  if (days <= 0) return 'Generated today';
  return `${days} day${days === 1 ? '' : 's'} old`;
}

function CurrencyRing({ ring, index, inView, reduce }) {
  const remaining = Math.max(0, Math.min(1, Number(ring.remaining) || 0));
  const color = STATE_COLOR[ring.state] || STATE_COLOR.missing;
  const dashTarget = RING_C * (1 - remaining);

  return (
    <motion.div
      className={`lens-ring lens-ring--${ring.state}`}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ ...SPRING, delay: reduce ? 0 : index * 0.08 }}
    >
      <svg
        className="lens-ring__svg"
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        role="img"
        aria-label={`${ring.label}: ${ageLine(ring)}`}
      >
        <circle
          className="lens-ring__track"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_R}
          strokeWidth={RING_STROKE}
        />
        <motion.circle
          className="lens-ring__fill"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_R}
          strokeWidth={RING_STROKE}
          stroke={color}
          strokeDasharray={RING_C}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          initial={reduce ? false : { strokeDashoffset: RING_C }}
          animate={inView ? { strokeDashoffset: dashTarget } : undefined}
          transition={{ ...SPRING, delay: reduce ? 0 : index * 0.08 + 0.1 }}
        />
      </svg>
      <div className="lens-ring__center">
        <span className="lens-ring__label">{ring.label}</span>
        <span className="lens-ring__age">{ageLine(ring)}</span>
      </div>
    </motion.div>
  );
}

function CurrencyRings({ rings }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduce = useReducedMotion();
  const list = rings || [];

  return (
    <div className="lens-rings" ref={ref}>
      <div className="lens-rings__row">
        {list.map((ring, i) => (
          <CurrencyRing key={ring.key} ring={ring} index={i} inView={inView} reduce={reduce} />
        ))}
      </div>
      <p className="lens-rings__legend">
        Digitals ≤ 12 weeks · Stats ≤ 90 days · Card current with your latest frames.
      </p>
    </div>
  );
}

const RANGE_REASON =
  'A booker scans for a clean headshot, a full length and a profile before anything else — a gap reads as an unfinished book.';

function RangeRow({ item, index, inView, reduce }) {
  return (
    <motion.li
      className={`lens-range__row${item.present ? ' is-present' : ' is-missing'}`}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ ...SPRING, delay: reduce ? 0 : index * 0.05 }}
    >
      <span className="lens-range__mark" aria-hidden>
        {item.present ? <Check size={15} strokeWidth={2.5} /> : <Circle size={13} strokeWidth={2} />}
      </span>
      <div className="lens-range__body">
        <span className="lens-range__label">{item.label}</span>
        {!item.present ? <p className="lens-range__reason">{RANGE_REASON}</p> : null}
      </div>
    </motion.li>
  );
}

function RangeRead({ range }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduce = useReducedMotion();
  const rows = range || [];

  return (
    <div className="lens-range" ref={ref}>
      <p className="lens-range__title">What a booker scans for</p>
      <ul className="lens-range__list">
        {rows.map((item, i) => (
          <RangeRow key={item.key} item={item} index={i} inView={inView} reduce={reduce} />
        ))}
      </ul>
    </div>
  );
}

function MoveCard({ move, index, inView, reduce }) {
  return (
    <motion.div
      className="lens-move"
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ ...SPRING, delay: reduce ? 0 : index * 0.08 }}
      whileHover={reduce ? undefined : { y: -4, boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
    >
      <span className="lens-move__rank">{index + 1}</span>
      <div className="lens-move__body">
        <p className="lens-move__observation">{move.observation}</p>
        <p className="lens-move__reason">{move.reason}</p>
        <a className="lens-move__action" href={move.to}>
          {move.action}
          <ArrowRight size={14} strokeWidth={2.5} />
        </a>
      </div>
    </motion.div>
  );
}

function NextMoves({ nextMoves }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduce = useReducedMotion();
  const moves = (nextMoves || []).slice(0, 3);

  if (moves.length === 0) {
    return (
      <div className="lens-moves lens-moves--clear" ref={ref}>
        <p className="lens-moves__title">Next moves</p>
        <motion.p
          className="lens-clear"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={SPRING}
        >
          Nothing to fix. Your materials are current and your book covers the range a booker
          scans for — submit while they&apos;re fresh.{' '}
          <a className="lens-clear__link" href="/dashboard/talent/applications">
            Go to submissions
            <ArrowRight size={14} strokeWidth={2.5} />
          </a>
        </motion.p>
      </div>
    );
  }

  return (
    <div className="lens-moves" ref={ref}>
      <p className="lens-moves__title">Next moves</p>
      <div className="lens-moves__list">
        {moves.map((move, i) => (
          <MoveCard key={move.key} move={move} index={i} inView={inView} reduce={reduce} />
        ))}
      </div>
    </div>
  );
}

export default function AgencyLens({ lens }) {
  return (
    <div className="lens">
      <CurrencyRings rings={lens?.rings} />
      <div className="lens-lower">
        <RangeRead range={lens?.range} />
        <NextMoves nextMoves={lens?.nextMoves} />
      </div>
    </div>
  );
}
