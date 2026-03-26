import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Clock, TrendingDown, UserCheck, Zap, TrendingUp, AlertCircle,
  ArrowDown, ArrowUp, Minus,
} from 'lucide-react';
import './AnalyticsPage.css';

/* ─── Icon map (avoids dynamic imports) ─── */
const ICON_MAP = { Clock, TrendingDown, UserCheck, Zap, TrendingUp, AlertCircle };

/* ─── Static data ─────────────────────────────────────────── */
const SIGNALS = {
  '30d': [
    { variant: 'critical', icon: 'Clock',       text: '4 applicants have been in Under Review for 14+ days.', cta: { label: 'View them', to: '/dashboard/agency/inbox' } },
    { variant: 'warning',  icon: 'TrendingDown', text: 'Invite → application rate dropped from 38% to 21% this month.', cta: null },
    { variant: 'positive', icon: 'UserCheck',   text: '2 new talent signed this month — roster at an all-time high of 24.', cta: null },
  ],
  '90d': [
    { variant: 'warning',  icon: 'TrendingDown', text: 'Under Review stage is averaging 18 days — up from 11 days last quarter.', cta: null },
    { variant: 'positive', icon: 'UserCheck',   text: '6 new signings over 90 days. Roster grew from 18 to 24.', cta: null },
    { variant: 'positive', icon: 'Zap',         text: 'Shortlisted → Signed conversion is 60% — your strongest stage.', cta: null },
  ],
  '6m': [
    { variant: 'warning',  icon: 'AlertCircle', text: 'Overall pipeline conversion is 6.3% (invites → signed). Industry benchmark is ~10%.', cta: null },
    { variant: 'positive', icon: 'TrendingUp',  text: 'Roster grew 33% over 6 months (18 → 24 talent).', cta: null },
    { variant: 'positive', icon: 'UserCheck',   text: 'Editorial talent now 42% of roster — up from 28% in September.', cta: null },
  ],
};

const FUNNEL_DATA = {
  '30d': [
    { id: 'invited',   label: 'Invites Sent',  count: 48  },
    { id: 'applied',   label: 'Applied',        count: 12  },
    { id: 'review',    label: 'Under Review',   count: 8   },
    { id: 'shortlist', label: 'Shortlisted',    count: 5   },
    { id: 'signed',    label: 'Signed',         count: 3   },
  ],
  '90d': [
    { id: 'invited',   label: 'Invites Sent',  count: 124 },
    { id: 'applied',   label: 'Applied',        count: 47  },
    { id: 'review',    label: 'Under Review',   count: 31  },
    { id: 'shortlist', label: 'Shortlisted',    count: 18  },
    { id: 'signed',    label: 'Signed',         count: 6   },
  ],
  '6m': [
    { id: 'invited',   label: 'Invites Sent',  count: 241 },
    { id: 'applied',   label: 'Applied',        count: 89  },
    { id: 'review',    label: 'Under Review',   count: 62  },
    { id: 'shortlist', label: 'Shortlisted',    count: 29  },
    { id: 'signed',    label: 'Signed',         count: 9   },
  ],
};

const VELOCITY_DATA = {
  '30d': [
    { transition: 'Applied → Under Review',     avgDays: 2,  trend: 'better' },
    { transition: 'Under Review → Shortlisted', avgDays: 18, trend: 'worse'  },
    { transition: 'Shortlisted → Signed',       avgDays: 4,  trend: 'same'   },
  ],
  '90d': [
    { transition: 'Applied → Under Review',     avgDays: 3,  trend: 'same'   },
    { transition: 'Under Review → Shortlisted', avgDays: 11, trend: 'better' },
    { transition: 'Shortlisted → Signed',       avgDays: 6,  trend: 'worse'  },
  ],
  '6m': [
    { transition: 'Applied → Under Review',     avgDays: 4,  trend: 'worse'  },
    { transition: 'Under Review → Shortlisted', avgDays: 13, trend: 'same'   },
    { transition: 'Shortlisted → Signed',       avgDays: 5,  trend: 'better' },
  ],
};

const _rosterSnapshot = {
  currentCount: 24,
  growth: [
    { month: 'Apr', count: 14 }, { month: 'May', count: 15 },
    { month: 'Jun', count: 15 }, { month: 'Jul', count: 16 },
    { month: 'Aug', count: 17 }, { month: 'Sep', count: 18 },
    { month: 'Oct', count: 19 }, { month: 'Nov', count: 20 },
    { month: 'Dec', count: 21 }, { month: 'Jan', count: 22 },
    { month: 'Feb', count: 23 }, { month: 'Mar', count: 24 },
  ],
  composition: {
    type:   [{ label: 'Editorial', pct: 42 }, { label: 'Commercial', pct: 29 }, { label: 'Runway', pct: 17 }, { label: 'Fitness', pct: 12 }],
    gender: [{ label: 'Female', pct: 71 }, { label: 'Male', pct: 21 }, { label: 'Non-binary', pct: 8 }],
  },
};
const ROSTER_DATA = { '30d': _rosterSnapshot, '90d': _rosterSnapshot, '6m': _rosterSnapshot };

/* ─── Helpers ─────────────────────────────────────────────── */
const VELOCITY_THRESHOLDS = {
  'Applied → Under Review':     { green: 3, amber: 7  },
  'Under Review → Shortlisted': { green: 7, amber: 14 },
  'Shortlisted → Signed':       { green: 5, amber: 10 },
};
function getDaysColor(transition, days) {
  const t = VELOCITY_THRESHOLDS[transition];
  if (!t) return 'neutral';
  if (days <= t.green) return 'green';
  if (days <= t.amber) return 'amber';
  return 'red';
}

/* ─── AnalyticsSubHeader ───────────────────────────────────── */
const RANGES = [
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: '6m',  label: '6M'  },
];

function AnalyticsSubHeader({ range, onRangeChange }) {
  return (
    <div className="an-subheader">
      {RANGES.map((r) => (
        <button
          key={r.key}
          className={`an-range-pill ${range === r.key ? 'active' : ''}`}
          onClick={() => onRangeChange(r.key)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/* ─── AISignalStrip ────────────────────────────────────────── */
const NEUTRAL_SIGNAL = { variant: 'neutral', icon: null, text: 'No signal for this period.', cta: null };

function SignalCard({ signal, index }) {
  const Icon = ICON_MAP[signal.icon] ?? null;
  return (
    <motion.div
      className={`an-signal-card an-signal-card--${signal.variant}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
    >
      <div className="an-signal-icon">
        {Icon && <Icon size={18} />}
      </div>
      <p className="an-signal-text">{signal.text}</p>
      {signal.cta && (
        <Link to={signal.cta.to} className="an-signal-cta">
          {signal.cta.label} →
        </Link>
      )}
    </motion.div>
  );
}

function AISignalStrip({ range }) {
  const raw = SIGNALS[range] ?? [];
  const items = [...raw];
  while (items.length < 3) items.push(NEUTRAL_SIGNAL);
  return (
    <div key={range} className="an-signals">
      {items.slice(0, 3).map((signal, i) => (
        <SignalCard key={`${signal.variant}-${signal.text.slice(0, 15)}`} signal={signal} index={i} />
      ))}
    </div>
  );
}

/* ─── FunnelView ───────────────────────────────────────────── */
function ConversionBadge({ count, prevCount }) {
  if (prevCount == null || prevCount === 0) return null;
  const pct = Math.round((count / prevCount) * 100);
  const color = pct >= 50 ? '#16a34a' : pct >= 25 ? '#d97706' : '#dc2626';
  return (
    <span
      className="an-stage-badge"
      style={{ color, borderColor: color + '33', background: color + '0f' }}
    >
      <span className="an-stage-badge-dot" style={{ background: color }} />
      {pct}%
    </span>
  );
}

function StageBlock({ stage, prevCount, index }) {
  const [hovered, setHovered] = useState(false);
  const pct = prevCount != null && prevCount > 0
    ? Math.round((stage.count / prevCount) * 100)
    : null;
  return (
    <motion.div
      className="an-stage"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 55, damping: 16, delay: index * 0.06 }}
    >
      <span className="an-stage-label">{stage.label}</span>
      <span className="an-stage-count">{stage.count}</span>
      <ConversionBadge count={stage.count} prevCount={prevCount} />
      {hovered && (
        <div className="an-stage-tooltip">
          <strong>{stage.label}</strong>
          <span>{stage.count} total</span>
          {pct !== null && <span>{pct}% conversion</span>}
        </div>
      )}
    </motion.div>
  );
}

function FunnelConnector({ receivingCount, maxCount, index }) {
  const strokeWidth = 2 + ((receivingCount / Math.max(maxCount, 1)) * 8);
  return (
    <svg
      className="an-stage-connector"
      viewBox="0 0 48 48"
    >
      <motion.path
        d="M 0 24 L 44 24"
        stroke="rgba(201,165,90,0.4)"
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.4 + index * 0.08, duration: 0.5, ease: 'easeOut' }}
      />
      <polygon points="40,20 48,24 40,28" fill="rgba(201,165,90,0.4)" />
    </svg>
  );
}

function FunnelView({ range }) {
  const stages = FUNNEL_DATA[range] ?? [];
  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  return (
    <div className="an-funnel">
      <h2 className="an-section-title">Pipeline Funnel</h2>
      <div key={range} className="an-funnel-row">
        {stages.map((stage, i) => (
          <React.Fragment key={stage.id}>
            <StageBlock
              stage={stage}
              prevCount={i > 0 ? stages[i - 1].count : null}
              index={i}
            />
            {i < stages.length - 1 && (
              <FunnelConnector
                receivingCount={stages[i + 1].count}
                maxCount={maxCount}
                index={i}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ─── PipelineVelocityTable ────────────────────────────────── */
const TREND_CONFIG = {
  better: { Icon: ArrowDown, label: 'faster', color: '#16a34a' },
  worse:  { Icon: ArrowUp,   label: 'slower', color: '#dc2626' },
  same:   { Icon: Minus,     label: 'same',   color: '#64748b' },
};

function VelocityRow({ row, index }) {
  const color = getDaysColor(row.transition, row.avgDays);
  const { Icon, label, color: trendColor } = TREND_CONFIG[row.trend] ?? TREND_CONFIG.same;
  return (
    <motion.div
      className="an-velocity-row"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
    >
      <span className="an-velocity-label">{row.transition}</span>
      <span className={`an-days-chip an-days-chip--${color}`}>{row.avgDays}d</span>
      <span className="an-velocity-trend" style={{ color: trendColor }}>
        <Icon size={12} /> {label}
      </span>
    </motion.div>
  );
}

function PipelineVelocityTable({ range }) {
  const rows = VELOCITY_DATA[range] ?? [];
  return (
    <div className="an-panel">
      <h3 className="an-panel-title">Pipeline Velocity</h3>
      <p className="an-panel-subtitle">Avg days between stages</p>
      <div key={range} className="an-velocity-table">
        {rows.map((row, i) => (
          <VelocityRow key={row.transition} row={row} index={i} />
        ))}
      </div>
    </div>
  );
}

/* ─── RosterGrowthPanel ────────────────────────────────────── */
const CHART_W  = 600;
const CHART_H  = 100;
const LABEL_H  = 20;
const SVG_H    = CHART_H + LABEL_H;

function RosterGrowthPanel({ range }) {
  const { currentCount, growth, composition } = ROSTER_DATA[range] ?? ROSTER_DATA['30d'];
  const maxDomain = Math.max(...growth.map((d) => d.count)) * 1.2;

  const toX = (i) => (i / Math.max(growth.length - 1, 1)) * CHART_W;
  const toY = (count) => CHART_H - (count / maxDomain) * CHART_H;

  const lineD = growth
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.count)}`)
    .join(' ');

  const fillD =
    `${lineD} L ${toX(growth.length - 1)} ${CHART_H} L ${toX(0)} ${CHART_H} Z`;

  return (
    <div className="an-panel">
      <h3 className="an-panel-title">Roster Growth</h3>
      <div className="an-roster-count">{currentCount}</div>

      <svg
        viewBox={`0 0 ${CHART_W} ${SVG_H}`}
        style={{ width: '100%', height: SVG_H, display: 'block' }}
        preserveAspectRatio="none"
      >
        <path d={fillD} fill="rgba(201,165,90,0.12)" />
        <motion.path
          d={lineD}
          fill="none"
          stroke="#C9A55A"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
        />
        {growth.map((d, i) => (
          <text
            key={d.month}
            x={toX(i)}
            y={SVG_H - 4}
            textAnchor="middle"
            fontSize={9}
            fill="#94a3b8"
            fontFamily="Inter, sans-serif"
          >
            {d.month}
          </text>
        ))}
      </svg>

      <p className="an-roster-caption">
        Roster data reflects current snapshot — unaffected by time range.
      </p>

      <div className="an-composition">
        {[
          { groupLabel: 'By type',   items: composition.type,   baseDelay: 0 },
          { groupLabel: 'By gender', items: composition.gender, baseDelay: composition.type.length },
        ].map(({ groupLabel, items, baseDelay }) => (
          <div key={groupLabel} className="an-comp-group">
            <span className="an-comp-label">{groupLabel}</span>
            <div className="an-comp-pills">
              {items.map((item, i) => (
                <motion.div
                  key={item.label}
                  className="an-comp-pill"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: (baseDelay + i) * 0.04, duration: 0.2 }}
                >
                  <div className="an-comp-fill" style={{ width: `${item.pct}%` }} />
                  <span className="an-comp-text">{item.label} {item.pct}%</span>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState('30d');
  return (
    <div className="an-page">
      <AnalyticsSubHeader range={range} onRangeChange={setRange} />
      <AISignalStrip range={range} />
      <FunnelView range={range} />
      <div className="an-zone3">
        <PipelineVelocityTable range={range} />
        <RosterGrowthPanel range={range} />
      </div>
    </div>
  );
}
