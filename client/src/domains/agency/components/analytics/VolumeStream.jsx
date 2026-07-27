import React, { useMemo, useState } from 'react';
import { line as d3line, curveMonotoneX } from 'd3-shape';
import { VIZ, VOLUME_STACK, SURFACE_GAP, formatBucket, axisScale } from './viz';
import { useMeasure } from './useMeasure';
import { useTooltip } from './useTooltip';
import { TipRows } from './Tooltip';

/**
 * Intake over the window, stacked by where each submission ended up, with the
 * trailing average riding over it.
 *
 * Columns, not an area: submissions arrive on discrete days, and an
 * interpolated area invents arrivals between them — on a quiet desk that reads
 * as a comb of spikes that were never in the data. The trailing average is the
 * curve; the columns stay honest.
 *
 * One axis. The average is a moving mean of the same stacked total, in the same
 * unit, so it never introduces a second scale.
 */

const PAD = { top: 12, right: 12, bottom: 26, left: 34 };
const HEIGHT = 236;
const MAX_BAR = 24;

export function VolumeStream({ volume }) {
  const [ref, width] = useMeasure(720);
  const { show, hide, node } = useTooltip();
  const [hover, setHover] = useState(null);

  const series = useMemo(() => volume?.series || [], [volume]);
  const granularity = volume?.granularity || 'day';

  const geometry = useMemo(() => {
    const plotW = Math.max(10, width - PAD.left - PAD.right);
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const { max, ticks } = axisScale(Math.max(1, ...series.map((d) => d.total)));
    const band = plotW / Math.max(1, series.length);
    const barW = Math.max(2, Math.min(MAX_BAR, band - Math.min(SURFACE_GAP, band * 0.25)));
    const cx = (i) => PAD.left + band * i + band / 2;
    const y = (v) => PAD.top + plotH - (v / max) * plotH;
    return { plotW, plotH, max, ticks, band, barW, cx, y };
  }, [series, width]);

  if (!series.length) return <div ref={ref} className="sv-chart" />;

  const { plotH, ticks, barW, cx, y } = geometry;
  const baseline = PAD.top + plotH;

  const trendPath = d3line()
    .defined((d) => d.trend != null)
    .x((_, i) => cx(i))
    .y((d) => y(d.trend))
    .curve(curveMonotoneX)(series);

  const labelEvery = Math.max(1, Math.ceil(series.length / 7));

  const onMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - box.left;
    const i = Math.max(
      0,
      Math.min(series.length - 1, Math.floor((px - PAD.left) / geometry.band)),
    );
    setHover(i);
    const row = series[i];
    show(
      cx(i),
      event.clientY - box.top,
      <TipRows
        title={formatBucket(row.bucket, granularity)}
        subtitle={`${row.total} ${row.total === 1 ? 'submission' : 'submissions'}`}
        rows={[...VOLUME_STACK]
          .reverse()
          .filter((s) => row[s.key] > 0)
          .map((s) => ({ label: s.label, value: row[s.key], color: s.color }))}
      />,
    );
  };

  return (
    <div ref={ref} className="sv-chart">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Submissions per ${granularity} stacked by outcome, ${series.length} buckets`}
        onMouseMove={onMove}
        onMouseLeave={() => {
          setHover(null);
          hide();
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={VIZ.grid} strokeWidth="1" />
            <text className="sv-axis" x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end">
              {Math.round(t)}
            </text>
          </g>
        ))}

        {hover != null ? (
          <rect
            x={cx(hover) - geometry.band / 2}
            y={PAD.top}
            width={geometry.band}
            height={plotH}
            fill={VIZ.plane}
          />
        ) : null}

        {series.map((row, i) => {
          if (!row.total) return null;
          let acc = 0;
          return (
            <g key={row.bucket}>
              {VOLUME_STACK.map((s) => {
                const value = row[s.key] || 0;
                if (!value) return null;
                const top = y(acc + value);
                const full = y(acc) - top;
                // 2px of surface separates touching segments; a single-unit
                // segment keeps a visible sliver rather than vanishing.
                const h = Math.max(1.5, full - SURFACE_GAP);
                acc += value;
                return <rect key={s.key} x={cx(i) - barW / 2} y={top} width={barW} height={h} rx="1.5" fill={s.color} />;
              })}
            </g>
          );
        })}

        <path d={trendPath} fill="none" stroke={VIZ.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {hover != null && series[hover].trend != null ? (
          <g>
            <circle cx={cx(hover)} cy={y(series[hover].trend)} r="5.5" fill={VIZ.surface} />
            <circle cx={cx(hover)} cy={y(series[hover].trend)} r="3.5" fill={VIZ.ink} />
          </g>
        ) : null}

        <line x1={PAD.left} x2={width - PAD.right} y1={baseline} y2={baseline} stroke={VIZ.axis} strokeWidth="1" />

        {series.map((row, i) =>
          i % labelEvery === 0 ? (
            <text className="sv-axis" key={row.bucket} x={cx(i)} y={HEIGHT - 8} textAnchor="middle">
              {formatBucket(row.bucket, granularity)}
            </text>
          ) : null,
        )}
      </svg>
      {node}
    </div>
  );
}

export default VolumeStream;
