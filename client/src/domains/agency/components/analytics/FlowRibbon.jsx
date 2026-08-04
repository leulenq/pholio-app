import React from 'react';
import { VIZ, SURFACE_GAP } from './viz';
import { useMeasure } from './useMeasure';
import { useTooltip } from './useTooltip';
import { TipRows } from './Tooltip';

/**
 * The pipeline as it actually flowed.
 *
 * A cohort of submissions enters at Applied and the band thins left to right:
 * what advanced carries on, what is still sitting somewhere peels into the
 * holding lane, what closed peels into the exit lane, and what survives
 * to the right-hand terminal is signed. Every figure is evidenced — a stage is
 * only counted as reached where a recorded status change or the current status
 * says so, so a status jump never invents the hand-offs it skipped.
 *
 * The composition is data-driven: the lanes take only the vertical room the
 * drop-off actually needs, so a clean season draws a tight band and a leaky one
 * draws its own problem at full height.
 */

const BAR_W = 15;
const PAD_X = 4;
const TAIL_W = 104; // terminal cap + its label, reserved so nothing overflows
const HEAD_H = 66;
const BAND_H = 128;
const MIN_THICK = 2.5;

function ribbon(x0, y0a, y0b, x1, y1a, y1b) {
  const cx0 = x0 + (x1 - x0) * 0.5;
  const cx1 = x1 - (x1 - x0) * 0.5;
  return [
    `M${x0},${y0a}`,
    `C${cx0},${y0a} ${cx1},${y1a} ${x1},${y1a}`,
    `L${x1},${y1b}`,
    `C${cx1},${y1b} ${cx0},${y0b} ${x0},${y0b}`,
    'Z',
  ].join(' ');
}

/**
 * Below about 620px the four-column ribbon cannot hold its stage headers apart,
 * so the same flow is redrawn as stacked rows: each stage a bar split into what
 * advanced, what is holding, and what closed. Same numbers, same colours,
 * a shape that survives a phone.
 */
function FlowRows({ stages, cohort, show, hide }) {
  const ROW_H = 62;
  const BAR_H = 16;

  return (
    <div className="sv-flow-rows">
      {stages.map((stage, i) => {
        const color = VIZ.depth[i] || VIZ.depth[VIZ.depth.length - 1];
        const isLast = i === stages.length - 1;
        const parts = isLast
          ? [{ key: 'signed', value: stage.reached, color, label: 'signed' }]
          : [
              { key: 'advanced', value: stage.advanced, color: VIZ.depth[i + 1], label: 'advanced' },
              { key: 'held', value: stage.held, color, label: 'holding' },
              { key: 'exited', value: stage.exited, color: VIZ.exit, label: 'closed' },
            ];
        return (
          <div className="sv-flow-row" key={stage.stage} style={{ minHeight: ROW_H }}>
            <div className="sv-flow-row-head">
              <span className="sv-flow-row-stage">{stage.stage}</span>
              <span className="sv-flow-row-count">{stage.reached}</span>
            </div>
            <div className="sv-flow-row-bar" style={{ height: BAR_H }}>
              {parts
                .filter((p) => p.value > 0)
                .map((p) => (
                  <span
                    key={p.key}
                    className="sv-flow-row-seg"
                    style={{ width: `${(p.value / cohort) * 100}%`, background: p.color }}
                    onMouseMove={(e) =>
                      show(
                        e.clientX - e.currentTarget.closest('.sv-chart').getBoundingClientRect().left,
                        e.clientY - e.currentTarget.closest('.sv-chart').getBoundingClientRect().top,
                        <TipRows title={stage.stage} rows={[{ label: p.label, value: p.value, color: p.color }]} />,
                      )
                    }
                    onMouseLeave={hide}
                  />
                ))}
            </div>
            <p className="sv-flow-row-note">
              {parts
                .filter((p) => p.value > 0)
                .map((p) => `${p.value} ${p.label}`)
                .join(' · ')}
              {stage.medianDwellDays != null ? ` · ${stage.medianDwellDays}d median` : ''}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function FlowRibbon({ flow }) {
  const [ref, width] = useMeasure(760);
  const { show, hide, node } = useTooltip();

  const stages = flow?.stages || [];
  const cohort = stages[0]?.reached || 0;
  if (!stages.length || !cohort) {
    return <div ref={ref} className="sv-chart" />;
  }

  if (width < 620) {
    return (
      <div ref={ref} className="sv-chart">
        <FlowRows stages={stages} cohort={cohort} show={show} hide={hide} />
        {node}
      </div>
    );
  }

  const lastIndex = stages.length - 1;
  const unit = BAND_H / cohort;
  const thick = (value) => (value > 0 ? Math.max(MIN_THICK, value * unit) : 0);

  const inner = Math.max(200, width - PAD_X * 2 - TAIL_W);
  const gapW = (inner - stages.length * BAR_W) / lastIndex;
  const colX = (i) => PAD_X + i * (BAR_W + gapW);

  const bandTop = HEAD_H;
  const holdLaneTop = bandTop + BAND_H + 26;
  // The terminal stage's "held" is the signed outcome, not a stalled queue, so
  // it never contributes to the holding lane's height.
  const maxHold = Math.max(
    0,
    ...stages.slice(0, lastIndex).map((s) => thick(s.held)),
  );
  const exitLaneTop = holdLaneTop + maxHold + 32;
  const maxExit = Math.max(0, ...stages.map((s) => thick(s.exited)));
  const height = Math.round(exitLaneTop + maxExit + 32);

  const tip = (event, title, subtitle, rows) => {
    const box = event.currentTarget.ownerSVGElement.getBoundingClientRect();
    show(
      event.clientX - box.left,
      event.clientY - box.top,
      <TipRows title={title} subtitle={subtitle} rows={rows} />,
    );
  };

  return (
    <div ref={ref} className="sv-chart">
      <svg
        width={width}
        height={height}
        className="sv-flow"
        role="img"
        aria-label={`Pipeline flow for ${cohort} submissions: ${stages
          .map((s) => `${s.reached} reached ${s.stage}`)
          .join(', ')}`}
      >
        <line
          x1={PAD_X}
          x2={width - PAD_X}
          y1={bandTop + BAND_H + 12}
          y2={bandTop + BAND_H + 12}
          stroke={VIZ.grid}
          strokeWidth="1"
        />

        {stages.map((stage, i) => {
          const x = colX(i);
          const isLast = i === lastIndex;
          const h = thick(stage.reached);
          const advanceT = thick(stage.advanced);
          const holdT = thick(stage.held);
          const exitT = thick(stage.exited);
          const color = VIZ.depth[i] || VIZ.depth[VIZ.depth.length - 1];
          const gapStart = x + BAR_W;
          const gapEnd = isLast ? gapStart : colX(i + 1);
          const peelEnd = isLast ? gapStart + 34 : gapStart + gapW * 0.62;

          // Source bands stack down the bar: advance first, then held, then exit.
          const advTop = bandTop;
          const holdTop = advTop + advanceT;
          const exitTop = holdTop + holdT;

          return (
            <g key={stage.stage}>
              {!isLast && advanceT > 0 ? (
                <path
                  d={ribbon(
                    gapStart,
                    advTop,
                    advTop + advanceT,
                    gapEnd,
                    bandTop,
                    bandTop + thick(stages[i + 1].reached),
                  )}
                  fill={VIZ.depth[i + 1]}
                  fillOpacity="0.45"
                  onMouseMove={(e) =>
                    tip(e, `${stage.stage} → ${stages[i + 1].stage}`, null, [
                      { label: 'Advanced', value: stage.advanced, color: VIZ.depth[i + 1] },
                      { label: 'Conversion', value: stage.conversion != null ? `${stage.conversion}%` : '—' },
                      {
                        label: 'Median in stage',
                        value: stage.medianDwellDays != null ? `${stage.medianDwellDays}d` : 'not yet timed',
                      },
                    ])
                  }
                  onMouseLeave={hide}
                />
              ) : null}

              {/* still sitting in this stage — the terminal stage has none */}
              {!isLast && holdT > 0 ? (
                <>
                  <path
                    d={ribbon(gapStart, holdTop, holdTop + holdT, peelEnd, holdLaneTop, holdLaneTop + holdT)}
                    fill={color}
                    fillOpacity="0.28"
                    onMouseMove={(e) =>
                      tip(e, `Holding at ${stage.stage}`, null, [
                        { label: 'Still open', value: stage.held, color },
                      ])
                    }
                    onMouseLeave={hide}
                  />
                  <rect x={peelEnd} y={holdLaneTop} width={3} height={holdT} fill={color} />
                  <text className="sv-flow-peel" x={peelEnd + 8} y={holdLaneTop + holdT / 2 + 3.5}>
                    {stage.held} holding
                  </text>
                </>
              ) : null}

              {exitT > 0 ? (
                <>
                  <path
                    d={ribbon(gapStart, exitTop, exitTop + exitT, peelEnd, exitLaneTop, exitLaneTop + exitT)}
                    fill={VIZ.exit}
                    fillOpacity="0.3"
                    onMouseMove={(e) =>
                      tip(e, `Closed from ${stage.stage}`, null, [
                        ...(stage.passed ? [{ label: 'Passed', value: stage.passed, color: VIZ.exit }] : []),
                        ...(stage.keptOnFile ? [{ label: 'Kept on file', value: stage.keptOnFile, color: VIZ.keptOnFile }] : []),
                        ...(stage.withdrawn ? [{ label: 'Withdrawn', value: stage.withdrawn, color: VIZ.withdrawn }] : []),
                      ])
                    }
                    onMouseLeave={hide}
                  />
                  <rect x={peelEnd} y={exitLaneTop} width={3} height={exitT} fill={VIZ.exit} />
                  <text className="sv-flow-peel" x={peelEnd + 8} y={exitLaneTop + exitT / 2 + 3.5}>
                    {stage.exited} closed
                  </text>
                </>
              ) : null}

              {/* the terminal: what came through */}
              {isLast && h > 0 ? (
                <>
                  <path
                    d={ribbon(gapStart, bandTop, bandTop + h, gapStart + 30, bandTop, bandTop + h)}
                    fill={color}
                    fillOpacity="0.45"
                  />
                  <rect x={gapStart + 30} y={bandTop} width={3} height={h} fill={color} />
                  <text className="sv-flow-peel" x={gapStart + 38} y={bandTop + h / 2 + 3.5}>
                    {stage.reached} signed
                  </text>
                </>
              ) : null}

              <rect
                x={x}
                y={bandTop}
                width={BAR_W}
                height={Math.max(h, 1)}
                rx="2"
                fill={color}
                onMouseMove={(e) =>
                  tip(e, stage.stage, `${stage.reached} of ${cohort} submissions reached this stage`, [
                    ...(isLast ? [] : [{ label: 'Advanced', value: stage.advanced }, { label: 'Holding', value: stage.held }]),
                    { label: 'Closed', value: stage.exited },
                    {
                      label: 'Median in stage',
                      value:
                        stage.medianDwellDays != null
                          ? `${stage.medianDwellDays}d over ${stage.dwellSample}`
                          : 'not yet timed',
                    },
                  ])
                }
                onMouseLeave={hide}
              />

              {/* stage header — name over count, so nothing collides */}
              <text className="sv-flow-stage" x={x} y={20}>{stage.stage}</text>
              <text className="sv-flow-count" x={x} y={48}>{stage.reached}</text>

              {/* conversion rides the gap it describes */}
              {!isLast && stage.conversion != null ? (
                <text className="sv-flow-conv" x={gapStart + gapW / 2} y={48} textAnchor="middle">
                  {stage.conversion}% advance
                </text>
              ) : null}

              <text className="sv-flow-dwell" x={x} y={bandTop + BAND_H + 30}>
                {stage.medianDwellDays != null ? `${stage.medianDwellDays}d median` : ''}
              </text>
            </g>
          );
        })}

        {/* surface gap keeps the band clear of the lane rule without a stroke */}
        <rect x={0} y={bandTop + BAND_H} width={width} height={SURFACE_GAP} fill={VIZ.surface} />
      </svg>
      {node}
    </div>
  );
}

export default FlowRibbon;
