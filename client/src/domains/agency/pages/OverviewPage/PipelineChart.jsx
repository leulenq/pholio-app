import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TrendingUp, Users } from 'lucide-react';

function ArchetypeDonut({ segments }) {
  const size = 120;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = 3;
  const totalGap = gap * segments.length;
  const usableArc = 360 - totalGap;

  let accumulated = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ov-donut">
      {segments.map((seg, i) => {
        const segAngle = (seg.pct / 100) * usableArc;
        const segLen = (segAngle / 360) * c;
        const rotation = -90 + accumulated + (i * gap);
        accumulated += segAngle;

        return (
          <motion.circle
            key={seg.name}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={stroke}
            strokeDasharray={`${segLen} ${c - segLen}`}
            strokeLinecap="butt"
            transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
            initial={{ strokeDasharray: `0 ${c}` }}
            animate={{ strokeDasharray: `${segLen} ${c - segLen}` }}
            transition={{ duration: 0.8, delay: 0.3 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="ov-donut-seg"
          />
        );
      })}
    </svg>
  );
}

export default function PipelineChart({
  itemVariants,
  pipelineStages,
  hoveredStage,
  setHoveredStage,
  conversionRates,
  sub2short,
  short2book,
  weakestGate,
  talentMix,
  highestDemand,
  lowestDemand,
}) {
  return (
    <motion.div className="ov-row-3" variants={itemVariants}>
      <motion.div className="ov-card">
        <div className="ov-card-header">
          <div className="ov-card-title-group">
            <TrendingUp size={16} className="ov-card-icon" />
            <h2 className="ov-card-title">Casting Pipeline</h2>
          </div>
        </div>

        <div className="ov-pipeline-bar">
          {pipelineStages.map((s, i) => (
            <motion.div
              key={s.label}
              className={`ov-pipeline-seg ${hoveredStage === s.label ? 'ov-pipeline-seg--active' : ''} ${s.isUrgent ? 'ov-pipeline-seg--pulse' : ''}`}
              style={{ background: s.color }}
              initial={{ width: 0 }}
              animate={{ width: `${s.pct}%` }}
              transition={{ duration: 0.7, delay: 0.2 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              onMouseEnter={() => setHoveredStage(s.label)}
              onMouseLeave={() => setHoveredStage(null)}
              title={`${s.label}: ${s.count}`}
            >
              {hoveredStage === s.label && (
                <div className="ov-pipeline-tooltip">
                  {s.label}: {s.count} ({s.pct}%)
                </div>
              )}
            </motion.div>
          ))}
        </div>

        <div className="ov-pipeline-legend">
          {pipelineStages.map(s => (
            <div
              key={s.label}
              className={`ov-legend-item ${hoveredStage === s.label ? 'ov-legend-item--active' : ''}`}
              onMouseEnter={() => setHoveredStage(s.label)}
              onMouseLeave={() => setHoveredStage(null)}
            >
              <span className="ov-legend-dot" style={{ background: s.color }} />
              <span className="ov-legend-label">{s.label}</span>
              <span className="ov-legend-count">{s.count}</span>
            </div>
          ))}
        </div>

        {(sub2short !== null || short2book !== null) && (
          <div className="ov-conversion-row">
            {conversionRates.map(r => (
              <div key={r.label} className="ov-conversion-chip">
                <span className="ov-conversion-label">{r.label}</span>
                <span className="ov-conversion-value">{r.value !== null ? `${r.value}%` : '—'}</span>
              </div>
            ))}
          </div>
        )}
        {weakestGate && (
          <p className="ov-conversion-insight">
            {weakestGate.label} is your tightest gate.
          </p>
        )}
      </motion.div>

      <motion.div className="ov-card">
        <div className="ov-card-header">
          <div className="ov-card-title-group">
            <Users size={16} className="ov-card-icon" />
            <h2 className="ov-card-title">Talent Mix</h2>
          </div>
        </div>

        <div className="ov-arch-layout">
          <ArchetypeDonut segments={talentMix} />
          <div className="ov-arch-list">
            {talentMix.map(a => (
              <div key={a.name} className="ov-arch-row">
                <span className="ov-arch-dot" style={{ background: a.color }} />
                <span className="ov-arch-name">{a.name}</span>
                <span className="ov-arch-pct">{a.pct}%</span>
              </div>
            ))}
            {talentMix.length > 0 ? (
              <div className="ov-arch-insights">
                <span className="ov-arch-demand">
                  Roster is strongest in {highestDemand?.name} right now.
                </span>
                <Link to="/dashboard/agency/discover" className="ov-arch-scout-cta">
                  {lowestDemand?.name} is thinnest on roster — consider scouting.
                </Link>
              </div>
            ) : (
              <div className="ov-arch-insights">
                <span className="ov-arch-demand">No signed roster mix data yet.</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
