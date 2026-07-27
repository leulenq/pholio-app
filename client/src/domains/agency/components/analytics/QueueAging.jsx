import React from 'react';
import { VIZ, STAGE_COLOR, SURFACE_GAP, axisScale } from './viz';
import { useMeasure } from './useMeasure';
import { useTooltip } from './useTooltip';
import { TipRows } from './Tooltip';

/**
 * Open work by how long it has been sitting untouched.
 *
 * Age is measured from the last recorded action, not from the submission date,
 * because a submission worked on yesterday is not stale no matter when it
 * arrived. Bars are split by the stage the talent is waiting in.
 */

const ROW_H = 40;
const BAR_H = 18;
const LABEL_W = 108;
const PAD_R = 46;

export function QueueAging({ queue }) {
  const [ref, width] = useMeasure(360);
  const { show, hide, node } = useTooltip();

  const buckets = queue?.buckets || [];
  const stages = queue?.stages || [];
  if (!buckets.length) return <div ref={ref} className="sv-chart" />;

  const { max } = axisScale(Math.max(1, ...buckets.map((b) => b.count)));
  const plotW = Math.max(40, width - LABEL_W - PAD_R);
  const height = buckets.length * ROW_H + 8;

  return (
    <div ref={ref} className="sv-chart">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Open submissions by time since last action: ${buckets
          .map((b) => `${b.label} ${b.count}`)
          .join(', ')}`}
      >
        {buckets.map((bucket, i) => {
          const y = i * ROW_H + 4;
          let acc = 0;
          return (
            <g key={bucket.key}>
              <text className="sv-axis sv-axis--row" x={0} y={y + BAR_H / 2 + 3.5}>
                {bucket.label}
              </text>
              {bucket.count === 0 ? (
                <line
                  x1={LABEL_W}
                  x2={LABEL_W + 6}
                  y1={y + BAR_H / 2}
                  y2={y + BAR_H / 2}
                  stroke={VIZ.axis}
                  strokeWidth="1"
                />
              ) : (
                stages.map((stage) => {
                  const value = bucket[stage] || 0;
                  if (!value) return null;
                  const x = LABEL_W + (acc / max) * plotW;
                  const w = Math.max(2, (value / max) * plotW - SURFACE_GAP);
                  acc += value;
                  return (
                    <rect
                      key={stage}
                      x={x}
                      y={y}
                      width={w}
                      height={BAR_H}
                      rx="2"
                      fill={STAGE_COLOR[stage]}
                      onMouseMove={(e) => {
                        const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                        show(
                          e.clientX - box.left,
                          e.clientY - box.top,
                          <TipRows
                            title={bucket.label}
                            subtitle={`${bucket.count} open`}
                            rows={[{ label: stage, value, color: STAGE_COLOR[stage] }]}
                          />,
                        );
                      }}
                      onMouseLeave={hide}
                    />
                  );
                })
              )}
              <text className="sv-value" x={LABEL_W + (bucket.count / max) * plotW + 8} y={y + BAR_H / 2 + 4}>
                {bucket.count}
              </text>
              {bucket.unviewed > 0 ? (
                <text
                  className="sv-axis sv-axis--warn"
                  x={LABEL_W + (bucket.count / max) * plotW + 8}
                  y={y + BAR_H + 12}
                >
                  {bucket.unviewed} never opened
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {node}
    </div>
  );
}

export default QueueAging;
