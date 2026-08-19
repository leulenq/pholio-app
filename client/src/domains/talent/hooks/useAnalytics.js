import { useQuery } from '@tanstack/react-query';
import { talentApi } from '../api/talent';

function asActivityList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.activities)) return payload.activities;
  return [];
}

function asAnalyticsObject(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return EMPTY_ANALYTICS;
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data;
  }
  return payload;
}

const EMPTY_SUMMARY = Object.freeze({});
const EMPTY_ANALYTICS = Object.freeze({});

export function useAnalytics(days = 30) {
  const analyticsQuery = useQuery({
    queryKey: ['talent-analytics', 'website-contract-v2', days],
    queryFn: () => talentApi.getAnalytics(days),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1
  });

  const activityQuery = useQuery({
    queryKey: ['talent-activity'],
    queryFn: () => talentApi.getActivity(),
    staleTime: 1000 * 60 * 1, // 1 minute (more frequent)
    retry: 1
  });

  const summaryQuery = useQuery({
    queryKey: ['talent-summary'],
    queryFn: () => talentApi.getSummary(),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1
  });

  const summary = summaryQuery.data ?? EMPTY_SUMMARY;
  const analyticsData = asAnalyticsObject(analyticsQuery.data);

  const isAnalyticsRefetching =
    analyticsQuery.isFetching ||
    activityQuery.isFetching ||
    summaryQuery.isFetching;

  return {
    analytics: analyticsData,
    activities: asActivityList(activityQuery.data),
    summary,
    // Only block on activity and summary; website analytics has its own state.
    isLoading: activityQuery.isLoading || summaryQuery.isLoading,
    isError:
      analyticsQuery.isError ||
      activityQuery.isError ||
      summaryQuery.isError,
    /** Granular errors for overview UI (distinct from empty data states). */
    analyticsError: analyticsQuery.isError,
    summaryError: summaryQuery.isError,
    activityError: activityQuery.isError,
    isAnalyticsRefetching,
    isSummaryLoading: summaryQuery.isLoading,
    isAnalyticsLoading: analyticsQuery.isLoading,
    refetch: () => {
      return Promise.all([
        analyticsQuery.refetch(),
        activityQuery.refetch(),
        summaryQuery.refetch()
      ]);
    }
  };
}
