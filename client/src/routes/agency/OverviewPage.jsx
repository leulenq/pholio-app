import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion';
import {
  ChevronDown,
  Sparkles, ArrowUpRight, TrendingUp, Inbox, Users,
  AlertCircle, Clock
} from 'lucide-react';
import { AreaChart, Area, RadialBarChart, RadialBar, Label, ResponsiveContainer, YAxis } from 'recharts';

import { TalentPanel } from '../../components/agency/TalentPanel';
import { TalentMatchRing } from '../../components/agency/ui/TalentMatchRing';
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

// ════════════════════════════════════════════════════════════
// DATA
// ════════════════════════════════════════════════════════════

const PIPELINE = [
  {
    id: 1, name: 'Amara Johnson', archetype: 'editorial', archetypeLabel: 'Editorial',
    city: 'New York', match: 97, applied: '2h ago', status: 'submitted',
    height: "5'10\"", bust: '34"', waist: '25"', hips: '35"', shoe: '9',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200&h=200',
    bio: 'Versatile editorial talent with a striking presence. 4 years in high-fashion campaigns and lookbook production.',
  },
  {
    id: 2, name: 'Sofia Chen', archetype: 'runway', archetypeLabel: 'Runway',
    city: 'Los Angeles', match: 94, applied: '4h ago', status: 'underReview',
    height: "5'11\"", bust: '33"', waist: '24"', hips: '34"', shoe: '8.5',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=200&h=200',
    bio: 'Haute couture specialist featured in NYFW SS25 and Paris Fashion Week.',
  },
  {
    id: 3, name: 'Zara Williams', archetype: 'commercial', archetypeLabel: 'Commercial',
    city: 'Miami', match: 88, applied: 'Yesterday', status: 'submitted',
    height: "5'8\"", bust: '35"', waist: '26"', hips: '36"', shoe: '8',
    avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&q=80&w=200&h=200',
    bio: 'Natural, approachable presence perfect for lifestyle and brand campaigns.',
  },
  {
    id: 4, name: 'Elena Marcus', archetype: 'editorial', archetypeLabel: 'Editorial',
    city: 'New York', match: 91, applied: 'Yesterday', status: 'shortlisted',
    height: "5'9\"", bust: '34"', waist: '25"', hips: '35"', shoe: '8.5',
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=200&h=200',
    bio: 'Award-winning editorial talent. Known for expressive storytelling through movement.',
  },
  {
    id: 5, name: 'Mia Thompson', archetype: 'lifestyle', archetypeLabel: 'Lifestyle',
    city: 'Chicago', match: 85, applied: '2d ago', status: 'passed',
    height: "5'7\"", bust: '36"', waist: '27"', hips: '37"', shoe: '7.5',
    avatar: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&q=80&w=200&h=200',
    bio: 'Wellness and fitness-focused talent. Authentic energy with camera confidence.',
  },
];

const ARCHETYPES = [
  { name: 'Editorial', pct: 45, color: '#C9A55A' },
  { name: 'Runway', pct: 28, color: '#0f172a' },
  { name: 'Commercial', pct: 17, color: '#94a3b8' },
  { name: 'Lifestyle', pct: 10, color: '#cbd5e1' },
];

const PIPELINE_STAGES = [
  { label: 'Submitted', count: 47, color: '#64748b', pct: 40 },
  { label: 'Under Review', count: 22, color: '#C9A55A', pct: 25, isUrgent: true },
  { label: 'Shortlisted', count: 12, color: '#0f172a', pct: 15 },
  { label: 'Booked', count: 8, color: '#10b981', pct: 10 },
  { label: 'Passed', count: 11, color: '#e2e8f0', pct: 10 },
];

const STATUS_COLORS = {
  submitted: '#64748b',
  underReview: '#C9A55A',
  shortlisted: '#0f172a',
  booked: '#10b981',
  passed: '#e2e8f0',
};

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

const ATTENTION_ITEMS = [
  {
    variant: 'critical',
    icon: AlertCircle,
    text: '4 applicants have been in Under Review for 14+ days.',
    cta: { label: 'View them', to: '/dashboard/agency/applicants' },
  },
  {
    variant: 'warning',
    icon: Clock,
    text: '2 castings close today — submissions still open.',
    cta: { label: 'Go to Casting', to: '/dashboard/agency/casting' },
  },
  {
    variant: 'positive',
    icon: TrendingUp,
    text: '2 new applications submitted in the last 2 hours.',
    cta: { label: 'Review now', to: '/dashboard/agency/applicants' },
  },
];

function AttentionStrip() {
  return (
    <div className="ov-attention">
      {ATTENTION_ITEMS.map((item, i) => {
        const Icon = item.icon;
        return (
          <motion.div
            key={i}
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

  const mockRosterGrowth = [
    { value: 112 }, { value: 115 }, { value: 118 }, { value: 119 },
    { value: 122 }, { value: 125 }, { value: 128 }
  ];
  
  // Placement Rate mock data
  const placementData = [
    { name: 'Track', value: 100, fill: '#E2E8F0' },
    { name: 'Placement', value: 68, fill: '#C9A55A' }
  ];

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
              {getGreeting()}, Sarah.
            </motion.span>
            <motion.span className="ov-hero-line ov-hero-line--sub" custom={1} variants={lineVars}>
              Here's where your roster stands today.
            </motion.span>
          </h1>
        </div>
      </motion.section>

      {/* ── Attention Strip ── */}
      <AttentionStrip />

      {/* ── Row 1: KPI cards ── */}
      <BentoGrid variants={itemVars}>
        
        {/* Card 1: Pending Review */}
        <EditorialCard urgent>
          <div className="ov-kpi-head">
            <MicroLabel>Pending Review</MicroLabel>
          </div>
          <StatNumeral value={14} />
          <div className="ov-kpi-urgent-sub" style={{ fontSize: '11px', color: '#9CA3AF' }}>
            Oldest: 4 days ago
          </div>
          <div className="ov-kpi-bg-numeral">14</div>
        </EditorialCard>

        {/* Card 2: Active Castings */}
        <EditorialCard>
          <div className="ov-kpi-head">
            <MicroLabel>Active Castings</MicroLabel>
            <StatusMicroPill>2 closing today</StatusMicroPill>
          </div>
          <StatNumeral value={6} />
          <div className="ov-kpi-dots-row">
            <span className="ov-kpi-dot glow" />
            <span className="ov-kpi-dot glow" />
            <span className="ov-kpi-dot" />
            <span className="ov-kpi-dot" />
            <span className="ov-kpi-dot" />
            <span className="ov-kpi-dot" />
          </div>
        </EditorialCard>

        {/* Card 3: Roster Size */}
        <EditorialCard>
          <div className="ov-kpi-head">
            <MicroLabel>Roster Size</MicroLabel>
          </div>
          <StatNumeral value={128} align="center" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="ov-roster-growth-chart" style={{ width: '100%', height: 36 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockRosterGrowth} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
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
              ↑ 3 this month
            </span>
          </div>
        </EditorialCard>

        {/* Card 4: Placement Rate */}
        <EditorialCard>
          <div className="ov-kpi-head">
            <MicroLabel>Placement Rate</MicroLabel>
          </div>
          <div className="ov-kpi-body--center" style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="ov-placement-hero">
              <div className="ov-placement-halo" />
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart 
                  cx="50%" 
                  cy="50%" 
                  innerRadius="72%" 
                  outerRadius="90%" 
                  startAngle={90} 
                  endAngle={-270} 
                  data={placementData}
                  barSize={12}
                  style={{ margin: '0 auto' }}
                >
                  <RadialBar 
                    dataKey="value" 
                    cornerRadius={5}
                    isAnimationActive={!prefersReducedMotion}
                  />
                  <Label 
                    value="68%" 
                    position="center" 
                    style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, fill: '#C9A55A' }} 
                  />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <span className="ov-placement-caption" style={{ marginTop: 8, fontSize: '10px', letterSpacing: '0.08em', color: '#9CA3AF' }}>OF CASTINGS BOOKED</span>
            <span className="ov-placement-season">↑ from 61% last season</span>
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
            {PIPELINE_STAGES.map((s, i) => (
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
            {PIPELINE_STAGES.map(s => (
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
            <ArchetypeDonut segments={ARCHETYPES} />
            <div className="ov-arch-list">
              {ARCHETYPES.map(a => (
                <div key={a.name} className="ov-arch-row">
                  <span className="ov-arch-dot" style={{ background: a.color }} />
                  <span className="ov-arch-name">{a.name}</span>
                  <span className="ov-arch-pct">{a.pct}%</span>
                </div>
              ))}
              <div className="ov-arch-insights">
                <span className="ov-arch-demand">
                  Spring '26 demand: {ARCHETYPES.reduce((max, a) => a.pct > max.pct ? a : max, ARCHETYPES[0]).name} ↑
                </span>
                <Link to="/dashboard/agency/discover" className="ov-arch-scout-cta">
                  Low {ARCHETYPES.reduce((min, a) => a.pct < min.pct ? a : min, ARCHETYPES[0]).name} talent on roster — consider scouting.
                </Link>
              </div>
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
                <h2 className="ov-card-title">New Applications</h2>
                <span className="ov-app-count-badge">47</span>
              </div>
            </div>
            <button className="ov-sort-btn">
              Newest <ChevronDown size={14} />
            </button>
          </div>

          <div className="ov-app-list">
            {PIPELINE.map((t, idx) => (
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
                    <span className={`ov-app-badge ov-badge--${t.archetype}`}>{t.archetypeLabel}</span>
                    {t.city} · {t.applied}
                  </span>
                </div>
                <div className="ov-app-match-col">
                  <TalentMatchRing score={t.match || 0} size="sm" />
                </div>
                <div className="ov-app-quick-actions" onClick={e => e.stopPropagation()}>
                  <button className="ov-quick-btn ov-quick-btn--accept">Accept</button>
                  <button className="ov-quick-btn ov-quick-btn--review">Review</button>
                </div>
              </motion.div>
            ))}
          </div>

          <Link to="/dashboard/agency/applicants" className="ov-view-all">
            View all 47 applications <ArrowUpRight size={14} />
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
            <h3 className="ov-promo-heading">Explore New Talent</h3>
            <p className="ov-promo-body">
              Browse AI-matched profiles from our curated talent network. Updated in real time.
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
