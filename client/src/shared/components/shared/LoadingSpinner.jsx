import React from 'react';
import './LoadingSpinner.css';

/**
 * Pholio Gold Sweep Loader — the wordmark's gold swish, closed into an orbit.
 *
 * The swish is the 1px hairline that sits under the PHOLIO wordmark:
 * `linear-gradient(to right, transparent, var(--app-gold), transparent)`
 * (see `.apply-workspace-top::after` in ApplyExperience.css, and the header
 * band on the marketing site). This loader is that exact rule bent into a
 * circle — nothing added, nothing thickened:
 *
 *  - The full hairline ring is the *rule* at rest, held at low opacity.
 *  - The bright arc is the *sweep* — the same transparent → gold → transparent
 *    ramp, laid along the arc rather than along a straight line.
 *  - It travels. That is the whole idea: the swish doesn't spin, it sweeps.
 *
 * Two things keep it from reading as a generic spinner:
 *
 *  1. Weight. Fine, but deliberately not a hairline: 1.5–2.5px, scaled off the
 *     box. Enough to carry gold at a glance, still nowhere near the
 *     tenth-of-a-diameter band that reads as a progress meter.
 *  2. Cadence. Two nested rotations run at the same period — a constant turn
 *     plus a gentle ±16° eased oscillation. Their sum is a sweep that gathers
 *     speed and settles, and never stalls or reverses. Constant-velocity
 *     rotation is what makes a loader read as machinery.
 *
 * No glow, no pulse, no shimmer. Motion is the only ornament.
 *
 * Props:
 *   size   — 'sm' | 'md' | 'lg' | 'xl' (24 / 40 / 56 / 72 px). Default 'md'.
 *   color  — sweep colour. Defaults to brand gold; the whole mark is drawn in
 *            `currentColor`, so a CSS `color` on the element works too.
 *   label  — accessible name announced to assistive tech. Default 'Loading'.
 */

/** Rendered box, in px, per named size. */
const SIZES = { sm: 24, md: 40, lg: 56, xl: 72 };

/**
 * Degrees of arc the sweep occupies. Must stay under 180: past a half-turn the
 * chord projection below stops being monotonic and the gradient stops would
 * run backwards.
 */
const SPAN = 150;

/**
 * The ramp along the sweep, as `[position, opacity]` control points. Position
 * is normalised arc length: 0 is the trailing tip, 1 the leading one — and the
 * ring turns clockwise, so 1 is the edge that arrives first.
 *
 * This is the wordmark's rule, not a comet: transparent → gold → transparent,
 * tapering to nothing at *both* tips. The leading edge in particular has to
 * fade out — cutting it off at strength, even behind a round linecap, turns
 * the sweep into a dash and stops it reading as the rule under the wordmark.
 *
 * What it is not is symmetric. The peak sits at 0.88, close to the head, so
 * the gold gathers into a short bright entry and draws out into a long dim
 * tail behind it. That is where the sweep gets a legible *start*: the same
 * fade the rule has, just compressed at the front and stretched at the back.
 */
const RAMP = [
  [0, 0],
  [0.4, 0.2],
  [0.7, 0.58],
  [0.88, 1],
  [1, 0],
];

/** Gradient stops used to linearise the ramp along the arc. */
const STOP_COUNT = 15;

/** Opacity of the resting rule the sweep travels through. */
const TRACK_OPACITY = 0.18;

/** Arc position of the ramp's brightest point — the head. */
const PEAK_T = RAMP.reduce((best, point) => (point[1] > best[1] ? point : best))[0];

/** The ramp above, sampled at an arbitrary point along the arc. */
function rampAt(t) {
  for (let i = 1; i < RAMP.length; i += 1) {
    const [t0, a0] = RAMP[i - 1];
    const [t1, a1] = RAMP[i];
    if (t <= t1) return a0 + ((a1 - a0) * (t - t0)) / (t1 - t0);
  }
  return RAMP[RAMP.length - 1][1];
}

const round = (n) => Math.round(n * 1000) / 1000;

/** Stroke weight, nudged up with the box so large loaders stay in proportion. */
function strokeFor(dimension) {
  if (dimension <= 28) return 1.5;
  if (dimension <= 48) return 2;
  if (dimension <= 64) return 2.25;
  return 2.5;
}

/**
 * Geometry for the sweep: the arc path, plus the gradient that paints it.
 *
 * The gradient runs along the chord between the arc's two endpoints, so a
 * point at angle θ from the arc's midpoint lands at `sin θ / sin(SPAN/2)` on
 * that axis — bunched at the ends, stretched in the middle. Stops are placed
 * at those projected positions with evenly-spaced opacities, which undoes the
 * distortion and gives a ramp that is linear in *arc length*: the straight
 * swish, faithfully wrapped.
 */
function buildSweep(dimension, stroke) {
  const c = dimension / 2;
  const r = (dimension - stroke) / 2;
  const half = ((SPAN / 2) * Math.PI) / 180;
  // Rotated so the ramp's brightest point — not the arc's midpoint — lands at
  // 12 o'clock, which is where a reduced-motion render comes to rest. Anchor
  // the midpoint instead and reshaping the ramp silently drags the still frame
  // off top-centre.
  const bisector = -Math.PI / 2 - (PEAK_T - 0.5) * 2 * half;
  const at = (a) => [
    round(c + r * Math.cos(bisector + a)),
    round(c + r * Math.sin(bisector + a)),
  ];

  const [x1, y1] = at(-half);
  const [x2, y2] = at(half);

  const stops = Array.from({ length: STOP_COUNT }, (_, i) => {
    const t = i / (STOP_COUNT - 1);
    return {
      offset: round((Math.sin((t - 0.5) * 2 * half) / Math.sin(half) + 1) / 2),
      opacity: round(rampAt(t)),
    };
  });

  return {
    // SPAN < 180, so large-arc-flag is 0; sweep-flag 1 draws it clockwise.
    d: `M ${x1} ${y1} A ${round(r)} ${round(r)} 0 0 1 ${x2} ${y2}`,
    r: round(r),
    c: round(c),
    x1,
    y1,
    x2,
    y2,
    stops,
  };
}

export default function LoadingSpinner({
  size = 'md',
  color,
  label = 'Loading',
  className = '',
  ...props
}) {
  const resolved = SIZES[size] ? size : 'md';
  const dimension = SIZES[resolved];
  const stroke = strokeFor(dimension);
  const { d, r, c, x1, y1, x2, y2, stops } = buildSweep(dimension, stroke);

  // Geometry is a pure function of the box, so instances of the same size share
  // an identical gradient. Keying the id off the box instead of a random value
  // keeps the markup stable across renders (and server/client), and any
  // duplicate id resolves to a definition identical to the one it shadows.
  const gradientId = `ph-spinner-sweep-${dimension}`;

  return (
    <div
      className={`ph-spinner ph-spinner--${resolved} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={label}
      style={color ? { color } : undefined}
      {...props}
    >
      <span className="ph-spinner__orbit">
        <span className="ph-spinner__cadence">
          <svg
            className="ph-spinner__svg"
            width={dimension}
            height={dimension}
            viewBox={`0 0 ${dimension} ${dimension}`}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <linearGradient
                id={gradientId}
                gradientUnits="userSpaceOnUse"
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
              >
                {stops.map((stop, i) => (
                  <stop
                    key={i}
                    offset={stop.offset}
                    stopColor="currentColor"
                    stopOpacity={stop.opacity}
                  />
                ))}
              </linearGradient>
            </defs>

            {/* The rule at rest. */}
            <circle
              cx={c}
              cy={c}
              r={r}
              stroke="currentColor"
              strokeOpacity={TRACK_OPACITY}
              strokeWidth={stroke}
            />

            {/* The sweep travelling through it. */}
            <path
              d={d}
              stroke={`url(#${gradientId})`}
              strokeWidth={stroke}
              strokeLinecap="round"
            />
          </svg>
        </span>
      </span>
    </div>
  );
}
