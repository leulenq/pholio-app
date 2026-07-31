import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Figure } from './chartKit';
import { useMeasure, barPath } from './chartUtils';
import { STAGE_INK, CONTEXT, TRACK, RULE_SOFT, EASE, pct } from '../intelTheme';

const ROW_H = 44;
const BAR_H = 20;
const LABEL_W = 104;
const VALUE_W = 132;

/**
 * Where submissions die.
 *
 * An ordered ladder scaled to the number sent, each rung on a full-width track
 * so the gap between the fill and the track edge is the loss. Every rung
 * carries its conversion off the rung above — the drop IS the finding — and a
 * hairline marks where the same step sits over the talent's whole history.
 *
 * (The instrument this replaces drew stage bands scaled to `entered` beside an
 * outcome column scaled to its own total — two different denominators in one
 * picture, so the halves could not be compared.)
 */
export default function ConversionLadder({ steps, compare, compareLabel }) {
  const reduce = useReducedMotion();
  const [ref, width, shown] = useMeasure();

  const rows = Array.isArray(steps) ? steps : [];
  const sent = rows[0]?.count ?? 0;
  const height = rows.length * ROW_H;
  const plotW = Math.max(0, width - LABEL_W - VALUE_W);
  const scale = (n) => (sent > 0 ? (n / sent) * plotW : 0);

  const compareByKey = Object.fromEntries(
    (Array.isArray(compare) ? compare : []).map((s) => [s.key, s]),
  );

  return (
    <Figure
    >
      <div ref={ref} className="iv-ladder">
        {width > 0 && (
          <svg width={width} height={height} role="img"
            aria-label="Submission conversion by stage">
            {rows.map((step, i) => {
              const y = i * ROW_H;
              const barY = y + (ROW_H - BAR_H) / 2;
              const w = scale(step.count);
              const cmp = compareByKey[step.key];
              // Where this step would land at the historical rate — a hairline
              // the bar can visibly fall short of or overshoot.
              const cmpW =
                cmp && cmp.rate != null && i > 0
                  ? scale((rows[i - 1]?.count ?? 0) * cmp.rate)
                  : null;

              return (
                <g key={step.key}>
                  <line
                    x1={0} y1={y + ROW_H - 0.5} x2={width} y2={y + ROW_H - 0.5}
                    stroke={RULE_SOFT} strokeWidth="1"
                  />
                  <text x={0} y={y + ROW_H / 2 + 4} className="iv-ladder-label">
                    {step.label}
                  </text>

                  <rect
                    x={LABEL_W} y={barY} width={plotW} height={BAR_H}
                    rx="4" fill={TRACK}
                  />
                  <motion.path
                    d={barPath(LABEL_W, barY, Math.max(w, step.count > 0 ? 3 : 0), BAR_H)}
                    fill={STAGE_INK[step.key] ?? STAGE_INK.sent}
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={shown || reduce ? { scaleX: 1 } : { scaleX: 0 }}
                    style={{ originX: 0, transformBox: 'fill-box' }}
                    transition={{ duration: reduce ? 0 : 0.65, delay: i * 0.07, ease: EASE }}
                  />

                  {cmpW != null && Math.abs(cmpW - w) > 5 && (
                    <g>
                      <line
                        x1={LABEL_W + cmpW} y1={barY - 4}
                        x2={LABEL_W + cmpW} y2={barY + BAR_H + 4}
                        stroke={CONTEXT} strokeWidth="1.5"
                      />
                      <title>{compareLabel}: {pct(cmp.rate)}</title>
                    </g>
                  )}

                  <text
                    x={width - 2} y={y + ROW_H / 2 + 4} textAnchor="end"
                    className="iv-ladder-value"
                  >
                    {step.count}
                    {step.rate != null && (
                      <tspan className="iv-ladder-rate" dx="9">{pct(step.rate)}</tspan>
                    )}
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
