import React from 'react';
import { getStatusMeta } from './StatusText';
import './StatusCell.css';

/**
 * StatusCell — pipeline state as a designed component: the sharp-cornered
 * tonal cell from the agency status-system family. Tinted ground, tinted
 * hairline border, editorial geometry — never a rounded pill, never a dot.
 *
 * Colors resolve through STATUS_MAP (one status vocabulary everywhere);
 * labels compress to cell length where the map's prose runs long.
 */
const CELL_LABELS = {
  declined: 'Passed',
  development: 'New Face',
  requested_more: 'More digitals',
  meeting_requested: 'Meeting',
  under_review: 'In review',
};

export default function StatusCell({ status, className = '' }) {
  const meta = getStatusMeta(status);
  if (!meta) return null;
  const key = String(status || '').toLowerCase();
  const label = CELL_LABELS[key] || meta.label;
  return (
    <span
      className={`ag-status-cell ${className}`.trim()}
      style={{ '--c': meta.color }}
    >
      {label}
    </span>
  );
}
