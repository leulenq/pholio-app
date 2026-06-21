import React from 'react';

const GOLD = '#C9A55A';
const INK = '#050505';

/**
 * Pholio secondary mark — the serif "P." icon.
 *
 * Works at any size from 16 px (favicon-equivalent) up to 512 px+.
 * At small sizes the Didone high-contrast counter fades to sub-pixel and the
 * bowl reads as a solid D-shape, which is still a clean "P" silhouette.
 *
 * Props:
 *   size     — rendered px dimension (square). Default 32.
 *   variant  — 'dark' (gold on ink) | 'light' (ink on gold) | 'transparent' (no bg).
 *   shape    — 'rounded' | 'circle' | 'square'. Controls background corner radius.
 *   period   — whether to show the period dot. Default true.
 */
export default function PholioMark({
  size = 32,
  variant = 'dark',
  shape = 'rounded',
  period = true,
  className,
  style,
  ...props
}) {
  const bg = variant === 'dark' ? INK : variant === 'light' ? GOLD : 'none';
  const fg = variant === 'light' ? INK : GOLD;
  const rx = shape === 'circle' ? 50 : shape === 'square' ? 0 : 22;
  const showBg = variant !== 'transparent';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label="Pholio"
      className={className}
      style={style}
      {...props}
    >
      {showBg && <rect width="100" height="100" rx={rx} fill={bg} />}

      {/* Stem body */}
      <rect x="20" y="14" width="14" height="68" fill={fg} />

      {/* Top-left cap serif */}
      <rect x="14" y="14" width="6" height="5" fill={fg} />

      {/* Bottom bilateral serif */}
      <rect x="14" y="77" width="25" height="5" fill={fg} />

      {/*
        Bowl — outer D-shape with Didone high-contrast counter via evenodd.
        Outer bowl max x ≈ 67. Counter (cx 44, rx 10, ry 15) max x ≈ 54.
        Right wall ≈ 13 px thick; top/bottom walls ≈ 4 px thin → 3.25:1 contrast.
        In the transparent variant the counter becomes transparent (showBg = false
        means no rect underneath), so evenodd correctly punches through to whatever
        sits behind the SVG.
      */}
      <path
        fill={fg}
        fillRule="evenodd"
        d="M 34 14 C 78 14 78 52 34 52 L 34 14 Z
           M 54 33 A 10 15 0 0 0 34 33 A 10 15 0 0 0 54 33 Z"
      />

      {/* Period mark — the brand signature */}
      {period && <circle cx="79" cy="81" r="6" fill={fg} />}
    </svg>
  );
}
