import React from 'react';
import './AgencySkeleton.css';

/**
 * Skeleton loading primitives for the agency surface.
 *
 * Shimmer is a 1.2s opacity pulse (NOT a moving gradient sweep). Under
 * `prefers-reduced-motion` the bones become a flat static tint.
 *
 * Compose these to mirror the real layout of the page being loaded; a page's
 * first-load state should look like its content, not a centered spinner.
 */

function Bone({ className = '', style }) {
  return <span className={`ag-sk ${className}`.trim()} style={style} aria-hidden="true" />;
}

/** A 56px (or 44px compact) list row: avatar + two lines + trailing status. */
export function SkeletonRow({ count = 1, compact = false }) {
  return (
    <div className="ag-sk-rows" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`ag-sk-row${compact ? ' ag-sk-row--compact' : ''}`}>
          <Bone className="ag-sk-avatar" />
          <div className="ag-sk-row-lines">
            <Bone className="ag-sk-line ag-sk-line--60" />
            <Bone className="ag-sk-line ag-sk-line--40" />
          </div>
          <Bone className="ag-sk-line ag-sk-line--status" />
        </div>
      ))}
    </div>
  );
}

/** A photo-led card: 3:4 figure + name line + meta line. */
export function SkeletonCard({ count = 1 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="ag-sk-card" role="status" aria-busy="true" aria-label="Loading">
          <Bone className="ag-sk-figure" />
          <div className="ag-sk-card-lines">
            <Bone className="ag-sk-line ag-sk-line--70" />
            <Bone className="ag-sk-line ag-sk-line--45" />
          </div>
        </div>
      ))}
    </>
  );
}

/** A standalone 3:4 photo figure. */
export function SkeletonFigure({ className = '', style }) {
  return <Bone className={`ag-sk-figure ${className}`.trim()} style={style} />;
}

/** The ledger stat strip: N figure + label pairs with hairline separators. */
export function SkeletonStrip({ count = 4 }) {
  return (
    <div className="ag-sk-strip" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="ag-sk-strip-cell">
          <Bone className="ag-sk-line ag-sk-strip-figure" />
          <Bone className="ag-sk-line ag-sk-strip-label" />
        </div>
      ))}
    </div>
  );
}

/**
 * AgencySkeleton — single entry point that dispatches to a primitive by
 * `variant`. Convenience for simple call sites; import the named pieces
 * directly for finer composition.
 *
 * @param {'row'|'card'|'figure'|'strip'} [variant='row']
 */
export function AgencySkeleton({ variant = 'row', ...props }) {
  switch (variant) {
    case 'card':
      return <SkeletonCard {...props} />;
    case 'figure':
      return <SkeletonFigure {...props} />;
    case 'strip':
      return <SkeletonStrip {...props} />;
    case 'row':
    default:
      return <SkeletonRow {...props} />;
  }
}

export default AgencySkeleton;
