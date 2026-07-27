import React from 'react';
import { VIZ, axisScale } from './viz';
import { useMeasure } from './useMeasure';
import { useTooltip } from './useTooltip';
import { TipRows } from './Tooltip';

/**
 * Ranked horizontal bars — the workhorse for nominal breakdowns (markets,
 * divisions, team load, interview types, latency bands).
 *
 * One series, one hue: colouring each bar by its own value would spend the
 * identity channel re-encoding what bar length already shows. Ordered bands
 * (latency, tenure) pass `ordinal` and take the depth ramp instead, so the
 * reader sees the order in the colour.
 */

const ROW_H = 30;
const BAR_H = 16;

export function DistributionBars({
  items,
  labelWidth = 116,
  color = VIZ.series[0],
  ordinal = false,
  suffix = '',
  emphasis = null,
}) {
  const [ref, width] = useMeasure(340);
  const { show, hide, node } = useTooltip();

  if (!items?.length) return <div ref={ref} className="sv-chart" />;

  const { max } = axisScale(Math.max(1, ...items.map((d) => d.value || 0)));
  const valueW = 46;
  const plotW = Math.max(30, width - labelWidth - valueW);
  const height = items.length * ROW_H + 4;

  const fillFor = (i) => {
    if (!ordinal) return color;
    const ramp = VIZ.ordinal;
    return ramp[Math.min(ramp.length - 1, Math.floor((i / Math.max(1, items.length - 1)) * (ramp.length - 1)))];
  };

  // Row labels sit in a fixed gutter, so a long board or market name is
  // trimmed to fit rather than running under its own bar. The full name
  // stays in the tooltip and the table view.
  const clip = (label) => {
    const budget = Math.max(6, Math.floor((labelWidth - 8) / 6.1));
    return label.length > budget ? `${label.slice(0, budget - 1).trimEnd()}…` : label;
  };

  return (
    <div ref={ref} className="sv-chart">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={items.map((d) => `${d.label} ${d.value}${suffix}`).join(', ')}
      >
        {items.map((item, i) => {
          const y = i * ROW_H + 2;
          const value = item.value || 0;
          const w = value > 0 ? Math.max(2, (value / max) * plotW) : 0;
          const fill = emphasis && item.label === emphasis ? VIZ.depth[3] : fillFor(i);
          return (
            <g key={item.key || item.label}>
              <text className="sv-axis sv-axis--row" x={0} y={y + BAR_H / 2 + 3.5}>
                {clip(item.label)}
                <title>{item.label}</title>
              </text>
              {w > 0 ? (
                <rect
                  x={labelWidth}
                  y={y}
                  width={w}
                  height={BAR_H}
                  rx="2"
                  fill={fill}
                  onMouseMove={(e) => {
                    const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                    show(
                      e.clientX - box.left,
                      e.clientY - box.top,
                      <TipRows
                        title={item.label}
                        rows={[
                          { label: item.valueLabel || 'Count', value: `${value}${suffix}`, color: fill },
                          ...(item.note ? [{ label: 'Note', value: item.note }] : []),
                        ]}
                      />,
                    );
                  }}
                  onMouseLeave={hide}
                />
              ) : (
                <line x1={labelWidth} x2={labelWidth + 6} y1={y + BAR_H / 2} y2={y + BAR_H / 2} stroke={VIZ.axis} strokeWidth="1" />
              )}
              <text className="sv-value" x={labelWidth + w + 8} y={y + BAR_H / 2 + 4}>
                {value}{suffix}
              </text>
              {item.note ? (
                <text className="sv-axis" x={labelWidth} y={y + BAR_H + 11}>{item.note}</text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {node}
    </div>
  );
}

/**
 * A rate as a filled track — used where the answer is one proportion and a bar
 * chart of two numbers would be a two-slice pie in disguise.
 */
export function Meter({ label, value, caption, tone = 'gold' }) {
  const pct = value == null ? null : Math.max(0, Math.min(100, value));
  const fill = tone === 'good' ? VIZ.status.good : tone === 'bad' ? VIZ.status.critical : VIZ.depth[2];
  return (
    <div className="sv-meter">
      <div className="sv-meter-head">
        <span className="sv-meter-label">{label}</span>
        <span className="sv-meter-value">{pct == null ? '—' : `${pct}%`}</span>
      </div>
      <div className="sv-meter-track">
        <div className="sv-meter-fill" style={{ width: `${pct ?? 0}%`, background: fill }} />
      </div>
      {caption ? <span className="sv-meter-caption">{caption}</span> : null}
    </div>
  );
}

export default DistributionBars;
