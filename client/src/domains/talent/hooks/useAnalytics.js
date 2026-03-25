import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { talentApi } from '../api/talent';

export function useAnalytics(days = 30) {
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
    staleTime: 1000 * 60 * 10, // 10 minutes
    retry: 1
  });

  const sessionsQuery = useQuery({
    queryKey: ['talent-sessions', days],
    queryFn: () => talentApi.getSessions(days),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1
  });

  const cohortsQuery = useQuery({
    queryKey: ['talent-cohorts'],
    queryFn: () => talentApi.getCohorts(),
    staleTime: 1000 * 60 * 30, // 30 minutes (infrequent)
    retry: 1
  });

  // Memoize derived data to prevent recalculation on every render
  const summary = summaryQuery.data || {};
  const analyticsData = analyticsQuery.data || {};
  const timeseriesData = timeseriesQuery.data || [];

  // Memoize detailed stats calculation - only recalculate when dependencies change
  const detailedStats = useMemo(() => {
    const viewsCount = summary.views?.total || 0;
    const cohortsData = cohortsQuery.data?.data || [];

    // Calculate retention from cohort data if available
    const calculateRetention = () => {
      if (cohortsData.length === 0) return 0;

      // Average W1 retention across all cohorts
      const retentionValues = cohortsData
        .map(cohort => cohort.retention?.[1]) // W1 retention
        .filter(val => val !== null && val !== undefined);

      if (retentionValues.length === 0) return 0;

      const avgRetention = retentionValues.reduce((sum, val) => sum + val, 0) / retentionValues.length;
      return Math.round(avgRetention);
    };

    const retentionValue = calculateRetention();
    const retentionSparkline = cohortsData.slice(0, 7).map(cohort => cohort.retention?.[1] || 0);

    return {
      profileViews: {
        value: viewsCount,
        trend: summary.views?.trend === 'up' ? 12 : -8,
        sparkline: timeseriesData.map(d => d.views) || [0, 0, 0, 0, 0, 0, 0],
        breakdown: analyticsData.views?.latestSourceBreakdown || [
          { label: 'Direct visits', percentage: 100, count: viewsCount }
        ]
      },
      engagement: {
        value: analyticsData.engagement?.score || Math.round(viewsCount * 2.8),
        trend: 15,
        sparkline: timeseriesData.map(d => Math.round(d.views * 2.5)) || [0, 0, 0, 0, 0, 0, 0],
        chartLabel: 'Engagement Score'
      },
      retention: {
        value: retentionValue,
        trend: 0, // Calculate from historical data if available
        sparkline: retentionSparkline.length > 0 ? retentionSparkline : [0, 0, 0, 0, 0, 0, 0],
        chartLabel: 'Retention Rate'
      },
      funnel: {
        value: viewsCount > 0 ? Math.round(((analyticsData.engagement?.counts?.social_click || 0) + (analyticsData.engagement?.counts?.portfolio_click || 0)) / viewsCount * 100) + '%' : '0%',
        breakdown: [
          { label: 'Profile Views', percentage: 100, trend: summary.views?.trend === 'up' ? 5 : -2 },
          {
            label: 'Bio Reads',
            percentage: viewsCount > 0 ? Math.round((analyticsData.engagement?.counts?.bio_read || 0) / viewsCount * 100) : 0,
            trend: 2.4
          },
          {
            label: 'Contact Clicks',
            percentage: viewsCount > 0 ? Math.round(((analyticsData.engagement?.counts?.social_click || 0) + (analyticsData.engagement?.counts?.portfolio_click || 0)) / viewsCount * 100) : 0,
            trend: 5.1
          }
        ]
      }
    };
  }, [summary, analyticsData, timeseriesData, cohortsQuery.data?.data]); // Only recalculate when these change

  return {
    analytics: analyticsQuery.data?.data,
    activities: activityQuery.data?.activities,
    summary,
    timeseries: timeseriesQuery.data?.data || [],
    detailedStats, // New structured data for the detailed view
    insights: insightsQuery.data?.insights || [],
    sessions: sessionsQuery.data?.data || [],
    cohorts: cohortsQuery.data?.data || [],
    // Only block on critical queries (activities, summary) - not advanced analytics
    isLoading: activityQuery.isLoading || summaryQuery.isLoading,
    isError: analyticsQuery.isError || activityQuery.isError || summaryQuery.isError,
    // Loading states for optional queries
    isAnalyticsLoading: analyticsQuery.isLoading,
    isInsightsLoading: insightsQuery.isLoading,
    isSessionsLoading: sessionsQuery.isLoading,
    isCohortsLoading: cohortsQuery.isLoading,
    refetch: () => {
      analyticsQuery.refetch();
      activityQuery.refetch();
      summaryQuery.refetch();
      timeseriesQuery.refetch();
      insightsQuery.refetch();
      sessionsQuery.refetch();
      cohortsQuery.refetch();
    }
  };
}

