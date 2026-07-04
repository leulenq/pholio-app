import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Calibrating } from './IntelKit';
import { dowName, hourPart } from './intelUtils';

const DOW_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const HOUR_TICKS = [0, 6, 12, 18];

/** Normalise the 7×24 grid; guard the placeholder/absent shapes. */
function normalizeGrid(grid) {
  if (!Array.isArray(grid) || grid.length !== 7) return null;
  return grid.map((row) => (Array.isArray(row) ? row.slice(0, 24) : Array(24).fill(0)));
}

function hourClock(hour) {
  const h = Number(hour) % 24;
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/**
 * The Rhythm Field — a 7×24 heat grid of when attention arrives (day × hour).
 * Genuinely actionable: it tells talent when to share and follow up.
 */
export default function RhythmField({ rhythm }) {
  const reduce = useReducedMotion();
  const grid = useMemo(() => normalizeGrid(rhythm?.grid), [rhythm]);
  const max = useMemo(() => (grid ? Math.max(1, ...grid.flat().map((v) => Number(v) || 0)) : 1), [grid]);

  if (!grid || (Number(rhythm?.total) || 0) === 0) {
    return (
      <Calibrating>
        The Rhythm Field fills in as visits arrive. Once it has a pattern, it will tell you the day
        and hour to share new frames.
      </Calibrating>
    );
  }

  const peak = rhythm.peak;
  const caption = peak
    ? `Attention arrives ${dowName(peak.dow)} ${hourPart(peak.hour)} — share new frames then.`
    : null;

  return (
    <div className="intel2-rhythm">
      <div className="intel2-rhythm-grid" role="img" aria-label="Attention by day of week and hour">
        {grid.map((row, dow) => (
          <React.Fragment key={dow}>
            <span className="intel2-rhythm-daylabel">{DOW_LETTERS[dow]}</span>
            {row.map((count, hour) => {
              const v = Number(count) || 0;
              const isPeak = peak && peak.dow === dow && peak.hour === hour;
              return (
                <motion.span
                  key={hour}
                  className={`intel2-rhythm-cell${isPeak ? ' intel2-rhythm-cell--peak' : ''}`}
                  style={{ opacity: v === 0 ? 0.06 : 0.14 + 0.86 * (v / max) }}
                  initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: v === 0 ? 0.06 : 0.14 + 0.86 * (v / max) }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4, delay: reduce ? 0 : Math.min(0.5, dow * 0.03), ease: 'easeOut' }}
                  title={`${dowName(dow)} ${hourClock(hour)} · ${v}`}
                />
              );
            })}
          </React.Fragment>
        ))}
        <span className="intel2-rhythm-daylabel" aria-hidden />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="intel2-rhythm-hourlabel">
            {HOUR_TICKS.includes(h) ? hourClock(h) : ''}
          </span>
        ))}
      </div>
      {caption && <p className="intel2-rhythm-caption">{caption}</p>}
    </div>
  );
}
