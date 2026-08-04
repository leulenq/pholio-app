import React from 'react';
import { recency, calendarDate, clockTime, freshness } from './metaFormat';
import './meta-system.css';

/**
 * Moment — when something happened.
 *
 * Renders a real <time> element carrying the machine-readable timestamp, and
 * puts the full absolute date on the title attribute. "6d ago" is the right
 * thing to scan and the wrong thing to plan against; both should be
 * reachable without a round trip to the record.
 *
 * @param {string|Date} value
 * @param {'relative'|'date'|'time'} [as]
 * @param {string} [prefix]  "Due", "Updated" — set in the same quiet ink.
 * @param {'sm'|'md'} [size]
 * @param {boolean} [onDark] Lighten for dark grounds.
 */
export function Moment({
  value,
  as = 'relative',
  prefix,
  size = 'md',
  onDark = false,
  className = '',
  ...rest
}) {
  const r = recency(value);
  if (!r) return null;

  const label =
    as === 'date' ? calendarDate(value) : as === 'time' ? clockTime(value) : r.label;
  if (!label) return null;

  const classes = ['mm', size !== 'md' && `mm--${size}`, onDark && 'meta--onDark', className]
    .filter(Boolean)
    .join(' ');

  return (
    <time className={classes} dateTime={r.iso} title={r.title} {...rest}>
      {prefix && <span className="mm__prefix">{prefix} </span>}
      {label}
    </time>
  );
}

/**
 * Freshness — recency that a booker has to ACT on.
 *
 * Distinct from Moment because stale measurements are a task, not a
 * timestamp. Tone maps to text colour only: never a badge, never a dot, and
 * the tone is always paired with words so meaning is never carried by colour
 * alone.
 */
export function Freshness({ value, size = 'md', className = '', ...rest }) {
  const f = freshness(value);
  const r = recency(value);
  const classes = ['mm', 'mm--tone', `mm--${f.tone}`, size !== 'md' && `mm--${size}`, className]
    .filter(Boolean)
    .join(' ');

  if (!r) {
    return (
      <span className={classes} {...rest}>
        {f.label}
      </span>
    );
  }
  return (
    <time className={classes} dateTime={r.iso} title={r.title} {...rest}>
      {f.label}
    </time>
  );
}

export default Moment;
