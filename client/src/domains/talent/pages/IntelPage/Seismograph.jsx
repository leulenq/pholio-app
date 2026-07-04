import React, { useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useIntelDay } from '../../hooks/useIntel';
import { Calibrating } from './IntelKit';
import { SECTION_EASE } from './intelUtils';

const W = 720;
const H = 250;
const PAD_L = 10;
const PAD_R = 10;
const PAD_T = 34; // glyph band above the field
const PAD_B = 22; // baseline + annotation ticks
const BASE_Y = H - PAD_B;
const PLOT_W = W - PAD_L - PAD_R;

function niceDate(iso, opts = { month: 'short', day: 'numeric' }) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}

function DayLedger({ date }) {
  const { data, isLoading, isError } = useIntelDay(date, { enabled: Boolean(date) });
  if (isLoading) return <p className="intel2-seis-ledger-loading">Reading {niceDate(date)}…</p>;
  if (isError || !data) return <p className="intel2-seis-ledger-loading">No detail for {niceDate(date)}.</p>;

  const vc = data.viewerClasses || {};
  const markets = Array.isArray(data.markets) ? data.markets : [];
  return (
    <div className="intel2-seis-ledger">
      <span className="intel2-seis-ledger-date">{niceDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      <div className="intel2-seis-ledger-classes">
        <span>Agency <b>{Number(vc.agency) || 0}</b></span>
        <span>Client <b>{Number(vc.client) || 0}</b></span>
        <span>Public <b>{Number(vc.public) || 0}</b></span>
      </div>
      {markets.length > 0 && (
        <div className="intel2-seis-ledger-markets">
          {markets.slice(0, 3).map((m) => (
            <span key={m.market}>{m.label || m.market} <b>{Number(m.count) || 0}</b></span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Zone 2 — The Seismograph. A layered time-field: qualified visits as an ink
 * wash, discrete pull/open strikes as ticks, reviews (diamond) and advances
 * (filled diamond) as glyphs above the field, self-events as baseline markers.
 * Studio+ scrub collapses a day into a micro-ledger.
 */
export default function Seismograph({ seismograph, canScrub }) {
  const reduce = useReducedMotion();
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null); // { index, x }

  const days = useMemo(() => (Array.isArray(seismograph?.days) ? seismograph.days : []), [seismograph]);
  const n = days.length;

  const model = useMemo(() => {
    if (n === 0) return null;
    const step = n > 1 ? PLOT_W / (n - 1) : 0;
    const x = (i) => PAD_L + (n > 1 ? i * step : PLOT_W / 2);
    const maxQ = Math.max(1, ...days.map((d) => Number(d.qualified) || 0));
    const maxStrike = Math.max(1, ...days.map((d) => (Number(d.pulls) || 0) + (Number(d.opens) || 0)));
    const fieldTop = PAD_T + 18;
    const qY = (v) => BASE_Y - (v / maxQ) * (BASE_Y - fieldTop);

    const areaPts = days.map((d, i) => `${x(i).toFixed(1)},${qY(Number(d.qualified) || 0).toFixed(1)}`);
    const areaPath = `M${PAD_L},${BASE_Y} L${areaPts.join(' L')} L${(PAD_L + PLOT_W).toFixed(1)},${BASE_Y} Z`;

    return { x, qY, maxStrike, fieldTop, areaPath, step };
  }, [days, n]);

  if (n === 0 || days.every((d) =>
    (Number(d.qualified) || 0) + (Number(d.pulls) || 0) + (Number(d.opens) || 0) +
    (Number(d.reviews) || 0) + (Number(d.advances) || 0) === 0)) {
    return (
      <Calibrating>
        The Seismograph is live. It marks its first strike the moment your card is pulled or your
        shared link is opened — then the field starts to move.
      </Calibrating>
    );
  }

  const handleMove = (event) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const f = (event.clientX - rect.left) / rect.width;
    const leftFrac = PAD_L / W;
    const rightFrac = (W - PAD_R) / W;
    const plotFrac = Math.min(1, Math.max(0, (f - leftFrac) / (rightFrac - leftFrac)));
    const index = Math.round(plotFrac * (n - 1));
    setHover({ index, xPct: ((model.x(index)) / W) * 100 });
  };

  const hoveredDay = hover ? days[hover.index] : null;
  const revealTransition = { duration: reduce ? 0 : 1.1, ease: SECTION_EASE };

  return (
    <div className="intel2-seis">
      <div
        className="intel2-seis-plot"
        ref={wrapRef}
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="intel2-seis-svg" preserveAspectRatio="none" role="img" aria-label="Attention over time">
          <defs>
            <linearGradient id="intel2-seis-wash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C9A55A" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#C9A55A" stopOpacity="0.01" />
            </linearGradient>
            <clipPath id="intel2-seis-reveal">
              <motion.rect
                x="0" y="0" height={H}
                initial={{ width: reduce ? W : 0 }}
                whileInView={{ width: W }}
                viewport={{ once: true, margin: '-60px' }}
                transition={revealTransition}
              />
            </clipPath>
          </defs>

          {/* baseline */}
          <line x1={PAD_L} y1={BASE_Y} x2={W - PAD_R} y2={BASE_Y} stroke="rgba(26,24,21,0.14)" strokeWidth="1" />

          <g clipPath="url(#intel2-seis-reveal)">
            {/* qualified-visit wash */}
            <path d={model.areaPath} fill="url(#intel2-seis-wash)" />
            <path
              d={`M${days.map((d, i) => `${model.x(i).toFixed(1)},${model.qY(Number(d.qualified) || 0).toFixed(1)}`).join(' L')}`}
              fill="none" stroke="#C9A55A" strokeWidth="1.25" strokeOpacity="0.5"
            />

            {/* strike ticks: pulls + opens */}
            {days.map((d, i) => {
              const strike = (Number(d.pulls) || 0) + (Number(d.opens) || 0);
              if (strike === 0) return null;
              const h = (strike / model.maxStrike) * (BASE_Y - model.fieldTop - 6);
              return (
                <line
                  key={`st-${d.date}`}
                  x1={model.x(i)} y1={BASE_Y} x2={model.x(i)} y2={BASE_Y - h}
                  stroke="#1A1815" strokeWidth="1.5" strokeLinecap="round"
                />
              );
            })}

            {/* glyphs: reviews (outline diamond) and advances (filled diamond) */}
            {days.map((d, i) => {
              const glyphs = [];
              const cx = model.x(i);
              if ((Number(d.reviews) || 0) > 0) {
                glyphs.push(
                  <path key={`rv-${d.date}`} d={`M${cx},${PAD_T - 6} l5,5 l-5,5 l-5,-5 Z`}
                    fill="none" stroke="#1A1815" strokeWidth="1.4" />,
                );
              }
              if ((Number(d.advances) || 0) > 0) {
                glyphs.push(
                  <path key={`ad-${d.date}`} d={`M${cx},${PAD_T + 8} l5,5 l-5,5 l-5,-5 Z`}
                    fill="#C9A55A" stroke="#B08D45" strokeWidth="1" />,
                );
              }
              return glyphs;
            })}

            {/* annotations: self-events as baseline markers */}
            {days.map((d, i) => (
              Array.isArray(d.annotations) && d.annotations.length > 0 ? (
                <circle key={`an-${d.date}`} cx={model.x(i)} cy={BASE_Y} r="2.6" fill="#B08D45" />
              ) : null
            ))}
          </g>

          {/* scrub cursor */}
          {hover && (
            <line
              x1={`${hover.xPct}%`} y1={PAD_T - 12} x2={`${hover.xPct}%`} y2={BASE_Y}
              stroke="rgba(184,149,106,0.55)" strokeWidth="1" strokeDasharray="3 3"
            />
          )}
        </svg>

        {hoveredDay && (
          <div className="intel2-seis-pop" style={{ left: `${hover.xPct}%` }}>
            <span className="intel2-seis-pop-date">{niceDate(hoveredDay.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span className="intel2-seis-pop-line">
              {(Number(hoveredDay.qualified) || 0)} qualified · {(Number(hoveredDay.pulls) || 0) + (Number(hoveredDay.opens) || 0)} strikes
            </span>
            {canScrub ? <DayLedger date={hoveredDay.date} /> : null}
          </div>
        )}
      </div>

      <div className="intel2-seis-legend">
        <span><span className="intel2-seis-key intel2-seis-key--wash" aria-hidden /> Qualified visits</span>
        <span><span className="intel2-seis-key intel2-seis-key--strike" aria-hidden /> Card pulls / link opens</span>
        <span><span className="intel2-seis-key intel2-seis-key--review" aria-hidden /> Reviewed</span>
        <span><span className="intel2-seis-key intel2-seis-key--advance" aria-hidden /> Advanced</span>
      </div>
      {!seismograph.hasStrikes && (
        <p className="intel2-seis-note">No strikes yet — the field ticks the day your card is pulled or your link is opened.</p>
      )}
    </div>
  );
}
