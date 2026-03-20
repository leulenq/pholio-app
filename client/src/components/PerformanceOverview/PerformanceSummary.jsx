import React, { useState } from 'react';
import { PerformanceOverview } from './PerformanceOverview';
import { ArrowUp, ArrowDown, ChevronDown, ChevronUp, BarChart2, Activity } from 'lucide-react';
import { useAnalytics } from '../../hooks/useAnalytics';
import './PerformanceSummary.css';

export const PerformanceSummary = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { summary, isLoading } = useAnalytics(7);

  // Get real data from summary API
  const views = summary?.views || { total: 0, change: '0%', trend: 'neutral' };
  const trendIsPositive = views.trend === 'up';

  return (
    <div className={`performance-summary-widget ${isExpanded ? 'expanded' : ''}`}>
      <div 
        className="summary-header" 
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
      >
        <div className="summary-left">
          <div className="summary-icon-wrapper">
            <Activity size={20} className="summary-icon" />
          </div>
          <div className="summary-info">
            <span className="summary-title">Performance Summary</span>
            <div className={`summary-metrics-preview ${isExpanded ? 'fade-out' : ''}`}>
              <span className="metric-val">{isLoading ? '...' : `${views.total.toLocaleString()} Views`}</span>
              <span className="metric-sep">•</span>
              <span className={`metric-trait ${trendIsPositive ? 'positive' : 'neutral'}`}>
                 {trendIsPositive ? <ArrowUp size={12} /> : views.trend === 'down' ? <ArrowDown size={12} /> : null} {views.change} This Week
              </span>
            </div>
          </div>
        </div>
        
        <div className="summary-right">
          <span className="toggle-label">{isExpanded ? 'Hide Analytics' : 'View Details'}</span>
          <div className="toggle-icon-bg">
             {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </div>

      <div className={`summary-body ${isExpanded ? 'open' : ''}`}>
        <div className="summary-body-inner">
           {/* Rendering the existing heavy component only when open or always mounted but hidden? 
               Mounting always is better for animation, but 'hidden' via CSS height.
           */}
           <PerformanceOverview />
        </div>
      </div>
    </div>
  );
};
