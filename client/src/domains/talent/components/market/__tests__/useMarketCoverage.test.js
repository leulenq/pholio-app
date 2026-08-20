/**
 * "A market of any size costs one request to read" is an architectural
 * promise, not an implementation detail — it's the thing that lets the strip
 * sit above every house band without changing what opening the board costs.
 * These tests hold the hook to that promise directly: closed issues nothing,
 * open issues exactly one call (chunking only once the registry actually
 * outgrows one request), and the cache — not a second network round trip —
 * is what makes reopening free.
 *
 * `coverageModel.js` is owned by a different slice of this feature and is
 * mocked here so this suite proves the fetch/merge contract on its own,
 * independent of that file's presence or shape.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../../api/talent', () => ({
  talentApi: { preflightSpecRegistry: vi.fn() },
}));

vi.mock('../../../lib/coverageModel', () => ({
  // The default stand-in reads seriesIds straight off each house — real
  // `coverageSeriesIds` does more (routes, not a flat field) — but keeps the
  // part of its contract this suite depends on: it is the one place that
  // uniques and sorts, so the hook itself doesn't have to.
  coverageSeriesIds: vi.fn((houses) =>
    [...new Set((houses || []).flatMap((house) => house.seriesIds || []))].sort(),
  ),
  // Pass-through so a test can read back exactly what the hook fed the
  // engine — `evaluationFor` and `labels` in particular are the whole point
  // of the merge this suite is checking.
  buildCoverage: vi.fn(({ houses, evaluationFor, labels }) => ({ houses, evaluationFor, labels })),
}));

import { talentApi } from '../../../api/talent';
import { coverageSeriesIds, buildCoverage } from '../../../lib/coverageModel';
import { useMarketCoverage } from '../useMarketCoverage';

function wrapperFor(queryClient) {
  return function Wrapper({ children }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const houses = [
  { key: 'elite', seriesIds: ['s2', 's1'] },
  { key: 'ford', seriesIds: ['s1', 's3'] },
];

const images = [{ id: 'i2' }, { id: 'i1' }, { id: 'i1' }, { id: null }];

function envelope(seriesIds, extra = {}) {
  return {
    available: true,
    results: seriesIds.map((seriesId) => ({ seriesId, echo: seriesId })),
    labels: { 'shot.frame': { label: 'Shot frame' } },
    ...extra,
  };
}

beforeEach(() => {
  talentApi.preflightSpecRegistry.mockReset();
  coverageSeriesIds.mockClear();
  buildCoverage.mockClear();
});

describe('useMarketCoverage', () => {
  test('opening fires exactly one preflight POST with sorted, deduped seriesIds', async () => {
    talentApi.preflightSpecRegistry.mockImplementation(({ seriesIds }) =>
      Promise.resolve(envelope(seriesIds)),
    );
    const queryClient = newClient();

    const { result } = renderHook(() => useMarketCoverage(houses, { images, enabled: true }), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(talentApi.preflightSpecRegistry).toHaveBeenCalledTimes(1);
    expect(talentApi.preflightSpecRegistry).toHaveBeenCalledWith({
      seriesIds: ['s1', 's2', 's3'],
      imageIds: ['i1', 'i2'],
    });
  });

  test('a closed strip (enabled: false) issues no fetch at all', async () => {
    talentApi.preflightSpecRegistry.mockImplementation(({ seriesIds }) =>
      Promise.resolve(envelope(seriesIds)),
    );
    const queryClient = newClient();

    const { result } = renderHook(() => useMarketCoverage(houses, { images, enabled: false }), {
      wrapper: wrapperFor(queryClient),
    });

    // Nothing to await: a disabled query never enters a loading state, so the
    // absence of a call has to hold immediately, not just eventually.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.coverage).toBeNull();
    expect(talentApi.preflightSpecRegistry).not.toHaveBeenCalled();
  });

  test('fewer than 2 seriesIds issues no fetch even when enabled', () => {
    talentApi.preflightSpecRegistry.mockImplementation(({ seriesIds }) =>
      Promise.resolve(envelope(seriesIds)),
    );
    const queryClient = newClient();
    const oneHouse = [{ key: 'elite', seriesIds: ['s1'] }];

    renderHook(() => useMarketCoverage(oneHouse, { images, enabled: true }), {
      wrapper: wrapperFor(queryClient),
    });

    expect(talentApi.preflightSpecRegistry).not.toHaveBeenCalled();
  });

  test('reopening within staleTime fires no additional request', async () => {
    talentApi.preflightSpecRegistry.mockImplementation(({ seriesIds }) =>
      Promise.resolve(envelope(seriesIds)),
    );
    const queryClient = newClient();

    const { result, rerender } = renderHook(
      ({ enabled }) => useMarketCoverage(houses, { images, enabled }),
      { wrapper: wrapperFor(queryClient), initialProps: { enabled: true } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(talentApi.preflightSpecRegistry).toHaveBeenCalledTimes(1);

    // Close the strip.
    rerender({ enabled: false });
    expect(talentApi.preflightSpecRegistry).toHaveBeenCalledTimes(1);

    // Reopen it — still inside staleTime (5 min), so React Query serves the
    // cached entry rather than asking again.
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(talentApi.preflightSpecRegistry).toHaveBeenCalledTimes(1);
  });

  test('26+ seriesIds chunks into exactly 2 calls whose merged results equal the unchunked equivalent', async () => {
    const allIds = Array.from({ length: 30 }, (_, i) => `s${String(i + 1).padStart(2, '0')}`);
    talentApi.preflightSpecRegistry.mockImplementation(({ seriesIds }) =>
      Promise.resolve(envelope(seriesIds)),
    );
    const queryClient = newClient();
    const bigHouse = [{ key: 'sprawling-market', seriesIds: allIds }];

    const { result } = renderHook(() => useMarketCoverage(bigHouse, { images, enabled: true }), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(talentApi.preflightSpecRegistry).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = talentApi.preflightSpecRegistry.mock.calls.map((call) => call[0]);
    expect(firstCall.seriesIds).toEqual(allIds.slice(0, 25));
    expect(secondCall.seriesIds).toEqual(allIds.slice(25));

    // What one unchunked request over the full 30 would have answered.
    const unchunkedResults = envelope(allIds).results;
    const mergedFromHook = unchunkedResults.map((entry) => result.current.coverage.evaluationFor(entry.seriesId));
    expect(mergedFromHook).toEqual(unchunkedResults);
  });

  test('evaluationFor and labels come from the merged envelope, passed straight to buildCoverage', async () => {
    talentApi.preflightSpecRegistry.mockResolvedValue(envelope(['s1', 's2', 's3']));
    const queryClient = newClient();

    const { result } = renderHook(() => useMarketCoverage(houses, { images, enabled: true }), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(buildCoverage).toHaveBeenCalledTimes(1);
    expect(result.current.coverage.houses).toBe(houses);
    expect(result.current.coverage.labels).toEqual({ 'shot.frame': { label: 'Shot frame' } });
    expect(result.current.coverage.evaluationFor('s2')).toEqual({ seriesId: 's2', echo: 's2' });
    expect(result.current.coverage.evaluationFor('not-on-any-list')).toBeNull();
  });

  test('a dataset-wide registry-unavailable response is a fact, not an error', async () => {
    talentApi.preflightSpecRegistry.mockResolvedValue({
      available: false,
      results: [],
      labels: {},
    });
    const queryClient = newClient();

    const { result } = renderHook(() => useMarketCoverage(houses, { images, enabled: true }), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.unavailable).toBe(true);
    expect(result.current.coverage).toBeNull();
  });
});
