import React, { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Eye, Download, Briefcase, TrendingUp, Lock, Activity,
  CheckCircle, FileText,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAnalytics } from '../hooks/useAnalytics';
import { useAuth } from '../../auth/hooks/useAuth';
import { talentApi } from '../api/talent';
import CohortHeatmap from './CohortHeatmap';
import SessionsBarChart from './SessionsBarChart';

const CHAPTER_MOTION = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const GHOST_OPACITIES = [
  0.12, 0.45, 0.65, 0.28, 0.08, 0.22,
  0.55, 0.32, 0.75, 0.18, 0.42, 0.60,
  0.80, 0.25, 0.14, 0.68, 0.38, 0.22,
  0.10, 0.52, 0.30, 0.48, 0.62, 0.20,
];

const STATUS_LABELS = {
  PENDING: 'Pending', REVIEWING: 'Reviewing',
  ACCEPTED: 'Accepted', DECLINED: 'Declined',
};

const STATUS_CLASS = {
  PENDING: 'market-status-pill--pending', REVIEWING: 'market-status-pill--reviewing',
  ACCEPTED: 'market-status-pill--accepted', DECLINED: 'market-status-pill--declined',
};

const ACTIVITY_ICONS = {
  view: Eye, download: Download, application: CheckCircle, profile_update: FileText,
};

function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

// eslint-disable-next-line react-refresh/only-export-components
export function computeFunnel(engagementCounts, viewsTotal) {
  const bioReads      = asNum(engagementCounts?.bio_read);
  const contactClicks = asNum(engagementCounts?.social_click) + asNum(engagementCounts?.portfolio_click);
  const bioReadPct    = viewsTotal > 0 ? Math.round((bioReads      / viewsTotal) * 100) : 0;
  const contactPct    = viewsTotal > 0 ? Math.round((contactClicks / viewsTotal) * 100) : 0;
  return { bioReads, bioReadPct, contactClicks, contactPct };
}

// eslint-disable-next-line react-refresh/only-export-components
export function computeInterpretation(bioReadPct, contactPct) {
  if (bioReadPct === 0 && contactPct === 0)
    return 'Build up your profile to start collecting engagement signals.';
  if (bioReadPct >= 50 && contactPct < 10)
    return 'Most visitors read your bio — fewer click through. Strengthen your social links or portfolio URL.';
  if (bioReadPct < 20)
    return "Visitors aren't reaching your bio. A stronger headline or cover image may help pull them in.";
  if (contactPct >= 20)
    return 'Strong contact rate — visitors are actively looking for ways to reach you.';
  return 'Solid engagement. Keep your bio and contact links current for best results.';
}

// eslint-disable-next-line react-refresh/only-export-components
export function computeCohortSummary(cohorts) {
  const list = asArray(cohorts);
  if (list.length === 0) return { avgW1Retention: 0, bestCohortLabel: '—', totalUnique: 0 };
  const w1Values = list.map(c => asNum(c.retention?.[1])).filter(v => v > 0);
  const avgW1Retention = w1Values.length > 0
    ? Math.round(w1Values.reduce((a, b) => a + b, 0) / w1Values.length) : 0;
  const bestIdx = list.reduce(
    (best, c, i) => asNum(c.retention?.[1]) > asNum(list[best]?.retention?.[1]) ? i : best, 0,
  );
  const bestCohortLabel = list[bestIdx]?.label ?? '—';
  const totalUnique     = list.reduce((sum, c) => sum + asNum(c.users ?? c.count), 0);
  return { avgW1Retention, bestCohortLabel, totalUnique };
}

function applicationsArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload?.data && Array.isArray(payload.data)) return payload.data;
  return [];
}

function ChapterHeader({ number, slug, title, lede }) {
  return (
    <div className="intel-chapter-header">
      <span className="intel-chapter-kicker">
        {number != null ? `${String(number).padStart(2, '0')} · ` : ''}{slug}
      </span>
      <h2 className="intel-chapter-title">The <em>{title}</em></h2>
      {lede && <p className="intel-chapter-lede">{lede}</p>}
    </div>
  );
}

function TimeRangeSelector({ value, onChange, isPro }) {
  const ranges = [
    { label: '7d',  days: 7,  proOnly: false },
    { label: '30d', days: 30, proOnly: true  },
    { label: '90d', days: 90, proOnly: true  },
  ];
  return (
    <div className="intel-time-range">
      {ranges.map(r => (
        <button
          key={r.days}
          className={`intel-time-btn${value === r.days ? ' intel-time-btn--active' : ''}`}
          onClick={() => onChange(r.days)}
          disabled={r.proOnly && !isPro}
          aria-label={`Show ${r.label} analytics`}
        >
          {r.label}
          {r.proOnly && !isPro && <Lock size={9} className="intel-time-lock" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

function HeroKPIRow({ views, viewsDelta, downloads, completeness, appsCount, appsLoading, isPro, isLoading }) {
  const kpis = [
    { label: 'Profile Views',        value: isLoading   ? '—' : views.toLocaleString(),    delta: isPro ? viewsDelta : null, Icon: Eye        },
    { label: 'Comp Card Downloads',  value: isLoading   ? '—' : downloads.toLocaleString(), delta: null,                     Icon: Download   },
    { label: 'Agency Submissions',   value: appsLoading ? '—' : String(appsCount),          delta: null,                     Icon: Briefcase  },
    { label: 'Visibility Score',     value: isLoading   ? '—' : `${completeness}%`,         delta: null,                     Icon: TrendingUp },
  ];
  return (
    <div className="intel-kpi-row">
      {kpis.map(({ label, value, delta, Icon }) => (
        <div key={label} className="intel-kpi">
          <Icon size={14} className="intel-kpi-icon" aria-hidden />
          <span className="intel-kpi-label">{label}</span>
          <span className="intel-kpi-value">{value}</span>
          {isPro && delta !== null && delta !== 0 && (
            <span className={`intel-kpi-delta ${delta > 0 ? 'intel-kpi-delta--up' : 'intel-kpi-delta--down'}`}>
              {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function IntelMasthead({ profile, summary, subscription, appsCount, appsLoading, timeRange, onTimeRangeChange, isLoading }) {
  const isPro        = !!subscription?.isPro;
  const views        = asNum(summary?.views?.total);
  const viewsDelta   = asNum(summary?.views?.changePct ?? summary?.views?.changePercent ?? summary?.views?.deltaPct);
  const downloads    = asNum(summary?.downloads?.total);
  const completeness = asNum(summary?.completeness?.percentage);
  const profileId    = profile?.id?.slice(0, 3)?.toUpperCase() ?? '···';

  return (
    <header className="intel-masthead">
      <div className="intel-masthead-inner">
        <div className="intel-masthead-top">
          <div className="intel-masthead-copy">
            <span className="intel-kicker">Intel · PH-{profileId}</span>
            {isLoading
              ? <div className="intel-skel intel-skel--title" aria-hidden />
              : <h1 className="intel-display">The <em>Intel.</em></h1>}
            <p className="intel-lede">Profile signals, agency interest, and performance intelligence.</p>
            <span className={`intel-tier-pill${isPro ? ' intel-tier-pill--studio' : ''}`}>
              {isPro ? 'Studio+ Member' : 'Free'}
            </span>
          </div>
          <TimeRangeSelector value={timeRange} onChange={onTimeRangeChange} isPro={isPro} />
        </div>

        <HeroKPIRow
          views={views}
          viewsDelta={viewsDelta}
          downloads={downloads}
          completeness={completeness}
          appsCount={appsCount}
          appsLoading={appsLoading}
          isPro={isPro}
          isLoading={isLoading}
        />
      </div>
      <div className="intel-hairline" />
    </header>
  );
}

function ReachChapter()   { return null; }
function SignalChapter()  { return null; }
function MarketChapter()  { return null; }
function PatternChapter() { return null; }
function ActivityFeed()   { return null; }

export default function AnalyticsView() {
  const { profile, subscription } = useAuth();
  const isPro = !!(subscription?.isPro ||
    new URLSearchParams(window.location.search).get('debug') === 'pro');
  const [timeRange, setTimeRange] = useState(isPro ? 30 : 7);

  const { analytics, activities, summary, timeseries, detailedStats, sessions, cohorts,
    isLoading, isError, refetch } = useAnalytics(timeRange, { includeAdvanced: isPro });

  const { data: appsPayload, isPending: appsLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: () => talentApi.getApplications(),
    staleTime: 60_000,
    retry: 1,
  });
  const applications = applicationsArray(appsPayload);

  if (isError && !isLoading) {
    return (
      <div className="intel-masthead" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', padding: '48px clamp(32px,5.4vw,72px)' }}>
        <div>
          <span className="intel-kicker">Intel</span>
          <h1 className="intel-display" style={{ marginBottom: 16 }}>Something went <em>wrong.</em></h1>
          <p className="intel-lede">We couldn't load your Intel right now.</p>
          <button onClick={() => refetch()} style={{
            marginTop: 24, padding: '10px 24px', borderRadius: 8,
            background: 'rgba(201,165,90,0.14)', border: '1px solid rgba(201,165,90,0.28)',
            color: '#C9A55A', fontFamily: 'Inter', fontSize: 13, cursor: 'pointer',
          }}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <IntelMasthead
        profile={profile}
        summary={summary}
        subscription={subscription}
        appsCount={applications.length}
        appsLoading={appsLoading}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        isLoading={isLoading}
      />
      <div className="intel-body">
        <ReachChapter   timeseries={timeseries}   analytics={analytics}  isPro={isPro} />
        <SignalChapter  analytics={analytics}      sessions={sessions}    detailedStats={detailedStats} isPro={isPro} />
        <MarketChapter  applications={applications} appsLoading={appsLoading} isPro={isPro} />
        <PatternChapter cohorts={cohorts}           isPro={isPro} />
        <ActivityFeed   activities={activities} />
      </div>
    </div>
  );
}
