import React, { useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useReveal } from './useReveal';
import { Check, Circle, ArrowRight } from 'lucide-react';
import { SPRING } from './metrics';
import './AgencyLens.css';

/**
 * Zone 6 — The Agency Lens. The talent's profile read through a booker's
 * eyes: what's current, what a booker scans for, and the ranked moves that
 * would change the read fastest. This is the improvement engine — the most
 * actionable zone on the page.
 *
 * Materials currency is drawn as horizontal runway bars, not radial gauges:
 * a linear scale reads "how much life is left" at a glance and lets the three
 * materials be compared against each other on one axis, which three separate
 * rings (each on its own window) cannot.
 */

const STATE_COLOR = {
  current: '#C9A55A',
  aging: '#C08A3E',
  stale: '#9B7B62',
  missing: '#C4BEB4',
};

function ageLine(ring) {
  if (ring.state === 'missing') {
    if (ring.key === 'digitals') return 'Not on file';
    if (ring.key === 'measurements') return 'Not confirmed';
    return 'Not generated';
  }
  if (ring.key === 'card' && ring.state === 'stale') return 'Book changed since';
  const days = Number(ring.ageDays) || 0;
  if (ring.windowDays && days >= 14) {
    const weeks = Math.round(days / 7);
    return `${weeks} wk${weeks === 1 ? '' : 's'} old`;
  }
  if (days <= 0) return 'Current';
  return `${days} day${days === 1 ? '' : 's'} old`;
}

function windowLine(ring) {
  if (ring.key === 'digitals') return '12-week window';
  if (ring.key === 'measurements') return '90-day window';
  return 'Set by your latest frames';
}

function CurrencyBar({ ring, index, inView, reduce }) {
  const remaining = Math.max(0, Math.min(1, Number(ring.remaining) || 0));
  const color = STATE_COLOR[ring.state] || STATE_COLOR.missing;
  const spent = ring.state === 'aging' || ring.state === 'stale' || ring.state === 'missing';

  return (
    <motion.div
      className={`lens-bar lens-bar--${ring.state}`}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ ...SPRING, delay: reduce ? 0 : index * 0.07 }}
    >
      <div className="lens-bar__head">
        <span className="lens-bar__label">{ring.label}</span>
        <span className="lens-bar__age" style={{ color }}>
          {ageLine(ring)}
        </span>
      </div>
      <div
        className={`lens-bar__track${spent ? ' is-spent' : ''}`}
        role="img"
        aria-label={`${ring.label}: ${ageLine(ring)}, ${windowLine(ring)}`}
      >
        <motion.span
          className="lens-bar__fill"
          style={{ background: color }}
          initial={reduce ? false : { transform: 'scaleX(0)' }}
          animate={inView ? { transform: `scaleX(${Math.max(remaining, spent ? 0.06 : remaining)})` } : undefined}
          transition={{ ...SPRING, delay: reduce ? 0 : index * 0.07 + 0.1 }}
        />
      </div>
      <span className="lens-bar__window">{windowLine(ring)}</span>
    </motion.div>
  );
}

function CurrencyBars({ rings }) {
  const ref = useRef(null);
  const inView = useReveal();
  const reduce = useReducedMotion();
  const list = rings || [];

  return (
    <div className="lens-bars" ref={ref}>
      <p className="lens-bars__title">How current your materials are</p>
      <div className="lens-bars__rows">
        {list.map((ring, i) => (
          <CurrencyBar key={ring.key} ring={ring} index={i} inView={inView} reduce={reduce} />
        ))}
      </div>
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
  const inView = useReveal();
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
  const inView = useReveal();
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
      <CurrencyBars rings={lens?.rings} />
      <div className="lens-lower">
        <RangeRead range={lens?.range} />
        <NextMoves nextMoves={lens?.nextMoves} />
      </div>
    </div>
  );
}
