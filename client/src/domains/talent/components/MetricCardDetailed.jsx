import React from 'react';
import { Info } from 'lucide-react';
import SparklineChart from './SparklineChart';
import MetricBreakdown from './MetricBreakdown';

/**
 * Enhanced Metric Card with mini-chart and breakdown
 */
export default function MetricCardDetailed({ 
  title, 
  value, 
  trend, 
  chartData, 
  breakdown,
  chartLabel = 'Sales Over Time',
  isCurrency = false
}) {
  // Safety check for value
  const numericValue = typeof value === 'number' ? value : 0;
  const formattedValue = isCurrency 
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(numericValue).replace('.00', '')
    : numericValue.toLocaleString();

  return (
    <div className="metric-card-detailed">
      <div className="metric-card-header">
        <div className="metric-card-title-group">
          <h3 className="metric-card-title">{title}</h3>
          <div className="pholio-tooltip-container">
            <Info size={14} className="pholio-tooltip-trigger cursor-help" aria-hidden="true" />
            <div className="pholio-tooltip-content">
              Detailed breakdown for {title}
            </div>
          </div>
        </div>
      </div>

      <div className="metric-main-section">
        <div className="metric-value-group">
          <span className="metric-large-value">{formattedValue}</span>
          {trend !== undefined && (
            <span className={`metric-trend-large ${trend >= 0 ? 'positive' : 'negative'}`}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
            </span>
          )}
        </div>
        
        {chartData && chartData.length > 0 && (
          <div className="chart-container">
            <SparklineChart data={chartData} color={trend >= 0 ? '#6366f1' : '#b91c1c'} />
            <div className="metric-chart-label">{chartLabel}</div>
          </div>
        )}
      </div>

      {breakdown && breakdown.length > 0 && (
        <>
          <hr className="metric-breakdown-divider" />
          <MetricBreakdown items={breakdown} />
        </>
      )}
    </div>
  );
}
