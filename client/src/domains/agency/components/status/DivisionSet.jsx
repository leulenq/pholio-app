import React, { useMemo } from 'react';
import { DivisionMark } from './DivisionMark';
import { byStanding, resolveDivision } from './divisions';
import './division-marks.css';

/**
 * DivisionSet — every board a talent sits on, strongest standing first.
 *
 * A talent is commonly on more than one board, and the boards are not equal:
 * "Represented on Women, shortlisted for Beauty, kept on file for Digital" is
 * one roster row, and the order has to make that readable at a glance.
 *
 * Accepts loose input so callers can pass whatever their endpoint returns:
 *   ['editorial', 'runway']
 *   [{ division: 'women', standing: 'represented' }, { division: 'beauty', standing: 'shortlisted' }]
 *   [{ board: { name: 'NY Women' }, standing: 'active', count: 12 }]
 *
 * @param {Array}   divisions  Board entries — strings or objects.
 * @param {number}  [max]      Cap visible marks; the remainder collapses to "+N".
 * @param {'sm'|'md'|'lg'} [size]
 * @param {boolean} [codeOnly] Shorthand cells only, for dense table columns.
 * @param {boolean} [sorted]   Sort by standing weight. Default true.
 * @param {string}  [empty]    Text when the talent is on no board.
 */
export function DivisionSet({
  divisions = [],
  max,
  size = 'md',
  codeOnly = false,
  onDark = false,
  sorted = true,
  empty = 'No board',
  tight = false,
  className = '',
  ...rest
}) {
  const entries = useMemo(() => {
    const normalized = (Array.isArray(divisions) ? divisions : [divisions])
      .filter(Boolean)
      .map((entry) => {
        if (typeof entry === 'string') return { division: entry, standing: 'active' };
        const division = entry.division || entry.board?.name || entry.board || entry.name || entry.key;
        return {
          division,
          standing: entry.standing || entry.status || 'active',
          label: entry.label,
          count: entry.count,
        };
      })
      .filter((entry) => entry.division);

    // Resolve labels up front so sorting compares what's actually rendered.
    const withLabels = normalized.map((entry) => ({
      ...entry,
      label: entry.label || resolveDivision(entry.division).label,
    }));

    return sorted ? [...withLabels].sort(byStanding) : withLabels;
  }, [divisions, sorted]);

  if (entries.length === 0) {
    return (
      <span className={onDark ? 'dv-set--onDark dv-set__empty' : 'dv-set__empty'}>{empty}</span>
    );
  }

  const visible = max ? entries.slice(0, max) : entries;
  const overflow = entries.length - visible.length;

  const classes = [
    'dv-set',
    size !== 'md' && `dv-set--${size}`,
    onDark && 'dv-set--onDark',
    tight && 'dv-set--tight',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...rest}>
      {visible.map((entry, i) => (
        <DivisionMark
          key={`${entry.division}-${entry.standing}-${i}`}
          division={entry.division}
          standing={entry.standing}
          label={entry.label}
          count={entry.count}
          size={size}
          codeOnly={codeOnly}
          onDark={onDark}
        />
      ))}
      {overflow > 0 && (
        <span
          className="dv-set__more"
          title={entries
            .slice(visible.length)
            .map((e) => e.label)
            .join(' · ')}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}

export default DivisionSet;
