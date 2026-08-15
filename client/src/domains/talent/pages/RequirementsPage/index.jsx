import React, { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../../../auth/hooks/useAuth';
import { talentApi } from '../../api/talent';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import { buildSpecMatrix, readEvaluationFor, readRoutes } from '../../lib/specRegistry';
import SpecLedger from './SpecLedger';
import AgencyPlate from './AgencyPlate';
import styles from './RequirementsPage.module.css';

/**
 * Agency requirements, as one ledger.
 *
 * The talent's photo set is the constant; each agency is a column of demands.
 * The page has to answer two questions in a glance — which agencies can I
 * already satisfy, and what single shot unlocks the most of them — and neither
 * is answerable one agency at a time, which is why the grid is the surface and
 * the per-agency plate hangs off it rather than the other way round.
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
  const imageIds = useMemo(() => activeImageIds(images, profile), [images, profile]);

  const routesQuery = useQuery({
    queryKey: ['spec-registry-routes'],
    queryFn: talentApi.getSpecRegistryRoutes,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
  const routes = useMemo(() => readRoutes(routesQuery.data), [routesQuery.data]);
  const seriesIds = useMemo(() => routes.map((route) => route.seriesId), [routes]);

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
        transition={
          reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 55, damping: 16 }
        }
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

      <SpecLedger
        matrix={matrix}
        routes={routes}
        selectedSeriesId={selectedRoute?.seriesId || null}
        onSelectAgency={setSelectedSeriesId}
      />

      <AnimatePresence mode="wait" initial={false}>
        {selectedRoute ? (
          <AgencyPlate
            key={selectedRoute.seriesId}
            route={selectedRoute}
            evaluation={evaluationFor(selectedRoute.seriesId)}
            isLoading={preflightQuery.isLoading}
            error={preflightQuery.error}
            exportState={exports[selectedRoute.seriesId]}
            onExport={handleExport}
            onOutboundClick={handleOutboundClick}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
