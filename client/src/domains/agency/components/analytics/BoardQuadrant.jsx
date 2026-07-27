import React from 'react';
import { VIZ } from './viz';
import { useMeasure } from './useMeasure';
import { useTooltip } from './useTooltip';
import { TipRows } from './Tooltip';

/**
 * Boards placed by how well they score against how often they convert.
 *
 * One series, so identity comes from the direct label beside each mark rather
 * than from hue — which also keeps the plot inside the all-pairs separation
 * rule no matter how many boards an agency runs. Bubble area is submission
 * volume. The crosshair sits at the agency's own medians, so the quadrants are
 * read against this desk, not an invented benchmark.
 */

const PAD = { top: 18, right: 142, bottom: 34, left: 38 };
const HEIGHT = 268;

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function BoardQuadrant({ boards }) {
  const [ref, width] = useMeasure(420);
  const { show, hide, node } = useTooltip();

  const plotted = (boards || []).filter(
    (b) => b.submissions > 0 && b.averageMatch != null && b.advanceRate != null,
  );
  if (!plotted.length) return <div ref={ref} className="sv-chart" />;

  const plotW = Math.max(40, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const maxVolume = Math.max(...plotted.map((b) => b.submissions));
  const x = (score) => PAD.left + (Math.max(0, Math.min(100, score)) / 100) * plotW;
  const y = (rate) => PAD.top + plotH - (Math.max(0, Math.min(100, rate)) / 100) * plotH;
  const r = (volume) => 5 + Math.sqrt(volume / maxVolume) * 13;

  const midX = median(plotted.map((b) => b.averageMatch));
  const midY = median(plotted.map((b) => b.advanceRate));

  /**
   * Labels ride the marks, but boards cluster — so they are placed in a
   * right-hand column and pushed apart to a legible rhythm, with a leader line
   * back to the bubble. Stacking them on top of the marks (or letting them
   * overlap) detaches the label from its board and reads as noise.
   */
  const LABEL_GAP = 15;
  const labelX = width - 4;
  const placed = plotted
    .map((board) => ({
      board,
      cx: x(board.averageMatch),
      cy: y(board.advanceRate),
      r: r(board.submissions),
      labelY: y(board.advanceRate),
    }))
    .sort((a, b) => a.labelY - b.labelY);

  placed.forEach((item, i) => {
    if (i === 0) {
      item.labelY = Math.max(PAD.top + 6, item.labelY);
      return;
    }
    item.labelY = Math.max(item.labelY, placed[i - 1].labelY + LABEL_GAP);
  });
  // Pull the stack back inside the plot if it ran past the bottom.
  const overflow = placed.length
    ? placed[placed.length - 1].labelY - (PAD.top + plotH)
    : 0;
  if (overflow > 0) {
    for (let i = placed.length - 1; i >= 0; i -= 1) {
      placed[i].labelY -= overflow;
      if (i > 0 && placed[i - 1].labelY > placed[i].labelY - LABEL_GAP) {
        placed[i - 1].labelY = placed[i].labelY - LABEL_GAP;
      }
    }
  }

  return (
    <div ref={ref} className="sv-chart">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Boards by average match score and advance rate: ${plotted
          .map((b) => `${b.name} scores ${b.averageMatch}, advances ${b.advanceRate}%`)
          .join('; ')}`}
      >
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke={VIZ.grid} strokeWidth="1" />
            <text className="sv-axis" x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end">{t}%</text>
          </g>
        ))}

        {midX != null ? (
          <line x1={x(midX)} x2={x(midX)} y1={PAD.top} y2={PAD.top + plotH} stroke={VIZ.axis} strokeWidth="1" />
        ) : null}
        {midY != null ? (
          <line x1={PAD.left} x2={PAD.left + plotW} y1={y(midY)} y2={y(midY)} stroke={VIZ.axis} strokeWidth="1" />
        ) : null}

        {placed.map(({ board, cx, cy, r: radius, labelY }) => {
          const name = board.name.length > 22 ? `${board.name.slice(0, 21).trimEnd()}…` : board.name;
          return (
            <g key={board.id}>
              <path
                d={`M${cx + radius + 3},${cy} L${labelX - name.length * 5.7 - 6},${labelY}`}
                stroke={VIZ.grid}
                strokeWidth="1"
                fill="none"
              />
              <circle cx={cx} cy={cy} r={radius + 2} fill={VIZ.surface} />
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill={VIZ.series[0]}
                fillOpacity="0.75"
                onMouseMove={(e) => {
                  const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                  show(
                    e.clientX - box.left,
                    e.clientY - box.top,
                    <TipRows
                      title={board.name}
                      subtitle={board.clientName || undefined}
                      rows={[
                        { label: 'Submissions', value: board.submissions },
                        { label: 'Average match', value: board.averageMatch },
                        { label: 'Advance rate', value: `${board.advanceRate}%` },
                        { label: 'Signed', value: board.signed },
                        ...(board.targetSlots
                          ? [{ label: 'Slots filled', value: `${board.filled} of ${board.targetSlots}` }]
                          : []),
                      ]}
                    />,
                  );
                }}
                onMouseLeave={hide}
              />
              <text className="sv-scatter-label" x={labelX} y={labelY + 3.5} textAnchor="end">
                {name}
                <title>{board.name}</title>
              </text>
            </g>
          );
        })}

        <line x1={PAD.left} x2={PAD.left + plotW} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke={VIZ.axis} strokeWidth="1" />
        {[0, 50, 100].map((t) => (
          <text className="sv-axis" key={t} x={x(t)} y={HEIGHT - 16} textAnchor="middle">{t}</text>
        ))}
        <text className="sv-axis" x={PAD.left} y={HEIGHT - 3}>Average match score →</text>
      </svg>
      {node}
    </div>
  );
}

export default BoardQuadrant;
