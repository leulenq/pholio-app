import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Figure } from './chartKit';
import { useMeasure, columnPath } from './chartUtils';
import { RAMP, CONTEXT, RULE, EASE, shortDate } from '../intelTheme';

const H = 84;
const PAD_T = 12;
const PAD_B = 4;
const GAP = 3;

/**
 * One measure, weekly, as real counts.
 *
 * Two measures of different scale never share an axis here — agency events and
 * profile activity gets its own small multiple over the same weeks instead. That
 * is the correct answer to what the old Trajectory did, which was to fold four
 * event types into a single weighted "momentum" index (reviews ×8, advances ×5,
 * pulls ×3, visits ×1). Nobody can act on "momentum 47"; everybody can act on
 * "two agencies opened you last week".
 */
function Panel({ label, weeks, valueKey, ink, splitAt }) {
  const reduce = useReducedMotion();
  const [ref, width, shown] = useMeasure();

  const n = weeks.length;
  // Report the real peak; only the divisor is floored at 1, so an all-zero
  // series says "none yet" rather than claiming a peak of 1.
  const peak = Math.max(0, ...weeks.map((w) => Number(w[valueKey]) || 0));
  const max = Math.max(1, peak);
  const plotH = H - PAD_T - PAD_B;
  const colW = n > 0 ? Math.max(4, width / n - GAP) : 0;

  return (
    <div className="iv-weekly-panel">
      <div className="iv-weekly-head">
        <span className="iv-weekly-label">{label}</span>
        <span className="iv-weekly-peak">{peak === 0 ? 'none yet' : `peak ${peak}`}</span>
      </div>
      <div ref={ref} className="iv-weekly-plot">
        {width > 0 && (
          <svg width={width} height={H} role="img"
            aria-label={`${label} by week`}>
            <line
              x1={0} y1={PAD_T + plotH} x2={width} y2={PAD_T + plotH}
              stroke={RULE} strokeWidth="1"
            />
            {splitAt != null && (
              <line
                x1={(width / n) * splitAt} y1={0}
                x2={(width / n) * splitAt} y2={PAD_T + plotH}
                stroke={CONTEXT} strokeWidth="1" strokeOpacity="0.5"
              />
            )}
            {weeks.map((w, i) => {
              const v = Number(w[valueKey]) || 0;
              const h = v === 0 ? 0 : Math.max(3, (v / max) * plotH);
              const x = (width / n) * i + GAP / 2;
              return (
                <motion.path
                  key={w.weekStart}
                  d={columnPath(x, PAD_T + plotH - h, colW, h)}
                  fill={ink}
                  fillOpacity={splitAt != null && i < splitAt ? 0.4 : 1}
                  initial={reduce ? false : { scaleY: 0 }}
                  animate={shown || reduce ? { scaleY: 1 } : { scaleY: 0 }}
                  style={{ originY: 1, transformBox: 'fill-box' }}
                  transition={{ duration: reduce ? 0 : 0.5, delay: i * 0.03, ease: EASE }}
                >
                  <title>
                    week of {shortDate(w.weekStart)}: {v}
                  </title>
                </motion.path>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

const SERIES = [
  { key: 'reviews', label: 'Agency reviews', rampIndex: 4 },
  { key: 'advances', label: 'Advances', rampIndex: 3 },
  { key: 'sent', label: 'Submissions sent', rampIndex: 2 },
  { key: 'activity', label: 'Profile activity', rampIndex: 1 },
];

export default function WeeklyBars({ weeks, halfWeeks }) {
  const rows = Array.isArray(weeks) ? weeks : [];
  if (rows.length === 0) return null;

  // A panel with no data is chart-shaped furniture: axes and a header drawn
  // around nothing. Only series that actually moved get a plot; the rest are
  // named in the caption so their absence is still stated.
  const live = SERIES.filter((s) => rows.some((w) => (Number(w[s.key]) || 0) > 0));
  const empty = SERIES.filter((s) => !live.includes(s));
  if (live.length === 0) return null;

  return (
    <Figure
      caption={
        empty.length > 0
          ? `faded · earlier ${halfWeeks} weeks   ·   solid · most recent ${halfWeeks}   ·   no activity: ${empty
              .map((e) => e.label.toLowerCase())
              .join(', ')}`
          : `faded · earlier ${halfWeeks} weeks   ·   solid · most recent ${halfWeeks}`
      }
    >
      <div className="iv-weekly">
        {live.map((s) => (
          <Panel
            key={s.key}
            label={s.label}
            weeks={rows}
            valueKey={s.key}
            ink={RAMP[s.rampIndex]}
            splitAt={halfWeeks}
          />
        ))}
      </div>
    </Figure>
  );
}
