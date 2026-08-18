import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SLOT_STATE, SLOT_STATE_WORD } from '../../lib/specRegistry';
import { SpecMark } from '../../components/spec-marks';
import styles from './RequirementsPage.module.css';

/**
 * Every shot this market publishes, once — with the talent's own picture in it.
 *
 * This replaces the matrix, and it is the only cross-agency view on the page.
 * The matrix asked the reader to hold twenty-five columns in their head and
 * scroll sideways to reach the twelfth; the actual question — *what should I
 * shoot next* — is answered by eight rows in which agencies are a number.
 *
 * Image-first, in the contact sheet's material: a covered shot shows the frame
 * that covers it, so the answer to "am I done" is a photograph rather than a
 * tick. An empty frame is left visibly empty, the way the digitals sheet leaves
 * an unfilled slot.
 */
export default function ShotCoverage({ shots = [], thumbFor }) {
  const reduceMotion = useReducedMotion();
  if (!shots.length) return null;

  return (
    <motion.section
      className={styles.coverage}
      aria-labelledby="shot-coverage-title"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 55, damping: 16 }
      }
    >
      <h2 id="shot-coverage-title" className={styles.coverageTitle}>
        Every shot this market asks for
      </h2>

      <ul className={styles.coverageList}>
        {shots.map((shot, index) => {
          const src = shot.imageId ? thumbFor?.(shot.imageId) : null;
          const entrance = reduceMotion
            ? {}
            : {
                initial: { opacity: 0, y: 8 },
                animate: { opacity: 1, y: 0 },
                transition: {
                  type: 'spring',
                  stiffness: 55,
                  damping: 16,
                  delay: Math.min(index, 6) * 0.03,
                },
              };

          return (
            <motion.li key={shot.key} className={styles.coverageRow} {...entrance}>
              <span
                className={`${styles.coverageFrame}${
                  src ? '' : ` ${styles.coverageFrameEmpty}`
                }`}
              >
                {src ? (
                  <img
                    className={styles.coverageImg}
                    src={src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                ) : null}
              </span>

              <span className={styles.coverageName}>{shot.label}</span>

              <span className={styles.coverageState}>
                <SpecMark state={shot.state} size={11} />
                {/* Never hover-only: the state is set in words beside the mark. */}
                <span className={styles.coverageWord}>{SLOT_STATE_WORD[shot.state]}</span>
                <span className={styles.coverageAsked}>
                  {shot.askedByCount === 1
                    ? 'asked for by 1 agency'
                    : `asked for by ${shot.askedByCount} agencies`}
                </span>
              </span>
            </motion.li>
          );
        })}
      </ul>

      <p className={styles.coverageNote}>
        {shots.every((shot) => shot.state === SLOT_STATE.IN_SET)
          ? 'Your set covers every shot these agencies publish.'
          : 'One shoot covers all of them — the same frame satisfies every agency that asks for it.'}
      </p>
    </motion.section>
  );
}
