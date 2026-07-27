import React from 'react';
import { VIZ, SURFACE_GAP, axisScale } from './viz';
import { useMeasure } from './useMeasure';
import { useTooltip } from './useTooltip';
import { TipRows } from './Tooltip';

/**
 * The roster's shape against the shape of what is coming in.
 *
 * Both series are normalised to their own totals and drawn as shares, because
 * a roster of 40 and an intake of 400 cannot be compared as raw counts — and
 * putting two different scales on one plot is exactly the dual-axis mistake.
 * Raw counts stay available in the tooltip and the table view.
 */

const PAD = { top: 14, right: 10, bottom: 40, left: 32 };
const HEIGHT = 220;
const MAX_BAR = 22;

export function PairedHistogram({ bins, aLabel = 'Roster', bLabel = 'Incoming' }) {
  const [ref, width] = useMeasure(420);
  const { show, hide, node } = useTooltip();

  if (!bins?.length) return <div ref={ref} className="sv-chart" />;

  const totalA = bins.reduce((sum, b) => sum + (b.roster || 0), 0);
  const totalB = bins.reduce((sum, b) => sum + (b.pipeline || 0), 0);
  const pct = (value, total) => (total ? (value / total) * 100 : 0);
  const { max, ticks: yTicks } = axisScale(
    Math.max(1, ...bins.map((b) => Math.max(pct(b.roster, totalA), pct(b.pipeline, totalB)))),
    { count: 2 },
  );

  const plotW = Math.max(40, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = plotW / bins.length;
  const barW = Math.min(MAX_BAR, (band - SURFACE_GAP * 3) / 2);
  const y = (v) => PAD.top + plotH - (v / max) * plotH;

  return (
    <div ref={ref} className="sv-chart">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`${aLabel} against ${bLabel}, as a share of each group, by band: ${bins
          .map((b) => `${b.label} ${Math.round(pct(b.roster, totalA))}% versus ${Math.round(pct(b.pipeline, totalB))}%`)
          .join('; ')}`}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={VIZ.grid} strokeWidth="1" />
            <text className="sv-axis" x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end">{Math.round(t)}%</text>
          </g>
        ))}

        {bins.map((bin, i) => {
          const cx = PAD.left + band * i + band / 2;
          const a = pct(bin.roster, totalA);
          const b = pct(bin.pipeline, totalB);
          const hover = (e, label, value, count, color) => {
            const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
            show(
              e.clientX - box.left,
              e.clientY - box.top,
              <TipRows
                title={bin.label}
                rows={[
                  { label, value: `${Math.round(value)}% · ${count}`, color },
                ]}
              />,
            );
          };
          return (
            <g key={bin.key}>
              {a > 0 ? (
                <rect
                  x={cx - barW - SURFACE_GAP / 2}
                  y={y(a)}
                  width={barW}
                  height={Math.max(2, PAD.top + plotH - y(a))}
                  rx="2"
                  fill={VIZ.series[0]}
                  onMouseMove={(e) => hover(e, aLabel, a, bin.roster, VIZ.series[0])}
                  onMouseLeave={hide}
                />
              ) : null}
              {b > 0 ? (
                <rect
                  x={cx + SURFACE_GAP / 2}
                  y={y(b)}
                  width={barW}
                  height={Math.max(2, PAD.top + plotH - y(b))}
                  rx="2"
                  fill={VIZ.series[1]}
                  onMouseMove={(e) => hover(e, bLabel, b, bin.pipeline, VIZ.series[1])}
                  onMouseLeave={hide}
                />
              ) : null}
              <text className="sv-axis" x={cx} y={HEIGHT - 22} textAnchor="middle">{bin.label}</text>
            </g>
          );
        })}

        <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke={VIZ.axis} strokeWidth="1" />
      </svg>
      {node}
    </div>
  );
}

export default PairedHistogram;
