import React, { useMemo, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Calibrating } from './parts';
import { nf } from './metrics';

/**
 * Zone 2 — The Seismograph. The page's centerpiece: a tall, layered,
 * scrubbable time-field (spec §3).
 *
 *  · Base layer   — qualified visits as a soft ink-wash area.
 *  · Strike layer — card pulls & link opens as discrete vertical ticks
 *                   (discrete intent events, never a smoothed line).
 *  · Event layer  — agency reviews / submission advances as marked glyphs.
 *  · Ghost layer  — prior period as a faint offset line.
 *  · Annotation   — the talent's own actions as baseline markers, so a spike
 *                   traces visibly to "new digitals uploaded".
 *
 * Scrubbing collapses the day under the cursor into a micro-ledger.
 */

const VB_W = 1000;
const VB_H = 340;
const PAD = { top: 44, right: 16, bottom: 40, left: 16 };
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;
const BASE_Y = PAD.top + PLOT_H;

function fmtDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function fmtWeekday(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

/** Catmull-Rom → smooth SVG path for the area's top edge. */
function areaPath(points) {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${BASE_Y} L ${p.x} ${p.y} L ${p.x} ${BASE_Y} Z`;
  }
  let d = `M ${points[0].x} ${BASE_Y} L ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  d += ` L ${points[points.length - 1].x} ${BASE_Y} Z`;
  return d;
}

function linePath(points) {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
}

export default function Seismograph({ seismograph }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-8% 0px' });
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(null); // day index under cursor
  const svgRef = useRef(null);

  const days = useMemo(() => seismograph?.days || [], [seismograph]);
  const prior = useMemo(() => seismograph?.prior || null, [seismograph]);

  const model = useMemo(() => {
    const n = days.length;
    const x = (i) => (n <= 1 ? PAD.left + PLOT_W / 2 : PAD.left + (i / (n - 1)) * PLOT_W);
    const maxQual = Math.max(
      1,
      ...days.map((d) => d.qualified || 0),
      ...(prior ? prior.map((d) => d.qualified || 0) : []),
    );
    const maxStrike = Math.max(1, ...days.map((d) => (d.pulls || 0) + (d.opens || 0)));
    const qy = (v) => BASE_Y - (v / maxQual) * PLOT_H * 0.78;

    const qualPoints = days.map((d, i) => ({ x: x(i), y: qy(d.qualified || 0) }));
    const priorPoints = prior
      ? prior.map((d, i) => ({
          x: n <= 1 ? PAD.left + PLOT_W / 2 : PAD.left + (i / (Math.max(1, prior.length - 1))) * PLOT_W,
          y: qy(d.qualified || 0),
        }))
      : null;

    return { x, qy, maxStrike, qualPoints, priorPoints };
  }, [days, prior]);

  const totalSignal = days.reduce(
    (a, d) => a + (d.qualified || 0) + (d.pulls || 0) + (d.opens || 0) + (d.reviews || 0) + (d.advances || 0),
    0,
  );

  if (days.length === 0 || totalSignal === 0) {
    return (
      <Calibrating
        title="The Seismograph is live."
        listening="It marks its first strike the moment your card is pulled — and layers in reviews and advances above the field as your submissions move."
      />
    );
  }

  const handleMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * VB_W;
    const n = days.length;
    const i = n <= 1 ? 0 : Math.round(((relX - PAD.left) / PLOT_W) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const hoverDay = hover != null ? days[hover] : null;
  const hoverX = hover != null ? model.x(hover) : null;

  return (
    <div className="seismo" ref={ref}>
      <div className="seismo__legend">
        <span><i className="seismo__key seismo__key--area" /> Qualified visits</span>
        <span><i className="seismo__key seismo__key--strike" /> Card pulls & link opens</span>
        <span><i className="seismo__key seismo__key--event" /> Reviews & advances</span>
        {model.priorPoints ? (
          <span><i className="seismo__key seismo__key--ghost" /> Prior period</span>
        ) : null}
      </div>

      <svg
        ref={svgRef}
        className="seismo__svg"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Attention over time"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="seismoArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1A1815" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#1A1815" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* baseline */}
        <line x1={PAD.left} y1={BASE_Y} x2={VB_W - PAD.right} y2={BASE_Y} className="seismo__baseline" />

        {/* ghost prior line */}
        {model.priorPoints ? (
          <path d={linePath(model.priorPoints)} className="seismo__ghost" />
        ) : null}

        {/* base area — qualified visits */}
        <motion.path
          d={areaPath(model.qualPoints)}
          fill="url(#seismoArea)"
          initial={reduce ? false : { opacity: 0 }}
          animate={inView ? { opacity: 1 } : undefined}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
        <motion.path
          d={linePath(model.qualPoints)}
          className="seismo__baseLine"
          initial={reduce ? false : { pathLength: 0 }}
          animate={inView ? { pathLength: 1 } : undefined}
          transition={{ duration: 1.1, ease: 'easeInOut' }}
        />

        {/* strike layer — discrete ticks for pulls + opens */}
        {days.map((d, i) => {
          const strikes = (d.pulls || 0) + (d.opens || 0);
          if (!strikes) return null;
          const h = (strikes / model.maxStrike) * PLOT_H * 0.62;
          const x = model.x(i);
          return (
            <motion.line
              key={`s-${d.date}`}
              x1={x}
              x2={x}
              y1={BASE_Y}
              y2={BASE_Y - h}
              className="seismo__strike"
              initial={reduce ? false : { scaleY: 0 }}
              animate={inView ? { scaleY: 1 } : undefined}
              style={{ transformOrigin: `${x}px ${BASE_Y}px` }}
              transition={{ ...{ type: 'spring', stiffness: 55, damping: 16 }, delay: reduce ? 0 : 0.3 + i * 0.01 }}
            />
          );
        })}

        {/* event layer — reviews / advances glyphs above the field */}
        {days.map((d, i) => {
          const ev = (d.reviews || 0) + (d.advances || 0);
          if (!ev) return null;
          const x = model.x(i);
          const advanced = (d.advances || 0) > 0;
          return (
            <motion.g
              key={`e-${d.date}`}
              initial={reduce ? false : { opacity: 0, y: -6 }}
              animate={inView ? { opacity: 1, y: 0 } : undefined}
              transition={{ delay: reduce ? 0 : 0.5 + i * 0.01 }}
            >
              {advanced ? (
                <polygon
                  points={`${x},${PAD.top - 8} ${x - 5},${PAD.top + 1} ${x + 5},${PAD.top + 1}`}
                  className="seismo__glyph seismo__glyph--advance"
                />
              ) : (
                <circle cx={x} cy={PAD.top - 3} r={4} className="seismo__glyph seismo__glyph--review" />
              )}
            </motion.g>
          );
        })}

        {/* annotation layer — self events as baseline markers */}
        {days.map((d, i) => {
          if (!d.annotations || d.annotations.length === 0) return null;
          const x = model.x(i);
          return (
            <g key={`a-${d.date}`} className="seismo__annot">
              <line x1={x} x2={x} y1={BASE_Y} y2={BASE_Y + 8} />
              <circle cx={x} cy={BASE_Y + 11} r={2.4} />
            </g>
          );
        })}

        {/* scrub cursor */}
        {hoverX != null ? (
          <line x1={hoverX} x2={hoverX} y1={PAD.top - 12} y2={BASE_Y} className="seismo__cursor" />
        ) : null}
      </svg>

      {/* date axis */}
      <div className="seismo__axis">
        {days.map((d, i) => {
          const step = Math.ceil(days.length / 6);
          if (i % step !== 0 && i !== days.length - 1) return null;
          return (
            <span key={d.date} style={{ left: `${(model.x(i) / VB_W) * 100}%` }}>
              {fmtDay(d.date)}
            </span>
          );
        })}
      </div>

      {/* scrub micro-ledger */}
      <div className={`seismo__ledger${hoverDay ? ' is-active' : ''}`} aria-live="polite">
        {hoverDay ? (
          <>
            <p className="seismo__ledger-date">
              {fmtWeekday(hoverDay.date)}, {fmtDay(hoverDay.date)}
            </p>
            <ul className="seismo__ledger-rows">
              <li><span>{nf(hoverDay.qualified || 0)}</span> qualified {(hoverDay.qualified || 0) === 1 ? 'visit' : 'visits'}</li>
              <li><span>{nf((hoverDay.pulls || 0) + (hoverDay.opens || 0))}</span> card {((hoverDay.pulls || 0) + (hoverDay.opens || 0)) === 1 ? 'pull / open' : 'pulls / opens'}</li>
              <li><span>{nf(hoverDay.reviews || 0)}</span> agency {(hoverDay.reviews || 0) === 1 ? 'review' : 'reviews'}</li>
              <li><span>{nf(hoverDay.advances || 0)}</span> {(hoverDay.advances || 0) === 1 ? 'advance' : 'advances'}</li>
            </ul>
            {hoverDay.annotations && hoverDay.annotations.length > 0 ? (
              <p className="seismo__ledger-annot">
                {hoverDay.annotations.map((a) => a.label).join(' · ')}
              </p>
            ) : null}
          </>
        ) : (
          <p className="seismo__ledger-hint">Hover the field to read any day.</p>
        )}
      </div>
    </div>
  );
}
