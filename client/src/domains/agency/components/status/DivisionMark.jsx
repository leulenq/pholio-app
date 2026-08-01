import React from 'react';
import { resolveDivision, resolveStanding } from './divisions';
import '../../../../styles/division-palette.css';
import './division-marks.css';

/** Past this many characters the wide-tracked settings drop to normal
 *  tracking, so a long agency board name can't blow out a roster row. */
const LONG_NAME = 18;

/**
 * DivisionMark — one board, and the talent's standing on it.
 *
 * The board name is typeset as the thing it is (that is the identifier);
 * the rectangle's ground carries the standing. Colour is a family-level
 * recall aid and is never load-bearing on its own — see divisions.js.
 *
 * Accepts agency-authored board names as well as canonical keys. Unknown
 * names still render, with the agency's own wording preserved.
 *
 * @param {string}  division   Board key or free-text name ("Editorial", "NY Women").
 * @param {string}  [standing] represented | active | developing | shortlisted |
 *                             onfile | inactive | ended | passed. Unrecognised or
 *                             missing values resolve to `unknown` — never to a
 *                             positive claim.
 * @param {string}  [label]    Override the resolved board name.
 * @param {'sm'|'md'|'lg'} [size]
 * @param {boolean} [codeOnly] Shorthand only, for very dense columns.
 * @param {boolean} [onDark]   Lighten for dark grounds (drawer hero, scrims).
 * @param {Function}[onClick]  Makes the mark an interactive filter (a <button>).
 * @param {boolean} [pressed]  Filter selection state; sets aria-pressed.
 */
export function DivisionMark({
  division,
  standing,
  label,
  size = 'md',
  codeOnly = false,
  onDark = false,
  onClick,
  pressed,
  disabled = false,
  className = '',
  ...rest
}) {
  const d = resolveDivision(division);
  const s = resolveStanding(standing);
  const name = label || d.label;

  const classes = [
    'dv',
    `dv--${s.ink}`,
    size !== 'md' && `dv--${size}`,
    name.length > LONG_NAME && 'dv--long',
    onDark && 'dv--onDark',
    onClick && 'dv--action',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const style = { '--p': `var(--dv-${d.pigment})` };
  const description = `${name} — ${s.label}`;

  const body = codeOnly ? (
    <span className="dv__code" aria-hidden="true">
      {d.code}
    </span>
  ) : (
    <span className={`dv__name dvt--${d.set}`}>{name}</span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        style={style}
        onClick={onClick}
        disabled={disabled}
        aria-label={description}
        {...(pressed != null ? { 'aria-pressed': pressed } : {})}
        {...rest}
      >
        {body}
      </button>
    );
  }

  return (
    <span className={classes} style={style} title={description} {...rest}>
      {body}
      {/* The ground conveys standing visually; it must also be words. */}
      <span className="dv-sr">{codeOnly ? description : s.label}</span>
    </span>
  );
}

export default DivisionMark;
