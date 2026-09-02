/**
 * BriefLine — what the search understood, written as one sentence.
 *
 * The booker asked why a brief has to become a rack of boxes. It does not. What
 * a rack of boxes was carrying is two obligations, and only two:
 *
 *   a. a misread has to be visible somewhere;
 *   b. loosening a single requirement has to take one gesture, not a retype.
 *
 * Both survive as running text. "Showing Women · 5'9" and up · New York" states
 * the reading in the booker's own vocabulary; hovering or tabbing to a phrase
 * underlines it in gold and offers the × that drops it; a numeric phrase opens
 * an inline field on the same baseline. Nothing is boxed, nothing is chromed,
 * and the line reads as a sentence rather than as a query debugger.
 *
 * Every value here is written by the server (`discover_v2.filters[]`). Removals
 * and edits rewrite the brief text and re-run it, so the words in the bar and
 * the filters applied can never diverge.
 */

import React, { useState, useRef, useEffect, Fragment } from 'react';
import { X } from 'lucide-react';
import { amendBriefValue, amendBriefRemove } from '../lib/discoverMatch';
import './BriefLine.css';

/** A thin middot. The space around it is set in CSS, because the × that each
 *  phrase reserves sits between the phrase and the separator: the reservation
 *  has to be answered on the other side or the line spaces unevenly. */
const SEP = '·';

// ── one phrase ────────────────────────────────────────────────────────────────
function Phrase({ filter, brief, onAmend }) {
  const kind = filter.editable === 'number' || filter.editable === 'date' ? filter.editable : null;
  const seed = filter.edit_value == null ? '' : String(filter.edit_value);
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(seed);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const inputRef = useRef(null);
  // Escape unmounts the field, which fires blur; without this the revert would
  // immediately be undone by the blur commit.
  const revertedRef = useRef(false);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const beginEdit = () => {
    if (!kind) return;
    setNum(seed);
    setFrom('');
    setTo('');
    revertedRef.current = false;
    setEditing(true);
  };

  const revert = () => {
    revertedRef.current = true;
    setEditing(false);
  };

  const commitNumber = () => {
    if (revertedRef.current) return;
    setEditing(false);
    const n = num.trim();
    if (!n || n === seed) return;
    onAmend(amendBriefValue(brief, filter, n));
  };

  const commitDate = () => {
    if (revertedRef.current) return;
    setEditing(false);
    if (!from && !to) return;
    onAmend(amendBriefValue(brief, filter, { from, to }));
  };

  const remove = () => onAmend(amendBriefRemove(brief, filter));

  if (editing && kind === 'number') {
    return (
      <span className="bl-phrase bl-phrase--editing">
        <input
          ref={inputRef}
          className="bl-input"
          type="number"
          aria-label={`Edit ${filter.text}`}
          value={num}
          onChange={(e) => setNum(e.target.value)}
          onBlur={commitNumber}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitNumber(); }
            if (e.key === 'Escape') { e.preventDefault(); revert(); }
          }}
        />
        {filter.unit && <span className="bl-unit">{filter.unit}</span>}
      </span>
    );
  }

  if (editing && kind === 'date') {
    return (
      <span className="bl-phrase bl-phrase--editing">
        <input
          ref={inputRef}
          className="bl-date"
          type="date"
          aria-label={`${filter.text} from`}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitDate(); }
            if (e.key === 'Escape') { e.preventDefault(); revert(); }
          }}
        />
        <span className="bl-unit">to</span>
        <input
          className="bl-date"
          type="date"
          aria-label={`${filter.text} to`}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onBlur={commitDate}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitDate(); }
            if (e.key === 'Escape') { e.preventDefault(); revert(); }
          }}
        />
      </span>
    );
  }

  return (
    <span className={`bl-phrase${kind ? ' bl-phrase--editable' : ''}`}>
      <button
        type="button"
        className="bl-text"
        onClick={kind ? beginEdit : undefined}
        aria-label={kind ? `Edit ${filter.text}` : filter.text}
      >
        {filter.text}
      </button>
      <button
        type="button"
        className="bl-x"
        onClick={remove}
        aria-label={`Remove ${filter.text}`}
      >
        <X size={12} strokeWidth={2} aria-hidden="true" />
      </button>
    </span>
  );
}

// ── the line ──────────────────────────────────────────────────────────────────
export default function BriefLine({
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
      <div className="bl" aria-busy="true">
        <span className="bl-shimmer" aria-hidden="true" />
      </div>
    );
  }

  const list = Array.isArray(filters) ? filters : [];
  const noteList = Array.isArray(notes) ? notes.slice(0, 2) : [];
  const roleList = Array.isArray(roles) ? roles : [];

  if (list.length === 0 && noteList.length === 0 && roleList.length < 2) return null;

  return (
    <div className="bl">
      {roleList.length > 1 && (
        <p className="bl-roles" role="group" aria-label="Roles in this brief">
          {roleList.map((r, i) => {
            const index = Number.isInteger(r.index) ? r.index : i;
            const on = index === Number(role);
            return (
              <Fragment key={index}>
                {i > 0 && <span className="bl-sep" aria-hidden="true">{SEP}</span>}
                <button
                  type="button"
                  className={`bl-role${on ? ' bl-role--on' : ''}`}
                  aria-pressed={on}
                  onClick={() => onRoleChange?.(index)}
                >
                  {r.summary || r.label || `Role ${index + 1}`}
                </button>
              </Fragment>
            );
          })}
        </p>
      )}

      {list.length > 0 && (
        <p className="bl-line">
          <span className="bl-lead">Showing</span>{' '}
          {list.map((f, i) => (
            <Fragment key={f.id || `${f.field}-${i}`}>
              {i > 0 && <span className="bl-sep" aria-hidden="true">{SEP}</span>}
              <Phrase filter={f} brief={brief} onAmend={onAmend} />
            </Fragment>
          ))}
        </p>
      )}

      {noteList.map((n, i) => (
        <p className="bl-note" key={i}>{n}</p>
      ))}
    </div>
  );
}
