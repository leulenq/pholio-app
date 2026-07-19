import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Check, ArrowUpRight } from 'lucide-react';
import './BoardSelect.css';

// Stage → mix-strip color, matching the Overview funnel's vocabulary.
const STAGE_COLORS = [
  { test: (s) => s === 'submitted' || s === 'pending', color: '#2D2A26' },
  { test: (s) => s === 'shortlisted' || s === 'requested_more' || s === 'meeting_requested', color: '#C9A55A' },
  { test: (s) => s === 'development', color: '#8A7A55' },
  { test: (s) => s === 'accepted' || s === 'represented' || s === 'booked', color: '#050505' },
  { test: (s) => s === 'declined' || s === 'passed' || s === 'archived', color: '#C8C2BA' },
];

function stageMix(board) {
  const buckets = new Map();
  (board.pipeline_counts || []).forEach(({ status, count }) => {
    const key = String(status || '').toLowerCase();
    const bucket = STAGE_COLORS.find((b) => b.test(key));
    if (!bucket) return;
    buckets.set(bucket.color, (buckets.get(bucket.color) || 0) + (Number(count) || 0));
  });
  const total = [...buckets.values()].reduce((s, n) => s + n, 0);
  if (!total) return null;
  return [...buckets.entries()].map(([color, count]) => ({ color, pct: (count / total) * 100 }));
}

function closesLabel(closesAt) {
  if (!closesAt) return null;
  const d = new Date(closesAt);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: 'Closed', tone: 'mute' };
  if (days === 0) return { text: 'Closes today', tone: 'soon' };
  if (days === 1) return { text: 'Closes tomorrow', tone: 'soon' };
  if (days <= 14) return { text: `Closes in ${days}d`, tone: days <= 3 ? 'soon' : 'calm' };
  return { text: `Closes ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, tone: 'calm' };
}

/**
 * BoardSelect — the review scope, as an editorial control.
 *
 * A quiet paper trigger opens a boards panel: each board reads like a row
 * from the casting ledger — name, client, where it stands, closing pressure,
 * and a thin stage-mix strip (the Overview funnel's vocabulary at row scale).
 */
export default function BoardSelect({ boards = [], value = null, onChange, totalAll = 0 }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const panelRef = useRef(null);

  const activeBoards = useMemo(() => boards.filter((b) => b.is_active !== false), [boards]);
  const current = activeBoards.find((b) => b.id === value) || null;

  const close = useCallback(() => setOpen(false), []);

  // Click-away + Escape (capture, so the page's global Escape stays untouched).
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const options = [...(panelRef.current?.querySelectorAll('.bsel-option') || [])];
        if (!options.length) return;
        e.preventDefault();
        e.stopPropagation();
        const i = options.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown'
          ? options[Math.min(options.length - 1, i + 1)]
          : options[Math.max(0, i - 1)];
        next?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, close]);

  const pick = (id) => {
    onChange(id);
    close();
  };

  return (
    <div className={`bsel${open ? ' bsel--open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="bsel-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Review scope"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="bsel-trigger-name">{current ? current.name : 'All submissions'}</span>
        <span className="bsel-trigger-count">{current ? (current.application_count || 0) : totalAll}</span>
        <ChevronDown size={14} className="bsel-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="bsel-panel" role="listbox" aria-label="Boards" ref={panelRef}>
          <button
            type="button"
            role="option"
            aria-selected={value == null}
            className={`bsel-option bsel-option--all${value == null ? ' is-on' : ''}`}
            onClick={() => pick(null)}
          >
            <span className="bsel-opt-main">
              <span className="bsel-opt-name">All submissions</span>
              <span className="bsel-opt-sub">Every open application, across boards</span>
            </span>
            <span className="bsel-opt-side">
              <span className="bsel-opt-count">{totalAll}</span>
              {value == null && <Check size={14} className="bsel-opt-check" aria-hidden="true" />}
            </span>
          </button>

          {activeBoards.length > 0 && <div className="bsel-key">Active boards</div>}

          <div className="bsel-scroll">
            {activeBoards.map((b) => {
              const closes = closesLabel(b.closes_at);
              const mix = stageMix(b);
              const waiting = b.submitted_count || 0;
              const on = value === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`bsel-option${on ? ' is-on' : ''}`}
                  onClick={() => pick(b.id)}
                >
                  <span className="bsel-opt-main">
                    <span className="bsel-opt-name">{b.name || 'Untitled Board'}</span>
                    <span className="bsel-opt-sub">
                      {b.client_name ? `${b.client_name} · ` : ''}
                      {b.application_count || 0} in pipeline
                      {waiting ? ` · ${waiting} awaiting review` : ''}
                    </span>
                    {mix && (
                      <span className="bsel-opt-mix" aria-hidden="true">
                        {mix.map((seg) => (
                          <i key={seg.color} style={{ width: `${seg.pct}%`, background: seg.color }} />
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="bsel-opt-side">
                    {closes && <span className={`bsel-opt-closes bsel-opt-closes--${closes.tone}`}>{closes.text}</span>}
                    {on && <Check size={14} className="bsel-opt-check" aria-hidden="true" />}
                  </span>
                </button>
              );
            })}
          </div>

          <Link to="/dashboard/agency/signing" className="bsel-manage" onClick={close}>
            Manage boards
            <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
