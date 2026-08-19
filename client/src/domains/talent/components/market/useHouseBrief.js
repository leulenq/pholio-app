/**
 * What a house asks for, and where this talent stands against it.
 *
 * The band only asks for this when it opens. A market of two hundred houses
 * would otherwise fire two hundred preflights to render a page nobody has read
 * yet; on open there is exactly one, React Query caches it, and reopening the
 * same house is free.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { talentApi } from '../../api/talent';
import { buildAgencyView, readLabels } from '../../lib/specRegistry';

/**
 * The route to read a house's requirements from.
 *
 * A house Pholio delivers to is asked about by agency id — the server resolves
 * whichever routes that agency owns. Everything else is asked about by the
 * series it publishes.
 */
export function briefTarget(house) {
  if (house?.pholio?.agencyId) return { agencyId: house.pholio.agencyId };
  const seriesId = house?.researched?.[0]?.seriesId || house?.routes?.[0]?.seriesId;
  return seriesId ? { seriesId } : null;
}

function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

/**
 * A multi-route request answers with `results`; a single-route request answers
 * with the evaluation itself. Both come from `evaluationDto`, so once the right
 * entry is picked there is nothing left to normalise.
 */
function selectEvaluation(payload) {
  const envelope = asObject(payload?.data ?? payload);
  const results = Array.isArray(envelope.results) ? envelope.results : [];
  return {
    evaluation: results.length ? asObject(results[0]) : envelope,
    available: envelope.available !== false,
    resolution: envelope.resolution ?? null,
  };
}

export function useHouseBrief(house, { imageIds = [], enabled = false } = {}) {
  const target = useMemo(() => briefTarget(house), [house]);

  const normalizedImageIds = useMemo(
    () => [...new Set((imageIds || []).filter(Boolean).map(String))].sort(),
    [imageIds],
  );

  const query = useQuery({
    queryKey: ['house-brief', target?.agencyId || target?.seriesId || null, normalizedImageIds],
    queryFn: () => talentApi.preflightSpecRegistry({ ...target, imageIds: normalizedImageIds }),
    enabled: enabled && Boolean(target),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const view = useMemo(() => {
    if (!query.data) return null;
    const { evaluation, available } = selectEvaluation(query.data);
    if (!available) return null;
    return buildAgencyView({
      route: { agencyName: house?.name || 'this agency' },
      evaluation,
      labels: readLabels(query.data),
    });
  }, [query.data, house?.name]);

  const { available, resolution } = query.data
    ? selectEvaluation(query.data)
    : { available: true, resolution: null };

  return {
    view,
    // Pholio holding no published requirements is a fact about Pholio, not a
    // failure — the band says so plainly rather than showing an error.
    unpublished: Boolean(query.data) && !available,
    resolution,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    hasTarget: Boolean(target),
  };
}

export default useHouseBrief;
