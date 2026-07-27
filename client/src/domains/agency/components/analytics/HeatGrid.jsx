import React from 'react';
import { VIZ, heatStep, inkOn, DOW_LABELS, formatHour, formatMonth } from './viz';
import { useMeasure } from './useMeasure';
import { useTooltip } from './useTooltip';
import { TipRows } from './Tooltip';

/**
 * Two magnitude surfaces on one sequential ramp (one hue, light → dark).
 *
 * `Punchcard` — when the desk actually works, day of week against hour, in the
 * viewer's own timezone (the server buckets on the offset the client sends).
 * `CohortGrid` — how far each month's intake got, as a share of that month.
 *
 * A sequential ramp is used because both encode "how much", not identity; the
 * light end is allowed to recede into the surface, which is what "near zero"
 * should look like.
 */

const CELL_GAP = 2;

export function Punchcard({ punchcard, punchMax }) {
  const [ref, width] = useMeasure(720);
  const { show, hide, node } = useTooltip();

  const LABEL_W = 34;
  const cells = punchcard || [];
  if (!cells.length) return <div ref={ref} className="sv-chart" />;

  const cellW = Math.max(6, (width - LABEL_W - 4) / 24 - CELL_GAP);
  const cellH = 18;
  const height = 7 * (cellH + CELL_GAP) + 22;

  const dayTotals = DOW_LABELS.map((_, dow) =>
    cells.filter((c) => c.dow === dow).reduce((sum, c) => sum + c.count, 0),
  );
  const busiest = Math.max(...cells.map((c) => c.count), 0);

  return (
    <div ref={ref} className="sv-chart">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Desk activity by day and hour. Busiest hour holds ${busiest} actions. Daily totals: ${DOW_LABELS.map(
          (d, i) => `${d} ${dayTotals[i]}`,
        ).join(', ')}`}
      >
        {DOW_LABELS.map((label, dow) => (
          <text className="sv-axis" key={label} x={0} y={dow * (cellH + CELL_GAP) + cellH / 2 + 3.5}>
            {label}
          </text>
        ))}
        {cells.map((cell) => {
          const intensity = punchMax ? cell.count / punchMax : 0;
          const fill = cell.count === 0 ? VIZ.plane : heatStep(intensity);
          return (
            <rect
              key={`${cell.dow}-${cell.hour}`}
              x={LABEL_W + cell.hour * (cellW + CELL_GAP)}
              y={cell.dow * (cellH + CELL_GAP)}
              width={cellW}
              height={cellH}
              rx="2"
              fill={fill}
              onMouseMove={(e) => {
                const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                show(
                  e.clientX - box.left,
                  e.clientY - box.top,
                  <TipRows
                    title={`${DOW_LABELS[cell.dow]} ${formatHour(cell.hour)}`}
                    rows={[{ label: 'Actions', value: cell.count, color: fill }]}
                  />,
                );
              }}
              onMouseLeave={hide}
            />
          );
        })}
        {[0, 6, 12, 18, 23].map((hour) => (
          <text
            className="sv-axis"
            key={hour}
            x={LABEL_W + hour * (cellW + CELL_GAP) + cellW / 2}
            y={height - 6}
            textAnchor="middle"
          >
            {formatHour(hour)}
          </text>
        ))}
      </svg>
      {node}
    </div>
  );
}

export function CohortGrid({ cohorts, stages }) {
  const [ref, width] = useMeasure(720);
  const { show, hide, node } = useTooltip();

  if (!cohorts?.length) return <div ref={ref} className="sv-chart" />;

  const LABEL_W = 84;
  const rowH = 30;
  const cellW = Math.max(48, (width - LABEL_W - 4) / stages.length - CELL_GAP);
  const height = cohorts.length * (rowH + CELL_GAP) + 26;

  return (
    <div ref={ref} className="sv-chart">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Monthly submission cohorts and the share of each that reached every stage`}
      >
        {stages.map((stage, i) => (
          <text
            className="sv-axis"
            key={stage}
            x={LABEL_W + i * (cellW + CELL_GAP) + cellW / 2}
            y={12}
            textAnchor="middle"
          >
            {stage}
          </text>
        ))}
        {cohorts.map((cohort, r) => {
          const y = 22 + r * (rowH + CELL_GAP);
          return (
            <g key={cohort.month}>
              <text className="sv-axis sv-axis--row" x={0} y={y + rowH / 2 + 3.5}>
                {formatMonth(cohort.month)}
                <tspan className="sv-cell-base"> n={cohort.size}</tspan>
              </text>
              {cohort.stages.map((cell, i) => {
                const rate = cell.rate ?? 0;
                const fill = cell.count === 0 ? VIZ.plane : heatStep(rate / 100);
                return (
                  <g key={cell.stage}>
                    <rect
                      x={LABEL_W + i * (cellW + CELL_GAP)}
                      y={y}
                      width={cellW}
                      height={rowH}
                      rx="2"
                      fill={fill}
                      onMouseMove={(e) => {
                        const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                        show(
                          e.clientX - box.left,
                          e.clientY - box.top,
                          <TipRows
                            title={`${formatMonth(cohort.month)} · ${cell.stage}`}
                            subtitle={`${cohort.size} submitted that month`}
                            rows={[
                              { label: 'Reached', value: cell.count, color: fill },
                              { label: 'Share', value: `${rate}%` },
                            ]}
                          />
                        );
                      }}
                      onMouseLeave={hide}
                    />
                    {cell.count > 0 ? (
                      <text
                        className="sv-cell-label"
                        x={LABEL_W + i * (cellW + CELL_GAP) + cellW / 2}
                        y={y + rowH / 2 + 4}
                        textAnchor="middle"
                        fill={inkOn(fill)}
                      >
                        {rate}%
                      </text>
                    ) : null}
                  </g>
                );
              })}

            </g>
          );
        })}
      </svg>
      {node}
    </div>
  );
}
