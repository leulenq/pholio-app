import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  Camera,
  ChevronRight,
  Download,
  FileText,
  Activity,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../auth/hooks/useAuth';
import { useProfileStrength } from '../hooks/useProfileStrength';
import { READINESS_KEY_TO_PROFILE_URL } from './profileReadinessItems';
import { useAnalytics } from '../hooks/useAnalytics';
import { talentApi } from '../api/talent';
import './OverviewView.css';

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────────────────

export default function OverviewView() {
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

  const firstName = profile?.first_name || '';
  const lastName  = profile?.last_name  || '';
  const isPro     = !!subscription?.isPro;

  const views      = asNum(summary?.views?.total);
  const downloads  = asNum(summary?.downloads?.total);
  const viewsDelta = asNum(summary?.views?.changePct);
  const readinessPct  = asNum(completeness?.percentage);
  const visibilityPct = Math.min(100, readinessPct);

  const appsParsed = applicationsCount(applicationsPayload);
  const appsCount  = appsParsed.ok ? appsParsed.count : 0;

  const { topGaps, totalGaps, isLoading: auditLoading } = useProfileStrength();

  const photoSlots = Array.isArray(images) ? images.slice(0, 5) : [];
  const extraCount = Math.max(0, (Array.isArray(images) ? images.length : 0) - 5);

  const handleCompCard = () => {
    toast.info('Comp card download is not available yet — coming in a future update.');
  };

  return (
    <div className="ov-container">
      <div className="ov-inner">

        {/* ════════════════════════════════
            HERO — Identity
        ════════════════════════════════ */}
        <header className="ov-hero">
          <motion.div
            className="ov-hero-left"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >

            {profileLoading ? (
              <span className="ov-skel ov-skel--name" aria-hidden />
            ) : (
              <h1 className="ov-hero-name">
                {firstName}
                {firstName && lastName ? ' ' : ''}
                {lastName && <em>{lastName}</em>}
                {!firstName && !lastName && 'Your Portfolio'}
              </h1>
            )}
          </motion.div>

          <div className="ov-hero-right">
            <div className="ov-status-pill">
              <span className="ov-status-dot" aria-hidden />
              Actively Seeking Work
            </div>
            <p className="ov-discovery-line">Global Discovery Primary</p>
          </div>
        </header>

        {/* Gold hairline */}
        <div className="ov-hairline" aria-hidden />

        {/* ════════════════════════════════
            ROW 1: Portfolio Book (8 cols) + Readiness Guide (4 cols)
        ════════════════════════════════ */}
        <div className="ov-grid">

          {/* ── Portfolio Book ── */}
          <div className="ov-col-8">
            <div className="ov-book">
              <div className="ov-book-header">
                <div className="ov-book-title-group">
                  <div className="ov-book-title">
                    <span className="ov-label" style={{ display: 'block', marginBottom: '6px' }}>
                      Portfolio
                    </span>
                    <span className="ov-book-title-text">The <em>Book.</em></span>
                  </div>
                  <div className="ov-book-sep" aria-hidden />
                  <div className="ov-book-tags">
                    <span className="ov-tag">Editorial</span>
                    <span className="ov-tag ov-tag--faded">Casting</span>
                  </div>
                </div>

                <Link
                  to="/dashboard/talent/media"
                  className="ov-book-manage"
                  aria-label="Manage portfolio frames"
                >
                  Manage Frames <ArrowUpRight size={12} aria-hidden />
                </Link>
              </div>

              <div className="ov-book-grid" role="list" aria-label="Portfolio images">

                {/* Featured — col-span-2, row-span-2 */}
                {photoSlots[0] ? (
                  <Link
                    to="/dashboard/talent/media"
                    className="ov-book-featured"
                    role="listitem"
                    aria-label="Featured portfolio image"
                  >
                    <img
                      src={imageUrl(photoSlots[0])}
                      alt="Featured portfolio"
                      className="ov-book-photo"
                    />
                    <div className="ov-book-featured-overlay" aria-hidden>
                      <p className="ov-book-featured-caption">Your best work</p>
                    </div>
                  </Link>
                ) : (
                  <Link
                    to="/dashboard/talent/media"
                    className="ov-book-featured ov-book-empty"
                    role="listitem"
                    aria-label="Add featured photo"
                  >
                    <Camera size={24} color="rgba(245,240,230,0.12)" aria-hidden />
                    <span className="ov-book-more-label">Add Photo</span>
                  </Link>
                )}

                {/* Small slots 1–3 */}
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
                    >
                      <Camera size={16} color="rgba(245,240,230,0.1)" aria-hidden />
                    </Link>
                  );
                })}

                {/* 5th slot: overflow count or image */}
                {photoSlots[4] && extraCount > 0 ? (
                  <Link
                    to="/dashboard/talent/media"
                    className="ov-book-more"
                    role="listitem"
                    aria-label={`View ${extraCount} more images`}
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
                  <Link
                    to="/dashboard/talent/media"
                    className="ov-book-more"
                    role="listitem"
                    aria-label="Add more images"
                  >
                    <Camera size={16} color="rgba(245,240,230,0.08)" aria-hidden />
                    <span className="ov-book-more-label">Add</span>
                  </Link>
                )}

              </div>
            </div>
          </div>

          {/* ── Readiness Guide ── */}
          <div className="ov-col-4">
            <div className="ov-readiness">
              <div className="ov-readiness-header">
                <div>
                  <span className="ov-label" style={{ display: 'block', marginBottom: '6px' }}>
                    Readiness Guide
                  </span>
                  <h2 className="ov-readiness-title">The <em>Audit.</em></h2>
                </div>
                <div
                  className="ov-readiness-pct"
                  aria-label={`${readinessPct}% profile complete`}
                >
                  {readinessPct}<sup>%</sup>
                </div>
              </div>

              <div className="ov-checklist" role="list">
                {auditLoading ? (
                  [0, 1, 2].map((i) => (
                    <div key={i} className="ov-check-item" role="listitem" style={{ pointerEvents: 'none' }}>
                      <div className="ov-check-left">
                        <div
                          className="ov-skel"
                          style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }}
                          aria-hidden
                        />
                        <div className="ov-skel ov-skel--line" style={{ width: 120 }} aria-hidden />
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
                      <div
                        className={`ov-check-dot ${item.tier === 'required' ? 'ov-check-dot--critical' : 'ov-check-dot--improve'}`}
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

              <Link to="/dashboard/talent/profile" className="ov-audit-cta">
                Continue Audit
              </Link>
            </div>
          </div>

        </div>

        {/* ════════════════════════════════
            ROW 2: Exposure Intelligence (6) + Identity Artifacts (6)
        ════════════════════════════════ */}
        <div className="ov-grid">

          {/* ── Exposure Intelligence ── */}
          <div className="ov-col-6">
            <div className="ov-exposure">
              <div className="ov-exposure-header">
                <div>
                  <span className="ov-label" style={{ display: 'block', marginBottom: '6px' }}>
                    Exposure Intelligence
                  </span>
                  <h2 className="ov-exposure-title">The <em>Market.</em></h2>
                </div>
                <div className="ov-ranking-chip">
                  <TrendingUp size={12} aria-hidden />
                  <span>Top 12% in Editorial</span>
                </div>
              </div>

              {analyticsLoading ? (
                <div className="ov-stats-grid">
                  {[0, 1, 2].map((i) => (
                    <div key={i}>
                      <div
                        className="ov-skel"
                        style={{ width: '80px', height: '2.5rem', marginBottom: '8px' }}
                      />
                      <div className="ov-skel ov-skel--line" style={{ width: '120px' }} />
                    </div>
                  ))}
                </div>
              ) : summaryError ? (
                <div className="ov-error-inline" role="alert">
                  <AlertCircle size={14} aria-hidden />
                  <span>Couldn't load analytics.</span>
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
                <div className="ov-stats-grid">
                  <div>
                    <div className="ov-stat-number">
                      <span className="ov-stat-value">{views.toLocaleString()}</span>
                      {viewsDelta > 0 && (
                        <span className="ov-stat-delta-positive">+{viewsDelta}%</span>
                      )}
                    </div>
                    <p className="ov-stat-label">Global Views (30d)</p>
                  </div>

                  <div>
                    <div className="ov-stat-number">
                      <span className="ov-stat-value ov-stat-value--gold">
                        {appsPending ? '—' : appsError ? '—' : appsCount}
                      </span>
                      <span className="ov-stat-delta-neutral">Active</span>
                    </div>
                    <p className="ov-stat-label">Agency Submissions</p>
                  </div>

                  <div>
                    <div className="ov-stat-number">
                      <span className="ov-stat-value">{downloads.toLocaleString()}</span>
                    </div>
                    <p className="ov-stat-label">Comp Card Downloads</p>
                  </div>

                  <div className="ov-visibility">
                    <div className="ov-visibility-head">
                      <span className="ov-visibility-label">Visibility Index</span>
                      {visibilityPct >= 60 && (
                        <span className="ov-visibility-note">Above Category Avg</span>
                      )}
                    </div>
                    <div
                      className="ov-vis-track"
                      role="progressbar"
                      aria-valuenow={visibilityPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Profile visibility index"
                    >
                      <motion.div
                        className="ov-vis-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${visibilityPct}%` }}
                        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Identity Artifacts ── */}
          <div className="ov-col-6">
            <div className="ov-artifacts">

              {/* Comp Card — light card */}
              <button
                type="button"
                className="ov-artifact-card ov-artifact-card--light"
                onClick={handleCompCard}
                aria-label="Download comp card"
              >
                <div>
                  <div className="ov-artifact-icon" aria-hidden>
                    <FileText size={20} />
                  </div>
                  <h3 className="ov-artifact-title">Digital <em>Comp Card</em></h3>
                  <p className="ov-artifact-desc">
                    Generate professional specs with latest polaroids for agency submission.
                  </p>
                </div>
                <div className="ov-artifact-footer">
                  <span className="ov-artifact-badge">Ready</span>
                  <div className="ov-artifact-action">
                    <span>Export</span>
                    <Download size={13} aria-hidden />
                  </div>
                </div>
              </button>

              {/* Intro Reel — dark card */}
              <Link
                to="/dashboard/talent/media"
                className="ov-artifact-card ov-artifact-card--dark"
                aria-label="Add intro reel"
              >
                <div>
                  <div className="ov-artifact-icon" aria-hidden>
                    <Activity size={20} />
                  </div>
                  <h3 className="ov-artifact-title">Intro <em>Reel</em></h3>
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

        {/* ════════════════════════════════
            FOOTER
        ════════════════════════════════ */}
        <footer className="ov-footer">
          <nav className="ov-footer-nav" aria-label="Dashboard sections">
            <Link to="/dashboard/talent"              className="ov-footer-link ov-footer-link--active">Overview</Link>
            <Link to="/dashboard/talent/media"        className="ov-footer-link">The Book</Link>
            <Link to="/dashboard/talent/applications" className="ov-footer-link">Market</Link>
            <Link to="/dashboard/talent/analytics"    className="ov-footer-link">Intel</Link>
          </nav>

          <div className="ov-footer-meta">
            <div className="ov-footer-node">
              <span className="ov-footer-dot" aria-hidden />
              <span>Identity Node · PH-{profile?.id?.slice(0, 3)?.toUpperCase() || '···'}</span>
            </div>
            <div className="ov-footer-sep" aria-hidden />
            <span>© 2026</span>
          </div>
        </footer>

      </div>
    </div>
  );
}
