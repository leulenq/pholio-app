/* eslint-disable react-refresh/only-export-components -- the status map + resolver are the single source of truth and are colocated with the component by design */
import React from 'react';
import './StatusText.css';

/**
 * StatusText — the single source of truth for rendering talent availability
 * and pipeline state. Renders PLAIN Inter 500 text in a semantic color.
 *
 * Never a pill, badge, dot, or dot-pill combo. Color is always paired with a
 * human label, so meaning is never carried by color alone.
 *
 * `color` values are CSS custom-property references — no raw hex.
 */
export const STATUS_MAP = {
  // ── Availability set ──
  available: { label: 'Available', color: 'var(--ag-success)' },
  on_option: { label: 'On option', color: 'var(--ag-warning)' },
  on_booking: { label: 'On booking', color: 'var(--ag-info)' },
  booked_out: { label: 'Booked out', color: 'var(--ag-danger)' },
  inactive: { label: 'Inactive', color: 'var(--ag-text-2)' },

  // ── Pipeline / signing set ──
  submitted: { label: 'Submitted', color: 'var(--ag-text-2)' },
  under_review: { label: 'Under review', color: 'var(--ag-info)' },
  shortlisted: { label: 'Shortlisted', color: 'var(--ag-info)' },
  kept_on_file: { label: 'On file', color: 'var(--ag-text-2)' },
  development: { label: 'New Face — Development', color: 'var(--ag-success)' },
  represented: { label: 'Represented', color: 'var(--ag-success)' },
  passed: { label: 'Passed', color: 'var(--ag-text-2)' },

  // ── Common aliases from the backend enum ──
  on_hold: { label: 'On hold', color: 'var(--ag-warning)' },
  hold: { label: 'On hold', color: 'var(--ag-warning)' },
  signed: { label: 'Represented', color: 'var(--ag-success)' },
};

/**
 * Resolve a status key to its `{ label, color }` metadata.
 * Tolerant of casing and of unknown keys (returns null).
 */
export function getStatusMeta(status) {
  if (!status) return null;
  return (
    STATUS_MAP[status] ||
    STATUS_MAP[String(status).toLowerCase()] ||
    null
  );
}

export function StatusText({ status, label, className = '', ...props }) {
  const meta = getStatusMeta(status);
  if (!meta && !label) return null;

  const text = label || meta?.label || status;
  const color = meta?.color || 'var(--ag-text-2)';

  return (
    <span className={`ag-status-text ${className}`.trim()} style={{ color }} {...props}>
      {text}
    </span>
  );
}

export default StatusText;
