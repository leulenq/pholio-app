import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Figure } from './chartKit';
import { useMeasure } from './chartUtils';
import {
  CLOCK_INK,
  CLOCK_LABEL,
  CONTEXT,
  RULE,
  RULE_SOFT,
  TRACK,
  SURFACE,
  EASE,
  days as fmtDays,
} from '../intelTheme';

const ROW_H = 34;
const AXIS_H = 46; // band label + rule + ticks, all above the first row
const NAME_W = 148;
const RIGHT_W = 104;
const DOT_R = 5.5;

const STATE_WORD = {
  read: 'read',
  normal: 'waiting',
  late: 'late',
  cold: 'cold',
};

/**
 * Which open submissions are still live, and which are past the window where a
 * read normally happens.
 *
 * The platform band (p25–p75 of real first-read latency) is drawn once and every
 * open submission sits on that same axis at its own age. The comparison is the
 * point: silence at four days is ordinary, silence at forty is an answer.
 * Without a band the axis still draws — ages are shown and nothing is graded,
 * because grading against an invented threshold is worse than saying nothing.
 */
export default function ReadClock({ band, open, yourMedianDays }) {
  const reduce = useReducedMotion();
  const [ref, width, shown] = useMeasure();

  const rows = Array.isArray(open) ? open : [];
  const p25 = Number(band?.p25);
  const p75 = Number(band?.p75);
  const hasBand = Number.isFinite(p25) && Number.isFinite(p75) && p75 >= p25;
  // Guard on null explicitly: Number(null) is 0, which is finite, so a missing
  // median would otherwise render as an empty "they take  on average" line.
  const median = yourMedianDays == null ? null : Number(yourMedianDays);
  const hasMedian = median != null && Number.isFinite(median);

  const maxAge = Math.max(
    ...rows.map((r) => Number(r.ageDays) || 0),
    hasBand ? p75 * 1.5 : 0,
    14,
  );
  const plotW = Math.max(0, width - NAME_W - RIGHT_W);
  const x = (d) => NAME_W + (Math.min(Number(d) || 0, maxAge) / maxAge) * plotW;
  const height = AXIS_H + rows.length * ROW_H;
  const ticks = [0, Math.round(maxAge / 2), Math.round(maxAge)];

  return (
    <Figure
      caption={
        hasBand
          ? `shaded · platform first reads land ${Math.round(p25)}–${Math.round(p75)}d`
          : 'ungraded · platform read band still accruing'
      }
    >
      <div ref={ref} className="iv-clock">
        {width > 0 && (
          <svg width={width} height={height} role="img"
            aria-label="Open submissions by age against the typical read window">
            {hasBand && (
              <rect
                x={x(p25)} y={AXIS_H - 14}
                width={Math.max(2, x(p75) - x(p25))}
                height={height - AXIS_H + 14}
                fill="rgba(176,141,69,0.15)"
              />
            )}

            {/* Axis sits entirely above the rows so nothing collides. */}
            <line
              x1={NAME_W} y1={AXIS_H - 14} x2={NAME_W + plotW} y2={AXIS_H - 14}
              stroke={RULE} strokeWidth="1"
            />
            {ticks.map((t, i) => (
              <text
                key={`${t}-${i}`}
                x={x(t)} y={AXIS_H - 22}
                textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}
                className="iv-axis-tick"
              >
                {t}d
              </text>
            ))}
            {hasBand && (
              <>
                <line
                  x1={x(p75)} y1={AXIS_H - 14} x2={x(p75)} y2={height}
                  stroke={CONTEXT} strokeWidth="1"
                />
                <text
                  x={x(p75)} y={AXIS_H - 34}
                  textAnchor={x(p75) > width * 0.65 ? 'end' : 'middle'}
                  className="iv-clock-bandlabel"
                >
                  most reads happen by here
                </text>
              </>
            )}

            {rows.map((row, i) => {
              const y = AXIS_H + i * ROW_H + ROW_H / 2 - 4;
              const cx = x(row.ageDays);
              const ink = CLOCK_INK[row.state] ?? CLOCK_INK.normal;
              return (
                <g key={row.applicationId}>
                  <line
                    x1={0} y1={y + ROW_H / 2} x2={width} y2={y + ROW_H / 2}
                    stroke={RULE_SOFT} strokeWidth="1"
                  />
                  <text x={0} y={y + 4} className="iv-clock-name">
                    {row.agencyName}
                  </text>
                  {/* Track, then the age line drawn over it. */}
                  <line
                    x1={NAME_W} y1={y} x2={NAME_W + plotW} y2={y}
                    stroke={TRACK} strokeWidth="3" strokeLinecap="round"
                  />
                  <motion.line
                    x1={NAME_W} y1={y} x2={cx} y2={y}
                    stroke={ink} strokeWidth="3" strokeLinecap="round"
                    strokeOpacity="0.4"
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={shown || reduce ? { pathLength: 1 } : { pathLength: 0 }}
                    transition={{ duration: reduce ? 0 : 0.55, delay: i * 0.05, ease: EASE }}
                  />
                  <motion.circle
                    cx={cx} cy={y} r={DOT_R}
                    fill={ink} stroke={SURFACE} strokeWidth="2"
                    initial={reduce ? false : { opacity: 0 }}
                    animate={shown || reduce ? { opacity: 1 } : { opacity: 0 }}
                    transition={{ duration: reduce ? 0 : 0.35, delay: 0.2 + i * 0.05 }}
                  />
                  {/* Anchored at the right edge, with the qualifier BEFORE the
                      number so the run ends at `width` and never overflows. */}
                  <text x={width - 2} y={y + 4} textAnchor="end" className="iv-clock-age">
                    <tspan className="iv-clock-state">
                      {STATE_WORD[row.state] ?? row.state}
                    </tspan>
                    <tspan dx="8">{row.ageDays}d</tspan>
                  </text>
                </g>
              );
            })}
          </svg>
        )}
        {hasMedian && (
          <p className="iv-clock-note">
            When boards do open you they take <b>{fmtDays(median)}</b>
            {hasBand
              ? median <= p75
                ? ' — inside the platform norm.'
                : ' — slower than the platform norm.'
              : '.'}
          </p>
        )}
      </div>
    </Figure>
  );
}
