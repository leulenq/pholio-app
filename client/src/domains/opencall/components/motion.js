/**
 * One motion system for the whole surface — the Screen Test ease
 * (`client/src/domains/onboarding/DESIGN.md` §7): ease-out, no bounce, step
 * transitions as a crossfade plus a 10px rise. Reduced motion is required, and
 * degrades to a crossfade only.
 */

export const SCREEN_TEST_EASE = [0.16, 1, 0.3, 1];

export const STEP_DURATION = 0.55;

/** Crossfade + 10px rise for a whole screen. */
export function stepMotion(reduceMotion) {
  return reduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.2 },
      }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { duration: STEP_DURATION, ease: SCREEN_TEST_EASE },
      };
}

/** A single element arriving inside a screen, `delay` seconds in. */
export function riseIn(reduceMotion, delay = 0) {
  return reduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { duration: 0.2, delay: Math.min(delay, 0.15) },
      }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: STEP_DURATION, ease: SCREEN_TEST_EASE, delay },
      };
}
