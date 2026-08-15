import React from 'react';
import { MATRIX_CELL, OUTCOME } from '../lib/specRegistry';
import styles from './spec-marks.module.css';

/**
 * The three-state mark, shared by the requirements ledger and the apply
 * preflight panel.
 *
 * Both surfaces answer the same question about the same shot — *is this in my
 * set, does someone want it, or is it not asked for* — so they must answer it
 * in the same glyph. When the panel inside the apply wizard uses a different
 * vocabulary from the page the talent studied an hour earlier, the two stop
 * reading as one check and start reading as two opinions.
 *
 * Squares, not dots: a coloured status dot is a banned pattern here, and a
 * filled square reads as a spec sheet rather than a health indicator. The state
 * is carried by fill and stroke — solid ink for covered, a gold outline for the
 * one state that asks the talent to act, a faint hairline for silence — so the
 * "act here" signal is the only thing in the grid wearing the accent.
 */

const STATE_CLASS = {
  [MATRIX_CELL.COVERED]: styles.covered,
  [MATRIX_CELL.WANTED]: styles.wanted,
  [MATRIX_CELL.NOT_ASKED]: styles.notAsked,
};

const STATE_WORD = {
  [MATRIX_CELL.COVERED]: 'in your set',
  [MATRIX_CELL.WANTED]: 'still needed',
  [MATRIX_CELL.NOT_ASKED]: 'not asked for',
};

/**
 * A finding's outcome, as one of the three marks.
 *
 * `unknown` is deliberately the quiet mark rather than the gold one: Pholio
 * could not verify it from the saved profile, which is not the same as the
 * agency asking for something the talent has not shot. Painting it gold would
 * put the "act here" accent on work that may already be done.
 */
function stateForOutcome(outcome) {
  if (outcome === OUTCOME.SATISFIED) return MATRIX_CELL.COVERED;
  if (outcome === OUTCOME.UNKNOWN || outcome === OUTCOME.NOT_APPLICABLE) {
    return MATRIX_CELL.NOT_ASKED;
  }
  return MATRIX_CELL.WANTED;
}

/**
 * @param {string}  [state]    one of `MATRIX_CELL`; wins over `outcome`
 * @param {string}  [outcome]  a `findingDto.outcome`, mapped to a state
 * @param {string}  [subject]  what the mark is about, e.g. a shot name — used
 *                             to compose both the tooltip and the screen-reader
 *                             text so the two can never drift apart
 */
export function SpecMark({
  state,
  outcome,
  size = 14,
  subject,
  label,
  title,
  className = '',
}) {
  const resolved = state || stateForOutcome(outcome);
  const stateClass = STATE_CLASS[resolved] || STATE_CLASS[MATRIX_CELL.NOT_ASKED];
  const described = subject ? `${subject} — ${STATE_WORD[resolved]}` : null;
  const spoken = label || described;

  return (
    <span
      className={`${styles.mark} ${stateClass}${className ? ` ${className}` : ''}`}
      style={{ '--mark-size': `${size}px` }}
      data-mark-state={resolved}
      title={title || described || undefined}
    >
      {spoken ? <span className={styles.srOnly}>{spoken}</span> : null}
    </span>
  );
}

/**
 * One quiet line, not a key card. The legend is only ever read once, so it
 * should cost one line of the page and no border of its own.
 */
export function SpecMarkLegend({ size = 12, className = '' }) {
  const items = [
    { state: MATRIX_CELL.COVERED, text: 'In your set' },
    { state: MATRIX_CELL.WANTED, text: 'Asked for, not yet covered' },
    { state: MATRIX_CELL.NOT_ASKED, text: 'Not asked for' },
  ];

  return (
    <p className={`${styles.legend} ${className}`}>
      {items.map((item) => (
        <span key={item.state} className={styles.legendItem}>
          <SpecMark state={item.state} size={size} />
          {item.text}
        </span>
      ))}
    </p>
  );
}
