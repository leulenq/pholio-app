import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

/**
 * Shared instrument primitives for the Intel page.
 *
 * The visual language is the talent studio (client/src/domains/talent/DESIGN.md):
 * warm paper, a single gold accent, editorial serif for statements, quiet
 * numerals. Motion is house spring physics (stiffness 55, damping 16); every
 * instrument draws on as it enters the viewport, and every low-data instrument
 * has a designed "calibrating" state in the same ink — never a shaming blank.
 */

export const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

/**
 * Signal-tier ramp — an ordinal sequential scale, deep→pale, so Tier 1 (a
 * booker reviewed you) reads as the heaviest ink and Tier 5 (raw reach) as the
 * lightest. Monotonic in lightness, which keeps it legible under colour-vision
 * deficiency without relying on hue alone.
 */
export const TIER_RAMP = ['#3D2E14', '#6B4F2A', '#97753C', '#C9A55A', '#E0CFA8'];

export const TIER_META = [
  { tier: 1, key: 'reviews', label: 'Reviewed', hint: 'A booker reviewed your submission' },
  { tier: 2, key: 'advances', label: 'Advanced', hint: 'A submission moved forward' },
  { tier: 3, key: 'pulls', label: 'Pulled', hint: 'Your card was pulled or a link opened' },
  { tier: 4, key: 'qualified', label: 'Qualified', hint: 'A real visit — dwell, referral, images viewed' },
  { tier: 5, key: 'reach', label: 'Reach', hint: 'Passing traffic and social taps' },
];

export function nf(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US');
}

export function pct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

/** A section shell: editorial title, optional lede, and a draw-on entrance. */
export function Zone({ index, title, lede, aside, children, wide = false, id }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-12% 0px' });
  const reduce = useReducedMotion();
  return (
    <motion.section
      id={id}
      ref={ref}
      className={`intel-zone${wide ? ' intel-zone--wide' : ''}`}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={SPRING}
    >
      <header className="intel-zone__head">
        <div>
          <p className="intel-zone__index">{String(index).padStart(2, '0')}</p>
          <h2 className="intel-zone__title">{title}</h2>
          {lede ? <p className="intel-zone__lede">{lede}</p> : null}
        </div>
        {aside ? <div className="intel-zone__aside">{aside}</div> : null}
      </header>
      <div className="intel-zone__body">{children}</div>
    </motion.section>
  );
}

/** Count-up numeral, spring-eased, respecting reduced motion. */
export function CountUp({ value, className, format = nf, duration = 900 }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const target = Number(value) || 0;

  useEffect(() => {
    if (!inView) return undefined;
    if (reduce) {
      setDisplay(target);
      return undefined;
    }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, target, duration, reduce]);

  return (
    <span ref={ref} className={className}>
      {format(Math.round(display))}
    </span>
  );
}

/** Delta chip — plain arrow + number, suppressed by the backend when dishonest. */
export function Delta({ value }) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) {
    return <span className="intel-delta intel-delta--flat">—</span>;
  }
  const up = n > 0;
  return (
    <span className={`intel-delta ${up ? 'intel-delta--up' : 'intel-delta--down'}`}>
      {up ? '▲' : '▼'} {Math.abs(n)}
    </span>
  );
}

/**
 * Calibrating state — first-class, not an apology. Same ink, same craft;
 * explicit about what the instrument is listening for.
 */
export function Calibrating({ title, listening, icon }) {
  return (
    <div className="intel-calibrating" role="status">
      {icon ? <div className="intel-calibrating__icon">{icon}</div> : null}
      <p className="intel-calibrating__title">{title}</p>
      <p className="intel-calibrating__listening">{listening}</p>
      <span className="intel-calibrating__pulse" aria-hidden />
    </div>
  );
}

/** A locked Studio+ instrument — invites upgrade without faking data. */
export function StudioLock({ title, blurb }) {
  return (
    <div className="intel-lock">
      <p className="intel-lock__title">{title}</p>
      <p className="intel-lock__blurb">{blurb}</p>
      <a className="intel-lock__cta" href="/dashboard/talent/settings/subscription">
        Unlock with Studio+
      </a>
    </div>
  );
}
