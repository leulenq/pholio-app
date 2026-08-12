import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../auth/hooks/useAuth';
import { talentApi } from '../../api/talent';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import RegistryPreflight from '../../components/RegistryPreflight';
import styles from './RequirementsPage.module.css';

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.routes)) return value.routes;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function marketLabel(route) {
  const market = route?.market || route?.scope?.market || {};
  return route?.marketLabel || route?.marketName || market.name || market.city || market.code || route?.officeName || route?.scope?.office?.name || 'Market not published';
}

function routeName(route) {
  return route?.agencyName || route?.organizationName || route?.organization?.name || route?.scope?.organization?.name || route?.name || 'Agency route';
}

function routeSeriesId(route) {
  return route?.seriesId || route?.series_id || route?.id || null;
}

function normalizedRoutes(value) {
  return asArray(value)
    .map((route) => ({
      ...route,
      seriesId: routeSeriesId(route),
      agencyName: routeName(route),
      marketName: marketLabel(route),
      sourceUrl: route?.sourceUrl || route?.source?.url || route?.scope?.channel?.url || null,
      checkedOn: route?.sourceCheckedOn || route?.checkedOn || route?.lifecycle?.reviewedOn || null,
      freshness: route?.sourceFreshness || route?.freshness || null,
    }))
    .filter((route) => Boolean(route.seriesId));
}

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

function freshnessLabel(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.state === 'review_due') {
    return value.nextReviewOn
      ? `Source review was due ${value.nextReviewOn}. Confirm on the agency site.`
      : 'Source review is due. Confirm on the agency site.';
  }
  if (value.state === 'expired') {
    return 'The recorded effective period has ended. Confirm on the agency site.';
  }
  if (value.state === 'unknown') {
    return 'Source freshness is not yet recorded.';
  }
  return null;
}

function preflightResults(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.data?.results)) return value.data.results;
  return [];
}

function resultForRoute(results, route) {
  return results.find((result) =>
    [result?.seriesId, result?.series_id, result?.routeSeriesId].includes(route.seriesId),
  ) || null;
}

function RoutesLoading() {
  return (
    <div className={styles.directoryLoading} role="status" aria-live="polite">
      <p>Loading published requirements…</p>
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </div>
  );
}

function RoutesError({ onRetry }) {
  return (
    <div className={styles.directoryState} role="alert">
      <p>Agency requirements couldn&apos;t load.</p>
      <PholioButton variant="secondary" onClick={onRetry}>Try again</PholioButton>
    </div>
  );
}

/** Dedicated directory for current, source-backed agency-route requirements. */
export default function RequirementsPage() {
  const { images, profile } = useAuth();
  const [selectedSeriesId, setSelectedSeriesId] = useState(null);
  const imageIds = useMemo(() => activeImageIds(images, profile), [images, profile]);

  const routesQuery = useQuery({
    queryKey: ['spec-registry-routes'],
    queryFn: talentApi.getSpecRegistryRoutes,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
  const routes = useMemo(() => normalizedRoutes(routesQuery.data), [routesQuery.data]);

  const seriesIds = useMemo(() => routes.map((route) => route.seriesId), [routes]);
  const preflightQuery = useQuery({
    queryKey: ['spec-registry-preflight', seriesIds, imageIds],
    queryFn: () => talentApi.preflightSpecRegistry({ seriesIds, imageIds }),
    enabled: seriesIds.length > 0,
    staleTime: 30_000,
    retry: 1,
  });
  const selectedRoute = routes.find((route) => route.seriesId === selectedSeriesId) || routes[0] || null;
  const selectedResult = selectedRoute
    ? resultForRoute(preflightResults(preflightQuery.data), selectedRoute)
    : null;

  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <h1>Agency requirements</h1>
        <p>
          Compare your current image package with what agencies publish for their own submission routes.
        </p>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.directory} aria-label="Agency requirement routes">
          <h2>Published routes</h2>
          {routesQuery.isLoading ? <RoutesLoading /> : null}
          {routesQuery.isError ? <RoutesError onRetry={() => routesQuery.refetch()} /> : null}
          {!routesQuery.isLoading && !routesQuery.isError && routes.length === 0 ? (
            <div className={styles.directoryState}>
              <p>No agency requirement routes are available yet.</p>
            </div>
          ) : null}
          {routes.length > 0 ? (
            <ol className={styles.routeList}>
              {routes.map((route) => {
                const selected = route.seriesId === selectedRoute?.seriesId;
                return (
                  <li key={route.seriesId}>
                    <PholioButton
                      type="button"
                      variant="tertiary"
                      className={`${styles.routeButton}${selected ? ` ${styles.routeButtonSelected}` : ''}`}
                      aria-pressed={selected}
                      onClick={() => setSelectedSeriesId(route.seriesId)}
                    >
                      <span className={styles.routeName}>{route.agencyName}</span>
                      <span className={styles.routeMarket}>{route.marketName}</span>
                    </PholioButton>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </aside>

        <section className={styles.detail} aria-live="polite">
          {selectedRoute ? (
            <>
              <header className={styles.detailHeader}>
                <h2>{selectedRoute.agencyName}</h2>
                <p>{selectedRoute.marketName}</p>
                {selectedRoute.checkedOn ? <p>Source checked {selectedRoute.checkedOn}</p> : null}
                {freshnessLabel(selectedRoute.freshness) ? (
                  <p>{freshnessLabel(selectedRoute.freshness)}</p>
                ) : null}
              </header>
              <RegistryPreflight
                seriesId={selectedRoute.seriesId}
                agencyName={selectedRoute.agencyName}
                sourceUrl={selectedRoute.sourceUrl}
                result={
                  selectedResult ||
                  (!preflightQuery.isLoading && !preflightQuery.error
                    ? { available: false }
                    : undefined)
                }
                isLoading={preflightQuery.isLoading}
                error={preflightQuery.error}
                onRetry={() => preflightQuery.refetch()}
              />
            </>
          ) : (
            <div className={styles.detailEmpty}>
              <p>Select an agency route to review its published requirements.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
