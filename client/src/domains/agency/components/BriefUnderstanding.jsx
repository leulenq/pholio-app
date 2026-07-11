/**
 * BriefUnderstanding — launch-mode brief provenance + editable chip rack.
 *
 * Renders ONLY from the server discover_v2.understanding contract (LB-9): the
 * client lexicon never produces a constraint chip. Three parts, all within the
 * existing dark Discover visual language:
 *
 *   1. Provenance line  — the raw brief with the exact substrings that produced
 *      each constraint underlined (LB-4). span=null → no underline, which is the
 *      honest "we couldn't tie this to your words" signal.
 *   2. Hard chip rack   — every applied[] hard constraint, one scrollable row.
 *      Inline click-to-edit (numeric → number input + unit; date → native date
 *      inputs; Enter commits, Esc reverts; × removes). Edits are AUTHORITATIVE:
 *      they re-run the search with an amended brief (see discoverMatch).
 *   3. Disclosure       — "Reading your brief — N terms": soft aesthetic query +
 *      set-aside (compliance) terms, collapsed by default.
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import {
  chipFieldLabel,
  chipValueText,
  chipEditKind,
  chipEditUnit,
  chipEditValue,
  amendBriefValue,
  amendBriefRemove,
} from '../lib/discoverMatch';
import './BriefUnderstanding.css';

// ── provenance ────────────────────────────────────────────────────────────────
function ProvenanceBrief({ brief, applied }) {
  if (!brief) return null;
  const spans = (applied || [])
    .filter((a) => Array.isArray(a.span) && a.span.length === 2)
    .map((a) => ({ start: a.span[0], end: a.span[1], applied: a }))
    .sort((x, y) => x.start - y.start);

  const parts = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start < cursor) continue; // drop overlaps — first wins
    if (s.start > cursor) parts.push({ text: brief.slice(cursor, s.start), mark: false });
    parts.push({ text: brief.slice(s.start, s.end), mark: true, applied: s.applied });
    cursor = s.end;
  }
  if (cursor < brief.length) parts.push({ text: brief.slice(cursor), mark: false });

  return (
    <p className="bu-brief">
      {parts.map((p, i) =>
        p.mark ? (
          <span
            key={i}
            className="bu-brief-mark"
            title={`${chipFieldLabel(p.applied.field)}: ${chipValueText(p.applied) || '—'}`}
          >
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}

// ── one editable chip ─────────────────────────────────────────────────────────
function BriefChip({ applied, brief, onAmend }) {
  const kind = chipEditKind(applied.field);
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(chipEditValue(applied));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const needsCheck = applied.needs_confirmation === true;
  const label = chipFieldLabel(applied.field);
  const value = chipValueText(applied);

  const beginEdit = () => {
    if (!kind) return;
    setNum(chipEditValue(applied));
    setFrom('');
    setTo('');
    setEditing(true);
  };

  const commitNumber = () => {
    setEditing(false);
    const n = num.trim();
    if (!n || n === chipEditValue(applied)) return;
    onAmend(amendBriefValue(brief, applied, n));
  };

  const commitDate = () => {
    setEditing(false);
    if (!from && !to) return;
    onAmend(amendBriefValue(brief, applied, { from, to }));
  };

  const remove = (e) => {
    e.stopPropagation();
    onAmend(amendBriefRemove(brief, applied));
  };

  if (editing && kind === 'number') {
    const unit = chipEditUnit(applied.field);
    return (
      <span className="bu-chip bu-chip--editing">
        <span className="bu-chip-key">{label}</span>
        <input
          ref={inputRef}
          className="bu-chip-input"
          type="number"
          value={num}
          onChange={(e) => setNum(e.target.value)}
          onBlur={commitNumber}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitNumber(); }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
          }}
        />
        {unit && <span className="bu-chip-unit">{unit}</span>}
      </span>
    );
  }

  if (editing && kind === 'date') {
    return (
      <span className="bu-chip bu-chip--editing">
        <span className="bu-chip-key">{label}</span>
        <input
          ref={inputRef}
          className="bu-chip-date"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitDate(); }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
          }}
        />
        <span className="bu-chip-unit">–</span>
        <input
          className="bu-chip-date"
          type="date"
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
      className={`bu-chip${kind ? ' bu-chip--editable' : ''}${needsCheck ? ' bu-chip--check' : ''}`}
      onClick={kind ? beginEdit : undefined}
      role={kind ? 'button' : undefined}
      tabIndex={kind ? 0 : undefined}
      onKeyDown={kind ? (e) => { if (e.key === 'Enter') beginEdit(); } : undefined}
      title={needsCheck ? 'Interpretation — check me' : (kind ? 'Click to edit' : undefined)}
    >
      <span className="bu-chip-key">{label}</span>
      {value && <span className="bu-chip-val">{value}</span>}
      {needsCheck && <span className="bu-chip-flag"><Check size={11} strokeWidth={2} />check</span>}
      <button className="bu-chip-x" onClick={remove} aria-label={`Remove ${label}`} type="button">
        <X size={12} strokeWidth={2} />
      </button>
    </span>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function BriefUnderstanding({ brief, understanding, loading, onAmend }) {
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="bu" aria-busy="true">
        <div className="bu-skeleton bu-skeleton--brief" />
        <div className="bu-rack">
          <span className="bu-skeleton bu-skeleton--chip" />
          <span className="bu-skeleton bu-skeleton--chip" />
          <span className="bu-skeleton bu-skeleton--chip" />
        </div>
      </div>
    );
  }

  if (!understanding) return null;

  const applied = Array.isArray(understanding.applied) ? understanding.applied : [];
  const setAside = Array.isArray(understanding.set_aside) ? understanding.set_aside : [];
  const roles = Array.isArray(understanding.roles) ? understanding.roles : [];
  const softQuery = roles[0]?.soft_query?.trim() || '';
  const notice = understanding.multi_role_notice;

  const disclosureCount = (softQuery ? 1 : 0) + setAside.length;

  return (
    <div className="bu">
      {notice && (
        <p className="bu-notice">{notice.message}</p>
      )}

      <ProvenanceBrief brief={brief} applied={applied} />

      {applied.length > 0 && (
        <div className="bu-rack" role="list">
          {applied.map((a) => (
            <BriefChip
              key={`${a.field}-${JSON.stringify(a.value)}`}
              applied={a}
              brief={brief}
              onAmend={onAmend}
            />
          ))}
        </div>
      )}

      {disclosureCount > 0 && (
        <div className="bu-disclosure">
          <button
            type="button"
            className="bu-disclosure-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            Reading your brief — {disclosureCount} {disclosureCount === 1 ? 'term' : 'terms'}
            <span className={`bu-disclosure-caret${open ? ' bu-disclosure-caret--open' : ''}`}>›</span>
          </button>
          {open && (
            <div className="bu-disclosure-body">
              {softQuery && (
                <p className="bu-soft">
                  <span className="bu-soft-key">Aesthetic</span>
                  <span className="bu-soft-val">{softQuery}</span>
                </p>
              )}
              {setAside.map((s, i) => (
                <p className="bu-aside" key={i}>
                  <span className="bu-aside-term">{s.text}</span>
                  <span className="bu-aside-note">not used for filtering</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
