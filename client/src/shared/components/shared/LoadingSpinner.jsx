import React from 'react';
import './LoadingSpinner.css';

const SIZES = new Set(['sm', 'md', 'lg', 'xl']);

const DIMENSIONS = {
  sm: { size: 24, stroke: 3 },
  md: { size: 40, stroke: 4 },
  lg: { size: 56, stroke: 5 },
  xl: { size: 72, stroke: 6 },
};

/**
 * Pholio Gold Sweep Spinner.
 * Renders a thick version of Pholio's signature wordmark gold sweep gradient:
 * transparent → #C9A55A → transparent.
 */
export default function LoadingSpinner({ size = 'md', className = '', ...props }) {
  const resolvedSize = SIZES.has(size) ? size : 'md';
  const { size: dimension, stroke } = DIMENSIONS[resolvedSize];
  const radius = (dimension - stroke) / 2;
  const center = dimension / 2;
  const circumference = 2 * Math.PI * radius;
  const dashArray = `${circumference * 0.75} ${circumference * 0.25}`;

  return (
    <div
      className={`ph-spinner ph-spinner--${resolvedSize} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label="Loading"
      {...props}
    >
      <svg
        width={dimension}
        height={dimension}
        viewBox={`0 0 ${dimension} ${dimension}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="ph-spinner__svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ph-gold-sweep-linear" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#C9A55A" stopOpacity="0" />
            <stop offset="50%" stopColor="#C9A55A" stopOpacity="1" />
            <stop offset="100%" stopColor="#C9A55A" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke="rgba(201, 165, 90, 0.15)"
          strokeWidth={stroke}
          fill="none"
        />

        {/* Thick Gold Sweep Gradient Arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke="url(#ph-gold-sweep-linear)"
          strokeWidth={stroke}
          strokeDasharray={dashArray}
          strokeLinecap="round"
          fill="none"
          className="ph-spinner__sweep-circle"
        />
      </svg>
    </div>
  );
}
