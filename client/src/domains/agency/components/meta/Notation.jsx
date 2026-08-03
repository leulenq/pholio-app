import React from 'react';
import './meta-system.css';

/**
 * Notation — quiet context about a record: provenance, an authored note, a
 * caption, an inline aside.
 *
 * The lightest tier in the system. Deliberately has no colour of its own and
 * no container: it sits under the thing it annotates and must never compete
 * with it. Where an agency dashboard goes wrong is treating provenance as
 * decoration — a coloured chip saying "added by Marta" pulls a booker's eye
 * away from the roster it is annotating.
 *
 * `attributed` marks it as authored by a person rather than the system, and
 * sets it in italic — the one place the agency system uses italic, because
 * an authored aside genuinely is a different voice from a machine fact.
 *
 * @param {boolean} [attributed] Authored by a person.
 * @param {'sm'|'md'} [size]
 * @param {boolean} [onDark] Lighten for dark grounds.
 */
export function Notation({
  children,
  attributed = false,
  size = 'md',
  onDark = false,
  className = '',
  ...rest
}) {
  if (children == null || children === '') return null;

  const classes = [
    'mn',
    attributed && 'mn--attributed',
    size !== 'md' && `mn--${size}`,
    onDark && 'meta--onDark',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}

/**
 * FieldKey — the ledger key that labels a value ("Based in", "Nationality").
 *
 * One typographic treatment for every field label on the agency side, so a
 * record panel and a drawer cannot drift into two different label styles.
 */
export function FieldKey({ children, className = '', ...rest }) {
  if (children == null || children === '') return null;
  return (
    <span className={`mk ${className}`.trim()} {...rest}>
      {children}
    </span>
  );
}

export default Notation;
