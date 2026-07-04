import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SECTION_EASE } from './intelUtils';

const W = 620;
const H = 84;
const AX_Y = 50;
const PAD = 40;
const AX_W = W - PAD * 2;

/**
 * The Stage Clock — median review latency drawn against the platform-typical
 * band. Sets honest expectations: agencies are slow, and silence is not
 * rejection.
 */
export default function StageClock({ stageClock }) {
  const reduce = useReducedMotion();
  const median = stageClock?.medianReviewDays;
  const band = stageClock?.typicalBand;
  const p25 = Number(band?.p25);
  const p75 = Number(band?.p75);
  const hasBand = Number.isFinite(p25) && Number.isFinite(p75) && p75 >= p25;

  const maxDays = Math.max(14, hasBand ? p75 * 1.4 : 0, Number(median) || 0) || 14;
  const x = (d) => PAD + (Math.min(d, maxDays) / maxDays) * AX_W;

  const bandCopy = hasBand
    ? `the typical first read takes ${Math.round(p25)}–${Math.round(p75)} days.`
    : 'the typical first read takes several days.';

  return (
    <div className="intel2-clock">
      <h3 className="intel2-subhead">Stage Clock</h3>
      <p className="intel2-clock-copy">Agencies are slow. Silence isn&rsquo;t rejection — {bandCopy}</p>

      {(hasBand || Number.isFinite(Number(median))) ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="intel2-clock-svg" role="img" aria-label="Review latency against typical band">
          <line x1={PAD} y1={AX_Y} x2={W - PAD} y2={AX_Y} stroke="rgba(26,24,21,0.14)" strokeWidth="1" />
          {hasBand && (
            <motion.rect
              y={AX_Y - 9} height="18" rx="9"
              x={x(p25)}
              initial={{ width: reduce ? x(p75) - x(p25) : 0 }}
              whileInView={{ width: x(p75) - x(p25) }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.7, ease: SECTION_EASE }}
              fill="rgba(184,149,106,0.16)"
            />
          )}
          {Number.isFinite(Number(median)) && (
            <motion.circle
              cy={AX_Y} r="6"
              initial={{ cx: reduce ? x(Number(median)) : PAD, opacity: reduce ? 1 : 0 }}
              whileInView={{ cx: x(Number(median)), opacity: 1 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.7, delay: 0.2, ease: SECTION_EASE }}
              fill="#1A1815"
            />
          )}
          {Number.isFinite(Number(median)) && (
            <text x={x(Number(median))} y={AX_Y - 14} textAnchor="middle" className="intel2-clock-num">
              {Math.round(Number(median))}d
            </text>
          )}
          {[0, Math.round(maxDays / 2), Math.round(maxDays)].map((d) => (
            <text key={d} x={x(d)} y={AX_Y + 24} textAnchor="middle" className="intel2-pipe-axis">{d}d</text>
          ))}
        </svg>
      ) : (
        <p className="intel2-clock-note">Your own review times appear here once a booker opens a submission.</p>
      )}
    </div>
  );
}
