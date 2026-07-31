import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Figure } from './chartKit';
import { useMeasure, barPath } from './chartUtils';
import { RAMP, TRACK, RULE_SOFT, EASE } from '../intelTheme';

const ROW_H = 34;
const BAR_H = 16;
const LABEL_W = 110;
const RIGHT_W = 92;

/**
 * A ranked magnitude comparison — one hue for every bar.
 *
 * These categories are nominal (traffic sources, referrers): they have no
 * inherent order, so colouring each bar by its own value would spend the
 * identity channel re-encoding the length the reader can already see. One
 * series, one colour; rank comes from the sort, magnitude from the bar.
 */
export default function RankedBars({ rows, caption, note }) {
  const reduce = useReducedMotion();
  const [ref, width, shown] = useMeasure();

  const list = Array.isArray(rows) ? rows.slice(0, 6) : [];
  if (list.length === 0) return null;

  const max = Math.max(1, ...list.map((r) => Number(r.value) || 0));
  const plotW = Math.max(0, width - LABEL_W - RIGHT_W);
  const height = list.length * ROW_H;

  return (
    <Figure
      caption={caption}
    >
      <div ref={ref} className="iv-ranked">
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={caption || 'Ranked comparison'}>
            {list.map((row, i) => {
              const y = i * ROW_H;
              const barY = y + (ROW_H - BAR_H) / 2;
              const w = ((Number(row.value) || 0) / max) * plotW;
              return (
                <g key={row.key}>
                  <line
                    x1={0} y1={y + ROW_H - 0.5} x2={width} y2={y + ROW_H - 0.5}
                    stroke={RULE_SOFT} strokeWidth="1"
                  />
                  <text x={0} y={barY + BAR_H - 3} className="iv-ranked-label">
                    {row.label}
                  </text>
                  <rect x={LABEL_W} y={barY} width={plotW} height={BAR_H} rx="3" fill={TRACK} />
                  <motion.path
                    d={barPath(LABEL_W, barY, Math.max(w, 3), BAR_H)}
                    fill={RAMP[1]}
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={shown || reduce ? { scaleX: 1 } : { scaleX: 0 }}
                    style={{ originX: 0, transformBox: 'fill-box' }}
                    transition={{ duration: reduce ? 0 : 0.55, delay: i * 0.05, ease: EASE }}
                  />
                  <text x={width - 2} y={barY + BAR_H - 3} textAnchor="end" className="iv-ranked-value">
                    {row.meaning ? (
                      <tspan className="iv-ranked-sub">{row.meaning}</tspan>
                    ) : null}
                    <tspan dx={row.meaning ? 8 : 0}>{row.value}</tspan>
                  </text>
                </g>
              );
            })}
          </svg>
        )}
        {note ? <p className="iv-chart-note">{note}</p> : null}
      </div>
    </Figure>
  );
}
