import { useQuery } from '@tanstack/react-query';
import { talentApi } from '../api/talent';

/**
 * The composed Intel payload for a period (7 | 30 | 90 days).
 * apiClient already unwraps { success, data } → data.
 */
export function useIntel(days = 30) {
  return useQuery({
    queryKey: ['talent-intel', days],
    queryFn: () => talentApi.getIntel(days),
    staleTime: 1000 * 60 * 2, // 2 minutes
    retry: 1,
  });
}

/**
 * Lazy per-day scrub detail for the Seismograph micro-ledger (Studio+ only).
 * Kept disabled until a cursor day is selected so free-tier / idle scrubs
 * never fire the 403-gated endpoint.
 */
export function useIntelDay(date, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['talent-intel-day', date],
    queryFn: () => talentApi.getIntelDay(date),
    enabled: Boolean(date) && enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes — a past day's ledger is stable
    retry: 1,
  });
}
