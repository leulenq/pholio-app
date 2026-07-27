import React from 'react';

/** Standard tooltip contents: a heading and a list of keyed values. */
export function TipRows({ title, subtitle, rows }) {
  return (
    <>
      <span className="sv-tip-title">{title}</span>
      {subtitle ? <span className="sv-tip-sub">{subtitle}</span> : null}
      {rows?.length ? (
        <span className="sv-tip-rows">
          {rows.map((row) => (
            <span className="sv-tip-row" key={row.label}>
              {row.color ? (
                <span className="sv-tip-mark" style={{ background: row.color }} aria-hidden="true" />
              ) : null}
              <span className="sv-tip-label">{row.label}</span>
              <span className="sv-tip-value">{row.value}</span>
            </span>
          ))}
        </span>
      ) : null}
    </>
  );
}

export default TipRows;
