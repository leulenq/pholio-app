import React from 'react';
import './meta-system.css';

/**
 * Figure — a measured value: height, measurements, age, match, a count.
 *
 * NEVER rendered in a container. A number inside a box reads as a badge,
 * which the agency system bans and which is also simply wrong: a height is
 * a fact about a person, not a state they are in. Only a board — a thing
 * you hold standing in — earns a container, and that is `DivisionMark`.
 *
 * Hierarchy comes from the figure/unit size relationship instead. Figures
 * are mono and tabular so a column of heights aligns on the digit rather
 * than ragging against Inter's proportional numerals.
 *
 * @param {string} [label]  Ledger key above the figure ("Height").
 * @param {string} value    The figure itself. Pre-formatted — use metaFormat.
 * @param {string} [unit]   "cm", "yrs". Set quieter and smaller than value.
 * @param {string} [sub]    Secondary conversion ("5′ 10″") under the figure.
 * @param {string} [verdict] A JUDGEMENT about the value ("Exceptional"). Kept
 *                           out of `sub` deliberately: a unit conversion and a
 *                           verdict are different kinds of statement and must
 *                           not share a typographic slot.
 * @param {'sm'|'md'|'lg'} [size]
 * @param {boolean} [inline] Drop the label/sub block; render one baseline.
 * @param {string} [tone]   Semantic colour for the figure (match tiers).
 * @param {boolean} [onDark] Lighten for dark grounds.
 */
export function Figure({
  label,
  value,
  unit,
  sub,
  verdict,
  size = 'md',
  inline = false,
  tone,
  onDark = false,
  className = '',
  ...rest
}) {
  if (value == null || value === '') return null;

  const classes = [
    'mf',
    `mf--${size}`,
    inline && 'mf--inline',
    tone && `mf--${tone}`,
    onDark && 'meta--onDark',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const figure = (
    <span className="mf__fig">
      <span className="mf__val">{value}</span>
      {unit && <span className="mf__unit">{unit}</span>}
    </span>
  );

  if (inline) {
    return (
      <span className={classes} {...rest}>
        {figure}
      </span>
    );
  }

  return (
    <span className={classes} {...rest}>
      {label && <span className="mf__key">{label}</span>}
      {figure}
      {sub && <span className="mf__sub">{sub}</span>}
      {verdict && <span className="mf__verdict">{verdict}</span>}
    </span>
  );
}

/**
 * FigureGroup — the comp-card band: several figures on one rule.
 *
 * A row of figures needs a shared baseline and consistent gutters, which is
 * exactly what every hand-built comp card got subtly wrong.
 */
export function FigureGroup({ children, size = 'md', className = '', ...rest }) {
  return (
    <div className={`mf-group mf-group--${size} ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

export default Figure;
