import React from 'react';
import { getState } from './statusConfig';
import './status-system.css';

/**
 * AvailabilityCell — State (live). The plainest, most scannable form: a sharp
 * colour cell where the colour is the meaning. Tint = soft/pending, solid =
 * confirmed (a booking). No dots, no pills.
 *
 * @param {string} status - availability key (available, on_booking, on_hold,
 *                           booked, bookout, released, inactive…)
 * @param {boolean} [sm]  - denser size for table rows
 */
export function AvailabilityCell({ status, sm = false }) {
  if (!status) return null;
  const s = getState(status);
  return (
    <span
      className={`ss-cell${s.fill === 'solid' ? ' ss-cell--solid' : ''}${sm ? ' ss-cell--sm' : ''}`}
      style={{ '--c': s.c }}
    >
      {s.label}
    </span>
  );
}

export default AvailabilityCell;
