import { useQuery } from '@tanstack/react-query';
import { talentApi } from '../api/talent';

/**
 * useIntel — one composed read for the whole Intel page
 * (GET /api/talent/intel). The backend clamps `days` by tier (free 7 / Studio+
 * 90) and omits Studio-only instruments rather than faking them, so the hook
 * stays thin: it fetches, unwraps, and reports state. Every instrument reads
 * its own slice and renders its own designed calibrating state.
 *
 * Restored return shape: IntelPage destructures `{ intel, meta, isLoading, … }`.
 * Returning raw useQuery made `intel`/`meta` always undefined (blank page +
 * free-tier locks).
 */
export function useIntel(days = 30) {
  const query = useQuery({
    queryKey: ['talent-intel', 'v1', days],
    queryFn: () => talentApi.getIntel(days),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const payload = query.data ?? null;

  return {
    intel: payload,
    meta: payload?.meta ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}

/**
 * Lazy per-day scrub detail for the Seismograph micro-ledger (Studio+ only).
 * Kept disabled until a cursor day is selected so free-tier / idle scrubs
 * never fire the 403-gated endpoint.
 *
 * Accepts either a boolean (legacy) or `{ enabled }` options object.
 */
export function useIntelDay(date, enabledOrOptions = false) {
  const enabled =
    typeof enabledOrOptions === 'object' && enabledOrOptions !== null
      ? Boolean(enabledOrOptions.enabled)
      : Boolean(enabledOrOptions);

  return useQuery({
    queryKey: ['talent-intel-day', date],
    queryFn: () => talentApi.getIntelDay(date),
    enabled: Boolean(date) && enabled,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}
