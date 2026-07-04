import React from 'react';
import './FrameTaxonomy.css';

/** Uppercase review-state column label (PITS strip). */
export default function FrameReviewStateLabel({ children, className = '' }) {
  if (!children) return null;
  return (
    <span className={`frame-review-state crs-strip__label ${className}`.trim()}>
      {children}
    </span>
  );
}
