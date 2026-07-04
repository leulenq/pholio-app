import React, { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { Calibrating } from './IntelKit';
import { SECTION_EASE } from './intelUtils';

const W = 720;
const H = 200;
const PAD_L = 14;
const PAD_R = 14;
const TOP = 24;
const BASE_Y = 168;
const PLOT_W = W - PAD_L - PAD_R;

function weekLabel(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Zone 7 — Trajectory. The momentum composite over 90 days, drawn against the
 * cohort band's designed calibrating treatment. The composition is always
 * inspectable — never a hidden formula — and the band is never faked.
 */
export default function Trajectory({ trajectory }) {
  const reduce = useReducedMotion();
  const [showComposition, setShowComposition] = useState(false);
  const [hover, setHover] = useState(null);

  const weeks = useMemo(
    () => (Array.isArray(trajectory?.weeks) ? trajectory.weeks : []),
    [trajectory],
  );
  const n = weeks.length;
  const model = useMemo(() => {
    if (n < 2) return null;
    const max = Math.max(1, ...weeks.map((w) => Number(w.value) || 0));
    const x = (i) => PAD_L + (i / (n - 1)) * PLOT_W;
    const y = (v) => BASE_Y - (v / max) * (BASE_Y - TOP);
    const pts = weeks.map((w, i) => `${x(i).toFixed(1)},${y(Number(w.value) || 0).toFixed(1)}`);
    return {
      x,
      y,
      linePath: `M${pts.join(' L')}`,
      areaPath: `M${PAD_L},${BASE_Y} L${pts.join(' L')} L${PAD_L + PLOT_W},${BASE_Y} Z`,
    };
  }, [weeks, n]);

  const total = weeks.reduce((sum, w) => sum + (Number(w.value) || 0), 0);
  if (!model || total === 0) {
    return (
      <Calibrating>
        Trajectory draws itself from ninety days of tier 1–4 signal — reviews, advances, pulls and
        qualified visits. It starts moving with your first submission or visit.
      </Calibrating>
    );
  }

  const weights = trajectory?.weights || {};
  const hoveredWeek = hover != null ? weeks[hover] : null;

  return (
    <div className="intel2-traj">
      <div className="intel2-traj-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="intel2-traj-svg"
          preserveAspectRatio="none"
          role="img"
          aria-label="Momentum over ninety days"
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="intel2-traj-wash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C9A55A" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#C9A55A" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* The benchmark band, calibrating: an honest dashed corridor, no data. */}
          <rect
            x={PAD_L} y={TOP + 18} width={PLOT_W} height={(BASE_Y - TOP) * 0.42}
            fill="none" stroke="rgba(26,24,21,0.18)" strokeWidth="1" strokeDasharray="5 5" rx="4"
          />
          <text x={PAD_L + 10} y={TOP + 34} className="intel2-traj-bandlabel">
            cohort band — calibrating
          </text>

          <line x1={PAD_L} y1={BASE_Y} x2={W - PAD_R} y2={BASE_Y} stroke="rgba(26,24,21,0.14)" strokeWidth="1" />

          <path d={model.areaPath} fill="url(#intel2-traj-wash)" />
          <motion.path
            d={model.linePath}
            fill="none" stroke="#B08D45" strokeWidth="1.8" strokeLinejoin="round"
            initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: reduce ? 0 : 1.4, ease: SECTION_EASE }}
          />

          {weeks.map((w, i) => (
            <circle
              key={w.weekStart}
              cx={model.x(i)} cy={model.y(Number(w.value) || 0)}
              r={hover === i ? 5 : 3}
              fill={hover === i ? '#1A1815' : '#B08D45'}
              onPointerEnter={() => setHover(i)}
            />
          ))}
        </svg>

        {hoveredWeek && (
          <div className="intel2-traj-pop" style={{ left: `${(model.x(hover) / W) * 100}%` }}>
            <span className="intel2-traj-pop-date">wk of {weekLabel(hoveredWeek.weekStart)}</span>
            <span className="intel2-traj-pop-line">momentum {Number(hoveredWeek.value) || 0}</span>
            <span className="intel2-traj-pop-parts">
              {Number(hoveredWeek.components?.t1) || 0} reviewed · {Number(hoveredWeek.components?.t2) || 0} advanced ·{' '}
              {Number(hoveredWeek.components?.t3) || 0} pulled · {Number(hoveredWeek.components?.t4) || 0} visits
            </span>
          </div>
        )}
      </div>

      <p className="intel2-traj-bandnote">
        Cohort benchmarks are calibrating — they ship when the population is large enough to compare
        honestly. Never estimated.
      </p>

      <button
        type="button"
        className="intel2-traj-disclosure"
        onClick={() => setShowComposition((v) => !v)}
        aria-expanded={showComposition}
      >
        How this is drawn
        <ChevronDown size={13} className={showComposition ? 'is-open' : ''} aria-hidden />
      </button>
      {showComposition && (
        <p className="intel2-traj-composition">
          Each week sums its signal, weighted by tier: reviews ×{weights.t1 ?? 8}, advances ×
          {weights.t2 ?? 5}, card pulls and link opens ×{weights.t3 ?? 3}, qualified visits ×
          {weights.t4 ?? 1}. No other inputs.
        </p>
      )}
    </div>
  );
}
