import React, { useMemo, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Calibrating } from './parts';
import './Trajectory.css';

/**
 * Zone 7 — Trajectory. "Am I trending?" A momentum line over 90 days, composed
 * from Tier 1–4 events with the composition always inspectable (never a hidden
 * formula). The benchmark band renders as "calibrating" until the population
 * supports an honest anonymized comparison — never faked (spec §3, §4).
 */

const VB_W = 1000;
const VB_H = 260;
const PAD = { top: 24, right: 20, bottom: 34, left: 20 };
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;
const BASE_Y = PAD.top + PLOT_H;

function fmtWeek(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function smoothPath(points) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
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
  return d;
}

export default function Trajectory({ trajectory }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-8% 0px' });
  const reduce = useReducedMotion();
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);

  const weeks = useMemo(() => trajectory?.weeks || [], [trajectory]);
  const weights = trajectory?.weights || { t1: 8, t2: 5, t3: 3, t4: 1 };
  const bandCalibrating = (trajectory?.bandState || 'calibrating') === 'calibrating';

  const model = useMemo(() => {
    const n = weeks.length;
    const maxV = Math.max(1, ...weeks.map((w) => w.value || 0));
    const x = (i) => (n <= 1 ? PAD.left + PLOT_W / 2 : PAD.left + (i / (n - 1)) * PLOT_W);
    const y = (v) => BASE_Y - (v / maxV) * PLOT_H;
    const points = weeks.map((w, i) => ({ x: x(i), y: y(w.value || 0), i }));
    const area =
      points.length > 0
        ? `${smoothPath(points)} L ${points[points.length - 1].x} ${BASE_Y} L ${points[0].x} ${BASE_Y} Z`
        : '';
    return { x, y, points, area, maxV };
  }, [weeks]);

  const totalValue = weeks.reduce((a, w) => a + (w.value || 0), 0);

  // Trend read: last 4 weeks vs prior 4, only when the earlier window has signal.
  const trend = useMemo(() => {
    if (weeks.length < 8) return null;
    const last4 = weeks.slice(-4).reduce((a, w) => a + (w.value || 0), 0);
    const prior4 = weeks.slice(-8, -4).reduce((a, w) => a + (w.value || 0), 0);
    if (prior4 <= 0) return null;
    if (last4 > prior4 * 1.1) return 'Your momentum is building — the last month outpaced the one before.';
    if (last4 < prior4 * 0.9) return 'Momentum eased this month. A fresh submission or new digitals is the usual restart.';
    return 'Your momentum is holding steady month to month.';
  }, [weeks]);

  if (weeks.length === 0 || totalValue === 0) {
    return (
      <Calibrating
        title="Your trajectory starts here."
        listening="As reviews, advances and card pulls accrue over the coming weeks, this traces whether you're trending — with the causes annotated."
      />
    );
  }

  const handleMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * VB_W;
    const n = weeks.length;
    const i = n <= 1 ? 0 : Math.round(((relX - PAD.left) / PLOT_W) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const hv = hover != null ? weeks[hover] : null;
  const hp = hover != null ? model.points[hover] : null;

  return (
    <div className="traj" ref={ref}>
      <svg
        ref={svgRef}
        className="traj-svg"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Momentum over 90 days"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="trajArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C9A55A" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#C9A55A" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* calibrating benchmark band — a faint dashed envelope, never faked data */}
        {bandCalibrating ? (
          <g className="traj-band traj-band--calibrating">
            <rect
              x={PAD.left}
              y={PAD.top + PLOT_H * 0.28}
              width={PLOT_W}
              height={PLOT_H * 0.42}
              rx={8}
            />
          </g>
        ) : null}

        <line x1={PAD.left} y1={BASE_Y} x2={VB_W - PAD.right} y2={BASE_Y} className="traj-baseline" />

        <motion.path
          d={model.area}
          fill="url(#trajArea)"
          initial={reduce ? false : { opacity: 0 }}
          animate={inView ? { opacity: 1 } : undefined}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
        <motion.path
          d={smoothPath(model.points)}
          className="traj-line"
          initial={reduce ? false : { pathLength: 0 }}
          animate={inView ? { pathLength: 1 } : undefined}
          transition={{ duration: 1.3, ease: 'easeInOut' }}
        />

        {model.points.map((p, i) => (
          <circle
            key={weeks[i].weekStart}
            cx={p.x}
            cy={p.y}
            r={hover === i ? 5 : 3}
            className={`traj-node${hover === i ? ' is-active' : ''}`}
          />
        ))}

        {hp ? <line x1={hp.x} x2={hp.x} y1={PAD.top} y2={BASE_Y} className="traj-cursor" /> : null}
      </svg>

      <div className="traj-axis">
        {weeks.map((w, i) => {
          if (i % 4 !== 0 && i !== weeks.length - 1) return null;
          return (
            <span key={w.weekStart} style={{ left: `${(model.x(i) / VB_W) * 100}%` }}>
              {fmtWeek(w.weekStart)}
            </span>
          );
        })}
      </div>

      {bandCalibrating ? (
        <p className="traj-band-note">
          Benchmark band calibrating — it appears once there are enough comparable
          talent in your division and market to compare honestly. We won't fake it.
        </p>
      ) : null}

      <div className={`traj-tip${hv ? ' is-active' : ''}`} aria-live="polite">
        {hv ? (
          <>
            <p className="traj-tip__week">Week of {fmtWeek(hv.weekStart)}</p>
            <ul className="traj-tip__rows">
              <li><span>{hv.components?.t1 || 0}</span> reviews <em>×{weights.t1}</em></li>
              <li><span>{hv.components?.t2 || 0}</span> advances <em>×{weights.t2}</em></li>
              <li><span>{hv.components?.t3 || 0}</span> pulls / opens <em>×{weights.t3}</em></li>
              <li><span>{hv.components?.t4 || 0}</span> qualified <em>×{weights.t4}</em></li>
            </ul>
            <p className="traj-tip__total">Momentum {hv.value}</p>
          </>
        ) : (
          <p className="traj-tip__hint">
            Hover any week to see what built its momentum. Reviews and advances
            weigh heaviest (×{weights.t1}, ×{weights.t2}), then pulls (×{weights.t3})
            and qualified visits (×{weights.t4}).
          </p>
        )}
      </div>

      {trend ? <p className="traj-read">{trend}</p> : null}
    </div>
  );
}
