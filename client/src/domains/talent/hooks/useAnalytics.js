import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { talentApi } from '../api/talent';

/** apiClient unwraps { success, data } → data; some routes use { success, insights } (no data key). */
function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

function asActivityList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.activities)) return payload.activities;
  return [];
}

function asInsightsList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.insights)) return payload.insights;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function asAnalyticsObject(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return EMPTY_ANALYTICS;
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data;
  }
  return payload;
}

function asFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const EMPTY_SUMMARY = Object.freeze({});
const EMPTY_ANALYTICS = Object.freeze({});

export function useAnalytics(days = 30, options = {}) {
  const includeAdvanced = options?.includeAdvanced === true;

  const analyticsQuery = useQuery({
    queryKey: ['talent-analytics', days],
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

  const timeseriesQuery = useQuery({
    queryKey: ['talent-timeseries', days], // Include days in cache key
    queryFn: () => talentApi.getTimeseries(days),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1
  });

  const insightsQuery = useQuery({
    queryKey: ['talent-insights'],
    queryFn: () => talentApi.getInsights(),
    enabled: includeAdvanced,
    staleTime: 1000 * 60 * 10, // 10 minutes
    retry: 1
  });

  const sessionsQuery = useQuery({
    queryKey: ['talent-sessions', days],
    queryFn: () => talentApi.getSessions(days),
    enabled: includeAdvanced,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1
  });

  const cohortsQuery = useQuery({
    queryKey: ['talent-cohorts'],
    queryFn: () => talentApi.getCohorts(),
    enabled: includeAdvanced,
    staleTime: 1000 * 60 * 30, // 30 minutes (infrequent)
    retry: 1
  });

  // Memoize derived data to prevent recalculation on every render
  const summary = summaryQuery.data ?? EMPTY_SUMMARY;
  const analyticsData = asAnalyticsObject(analyticsQuery.data);
  const timeseriesData = asArray(timeseriesQuery.data);

  // Memoize detailed stats calculation - only recalculate when dependencies change
  const detailedStats = useMemo(() => {
    const summaryData = summaryQuery.data;
    const viewsCount = asFiniteNumber(summaryData?.views?.total);
    const cohortsData = asArray(cohortsQuery.data);
    const sourceBreakdown = Array.isArray(analyticsData.views?.latestSourceBreakdown)
      ? analyticsData.views.latestSourceBreakdown
      : [];
    const engagementCounts = analyticsData.engagement?.counts || {};

    // Calculate retention from cohort data if available
    const calculateRetention = () => {
      if (cohortsData.length === 0) return 0;

      // Average W1 retention across all cohorts
      const retentionValues = cohortsData
        .map(cohort => cohort.retention?.[1]) // W1 retention
        .map((val) => asFiniteNumber(val, NaN))
        .filter((val) => Number.isFinite(val));

      if (retentionValues.length === 0) return 0;

      const avgRetention = retentionValues.reduce((sum, val) => sum + val, 0) / retentionValues.length;
      return Math.round(avgRetention);
    };

    const retentionValue = calculateRetention();
    const retentionSparkline = cohortsData
      .slice(0, 7)
      .map((cohort) => asFiniteNumber(cohort.retention?.[1], 0));
    const profileViewsSparkline = timeseriesData.map((d) => asFiniteNumber(d.views, 0));

    const socialClicks = asFiniteNumber(engagementCounts.social_click);
    const portfolioClicks = asFiniteNumber(engagementCounts.portfolio_click);
    const bioReads = asFiniteNumber(engagementCounts.bio_read);
    const contactRatePct =
      viewsCount > 0 ? Math.round(((socialClicks + portfolioClicks) / viewsCount) * 100) : 0;
    const bioReadRatePct = viewsCount > 0 ? Math.round((bioReads / viewsCount) * 100) : 0;

    const viewsTrend = asFiniteNumber(
      summaryData?.views?.changePct ?? summaryData?.views?.changePercent ?? summaryData?.views?.deltaPct,
      0
    );
    const engagementTrend = asFiniteNumber(
      analyticsData?.engagement?.trend ?? analyticsData?.engagement?.changePct,
      0
    );
    const retentionTrend = asFiniteNumber(
      analyticsData?.retention?.trend ?? analyticsData?.retention?.changePct,
      0
    );

    return {
      profileViews: {
        value: viewsCount,
        trend: viewsTrend,
        sparkline: profileViewsSparkline,
        breakdown: sourceBreakdown,
      },
      engagement: {
        value: asFiniteNumber(analyticsData.engagement?.score),
        trend: engagementTrend,
        sparkline: Array.isArray(analyticsData.engagement?.sparkline)
          ? analyticsData.engagement.sparkline.map((v) => asFiniteNumber(v, 0))
          : [],
        chartLabel: 'Engagement Score',
      },
      retention: {
        value: retentionValue,
        trend: retentionTrend,
        sparkline: retentionSparkline,
        chartLabel: 'Retention Rate',
      },
      funnel: {
        value: contactRatePct,
        breakdown: [
          { label: 'Profile Views', percentage: 100 },
          {
            label: 'Bio Reads',
            percentage: bioReadRatePct,
          },
          {
            label: 'Contact Clicks',
            percentage: contactRatePct,
          },
        ],
      },
    };
  }, [summaryQuery.data, analyticsData, timeseriesData, cohortsQuery.data]);

  const isAnalyticsRefetching =
    analyticsQuery.isFetching ||
    activityQuery.isFetching ||
    summaryQuery.isFetching ||
    timeseriesQuery.isFetching ||
    (includeAdvanced && (insightsQuery.isFetching || sessionsQuery.isFetching || cohortsQuery.isFetching));

  return {
    analytics: analyticsData,
    activities: asActivityList(activityQuery.data),
    summary,
    timeseries: timeseriesData,
    detailedStats, // New structured data for the detailed view
    insights: asInsightsList(insightsQuery.data),
    sessions: asArray(sessionsQuery.data),
    cohorts: asArray(cohortsQuery.data),
    // Only block on critical queries (activities, summary) - not advanced analytics
    isLoading: activityQuery.isLoading || summaryQuery.isLoading,
    isError:
      analyticsQuery.isError ||
      activityQuery.isError ||
      summaryQuery.isError ||
      timeseriesQuery.isError,
    /** Granular errors for overview UI (distinct from empty data states). */
    summaryError: summaryQuery.isError,
    activityError: activityQuery.isError,
    isAnalyticsRefetching,
    isSummaryLoading: summaryQuery.isLoading,
    isTimeseriesLoading: timeseriesQuery.isLoading,
    timeseriesError: timeseriesQuery.isError,
    // Loading states for optional queries
    isAnalyticsLoading: analyticsQuery.isLoading,
    isInsightsLoading: insightsQuery.isLoading,
    isSessionsLoading: sessionsQuery.isLoading,
    isCohortsLoading: cohortsQuery.isLoading,
    refetch: () => {
      const queries = [
        analyticsQuery.refetch(),
        activityQuery.refetch(),
        summaryQuery.refetch(),
        timeseriesQuery.refetch()
      ];

      if (includeAdvanced) {
        queries.push(
          insightsQuery.refetch(),
          sessionsQuery.refetch(),
          cohortsQuery.refetch()
        );
      }

      return Promise.all(queries);
    }
  };
}

