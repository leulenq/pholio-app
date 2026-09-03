import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Figure, Place, Freshness, Notation } from '../../components/meta';
import { ageFigure, heightFigure } from '../../components/meta/metaFormat';
import { candidateId, ageNotation, heightCmOf, tagLabels, hideBrokenImage } from './boardModel';

/**
 * The Ledger — the same set, read as a table.
 *
 * The wall answers "who is on this board"; the ledger answers "who has been
 * waiting longest, who is missing digitals, who has notes on them". Same
 * selection, same order by default, one keystroke apart (V) so a booker never
 * has to choose a view before knowing which question they have.
 *
 * Measurements never appear here — a minor's are withheld server-side and a
 * table that prints them for everyone else teaches the wrong habit. Height
 * only, per the spec.
 */

const COLUMNS = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'age', label: 'Age', sortable: true, numeric: true },
  { key: 'height', label: 'Height', sortable: true, numeric: true },
  { key: 'city', label: 'City', sortable: true },
  { key: 'standing', label: 'Standing', sortable: true },
  { key: 'waiting', label: 'Waiting', sortable: true, numeric: true },
  { key: 'digitals', label: 'Digitals', sortable: false },
  { key: 'notes', label: 'Notes', sortable: false, numeric: true },
  /* The board's own tags, as words. Plain text and never sortable: a tag is a
     handle a booker put on someone, not a rank. */
  { key: 'tags', label: 'Tags', sortable: false },
];

function stampOf(candidate) {
  const raw = candidate?.statusChangedAt || candidate?.submittedAt || candidate?.created_at;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

/**
 * The date the current digitals set was captured.
 *
 * The server ships the dossier engine's shape verbatim
 * (src/domains/talent/services/digitals-freshness.js):
 * `{ state, hasDigitals, sets, currentSet: { capturedOn, ... } }`. A candidate
 * with no digitals at all prints nothing rather than a stale-looking blank
 * date — same reading the Review Room takes.
 */
function digitalsValue(candidate) {
  const f = candidate?.digitalsFreshness;
  if (!f || !f.hasDigitals) return null;
  return f.currentSet?.capturedOn || null;
}

function Row({
  candidate, standing, selected, focused, busy, onSelect, onOpen, onFocus,
}) {
  const ref = useRef(null);
  const id = candidateId(candidate);

  useEffect(() => {
    if (focused && ref.current && document.activeElement !== ref.current) {
      ref.current.focus({ preventScroll: true });
      ref.current.scrollIntoView({ block: 'nearest' });
    }
  }, [focused]);

  const age = ageFigure(candidate);
  const height = heightFigure(heightCmOf(candidate));
  const photo = candidate.headshot || candidate.avatar || null;
  const notation = ageNotation(candidate);
  const digitals = digitalsValue(candidate);
  const notes = Number(candidate.notesCount) || 0;
  const tags = tagLabels(candidate);

  return (
    <tr
      ref={ref}
      className={`sb-row${selected ? ' is-selected' : ''}${busy ? ' is-busy' : ''}`}
      role="row"
      aria-selected={selected}
      tabIndex={focused ? 0 : -1}
      data-id={id}
      onFocus={() => onFocus(id)}
      onClick={(e) => onSelect(id, { additive: e.metaKey || e.ctrlKey, range: e.shiftKey })}
      onDoubleClick={() => onOpen(id)}
    >
      <td className="sb-cell sb-cell--face">
        {photo
          ? <img className="sb-face" src={photo} alt="" loading="lazy" onError={hideBrokenImage} />
          : <span className="sb-face sb-face--empty" aria-hidden="true" />}
      </td>
      <td className="sb-cell sb-cell--name">
        <span className="sb-row-name">{candidate.name}</span>
        {notation && <Notation size="sm" className="sb-row-minor">{notation}</Notation>}
      </td>
      <td className="sb-cell sb-cell--fig">
        {age && <Figure inline size="sm" value={age.value} unit={age.unit} />}
      </td>
      <td className="sb-cell sb-cell--fig">
        {height && <Figure inline size="sm" value={height.value} unit={height.unit} />}
      </td>
      <td className="sb-cell">
        {(candidate.city || candidate.location)
          && <Place size="sm" value={candidate.city || candidate.location} />}
      </td>
      {/* Standing carries the words, Waiting carries the mono figure. The
          two are split so the row reads as one statement while both stay
          independently sortable. */}
      <td className="sb-cell sb-cell--standing">{standing.text}</td>
      <td className="sb-cell sb-cell--fig">
        {standing.since && <span className="sb-since">{standing.since}</span>}
      </td>
      <td className="sb-cell">{digitals ? <Freshness size="sm" value={digitals} /> : null}</td>
      <td className="sb-cell sb-cell--fig">
        {notes > 0 && <Figure inline size="sm" value={String(notes)} />}
      </td>
      <td className="sb-cell sb-cell--tags">
        {tags.shown.length > 0 && (
          <span className="sb-tags">
            {tags.shown.join(' · ')}
            {tags.extra > 0 && ` · +${tags.extra}`}
          </span>
        )}
      </td>
    </tr>
  );
}

export default function Ledger({
  candidates, standingFor, selection, busyIds, onSelect, onOpen,
}) {
  const [sort, setSort] = useState(null); // { key, dir: 'asc'|'desc' }

  const rows = useMemo(() => {
    if (!sort) return candidates;
    const { key, dir } = sort;
    const sign = dir === 'desc' ? -1 : 1;
    const value = (c) => {
      switch (key) {
        case 'name': return String(c.name || '').toLowerCase();
        case 'age': return Number(ageFigure(c)?.value) || 0;
        case 'height': return heightCmOf(c) || 0;
        case 'city': return String(c.city || c.location || '').toLowerCase();
        case 'standing': return standingFor(c).text;
        case 'waiting': return stampOf(c);
        default: return 0;
      }
    };
    return [...candidates].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (av < bv) return -1 * sign;
      if (av > bv) return 1 * sign;
      return 0;
    });
  }, [candidates, sort, standingFor]);

  const toggleSort = (key) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  return (
    <div className="sb-ledger">
      <table className="sb-table">
        <thead>
          <tr>
            <th className="sb-th sb-th--face" scope="col"><span className="sb-sr">Face</span></th>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`sb-th${col.numeric ? ' sb-th--fig' : ''}`}
                aria-sort={
                  sort?.key === col.key
                    ? (sort.dir === 'asc' ? 'ascending' : 'descending')
                    : 'none'
                }
              >
                {col.sortable ? (
                  <button type="button" className="sb-sort" onClick={() => toggleSort(col.key)}>
                    {col.label}
                  </button>
                ) : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((candidate) => {
            const id = candidateId(candidate);
            return (
              <Row
                key={id}
                candidate={candidate}
                standing={standingFor(candidate)}
                selected={selection.isSelected(id)}
                focused={selection.focusedId === id}
                busy={busyIds.has(id)}
                onSelect={onSelect}
                onOpen={onOpen}
                onFocus={selection.setFocused}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
