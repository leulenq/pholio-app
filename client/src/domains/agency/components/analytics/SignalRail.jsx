import React from 'react';
import { line as d3line, curveMonotoneX } from 'd3-shape';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { VIZ, formatValue } from './viz';

const SPARK_W = 88;
const SPARK_H = 26;

/**
 * The spark under each tile: the same metric measured over equal slices of the
 * reporting window. Gaps (a slice with no observations) break the line rather
 * than being interpolated to zero — a quiet week is not a week of zeroes.
 */
function Spark({ series, accent }) {
  const points = (series || []).map((v, i) => ({ i, v }));
  const observed = points.filter((p) => p.v != null && Number.isFinite(p.v));
  if (observed.length < 2) return <div className="sv-spark sv-spark--empty" aria-hidden="true" />;

  const max = Math.max(...observed.map((p) => p.v));
  const min = Math.min(...observed.map((p) => p.v));
  const range = max - min || 1;
  const x = (i) => (i / Math.max(1, points.length - 1)) * (SPARK_W - 2) + 1;
  const y = (v) => SPARK_H - 3 - ((v - min) / range) * (SPARK_H - 6);

  const path = d3line()
    .defined((p) => p.v != null && Number.isFinite(p.v))
    .x((p) => x(p.i))
    .y((p) => y(p.v))
    .curve(curveMonotoneX)(points);

  const last = observed[observed.length - 1];

  return (
    <svg
      className="sv-spark"
      width={SPARK_W}
      height={SPARK_H}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r="4" fill={VIZ.surface} />
      <circle cx={x(last.i)} cy={y(last.v)} r="2.5" fill={accent} />
    </svg>
  );
}

function Delta({ signal }) {
  const { delta, deltaPercent, goodDirection, unit } = signal;
  if (delta == null || delta === 0) {
    return (
      <span className="sv-delta sv-delta--flat">
        <Minus size={12} aria-hidden="true" />
        <span>Level on the previous period</span>
      </span>
    );
  }
  const up = delta > 0;
  const good =
    goodDirection === 'neutral' ? null : (up && goodDirection === 'up') || (!up && goodDirection === 'down');
  const tone = good == null ? 'flat' : good ? 'good' : 'bad';
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const magnitude =
    unit === 'percent'
      ? `${Math.abs(delta)} percentage ${Math.abs(delta) === 1 ? 'point' : 'points'}`
      : unit === 'count' && deltaPercent != null
      ? `${Math.abs(deltaPercent)}%`
      : formatValue(Math.abs(delta), unit);

  return (
    <span className={`sv-delta sv-delta--${tone}`}>
      <Icon size={12} aria-hidden="true" />
      <span>
        {magnitude} {up ? 'up' : 'down'} on the previous period
      </span>
    </span>
  );
}

/**
 * The signal rail — one ruled strip of the six numbers a booker checks first.
 * Not cards: the rule between them is the only separator, which keeps the
 * masthead reading as a ledger rather than a SaaS KPI row.
 */
export function SignalRail({ signals, rangeLabel }) {
  return (
    <div className="sv-rail" role="list" aria-label={`Headline measures, ${rangeLabel}`}>
      {signals.map((signal, i) => (
        <div className="sv-signal" role="listitem" key={signal.key}>
          <span className="sv-signal-label">{signal.label}</span>
          <div className="sv-signal-figure">
            <span className="sv-signal-value">{formatValue(signal.value, signal.unit)}</span>
            <Spark series={signal.series} accent={i === 0 ? VIZ.depth[2] : VIZ.inkMuted} />
          </div>
          <Delta signal={signal} />
          {signal.sample != null && signal.sample < 5 ? (
            <span className="sv-signal-sample">
              {signal.sample === 0 ? 'Not yet observed' : `From ${signal.sample} observed`}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default SignalRail;
