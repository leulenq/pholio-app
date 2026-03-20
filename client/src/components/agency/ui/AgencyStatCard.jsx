import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import './AgencyStatCard.css';

export function AgencyStatCard({
  title,
  value,
  icon: Icon,
  trend,
  color = 'amber',
  loading = false,
  onClick
}) {
  if (loading) {
    return (
      <div className="agency-stat-card agency-stat-card--loading">
        <div className="agency-stat-skeleton-icon" />
        <div className="agency-stat-content">
          <div className="agency-stat-skeleton-value" />
          <div className="agency-stat-skeleton-label" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`agency-stat-card ${onClick ? 'agency-stat-card--clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className={`agency-stat-icon agency-stat-icon--${color}`}>
        <Icon size={24} />
      </div>
      <div className="agency-stat-content">
        <div className="agency-stat-value">{value}</div>
        <div className="agency-stat-label">{title}</div>
        {trend !== undefined && trend !== null && (
          <div className={`agency-stat-trend ${trend >= 0 ? 'agency-stat-trend--positive' : 'agency-stat-trend--negative'}`}>
            {trend >= 0 ? (
              <TrendingUp size={14} />
            ) : (
              <TrendingDown size={14} />
            )}
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
