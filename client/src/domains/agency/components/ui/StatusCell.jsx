import React from 'react';
import { getStatusMeta, getStatusLabel } from './StatusText';
import './StatusCell.css';

/**
 * StatusCell — pipeline state as a designed component: the sharp-cornered
 * tonal cell from the agency status-system family. Tinted ground, tinted
 * hairline border, editorial geometry — never a rounded pill, never a dot.
 *
 * Colors resolve through STATUS_MAP (one status vocabulary everywhere); the
 * compact display label resolves through `getStatusLabel(status, { compact:
 * true })` — the single source of truth for status vocabulary, shared with the
 * review room — which compresses the map's prose to cell length.
 */
export default function StatusCell({ status, className = '' }) {
  const meta = getStatusMeta(status);
  if (!meta) return null;
  const label = getStatusLabel(status, { compact: true });
  return (
    <span
      className={`ag-status-cell ${className}`.trim()}
      style={{ '--c': meta.color }}
    >
      {label}
    </span>
  );
}
