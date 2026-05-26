import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  ChevronRight,
  FileText,
  Activity,
  TrendingUp,
  AlertCircle,
  Download,
  Globe,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../../auth/hooks/useAuth';
import { useAnalytics } from '../../hooks/useAnalytics';
import { talentApi } from '../../api/talent';
import './OverviewPage.css';

function imageUrl(img) {
  if (!img) return null;
  const src = img.public_url || img.path;
  if (!src) return null;
  if (src.startsWith('http')) return src;
  return src.startsWith('/') ? src : `/uploads/${src}`;
}

function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseChangePct(change) {
  if (change == null || change === '') return 0;
  if (typeof change === 'number' && Number.isFinite(change)) return change;
  const m = String(change).match(/-?\d+/);
  return m ? asNum(m[0]) : 0;
}

function portfolioShareUrl(slug) {
  if (!slug) return null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/portfolio/${slug}`;
}

function displayHost(url) {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, '');
  }
}

function getGreetingByTime(date = new Date()) {
  const hour = date.getHours();
  const day = date.getDay();
  const isWeekend = day === 0 || day === 6;

  const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (isWeekend) return 'Happy weekend';
  if (day === 1) return 'Happy Monday';
  if (day === 5 && hour >= 12) return 'Happy Friday';
  return timeGreeting;
}

function applicationsCount(payload) {
  if (Array.isArray(payload)) return { ok: true, count: payload.length };
  if (payload?.data && Array.isArray(payload.data)) return { ok: true, count: payload.data.length };
  return { ok: false };
}

function buildChecklist(images, completeness, profile) {
  const hasPhotos = Array.isArray(images) && images.length > 0;
  const pct = asNum(completeness?.percentage);
  const hasMeasurements = !!(
    profile?.height || profile?.measurements || profile?.chest || profile?.waist || profile?.hips
  );

  return [
    {
      id: 'photos',
      label: 'Casting Polaroids',
      status: hasPhotos ? 'Verified' : 'Required',
      urgency: hasPhotos ? 'success' : 'critical',
      link: '/dashboard/talent/media',
    },
    {
      id: 'profile',
      label: 'Digital Resume',
      status: pct >= 40 ? 'In Sync' : 'Incomplete',
      urgency: pct >= 40 ? 'success' : 'critical',
      link: '/dashboard/talent/profile',
    },
    {
      id: 'measurements',
      label: 'Measurements',
      status: hasMeasurements ? 'Verified' : 'Required',
      urgency: hasMeasurements ? 'success' : 'critical',
      link: '/dashboard/talent/profile',
    },
    {
      id: 'reel',
      label: 'Intro Reel (30s)',
      status: 'Optional',
      urgency: 'none',
      link: '/dashboard/talent/media',
    },
  ];
}

export default function OverviewPage() {
  const { profile, subscription, completeness, images, isLoading: profileLoading } = useAuth();
  const isPro = !!subscription?.isPro;

  const {
    summary,
    analytics,
    timeseries,
    summaryError,
    isLoading: analyticsLoading,
    isAnalyticsLoading,
    refetch: refetchAnalytics,
    isAnalyticsRefetching,
  } = useAnalytics(30, { includeAdvanced: isPro });

  const {
    data: applicationsPayload,
    isPending: appsPending,
    isError: appsError,
  } = useQuery({
    queryKey: ['applications'],
    queryFn: () => talentApi.getApplications(),
    staleTime: 60 * 1000,
    retry: 1,
  });

  const appsParsed = applicationsCount(applicationsPayload);
  const appsCount = appsParsed.ok
    ? appsParsed.count
    : Array.isArray(applicationsPayload)
      ? applicationsPayload.length
      : applicationsPayload?.data?.length || 0;

  const firstName = profile?.first_name || '';
  const imageCount = Array.isArray(images) ? images.length : 0;
  const greeting = getGreetingByTime();

  const views = asNum(summary?.views?.total);
  const viewsDelta = parseChangePct(
    summary?.views?.changePct ?? summary?.views?.change
  );
  const websiteUrl = portfolioShareUrl(profile?.slug);
  const websiteHost = displayHost(websiteUrl);

  const siteViews = asNum(analytics?.views?.total ?? summary?.views?.total);
  const siteDownloads = asNum(analytics?.downloads?.total ?? summary?.downloads?.total);
  const engagement = analytics?.engagement?.counts || {};
  const linkClicks =
    asNum(engagement.social_click) + asNum(engagement.portfolio_click);
  const bioReads = asNum(engagement.bio_read);
  const topSource =
    Array.isArray(analytics?.views?.latestSourceBreakdown) &&
    analytics.views.latestSourceBreakdown.length > 0
      ? analytics.views.latestSourceBreakdown[0]
      : null;

  const websiteSparkline = (Array.isArray(timeseries) ? timeseries : [])
    .slice(-14)
    .map((d) => asNum(d.views));
  const sparkMax = Math.max(1, ...websiteSparkline);
  const readinessPct = asNum(completeness?.percentage);

  const checklist = buildChecklist(images, completeness, profile);
  const allClear = checklist.filter((c) => c.urgency !== 'none').every((c) => c.urgency === 'success');

  const photoSlots = Array.isArray(images) ? images.slice(0, 5) : [];
  const extraCount = Math.max(0, imageCount - 5);
  return (
    <div className="ov-container">
      <div className="ov-inner">
        <header className="ov-hero">
          <motion.div
            className="ov-hero-identity"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {profileLoading ? (
              <span className="ov-skel ov-skel--name" aria-hidden />
            ) : (
              <h1 className="ov-hero-name">
                <span className="ov-hero-greeting">{greeting}</span>
                <span className="ov-hero-name-row">
                  <span className="ov-hero-firstname">{firstName || 'Talent'}</span>
                  <span className={`ov-tier-pill ${isPro ? 'ov-tier-pill--studio' : 'ov-tier-pill--free'}`}>
                    {isPro ? 'Studio+' : 'Free'}
                  </span>
                </span>
              </h1>
            )}

            <motion.div
              className="ov-hero-sweep"
              style={{ transformOrigin: 'left' }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.9, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
              aria-hidden
            />

            <div className="ov-hero-kpis" aria-label="Performance summary">
              <div className="ov-hero-kpi">
                <span className="ov-hero-kpi-label">Profile Views</span>
                <span className="ov-hero-kpi-value">{views.toLocaleString()}</span>
              </div>
              <div className="ov-hero-kpi">
                <span className="ov-hero-kpi-label">Readiness</span>
                <span className="ov-hero-kpi-value">{readinessPct}%</span>
              </div>
              <div className="ov-hero-kpi">
                <span className="ov-hero-kpi-label">Submissions</span>
                <span className="ov-hero-kpi-value">{appsPending || appsError ? '—' : appsCount}</span>
              </div>
            </div>
          </motion.div>
        </header>

        <div className="ov-hairline" aria-hidden />

        <div className="ov-grid">
          <div className="ov-col-8">
            <div className="ov-book">
              <div className="ov-book-header">
                <div className="ov-book-title-group">
                  <div>
                    <span className="ov-kicker-muted">The Book</span>
                    <span className="ov-book-title-text">
                      The <em>Book.</em>
                    </span>
                    <span className="ov-book-count">
                      {imageCount} {imageCount === 1 ? 'frame' : 'frames'}
                    </span>
                  </div>
                </div>
                <Link to="/dashboard/talent/media" className="ov-book-manage" aria-label="Manage portfolio frames">
                  Manage Frames <ArrowUpRight size={12} aria-hidden />
                </Link>
              </div>

              <div className="ov-book-grid" role="list" aria-label="Portfolio images">
                {photoSlots[0] ? (
                  <Link
                    to="/dashboard/talent/media"
                    className="ov-book-featured"
                    role="listitem"
                    aria-label="Featured portfolio image"
                  >
                    <img src={imageUrl(photoSlots[0])} alt="Featured portfolio" className="ov-book-photo" />
                    <div className="ov-book-featured-overlay" aria-hidden>
                      <span className="ov-book-featured-eyebrow">Featured Cover</span>
                      <p className="ov-book-featured-caption">
                        {firstName || 'Featured frame'}
                      </p>
                    </div>
                  </Link>
                ) : (
                  <Link
                    to="/dashboard/talent/media"
                    className="ov-book-featured ov-book-empty"
                    role="listitem"
                    aria-label="Add first portfolio image"
                  >
                    <span className="ov-book-empty-headline">Add a frame</span>
                    <span className="ov-book-empty-sub">Your cover image</span>
                  </Link>
                )}

                {[1, 2, 3].map((idx) => {
                  const img = photoSlots[idx];
                  return img ? (
                    <Link
                      key={idx}
                      to="/dashboard/talent/media"
                      className="ov-book-img-small"
                      role="listitem"
                      aria-label={`Portfolio image ${idx + 1}`}
                    >
                      <img src={imageUrl(img)} alt="" className="ov-book-photo" />
                    </Link>
                  ) : (
                    <Link
                      key={idx}
                      to="/dashboard/talent/media"
                      className="ov-book-img-small ov-book-empty"
                      role="listitem"
                      aria-label="Add portfolio image"
                    />
                  );
                })}

                {photoSlots[4] && extraCount > 0 ? (
                  <Link
                    to="/dashboard/talent/media"
                    className="ov-book-more"
                    role="listitem"
                    aria-label={`${extraCount} more images`}
                  >
                    <span className="ov-book-more-count">+{extraCount}</span>
                    <span className="ov-book-more-label">Frames</span>
                  </Link>
                ) : photoSlots[4] ? (
                  <Link
                    to="/dashboard/talent/media"
                    className="ov-book-img-small"
                    role="listitem"
                    aria-label="Portfolio image 5"
                  >
                    <img src={imageUrl(photoSlots[4])} alt="" className="ov-book-photo" />
                  </Link>
                ) : (
                  <Link to="/dashboard/talent/media" className="ov-book-more" role="listitem" aria-label="Add more images">
                    <span className="ov-book-more-label">Add</span>
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="ov-col-4">
            <div className="ov-readiness">
              <div className="ov-readiness-header">
                <div>
                  <span className="ov-kicker-muted">Readiness</span>
                  <h2 className="ov-readiness-title">
                    The <em>Audit.</em>
                  </h2>
                </div>
                <div className="ov-readiness-pct" aria-label={`${readinessPct}% complete`}>
                  {readinessPct}
                  <sup>%</sup>
                </div>
              </div>

              <div className="ov-checklist" role="list">
                {checklist.map((item) => (
                  <Link
                    key={item.id}
                    to={item.link}
                    className="ov-check-item"
                    role="listitem"
                    aria-label={`${item.label}: ${item.status}`}
                  >
                    <div className="ov-check-left">
                      <span className={`ov-check-mark ov-check-mark--${item.urgency}`} aria-hidden />
                      <span className="ov-check-label">{item.label}</span>
                    </div>
                    <div className="ov-check-right">
                      <span className="ov-check-status">{item.status}</span>
                      <ChevronRight size={12} className="ov-check-arrow" aria-hidden />
                    </div>
                  </Link>
                ))}
              </div>

              <Link to="/dashboard/talent/profile" className="ov-audit-cta">
                {allClear ? 'View Profile' : 'Continue Audit'}
              </Link>
            </div>
          </div>
        </div>

        <div className="ov-grid">
          <div className="ov-col-6">
            <div className="ov-exposure">
              <div className="ov-exposure-header">
                <div>
                  <span className="ov-kicker-muted">Exposure</span>
                  <h2 className="ov-exposure-title">
                    The <em>Market.</em>
                  </h2>
                </div>
                {!analyticsLoading && !summaryError && viewsDelta > 0 && (
                  <p className="ov-delta-note">
                    <TrendingUp size={11} aria-hidden />
                    <span>+{viewsDelta}% views</span>
                  </p>
                )}
              </div>

              {analyticsLoading ? (
                <div className="ov-market-metrics">
                  <div className="ov-stat-cell">
                    <div className="ov-skel" style={{ width: '80px', height: '2.5rem', marginBottom: '8px' }} />
                    <div className="ov-skel ov-skel--line" style={{ width: '120px' }} />
                  </div>
                  <div className="ov-stat-cell">
                    <div className="ov-skel" style={{ width: '48px', height: '2.5rem', marginBottom: '8px' }} />
                    <div className="ov-skel ov-skel--line" style={{ width: '100px' }} />
                  </div>
                </div>
              ) : summaryError ? (
                <div className="ov-error-inline" role="alert">
                  <AlertCircle size={14} aria-hidden />
                  <span>Analytics unavailable.</span>
                  <button
                    type="button"
                    className="ov-retry-btn"
                    onClick={() => refetchAnalytics()}
                    disabled={isAnalyticsRefetching}
                  >
                    {isAnalyticsRefetching ? '…' : 'Retry'}
                  </button>
                </div>
              ) : (
                <>
                  <div className="ov-market-metrics">
                    <div>
                      <div className="ov-stat-number">
                        <span className="ov-stat-value">{views.toLocaleString()}</span>
                      </div>
                      <p className="ov-stat-label">Global Views (30d)</p>
                    </div>
                    <div>
                      <div className="ov-stat-number">
                        <span className="ov-stat-value ov-stat-value--gold">
                          {appsPending || appsError ? '—' : appsCount}
                        </span>
                      </div>
                      <p className="ov-stat-label">Submissions</p>
                    </div>
                  </div>
                  <div className="ov-readiness-track-wrap">
                    <div className="ov-readiness-track-head">
                      <span className="ov-visibility-label">Visibility Index</span>
                      <span className="ov-readiness-track-pct">{readinessPct}%</span>
                    </div>
                    <div
                      className="ov-vis-track"
                      role="progressbar"
                      aria-valuenow={readinessPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Profile readiness"
                    >
                      <motion.div
                        className="ov-vis-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${readinessPct}%` }}
                        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="ov-col-6">
            <div className="ov-artifacts">
              <Link
                to="/dashboard/talent/media"
                className="ov-artifact-card ov-artifact-card--light"
                aria-label="Build your comp card"
              >
                <div>
                  <div className="ov-artifact-icon" aria-hidden>
                    <FileText size={20} />
                  </div>
                  <h3 className="ov-artifact-title">
                    Digital <em>Comp Card</em>
                  </h3>
                  <p className="ov-artifact-desc">
                    Generate professional specs with latest polaroids for agency submission.
                  </p>
                </div>
                <div className="ov-artifact-footer">
                  <span className="ov-artifact-badge">{imageCount > 0 ? 'Ready' : 'Add photos first'}</span>
                  <div className="ov-artifact-action">
                    <span>Export</span>
                    <Download size={13} aria-hidden />
                  </div>
                </div>
              </Link>

              <Link
                to="/dashboard/talent/media"
                className="ov-artifact-card ov-artifact-card--dark"
                aria-label="Intro reel"
              >
                <div>
                  <div className="ov-artifact-icon" aria-hidden>
                    <Activity size={20} />
                  </div>
                  <h3 className="ov-artifact-title">
                    Intro <em>Reel</em>
                  </h3>
                  <p className="ov-artifact-desc">
                    Capture a quick 30s screen-test to verify presence and personality.
                  </p>
                </div>
                <div className="ov-artifact-footer">
                  <span className="ov-artifact-badge ov-artifact-badge--missing">Missing</span>
                  <div className="ov-artifact-action">
                    <ArrowUpRight size={14} aria-hidden />
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>

        {isPro && (
          <motion.section
            className="ov-website"
            aria-labelledby="ov-website-heading"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="ov-website-header">
              <div>
                <span className="ov-kicker-muted">Studio+</span>
                <h2 id="ov-website-heading" className="ov-website-title">
                  Your <em>Website.</em>
                </h2>
              </div>
              {websiteUrl && (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ov-website-live"
                >
                  <Globe size={12} aria-hidden />
                  <span>{websiteHost || 'Live site'}</span>
                  <ExternalLink size={11} aria-hidden />
                </a>
              )}
            </div>

            <div className="ov-website-panel">
              {websiteUrl ? (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ov-website-url"
                >
                  <span className="ov-website-url-label">Public URL</span>
                  <span className="ov-website-url-path">/portfolio/{profile?.slug}</span>
                  <ArrowUpRight size={14} className="ov-website-url-arrow" aria-hidden />
                </a>
              ) : (
                <div className="ov-website-url ov-website-url--muted">
                  <span className="ov-website-url-label">Public URL</span>
                  <span className="ov-website-url-path">Set your handle in settings</span>
                </div>
              )}

              {analyticsLoading || isAnalyticsLoading ? (
                <div className="ov-website-metrics ov-website-metrics--loading">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="ov-website-stat">
                      <div className="ov-skel" style={{ width: '64px', height: '2rem', marginBottom: 8 }} />
                      <div className="ov-skel ov-skel--line" style={{ width: '96px' }} />
                    </div>
                  ))}
                </div>
              ) : summaryError ? (
                <div className="ov-error-inline ov-website-error" role="alert">
                  <AlertCircle size={14} aria-hidden />
                  <span>Website analytics unavailable.</span>
                  <button
                    type="button"
                    className="ov-retry-btn"
                    onClick={() => refetchAnalytics()}
                    disabled={isAnalyticsRefetching}
                  >
                    {isAnalyticsRefetching ? '…' : 'Retry'}
                  </button>
                </div>
              ) : (
                <div className="ov-website-analytics">
                  <div className="ov-website-metrics">
                    <div className="ov-website-stat">
                      <div className="ov-website-stat-row">
                        <span className="ov-stat-value">{siteViews.toLocaleString()}</span>
                        {viewsDelta > 0 && (
                          <span className="ov-website-delta">+{viewsDelta}%</span>
                        )}
                      </div>
                      <p className="ov-stat-label">Site visits (30d)</p>
                    </div>
                    <div className="ov-website-stat">
                      <span className="ov-stat-value ov-stat-value--gold">
                        {siteDownloads.toLocaleString()}
                      </span>
                      <p className="ov-stat-label">Comp downloads</p>
                    </div>
                    <div className="ov-website-stat">
                      <span className="ov-stat-value">{linkClicks.toLocaleString()}</span>
                      <p className="ov-stat-label">Link clicks</p>
                    </div>
                    <div className="ov-website-stat">
                      <span className="ov-stat-value">{bioReads.toLocaleString()}</span>
                      <p className="ov-stat-label">
                        {topSource?.label ? `Bio reads · ${topSource.label}` : 'Bio reads'}
                      </p>
                    </div>
                  </div>

                  {websiteSparkline.length > 1 && (
                    <div className="ov-website-spark" aria-hidden>
                      {websiteSparkline.map((v, i) => (
                        <span
                          key={i}
                          className="ov-website-spark-bar"
                          style={{ height: `${Math.max(8, (v / sparkMax) * 100)}%` }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Link to="/dashboard/talent/analytics" className="ov-website-intel">
                Full intel <ArrowUpRight size={12} aria-hidden />
              </Link>
            </div>
          </motion.section>
        )}

      </div>
    </div>
  );
}
