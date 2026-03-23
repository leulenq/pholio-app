import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion';
import {
  ChevronDown,
  ArrowUpRight, TrendingUp, Inbox, Users,
  AlertCircle, Clock, Loader2, Moon, Star,
} from 'lucide-react';
import { AreaChart, Area, RadialBarChart, RadialBar, Label, ResponsiveContainer, YAxis } from 'recharts';

import { TalentPanel } from '../../components/agency/TalentPanel';
import { TalentMatchRing } from '../../components/agency/ui/TalentMatchRing';
import { getAgencyOverview, getAgencyProfile, getRecentApplicants } from '../../api/agency';
import './OverviewPage.css';

// ─── Data adapter ─────────────────────────────────────────────────────────────
const toTalentObject = (t) => !t ? null : ({
  id:           t.id,
  name:         t.name,
  photo:        t.avatar || null,
  type:         (t.archetype || 'editorial').toLowerCase(),
  status:       t.status || 'available',
  location:     t.city || null,
  measurements: {
    height: t.height || null,
    bust:   t.bust   || null,
    waist:  t.waist  || null,
    hips:   t.hips   || null,
  },
  bio:          t.bio || null,
});

const STATUS_COLORS = {
  submitted: '#64748b',
  shortlisted: '#0f172a',
  booked: '#10b981',
  passed: '#e2e8f0',
  declined: '#ef4444',
  accepted: '#16a34a',
};

const PIPELINE_COLORS = {
  Submitted: '#64748b',
  Shortlisted: '#0f172a',
  Booked: '#10b981',
  Passed: '#e2e8f0',
  Declined: '#ef4444',
};

const TALENT_MIX_COLORS = ['#C9A55A', '#0f172a', '#94a3b8', '#cbd5e1', '#64748b', '#16a34a'];

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ════════════════════════════════════════════════════════════
// ANIMATED COUNTER HOOK
// ════════════════════════════════════════════════════════════

function AnimatedNumber({ value, duration = 1.2 }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(mv, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    const unsub = rounded.on('change', (v) => setDisplay(v));
    return () => { controls.stop(); unsub(); };
  }, [value]);

  return <span>{display}</span>;
}

function formatRelativeTime(dateString) {
  const value = new Date(dateString);
  if (Number.isNaN(value.getTime())) return '';

  const diffMs = Date.now() - value.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return value.toLocaleDateString();
}

function getApplicantStatus(status) {
  if (!status) return 'submitted';
  if (status === 'accepted') return 'accepted';
  return status;
}

// ════════════════════════════════════════════════════════════
// DYNAMIC SUBTITLE
// ════════════════════════════════════════════════════════════

function buildDynamicSubtitle(kpis, pulse) {
  const pending = kpis?.pendingReview?.count ?? 0;
  const oldest  = kpis?.pendingReview?.oldestDaysAgo;
  if (pending > 0) {
    return `${pending} application${pending === 1 ? '' : 's'} waiting — oldest ${oldest ?? '?'} days ago.`;
  }
  const closingToday = kpis?.activeCastings?.closingToday ?? 0;
  if (closingToday > 0) {
    return `${closingToday} casting${closingToday === 1 ? '' : 's'} close${closingToday === 1 ? 's' : ''} today — time to shortlist.`;
  }
  const idle = pulse?.idleTalent ?? 0;
  if (idle > 0) {
    return `${idle} signed talent haven't been submitted in 30 days.`;
  }
  return 'All caught up — roster looking strong.';
}

// ════════════════════════════════════════════════════════════
// PULSE STRIP
// ════════════════════════════════════════════════════════════

function PulseChip({ icon: Icon, value, label, to, urgent }) {
  const display = value == null ? '—' : value;
  return (
    <motion.div
      className={`ov-pulse-chip${urgent ? ' ov-pulse-chip--urgent' : ''}${value === 0 || value == null ? ' ov-pulse-chip--dim' : ''}`}
      whileHover={{ y: -1, transition: { duration: 0.15 } }}
    >
      <Link to={to} className="ov-pulse-chip-inner">
        <Icon size={14} className="ov-pulse-icon" />
        <span className="ov-pulse-value">{display}</span>
        <span className="ov-pulse-label">{label}</span>
      </Link>
    </motion.div>
  );
}

function PulseStrip({ pulse, rosterCount }) {
  const idle        = pulse?.idleTalent ?? null;
  const avgMatch    = pulse?.avgMatchScore ?? null;
  const idleUrgent  = rosterCount > 0 && idle != null && (idle / rosterCount) > 0.2;
  const matchUrgent = avgMatch != null && avgMatch < 50;

  return (
    <div className="ov-pulse-strip">
      <PulseChip icon={Inbox}  value={pulse?.newToday}     label="new today"          to="/dashboard/agency/applicants" />
      <PulseChip icon={Clock}  value={pulse?.closingWeek}  label="closing this week"  to="/dashboard/agency/casting" />
      <PulseChip icon={Moon}   value={idle}                label="idle signed talent" to="/dashboard/agency/roster" urgent={idleUrgent} />
      <PulseChip icon={Star}   value={avgMatch != null ? `${avgMatch}%` : null} label="avg match score" to="/dashboard/agency/applicants" urgent={matchUrgent} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// EDITORIAL DASHBOARD UI COMPONENTS
// ════════════════════════════════════════════════════════════

function BentoGrid({ children, variants }) {
  return (
    <motion.div className="ov-kpi-grid" variants={variants}>
      {children}
    </motion.div>
  );
}

function EditorialCard({ children, urgent }) {
  return (
    <motion.div 
      className={`ov-kpi ${urgent ? 'ov-kpi--urgent' : ''}`}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
    >
      {children}
    </motion.div>
  );
}

function MicroLabel({ children }) {
  return <span className="ov-kpi-label">{children}</span>;
}

function StatNumeral({ value, align = 'left' }) {
  return (
    <div className="ov-kpi-number" style={{ margin: 'auto 0', textAlign: align }}>
      <AnimatedNumber value={value} />
    </div>
  );
}

function StatusMicroPill({ children }) {
  return <span className="ov-kpi-badge-amber">{children}</span>;
}



// ════════════════════════════════════════════════════════════
// ATTENTION STRIP
// ════════════════════════════════════════════════════════════

function AttentionStripData({ items }) {
  if (!items.length) return null;

  return (
    <div className="ov-attention">
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <motion.div
            key={`${item.variant}-${item.text}`}
            className={`ov-att-card ov-att-card--${item.variant}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="ov-att-icon"><Icon size={16} /></div>
            <p className="ov-att-text">{item.text}</p>
            {item.cta && (
              <Link to={item.cta.to} className="ov-att-cta">
                {item.cta.label} <ArrowUpRight size={11} />
              </Link>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ARCHETYPE DONUT (SVG)
// ════════════════════════════════════════════════════════════

function ArchetypeDonut({ segments }) {
  const size = 120;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = 3; // gap between segments in degrees
  const totalGap = gap * segments.length;
  const usableArc = 360 - totalGap;

  let accumulated = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ov-donut">
      {segments.map((seg, i) => {
        const segAngle = (seg.pct / 100) * usableArc;
        const segLen = (segAngle / 360) * c;
        const gapLen = (gap / 360) * c;
        const rotation = -90 + accumulated + (i * gap);
        accumulated += segAngle;

        return (
          <motion.circle
            key={seg.name}
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={seg.color} strokeWidth={stroke}
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

// ════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════

export default function OverviewPage() {
  const [selected, setSelected] = useState(null);
  const [hoveredStage, setHoveredStage] = useState(null);
  const prefersReducedMotion = useReducedMotion();
  const { data: overview, isLoading, isError } = useQuery({
    queryKey: ['agency', 'overview'],
    queryFn: getAgencyOverview,
    staleTime: 60000,
  });
  const { data: recentApplicants = [] } = useQuery({
    queryKey: ['agency', 'overview', 'recent-applicants'],
    queryFn: () => getRecentApplicants(5),
    staleTime: 60000,
  });
  const { data: profile } = useQuery({
    queryKey: ['agency-profile'],
    queryFn: getAgencyProfile,
    staleTime: 5 * 60 * 1000,
  });

  const containerVars = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVars = {
    hidden: { opacity: 0, y: 15 },
    show: { 
      opacity: 1, 
      y: 0,
      transition: { type: 'spring', stiffness: 60, damping: 14 }
    }
  };

  // Stagger text reveal for hero
  const lineVars = {
    hidden: { opacity: 0, y: 20, clipPath: 'inset(0 0 100% 0)' },
    show: (i) => ({
      opacity: 1,
      y: 0,
      clipPath: 'inset(0 0 0% 0)',
      transition: { 
        duration: 0.7, 
        ease: [0.16, 1, 0.3, 1],
        delay: i * 0.15 
      }
    })
  };

  const kpis = overview?.kpis || {};
  const pendingReview = kpis.pendingReview || { count: 0, oldestDaysAgo: null };
  const activeCastings = kpis.activeCastings || { count: 0, closingToday: 0 };
  const rosterSize = kpis.rosterSize || { count: 0, trend: [] , changeThisMonth: 0 };
  const pulse = overview?.pulse ?? {};
  const dynamicSubtitle = buildDynamicSubtitle(kpis, pulse);
  const pipelineStages = (overview?.pipeline || []).map((stage) => ({
    ...stage,
    pct: stage.sharePct,
    color: PIPELINE_COLORS[stage.label] || '#94a3b8',
    isUrgent: stage.label === 'Submitted',
  }));

  // Pipeline conversion rates (cumulative funnel approximation)
  const pipelineTotal     = pipelineStages.reduce((s, p) => s + p.count, 0);
  const shortlistedCount  = pipelineStages.find(s => s.label === 'Shortlisted')?.count ?? 0;
  const bookedCount       = pipelineStages.find(s => s.label === 'Booked')?.count ?? 0;

  const sub2short  = pipelineTotal > 0
    ? Math.round(((shortlistedCount + bookedCount) / pipelineTotal) * 100)
    : null;
  const short2book = (shortlistedCount + bookedCount) > 0
    ? Math.round((bookedCount / (shortlistedCount + bookedCount)) * 100)
    : null;

  const conversionRates = [
    { label: 'Submitted → Shortlisted', value: sub2short },
    { label: 'Shortlisted → Booked',    value: short2book },
  ];
  const nonZeroRates = conversionRates.filter(r => r.value !== null && r.value > 0);
  const weakestGate  = nonZeroRates.length > 0
    ? nonZeroRates.reduce((min, r) => r.value < min.value ? r : min)
    : null;

  const talentMix = (overview?.talentMix || []).map((item, index) => ({
    ...item,
    pct: item.pct,
    color: TALENT_MIX_COLORS[index % TALENT_MIX_COLORS.length],
  }));
  const utilization = kpis.utilization || { active: 0, total: 0, pct: 0 };
  const utilizationData = [
    { name: 'Track', value: 100, fill: '#E2E8F0' },
    { name: 'Active', value: utilization.pct || 0, fill: '#C9A55A' }
  ];
  const rosterGrowth = (rosterSize.trend || []).map((value) => ({ value }));
  const attentionItems = (overview?.alerts || []).map((alert) => ({
    variant: alert.type,
    icon: alert.type === 'critical' ? AlertCircle : alert.type === 'warning' ? Clock : TrendingUp,
    text: alert.message,
    cta: alert.link ? { label: alert.type === 'warning' ? 'Go to Casting' : 'Review now', to: alert.link } : null,
  }));
  const primaryName = profile?.first_name || profile?.agency_name || 'there';
  const displayApplicants = recentApplicants.map((app) => ({
    id: app.applicationId,
    name: app.name,
    avatar: app.profileImage,
    archetype: null,
    archetypeLabel: app.matchScore ? `${app.matchScore}% match` : 'Recent',
    city: app.location,
    applied: formatRelativeTime(app.createdAt),
    status: getApplicantStatus('submitted'),
    height: app.height,
    bust: null,
    waist: null,
    hips: null,
    bio: null,
    match: app.matchScore || 0,
  }));
  const submittedCount = pipelineStages.find((stage) => stage.label === 'Submitted')?.count || recentApplicants.length;
  const highestDemand = talentMix.reduce((max, item) => item.pct > max.pct ? item : max, talentMix[0]);
  const lowestDemand = talentMix.reduce((min, item) => item.pct < min.pct ? item : min, talentMix[0]);

  if (isLoading) {
    return (
      <div className="ov-page" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#64748b' }}>
          <Loader2 size={20} className="animate-spin" />
          <span>Loading overview…</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="ov-page" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <AlertCircle size={22} style={{ marginBottom: 8 }} />
          <div>Failed to load the overview dashboard.</div>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      className="ov-page"
      initial="hidden"
      animate="show"
      variants={containerVars}
    >

      {/* ── Hero Welcome Block ── */}
      <motion.section className="ov-hero" variants={itemVars}>
        <div className="ov-hero-content">
          <h1 className="ov-hero-title ov-hero-title-gold">
            <motion.span className="ov-hero-line" custom={0} variants={lineVars}>
              {getGreeting()}, {primaryName}.
            </motion.span>
            <motion.span className="ov-hero-line ov-hero-line--sub" custom={1} variants={lineVars}>
              {dynamicSubtitle}
            </motion.span>
          </h1>
        </div>
      </motion.section>

      {/* ── Attention Strip ── */}
      <AttentionStripData items={attentionItems} />

      {/* ── Pulse Strip ── */}
      <PulseStrip pulse={pulse} rosterCount={rosterSize.count} />

      {/* ── Row 1: KPI cards ── */}
      <BentoGrid variants={itemVars}>
        
        {/* Card 1: Pending Review */}
        <EditorialCard urgent>
          <div className="ov-kpi-head">
            <MicroLabel>Pending Review</MicroLabel>
          </div>
          <StatNumeral value={pendingReview.count} />
          <div className="ov-kpi-urgent-sub" style={{ fontSize: '11px', color: '#9CA3AF' }}>
            Oldest: {pendingReview.oldestDaysAgo == null ? 'none' : `${pendingReview.oldestDaysAgo} days ago`}
          </div>
          <div className="ov-kpi-bg-numeral">{pendingReview.count}</div>
        </EditorialCard>

        {/* Card 2: Active Castings */}
        <EditorialCard>
          <div className="ov-kpi-head">
            <MicroLabel>Active Castings</MicroLabel>
            <StatusMicroPill>{activeCastings.closingToday} closing today</StatusMicroPill>
          </div>
          <StatNumeral value={activeCastings.count} />
          <div className="ov-kpi-dots-row">
            {Array.from({ length: Math.max(activeCastings.count, 1) }).slice(0, 8).map((_, index) => (
              <span
                key={index}
                className={`ov-kpi-dot ${index < activeCastings.closingToday ? 'glow' : ''}`}
              />
            ))}
          </div>
        </EditorialCard>

        {/* Card 3: Roster Size */}
        <EditorialCard>
          <div className="ov-kpi-head">
            <MicroLabel>Roster Size</MicroLabel>
          </div>
          <StatNumeral value={rosterSize.count} align="center" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="ov-roster-growth-chart" style={{ width: '100%', height: 36 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={rosterGrowth.length ? rosterGrowth : [{ value: 0 }]} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="rosterGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#C9A55A" stopOpacity={0.4}/>
                      <stop offset="100%" stopColor="#C9A55A" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <YAxis domain={['dataMin - 5', 'dataMax + 5']} hide />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#C9A55A" 
                    strokeWidth={2.5} 
                    fill="url(#rosterGradient)"
                    isAnimationActive={!prefersReducedMotion} 
                    animationDuration={1000} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <span className="ov-kpi-change positive" style={{ color: '#16a34a', background: 'transparent', padding: 0, fontSize: '0.75rem', alignSelf: 'flex-start' }}>
              ↑ {rosterSize.changeThisMonth} this month
            </span>
          </div>
        </EditorialCard>

        {/* Card 4: Active Talent Utilization */}
        <EditorialCard>
          <div className="ov-kpi-head">
            <MicroLabel>Roster Active</MicroLabel>
          </div>
          <div className="ov-kpi-body--center" style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="ov-placement-hero">
              <div className="ov-placement-halo" />
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  cx="50%" cy="50%"
                  innerRadius="72%" outerRadius="90%"
                  startAngle={90} endAngle={-270}
                  data={utilizationData}
                  barSize={12}
                  style={{ margin: '0 auto' }}
                >
                  <RadialBar
                    dataKey="value"
                    cornerRadius={5}
                    isAnimationActive={!prefersReducedMotion}
                  />
                  <Label
                    value={`${utilization.pct || 0}%`}
                    position="center"
                    style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, fill: '#C9A55A' }}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <span className="ov-placement-caption" style={{ marginTop: 8, fontSize: '10px', letterSpacing: '0.08em', color: '#9CA3AF' }}>
              OF ROSTER SUBMITTED
            </span>
            <span className="ov-placement-season">
              {utilization.active} of {utilization.total} active in 30 days
            </span>
          </div>
        </EditorialCard>
      </BentoGrid>

      {/* ── Row 2: Pipeline + Archetypes ── */}
      <motion.div className="ov-row-3" variants={itemVars}>
        {/* Pipeline card */}
        <motion.div className="ov-card">
          <div className="ov-card-header">
            <div className="ov-card-title-group">
              <TrendingUp size={16} className="ov-card-icon" />
              <h2 className="ov-card-title">Casting Pipeline</h2>
            </div>
          </div>

          {/* Animated stacked bar */}
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

          {/* Conversion rates */}
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

        {/* Archetypes card — now with donut */}
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

      {/* ── Row 3: Applications + Promo ── */}
      <motion.div className="ov-row-2" variants={itemVars}>
        {/* Applications card */}
        <motion.div className="ov-card ov-card--apps">
          <div className="ov-card-header">
            <div className="ov-card-title-group">
              <Inbox size={16} className="ov-card-icon" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 className="ov-card-title">Recent Applications</h2>
                <span className="ov-app-count-badge">{submittedCount}</span>
              </div>
            </div>
            <div className="ov-sort-btn">
              Newest <ChevronDown size={14} />
            </div>
          </div>

          <div className="ov-app-list">
            {displayApplicants.map((t, idx) => (
              <motion.div
                key={t.id}
                onClick={() => setSelected(t)}
                className="ov-app-row"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className={`ov-app-avatar-wrap ${t.status === 'submitted' ? 'ov-app-avatar-wrap--new' : ''}`}>
                  <img src={t.avatar} alt={t.name} className="ov-app-avatar" />
                  <span className="ov-status-dot" style={{ background: STATUS_COLORS[t.status] }} />
                </div>
                <div className="ov-app-info">
                  <span className="ov-app-name">{t.name}</span>
                  <span className="ov-app-meta">
                    <span className="ov-app-badge ov-badge--editorial">{t.archetypeLabel}</span>
                    {t.city} · {t.applied}
                  </span>
                </div>
                <div className="ov-app-match-col">
                  <TalentMatchRing score={t.match || 0} size="sm" />
                </div>
                <div className="ov-app-quick-actions" onClick={e => e.stopPropagation()}>
                  <Link to="/dashboard/agency/applicants" className="ov-quick-btn ov-quick-btn--accept">Open</Link>
                  <Link to="/dashboard/agency/applicants" className="ov-quick-btn ov-quick-btn--review">Review</Link>
                </div>
              </motion.div>
            ))}
            {displayApplicants.length === 0 && (
              <div className="ov-app-row" style={{ cursor: 'default' }}>
                <div className="ov-app-info">
                  <span className="ov-app-name">No recent applications yet.</span>
                  <span className="ov-app-meta">New submissions will appear here.</span>
                </div>
              </div>
            )}
          </div>

          <Link to="/dashboard/agency/applicants" className="ov-view-all">
            View all applications <ArrowUpRight size={14} />
          </Link>
        </motion.div>

        {/* Dark editorial promo card */}
        <motion.div className="ov-promo">
          {/* Floating particles */}
          <div className="ov-promo-particles">
            {[...Array(8)].map((_, i) => (
              <span key={i} className="ov-particle" style={{ '--i': i }} />
            ))}
          </div>
          <div className="ov-promo-content">
            <span className="ov-promo-eyebrow">DISCOVER</span>
            <h3 className="ov-promo-heading">
              {pulse.discoverableCount != null
                ? `${pulse.discoverableCount} profiles ready to discover`
                : 'Explore New Talent'}
            </h3>
            <p className="ov-promo-body">
              {pulse.newTalentWeek != null
                ? `${pulse.newTalentWeek} new talent joined this week. Updated in real time.`
                : 'Browse curated talent from our network. Updated in real time.'}
            </p>
            <Link to="/dashboard/agency/discover" className="ov-promo-cta">
              <span className="ov-cta-text">Discover</span>
              <ArrowUpRight size={14} />
              <span className="ov-cta-shimmer" />
            </Link>
          </div>
          <div className="ov-promo-glow" />
          <div className="ov-promo-glow ov-promo-glow--2" />
          <div className="ov-promo-glow ov-promo-glow--3" />
        </motion.div>
      </motion.div>

      {/* ═══════ TALENT PANEL ═══════ */}
      <AnimatePresence>
        {selected && (
          <TalentPanel
            key={selected.id}
            talent={toTalentObject(selected)}
            context="overview"
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>

    </motion.div>
  );
}
