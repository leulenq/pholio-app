import React from 'react';
import { lineRadial, curveLinearClosed } from 'd3-shape';
import { VIZ } from './viz';
import { useMeasure } from './useMeasure';
import { useTooltip } from './useTooltip';
import { TipRows } from './Tooltip';

/**
 * The house's category signature, drawn against the signature of what is
 * arriving. Two closed shapes on the same 0–100 scale — where the incoming
 * shape bulges outside the roster shape, the market is sending the agency
 * something it does not currently represent.
 */

const HEIGHT = 268;
const RINGS = [25, 50, 75, 100];

export function FitRadar({ axes, aLabel = 'Roster', bLabel = 'Incoming' }) {
  const [ref, width] = useMeasure(320);
  const { show, hide, node } = useTooltip();

  const observed = (axes || []).filter((a) => a.roster != null || a.pipeline != null);
  if (observed.length < 3) return <div ref={ref} className="sv-chart" />;

  const cx = width / 2;
  const cy = HEIGHT / 2 - 2;
  const radius = Math.min(cx, cy) - 40;
  const step = (Math.PI * 2) / observed.length;
  const angle = (i) => i * step;
  const point = (i, value) => {
    const a = angle(i) - Math.PI / 2;
    const r = (Math.max(0, Math.min(100, value ?? 0)) / 100) * radius;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };

  const shape = (key) =>
    lineRadial()
      .angle((_, i) => angle(i))
      .radius((d) => ((d[key] ?? 0) / 100) * radius)
      .curve(curveLinearClosed)(observed);

  return (
    <div ref={ref} className="sv-chart sv-chart--center">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={observed
          .map((a) => `${a.axis}: ${aLabel} ${a.roster ?? 'not measured'}, ${bLabel} ${a.pipeline ?? 'not measured'}`)
          .join('; ')}
      >
        <g transform={`translate(${cx},${cy})`}>
          {RINGS.map((ring) => (
            <circle key={ring} r={(ring / 100) * radius} fill="none" stroke={VIZ.grid} strokeWidth="1" />
          ))}
          {observed.map((axis, i) => {
            const a = angle(i) - Math.PI / 2;
            return (
              <line
                key={axis.axis}
                x1={0}
                y1={0}
                x2={Math.cos(a) * radius}
                y2={Math.sin(a) * radius}
                stroke={VIZ.grid}
                strokeWidth="1"
              />
            );
          })}
          <path d={shape('pipeline')} fill={VIZ.series[1]} fillOpacity="0.1" stroke={VIZ.series[1]} strokeWidth="2" strokeLinejoin="round" />
          <path d={shape('roster')} fill={VIZ.series[0]} fillOpacity="0.1" stroke={VIZ.series[0]} strokeWidth="2" strokeLinejoin="round" />
        </g>

        {observed.map((axis, i) => {
          const [px, py] = point(i, axis.roster);
          const a = angle(i) - Math.PI / 2;
          const lx = cx + Math.cos(a) * (radius + 20);
          const ly = cy + Math.sin(a) * (radius + 20);
          const anchor = Math.abs(Math.cos(a)) < 0.3 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
          return (
            <g key={axis.axis}>
              <circle cx={px} cy={py} r="5.5" fill={VIZ.surface} />
              <circle
                cx={px}
                cy={py}
                r="3.5"
                fill={VIZ.series[0]}
                onMouseMove={(e) => {
                  const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                  show(
                    e.clientX - box.left,
                    e.clientY - box.top,
                    <TipRows
                      title={axis.axis}
                      rows={[
                        { label: aLabel, value: axis.roster ?? '—', color: VIZ.series[0] },
                        { label: bLabel, value: axis.pipeline ?? '—', color: VIZ.series[1] },
                        { label: 'Measured on', value: `${axis.rosterSample} / ${axis.pipelineSample}` },
                      ]}
                    />,
                  );
                }}
                onMouseLeave={hide}
              />
              <text className="sv-axis" x={lx} y={ly + 3.5} textAnchor={anchor}>
                {axis.axis}
              </text>
            </g>
          );
        })}
      </svg>
      {node}
    </div>
  );
}

export default FitRadar;
