import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/hooks/useAuth';
import { useAnalytics } from '../hooks/useAnalytics';
import { talentApi } from '../api/talent';
import {
  Download, Share2, Eye, TrendingUp, ExternalLink,
  Sparkles, CheckCircle, Clock, AlertCircle, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { TierBadgeFromSubscription } from '../../../shared/components/ui/TierBadge';
import './OverviewView.css';

// GET /applications after api-client unwrap: array or { data: [] }; else malformed (never fake 0).
function applicationsCountFromPayload(data) {
  if (Array.isArray(data)) return { ok: true, count: data.length };
  if (data != null && typeof data === 'object' && Array.isArray(data.data)) {
    return { ok: true, count: data.data.length };
  }
  return { ok: false };
}

function asFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getStrengthSub(pct) {
  if (pct >= 80) return 'Complete!';
  if (pct >= 50) return 'Good progress';
  return 'Keep building';
}

export default function OverviewView() {
  const { profile, subscription, completeness, isLoading: profileLoading, images } = useAuth();
  const {
    activities,
    isLoading: activitiesLoading,
    summary,
    summaryError,
    activityError,
    refetch: refetchAnalytics,
    isAnalyticsRefetching,
  } = useAnalytics();

  const {
    data: applicationsPayload,
    isPending: applicationsPending,
    isError: applicationsError,
    refetch: refetchApplications,
    isFetching: applicationsFetching,
  } = useQuery({
    queryKey: ['applications'],
    queryFn: () => talentApi.getApplications(),
    staleTime: 1000 * 60,
    retry: 1,
  });

  const handleCompCardPlaceholder = () => {
    toast.info('Comp card download is not available yet — we will add it in a future update.');
  };

  const handleShareProfile = () => {
    if (!profile?.slug) {
      toast.error('Set your public profile URL in settings before sharing.');
      return;
    }
    const profileUrl = `${window.location.origin}/portfolio/${profile.slug}`;
    navigator.clipboard.writeText(profileUrl).then(() => {
      toast.success('Profile link copied to clipboard!');
    }).catch(() => {
      toast.error('Failed to copy link');
    });
  };

  const handleViewPublicPortfolio = () => {
    if (!profile?.slug) {
      toast.info('Set your profile URL in settings to preview your public portfolio.');
    }
  };

  const stats = {
    views: asFiniteNumber(summary?.views?.total),
    downloads: asFiniteNumber(summary?.downloads?.total),
    profileStrength: asFiniteNumber(completeness?.percentage),
  };

  const applicationsParsed = applicationsCountFromPayload(applicationsPayload);
  const applicationsShapeInvalid =
    !applicationsPending && !applicationsError && !applicationsParsed.ok;

  const nextSteps = [
    {
      id: 1,
      title: 'Complete your profile',
      description: 'Add your measurements and bio',
      action: 'Go to Profile',
      link: '/dashboard/talent/profile',
      completed: completeness?.percentage >= 80,
    },
    {
      id: 2,
      title: 'Upload portfolio images',
      description: 'Showcase your best work',
      action: 'Add Media',
      link: '/dashboard/talent/media',
      completed: Array.isArray(images) && images.length > 0,
    },
    {
      id: 3,
      title: 'Download your comp card',
      description: 'Share it with agencies',
      action: 'Download',
      onClick: handleCompCardPlaceholder,
      completed: false,
    },
  ];

  const completedCount = nextSteps.filter(s => s.completed).length;

  function getActivityDotColor(activity) {
    const type = String(activity?.type || activity?.activity_type || '').toLowerCase();
    if (type.includes('view'))     return '#C9A55A';
    if (type.includes('download')) return '#1A1815';
    if (type.includes('share'))    return '#3b82f6';
    return '#C8C2BA';
  }

  return (
    <div className="ov-container">

      {/* ════════════════════════════════
          HERO
      ════════════════════════════════ */}
      <header className="ov-hero">
        <div className="ov-hero-eyebrow-row">
          <span className="ov-hero-eyebrow">Welcome back,</span>
          <TierBadgeFromSubscription subscription={subscription} />
        </div>

        <h1 className="ov-hero-name">
          {profile?.first_name || 'Talent'}
        </h1>

        <p className="ov-hero-tagline">
          You're Creating{' '}
          <span className="ov-tagline-gold">
            opportunities in the creative industry.
          </span>
        </p>
      </header>

      {/* ════════════════════════════════
          KPI GRID (4 columns)
      ════════════════════════════════ */}
      <section className="ov-kpi-section" aria-label="Stats at a glance">
        {profileLoading ? (
          <div className="ov-kpi-grid">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="ov-kpi ov-kpi--skeleton">
                <div className="ov-skel ov-skel--icon" />
                <div className="ov-skel ov-skel--num" />
                <div className="ov-skel ov-skel--label" style={{ marginTop: '10px' }} />
                <div className="ov-skel ov-skel--sub" style={{ marginTop: '6px' }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="ov-kpi-grid">
            {/* Profile Views */}
            <div className="ov-kpi">
              <Eye className="ov-kpi-ico" size={22} aria-hidden />
              <div className="ov-kpi-number">
                {summaryError ? '—' : stats.views.toLocaleString()}
              </div>
              <div className="ov-kpi-label">Profile Views</div>
              <div className="ov-kpi-sub">This month</div>
            </div>

            {/* Downloads */}
            <div className="ov-kpi">
              <Download className="ov-kpi-ico" size={22} aria-hidden />
              <div className="ov-kpi-number">
                {summaryError ? '—' : stats.downloads.toLocaleString()}
              </div>
              <div className="ov-kpi-label">Downloads</div>
              <div className="ov-kpi-sub">Your materials</div>
            </div>

            {/* Applications */}
            <div className="ov-kpi" aria-busy={applicationsPending ? true : undefined}>
              <TrendingUp className="ov-kpi-ico" size={22} aria-hidden />
              <div className="ov-kpi-number">
                {applicationsPending ? (
                  <span className="ov-skel ov-skel--num-inline" aria-hidden />
                ) : applicationsError || applicationsShapeInvalid ? (
                  <span className="ov-kpi-err-inline">
                    <button
                      type="button"
                      className="ov-retry-btn"
                      onClick={() => refetchApplications()}
                      disabled={applicationsFetching}
                    >
                      {applicationsFetching ? '…' : 'Retry'}
                    </button>
                  </span>
                ) : (
                  applicationsParsed.count
                )}
              </div>
              <div className="ov-kpi-label">Applications</div>
              <div className="ov-kpi-sub">Active submissions</div>
            </div>

            {/* Profile Strength */}
            <div className="ov-kpi">
              <Sparkles className="ov-kpi-ico" size={22} aria-hidden />
              <div className="ov-kpi-number">{stats.profileStrength}%</div>
              <div className="ov-kpi-label">Profile Strength</div>
              <div className="ov-kpi-sub">{getStrengthSub(stats.profileStrength)}</div>
            </div>
          </div>
        )}

        {/* Summary error notice (non-blocking) */}
        {summaryError && !profileLoading && (
          <div className="ov-summary-err" role="alert">
            <AlertCircle size={14} aria-hidden />
            <span>Couldn't load views &amp; downloads.</span>
            <button
              type="button"
              className="ov-retry-btn"
              onClick={() => refetchAnalytics()}
              disabled={isAnalyticsRefetching}
            >
              {isAnalyticsRefetching ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}
      </section>

      {/* ════════════════════════════════
          BOTTOM — Next Steps + Sidebar
      ════════════════════════════════ */}
      <div className="ov-bottom">

        {/* ── Next Steps ── */}
        <div className="ov-bottom-main">
          <section className="ov-section">
            <div className="ov-section-head">
              <p className="ov-label" style={{ margin: 0 }}>Next Steps</p>
              {!profileLoading && (
                <span className="ov-progress-pill">{completedCount}/{nextSteps.length} complete</span>
              )}
            </div>

            {profileLoading ? (
              <div className="ov-steps-card">
                {[1, 2, 3].map(i => (
                  <div key={i} className="ov-step ov-step--skeleton">
                    <div className="ov-skel ov-skel--circle" />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div className="ov-skel ov-skel--line" style={{ width: '55%' }} />
                      <div className="ov-skel ov-skel--line" style={{ width: '38%' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ov-steps-card">
                {nextSteps.map((step, idx) => (
                  <div key={step.id} className={`ov-step ${step.completed ? 'ov-step--done' : ''}`}>
                    <div className={`ov-step-check ${step.completed ? 'checked' : ''}`}>
                      {step.completed
                        ? <CheckCircle size={14} aria-hidden />
                        : <span className="ov-step-num">{idx + 1}</span>}
                    </div>
                    <div className="ov-step-body">
                      <p className="ov-step-title">{step.title}</p>
                      <p className="ov-step-desc">{step.description}</p>
                    </div>
                    {!step.completed && (
                      step.link ? (
                        <Link to={step.link} className="ov-step-cta">
                          {step.action} <ChevronRight size={13} aria-hidden />
                        </Link>
                      ) : (
                        <button type="button" onClick={step.onClick} className="ov-step-cta">
                          {step.action} <ChevronRight size={13} aria-hidden />
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Sidebar ── */}
        <aside className="ov-bottom-aside">

          {/* Quick Actions */}
          <div className="ov-aside-block">
            <p className="ov-label">Quick Actions</p>
            <div className="ov-actions">
              <button
                type="button"
                onClick={handleCompCardPlaceholder}
                className="ov-action ov-action--primary"
              >
                <div className="ov-action-icon"><Download size={16} aria-hidden /></div>
                <div className="ov-action-text">
                  <span className="ov-action-title">Comp Card</span>
                  <span className="ov-action-sub">Download PDF</span>
                </div>
                <ChevronRight size={13} className="ov-action-arrow" aria-hidden />
              </button>

              <button type="button" onClick={handleShareProfile} className="ov-action">
                <div className="ov-action-icon"><Share2 size={16} aria-hidden /></div>
                <div className="ov-action-text">
                  <span className="ov-action-title">Share Profile</span>
                  <span className="ov-action-sub">Copy public link</span>
                </div>
                <ChevronRight size={13} className="ov-action-arrow" aria-hidden />
              </button>

              {profile?.slug ? (
                <a
                  href={`/portfolio/${profile.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ov-action"
                >
                  <div className="ov-action-icon"><ExternalLink size={16} aria-hidden /></div>
                  <div className="ov-action-text">
                    <span className="ov-action-title">Public Profile</span>
                    <span className="ov-action-sub">See what others see</span>
                  </div>
                  <ChevronRight size={13} className="ov-action-arrow" aria-hidden />
                </a>
              ) : (
                <button type="button" onClick={handleViewPublicPortfolio} className="ov-action">
                  <div className="ov-action-icon"><ExternalLink size={16} aria-hidden /></div>
                  <div className="ov-action-text">
                    <span className="ov-action-title">Public Profile</span>
                    <span className="ov-action-sub">Set URL in settings first</span>
                  </div>
                  <ChevronRight size={13} className="ov-action-arrow" aria-hidden />
                </button>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="ov-aside-block">
            <p className="ov-label">Recent Activity</p>

            {activitiesLoading ? (
              <div className="ov-activity-loading" role="status" aria-live="polite">
                <div className="ov-spinner" />
                <span className="overview-sr-only">Loading recent activity</span>
              </div>
            ) : activityError ? (
              <div className="ov-activity-empty" role="alert">
                <AlertCircle size={16} aria-hidden />
                <p>Couldn't load activity.</p>
                <button
                  type="button"
                  className="ov-retry-btn"
                  onClick={() => refetchAnalytics()}
                  disabled={isAnalyticsRefetching}
                >
                  {isAnalyticsRefetching ? 'Retrying…' : 'Retry'}
                </button>
              </div>
            ) : activities && activities.length > 0 ? (
              <div className="ov-activity-list">
                {activities.map((activity) => {
                  const fallbackKey = [
                    activity?.type || activity?.activity_type || 'activity',
                    activity?.message || 'event',
                    activity?.createdAt || activity?.created_at || activity?.timeAgo || 'unknown',
                  ].join(':');
                  return (
                    <div key={activity.id || fallbackKey} className="ov-activity-item">
                      <span
                        className="ov-activity-dot"
                        style={{ backgroundColor: getActivityDotColor(activity) }}
                        aria-hidden
                      />
                      <div className="ov-activity-body">
                        <p className="ov-activity-msg">{activity.message}</p>
                        <p className="ov-activity-time">{activity.timeAgo}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ov-activity-empty">
                <Clock size={16} aria-hidden />
                <p>No recent activity</p>
              </div>
            )}
          </div>

          {/* Studio+ promo */}
          {!subscription?.isPro && (
            <div className="ov-promo" aria-label="Upgrade to Studio+">
              <div className="ov-promo-glow" aria-hidden />
              <div className="ov-promo-content">
                <p className="ov-promo-eyebrow">Studio+</p>
                <h3 className="ov-promo-title">Elevate your presence</h3>
                <p className="ov-promo-body">
                  Custom domain, editorial comp cards, and verified analytics.
                </p>
                <a href="https://www.pholio.studio/pricing" className="ov-promo-cta">
                  <Sparkles size={13} aria-hidden />
                  Upgrade Now
                </a>
              </div>
            </div>
          )}

        </aside>
      </div>
    </div>
  );
}
