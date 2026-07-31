import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Figure } from './chartKit';
import { useMeasure, barPath } from './chartUtils';
import {
  CURRENCY_INK,
  CONTEXT,
  TRACK,
  RULE_SOFT,
  EASE,
} from '../intelTheme';

const ROW_H = 46;
const BAR_H = 18;
const LABEL_W = 116;
const RIGHT_W = 138;
const TOP = 30;
/** The window line sits at a fixed x so "past it" reads the same on every row. */
const WINDOW_AT = 0.6;

function figure(row) {
  if (row.ageDays == null) return 'none';
  // The comp card has no window — it is judged against the book it sells, so a
  // raw age would read as a measurement it isn't making.
  if (row.windowDays == null) return row.state === 'current' ? 'current' : 'out of date';
  if (row.daysOver > 0) return `${row.daysOver}d over`;
  if (row.daysLeft != null) return `${row.daysLeft}d left`;
  return `${row.ageDays}d`;
}

/**
 * Whether each piece of the package is current, and by how much it is inside or
 * past its industry window.
 *
 * Each row is normalised to its OWN window so the boundary line is at the same
 * place for all of them and "past the line" is one visual fact. Absolute days
 * are printed beside the bar, so nothing depends on reading a length.
 *
 * (This replaces three donut rings whose arcs were not on a shared scale — the
 * comp card's ring could only ever be exactly full or exactly empty, so it
 * looked like a measurement while measuring nothing.)
 */
export default function CurrencyAxis({ items }) {
  const reduce = useReducedMotion();
  const [ref, width, shown] = useMeasure();

  const rows = Array.isArray(items) ? items : [];
  const plotW = Math.max(0, width - LABEL_W - RIGHT_W);
  const windowX = LABEL_W + plotW * WINDOW_AT;
  const height = TOP + rows.length * ROW_H;

  return (
    <Figure
    >
      <div ref={ref} className="iv-currency">
        {width > 0 && (
          <svg width={width} height={height} role="img"
            aria-label="Materials currency against their industry windows">
            <line
              x1={windowX} y1={TOP - 12} x2={windowX} y2={height - 8}
              stroke={CONTEXT} strokeWidth="1"
            />
            <text x={windowX} y={TOP - 20} textAnchor="middle" className="iv-axis-tick">
              window
            </text>

            {rows.map((row, i) => {
              const y = TOP + i * ROW_H;
              const barY = y + 10;
              const ink = CURRENCY_INK[row.state] ?? CURRENCY_INK.missing;
              // Age as a fraction of its own window, so the line means the same
              // on every row. Rows with no window (the card) show a token bar
              // positioned by state rather than a fabricated measurement.
              const ratio =
                row.ageDays == null || !row.windowDays
                  ? row.state === 'current'
                    ? WINDOW_AT * 0.66
                    : row.state === 'missing'
                      ? 0
                      : WINDOW_AT * 1.2
                  : (row.ageDays / row.windowDays) * WINDOW_AT;
              const w = Math.min(plotW, Math.max(0, ratio * plotW));

              return (
                <g key={row.key}>
                  <line
                    x1={0} y1={y + ROW_H - 8} x2={width} y2={y + ROW_H - 8}
                    stroke={RULE_SOFT} strokeWidth="1"
                  />
                  <text x={0} y={barY + BAR_H - 4} className="iv-currency-label">
                    {row.label}
                  </text>

                  <rect
                    x={LABEL_W} y={barY} width={plotW} height={BAR_H}
                    rx="4" fill={TRACK}
                  />
                  {w > 0 ? (
                    <motion.path
                      d={barPath(LABEL_W, barY, Math.max(w, 3), BAR_H)}
                      fill={ink}
                      initial={reduce ? false : { scaleX: 0 }}
                      animate={shown || reduce ? { scaleX: 1 } : { scaleX: 0 }}
                      style={{ originX: 0, transformBox: 'fill-box' }}
                      transition={{ duration: reduce ? 0 : 0.6, delay: i * 0.09, ease: EASE }}
                    />
                  ) : null}

                  <text x={width - 2} y={barY + BAR_H - 4} textAnchor="end"
                    className="iv-currency-figure">
                    {figure(row)}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </Figure>
  );
}

/** The three frames a booker scans for, as a compact presence row. */
export function RangeMatrix({ range }) {
  const rows = Array.isArray(range) ? range : [];
  if (rows.length === 0) return null;

  return (
    <ul className="iv-range-list">
      {rows.map((row) => (
        <li key={row.key} className={`iv-range-item${row.present ? ' is-present' : ''}`}>
          <span className="iv-range-mark" aria-hidden />
          <span className="iv-range-name">{row.label}</span>
          <span className="iv-range-state">{row.present ? 'in book' : 'missing'}</span>
        </li>
      ))}
    </ul>
  );
}
