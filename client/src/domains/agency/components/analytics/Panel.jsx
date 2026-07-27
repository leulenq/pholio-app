import React, { useId, useState } from 'react';
import { Table2, LineChart } from 'lucide-react';

/**
 * The panel every chart lives in.
 *
 * Carries the four things a chart needs beyond its marks: a title that names
 * what is plotted, an optional reading of the headline number, a legend slot,
 * and the table-view twin. The twin is not optional decoration — the depth
 * ramp's lightest step sits below the 3:1 mark floor, so a WCAG-clean way to
 * read every value has to exist.
 */
export function Panel({
  title,
  reading,
  note,
  span = 12,
  tall = false,
  legend,
  table,
  empty,
  children,
}) {
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  // With nothing observed there is no chart to key and no table to read, so
  // the panel drops its chrome and carries only the sentence that says what
  // will make it appear.
  const hasTable = Boolean(table) && !empty;

  return (
    <section
      className={`sv-panel${tall ? ' sv-panel--tall' : ''}`}
      style={{ '--sv-span': span }}
      aria-labelledby={titleId}
    >
      <header className="sv-panel-head">
        <div className="sv-panel-heading">
          <h3 className="sv-panel-title" id={titleId}>{title}</h3>
          {reading ? <p className="sv-panel-reading">{reading}</p> : null}
        </div>
        {hasTable ? (
          <button
            type="button"
            className="sv-panel-toggle"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
          >
            {showTable ? <LineChart size={13} aria-hidden="true" /> : <Table2 size={13} aria-hidden="true" />}
            <span>{showTable ? 'Chart' : 'Table'}</span>
          </button>
        ) : null}
      </header>

      {legend && !showTable && !empty ? <div className="sv-legend">{legend}</div> : null}

      <div className="sv-panel-body">
        {empty ? (
          <p className="sv-panel-empty">{empty}</p>
        ) : showTable ? (
          <div className="sv-table-wrap">{table}</div>
        ) : (
          children
        )}
      </div>

      {note && !empty ? <p className="sv-panel-note">{note}</p> : null}
    </section>
  );
}

/** Identity key: a coloured mark beside text ink — never coloured text. */
export function LegendKey({ color, label, shape = 'swatch' }) {
  return (
    <span className="sv-legend-key">
      <span
        className={`sv-legend-mark sv-legend-mark--${shape}`}
        style={{ background: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

/** Table twin shared by every panel. */
export function VizTable({ columns, rows, caption }) {
  return (
    <table className="sv-table">
      {caption ? <caption className="sv-table-caption">{caption}</caption> : null}
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={`${row[0]}-${i}`}>
            {row.map((cell, j) =>
              j === 0 ? (
                <th key={j} scope="row">{cell}</th>
              ) : (
                <td key={j}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default Panel;
