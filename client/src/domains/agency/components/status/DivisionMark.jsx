import React from 'react';
import { resolveDivision, resolveStanding } from './divisions';
import './division-marks.css';

/**
 * DivisionMark — the board stamp.
 *
 * Renders one division (board) and, optionally, the talent's standing on it.
 * Pigment says *which board*; ink weight says *what standing*. Colour never
 * encodes quality, so the mark stays clear of the banned green/yellow/red
 * status-badge pattern and remains readable in greyscale.
 *
 * Accepts agency-authored board names as well as canonical keys — an
 * unrecognised name still renders, with a derived shorthand and a stable
 * pigment, rather than disappearing.
 *
 * @param {string}  division   Board key or free-text board name ("Editorial", "NY Women").
 * @param {string}  [standing] Talent's standing: represented | active | developing |
 *                             shortlisted | onfile | inactive | passed. Default 'active'.
 * @param {string}  [label]    Override the resolved board name.
 * @param {number}  [count]    Secondary figure shown in the name field (head-counts).
 * @param {'sm'|'md'|'lg'} [size]
 * @param {boolean} [codeOnly] Render the shorthand cell alone, for dense columns.
 * @param {boolean} [onDark]   Lighten pigments for dark grounds (drawer hero, photo scrims).
 * @param {Function}[onClick]  Makes the mark an interactive filter (renders a <button>).
 * @param {boolean} [pressed]  Filter selection state; sets aria-pressed.
 */
export function DivisionMark({
  division,
  standing = 'active',
  label,
  count,
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
    'dv-mark',
    `dv-mark--${s.ink}`,
    size !== 'md' && `dv-mark--${size}`,
    codeOnly && 'dv-mark--code',
    onDark && 'dv-mark--onDark',
    onClick && 'dv-mark--action',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const style = { '--p': `var(--ss-p-${d.pigment})` };
  const description = `${name} — ${s.label}`;

  const body = (
    <>
      {/* Shorthand is a visual aid; the accessible name carries the words. */}
      <span className="dv-mark__code" aria-hidden="true">
        {d.code}
      </span>
      {!codeOnly && (
        <span className="dv-mark__label">
          {name}
          {count != null && <span className="dv-mark__meta">{count}</span>}
        </span>
      )}
    </>
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
      {/* Standing is conveyed visually by fill and stroke — it must also be words. */}
      <span className="dv-sr">{codeOnly ? description : s.label}</span>
    </span>
  );
}

export default DivisionMark;
