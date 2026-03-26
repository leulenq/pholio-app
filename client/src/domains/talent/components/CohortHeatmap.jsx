import React from 'react';

/**
 * Cohort Analysis Heatmap
 */
export default function CohortHeatmap({ data = [] }) {
  const hasData = data.length > 0;

  const getHeatColor = (val) => {
    if (val === null) return '';
    if (val >= 100) return 'heat-100';
    if (val >= 8) return 'heat-80';
    if (val >= 5) return 'heat-60';
    if (val >= 3) return 'heat-40';
    if (val >= 2) return 'heat-20';
    return 'heat-5';
  };

  return (
    <div className="cohort-heatmap-container">
      <div className="cohort-card-header">
        <h3 className="cohort-card-title">Visitor Cohort Analysis</h3>
        <div className="cohort-card-actions">
          <span className="text-xs text-slate-400">Retention by week</span>
        </div>
      </div>

      {hasData ? (
        <div className="cohort-table-wrapper">
          <table className="cohort-table">
            <thead>
              <tr>
                <th className="cohort-th text-left">All Users</th>
                <th className="cohort-th">W0</th>
                <th className="cohort-th">W1</th>
                <th className="cohort-th">W2</th>
                <th className="cohort-th">W3</th>
                <th className="cohort-th">W4</th>
                <th className="cohort-th">W5</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={idx}>
                  <td className="cohort-row-label">{row.label}</td>
                  {row.retention.map((val, cellIdx) => (
                    <td key={cellIdx}>
                      <div className={`cohort-cell ${getHeatColor(val)}`}>
                        {val !== null ? `${val}%` : ''}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '240px',
          color: '#94a3b8',
          textAlign: 'center',
          padding: '2rem'
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ marginBottom: '1rem', opacity: 0.3 }}>
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" strokeWidth="2"/>
            <line x1="8" y1="21" x2="16" y2="21" strokeWidth="2"/>
            <line x1="12" y1="17" x2="12" y2="21" strokeWidth="2"/>
          </svg>
          <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>No cohort data yet</p>
          <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>Visitor cohorts will appear as you build an audience</p>
        </div>
      )}
    </div>
  );
}
