import { useEffect, useState } from 'react';

/**
 * Entrance trigger that fires once, just after mount — never gated on scroll.
 *
 * Scroll-tied reveals leave any below-the-fold instrument stuck at its hidden
 * initial state until it happens to be scrolled into view; on a deep-link, a
 * fast scroll, a print/headless render, or inside a nested scroll container
 * that isn't the IntersectionObserver root, that reveal may never fire and the
 * zone ships blank. A working dashboard should assemble itself on load, so the
 * page's motion enhances an already-committed layout rather than gating it.
 *
 * Returns false on the first paint (so the hidden `initial` renders once) and
 * flips true on the next frame, which plays each instrument's entrance.
 */
export function useReveal() {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    let raf2;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setRevealed(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, []);
  return revealed;
}
