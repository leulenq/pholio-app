import React from 'react';

/**
 * The Pholio spark — the mark for an AI writing action.
 *
 * Three four-pointed concave stars: one carrying the weight, two smaller ones
 * off its shoulder. Drawn rather than pulled from an icon set so the concavity
 * matches Pholio's editorial line weight (thin waists, long points) instead of
 * Lucide's chunkier `Sparkles`, which reads as a toy beside Noto Serif Display.
 *
 * Filled, not stroked: at 18px a stroked star closes up into a blob.
 */
export default function PholioSpark({ size = 18, className = '', ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`pholio-spark ${className}`.trim()}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {/* Primary star — the concave waist is 28% of the radius. */}
      <path
        className="pholio-spark__major"
        d="M9.7 3.4 C10.9 8.2 12.6 9.9 17.4 11.1 C12.6 12.3 10.9 14 9.7 18.8 C8.5 14 6.8 12.3 2 11.1 C6.8 9.9 8.5 8.2 9.7 3.4 Z"
      />
      {/* Upper accent. */}
      <path
        className="pholio-spark__minor pholio-spark__minor--up"
        d="M18.6 1 C19.1 3 19.8 3.7 21.8 4.2 C19.8 4.7 19.1 5.4 18.6 7.4 C18.1 5.4 17.4 4.7 15.4 4.2 C17.4 3.7 18.1 3 18.6 1 Z"
      />
      {/* Lower accent. */}
      <path
        className="pholio-spark__minor pholio-spark__minor--down"
        d="M18.6 15.6 C19.1 17.6 19.8 18.3 21.8 18.8 C19.8 19.3 19.1 20 18.6 22 C18.1 20 17.4 19.3 15.4 18.8 C17.4 18.3 18.1 17.6 18.6 15.6 Z"
      />
    </svg>
  );
}
