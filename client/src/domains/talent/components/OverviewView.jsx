import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/hooks/useAuth';
import { useAnalytics } from '../hooks/useAnalytics';
import { talentApi } from '../api/talent';
import { Download, Share2, Eye, TrendingUp, Award, ExternalLink, Sparkles, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const stats = {
    views: asFiniteNumber(summary?.views?.total),
    downloads: asFiniteNumber(summary?.downloads?.total),
    profileStrength: asFiniteNumber(completeness?.percentage),
  };

  const applicationsParsed = applicationsCountFromPayload(applicationsPayload);
  const applicationsShapeInvalid =
    !applicationsPending && !applicationsError && !applicationsParsed.ok;

  const getProfileStrengthColor = (percentage) => {
    if (percentage >= 80) return 'strength-high';
    if (percentage >= 50) return 'strength-medium';
    return 'strength-low';
  };

  const getActivityIcon = (activity) => {
    const type = String(activity?.type || activity?.activity_type || '').toLowerCase();
    if (type.includes('view')) return <Eye size={14} aria-hidden />;
    if (type.includes('download')) return <Download size={14} aria-hidden />;
    if (type.includes('share')) return <Share2 size={14} aria-hidden />;
    if (type.includes('award') || type.includes('strength')) return <Award size={14} aria-hidden />;
    return <Clock size={14} aria-hidden />;
  };

  const renderApplicationsCard = () => (
    <div
      className="stat-card stat-card--applications"
      aria-busy={applicationsPending ? true : undefined}
    >
      <div className="stat-icon applications">
        <TrendingUp size={20} aria-hidden />
      </div>
      <div className="stat-content">
        {applicationsError || applicationsShapeInvalid ? (
          <div className="stat-applications-state" role="alert">
            <p className="stat-applications-error-copy">
              {applicationsShapeInvalid
                ? 'Application data was in an unexpected format.'
                : "Couldn't load application count."}
            </p>
            <button
              type="button"
              className="step-action"
              onClick={() => refetchApplications()}
              disabled={applicationsFetching}
            >
              {applicationsFetching ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        ) : applicationsPending ? (
          <>
            <div className="skeleton-value stat-applications-skeleton" aria-hidden />
            <span className="overview-sr-only">Loading application count</span>
          </>
        ) : (
          <div className="stat-value">{applicationsParsed.count}</div>
        )}
        <div className="stat-label">Applications</div>
      </div>
    </div>
  );

  const nextSteps = [
    {
      id: 1,
      title: 'Complete your profile',
      description: 'Add your measurements and bio',
      action: 'Go to Profile',
      link: '/dashboard/talent/profile',
      completed: completeness?.percentage >= 80,
      icon: <CheckCircle size={20} aria-hidden />
    },
    {
      id: 2,
      title: 'Upload portfolio images',
      description: 'Showcase your best work',
      action: 'Add Media',
      link: '/dashboard/talent/media',
      completed: Array.isArray(images) && images.length > 0,
      icon: <CheckCircle size={20} aria-hidden />
    },
    {
      id: 3,
      title: 'Download your comp card',
      description: 'Share it with agencies',
      action: 'Download',
      onClick: handleCompCardPlaceholder,
      completed: false,
      icon: <Download size={20} aria-hidden />
    }
  ];

  return (
    <div className="overview-container">
      <div className="overview-grid">
        <div className="overview-main">
          <div className="overview-hero">
            <h1 className="hero-greeting">
              {getGreeting()},{' '}
              <span className="hero-name">{profile?.first_name || 'Talent'}</span>
            </h1>
            <p className="hero-tagline">
              Here's what's happening with your portfolio today
            </p>
          </div>

          <div className="stats-section">
            <h2 className="section-title">At a Glance</h2>

            {profileLoading ? (
              <div className="stats-grid">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="stat-card skeleton-card">
                    <div className="stat-icon skeleton-icon"></div>
                    <div className="stat-content">
                      <div className="skeleton-value"></div>
                      <div className="skeleton-label"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : summaryError ? (
              <div className="stats-grid">
                <div
                  className="stat-card"
                  style={{ gridColumn: '1 / -1', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}
                  role="alert"
                >
                  <AlertCircle size={24} color="#94a3b8" aria-hidden />
                  <p style={{ margin: 0, textAlign: 'center', color: '#64748b', fontSize: '0.875rem', maxWidth: '22rem' }}>
                    Couldn't load profile views and summary stats.
                  </p>
                  <button
                    type="button"
                    className="step-action"
                    onClick={() => refetchAnalytics()}
                    disabled={isAnalyticsRefetching}
                  >
                    {isAnalyticsRefetching ? 'Retrying…' : 'Retry'}
                  </button>
                </div>

                {renderApplicationsCard()}

                <div className="stat-card">
                  <div className={`stat-icon profile-strength ${getProfileStrengthColor(stats.profileStrength)}`}>
                    <Award size={20} aria-hidden />
                  </div>
                  <div className="stat-content">
                    <div className="stat-value">{stats.profileStrength}%</div>
                    <div className="stat-label">Profile Strength</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon views">
                    <Eye size={20} aria-hidden />
                  </div>
                  <div className="stat-content">
                    <div className="stat-value">{stats.views}</div>
                    <div className="stat-label">Profile Views</div>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon downloads">
                    <Download size={20} aria-hidden />
                  </div>
                  <div className="stat-content">
                    <div className="stat-value">{stats.downloads}</div>
                    <div className="stat-label">Downloads</div>
                  </div>
                </div>

                {renderApplicationsCard()}

                <div className="stat-card">
                  <div className={`stat-icon profile-strength ${getProfileStrengthColor(stats.profileStrength)}`}>
                    <Award size={20} aria-hidden />
                  </div>
                  <div className="stat-content">
                    <div className="stat-value">{stats.profileStrength}%</div>
                    <div className="stat-label">Profile Strength</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="next-steps-section">
            <h2 className="section-title">Next Steps</h2>

            {profileLoading ? (
              <div className="next-steps-list">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="next-step-card skeleton-card">
                    <div className="skeleton-icon" style={{ width: '24px', height: '24px', borderRadius: '50%' }}></div>
                    <div className="step-content">
                      <div className="skeleton-value" style={{ height: '0.9375rem', marginBottom: '0.25rem' }}></div>
                      <div className="skeleton-label" style={{ height: '0.8125rem' }}></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="next-steps-list">
                {nextSteps.map((step) => (
                  <div key={step.id} className={`next-step-card ${step.completed ? 'completed' : ''}`}>
                    <div className={`step-checkbox ${step.completed ? 'checked' : ''}`}>
                      {step.completed && step.icon}
                    </div>

                    <div className="step-content">
                      <h3 className="step-title">{step.title}</h3>
                      <p className="step-description">{step.description}</p>
                    </div>

                    {!step.completed && (
                      step.link ? (
                        <Link to={step.link} className="step-action">
                          {step.action}
                        </Link>
                      ) : (
                        <button type="button" onClick={step.onClick} className="step-action">
                          {step.action}
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="utility-rail">
          <div className="utility-rail-sticky">
            <h3 className="rail-title">Quick Actions</h3>
            
            <div className="rail-actions">
              <button
                type="button"
                onClick={handleCompCardPlaceholder}
                className="action-card primary"
              >
                <div className="action-icon primary">
                  <Download size={24} aria-hidden />
                </div>
                <div className="action-content">
                  <h4 className="action-title">Download Comp Card</h4>
                  <p className="action-description">Professional PDF for agencies</p>
                </div>
              </button>

              <button
                type="button"
                onClick={handleShareProfile}
                className="action-card secondary"
              >
                <div className="action-icon">
                  <Share2 size={24} aria-hidden />
                </div>
                <div className="action-content">
                  <h4 className="action-title">Share Profile</h4>
                  <p className="action-description">Copy your public link</p>
                </div>
              </button>

              {profile?.slug ? (
                <a
                  href={`/portfolio/${profile.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="action-card secondary"
                >
                  <div className="action-icon">
                    <ExternalLink size={24} aria-hidden />
                  </div>
                  <div className="action-content">
                    <h4 className="action-title">View Public Profile</h4>
                    <p className="action-description">See what others see</p>
                  </div>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={handleViewPublicPortfolio}
                  className="action-card secondary"
                >
                  <div className="action-icon">
                    <ExternalLink size={24} aria-hidden />
                  </div>
                  <div className="action-content">
                    <h4 className="action-title">View Public Profile</h4>
                    <p className="action-description">Set your profile URL in settings first</p>
                  </div>
                </button>
              )}
            </div>

            <div className="rail-activity">
              <h3 className="rail-title">Recent Activity</h3>

              {activitiesLoading ? (
                <div className="activity-loading" role="status" aria-live="polite">
                  <div className="loading-spinner"></div>
                  <span className="overview-sr-only">Loading recent activity</span>
                </div>
              ) : activityError ? (
                <div className="activity-empty" role="alert">
                  <AlertCircle size={24} aria-hidden />
                  <p>Couldn't load recent activity.</p>
                  <button
                    type="button"
                    className="step-action"
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => refetchAnalytics()}
                    disabled={isAnalyticsRefetching}
                  >
                    {isAnalyticsRefetching ? 'Retrying…' : 'Retry'}
                  </button>
                </div>
              ) : activities && activities.length > 0 ? (
                <div className="activity-list">
                  {activities.map((activity) => {
                    const fallbackKey = [
                      activity?.type || activity?.activity_type || 'activity',
                      activity?.message || 'event',
                      activity?.createdAt || activity?.created_at || activity?.timeAgo || 'unknown',
                    ].join(':');
                    return (
                    <div key={activity.id || fallbackKey} className="activity-item">
                      <div className="activity-icon">
                        {getActivityIcon(activity)}
                      </div>
                      <div className="activity-content">
                        <p className="activity-message">{activity.message}</p>
                        <div className="activity-time">
                          <Clock size={12} />
                          <span>{activity.timeAgo}</span>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              ) : (
                <div className="activity-empty">
                  <Clock size={24} aria-hidden />
                  <p>No recent activity</p>
                </div>
              )}
            </div>

            {!subscription?.isPro && (
              <div className="rail-upgrade">
                <a href="https://www.pholio.studio/pricing" className="upgrade-button">
                  <Sparkles size={16} aria-hidden />
                  <span>Upgrade to Studio+</span>
                </a>
              </div>
            )}
          </div>
        </aside>

      </div>
    </div>
  );
}
