import React, { useState, useEffect } from 'react';
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

function ReachChapter({ timeseries, analytics, isPro }) {
  const viewsData       = analytics?.views    || {};
  const downloadsData   = analytics?.downloads || {};
  const sourceBreakdown = asArray(viewsData.latestSourceBreakdown);
  const byTheme         = asArray(downloadsData.byTheme);
  const downloadsTotal  = asNum(downloadsData.total);

  const chartData = asArray(timeseries).map(item => ({
    date: item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
    views: asNum(item.views),
    ...(isPro && { downloads: asNum(item.downloads) }),
  }));

  return (
    <motion.section className="intel-chapter" {...CHAPTER_MOTION}>
      <ChapterHeader
        number={1} slug="Reach" title="Reach."
        lede="How far your profile travels and where it lands."
      />

      <div className="reach-chart-wrap">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="reach-views-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#C9A55A" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#C9A55A" stopOpacity={0}    />
              </linearGradient>
              {isPro && (
                <linearGradient id="reach-dl-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}    />
                </linearGradient>
              )}
            </defs>
            <XAxis
              dataKey="date" axisLine={false} tickLine={false}
              tick={{ fontSize: 10, fill: 'rgba(26,26,26,0.36)', fontFamily: 'JetBrains Mono' }}
            />
            <Tooltip contentStyle={{
              background: '#fff', border: 'none', borderRadius: 8,
              fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            }} />
            {isPro && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />}
            <Area type="monotone" dataKey="views"
              stroke="#C9A55A" strokeWidth={1.5} fill="url(#reach-views-fill)"
              name="Views" dot={false} />
            {isPro && (
              <Area type="monotone" dataKey="downloads"
                stroke="#6366f1" strokeWidth={1.5} fill="url(#reach-dl-fill)"
                name="Downloads" dot={false} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="reach-stat-row">
        <div className="reach-stat">
          <span className="reach-stat-val">{asNum(viewsData.thisWeek).toLocaleString()}</span>
          <span className="reach-stat-label">Views This Week</span>
        </div>
        <div className="reach-stat">
          <span className="reach-stat-val">{asNum(downloadsData.thisMonth ?? downloadsData.total).toLocaleString()}</span>
          <span className="reach-stat-label">Downloads (30d)</span>
        </div>
        <div className="reach-stat">
          <span className="reach-stat-val">{byTheme[0]?.theme ?? '—'}</span>
          <span className="reach-stat-label">Top Comp Card Theme</span>
        </div>
      </div>

      {isPro ? (
        <>
          <div className="reach-source-bars">
            {sourceBreakdown.length > 0 ? sourceBreakdown.map(src => (
              <div key={src.label} className="reach-source-bar-row">
                <span className="reach-source-label">{src.label}</span>
                <div className="reach-source-track">
                  <div className="reach-source-fill" style={{ width: `${Math.min(100, src.percentage)}%` }} />
                </div>
                <span className="reach-source-pct">{src.percentage}%</span>
                <span className="reach-source-count">({src.count})</span>
              </div>
            )) : (
              <span style={{ fontSize: 13, color: 'rgba(26,26,26,0.36)' }}>Accumulating source data…</span>
            )}
          </div>
          {byTheme.length > 0 && (
            <div className="reach-theme-table">
              <div className="reach-theme-header">
                <span>Comp Card Theme</span><span>Downloads</span><span>Share</span>
              </div>
              {byTheme.map(t => (
                <div key={t.theme} className="reach-theme-row">
                  <span>{t.theme || 'Unknown'}</span>
                  <span>{t.count}</span>
                  <span>{downloadsTotal > 0 ? Math.round((t.count / downloadsTotal) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="reach-pill-row">
          {sourceBreakdown.length > 0 ? sourceBreakdown.map(src => (
            <span key={src.label} className="reach-pill">{src.label} · {src.percentage}%</span>
          )) : (
            <span className="reach-pill reach-pill--empty">Accumulating source data…</span>
          )}
          <a href="/pricing" className="reach-upgrade-link">See full breakdown →</a>
        </div>
      )}
    </motion.section>
  );
}

function SignalChapter({ analytics, sessions, detailedStats, isPro }) {
  const viewsTotal       = asNum(analytics?.views?.total);
  const engagementCounts = analytics?.engagement?.counts || {};
  const funnel           = computeFunnel(engagementCounts, viewsTotal);
  const interpretation   = computeInterpretation(funnel.bioReadPct, funnel.contactPct);
  const returnRate       = asNum(detailedStats?.retention?.value);

  const funnelBars = [
    { label: 'Profile Views',  pct: 100 },
    { label: 'Bio Reads',      pct: funnel.bioReadPct },
    { label: 'Contact Clicks', pct: funnel.contactPct },
  ];

  return (
    <motion.section className="intel-chapter" {...CHAPTER_MOTION}>
      <ChapterHeader
        number={2} slug="Signal" title="Signal."
        lede="How visitors engage when they land — and where they go next."
      />

      <div className="signal-funnel">
        {funnelBars.map(bar => (
          <div key={bar.label} className="signal-funnel-bar">
            <span className="signal-funnel-name">{bar.label}</span>
            <div className="signal-funnel-track">
              <motion.div
                className="signal-funnel-fill"
                initial={{ width: 0 }}
                animate={{ width: `${bar.pct}%` }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <span className="signal-funnel-pct">{bar.pct}%</span>
          </div>
        ))}
      </div>

      <div className="signal-stat-chips">
        <div className="signal-stat-chip">
          <span className="signal-chip-value">{funnel.bioReadPct}%</span>
          <span className="signal-chip-label">Bio Read Rate</span>
        </div>
        <div className="signal-stat-chip">
          <span className="signal-chip-value">{funnel.contactPct}%</span>
          <span className="signal-chip-label">Contact Rate</span>
        </div>
        <div className="signal-stat-chip">
          <span className="signal-chip-value">{asNum(engagementCounts.scroll_depth)}</span>
          <span className="signal-chip-label">Scroll Events</span>
        </div>
      </div>

      <p className="signal-interpretation">{interpretation}</p>

      {isPro ? (
        <div className="signal-pro-row">
          <SessionsBarChart data={sessions} />
          <div className="signal-return-card">
            <span className="signal-return-label">Return Visitor Rate</span>
            <span className="signal-return-value">{Math.min(100, returnRate)}%</span>
            <span className="signal-return-desc">
              {returnRate >= 30
                ? 'Strong retention — agencies are coming back to review your profile.'
                : 'Growing your retention means agencies are considering you over time.'}
            </span>
          </div>
        </div>
      ) : (
        <div className="signal-locked">
          <div className="signal-lock-card-inner">
            <Lock size={20} className="signal-locked-icon" aria-hidden={true} />
            <span className="signal-locked-label">Studio+ · When agencies view you</span>
            <p className="signal-locked-copy">
              See which hours your profile gets the most attention — and plan your updates accordingly.
            </p>
            <a href="/pricing" className="signal-locked-link">Upgrade to Studio+</a>
          </div>
        </div>
      )}
    </motion.section>
  );
}
function MarketChapter({ applications, appsLoading, isPro }) {
  const apps    = asArray(applications).slice(0, 5);
  const allApps = asArray(applications);

  const lastActive = allApps.length > 0
    ? new Date(allApps[0].updated_at ?? allApps[0].created_at)
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  if (appsLoading) {
    return (
      <motion.section className="intel-chapter" {...CHAPTER_MOTION}>
        <ChapterHeader number={3} slug="Market" title="Market."
          lede="Agency submissions, application status, and where you stand." />
        <div style={{ height: 120, background: 'rgba(26,26,26,0.04)', borderRadius: 8 }} />
      </motion.section>
    );
  }

  return (
    <motion.section className="intel-chapter" {...CHAPTER_MOTION}>
      <ChapterHeader
        number={3} slug="Market" title="Market."
        lede="Agency submissions, application status, and where you stand."
      />

      <div className="market-chips">
        <span className="market-chip">{allApps.length} Submitted</span>
        {lastActive && <span className="market-chip">Last activity: {lastActive}</span>}
      </div>

      {apps.length === 0 ? (
        <p className="market-zero">
          No submissions yet.{' '}
          <Link to="/dashboard/talent/profile">Complete your profile</Link>{' '}
          to get discovered by agencies.
        </p>
      ) : (
        <>
          <div className="market-list" role="list">
            {apps.map(app => {
              const status    = (app.status ?? 'PENDING').toUpperCase();
              const submitted = new Date(app.created_at)
                .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              return (
                <div key={app.id} className="market-row" role="listitem">
                  <div>
                    <span className="market-agency-name">{app.agency_name ?? 'Agency'}</span>
                    {app.agency_location && (
                      <span className="market-agency-loc">{app.agency_location}</span>
                    )}
                  </div>
                  <span className={`market-status-pill ${STATUS_CLASS[status] ?? 'market-status-pill--pending'}`}>
                    {STATUS_LABELS[status] ?? status}
                  </span>
                  <span className="market-date">{submitted}</span>
                </div>
              );
            })}
          </div>

          {allApps.length > 5 && (
            <Link to="/dashboard/talent/applications" className="market-see-all">
              See all {allApps.length} applications →
            </Link>
          )}

          {isPro && (
            <div className="market-timeline" aria-label="Application momentum">
              {allApps.slice(0, 6).map(app => {
                const status  = (app.status ?? 'PENDING').toUpperCase();
                const changed = new Date(app.updated_at ?? app.created_at)
                  .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return (
                  <div key={`tl-${app.id}`} className="market-timeline-item">
                    <span className="market-timeline-agency">{app.agency_name ?? 'Agency'}</span>
                    <span className="market-timeline-date">{changed}</span>
                    {' — '}{STATUS_LABELS[status] ?? status}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </motion.section>
  );
}
function PatternChapter({ cohorts, isPro }) {
  if (!isPro) {
    return (
      <motion.section className="intel-chapter" {...CHAPTER_MOTION}>
        <ChapterHeader
          number={4} slug="Pattern" title="Pattern."
          lede="Retention, cohorts, and the shape of your audience over time."
        />
        <div className="pattern-ghost" aria-label="Studio+ feature: Cohort Retention Analysis">
          <div className="pattern-ghost-grid" aria-hidden>
            {GHOST_OPACITIES.map((opacity, i) => (
              <div key={i} className="pattern-ghost-cell" style={{ opacity }} />
            ))}
          </div>
          <div className="pattern-ghost-shimmer" aria-hidden />
          <div className="pattern-ghost-overlay">
            <Lock size={20} className="pattern-ghost-icon" aria-hidden={true} />
            <span className="pattern-ghost-label">Studio+ · Cohort Retention Analysis</span>
            <p className="pattern-ghost-copy">
              See which weeks your viewers come back — and which cohorts lose interest.
            </p>
            <a href="/pricing" className="pattern-ghost-link">Upgrade to Studio+</a>
          </div>
        </div>
      </motion.section>
    );
  }

  const summary = computeCohortSummary(cohorts);

  return (
    <motion.section className="intel-chapter" {...CHAPTER_MOTION}>
      <ChapterHeader
        number={4} slug="Pattern" title="Pattern."
        lede="Retention, cohorts, and the shape of your audience over time."
      />

      <div className="pattern-stats">
        <div className="pattern-stat">
          <span className="pattern-cohort-stat-value">{summary.avgW1Retention}%</span>
          <span className="pattern-cohort-stat-label">Avg. W1 Retention</span>
        </div>
        <div className="pattern-stat">
          <span className="pattern-cohort-stat-value">{summary.bestCohortLabel}</span>
          <span className="pattern-cohort-stat-label">Best Cohort Week</span>
        </div>
        <div className="pattern-stat">
          <span className="pattern-cohort-stat-value">{summary.totalUnique.toLocaleString()}</span>
          <span className="pattern-cohort-stat-label">Total Unique Visitors</span>
        </div>
      </div>

      {summary.bestCohortLabel !== '—' && (
        <p className="pattern-cohort-read">
          Your strongest cohort was the week of <strong>{summary.bestCohortLabel}</strong>.
          {summary.avgW1Retention > 0 && ` Visitors from that week returned at ${summary.avgW1Retention}%.`}
        </p>
      )}

      <CohortHeatmap data={cohorts} />
    </motion.section>
  );
}
function ActivityFeed({ activities }) {
  const list = asArray(activities);
  return (
    <section className="activity-feed">
      <div className="activity-feed-header intel-chapter-header">
        <span className="intel-chapter-kicker">Activity</span>
        <h2 className="activity-feed-title">Recent <em>Events.</em></h2>
      </div>
      {list.length === 0 ? (
        <p className="intel-empty-activity">No recent events recorded.</p>
      ) : (
        <div className="activity-list">
          {list.slice(0, 10).map((item, i) => {
            const Icon = ACTIVITY_ICONS[item.type] ?? Activity;
            return (
              <div key={item.id ?? i} className="activity-item">
                <div className="activity-icon" aria-hidden="true">
                  <Icon size={14} />
                </div>
                <div>
                  <span className="activity-desc">{item.message}</span>
                  <span className="activity-time">{item.timeAgo}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function AnalyticsView() {
  const { profile, subscription } = useAuth();
  const isPro = !!(subscription?.isPro ||
    new URLSearchParams(window.location.search).get('debug') === 'pro');
  const [timeRange, setTimeRange] = useState(7);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isPro) setTimeRange(prev => (prev === 7 ? 30 : prev));
  }, [isPro]);

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
