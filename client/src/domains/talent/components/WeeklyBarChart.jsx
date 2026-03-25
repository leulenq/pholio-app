import React from 'react';

/**
 * Simple 7-Day Bar Chart for Free Users
 * Static visualization showing activity over the past week
 */
export default function WeeklyBarChart({ data = [] }) {
  const hasData = data.length > 0;
  const maxValue = hasData ? Math.max(...data.map(d => d.value)) : 0;

  return (
    <div className="weekly-bar-chart">
      <div className="chart-header-simple">
        <h3 className="chart-title-simple">This Week's Activity</h3>
        <span className="chart-subtitle-simple">Daily profile views</span>
      </div>

      {hasData ? (
        <div className="bar-chart-container">
          {data.map((item, idx) => {
            const heightPercent = (item.value / maxValue) * 100;
            return (
              <div key={idx} className="bar-column">
                <div className="bar-wrapper">
                  <div
                    className="bar-fill"
                    style={{ height: `${heightPercent}%` }}
                    title={`${item.day}: ${item.value} views`}
                  >
                    <span className="bar-value">{item.value}</span>
                  </div>
                </div>
                <span className="bar-label">{item.day}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '200px',
          color: '#94a3b8',
          textAlign: 'center',
          padding: '2rem'
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ marginBottom: '1rem', opacity: 0.3 }}>
            <line x1="18" y1="20" x2="18" y2="10" strokeWidth="2"/>
            <line x1="12" y1="20" x2="12" y2="4" strokeWidth="2"/>
            <line x1="6" y1="20" x2="6" y2="14" strokeWidth="2"/>
          </svg>
          <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>No activity this week</p>
          <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>Share your profile to start tracking daily views</p>
        </div>
      )}
    </div>
  );
}
