import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';

/**
 * Detailed breakdown list for metric cards
 */
export default function MetricBreakdown({ items = [] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="metric-breakdown-list">
      {items.map((item, idx) => (
        <div key={idx} className="breakdown-row">
          <div className="breakdown-label-group">
            <span className="breakdown-label">{item.label}</span>
            {item.sublabel && <span className="breakdown-sublabel">{item.sublabel}</span>}
          </div>
          
          <div className="breakdown-value-group">
            <span className="breakdown-pct-share">{item.percentage}%</span>
            {item.trend !== undefined && (
              <span className={`breakdown-trend ${item.trend >= 0 ? 'positive' : 'negative'}`}>
                {item.trend >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                {Math.abs(item.trend)}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
