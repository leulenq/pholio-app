import React from 'react';
import './dossier.css';

/**
 * The two structures every instrument on the dossier is built from.
 *
 * `Sheet`  — a titled region of the casting sheet. A heading and its content,
 *            never a nested card.
 * `Ledger` — a ruled key/value list. The whole surface reads as a ledger, so
 *            facts share one form: uppercase key on the left, value on the
 *            right, hairline between rows.
 */

export function Sheet({ title, aside, children, id, className = '', tone = 'paper' }) {
  return (
    <section id={id} className={`dx-sheet dx-sheet--${tone} ${className}`.trim()}>
      {(title || aside) && (
        <header className="dx-sheet__head">
          {title && <h2 className="dx-sheet__title">{title}</h2>}
          {aside && <div className="dx-sheet__aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Ledger({ children, columns = 1, className = '' }) {
  return (
    <dl className={`dx-ledger dx-ledger--${columns} ${className}`.trim()}>{children}</dl>
  );
}

/**
 * One ledger row. Renders nothing when there is no value — a dossier should
 * never show a column of em-dashes where an agency expects facts.
 */
export function Fact({ label, value, note, mono = false, tone }) {
  const empty =
    value == null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);
  if (empty) return null;
  return (
    <div className="dx-fact">
      <dt className="dx-fact__key">{label}</dt>
      <dd className={`dx-fact__val${mono ? ' dx-fact__val--mono' : ''}${tone ? ` dx-fact__val--${tone}` : ''}`}>
        {Array.isArray(value) ? value.join(' · ') : value}
        {note && <span className="dx-fact__note">{note}</span>}
      </dd>
    </div>
  );
}

/** A quiet line where an instrument has nothing to report. Never a card. */
export function Quiet({ children }) {
  return <p className="dx-quiet">{children}</p>;
}
