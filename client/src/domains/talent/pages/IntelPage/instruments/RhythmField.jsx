import React, { useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useReveal } from './useReveal';
import { Clock } from 'lucide-react';
import { Calibrating } from './parts';
import { SPRING, nf } from './metrics';
import './RhythmField.css';

/**
 * Zone 2 (secondary) — The Rhythm Field. A 7×24 heat grid of WHEN attention
 * arrives, day-of-week × hour, re-binned into the viewer's local time so the
 * talent knows exactly when to share, post, and follow up. Genuinely
 * actionable — not a vanity chart.
 */

// Display rows read Mon..Sun; source dow is Sun-first (0=Sun..6=Sat), UTC.
const DISPLAY_ROWS = [
  { label: 'Mon', dow: 1 },
  { label: 'Tue', dow: 2 },
  { label: 'Wed', dow: 3 },
  { label: 'Thu', dow: 4 },
  { label: 'Fri', dow: 5 },
  { label: 'Sat', dow: 6 },
  { label: 'Sun', dow: 0 },
];

const FULL_DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const HOUR_AXIS_TICKS = [0, 6, 12, 18];

function formatHour12(hour) {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? 'am' : 'pm';
  let displayHour = h % 12;
  if (displayHour === 0) displayHour = 12;
  return `${displayHour}${period}`;
}

function hourAxisLabel(hour) {
  if (hour === 0) return '12am';
  if (hour === 6) return '6am';
  if (hour === 12) return '12pm';
  if (hour === 18) return '6pm';
  return '';
}

function hourRangeLabel(hour) {
  return `${formatHour12(hour)}–${formatHour12(hour + 1)}`;
}

/** Editorial part-of-day phrase for the callout, e.g. "Tuesday evenings". */
function dayPartPhrase(hour) {
  if (hour >= 5 && hour < 8) return 'early mornings';
  if (hour >= 8 && hour < 12) return 'mornings';
  if (hour >= 12 && hour < 14) return 'middays';
  if (hour >= 14 && hour < 18) return 'afternoons';
  if (hour >= 18 && hour < 22) return 'evenings';
  return 'late nights';
}

/** Re-bin a Sun-first, UTC (dow × hour) grid into the viewer's local time. */
function toLocalGrid(grid) {
  const local = Array.from({ length: 7 }, () => Array(24).fill(0));
  if (!Array.isArray(grid) || grid.length !== 7) {
    return { local, max: 0, peak: null };
  }
  // getTimezoneOffset() = minutes to ADD to local time to reach UTC.
  // local = utc - offset, so shift (hours to add to a UTC hour) = -offset/60.
  const shift = Math.round(-new Date().getTimezoneOffset() / 60);

  for (let utcDow = 0; utcDow < 7; utcDow += 1) {
    for (let utcHour = 0; utcHour < 24; utcHour += 1) {
      const value = Number(grid?.[utcDow]?.[utcHour]) || 0;
      if (!value) continue;
      let localHour = utcHour + shift;
      let dowDelta = 0;
      if (localHour < 0) {
        localHour += 24;
        dowDelta = -1;
      } else if (localHour >= 24) {
        localHour -= 24;
        dowDelta = 1;
      }
      const localDow = (utcDow + dowDelta + 7) % 7;
      local[localDow][localHour] += value;
    }
  }

  let max = 0;
  let peak = null;
  for (let dow = 0; dow < 7; dow += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const v = local[dow][hour];
      if (v > max) {
        max = v;
        peak = { dow, hour };
      }
    }
  }
  return { local, max, peak };
}

function cellFill(intensity) {
  if (intensity <= 0) return 'var(--rhythm-well)';
  const alpha = 0.14 + intensity * 0.86;
  return `rgba(201, 165, 90, ${alpha.toFixed(3)})`;
}

const CELL = 24;
const GAP = 3;
const LEFT_GUTTER = 34;
const BOTTOM_GUTTER = 20;
const GRID_W = 24 * (CELL + GAP) - GAP;
const GRID_H = 7 * (CELL + GAP) - GAP;
const SVG_W = LEFT_GUTTER + GRID_W;
const SVG_H = GRID_H + BOTTOM_GUTTER;

export default function RhythmField({ rhythm }) {
  const ref = useRef(null);
  const inView = useReveal();
  const reduce = useReducedMotion();

  const total = Number(rhythm?.total) || 0;
  const { local, max, peak } = useMemo(() => toLocalGrid(rhythm?.grid), [rhythm?.grid]);

  if (total < 12) {
    return (
      <Calibrating
        icon={<Clock size={20} strokeWidth={1.5} />}
        title="The Rhythm Field is listening."
        listening="It maps the days and hours your audience shows up once a couple of dozen visits land — so you know exactly when to post and follow up."
      />
    );
  }

  const peakDayName = peak ? FULL_DAY_NAMES[peak.dow] : null;
  const peakPhrase = peak ? dayPartPhrase(peak.hour) : null;

  return (
    <div className="rhythm" ref={ref}>
      <svg
        className="rhythm-svg"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label={
          peak
            ? `Attention heat map by day and hour, local time. Busiest on ${peakDayName} ${peakPhrase}.`
            : 'Attention heat map by day and hour, local time.'
        }
      >
        {DISPLAY_ROWS.map((row, rowIdx) => (
          <text
            key={`label-${row.dow}`}
            x={LEFT_GUTTER - 10}
            y={rowIdx * (CELL + GAP) + CELL / 2 + 3.5}
            className="rhythm-axis-label rhythm-axis-label--day"
            textAnchor="end"
          >
            {row.label}
          </text>
        ))}

        {HOUR_AXIS_TICKS.map((hour) => (
          <text
            key={`hour-${hour}`}
            x={LEFT_GUTTER + hour * (CELL + GAP) + CELL / 2}
            y={GRID_H + 15}
            className="rhythm-axis-label rhythm-axis-label--hour"
            textAnchor="middle"
          >
            {hourAxisLabel(hour)}
          </text>
        ))}

        {DISPLAY_ROWS.map((row, rowIdx) =>
          Array.from({ length: 24 }, (_, hour) => {
            const value = local[row.dow][hour];
            const intensity = max > 0 ? value / max : 0;
            const isPeak = peak && peak.dow === row.dow && peak.hour === hour;
            const x = LEFT_GUTTER + hour * (CELL + GAP);
            const y = rowIdx * (CELL + GAP);
            return (
              <motion.rect
                key={`${row.dow}-${hour}`}
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                rx={5}
                className={`rhythm-cell${isPeak ? ' rhythm-cell--peak' : ''}`}
                fill={cellFill(intensity)}
                initial={reduce ? false : { opacity: 0, scale: 0.82 }}
                animate={inView ? { opacity: 1, scale: 1 } : undefined}
                transition={{ ...SPRING, delay: reduce ? 0 : hour * 0.012 }}
              >
                <title>
                  {`${FULL_DAY_NAMES[row.dow]}, ${hourRangeLabel(hour)} · ${nf(value)} ${
                    value === 1 ? 'visit' : 'visits'
                  }`}
                </title>
              </motion.rect>
            );
          })
        )}
      </svg>

      <p className="rhythm-note">Shown in your local time.</p>

      {peak ? (
        <p className="rhythm-callout">
          Your audience shows up most on <strong>{peakDayName}</strong> {peakPhrase} —
          line up shares and follow-ups then.
        </p>
      ) : null}
    </div>
  );
}
