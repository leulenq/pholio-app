import React from 'react';
import './LoadingSpinner.css';

/**
 * Pholio Gold Sweep Loader — the wordmark's gold sweep, set turning.
 *
 * The sweep is the hairline that sits under the PHOLIO wordmark:
 * `linear-gradient(to right, transparent, var(--app-gold), transparent)`
 * (see `.apply-workspace-top::after` in ApplyExperience.css, and the header
 * band and footer on the marketing site).
 *
 * ── This is a stroke, not a ring ──────────────────────────────────────────
 *
 * The obvious build is a circle with a gradient on it, and it is wrong. A
 * stroked <circle> has one constant width all the way round, so however the
 * gold is faded across it, the thing you have drawn is a mathematical ring
 * wearing brand colours. The sweep is not a ring. It is a *stroke* — it swells
 * where it is strongest and thins away to nothing at its ends, the way a mark
 * laid down in one pass does.
 *
 * So the geometry carries the sweep, and the gradient only lights it:
 *
 *  - **The width tapers.** The ribbon is built as a filled band whose
 *    thickness follows the same ramp as its brightness (`WIDTH_EASE` slackens
 *    the relationship so the tail thins more slowly than it dims). At the tips
 *    it narrows to `TIP_RATIO` of full — which lands at roughly a pixel, the
 *    wordmark rule's own weight. The mark begins as the rule and swells into
 *    the sweep.
 *  - **It is long.** The rule runs about 160:1 long-to-thick. A short fat arc
 *    reads as a crescent, so `SPAN` is generous — and the ribbon still never
 *    closes into a ring, because it is tapering the whole way.
 *  - **The tips are round, not pointed.** Each end closes with a semicircular
 *    cap at the width it has arrived at, so it reads as a soft lead-in rather
 *    than a spike or a cut.
 *  - **The path is not concentric.** `SPIRAL` walks the radius outward along
 *    the sweep, so the head rides slightly wider than the tail. It is a few
 *    percent — not enough to read as a wobble, enough that the curve reads as
 *    drawn rather than struck with a compass.
 *  - **There is no track.** A faint full circle behind the sweep is the exact
 *    perfect ring this is trying not to be.
 *
 * Motion is two nested rotations at one period — a constant turn plus a gentle
 * ±16° eased oscillation. Their sum gathers speed and settles once a
 * revolution, and never stalls or reverses. Constant-velocity rotation is what
 * makes a loader read as machinery. No glow, no pulse, no shimmer.
 *
 * ── Why the fade is a conic mask ──────────────────────────────────────────
 *
 * A linear gradient's iso-opacity lines are straight and perpendicular to its
 * axis, while the band it is painting curves away from that axis. Well before
 * the end of an arc this long the band's own direction has swung round to meet
 * them, so the fade cuts *lengthwise* along it rather than across: one edge
 * goes transparent well before the other and the tip comes out shaved on the
 * diagonal. Conic iso-lines are radial, so the fade stays square to the ribbon
 * the whole way round. Conic position is also proportional to arc length, so
 * the ramp maps straight on with no projection maths.
 *
 * The same component ships on the marketing site as GoldSweepLoader; keep the
 * two in step.
 *
 * Props:
 *   size   — 'sm' | 'md' | 'lg' | 'xl' (24 / 40 / 56 / 72 px). Default 'md'.
 *   color  — sweep colour. Defaults to brand gold; the whole mark is drawn in
 *            `currentColor`, so a CSS `color` on the element works too.
 *   label  — accessible name announced to assistive tech. Default 'Loading'.
 */

/** Rendered box, in px, per named size. */
const SIZES = { sm: 24, md: 40, lg: 56, xl: 72 };

/** Degrees of arc the sweep occupies. */
const SPAN = 230;

/**
 * Where the sweep peaks, in normalised arc length: 0 is the trailing tip, 1
 * the leading one — and it turns clockwise, so 1 is the edge that arrives
 * first. Sitting this close to the head gathers the mark into a short broad
 * entry with a long fine tail drawn out behind it, which is what gives it a
 * legible *start*. Peak it in the middle, as the rule does when it is lying
 * straight, and once bent it reads as a ring lit from one side.
 */
const PEAK = 0.86;

/** Width at the tips, as a fraction of full. Lands near the rule's own 1px. */
const TIP_RATIO = 0.28;

/** Below 1, the ribbon thins more slowly than it dims, keeping the tail drawn. */
const WIDTH_EASE = 0.6;

/**
 * Below 1, holds the gold near full strength across the body and spends the
 * fade at the tips. The taper is the geometry's job here — ramp the alpha as
 * hard as the width and the two multiply, killing the tail long before it
 * runs out and leaving a stubby crescent.
 */
const MASK_EASE = 0.45;

/** How far the radius walks outward across the sweep. A few percent. */
const SPIRAL = 0.06;

/** Points sampled along each edge of the ribbon. */
const EDGE_SAMPLES = 64;

/** Conic stops used to draw the ramp. Smooth curve, so a coarse walk is fine. */
const MASK_SAMPLES = 32;

const round = (n) => Math.round(n * 1000) / 1000;

/** Zero slope at both ends — no crease where segments of the ramp meet. */
const smoothstep = (u) => u * u * (3 - 2 * u);

/**
 * The ramp along the sweep, driving both brightness and width. Both tips reach
 * zero with zero slope, so each is a soft lead-in rather than a point or a cut.
 */
function rampAt(t) {
  if (t <= PEAK) return smoothstep(t / PEAK);
  return 1 - smoothstep((t - PEAK) / (1 - PEAK));
}

/**
 * The sweep's brightness, as a conic gradient over the alpha channel.
 *
 * Rotated so the ramp's peak lands at 12 o'clock, which is where a
 * reduced-motion render comes to rest. Geometry-free, so it is the same string
 * at every size.
 */
const SWEEP_MASK = (() => {
  const stops = Array.from({ length: MASK_SAMPLES + 1 }, (_, i) => {
    const t = i / MASK_SAMPLES;
    const alpha = Math.pow(rampAt(t), MASK_EASE);
    return `rgba(0,0,0,${round(alpha)}) ${round(t * SPAN)}deg`;
  });
  return `conic-gradient(from ${round(-PEAK * SPAN)}deg at 50% 50%, ${stops.join(
    ', '
  )}, rgba(0,0,0,0) 360deg)`;
})();

/** Width of the ribbon at its peak, nudged up with the box. */
function weightFor(size) {
  if (size <= 28) return 1.8;
  if (size <= 48) return 2.5;
  if (size <= 64) return 2.9;
  return 3.2;
}

/**
 * The ribbon: one filled path, out along the far edge and back along the near
 * one, closed at each tip with a semicircular cap.
 */
function buildSweep(size) {
  const full = weightFor(size);
  const tip = full * TIP_RATIO;
  const c = size / 2;
  // Inset for the spiral so the widest point still clears the box.
  const base = ((size - full) / 2) * (1 - SPIRAL / 2);
  const span = (SPAN * Math.PI) / 180;
  const start = -Math.PI / 2 - PEAK * span;

  const outer = [];
  const inner = [];

  for (let i = 0; i <= EDGE_SAMPLES; i += 1) {
    const t = i / EDGE_SAMPLES;
    const angle = start + t * span;
    const radius = base * (1 + SPIRAL * (t - 0.5));
    const half = (tip + (full - tip) * Math.pow(rampAt(t), WIDTH_EASE)) / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    outer.push([
      round(c + (radius + half) * cos),
      round(c + (radius + half) * sin),
    ]);
    inner.push([
      round(c + (radius - half) * cos),
      round(c + (radius - half) * sin),
    ]);
  }

  const cap = round(tip / 2);
  const head = inner[EDGE_SAMPLES];
  const tail = outer[0];

  return [
    `M ${tail[0]} ${tail[1]}`,
    ...outer.slice(1).map(([x, y]) => `L ${x} ${y}`),
    `A ${cap} ${cap} 0 0 1 ${head[0]} ${head[1]}`,
    ...inner
      .slice(0, EDGE_SAMPLES)
      .reverse()
      .map(([x, y]) => `L ${x} ${y}`),
    `A ${cap} ${cap} 0 0 1 ${tail[0]} ${tail[1]}`,
    'Z',
  ].join(' ');
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
            className="ph-spinner__sweep"
            width={dimension}
            height={dimension}
            viewBox={`0 0 ${dimension} ${dimension}`}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
            style={{ WebkitMaskImage: SWEEP_MASK, maskImage: SWEEP_MASK }}
          >
            <path d={buildSweep(dimension)} fill="currentColor" />
          </svg>
        </span>
      </span>
    </div>
  );
}
