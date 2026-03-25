import React from 'react';
import { Lock } from 'lucide-react';

/**
 * Locked Metric Preview Card
 * Shows blurred preview of premium metrics to create upgrade aspiration
 */
export default function LockedMetricCard({ title, previewValue, feature, variant = 'light' }) {
  const isDark = variant === 'dark';
  
  return (
    <div className={`locked-metric-card ${isDark ? 'dark-variant' : ''}`}>
      <div className="locked-overlay">
        <div className="lock-icon-container">
          <Lock size={24} className="lock-icon" />
        </div>
        <p className="unlock-text">Studio+ Only</p>
      </div>
      
      <div className="locked-content">
        <div className="metric-header">
          <h3 className="metric-card-title">{title}</h3>
        </div>
        
        <div className="metric-main-section blurred">
          <span className="metric-large-value">{previewValue}</span>
          <div className="metric-trend-preview">
            <span className="trend-arrow">↑</span>
            <span>15%</span>
          </div>
        </div>
        
        <div className="locked-feature-tag">
          <span className="feature-icon">✨</span>
          <span className="feature-text">{feature}</span>
        </div>
      </div>
    </div>
  );
}
