import React from 'react';
import LoadingSpinner from './LoadingSpinner';

/**
 * The one full-screen loading treatment used across every "waiting for the
 * app to be ready" moment: the lazy-route Suspense fallback (App.jsx), the
 * agency session gate, and the talent dashboard shell's pre-data-load state.
 *
 * These used to each render their own slightly different spinner markup. A
 * cold load typically passes through more than one of these phases in
 * sequence (chunk download, then profile fetch) — on a fast connection the
 * transition is imperceptible, but on a slow one (mobile) a visible style
 * change between phases reads as "the page reloaded/flashed" even though
 * nothing actually reloaded. Using the exact same component for all of them
 * means that transition is visually a no-op.
 */
export default function PageLoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-[#faf8f5]">
      <LoadingSpinner size="lg" />
    </div>
  );
}
