import { useQuery } from '@tanstack/react-query';
import { talentApi } from '../api/talent';

/**
 * useIntel — one composed read for the whole Intel page
 * (GET /api/talent/intel). The backend clamps `days` by tier (free 7 / Studio+
 * 90) and omits Studio-only instruments rather than faking them, so the hook
 * stays thin: it fetches, unwraps, and reports state. Every instrument reads
 * its own slice and renders its own designed calibrating state.
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

/** Scrub detail for a single day (Studio+). Lazily enabled by the caller. */
export function useIntelDay(date, enabled = false) {
  return useQuery({
    queryKey: ['talent-intel-day', date],
    queryFn: () => talentApi.getIntelDay(date),
    enabled: Boolean(enabled && date),
    staleTime: 1000 * 60 * 5,
    retry: 0,
  });
}
