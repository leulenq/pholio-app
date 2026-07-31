import React from 'react';

/**
 * Chart wrapper.
 *
 * There is deliberately no "values" table toggle here. Talent are not auditing a
 * dataset — they want the answer — and a table per chart was chrome they would
 * never open. Accessibility is carried instead by the thing that serves both
 * audiences: every mark on this page is directly labelled with its own number
 * in the plot, plus an `aria-label` on the figure and a `<title>` on segments.
 * No value on Intel is reachable only by hovering, and none is encoded by
 * colour alone.
 */
export function Figure({ caption, children, className = '' }) {
  return (
    <figure className={`iv-figure ${className}`.trim()}>
      <div className="iv-figure-plot">{children}</div>
      {caption ? <figcaption className="iv-figure-caption">{caption}</figcaption> : null}
    </figure>
  );
}

/**
 * Hover/focus tooltip anchored in the plot. Positioned as a percentage so it
 * tracks the mark at any width, and flipped near the edges so it never runs off
 * the card.
 */
export function Tooltip({ xPct, children }) {
  const side = xPct > 68 ? 'end' : xPct < 32 ? 'start' : 'mid';
  return (
    <div
      className={`iv-tip iv-tip--${side}`}
      style={{ left: `${Math.min(100, Math.max(0, xPct))}%` }}
      role="status"
    >
      {children}
    </div>
  );
}
