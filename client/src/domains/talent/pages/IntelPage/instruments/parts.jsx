import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useReveal } from './useReveal';
import { SPRING, nf } from './metrics';

/**
 * Shared instrument components for the Intel page.
 *
 * The visual language is the talent studio (client/src/domains/talent/DESIGN.md):
 * warm paper, a single gold accent, editorial serif for statements, quiet
 * numerals. Motion is house spring physics (stiffness 55, damping 16); every
 * instrument draws on as it enters the viewport, and every low-data instrument
 * has a designed "calibrating" state in the same ink — never a shaming blank.
 *
 * Component-free constants and formatters live in ./metrics.
 */

/** A section shell: editorial title, optional lede, and a draw-on entrance. */
export function Zone({ title, lede, aside, children, wide = false, id }) {
  const ref = useRef(null);
  const inView = useReveal();
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
  const inView = useReveal();
  const reduce = useReducedMotion();
  const target = Number(value) || 0;

  useEffect(() => {
    if (!inView) return undefined;
    // setDisplay is only ever called inside the rAF callback (never
    // synchronously in the effect body): the reduced-motion path simply clamps
    // t to 1 on the first frame and lands on the target immediately.
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = reduce ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
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
      <div className="intel-lock__copy">
        <p className="intel-lock__title">{title}</p>
        <p className="intel-lock__blurb">{blurb}</p>
      </div>
      <a className="intel-lock__cta" href="/dashboard/talent/settings/subscription">
        Unlock with Studio+
        <span aria-hidden>→</span>
      </a>
    </div>
  );
}
