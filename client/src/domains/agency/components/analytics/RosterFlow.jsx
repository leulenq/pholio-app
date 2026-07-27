import React from 'react';
import { line as d3line, curveMonotoneX } from 'd3-shape';
import { VIZ, formatMonth, axisScale } from './viz';
import { useMeasure } from './useMeasure';
import { useTooltip } from './useTooltip';
import { TipRows } from './Tooltip';

/**
 * Twelve months of roster movement, as polarity around a zero line: signings
 * above, departures below, on the validated diverging pair with a neutral
 * baseline between them.
 *
 * Roster size is plotted underneath as its own strip rather than as a second
 * y-scale on the same plot — a headcount of 40 and a monthly delta of 3 do not
 * share an axis, and pretending they do is the dual-axis mistake.
 */

const FLOW_H = 138;
const TRAIL_H = 78;
const PAD = { top: 12, right: 12, bottom: 22, left: 32 };
const MAX_BAR = 20;

export function RosterFlow({ growth }) {
  const [ref, width] = useMeasure(560);
  const { show, hide, node } = useTooltip();

  const months = growth || [];
  if (!months.length) return <div ref={ref} className="sv-chart" />;

  const plotW = Math.max(40, width - PAD.left - PAD.right);
  const half = (FLOW_H - PAD.top - PAD.bottom) / 2;
  const zeroY = PAD.top + half;
  const { max } = axisScale(Math.max(1, ...months.map((m) => Math.max(m.joined, m.left))), { count: 2 });
  const band = plotW / months.length;
  const barW = Math.min(MAX_BAR, band * 0.5);
  const cx = (i) => PAD.left + band * i + band / 2;
  const h = (v) => (v / max) * half;

  const { max: totalMax } = axisScale(Math.max(1, ...months.map((m) => m.total)), { count: 2 });
  const trailY = (v) => FLOW_H + TRAIL_H - 16 - (v / totalMax) * (TRAIL_H - 40);
  const trailPath = d3line()
    .x((_, i) => cx(i))
    .y((d) => trailY(d.total))
    .curve(curveMonotoneX)(months);

  const last = months[months.length - 1];
  const labelEvery = Math.max(1, Math.ceil(months.length / 6));

  const hover = (e, month) => {
    const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
    show(
      e.clientX - box.left,
      e.clientY - box.top,
      <TipRows
        title={formatMonth(month.month)}
        rows={[
          { label: 'Signed', value: month.joined, color: VIZ.series[0] },
          { label: 'Left', value: month.left, color: VIZ.series[1] },
          { label: 'Net', value: month.net > 0 ? `+${month.net}` : month.net },
          { label: 'On the roster', value: month.total },
        ]}
      />,
    );
  };

  return (
    <div ref={ref} className="sv-chart">
      <svg
        width={width}
        height={FLOW_H + TRAIL_H}
        role="img"
        aria-label={`Roster movement by month: ${months
          .map((m) => `${formatMonth(m.month)} signed ${m.joined}, left ${m.left}, total ${m.total}`)
          .join('; ')}`}
      >
        {months.map((month, i) => (
          <g key={month.month}>
            {month.joined > 0 ? (
              <rect
                x={cx(i) - barW / 2}
                y={zeroY - h(month.joined)}
                width={barW}
                height={Math.max(2, h(month.joined))}
                rx="2"
                fill={VIZ.series[0]}
                onMouseMove={(e) => hover(e, month)}
                onMouseLeave={hide}
              />
            ) : null}
            {month.left > 0 ? (
              <rect
                x={cx(i) - barW / 2}
                y={zeroY}
                width={barW}
                height={Math.max(2, h(month.left))}
                rx="2"
                fill={VIZ.series[1]}
                onMouseMove={(e) => hover(e, month)}
                onMouseLeave={hide}
              />
            ) : null}
            {i % labelEvery === 0 ? (
              <text className="sv-axis" x={cx(i)} y={FLOW_H - 6} textAnchor="middle">
                {formatMonth(month.month)}
              </text>
            ) : null}
          </g>
        ))}

        <line x1={PAD.left} x2={width - PAD.right} y1={zeroY} y2={zeroY} stroke={VIZ.axis} strokeWidth="1" />
        <text className="sv-axis" x={PAD.left - 8} y={zeroY - h(max) + 4} textAnchor="end">+{max}</text>
        <text className="sv-axis" x={PAD.left - 8} y={zeroY + 4} textAnchor="end">0</text>
        <text className="sv-axis" x={PAD.left - 8} y={zeroY + h(max) + 4} textAnchor="end">−{max}</text>

        {/* roster size, its own strip and its own scale */}
        <line x1={PAD.left} x2={width - PAD.right} y1={FLOW_H + 6} y2={FLOW_H + 6} stroke={VIZ.grid} strokeWidth="1" />
        <text className="sv-axis" x={PAD.left} y={FLOW_H + 20}>Roster size</text>
        <text className="sv-axis" x={PAD.left - 8} y={trailY(months[0].total) + 4} textAnchor="end">
          {months[0].total}
        </text>
        <path d={trailPath} fill="none" stroke={VIZ.depth[3]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={cx(months.length - 1)} cy={trailY(last.total)} r="5.5" fill={VIZ.surface} />
        <circle cx={cx(months.length - 1)} cy={trailY(last.total)} r="3.5" fill={VIZ.depth[3]} />
        <text className="sv-value" x={cx(months.length - 1) - 8} y={trailY(last.total) - 8} textAnchor="end">
          {last.total} on the roster
        </text>
      </svg>
      {node}
    </div>
  );
}

export default RosterFlow;
