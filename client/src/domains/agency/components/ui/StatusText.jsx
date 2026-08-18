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
  limited: { label: 'Limited', color: 'var(--ag-warning)' },
  unknown: { label: 'Unknown', color: 'var(--ag-text-2)' },

  // ── Pipeline / signing set ──
  submitted: { label: 'Submitted', color: 'var(--ag-text-2)' },
  pending: { label: 'Submitted', color: 'var(--ag-text-2)' },
  under_review: { label: 'Under review', color: 'var(--ag-info)' },
  shortlisted: { label: 'Shortlisted', color: 'var(--ag-info)' },
  kept_on_file: { label: 'On file', color: 'var(--ag-text-2)' },
  development: { label: 'New Face — Development', color: 'var(--ag-success)' },
  accepted: { label: 'Offer / Moving Forward', color: 'var(--ag-warning)' },
  represented: { label: 'Represented', color: 'var(--ag-success)' },
  passed: { label: 'Passed', color: 'var(--ag-text-2)' },
  requested_more: { label: 'More digitals requested', color: 'var(--ag-info)' },
  meeting_requested: { label: 'Meeting requested', color: 'var(--ag-info)' },
  withdrawn: { label: 'Withdrawn', color: 'var(--ag-text-2)' },

  // ── Common aliases from the backend enum ──
  on_hold: { label: 'On hold', color: 'var(--ag-warning)' },
  hold: { label: 'On hold', color: 'var(--ag-warning)' },
  declined: { label: 'Not moving forward', color: 'var(--ag-text-2)' },
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

/**
 * Cross-surface label overrides — applied on BOTH the compact list cell and
 * the full-size room, so terminal/outcome vocabulary is truly unified. We
 * override here (not by mutating STATUS_MAP) so other consumers of
 * `getStatusMeta`/`StatusText` (roster, overview, …) keep the canonical base
 * label. `declined` reads "Passed" everywhere in the submissions vocabulary.
 */
const LABEL_OVERRIDES = {
  declined: 'Passed',
};

/**
 * Compact overrides — used only when `{ compact: true }`. These are the terse
 * forms the list cell needs where the canonical prose runs long. The list's
 * former private `CELL_LABELS` map lived in StatusCell; it now lives here so
 * there is one source of truth for the display label.
 */
const COMPACT_OVERRIDES = {
  development: 'New Face',
  requested_more: 'More digitals',
  meeting_requested: 'Meeting',
  under_review: 'In review',
};

/**
 * getStatusLabel — the single source of truth for a status's human display
 * label. Returns the canonical `getStatusMeta(status).label`, with:
 *   • `LABEL_OVERRIDES` applied on every surface (terminal wording unified), and
 *   • `COMPACT_OVERRIDES` applied additionally when `compact` is true.
 *
 * `getStatusLabel(status, { compact: true })` reproduces exactly what the list
 * cell renders for every known status. `getStatusLabel(status)` (full) is what
 * the room uses; terminal outcomes match the list, longer states read in full.
 * Unknown / empty / not-yet-triaged states fall back to a sensible default
 * rather than rendering blank.
 */
export function getStatusLabel(status, { compact = false } = {}) {
  const key = String(status || '').toLowerCase();
  if (compact && COMPACT_OVERRIDES[key]) return COMPACT_OVERRIDES[key];
  if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key];
  const meta = getStatusMeta(key);
  if (meta) return meta.label;
  return 'Awaiting review';
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
