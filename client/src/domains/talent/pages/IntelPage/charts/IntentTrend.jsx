import React, { useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Figure, Tooltip } from './chartKit';
import { useMeasure, useSeriesCursor } from './chartUtils';
import {
  RAMP,
  CONTEXT,
  INK,
  RULE,
  RULE_SOFT,
  SURFACE,
  EASE,
  shortDate,
  weekdayDate,
} from '../intelTheme';

const H = 176;
const PAD_T = 16;
const PAD_B = 24;
const PAD_L = 30;
const PAD_R = 12;

/**
 * Is intent-bearing attention rising or falling?
 *
 * One measure on one axis: card pulls, share-link opens and qualified visits —
 * the events where someone did something beyond arriving. Raw reach is
 * deliberately not plotted; it is the number that inflates and decides nothing,
 * so it is reported as context beneath instead.
 *
 * The prior window of equal length is drawn behind in grey. That is the whole
 * comparison — no second y-axis, no index, no cohort estimate.
 */
export default function IntentTrend({ series, annotations, agencyDays, priorLabel }) {
  const reduce = useReducedMotion();
  const [ref, width, shown] = useMeasure();
  const svgRef = useRef(null);

  const rows = useMemo(() => (Array.isArray(series) ? series : []), [series]);
  const n = rows.length;
  const cursor = useSeriesCursor(n);

  const annByDate = useMemo(() => {
    const map = new Map();
    for (const a of annotations || []) map.set(a.date, a.events);
    return map;
  }, [annotations]);
  const agencyByDate = useMemo(() => {
    const map = new Map();
    for (const a of agencyDays || []) map.set(a.date, a);
    return map;
  }, [agencyDays]);

  const hasPrior = rows.some((r) => r.prior != null);
  const max = Math.max(
    1,
    ...rows.map((r) => Math.max(Number(r.intent) || 0, Number(r.prior) || 0)),
  );

  const plotW = Math.max(0, width - PAD_L - PAD_R);
  const plotH = H - PAD_T - PAD_B;
  const x = (i) => PAD_L + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const y = (v) => PAD_T + plotH - ((Number(v) || 0) / max) * plotH;

  const line = (key) =>
    rows.map((r, i) => `${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' L');

  const area = `M${PAD_L},${PAD_T + plotH} L${line('intent')} L${(PAD_L + plotW).toFixed(1)},${PAD_T + plotH} Z`;

  const active = cursor.index != null ? rows[cursor.index] : null;
  // Gridlines only where a whole count sits — no half-events on the axis.
  const gridValues = max <= 4 ? [...Array(max + 1).keys()] : [0, Math.round(max / 2), max];

  const handlePointer = (event) => {
    const el = svgRef.current;
    if (!el) return;
    cursor.fromPointer(event, el.getBoundingClientRect(), PAD_L, plotW);
  };

  return (
    <Figure
      caption={
        hasPrior
          ? `solid · this window   ·   grey · ${priorLabel || 'the window before'}`
          : 'this window only · the one before was too thin to compare'
      }
    >
      <div className="iv-trend">
        <div
          ref={ref}
          className="iv-trend-plot"
          onPointerMove={handlePointer}
          onPointerLeave={() => cursor.setIndex(null)}
          onKeyDown={cursor.onKeyDown}
          onBlur={() => cursor.setIndex(null)}
          tabIndex={0}
          role="application"
          aria-label="Intent-bearing attention per day. Use arrow keys to step through days."
        >
          {width > 0 && (
            <svg ref={svgRef} width={width} height={H}>
              <defs>
                <linearGradient id="iv-trend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={RAMP[1]} stopOpacity="0.24" />
                  <stop offset="100%" stopColor={RAMP[1]} stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {gridValues.map((v) => (
                <g key={v}>
                  <line
                    x1={PAD_L} y1={y(v)} x2={PAD_L + plotW} y2={y(v)}
                    stroke={v === 0 ? RULE : RULE_SOFT} strokeWidth="1"
                  />
                  <text x={PAD_L - 8} y={y(v) + 4} textAnchor="end" className="iv-axis-tick">
                    {v}
                  </text>
                </g>
              ))}

              {hasPrior && (
                <path
                  d={`M${line('prior')}`}
                  fill="none" stroke={CONTEXT} strokeWidth="1.5"
                  strokeOpacity="0.65" strokeLinejoin="round"
                />
              )}

              <motion.path
                d={area}
                fill="url(#iv-trend-fill)"
                initial={reduce ? false : { opacity: 0 }}
                animate={shown || reduce ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.8, ease: EASE }}
              />
              <motion.path
                d={`M${line('intent')}`}
                fill="none" stroke={RAMP[2]} strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round"
                initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
                animate={shown || reduce ? { pathLength: 1 } : { pathLength: 0 }}
                transition={{ duration: reduce ? 0 : 1.1, ease: EASE }}
              />

              {/* Days the talent caused something, so a step has a visible reason. */}
              {rows.map((r, i) =>
                annByDate.has(r.date) ? (
                  <line
                    key={`an-${r.date}`}
                    x1={x(i)} y1={PAD_T + plotH} x2={x(i)} y2={PAD_T + plotH + 6}
                    stroke={RAMP[4]} strokeWidth="1.5"
                  />
                ) : null,
              )}
              {/* Agency-side events: the top of the signal hierarchy, marked. */}
              {rows.map((r, i) =>
                agencyByDate.has(r.date) ? (
                  <circle
                    key={`ag-${r.date}`}
                    cx={x(i)} cy={PAD_T - 8} r="3.5"
                    fill={RAMP[4]} stroke={SURFACE} strokeWidth="1.5"
                  />
                ) : null,
              )}

              {active && (
                <>
                  <line
                    x1={x(cursor.index)} y1={PAD_T - 12}
                    x2={x(cursor.index)} y2={PAD_T + plotH}
                    stroke={INK} strokeWidth="1" strokeOpacity="0.35"
                  />
                  <circle
                    cx={x(cursor.index)} cy={y(active.intent)} r="5"
                    fill={RAMP[2]} stroke={SURFACE} strokeWidth="2"
                  />
                </>
              )}
            </svg>
          )}

          {active && width > 0 && (
            <Tooltip xPct={(x(cursor.index) / width) * 100}>
              <span className="iv-tip-date">{weekdayDate(active.date)}</span>
              <span className="iv-tip-line">
                <b>{active.intent}</b> intent {active.intent === 1 ? 'event' : 'events'}
              </span>
              {active.prior != null && (
                <span className="iv-tip-sub">{active.prior} in the prior window</span>
              )}
              {agencyByDate.get(active.date) && (
                <span className="iv-tip-sub">
                  {agencyByDate.get(active.date).reviews} reviewed ·{' '}
                  {agencyByDate.get(active.date).advances} advanced
                </span>
              )}
              {annByDate.get(active.date)?.map((e, i) => (
                <span key={i} className="iv-tip-sub">{e.label}</span>
              ))}
            </Tooltip>
          )}
        </div>

        <div className="iv-trend-axis">
          <span>{rows[0] ? shortDate(rows[0].date) : ''}</span>
          <span>{rows[n - 1] ? shortDate(rows[n - 1].date) : ''}</span>
        </div>
      </div>
    </Figure>
  );
}
