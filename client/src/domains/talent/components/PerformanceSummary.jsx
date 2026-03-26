import React, { useId, useState } from 'react';
import { PerformanceOverview } from './PerformanceOverview';
import { ArrowUp, ArrowDown, ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { useAnalytics } from '../hooks/useAnalytics';
import './PerformanceSummary.css';

export const PerformanceSummary = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const panelId = useId();
  const {
    summary,
    isLoading,
    isSummaryLoading,
    summaryError,
    refetch,
    isAnalyticsRefetching,
  } = useAnalytics(30);

  // Get real data from summary API
  const rawViews = summary?.views || {};
  const safeTotal = Number(rawViews.total);
  const views = {
    total: Number.isFinite(safeTotal) ? safeTotal : 0,
    change: typeof rawViews.change === 'string' ? rawViews.change : '0%',
    trend:
      rawViews.trend === 'up' || rawViews.trend === 'down' || rawViews.trend === 'neutral'
        ? rawViews.trend
        : 'neutral',
  };
  const trendClass =
    views.trend === 'up' ? 'positive' : views.trend === 'down' ? 'negative' : 'neutral';

  if (summaryError && !isSummaryLoading) {
    return (
      <div
        className="performance-summary-widget performance-summary-widget--error"
        role="alert"
      >
        <div className="performance-summary-error-inner">
          <p className="performance-summary-error-title">Couldn't load performance data</p>
          <p className="performance-summary-error-copy">Check your connection and try again.</p>
          <button
            type="button"
            className="performance-summary-retry"
            onClick={() => refetch()}
            disabled={isAnalyticsRefetching}
          >
            {isAnalyticsRefetching ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`performance-summary-widget ${isExpanded ? 'expanded' : ''}`}
      aria-busy={isLoading ? true : undefined}
    >
      <button
        type="button"
        className="summary-header"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        id={`${panelId}-toggle`}
      >
        <div className="summary-left">
          <div className="summary-icon-wrapper">
            <Activity size={20} className="summary-icon" />
          </div>
          <div className="summary-info">
            <span className="summary-title">Performance Summary</span>
            <div className={`summary-metrics-preview ${isExpanded ? 'fade-out' : ''}`}>
              <span className="metric-val">
                {isLoading ? 'Loading…' : `${views.total.toLocaleString()} Views (30d summary)`}
              </span>
              <span className="metric-sep">•</span>
              <span className={`metric-trait ${trendClass}`}>
                {views.trend === 'up' ? (
                  <ArrowUp size={12} />
                ) : views.trend === 'down' ? (
                  <ArrowDown size={12} />
                ) : null}{' '}
                {views.change} vs prior 30d
              </span>
              <span className="metric-sep">•</span>
              <span className="metric-trait neutral">Expanded chart: last 7d</span>
            </div>
          </div>
        </div>

        <div className="summary-right">
          <span className="toggle-label">{isExpanded ? 'Hide Analytics' : 'View Details'}</span>
          <div className="toggle-icon-bg">
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </button>

      <div
        id={panelId}
        className={`summary-body ${isExpanded ? 'open' : ''}`}
        role="region"
        aria-labelledby={`${panelId}-toggle`}
        aria-label="Performance details, last 7 days"
        hidden={!isExpanded}
      >
        <div className="summary-body-inner">
          <PerformanceOverview />
        </div>
      </div>
    </div>
  );
};
