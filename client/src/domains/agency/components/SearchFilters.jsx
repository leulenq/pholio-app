/**
 * SearchFilters — the active filters for a brief, in the booker's own language.
 *
 * Everything shown here comes from `discover_v2`: the server writes each chip's
 * text ("Women", "5'9\" and up", "New York"), its unit and its edit seed. There
 * is no field label, no provenance underline and no parser disclosure — the
 * filters are the interpretation, and they are edited rather than confirmed.
 *
 *   1. Role switcher — only when the brief describes more than one role.
 *   2. Chip strip    — one row, × removes, numeric and date chips edit in place.
 *   3. Notes         — one or two plain lines when something changed the results.
 *
 * An edit or a removal rewrites the brief text and re-runs the search, so the
 * words in the bar and the filters applied can never diverge.
 */

import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { amendBriefValue, amendBriefRemove } from '../lib/discoverMatch';
import './SearchFilters.css';

// ── one chip ──────────────────────────────────────────────────────────────────
function FilterChip({ filter, brief, onAmend }) {
  const kind = filter.editable === 'number' || filter.editable === 'date' ? filter.editable : null;
  const seed = filter.edit_value == null ? '' : String(filter.edit_value);
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(seed);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const beginEdit = () => {
    if (!kind) return;
    setNum(seed);
    setFrom('');
    setTo('');
    setEditing(true);
  };

  const commitNumber = () => {
    setEditing(false);
    const n = num.trim();
    if (!n || n === seed) return;
    onAmend(amendBriefValue(brief, filter, n));
  };

  const commitDate = () => {
    setEditing(false);
    if (!from && !to) return;
    onAmend(amendBriefValue(brief, filter, { from, to }));
  };

  const remove = (e) => {
    e.stopPropagation();
    onAmend(amendBriefRemove(brief, filter));
  };

  if (editing && kind === 'number') {
    return (
      <span className="sf-chip sf-chip--editing">
        <input
          ref={inputRef}
          className="sf-chip-input"
          type="number"
          aria-label={`Edit ${filter.text}`}
          value={num}
          onChange={(e) => setNum(e.target.value)}
          onBlur={commitNumber}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitNumber(); }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
          }}
        />
        {filter.unit && <span className="sf-chip-unit">{filter.unit}</span>}
      </span>
    );
  }

  if (editing && kind === 'date') {
    return (
      <span className="sf-chip sf-chip--editing">
        <input
          ref={inputRef}
          className="sf-chip-date"
          type="date"
          aria-label={`${filter.text} from`}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitDate(); }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
          }}
        />
        <span className="sf-chip-unit">to</span>
        <input
          className="sf-chip-date"
          type="date"
          aria-label={`${filter.text} to`}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onBlur={commitDate}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitDate(); }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
          }}
        />
      </span>
    );
  }

  return (
    <span
      className={`sf-chip${kind ? ' sf-chip--editable' : ''}`}
      role={kind ? 'button' : 'listitem'}
      tabIndex={kind ? 0 : undefined}
      onClick={kind ? beginEdit : undefined}
      onKeyDown={kind ? (e) => { if (e.key === 'Enter') { e.preventDefault(); beginEdit(); } } : undefined}
      title={kind ? 'Click to edit' : undefined}
    >
      <span className="sf-chip-text">{filter.text}</span>
      <button
        className="sf-chip-x"
        type="button"
        onClick={remove}
        aria-label={`Remove ${filter.text}`}
      >
        <X size={12} strokeWidth={2} />
      </button>
    </span>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function SearchFilters({
  brief,
  filters,
  notes,
  roles,
  role = 0,
  loading = false,
  onAmend,
  onRoleChange,
}) {
  if (loading) {
    return (
      <div className="sf" aria-busy="true">
        <div className="sf-strip">
          <span className="sf-skeleton" />
          <span className="sf-skeleton" />
          <span className="sf-skeleton" />
        </div>
      </div>
    );
  }

  const list = Array.isArray(filters) ? filters : [];
  const noteList = Array.isArray(notes) ? notes.slice(0, 2) : [];
  const roleList = Array.isArray(roles) ? roles : [];

  if (list.length === 0 && noteList.length === 0 && roleList.length < 2) return null;

  return (
    <div className="sf">
      {roleList.length > 1 && (
        <div className="sf-roles" role="group" aria-label="Roles in this brief">
          {roleList.map((r, i) => {
            const index = Number.isInteger(r.index) ? r.index : i;
            const on = index === Number(role);
            return (
              <button
                key={index}
                type="button"
                className={`sf-role${on ? ' sf-role--on' : ''}`}
                aria-pressed={on}
                onClick={() => onRoleChange?.(index)}
              >
                {r.summary || r.label || `Role ${index + 1}`}
              </button>
            );
          })}
        </div>
      )}

      {list.length > 0 && (
        <div className="sf-strip" role="list">
          {list.map((f, i) => (
            <FilterChip
              key={f.id || `${f.field}-${i}`}
              filter={f}
              brief={brief}
              onAmend={onAmend}
            />
          ))}
        </div>
      )}

      {noteList.map((n, i) => (
        <p className="sf-note" key={i}>{n}</p>
      ))}
    </div>
  );
}
