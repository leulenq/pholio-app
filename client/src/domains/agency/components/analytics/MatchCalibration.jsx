import React from 'react';
import { VIZ, SURFACE_GAP, axisScale } from './viz';
import { useMeasure } from './useMeasure';
import { useTooltip } from './useTooltip';
import { TipRows } from './Tooltip';

/**
 * Does the match score predict what the desk actually does?
 *
 * Each score band is a column split by outcome, with the share that advanced
 * drawn as a line across the tops. If scoring is calibrated the line climbs
 * left to right; if it is flat, the score is decorative and the panel says so.
 */

const PAD = { top: 16, right: 12, bottom: 42, left: 30 };
const HEIGHT = 216;
const MAX_BAR = 24;

const LAYERS = [
  { key: 'passed', label: 'Passed', color: VIZ.exit },
  { key: 'signed', label: 'Signed', color: VIZ.depth[3] },
  { key: 'advanced', label: 'Advanced', color: VIZ.depth[2] },
  { key: 'open', label: 'Still open', color: VIZ.depth[0] },
];

export function MatchCalibration({ calibration }) {
  const [ref, width] = useMeasure(420);
  const { show, hide, node } = useTooltip();

  const bins = calibration?.bins || [];
  if (!bins.length) return <div ref={ref} className="sv-chart" />;

  const plotW = Math.max(40, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const { max, ticks: yTicks } = axisScale(Math.max(1, ...bins.map((b) => b.total)));
  const band = plotW / bins.length;
  const barW = Math.min(MAX_BAR, band * 0.52);
  const cx = (i) => PAD.left + band * i + band / 2;
  const y = (v) => PAD.top + plotH - (v / max) * plotH;

  const ratePoints = bins
    .map((b, i) =>
      b.advanceRate == null
        ? null
        : { x: cx(i), y: PAD.top + plotH - (b.advanceRate / 100) * plotH, bin: b, index: i },
    )
    .filter(Boolean);
  const peak = ratePoints.length
    ? ratePoints.reduce((best, p) => (p.bin.advanceRate > best.bin.advanceRate ? p : best))
    : null;

  return (
    <div ref={ref} className="sv-chart">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Submissions by match score band and outcome, ${calibration.sample} scored`}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={VIZ.grid} strokeWidth="1" />
            <text className="sv-axis" x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end">
              {Math.round(t)}
            </text>
          </g>
        ))}

        {bins.map((bin, i) => {
          let acc = 0;
          return (
            <g key={bin.key}>
              {LAYERS.map((layer) => {
                const value = bin[layer.key] || 0;
                if (!value) return null;
                const h = Math.max(2, (value / max) * plotH - SURFACE_GAP);
                const top = y(acc + value);
                acc += value;
                return (
                  <rect
                    key={layer.key}
                    x={cx(i) - barW / 2}
                    y={top}
                    width={barW}
                    height={h}
                    rx="2"
                    fill={layer.color}
                    onMouseMove={(e) => {
                      const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                      show(
                        e.clientX - box.left,
                        e.clientY - box.top,
                        <TipRows
                          title={`Match ${bin.label}`}
                          subtitle={`${bin.total} scored · ${bin.advanceRate != null ? `${bin.advanceRate}% advanced` : 'no decisions yet'}`}
                          rows={LAYERS.filter((l) => bin[l.key] > 0).map((l) => ({
                            label: l.label,
                            value: bin[l.key],
                            color: l.color,
                          }))}
                        />,
                      );
                    }}
                    onMouseLeave={hide}
                  />
                );
              })}
              {bin.total > 0 && !(peak && i === peak.index && Math.abs(peak.y - y(bin.total)) < 24) ? (
                <text className="sv-value" x={cx(i)} y={y(bin.total) - 7} textAnchor="middle">
                  {bin.total}
                </text>
              ) : null}
              <text className="sv-axis" x={cx(i)} y={HEIGHT - 24} textAnchor="middle">
                {band < 62 ? bin.key : bin.label}
              </text>
            </g>
          );
        })}

        {ratePoints.length > 1 ? (
          <>
            <path
              d={ratePoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={VIZ.series[1]}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {ratePoints.map((p) => (
              <g key={p.bin.key}>
                <circle cx={p.x} cy={p.y} r="5.5" fill={VIZ.surface} />
                <circle cx={p.x} cy={p.y} r="3.5" fill={VIZ.series[1]} />
              </g>
            ))}
            {/* One direct label, on the band that advances most, placed clear
                of that band's own column value. */}
            {peak ? (
              <text
                className="sv-value"
                x={peak.x}
                y={Math.min(peak.y, y(peak.bin.total)) - 12}
                textAnchor={peak.index === bins.length - 1 ? 'end' : 'middle'}
              >
                {peak.bin.advanceRate}% advance
              </text>
            ) : null}
          </>
        ) : null}

        <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke={VIZ.axis} strokeWidth="1" />
        <text className="sv-axis" x={PAD.left} y={HEIGHT - 6}>Match score</text>
      </svg>
      {node}
    </div>
  );
}

export default MatchCalibration;
