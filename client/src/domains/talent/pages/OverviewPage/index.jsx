import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight,
  ChevronRight,
  FileText,
  TrendingUp,
  AlertCircle,
  Download,
  Globe,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../../auth/hooks/useAuth';
import { useProfileStrength } from '../../hooks/useProfileStrength';
import { READINESS_KEY_TO_PROFILE_URL } from '../../components/profileReadinessItems';
import { useAnalytics } from '../../hooks/useAnalytics';
import { talentApi } from '../../api/talent';
import { bucketCounts } from '../../utils/applicationStatus';
import { deriveRepresentationStatus } from '../../utils/representationStatus';
import { analyzePackageIntelligence } from '../../../../shared/utils/packageIntelligence';
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

  // Submission-package read for the talent's digitals: surfaced as a plain-text
  // KPI so the hero reflects how send-ready the package is, not just frame count.
  const pkg = analyzePackageIntelligence({ images: Array.isArray(images) ? images : [] });
  const missingCoreSlots = ['headshot', 'fullBody'].filter((slot) => !pkg.slots[slot]).length;
  const packageLabel =
    missingCoreSlots > 0
      ? `${missingCoreSlots} to add`
      : pkg.recency.isStale
        ? 'Update digitals'
        : 'Ready';

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

  const { topGaps, totalGaps, isRequiredComplete, fieldCompletion, isLoading: auditLoading } = useProfileStrength();
  const shouldReduce = useReducedMotion();

  // Representation status — derived from existing application data; no new fetch.
  // v1: a talent signed offline (no accepted application) reads as unrepresented
  // until the structured talent_representation table (v2, deferred) is built.
  const repStatus = deriveRepresentationStatus(applicationsList);
  // Compact hero label: fits the KPI column width.
  const repHeroLabel = {
    signed: 'Represented',
    in_conversation: 'Advancing',
    submitted: 'Submitted',
    unrepresented: 'None yet',
  }[repStatus.state] ?? '—';

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

            <div className="ov-hero-kpis" aria-label="Performance summary">
              <div className="ov-hero-kpi">
                <span className="ov-hero-kpi-label">Representation</span>
                <span className="ov-hero-kpi-value">
                  {appsPending || appsError ? '—' : repHeroLabel}
                </span>
              </div>
              <div className="ov-hero-kpi">
                <span className="ov-hero-kpi-label">Readiness</span>
                <span className="ov-hero-kpi-value">{displayReadinessPct}%</span>
              </div>
              <div className="ov-hero-kpi">
                <span className="ov-hero-kpi-label">Submissions</span>
                <span className="ov-hero-kpi-value">{appsPending || appsError ? '—' : appsCount}</span>
              </div>
              <div className="ov-hero-kpi">
                <span className="ov-hero-kpi-label">Package</span>
                <span className="ov-hero-kpi-value">{packageLabel}</span>
              </div>
            </div>
          </motion.div>
        </header>

        <div className="ov-hairline" aria-hidden />

        {/* ── Representation — Section 1: the single most important standing fact ── */}
        <motion.section
          className="ov-representation"
          aria-label="Representation status"
          initial={shouldReduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: shouldReduce ? 0 : 0.6,
            delay: shouldReduce ? 0 : 0.1,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div className="ov-representation-body">
            {appsPending || appsError ? (
              <span className="ov-skel" style={{ width: 180, height: '1.4rem', borderRadius: 4 }} aria-hidden />
            ) : (
              <p className="ov-representation-status">
                {repStatus.label}
                {repStatus.agency ? (
                  <span className="ov-representation-agency"> · {repStatus.agency}</span>
                ) : null}
              </p>
            )}
            {!appsPending && !appsError && repStatus.state === 'unrepresented' && (
              <p className="ov-representation-note">
                Signed offline? Your agency can link this account to update your standing.
              </p>
            )}
          </div>
          {!appsPending && !appsError && (
            <Link to={repStatus.action.to} className="ov-representation-action">
              {repStatus.action.label}
              <ArrowUpRight size={13} aria-hidden />
            </Link>
          )}
        </motion.section>

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
                    <div className="ov-book-featured-overlay" aria-hidden>
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
                  [0, 1, 2].map((i) => (
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
                      <span
                        className={`ov-check-mark ${item.tier === 'required' ? 'ov-check-mark--critical' : 'ov-check-mark--improve'}`}
                        aria-hidden
                      />
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

              {!auditLoading && totalGaps > 3 && (
                <p className="ov-audit-more">+{totalGaps - 3} more</p>
              )}

              {minorGated && (
                <p className="ov-minor-notice">
                  Guardian consent is required before measurements, full-length photos, or public sharing can be enabled.
                </p>
              )}

              <PholioButton to={auditCtaTo} variant="primary">
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
                  <PholioButton
                    variant="ghost"
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
                    <div>
                      <div className="ov-stat-number">
                        <span className="ov-stat-value ov-stat-value--gold">
                          {appsPending || appsError ? '—' : appsCount}
                        </span>
                      </div>
                      <p className="ov-stat-label">Submissions</p>
                    </div>
                  </div>

                  {!appsPending && !appsError && appsCount > 0 && (
                    <div className="ov-standing" aria-label="Application standing">
                      <span className="ov-standing-item">
                        <strong>{standing.inReview}</strong> in review
                      </span>
                      <span className="ov-standing-item">
                        <strong>{standing.advancing}</strong> advancing
                      </span>
                      <span className="ov-standing-item">
                        <strong>{standing.signed}</strong> signed
                      </span>
                      <span className="ov-standing-item">
                        <strong>{standing.closed}</strong> closed
                      </span>
                    </div>
                  )}

                  {interviewsNeedingResponse > 0 && (
                    <Link to="/dashboard/talent/applications" className="ov-standing-action">
                      <span>
                        {interviewsNeedingResponse}{' '}
                        {interviewsNeedingResponse === 1 ? 'interview needs' : 'interviews need'} your response
                      </span>
                      <ArrowUpRight size={13} aria-hidden />
                    </Link>
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
                        Your defining identity artifact — professional specs composed with your
                        latest polaroids, export-ready for agency submission.
                      </p>
                    </Link>
                    <div className="ov-artifact-footer">
                      <Link to="/dashboard/talent/media" className="ov-artifact-action">
                        <span>Export</span>
                        <Download size={13} aria-hidden />
                      </Link>
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
                  <PholioButton
                    variant="ghost"
                    onClick={() => refetchAnalytics()}
                    disabled={isAnalyticsRefetching}
                  >
                    {isAnalyticsRefetching ? '…' : 'Retry'}
                  </PholioButton>
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
