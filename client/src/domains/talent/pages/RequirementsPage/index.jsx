import React, { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../../../auth/hooks/useAuth';
import { talentApi } from '../../api/talent';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import { buildSpecMatrix, readEvaluationFor, readRoutes } from '../../lib/specRegistry';
import SpecMatrix from './SpecMatrix';
import AgencyPlate from './AgencyPlate';
import styles from './RequirementsPage.module.css';

/**
 * Agency requirements.
 *
 * The grid is the surface and the per-agency plate hangs off it, rather than a
 * list of agencies with a detail view bolted on. That is the whole argument of
 * this page: a directory answers "what does Elite want?" one agency at a time,
 * which is not the question a talent has. Theirs is "what should I shoot next",
 * and it is only answerable across every agency at once.
 *
 * Which agencies can receive a Pholio application is carried per entry, where
 * it is decision-relevant, rather than by splitting the market into two
 * labelled groups — that split would make the customer list look thin beside
 * the researched one and front-load a distinction talent do not care about
 * until the moment they act.
 */

/**
 * Which images the check should evaluate: the talent's current,
 * agency-visible digitals. Anything retired, hidden from agencies, or not a
 * still image would make the coverage figures describe a set they cannot
 * actually send.
 */
function activeImageIds(images, profile) {
  const candidates = Array.isArray(images)
    ? images
    : Array.isArray(profile?.images)
      ? profile.images
      : [];

  return candidates
    .filter((image) => {
      if (!image?.id || image.deleted_at || image.is_deleted === true || image.retired_at) return false;
      if (String(image.status || 'active').toLowerCase() !== 'active') return false;
      if (image.exclude_from_agency === true) return false;
      if (String(image.asset_kind || image.assetType || 'image').toLowerCase() !== 'image') return false;
      const imageType = String(image.image_type || image.imageType || '').toLowerCase();
      if (imageType && imageType !== 'digital') return false;
      const mimeType = image.delivery_mime_type || image.mime_type || image.mimeType || '';
      return !String(mimeType).toLowerCase().startsWith('video/');
    })
    .map((image) => String(image.id))
    .sort();
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

export default function RequirementsPage() {
  const { images, profile } = useAuth();
  const reduceMotion = useReducedMotion();
  const [exports, setExports] = useState({});
  const [selectedSeriesId, setSelectedSeriesId] = useState(null);
  const [hoveredShot, setHoveredShot] = useState(null);
  const imageIds = useMemo(() => activeImageIds(images, profile), [images, profile]);

  const routesQuery = useQuery({
    queryKey: ['spec-registry-routes'],
    queryFn: talentApi.getSpecRegistryRoutes,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
  const routes = useMemo(() => readRoutes(routesQuery.data), [routesQuery.data]);
  const seriesIds = useMemo(() => routes.map((route) => route.seriesId), [routes]);
  const submittableCount = useMemo(
    () => routes.filter((route) => route.acceptsPholioSubmissions).length,
    [routes],
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

  const matrix = useMemo(
    () => buildSpecMatrix(routes, evaluationFor),
    [routes, evaluationFor],
  );

  /*
    One agency stands open so the plate is never an empty promise — but not
    simply the first, because that is Elite Model Japan, which publishes no shot
    list at all and so opens on the one plate that demonstrates nothing. Default
    to the first agency that actually published a shot list.
  */
  const defaultRoute = useMemo(() => {
    const withShots = routes.find(
      (route) => (evaluationFor(route.seriesId)?.shotCoverage?.published ?? 0) > 0,
    );
    return withShots || routes[0] || null;
  }, [routes, evaluationFor]);

  const selectedRoute =
    routes.find((route) => route.seriesId === selectedSeriesId) || defaultRoute;
  const selectedIndex = selectedRoute
    ? routes.findIndex((route) => route.seriesId === selectedRoute.seriesId)
    : 0;

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

  return (
    <div className={styles.page}>
      <motion.header
        className={styles.masthead}
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 55, damping: 16 }}
      >
        <div className={styles.mastheadCopy}>
          {/* No eyebrow above the masthead — banned pattern 1. The italic gold
              word carries the accent a kicker would have. */}
          <h1 className={styles.title}>
            Agency <em>requirements</em>
          </h1>
          <div className={styles.sweep} aria-hidden="true" />
          <p className={styles.subtitle}>
            Every agency Pholio has catalogued, and how your current set measures against
            each one. Take a set already prepared to their requirements, then apply
            wherever they accept applications.
          </p>
        </div>

        {routes.length > 0 ? (
          <dl className={styles.index}>
            <div className={styles.indexCell}>
              <dt className={styles.indexTerm}>Agencies catalogued</dt>
              <dd className={styles.indexValue}>{String(routes.length).padStart(2, '0')}</dd>
            </div>
            <div className={styles.indexCell}>
              <dt className={styles.indexTerm}>Accept through Pholio</dt>
              <dd className={styles.indexValue}>{String(submittableCount).padStart(2, '0')}</dd>
            </div>
          </dl>
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
            Pholio adds agencies as their requirements are researched and confirmed. Your book
            stays ready in the meantime.
          </p>
        </div>
      ) : null}

      <SpecMatrix
        matrix={matrix}
        selectedSeriesId={selectedRoute?.seriesId || null}
        onSelectAgency={setSelectedSeriesId}
        hoveredShot={hoveredShot}
        onHoverShot={setHoveredShot}
      />

      {selectedRoute ? (
        <AgencyPlate
          key={selectedRoute.seriesId}
          route={selectedRoute}
          index={selectedIndex}
          evaluation={evaluationFor(selectedRoute.seriesId)}
          isLoading={preflightQuery.isLoading}
          error={preflightQuery.error}
          exportState={exports[selectedRoute.seriesId]}
          onExport={handleExport}
          onOutboundClick={handleOutboundClick}
        />
      ) : null}
    </div>
  );
}
