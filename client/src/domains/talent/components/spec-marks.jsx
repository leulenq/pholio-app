import React from 'react';
import { SLOT_STATE, SLOT_STATE_WORD, slotStateForOutcome } from '../lib/specRegistry';
import styles from './spec-marks.module.css';

/**
 * The three-state mark, shared by the requirements page and the apply preflight
 * panel.
 *
 * Both surfaces answer the same question about the same shot — *is this in my
 * set, is it still needed, or is it not asked for* — so they must answer it in
 * the same glyph and the same three words (ruling R-D). When the panel inside
 * the apply wizard says "Attention" for what the page an hour earlier called
 * "Still needed", the two stop reading as one check and start reading as two
 * opinions.
 *
 * Squares, not dots: a coloured status dot is a banned pattern here, and a
 * filled square reads as a spec sheet rather than a health indicator. The state
 * is carried by fill and stroke — solid ink for what is in the set, a gold
 * outline for the one state that asks the talent to act, a faint hairline for
 * silence — so the "act here" signal is the only thing wearing the accent.
 *
 * The mark never carries information on its own: every place it is used prints
 * the state in words beside it. Colour and shape are the shorthand, not the
 * message (Intel's no-hover-only-information rule).
 */

const STATE_CLASS = {
  [SLOT_STATE.IN_SET]: styles.inSet,
  [SLOT_STATE.NEEDED]: styles.needed,
  [SLOT_STATE.NOT_ASKED]: styles.notAsked,
};

/**
 * @param {string}  [state]    one of `SLOT_STATE`; wins over `outcome`
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
  const resolved = state || slotStateForOutcome(outcome);
  const stateClass = STATE_CLASS[resolved] || STATE_CLASS[SLOT_STATE.NOT_ASKED];
  const described = subject
    ? `${subject} — ${SLOT_STATE_WORD[resolved].toLowerCase()}`
    : null;
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
 * should cost one line of the page and no border of its own — and it reads out
 * the same three words every state uses elsewhere on the surface.
 */
export function SpecMarkLegend({ size = 12, className = '' }) {
  return (
    <p className={`${styles.legend} ${className}`}>
      {[SLOT_STATE.IN_SET, SLOT_STATE.NEEDED, SLOT_STATE.NOT_ASKED].map((state) => (
        <span key={state} className={styles.legendItem}>
          <SpecMark state={state} size={size} />
          {SLOT_STATE_WORD[state]}
        </span>
      ))}
    </p>
  );
}
