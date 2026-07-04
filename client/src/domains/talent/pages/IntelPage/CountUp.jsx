import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Count-up numeral for the Pulse headline. Animates 0 → value over ~0.9s on a
 * cubic ease-out via requestAnimationFrame. Reduced motion renders the final
 * value immediately.
 */
export default function CountUp({ value, duration = 900, className }) {
  const reduce = useReducedMotion();
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (reduce) return undefined;
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduce]);

  return <span className={className}>{(reduce ? target : display).toLocaleString()}</span>;
}
