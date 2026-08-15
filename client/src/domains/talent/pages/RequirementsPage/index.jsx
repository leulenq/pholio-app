import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../../../auth/hooks/useAuth';
import { talentApi } from '../../api/talent';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import {
  CHANNEL_TYPE,
  buildAgencyView,
  buildMarketView,
  formatRegistryDate,
  joinPhrases,
  partitionRoutes,
  readCallWindows,
  readEvaluationFor,
  readLabels,
  readRoutes,
} from '../../lib/specRegistry';
import { formatWindowCompact, sortByNextOccurrence } from '../../utils/callWindows';
import MarketRail from './MarketRail';
import AgencyDetail from './AgencyDetail';
import ShotCoverage from './ShotCoverage';
import styles from './RequirementsPage.module.css';

/**
 * Agency requirements.
 *
 * The page answers three questions, in this order: what does my set already
 * cover across the market, what one more shot would change that, and — for the
 * agency I am looking at — exactly what is missing and how to submit.
 *
 * It used to open on a twenty-five-column matrix that scrolled sideways, keyed
 * its rows on a field that is null for every compound slot (so Elite's six
 * published shots drew as two), and sorted its findings into four buckets named
 * for Pholio's confidence rather than for anything a talent can act on. None of
 * that survives: shots are rows, agencies are a number, and the detail is
 * organised by what the agency asked for.
 */

const PANEL_ID = 'agency-detail';
const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

/**
 * Which images the check should evaluate: the talent's current,
 * agency-visible digitals. Anything retired, hidden from agencies, or not a
 * still image would make the coverage figures describe a set they cannot
 * actually send.
 */
function activeImages(images, profile) {
  const candidates = Array.isArray(images)
    ? images
    : Array.isArray(profile?.images)
      ? profile.images
      : [];

  return candidates.filter((image) => {
    if (!image?.id || image.deleted_at || image.is_deleted === true || image.retired_at) return false;
    if (String(image.status || 'active').toLowerCase() !== 'active') return false;
    if (image.exclude_from_agency === true) return false;
    if (String(image.asset_kind || image.assetType || 'image').toLowerCase() !== 'image') return false;
    const imageType = String(image.image_type || image.imageType || '').toLowerCase();
    if (imageType && imageType !== 'digital') return false;
    const mimeType = image.delivery_mime_type || image.mime_type || image.mimeType || '';
    return !String(mimeType).toLowerCase().startsWith('video/');
  });
}

/**
 * The same resolution the digitals contact sheet uses, so a frame that shows up
 * there shows up here — one stored path, one URL, no second convention.
 */
function frameSrc(image) {
  const value = image?.public_url || image?.path || '';
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  return `/uploads/${trimmed.replace(/^\/+/, '')}`;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** The two-pane layout collapses to an accordion where it no longer fits. */
function useStackedLayout() {
  const [stacked, setStacked] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(max-width: 880px)');
    const sync = () => setStacked(query.matches === true);
    sync();
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);
  return stacked;
}

/**
 * The week's open calls, above the market.
 *
 * Everything else on this page is asynchronous — a set is built, exported, sent
 * whenever. A walk-in open call is the one thing here that expires: Thursday
 * 3pm is Thursday 3pm, and a talent who reads it on Friday has missed it. So it
 * sits at the top, ordered by what happens next, and it is deliberately not a
 * card grid — four plain columns per row, the way a call sheet reads.
 *
 * Curated windows carry no organisation of their own when the agency is not in
 * the spec pack (Que, MSA); they are listed all the same, because the talent's
 * week does not care which dataset a house belongs to.
 */
function CallWindowStrip({ windows }) {
  const reduceMotion = useReducedMotion();
  const ordered = useMemo(() => sortByNextOccurrence(windows), [windows]);
  if (!ordered.length) return null;

  return (
    <motion.section
      className={styles.week}
      aria-labelledby="call-windows-title"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : SPRING}
    >
      <h2 id="call-windows-title" className={styles.weekTitle}>
        Open calls <em>this week</em>
      </h2>
      <ul className={styles.weekList}>
        {ordered.map((window) => (
          <li key={window.id} className={styles.weekRow}>
            <span className={styles.weekName}>{window.displayName}</span>
            {window.label ? <span className={styles.weekLabel}>{window.label}</span> : null}
            <span className={styles.weekWhen}>{formatWindowCompact(window)}</span>
            {window.verifiedOn ? (
              <span className={styles.weekVerified}>
                Verified on {formatRegistryDate(window.verifiedOn)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className={styles.weekNote}>
        Open-call hours as published by each agency. Confirm on their site before you
        travel.
      </p>
    </motion.section>
  );
}

/**
 * The recommendation, with honest semantics.
 *
 * The old sentence counted every agency missing a shot and called them all
 * "unlocked" — so a talent who went out and shot it came back to find zero
 * agencies had flipped, because the other five were still missing something
 * else. There are two truths here and they are said separately: the agencies
 * this one frame would *finish*, and the ones that merely also ask for it.
 */
function Recommendation({ recommendation }) {
  if (!recommendation) return null;
  const { label, completes, alsoAsked } = recommendation;
  const also =
    alsoAsked > 0
      ? ` — and ${alsoAsked} more ${alsoAsked === 1 ? 'agency asks' : 'agencies ask'} for it`
      : '';

  return (
    <p className={styles.recommendation}>
      {completes.length ? (
        <>
          One <em>{label}</em> would complete your set for {joinPhrases(completes)}
          {also}.
        </>
      ) : (
        <>
          One <em>{label}</em> is the shot most of these agencies are still waiting on —{' '}
          {alsoAsked === 1 ? '1 agency asks' : `${alsoAsked} agencies ask`} for it.
        </>
      )}
    </p>
  );
}

export default function RequirementsPage() {
  const { images, profile } = useAuth();
  const reduceMotion = useReducedMotion();
  const stacked = useStackedLayout();
  const [exports, setExports] = useState({});
  const [selectedSeriesId, setSelectedSeriesId] = useState(null);

  const usableImages = useMemo(() => activeImages(images, profile), [images, profile]);
  const imageIds = useMemo(
    () => usableImages.map((image) => String(image.id)).sort(),
    [usableImages],
  );
  const thumbFor = useCallback(
    (imageId) => {
      const match = usableImages.find((image) => String(image.id) === String(imageId));
      return match ? frameSrc(match) || null : null;
    },
    [usableImages],
  );

  const routesQuery = useQuery({
    queryKey: ['spec-registry-routes'],
    queryFn: talentApi.getSpecRegistryRoutes,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
  const routes = useMemo(() => readRoutes(routesQuery.data), [routesQuery.data]);
  const seriesIds = useMemo(() => routes.map((route) => route.seriesId), [routes]);

  /*
    Its own query, not a field of the routes payload: the windows are a handful
    of curated rows shared by every talent, and several of them belong to
    agencies that publish no spec at all — Que and MSA have no route to hang off.
  */
  const callWindowsQuery = useQuery({
    queryKey: ['call-windows'],
    queryFn: () => talentApi.listCallWindows(),
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });
  const callWindows = useMemo(
    () => readCallWindows(callWindowsQuery.data),
    [callWindowsQuery.data],
  );

  const preflightQuery = useQuery({
    queryKey: ['spec-registry-preflight', seriesIds, imageIds],
    queryFn: () => talentApi.preflightSpecRegistry({ seriesIds, imageIds }),
    enabled: seriesIds.length > 0,
    staleTime: 30_000,
    retry: 1,
  });

  const evaluationFor = useCallback(
    (seriesId) => readEvaluationFor(preflightQuery.data, seriesId),
    [preflightQuery.data],
  );

  /*
    The vocabulary the whole page speaks in. Sent once per response rather than
    per finding, because the same field and value recur across every route.
    Either response carries it; whichever arrived is authoritative.
  */
  const labels = useMemo(
    () => readLabels(preflightQuery.data, routesQuery.data),
    [preflightQuery.data, routesQuery.data],
  );

  const market = useMemo(
    () => buildMarketView({ routes, evaluationFor, labels }),
    [routes, evaluationFor, labels],
  );

  /*
    Submission destinations first, reference entries second. Both are useful —
    knowing you already satisfy Storm is worth something even though Storm is
    not on Pholio — but only one of them ends in an application.
  */
  const railAgencies = useMemo(() => {
    const partitioned = partitionRoutes(routes);
    const order = [...partitioned.submittable, ...partitioned.reference].map(
      (route) => route.seriesId,
    );
    return [...market.agencies]
      .sort((left, right) => order.indexOf(left.seriesId) - order.indexOf(right.seriesId))
      .map((agency) => ({
        ...agency,
        appliesByEmail: agency.route.channelType === CHANNEL_TYPE.OFFICIAL_EMAIL,
      }));
  }, [market.agencies, routes]);

  /*
    One agency stands open so the pane is never an empty promise — but not
    simply the first, because that is Elite Model Japan, which publishes no shot
    list at all and so opens on the one detail that demonstrates nothing.
  */
  const defaultSeriesId = useMemo(() => {
    const withShots = railAgencies.find((agency) => agency.hasShotList);
    return (withShots || railAgencies[0])?.seriesId || null;
  }, [railAgencies]);

  const selected =
    railAgencies.find((agency) => agency.seriesId === selectedSeriesId) ||
    railAgencies.find((agency) => agency.seriesId === defaultSeriesId) ||
    null;
  const activeSeriesId = selected?.seriesId || null;
  const activeIndex = railAgencies.findIndex(
    (agency) => agency.seriesId === activeSeriesId,
  );

  const detailView = useMemo(() => {
    if (!selected) return null;
    return buildAgencyView({
      route: selected.route,
      evaluation: evaluationFor(selected.seriesId),
      labels,
    });
  }, [selected, evaluationFor, labels]);

  const handleExport = useCallback(
    async (route) => {
      setExports((current) => ({ ...current, [route.seriesId]: { status: 'pending' } }));
      try {
        const { blob, filename, fileCount } = await talentApi.exportSpecRegistrySet({
          seriesId: route.seriesId,
          imageIds,
        });
        saveBlob(blob, filename);
        setExports((current) => ({
          ...current,
          [route.seriesId]: { status: 'done', filename, fileCount },
        }));
      } catch (error) {
        setExports((current) => ({
          ...current,
          [route.seriesId]: {
            status: 'error',
            message: error?.message || 'That set could not be prepared.',
          },
        }));
      }
    },
    [imageIds],
  );

  /**
   * Recorded, never blocking. The link opens on its own; if the count fails the
   * talent must still reach the agency's page.
   */
  const handleOutboundClick = useCallback((route) => {
    talentApi.recordSpecRegistryOutboundClick(route.seriesId).catch(() => {});
  }, []);

  const empty = !routesQuery.isLoading && !routesQuery.isError && routes.length === 0;

  const renderDetail = (labelledBy, panelRole) =>
    selected ? (
      <AgencyDetail
        route={selected.route}
        view={detailView}
        panelId={PANEL_ID}
        labelledBy={labelledBy}
        panelRole={panelRole}
        isLoading={preflightQuery.isLoading}
        error={preflightQuery.error}
        exportState={exports[selected.seriesId]}
        onExport={handleExport}
        onOutboundClick={handleOutboundClick}
        thumbFor={thumbFor}
      />
    ) : null;

  return (
    <div className={styles.page}>
      <motion.header
        className={styles.masthead}
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : SPRING}
      >
        {/* No eyebrow above the masthead — banned pattern 1. The italic word
            carries the accent a kicker would have. */}
        <h1 className={styles.title}>
          Agency <em>requirements</em>
        </h1>
        <p className={styles.subtitle}>
          What each agency’s published route asks for, checked against your current
          digitals.
        </p>
        {market.totals.agencies > 0 ? (
          <p className={styles.summary}>
            Your set covers {market.totals.covered} of {market.totals.published} published
            shots across {market.totals.agencies}{' '}
            {market.totals.agencies === 1 ? 'agency' : 'agencies'}.
          </p>
        ) : null}
        <Recommendation recommendation={market.recommendation} />
        {routes.length > 0 ? (
          <p className={styles.provenance}>
            Registry verified continuously · {routes.length}{' '}
            {routes.length === 1 ? 'agency' : 'agencies'}
          </p>
        ) : null}
      </motion.header>

      {routesQuery.isLoading ? (
        <div className={styles.state} role="status" aria-live="polite">
          <p>Loading published requirements…</p>
        </div>
      ) : null}

      {routesQuery.isError ? (
        <div className={styles.state} role="alert">
          <p>Agency requirements couldn’t load.</p>
          <PholioButton variant="secondary" onClick={() => routesQuery.refetch()}>
            Try again
          </PholioButton>
        </div>
      ) : null}

      {empty ? (
        <div className={styles.state}>
          <p>No agency requirements are catalogued yet.</p>
          <p className={styles.stateHint}>
            Pholio adds agencies as their requirements are researched and confirmed. Your
            book stays ready in the meantime.
          </p>
        </div>
      ) : null}

      <CallWindowStrip windows={callWindows} />

      <ShotCoverage shots={market.shots} thumbFor={thumbFor} />

      {railAgencies.length ? (
        <motion.section
          className={styles.market}
          aria-labelledby="market-title"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : SPRING}
        >
          <h2 id="market-title" className={styles.marketTitle}>
            Agency by agency
          </h2>
          <div className={styles.marketBody}>
            <MarketRail
              agencies={railAgencies}
              selectedSeriesId={activeSeriesId}
              onSelect={setSelectedSeriesId}
              panelId={PANEL_ID}
              stacked={stacked}
              renderPanel={(labelledBy) => renderDetail(labelledBy, 'region')}
            />
            {stacked
              ? null
              : renderDetail(`market-tab-${Math.max(activeIndex, 0)}`, 'tabpanel')}
          </div>
        </motion.section>
      ) : null}
    </div>
  );
}
