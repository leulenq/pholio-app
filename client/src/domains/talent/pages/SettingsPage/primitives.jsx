import React from 'react';

/* ------------------------------------------------------------------ *
 * Settings ledger primitives.
 *
 * These lived inside `index.jsx` while every movement did too. They moved
 * here the moment a movement earned its own file, so a panel can be built
 * out of the same parts without importing the page that renders it.
 * ------------------------------------------------------------------ */

export function Movement({ id, title, lede, children }) {
  return (
    <article className="set-movement" id={`movement-${id}`} aria-labelledby={`${id}-title`}>
      <header className="set-movement__head">
        <h2 className="set-movement__title" id={`${id}-title`}>{title}</h2>
        {lede && <p className="set-movement__lede">{lede}</p>}
      </header>
      {children}
    </article>
  );
}

export function Row({ title, description, children, muted = false }) {
  return (
    <div className={`set-row${muted ? ' set-row--muted' : ''}`}>
      <div className="set-row__copy">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <div className="set-row__control">{children}</div>
    </div>
  );
}

export function SkeletonRows({ count = 3 }) {
  return (
    <div className="set-skeleton" aria-label="Loading" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => <span key={i} />)}
    </div>
  );
}
