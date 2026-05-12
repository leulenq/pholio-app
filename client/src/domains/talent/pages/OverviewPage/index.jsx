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
} from 'lucide-react';
import { useAuth } from '../../../auth/hooks/useAuth';
import { useAnalytics } from '../../hooks/useAnalytics';
import { talentApi } from '../../api/talent';
import './OverviewPage.css';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { profile, subscription, completeness, images, isLoading: profileLoading } = useAuth();
  const {
    summary,
    summaryError,
    isLoading: analyticsLoading,
    refetch: refetchAnalytics,
    isAnalyticsRefetching,
  } = useAnalytics();

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

  const firstName   = profile?.first_name || '';
  const lastName    = profile?.last_name  || '';
  const isPro       = !!subscription?.isPro;
  const location    = profile?.city || profile?.location || '';
  const imageCount  = Array.isArray(images) ? images.length : 0;

  const views      = asNum(summary?.views?.total);
  const downloads  = asNum(summary?.downloads?.total);
  const viewsDelta = asNum(summary?.views?.changePct);
  const readinessPct = asNum(completeness?.percentage);

  const appsParsed = applicationsCount(applicationsPayload);
  const appsCount  = appsParsed.ok ? appsParsed.count : 0;

  const checklist = buildChecklist(images, completeness, profile);
  const allClear  = checklist
    .filter(c => c.urgency !== 'none')
    .every(c => c.urgency === 'success');

  const photoSlots = Array.isArray(images) ? images.slice(0, 5) : [];
  const extraCount = Math.max(0, imageCount - 5);

  return (
    <div className="ov-container">
      <div className="ov-inner">

        {/* ═══════════════════════════════════════
            HERO — identity anchor
        ═══════════════════════════════════════ */}
        <header className="ov-hero">
          <motion.div
            className="ov-hero-identity"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="ov-hero-eyebrow">
              <span className="ov-mono">Dashboard</span>
              <span className={`ov-tier-pill ${isPro ? 'ov-tier-pill--studio' : 'ov-tier-pill--free'}`}>
                {isPro ? 'Studio+' : 'Free'}
              </span>
            </div>

            {profileLoading ? (
              <span className="ov-skel ov-skel--name" aria-hidden />
            ) : (
              <h1 className="ov-hero-name">
                {firstName ? <span>{firstName}</span> : null}
                {lastName  ? <><br /><em>{lastName}.</em></> : null}
                {!firstName && !lastName && <span>Your Portfolio</span>}
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

            {location && (
              <p className="ov-hero-location">{location}</p>
            )}
          </motion.div>

          {imageCount > 0 && (
            <div className="ov-hero-signal" aria-label={`${imageCount} portfolio frames`}>
              <div className="ov-hero-signal-num">{imageCount}</div>
              <div className="ov-hero-signal-lbl">Frames</div>
            </div>
          )}
        </header>

        <div className="ov-hairline" aria-hidden />

        {/* ═══════════════════════════════════════
            ROW 1: Book (8) + Audit (4)
        ═══════════════════════════════════════ */}
        <div className="ov-grid">

          {/* ── Portfolio Book ── */}
          <div className="ov-col-8">
            <div className="ov-book">
              <div className="ov-book-header">
                <div className="ov-book-title-group">
                  <div>
                    <span className="ov-label" style={{ display: 'block', marginBottom: '4px' }}>Portfolio</span>
                    <span className="ov-book-title-text">The <em>Book.</em></span>
                  </div>
                  <div className="ov-book-sep" aria-hidden />
                  <span className="ov-book-count">{imageCount} {imageCount === 1 ? 'frame' : 'frames'}</span>
                </div>
                <Link to="/dashboard/talent/media" className="ov-book-manage" aria-label="Manage portfolio">
                  Manage <ArrowUpRight size={12} aria-hidden />
                </Link>
              </div>

              <div className="ov-book-grid" role="list" aria-label="Portfolio images">

                {photoSlots[0] ? (
                  <Link to="/dashboard/talent/media" className="ov-book-featured" role="listitem" aria-label="Featured portfolio image">
                    <img src={imageUrl(photoSlots[0])} alt="Featured portfolio" className="ov-book-photo" />
                    <div className="ov-book-featured-overlay" aria-hidden>
                      <span className="ov-book-featured-eyebrow">Cover</span>
                      <p className="ov-book-featured-caption">
                        {firstName
                          ? `${firstName}${lastName ? ` ${lastName}` : ''}`
                          : 'Featured Frame'}
                      </p>
                    </div>
                  </Link>
                ) : (
                  <Link to="/dashboard/talent/media" className="ov-book-featured ov-book-empty" role="listitem" aria-label="Add first portfolio image">
                    <span className="ov-book-empty-headline">First Frame</span>
                    <span className="ov-book-empty-sub">Define how agencies see you</span>
                  </Link>
                )}

                {[1, 2, 3].map((idx) => {
                  const img = photoSlots[idx];
                  return img ? (
                    <Link key={idx} to="/dashboard/talent/media" className="ov-book-img-small" role="listitem" aria-label={`Portfolio image ${idx + 1}`}>
                      <img src={imageUrl(img)} alt="" className="ov-book-photo" />
                    </Link>
                  ) : (
                    <Link key={idx} to="/dashboard/talent/media" className="ov-book-img-small ov-book-empty" role="listitem" aria-label="Add portfolio image" />
                  );
                })}

                {photoSlots[4] && extraCount > 0 ? (
                  <Link to="/dashboard/talent/media" className="ov-book-more" role="listitem" aria-label={`${extraCount} more images`}>
                    <span className="ov-book-more-count">+{extraCount}</span>
                    <span className="ov-book-more-label">More</span>
                  </Link>
                ) : photoSlots[4] ? (
                  <Link to="/dashboard/talent/media" className="ov-book-img-small" role="listitem" aria-label="Portfolio image 5">
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

          {/* ── Readiness Audit ── */}
          <div className="ov-col-4">
            <div className="ov-readiness">
              <div className="ov-readiness-header">
                <div>
                  <span className="ov-label" style={{ display: 'block', marginBottom: '4px' }}>Readiness</span>
                  <h2 className="ov-readiness-title">The <em>Audit.</em></h2>
                </div>
                <div className="ov-readiness-pct" aria-label={`${readinessPct}% complete`}>
                  {readinessPct}<sup>%</sup>
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
                      <div className={`ov-check-dot ov-check-dot--${item.urgency}`} aria-hidden />
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

        {/* ═══════════════════════════════════════
            ROW 2: Signal (6) + Artifacts (6)
        ═══════════════════════════════════════ */}
        <div className="ov-grid">

          {/* ── Intelligence / Signal ── */}
          <div className="ov-col-6">
            <div className="ov-exposure">
              <div className="ov-exposure-header">
                <div>
                  <span className="ov-label" style={{ display: 'block', marginBottom: '4px' }}>Intelligence</span>
                  <h2 className="ov-exposure-title">The <em>Signal.</em></h2>
                </div>
                {!analyticsLoading && !summaryError && viewsDelta > 0 && (
                  <div className="ov-delta-chip">
                    <TrendingUp size={11} aria-hidden />
                    <span>+{viewsDelta}%</span>
                  </div>
                )}
              </div>

              {analyticsLoading ? (
                <div className="ov-stats-row">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="ov-stat-cell">
                      <div className="ov-skel" style={{ width: '56px', height: '2.25rem', marginBottom: '8px' }} />
                      <div className="ov-skel ov-skel--line" style={{ width: '88px' }} />
                    </div>
                  ))}
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
                <div className="ov-stats-row">
                  <div className="ov-stat-cell">
                    <div className="ov-stat-number">
                      <span className="ov-stat-value">{views.toLocaleString()}</span>
                    </div>
                    <p className="ov-stat-label">Profile Views</p>
                  </div>
                  <div className="ov-stat-cell">
                    <div className="ov-stat-number">
                      <span className="ov-stat-value ov-stat-value--gold">
                        {appsPending || appsError ? '—' : appsCount}
                      </span>
                    </div>
                    <p className="ov-stat-label">Submissions</p>
                  </div>
                  <div className="ov-stat-cell">
                    <div className="ov-stat-number">
                      <span className="ov-stat-value">{downloads.toLocaleString()}</span>
                    </div>
                    <p className="ov-stat-label">Card Downloads</p>
                  </div>
                </div>
              )}

              <div className="ov-readiness-track-wrap">
                <div className="ov-readiness-track-head">
                  <span className="ov-visibility-label">Readiness</span>
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
            </div>
          </div>

          {/* ── Identity Artifacts ── */}
          <div className="ov-col-6">
            <div className="ov-artifacts">

              <Link
                to="/dashboard/talent/pdf-customizer"
                className="ov-artifact-card ov-artifact-card--light"
                aria-label="Build your comp card"
              >
                <div>
                  <div className="ov-artifact-icon" aria-hidden>
                    <FileText size={20} />
                  </div>
                  <h3 className="ov-artifact-title">Digital <em>Comp Card</em></h3>
                  <p className="ov-artifact-desc">
                    Professional specs, agency-ready. Your latest polaroids, composed.
                  </p>
                </div>
                <div className="ov-artifact-footer">
                  <span className="ov-artifact-badge">
                    {imageCount > 0 ? 'Ready to build' : 'Add photos first'}
                  </span>
                  <div className="ov-artifact-action">
                    <span>Build</span>
                    <ArrowUpRight size={13} aria-hidden />
                  </div>
                </div>
              </Link>

              <Link
                to="/dashboard/talent/media"
                className="ov-artifact-card ov-artifact-card--dark"
                aria-label="Record intro reel"
              >
                <div>
                  <div className="ov-artifact-icon" aria-hidden>
                    <Activity size={20} />
                  </div>
                  <h3 className="ov-artifact-title">Intro <em>Reel</em></h3>
                  <p className="ov-artifact-desc">
                    Thirty seconds that show what a photo can't. Your presence, unedited.
                  </p>
                </div>
                <div className="ov-artifact-footer">
                  <span className="ov-artifact-badge ov-artifact-badge--missing">Not recorded</span>
                  <div className="ov-artifact-action">
                    <ArrowUpRight size={14} aria-hidden />
                  </div>
                </div>
              </Link>

            </div>
          </div>

        </div>

        {/* ═══════════════════════════════════════
            Page signoff
        ═══════════════════════════════════════ */}
        <footer className="ov-footer">
          <div className="ov-footer-node">
            <span className="ov-footer-dot" aria-hidden />
            <span>PH-{profile?.id?.slice(0, 6)?.toUpperCase() || '······'}</span>
          </div>
          <div className="ov-footer-sep" aria-hidden />
          <span>© 2026 Pholio Studio</span>
        </footer>

      </div>
    </div>
  );
}
