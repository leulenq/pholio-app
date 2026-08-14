import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../auth/hooks/useAuth';
import { talentApi } from '../../api/talent';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import RegistryPreflight from '../../components/RegistryPreflight';
import {
  formatRegistryDate,
  readFreshnessNotice,
  readRoutes,
  sourceNeedsReview,
} from '../../lib/specRegistry';
import styles from './RequirementsPage.module.css';

/**
 * Which of the talent's images the preflight should evaluate: their current,
 * agency-visible digitals. Anything retired, hidden from agencies, or not a
 * still image would make the coverage figures describe a package they cannot
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

function preflightResults(payload) {
  const envelope = payload?.data ?? payload;
  return Array.isArray(envelope?.results) ? envelope.results : [];
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
  const routes = useMemo(() => readRoutes(routesQuery.data), [routesQuery.data]);

  const seriesIds = useMemo(() => routes.map((route) => route.seriesId), [routes]);
  const preflightQuery = useQuery({
    queryKey: ['spec-registry-preflight', seriesIds, imageIds],
    queryFn: () => talentApi.preflightSpecRegistry({ seriesIds, imageIds }),
    enabled: seriesIds.length > 0,
    staleTime: 30_000,
    retry: 1,
  });

  const selectedRoute =
    routes.find((route) => route.seriesId === selectedSeriesId) || routes[0] || null;
  const selectedResult = selectedRoute
    ? preflightResults(preflightQuery.data).find(
        (result) => result?.seriesId === selectedRoute.seriesId,
      ) || null
    : null;

  const checkedOn = formatRegistryDate(selectedRoute?.sourceCheckedOn);
  const freshnessNotice = selectedRoute ? readFreshnessNotice(selectedRoute) : null;

  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <h1>Agency requirements</h1>
        <p>
          Compare your current image package with what agencies publish for their own submission routes.
        </p>
      </header>

      <div className={styles.workspace}>
        <nav className={styles.directory} aria-label="Agency requirement routes">
          <h2>Published routes</h2>
          {routesQuery.isLoading ? <RoutesLoading /> : null}
          {routesQuery.isError ? <RoutesError onRetry={() => routesQuery.refetch()} /> : null}
          {!routesQuery.isLoading && !routesQuery.isError && routes.length === 0 ? (
            <div className={styles.directoryState}>
              <p>No agency requirement routes are available yet.</p>
              <p className={styles.directoryStateHint}>
                Pholio adds routes as agencies publish them. Your book stays ready in the meantime.
              </p>
            </div>
          ) : null}
          {routes.length > 0 ? (
            <ul className={styles.routeList}>
              {routes.map((route, index) => {
                const selected = route.seriesId === selectedRoute?.seriesId;
                return (
                  <li key={route.seriesId} style={{ '--route-index': index }}>
                    {/* A directory entry, not a command: these read as a list of
                        agencies and select one, so they carry list semantics and
                        the page's own type rather than button chrome. */}
                    <button
                      type="button"
                      className={`${styles.routeItem}${selected ? ` ${styles.routeItemSelected}` : ''}`}
                      aria-current={selected ? 'true' : undefined}
                      onClick={() => setSelectedSeriesId(route.seriesId)}
                    >
                      <span className={styles.routeName}>{route.agencyName}</span>
                      {route.marketLabel ? (
                        <span className={styles.routeMarket}>{route.marketLabel}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </nav>

        <section className={styles.detail} aria-live="polite">
          {selectedRoute ? (
            <>
              <header className={styles.detailHeader}>
                <h2>{selectedRoute.agencyName}</h2>
                {selectedRoute.marketLabel ? (
                  <p className={styles.detailMarket}>{selectedRoute.marketLabel}</p>
                ) : null}
                <div className={styles.detailSource}>
                  {checkedOn ? <p>Source checked {checkedOn}</p> : null}
                  {sourceNeedsReview(selectedRoute) && freshnessNotice ? (
                    <p className={styles.detailCaution}>{freshnessNotice}</p>
                  ) : null}
                </div>
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
