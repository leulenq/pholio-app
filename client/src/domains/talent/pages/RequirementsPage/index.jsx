import React, { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../../../auth/hooks/useAuth';
import { talentApi } from '../../api/talent';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import { readEvaluationFor, readRoutes } from '../../lib/specRegistry';
import RequirementEntry from './RequirementEntry';
import styles from './RequirementsPage.module.css';

/**
 * Agency requirements.
 *
 * One directory of every agency whose requirements Pholio has catalogued, with
 * the full check shown for all of them — customer agency or not. The talent's
 * question is identical either way (*what does this agency want, and am I
 * ready?*), and withholding the answer to protect a business boundary is
 * exactly the pattern Pholio differentiates against. Which agencies can receive
 * a Pholio application is carried per entry, where it is decision-relevant,
 * rather than by splitting the list into two labelled groups.
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

function DirectoryLoading() {
  return (
    <div className={styles.state} role="status" aria-live="polite">
      <p>Loading published requirements…</p>
    </div>
  );
}

export default function RequirementsPage() {
  const { images, profile } = useAuth();
  const reduceMotion = useReducedMotion();
  const [exports, setExports] = useState({});
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

  const empty =
    !routesQuery.isLoading && !routesQuery.isError && routes.length === 0;

  return (
    <div className={styles.page}>
      <motion.header
        className={styles.masthead}
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 55, damping: 16 }}
      >
        <h1 className={styles.title}>Agency requirements</h1>
        <p className={styles.subtitle}>
          What each agency publishes, and how your current set measures up. Download a set
          already prepared to their requirements, then apply wherever they take applications.
        </p>
      </motion.header>

      {routesQuery.isLoading ? <DirectoryLoading /> : null}

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

      {routes.length > 0 ? (
        <ul className={styles.directory}>
          {routes.map((route, index) => (
            <RequirementEntry
              key={route.seriesId}
              route={route}
              index={index}
              evaluation={readEvaluationFor(preflightQuery.data, route.seriesId)}
              isLoading={preflightQuery.isLoading}
              error={preflightQuery.error}
              exportState={exports[route.seriesId]}
              onExport={handleExport}
              onOutboundClick={handleOutboundClick}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
