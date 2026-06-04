import React from 'react';

const WEEKS = ['W0', 'W1', 'W2', 'W3', 'W4', 'W5'];

function getHeatClass(val, colIdx) {
  if (val === null) return 'pheat-null';
  if (colIdx === 0) return 'pheat-baseline';
  if (val >= 60) return 'pheat-5';
  if (val >= 35) return 'pheat-4';
  if (val >= 15) return 'pheat-3';
  if (val >= 5)  return 'pheat-2';
  if (val > 0)   return 'pheat-1';
  return 'pheat-null';
}

export default function CohortHeatmap({ data = [] }) {
  if (data.length === 0) {
    return (
      <div className="pheatmap-empty">
        <p className="pheatmap-empty-title">No cohort data yet</p>
        <p className="pheatmap-empty-lede">Visitor cohorts will appear as your audience grows.</p>
      </div>
    );
  }

  const maxCols = Math.max(...data.map(r => r.retention.length), WEEKS.length);
  const colHeaders = WEEKS.slice(0, maxCols);

  return (
    <div className="pheatmap-wrap">
      <div className="pheatmap-scroll">
        <table className="pheatmap-table">
          <thead>
            <tr>
              <th className="pheatmap-th pheatmap-th--label">Cohort</th>
              {colHeaders.map(w => (
                <th key={w} className="pheatmap-th">{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => (
              <tr key={rowIdx} className="pheatmap-row">
                <td className="pheatmap-row-label">{row.label}</td>
                {row.retention.map((val, colIdx) => (
                  <td key={colIdx} className="pheatmap-td">
                    <div className={`pheatmap-cell ${getHeatClass(val, colIdx)}`}>
                      {val !== null ? `${val}%` : ''}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pheatmap-legend">
        <span className="pheatmap-legend-label">Low</span>
        <div className="pheatmap-legend-scale">
          <div className="pheatmap-legend-swatch pheat-1" />
          <div className="pheatmap-legend-swatch pheat-2" />
          <div className="pheatmap-legend-swatch pheat-3" />
          <div className="pheatmap-legend-swatch pheat-4" />
          <div className="pheatmap-legend-swatch pheat-5" />
        </div>
        <span className="pheatmap-legend-label">High</span>
      </div>
    </div>
  );
}
