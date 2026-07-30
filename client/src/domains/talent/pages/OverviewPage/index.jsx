import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowUpRight,
  ChevronRight,
  FileText,
  AlertCircle,
  Download,
  Globe,
  ExternalLink,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../../auth/hooks/useAuth';
import { useProfileStrength } from '../../hooks/useProfileStrength';
import { READINESS_KEY_TO_PROFILE_URL } from '../../components/profileReadinessItems';
import { useAnalytics } from '../../hooks/useAnalytics';
import { talentApi } from '../../api/talent';
import { bucketCounts } from '../../utils/applicationStatus';
import { StatsCurrencyPrompt } from '../../components/StatsCurrencyPrompt';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import {
  isMinorProfile,
  minorSensitiveFieldsUnlocked,
} from '../../../../shared/utils/talentAge';
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

const PUBLIC_PORTFOLIO_ORIGIN = (
  import.meta.env.VITE_PORTFOLIO_URL || 'https://pholio.studio'
).replace(/\/$/, '');

function portfolioShareUrl(slug) {
  if (!slug) return null;
  return `${PUBLIC_PORTFOLIO_ORIGIN}/${encodeURIComponent(slug)}`;
}

function displayPublicUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.replace(/\/$/, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}

/**
 * Hairline sparkline for the site ledger. Deliberately axis-less and
 * tooltip-less — shape only. The readable chart lives on /analytics.
 */
function SiteSparkline({ series, animate = true }) {
  const width = 220;
  const height = 34;

  const points = Array.isArray(series) ? series : [];
  if (points.length < 2) return null;

  const peak = Math.max(...points.map((p) => p.visits), 1);
  const step = width / (points.length - 1);
  const coords = points.map((point, i) => {
    const x = i * step;
    const y = height - (point.visits / peak) * (height - 3) - 1.5;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      className="ov-site-spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <polyline
        className={animate ? 'ov-site-spark-line ov-site-spark-line--draw' : 'ov-site-spark-line'}
        points={coords.join(' ')}
      />
    </svg>
  );
}

/**
 * The spec line the public site leads with. Only fields the talent has
 * actually filled — no placeholders, no invented values.
 */
function chartDateLabel(value, options = { month: 'short', day: 'numeric' }) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
}

function WebsiteChartTooltip({ active, payload, label }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const visits = asNum(payload[0]?.value);

  return (
    <div className="ov-website-tooltip">
      <span>{chartDateLabel(label, { month: 'long', day: 'numeric' })}</span>
      <strong>{visits.toLocaleString()} {visits === 1 ? 'visit' : 'visits'}</strong>
    </div>
  );
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


export default function OverviewPage() {
  const {
    profile,
    subscription,
    completeness,
    images,
    isLoading: profileLoading,
  } = useAuth();
  const isPro = !!subscription?.isPro;

  const {
    summary,
    analytics,
    analyticsError,
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

  const applicationsList = Array.isArray(applicationsPayload)
    ? applicationsPayload
    : applicationsPayload?.data || [];
  const standing = bucketCounts(applicationsList);

  // Interviews awaiting the talent's response — the clearest "ball in your court" signal.
  const { data: interviewsPayload } = useQuery({
    queryKey: ['talent-interviews'],
    queryFn: () => talentApi.getInterviews(),
    staleTime: 60 * 1000,
    retry: 1,
  });
  const interviewsList = Array.isArray(interviewsPayload)
    ? interviewsPayload
    : interviewsPayload?.data || [];
  const interviewsNeedingResponse = interviewsList.filter(
    (iv) => iv.status === 'pending' || iv.status === 'rescheduled',
  ).length;

  const firstName = profile?.first_name || '';
  const imageCount = Array.isArray(images) ? images.length : 0;
  const greeting = getGreetingByTime();

  const views = asNum(summary?.views?.total);
  const viewsDelta = parseChangePct(
    summary?.views?.changePct ?? summary?.views?.change
  );
  const websiteUrl = portfolioShareUrl(profile?.slug);
  const websiteDisplayUrl = displayPublicUrl(websiteUrl);
  const websiteAnalytics = analytics?.website;
  const websiteAnalyticsConnected = websiteAnalytics?.status === 'connected';
  const websiteMetrics = websiteAnalytics?.metrics || {};
  const siteVisits = asNum(websiteMetrics.visits);
  const uniqueVisitors = asNum(websiteMetrics.uniqueVisitors);
  const sitePageViews = asNum(websiteMetrics.pageViews);
  const outboundClicks = asNum(websiteMetrics.outboundClicks);
  const uniqueVisitorsComplete =
    websiteAnalytics?.measurement?.uniqueVisitors === 'complete';
  const websiteTrend = websiteAnalytics?.trend?.visitsChangePct;
  const websiteSeries = Array.isArray(websiteAnalytics?.series)
    ? websiteAnalytics.series.map((item) => ({
        date: item.date,
        visits: asNum(item.visits),
      }))
    : [];
  const websiteGradientId = `ov-website-gradient-${React.useId().replace(/:/g, '')}`;
  const readinessPct = asNum(completeness?.percentage);

  const { topGaps, totalGaps, isRequiredComplete, fieldCompletion, isLoading: auditLoading } = useProfileStrength();
  const shouldReduce = useReducedMotion();

  const minor = isMinorProfile(profile);
  const sensitiveUnlocked = minorSensitiveFieldsUnlocked(profile);
  const minorGated = minor && !sensitiveUnlocked;
  const showPublicWebsite = isPro && !minorGated;

  // Digitals recency: fieldCompletion.digitals_recency is false when existing digital
  // images are older than DIGITALS_STALE_DAYS (client-side signal, no new date math).
  const isDigitalsStale = fieldCompletion?.digitals_recency === false;
  // Cap displayed readiness at 98 when stale so it never reads as fully complete.
  const displayReadinessPct = isDigitalsStale ? Math.min(readinessPct, 98) : readinessPct;

  const auditCtaLabel = minorGated
    ? 'Record guardian consent'
    : isDigitalsStale
      ? 'Reshoot your digitals'
      : isRequiredComplete
        ? 'View Profile'
        : 'Continue Audit';
  const auditCtaTo = minorGated
    ? '/dashboard/talent/profile?tab=identity'
    : isDigitalsStale
      ? '/dashboard/talent/media'
      : '/dashboard/talent/profile';

  const photoSlots = Array.isArray(images) ? images.slice(0, 5) : [];
  const extraCount = Math.max(0, imageCount - 5);
  return (
    <div className="ov-container">
      <div className="ov-inner">
        <header className="ov-hero">
          <motion.div
            className="ov-hero-identity"
            initial={shouldReduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduce ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
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
              initial={shouldReduce ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: shouldReduce ? 0 : 0.9, delay: shouldReduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
              aria-hidden
            />

            <div className="ov-hero-kpis" aria-label="Submission summary">
              <div className="ov-hero-kpi ov-hero-kpi--lead">
                <span className="ov-hero-kpi-value">
                  {appsPending || appsError ? '—' : appsCount}
                </span>
                <span className="ov-hero-kpi-label">Submissions</span>
              </div>
              <div className="ov-hero-kpi">
                <span className="ov-hero-kpi-value">
                  {appsPending || appsError ? '—' : standing.inReview}
                </span>
                <span className="ov-hero-kpi-label">In review</span>
              </div>
              <div className="ov-hero-kpi">
                <span className="ov-hero-kpi-value">
                  {appsPending || appsError ? '—' : standing.advancing}
                </span>
                <span className="ov-hero-kpi-label">Advancing</span>
              </div>
              <div className="ov-hero-kpi">
                <span className="ov-hero-kpi-value">
                  {appsPending || appsError ? '—' : standing.signed}
                </span>
                <span className="ov-hero-kpi-label">Signed</span>
              </div>
            </div>
          </motion.div>
        </header>

        {!minorGated && <StatsCurrencyPrompt profile={profile} />}

        <div className="ov-hairline" aria-hidden />

        <div className="ov-grid">
          <div className="ov-col-8">
            <div className="ov-book">
              <div className="ov-book-header">
                <div className="ov-book-title-group">
                  <div>
                    <span className="ov-book-title-text">
                      The <em>Book.</em>
                    </span>
                    <span className="ov-book-count">
                      {imageCount} {imageCount === 1 ? 'image' : 'images'}
                    </span>
                  </div>
                </div>
                <Link to="/dashboard/talent/media" className="ov-book-manage" aria-label="Manage portfolio images">
                  Manage images <ArrowUpRight size={12} aria-hidden />
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
                    <div className="ov-book-featured-overlay" aria-hidden></div>
                  </Link>
                ) : (
                  <Link
                    to="/dashboard/talent/media"
                    className="ov-book-featured ov-book-empty"
                    role="listitem"
                    aria-label="Add first portfolio image"
                  >
                    <span className="ov-book-empty-headline">Add an image</span>
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
                    <span className="ov-book-more-label">Images</span>
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
                  <h2 className="ov-readiness-title">
                    Submission <em>Readiness</em>
                  </h2>
                </div>
                <div className="ov-readiness-pct" aria-label={`${displayReadinessPct}% complete`}>
                  {displayReadinessPct}
                  <sup>%</sup>
                </div>
              </div>

              <div className="ov-checklist" role="list">
                {auditLoading ? (
                  [0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="ov-check-item" role="listitem" style={{ pointerEvents: 'none' }}>
                      <div className="ov-check-left">
                        <span
                          className="ov-skel"
                          style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }}
                          aria-hidden
                        />
                        <span className="ov-skel ov-skel--line" style={{ width: 120 }} aria-hidden />
                      </div>
                    </div>
                  ))
                ) : topGaps.map((item) => (
                  <Link
                    key={item.key}
                    to={READINESS_KEY_TO_PROFILE_URL[item.key] ?? '/dashboard/talent/profile'}
                    className="ov-check-item"
                    role="listitem"
                    aria-label={`${item.label}${item.tier === 'required' ? ': Required' : ''}`}
                  >
                    <div className="ov-check-left">
                      <span className="ov-check-label">{item.label}</span>
                    </div>
                    <div className="ov-check-right">
                      {item.tier === 'required' && (
                        <span className="ov-check-status">Required</span>
                      )}
                      <ChevronRight size={12} className="ov-check-arrow" aria-hidden />
                    </div>
                  </Link>
                ))}
              </div>

              {!auditLoading && totalGaps > 5 && (
                <p className="ov-audit-more">+{totalGaps - 5} more</p>
              )}

              {minorGated && (
                <p className="ov-minor-notice">
                  Guardian consent is required before measurements, full-length photos, or public sharing can be enabled.
                </p>
              )}

              <PholioButton to={auditCtaTo} variant="primary" tone="dark">
                {auditCtaLabel}
              </PholioButton>
            </div>
          </div>
        </div>

        <div className="ov-grid">
          <div className="ov-col-6">
            <div className="ov-exposure">
              <div className="ov-exposure-header">
                <div>
                  <h2 className="ov-exposure-title">
                    Your <em>Reach.</em>
                  </h2>
                </div>
                {!analyticsLoading && !summaryError && viewsDelta !== 0 && (
                  <p className={`ov-delta-note ${viewsDelta < 0 ? 'ov-delta-note--negative' : ''}`}>
                    <TrendingUp size={11} aria-hidden style={{ transform: viewsDelta < 0 ? 'scaleY(-1)' : 'none' }} />
                    <span>{viewsDelta > 0 ? '+' : ''}{viewsDelta}% views</span>
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
                  <PholioButton
                    variant="tertiary"
                    tone="dark"
                    onClick={() => refetchAnalytics()}
                    disabled={isAnalyticsRefetching}
                  >
                    {isAnalyticsRefetching ? '…' : 'Retry'}
                  </PholioButton>
                </div>
              ) : (
                <>
                  <div className="ov-market-metrics">
                    <div>
                      <div className="ov-stat-number">
                        <span className="ov-stat-value">{views.toLocaleString()}</span>
                      </div>
                      <p className="ov-stat-label">Profile views (30d)</p>
                    </div>
                  </div>

                  {interviewsNeedingResponse > 0 && (
                    <PholioButton
                      to="/dashboard/talent/applications"
                      variant="meta"
                      tone="dark"
                      className="ov-standing-action"
                    >
                      <span>
                        {interviewsNeedingResponse}{' '}
                        {interviewsNeedingResponse === 1 ? 'interview needs' : 'interviews need'} your response
                      </span>
                      <ArrowUpRight size={13} aria-hidden />
                    </PholioButton>
                  )}

                </>
              )}
            </div>
          </div>

          <div className="ov-col-6">
            <div className="ov-artifacts">
              <div className="ov-artifact-card ov-artifact-card--light ov-artifact-card--feature">
                {minorGated ? (
                  <div className="ov-artifact-main ov-artifact-main--gated">
                    <div className="ov-artifact-icon" aria-hidden>
                      <FileText size={20} />
                    </div>
                    <h3 className="ov-artifact-title">
                      Digital <em>Comp Card</em>
                    </h3>
                    <p className="ov-artifact-desc">
                      Comp-card export unlocks after guardian consent is recorded on your profile.
                    </p>
                    <PholioButton to="/dashboard/talent/profile?tab=identity" variant="secondary">
                      Record guardian consent
                    </PholioButton>
                  </div>
                ) : !isRequiredComplete ? (
                  <div className="ov-artifact-main ov-artifact-main--gated">
                    <div className="ov-artifact-icon" aria-hidden>
                      <FileText size={20} />
                    </div>
                    <h3 className="ov-artifact-title">
                      Digital <em>Comp Card</em>
                    </h3>
                    <p className="ov-artifact-desc">
                      Complete your required profile fields to unlock comp card export.
                    </p>
                    <PholioButton to="/dashboard/talent/profile" variant="secondary">
                      Complete your card
                    </PholioButton>
                  </div>
                ) : (
                  <>
                    <Link
                      to="/dashboard/talent/media"
                      className="ov-artifact-main"
                      aria-label="Build your comp card"
                    >
                      <div className="ov-artifact-icon" aria-hidden>
                        <FileText size={20} />
                      </div>
                      <h3 className="ov-artifact-title">
                        Digital <em>Comp Card</em>
                      </h3>
                      <p className="ov-artifact-desc">
                        Your defining identity artifact — professional specs composed from your book and current stats, export-ready for agency submission.
                      </p>
                    </Link>
                    <div className="ov-artifact-footer">
                      <PholioButton
                        to="/dashboard/talent/media"
                        variant="meta"
                        className="ov-artifact-action"
                      >
                        <span>Export</span>
                        <Download size={13} aria-hidden />
                      </PholioButton>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {showPublicWebsite && (
          <motion.section
            className="ov-website"
            aria-labelledby="ov-website-heading"
            initial={shouldReduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduce ? 0 : 0.65, delay: shouldReduce ? 0 : 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="ov-website-header">
              <div>
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
                  <span>{websiteDisplayUrl}</span>
                  <ExternalLink size={11} aria-hidden />
                </a>
              )}
            </div>

            <div className="ov-website-panel">
              {isAnalyticsLoading ? (
                <div className="ov-website-metrics ov-website-metrics--loading">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="ov-website-stat">
                      <div className="ov-skel" style={{ width: '64px', height: '2rem', marginBottom: 8 }} />
                      <div className="ov-skel ov-skel--line" style={{ width: '96px' }} />
                    </div>
                  ))}
                </div>
              ) : analyticsError ? (
                <div className="ov-error-inline ov-website-error" role="alert">
                  <AlertCircle size={14} aria-hidden />
                  <span>Website analytics unavailable.</span>
                  <PholioButton
                    variant="tertiary"
                    tone="dark"
                    onClick={() => refetchAnalytics()}
                    disabled={isAnalyticsRefetching}
                  >
                    {isAnalyticsRefetching ? '…' : 'Retry'}
                  </PholioButton>
                </div>
              ) : !websiteAnalyticsConnected ? (
                <div className="ov-website-unavailable">
                  Website analytics are not connected yet. No estimates are shown.
                </div>
              ) : (
                <div className="ov-website-analytics">
                  <div className="ov-website-metrics">
                    <div className="ov-website-stat">
                      <span className="ov-stat-value">{siteVisits.toLocaleString()}</span>
                      <p className="ov-stat-label">Visits</p>
                    </div>
                    <div className="ov-website-stat">
                      <span className="ov-stat-value">
                        {uniqueVisitorsComplete ? uniqueVisitors.toLocaleString() : '—'}
                      </span>
                      <p
                        className="ov-stat-label"
                        title={
                          uniqueVisitorsComplete
                            ? 'Distinct visitors'
                            : 'Some legacy visits did not include a visitor ID'
                        }
                      >
                        {uniqueVisitorsComplete ? 'Unique visitors' : 'Unique visitors unavailable'}
                      </p>
                    </div>
                    <div className="ov-website-stat">
                      <span className="ov-stat-value">{sitePageViews.toLocaleString()}</span>
                      <p className="ov-stat-label">Page views</p>
                    </div>
                    <div className="ov-website-stat">
                      <span className="ov-stat-value">{outboundClicks.toLocaleString()}</span>
                      <p className="ov-stat-label">Outbound clicks</p>
                    </div>
                  </div>

                  <div className="ov-website-chart-block">
                    <div className="ov-website-chart-header">
                      <div>
                        <h3 className="ov-website-chart-title">Visits over time</h3>
                      </div>
                      <p className="ov-website-period">
                        {websiteAnalytics?.period?.days || 30} days
                        {typeof websiteTrend === 'number'
                          ? ` · ${websiteTrend > 0 ? '+' : ''}${websiteTrend}% vs prior period`
                          : ' · No prior baseline'}
                      </p>
                    </div>

                    {websiteAnalytics.hasData && websiteSeries.some((point) => point.visits > 0) ? (
                      <div
                        className="ov-website-chart"
                        role="img"
                        aria-label={`Daily portfolio visits over the last ${websiteAnalytics?.period?.days || 30} days`}
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={websiteSeries}
                            margin={{ top: 12, right: 2, bottom: 0, left: 0 }}
                          >
                            <defs>
                              <linearGradient id={websiteGradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#C9A55A" stopOpacity={0.22} />
                                <stop offset="100%" stopColor="#C9A55A" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              vertical={false}
                              stroke="rgba(255,255,255,0.055)"
                              strokeDasharray="2 8"
                            />
                            <XAxis
                              dataKey="date"
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(value) => chartDateLabel(value)}
                              minTickGap={36}
                              tick={{ fill: 'rgba(245,240,232,0.38)', fontSize: 10 }}
                              dy={10}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              allowDecimals={false}
                              width={28}
                              tickCount={4}
                              tick={{ fill: 'rgba(245,240,232,0.3)', fontSize: 10 }}
                            />
                            <Tooltip
                              content={<WebsiteChartTooltip />}
                              cursor={{ stroke: 'rgba(201,165,90,0.28)', strokeWidth: 1 }}
                            />
                            <Area
                              type="monotone"
                              dataKey="visits"
                              stroke="#C9A55A"
                              strokeWidth={2}
                              fill={`url(#${websiteGradientId})`}
                              activeDot={{
                                r: 4,
                                fill: '#111111',
                                stroke: '#C9A55A',
                                strokeWidth: 2,
                              }}
                              dot={false}
                              isAnimationActive={!shouldReduce}
                              animationDuration={700}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="ov-website-chart-empty">
                        <span>No visits recorded in this period.</span>
                        <span>Tracking is connected and will populate after your portfolio is visited.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="ov-website-footer">
                <Link to="/dashboard/talent/analytics" className="ov-website-intel">
                  Full analytics <ArrowUpRight size={12} aria-hidden />
                </Link>
              </div>
            </div>
          </motion.section>
        )}

      </div>
    </div>
  );
}
