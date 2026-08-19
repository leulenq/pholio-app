/**
 * The market's shot lists, read as one request.
 *
 * Mirrors useHouseBrief.js: nothing fetches until the strip is opened, so
 * reading the whole board still costs the one routes request plus one more
 * per house a talent actually opens. Opening the strip adds exactly one more
 * — never one per house — because the registry answers a `seriesIds` array in
 * a single `results` envelope. React Query caches it by the sorted seriesIds
 * and imageIds, so reopening within `staleTime` is free, same as a house band.
 *
 * The one wrinkle a single house doesn't have: `MAX_SERIES` (25,
 * `src/domains/talent/routes/spec-registry.js`) caps how many seriesIds one
 * preflight call can carry. The researched market is ~10 routes today, so
 * this never chunks in practice — but chunking here, rather than assuming the
 * market stays under the cap, is what keeps "one request to read the market"
 * true as Pholio adds houses instead of becoming a limit someone hits later.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { talentApi } from '../../api/talent';
import { coverageSeriesIds, buildCoverage } from '../../lib/coverageModel';
import { readEvaluationFor, readLabels } from '../../lib/specRegistry';

// Kept in step with the server's MAX_SERIES by hand — it isn't shared code
// across the client/server boundary, so a server-side change needs this
// updated too.
const MAX_SERIES_PER_REQUEST = 25;

function chunk(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

/**
 * One request per chunk answers with its own `{ available, results, labels }`
 * envelope (`preflightRegistry`, `preflight-service.js`); the hook reads the
 * market as a single list, so those envelopes merge into one before anything
 * downstream — `evaluationFor`, `buildCoverage` — sees them. `results` is a
 * plain concatenation: the server never repeats a seriesId across chunks
 * because the chunks partition one deduped list. Availability is a
 * dataset-wide fact (no current registry dataset at all), so every chunk
 * necessarily agrees on it; `every` is defensive, not a real disagreement
 * case.
 */
function mergeEnvelopes(pages) {
  return {
    available: pages.every((page) => asObject(page).available !== false),
    results: pages.flatMap((page) => {
      const { results } = asObject(page);
      return Array.isArray(results) ? results : [];
    }),
    labels: pages.map((page) => asObject(page).labels).find((labels) => asObject(labels) === labels && labels) || {},
  };
}

export function useMarketCoverage(houses, { images = [], enabled = false } = {}) {
  // `coverageSeriesIds` already uniques and sorts (it's a fetch key before
  // it's a list — see coverageModel.js), which is exactly what a stable query
  // key and deterministic chunk boundaries need.
  const seriesIds = useMemo(() => coverageSeriesIds(houses), [houses]);

  // Same normalisation useHouseBrief.js applies to imageIds, except the strip
  // is handed full image objects (the component needs them for thumbnails),
  // so the id extraction happens first.
  const normalizedImageIds = useMemo(
    () => [...new Set((images || []).map((image) => image?.id).filter(Boolean).map(String))].sort(),
    [images],
  );

  const query = useQuery({
    queryKey: ['market-coverage', seriesIds, normalizedImageIds],
    queryFn: async () => {
      const pages = await Promise.all(
        chunk(seriesIds, MAX_SERIES_PER_REQUEST).map((seriesIdChunk) =>
          talentApi.preflightSpecRegistry({ seriesIds: seriesIdChunk, imageIds: normalizedImageIds }),
        ),
      );
      return mergeEnvelopes(pages);
    },
    // Fewer than 2 houses with a shot list has nothing to read "as one" —
    // the strip itself doesn't mount in that case (design doc §3), and this
    // is the fetch-side half of that same guarantee: a closed or single-house
    // strip issues no request at all.
    enabled: enabled && seriesIds.length >= 2,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const available = query.data ? query.data.available !== false : true;

  const coverage = useMemo(() => {
    if (!query.data || !available) return null;
    return buildCoverage({
      houses,
      evaluationFor: (seriesId) => readEvaluationFor(query.data, seriesId),
      labels: readLabels(query.data),
    });
  }, [query.data, available, houses]);

  return {
    coverage,
    // No current registry dataset is a fact about Pholio, not a failure to
    // announce as an error — the same ruling useHouseBrief makes for
    // `unpublished`.
    unavailable: Boolean(query.data) && !available,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export default useMarketCoverage;
