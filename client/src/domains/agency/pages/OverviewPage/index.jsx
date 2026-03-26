import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight, TrendingUp, Inbox,
  AlertCircle, Clock, Loader2, Moon, Star,
} from 'lucide-react';

import TalentDetailPanel from '../../components/TalentDetailPanel';
import { getAgencyOverview, getAgencyProfile, getRecentApplicants } from '../../api/agency';
import KpiCards from './KpiCards';
import PipelineChart from './PipelineChart';
import RecentActivity from './RecentActivity';
import './OverviewPage.css';

const PIPELINE_COLORS = {
  Submitted: '#64748b',
  Shortlisted: '#0f172a',
  Booked: '#10b981',
  Passed: '#e2e8f0',
  Declined: '#ef4444',
};

const TALENT_MIX_COLORS = ['#C9A55A', '#0f172a', '#94a3b8', '#cbd5e1', '#64748b', '#16a34a'];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function buildDynamicSubtitle(kpis, pulse) {
  const pending = kpis?.pendingReview?.count ?? 0;
  const oldest = kpis?.pendingReview?.oldestDaysAgo;
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
  const idle = pulse?.idleTalent ?? null;
  const avgMatch = pulse?.avgMatchScore ?? null;
  const idleUrgent = rosterCount > 0 && idle != null && (idle / rosterCount) > 0.2;
  const matchUrgent = avgMatch != null && avgMatch < 50;

  return (
    <div className="ov-pulse-strip">
      <PulseChip icon={Inbox} value={pulse?.newToday} label="new today" to="/dashboard/agency/inbox" />
      <PulseChip icon={Clock} value={pulse?.closingWeek} label="closing this week" to="/dashboard/agency/casting" />
      <PulseChip icon={Moon} value={idle} label="idle signed talent" to="/dashboard/agency/roster" urgent={idleUrgent} />
      <PulseChip icon={Star} value={avgMatch != null ? `${avgMatch}%` : null} label="avg match score" to="/dashboard/agency/inbox" urgent={matchUrgent} />
    </div>
  );
}

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

export default function OverviewPage() {
  const [selected, setSelected] = useState(null);
  const [hoveredStage, setHoveredStage] = useState(null);
  const queryClient = useQueryClient();

  async function handleInlineAction(applicationId, actionFn, optimisticUpdate) {
    const prevData = queryClient.getQueryData(['agency', 'overview', 'recent-applicants']);
    queryClient.setQueryData(['agency', 'overview', 'recent-applicants'], (old = []) =>
      old.map(app => app.applicationId === applicationId ? { ...app, ...optimisticUpdate } : app)
    );
    setSelected(prev =>
      prev?.id === applicationId ? { ...prev, ...optimisticUpdate } : prev
    );
    try {
      await actionFn(applicationId);
      queryClient.invalidateQueries({ queryKey: ['agency', 'overview'] });
    } catch {
      queryClient.setQueryData(['agency', 'overview', 'recent-applicants'], prevData);
      setSelected(prev => prev?.id === applicationId ? null : prev);
      const { toast } = await import('sonner');
      toast.error('Action failed. Please try again.');
    }
  }

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
  const rosterSize = kpis.rosterSize || { count: 0, trend: [], changeThisMonth: 0 };
  const pulse = overview?.pulse ?? {};
  const dynamicSubtitle = buildDynamicSubtitle(kpis, pulse);
  const pipelineStages = (overview?.pipeline || []).map((stage) => ({
    ...stage,
    pct: stage.sharePct,
    color: PIPELINE_COLORS[stage.label] || '#94a3b8',
    isUrgent: stage.label === 'Submitted',
  }));

  const pipelineTotal = pipelineStages.reduce((s, p) => s + p.count, 0);
  const shortlistedCount = pipelineStages.find(s => s.label === 'Shortlisted')?.count ?? 0;
  const bookedCount = pipelineStages.find(s => s.label === 'Booked')?.count ?? 0;

  const sub2short = pipelineTotal > 0
    ? Math.round(((shortlistedCount + bookedCount) / pipelineTotal) * 100)
    : null;
  const short2book = (shortlistedCount + bookedCount) > 0
    ? Math.round((bookedCount / (shortlistedCount + bookedCount)) * 100)
    : null;

  const conversionRates = [
    { label: 'Submitted → Shortlisted', value: sub2short },
    { label: 'Shortlisted → Booked', value: short2book },
  ];
  const nonZeroRates = conversionRates.filter(r => r.value !== null && r.value > 0);
  const weakestGate = nonZeroRates.length > 0
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
    archetypeLabel: app.archetypeLabel || (app.matchScore ? `${app.matchScore}% match` : 'Recent'),
    city: app.location,
    applied: formatRelativeTime(app.createdAt),
    status: getApplicantStatus(app.status),
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

      <AttentionStripData items={attentionItems} />

      <PulseStrip pulse={pulse} rosterCount={rosterSize.count} />

      <KpiCards
        itemVariants={itemVars}
        pendingReview={pendingReview}
        activeCastings={activeCastings}
        rosterSize={rosterSize}
        rosterGrowth={rosterGrowth}
        utilization={utilization}
        utilizationData={utilizationData}
        prefersReducedMotion={prefersReducedMotion}
      />

      <PipelineChart
        itemVariants={itemVars}
        pipelineStages={pipelineStages}
        hoveredStage={hoveredStage}
        setHoveredStage={setHoveredStage}
        conversionRates={conversionRates}
        sub2short={sub2short}
        short2book={short2book}
        weakestGate={weakestGate}
        talentMix={talentMix}
        highestDemand={highestDemand}
        lowestDemand={lowestDemand}
      />

      <RecentActivity
        itemVariants={itemVars}
        displayApplicants={displayApplicants}
        submittedCount={submittedCount}
        pulse={pulse}
        onInlineAction={handleInlineAction}
      />

      <AnimatePresence>
        {selected && (
          <TalentDetailPanel
            key={selected.id}
            profileId={selected.id}
            applicationId={selected.applicationId}
            context="inbox"
            mode="drawer"
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>

    </motion.div>
  );
}
