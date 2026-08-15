import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Figure } from './chartKit';
import { useMeasure } from './chartUtils';
import {
  VIEWER_INK,
  VIEWER_LABEL,
  RULE_SOFT,
  EASE,
  pct,
} from '../intelTheme';

const ROW_H = 44;
const BAR_H = 16;
const LABEL_W = 128;
const RIGHT_W = 96;
const GAP = 2; // surface gap between stacked segments — never a stroke

const ORDER = ['agency', 'shared', 'public'];

/**
 * Approximate market distribution segmented by known request context. A shared
 * token proves only that the visitor used that link, not who the visitor was.
 */
export default function MarketBars({ rows, showShare, showDelta }) {
  const reduce = useReducedMotion();
  const [ref, width, shown] = useMeasure();

  const list = Array.isArray(rows) ? rows.slice(0, 6) : [];
  const max = Math.max(1, ...list.map((r) => Number(r.count) || 0));
  const plotW = Math.max(0, width - LABEL_W - RIGHT_W);
  const height = list.length * ROW_H;

  return (
    <Figure
      caption="segments · request context · market inferred from coarse IP location"
    >
      <div ref={ref} className="iv-markets">
        {width > 0 && (
          <svg width={width} height={height} role="img"
            aria-label="Recorded activity by approximate market and request context">
            {list.map((row, i) => {
              const y = i * ROW_H;
              const barY = y + 12;
              const count = Number(row.count) || 0;
              const total = ORDER.reduce((s, k) => s + (Number(row.mix?.[k]) || 0), 0);
              const fullW = (count / max) * plotW;
              let cursorX = LABEL_W;

              return (
                <g key={row.market}>
                  <line
                    x1={LABEL_W} y1={y + ROW_H - 6} x2={width} y2={y + ROW_H - 6}
                    stroke={RULE_SOFT} strokeWidth="1"
                  />
                  <text x={0} y={barY + BAR_H - 3} className="iv-market-name">
                    {row.label || String(row.market || '').toUpperCase()}
                  </text>

                  {total > 0
                    ? ORDER.map((key) => {
                        const v = Number(row.mix?.[key]) || 0;
                        if (v === 0) return null;
                        const segW = Math.max(2, (v / total) * fullW - GAP);
                        const segX = cursorX;
                        cursorX += segW + GAP;
                        return (
                          <motion.rect
                            key={key}
                            x={segX} y={barY} width={segW} height={BAR_H} rx="2"
                            fill={VIEWER_INK[key]}
                            initial={reduce ? false : { opacity: 0 }}
                            animate={shown || reduce ? { opacity: 1 } : { opacity: 0 }}
                            transition={{
                              duration: reduce ? 0 : 0.6,
                              delay: i * 0.07,
                              ease: EASE,
                            }}
                          >
                            <title>
                              {VIEWER_LABEL[key]}: {v}
                            </title>
                          </motion.rect>
                        );
                      })
                    : (
                      <rect
                        x={LABEL_W} y={barY} width={Math.max(2, fullW)} height={BAR_H}
                        rx="2" fill={VIEWER_INK.public}
                      />
                    )}

                  <text
                    x={width - 2} y={barY + BAR_H - 3} textAnchor="end"
                    className="iv-market-figure"
                  >
                    {showDelta && row.delta != null && row.delta !== 0 ? (
                      <tspan className="iv-market-delta">
                        {row.delta > 0 ? '+' : '−'}{Math.abs(row.delta)}
                      </tspan>
                    ) : null}
                    {showShare && row.share != null ? (
                      <tspan className="iv-market-share" dx="6">{pct(row.share)}</tspan>
                    ) : null}
                    <tspan dx="8">{count}</tspan>
                  </text>
                </g>
              );
            })}
          </svg>
        )}
        <ul className="iv-stack-legend">
          {ORDER.map((key) => (
            <li key={key}>
              <span className="iv-stack-key" style={{ background: VIEWER_INK[key] }} aria-hidden />
              <span className="iv-stack-label">{VIEWER_LABEL[key]}</span>
            </li>
          ))}
        </ul>
      </div>
    </Figure>
  );
}
