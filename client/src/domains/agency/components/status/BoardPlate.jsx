import React from 'react';
import { getDivision } from './statusConfig';
import './status-system.css';

/**
 * BoardPlate — Division (a home). The heaviest status form: a solid pigment
 * cell carrying the booker's shorthand code, welded to the board name.
 *
 * @param {string} division - division/board key (women, men, new_faces, curve…)
 * @param {number} [count]  - live head-count shown beside the name
 * @param {boolean} [compact] - code cell only (avatars / dense lists)
 */
export function BoardPlate({ division, count, compact = false }) {
  const d = getDivision(division);
  if (!d) return null;

  if (compact) {
    return (
      <span className="ss-plate ss-plate--compact" style={{ '--c': d.c }} title={d.label}>
        <span className="ss-plate__code">{d.code}</span>
      </span>
    );
  }

  return (
    <span className="ss-plate" style={{ '--c': d.c }}>
      <span className="ss-plate__code">{d.code}</span>
      <span className="ss-plate__name">
        {d.label}
        {count != null && <span className="ss-plate__count">{count}</span>}
      </span>
    </span>
  );
}

export default BoardPlate;
