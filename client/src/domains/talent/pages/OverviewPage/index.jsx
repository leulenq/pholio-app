import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '../../../auth/hooks/useAuth';
import { useProfileReadiness } from '../../hooks/useProfileReadiness';
import { READINESS_KEY_TO_PROFILE_URL } from '../../components/profileReadinessItems';
import { useAnalytics } from '../../hooks/useAnalytics';
import { talentApi } from '../../api/talent';
import { bucketCounts } from '../../utils/applicationStatus';
import {
  isMinorProfile,
  minorSensitiveFieldsUnlocked,
} from '../../../../shared/utils/talentAge';
import {
  asList,
  buildCirculation,
  buildMoves,
  buildNextAgencies,
  buildPackage,
  buildWeek,
} from './overviewModel';
import YourMove from './sections/YourMove';
import ThePackage from './sections/ThePackage';
import InCirculation from './sections/InCirculation';
import ThisWeek from './sections/ThisWeek';
import WhereNext from './sections/WhereNext';
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

const QUIET = { staleTime: 60 * 1000, retry: 1 };

/**
 * The talent Overview.
 *
 * The hero and The Book are the owner's; everything around them answers, in
 * order, what is waiting on you, what an agency receives, where your book is
 * and how long each silence lasts, what is on this week, and where it can go
 * next. Every reading comes from overviewModel.js.
 */
export default function OverviewPage() {
  const {
    profile,
    subscription,
    images,
    isLoading: profileLoading,
  } = useAuth();
  const isPro = !!subscription?.isPro;
  const { summary } = useAnalytics(30);

  const {
    data: applicationsPayload,
    isPending: appsPending,
    isError: appsError,
  } = useQuery({
    queryKey: ['applications'],
    queryFn: () => talentApi.getApplications(),
    ...QUIET,
  });
  const threadsQuery = useQuery({
    queryKey: ['talent', 'message-threads'],
    queryFn: () => talentApi.getMessageThreads(),
    ...QUIET,
  });
  const freshnessQuery = useQuery({
    queryKey: ['digitals-freshness'],
    queryFn: () => talentApi.getDigitalsFreshness(),
    ...QUIET,
  });
  const draftQuery = useQuery({
    queryKey: ['application-drafts', 'latest'],
    queryFn: () => talentApi.getLatestDraft(),
    ...QUIET,
  });
  const callWindowsQuery = useQuery({
    queryKey: ['call-windows'],
    queryFn: talentApi.listCallWindows,
    staleTime: 1000 * 60 * 30,
    retry: 1,
  });
  const agenciesQuery = useQuery({
    queryKey: ['talent-agencies', 'apply-content-v2'],
    queryFn: talentApi.getAgencies,
    staleTime: 1000 * 60 * 3,
    retry: 1,
  });
  const quotaQuery = useQuery({
    queryKey: ['application-quota'],
    queryFn: () => talentApi.getApplicationQuota(),
    ...QUIET,
  });

  const applicationsList = React.useMemo(() => asList(applicationsPayload), [applicationsPayload]);
  const appsCount = applicationsList.length;
  const standing = bucketCounts(applicationsList);

  const firstName = profile?.first_name || '';
  const imageCount = Array.isArray(images) ? images.length : 0;
  const greeting = getGreetingByTime();
  const shouldReduce = useReducedMotion();

  const { topGaps, isRequiredComplete, isLoading: auditLoading } = useProfileReadiness();
  const minor = isMinorProfile(profile);
  const minorGated = minor && !minorSensitiveFieldsUnlocked(profile);

  const requiredGaps = React.useMemo(
    () =>
      (topGaps || [])
        .filter((gap) => gap.tier === 'required')
        .map((gap) => ({
          key: gap.key,
          label: gap.label,
          to: READINESS_KEY_TO_PROFILE_URL[gap.key] ?? '/dashboard/talent/profile',
        })),
    [topGaps],
  );

  const threads = React.useMemo(() => threadsQuery.data?.threads || [], [threadsQuery.data]);
  const freshness = freshnessQuery.data || null;
  const draft = draftQuery.data || null;
  const websiteUrl = portfolioShareUrl(profile?.slug);
  const views = summary?.views?.total != null ? asNum(summary.views.total) : null;

  const now = React.useMemo(() => new Date(), []);
  const moves = React.useMemo(
    () =>
      buildMoves({
        applications: applicationsList,
        threads,
        freshness,
        profile,
        draft,
        requiredGaps,
        minorGated,
        now,
      }),
    [applicationsList, threads, freshness, profile, draft, requiredGaps, minorGated, now],
  );
  const circulation = React.useMemo(
    () => buildCirculation(applicationsList, now),
    [applicationsList, now],
  );
  const week = React.useMemo(
    () =>
      buildWeek({
        callWindows: Array.isArray(callWindowsQuery.data) ? callWindowsQuery.data : [],
        applications: applicationsList,
        freshness,
        now,
      }),
    [callWindowsQuery.data, applicationsList, freshness, now],
  );
  const pkg = React.useMemo(
    () =>
      buildPackage({
        profile,
        freshness,
        isRequiredComplete,
        requiredGaps,
        minorGated,
        websiteUrl,
        websiteLabel: displayPublicUrl(websiteUrl),
        views,
        now,
      }),
    [profile, freshness, isRequiredComplete, requiredGaps, minorGated, websiteUrl, views, now],
  );
  const next = React.useMemo(
    () =>
      buildNextAgencies({
        agencies: asList(agenciesQuery.data),
        applications: applicationsList,
        profile,
        now,
      }),
    [agenciesQuery.data, applicationsList, profile, now],
  );

  const movesLoading = profileLoading || appsPending || auditLoading;
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
                  {appsPending || appsError ? '—' : standing.represented}
                </span>
                <span className="ov-hero-kpi-label">Represented</span>
              </div>
            </div>
          </motion.div>
        </header>

        <YourMove moves={moves} liveCount={circulation.liveCount} loading={movesLoading} />

        <div className="ov-grid ov-grid--book">
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
            <ThePackage pkg={pkg} loading={profileLoading} />
          </div>
        </div>

        <InCirculation circulation={circulation} loading={appsPending} error={appsError} />

        {week.total > 0 && <ThisWeek week={week} />}

        {!minorGated && next.agencies.length > 0 && (
          <WhereNext next={next} quota={quotaQuery.data} />
        )}
      </div>
    </div>
  );
}
