import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import PholioButton, {
  PholioIconButton,
  PholioToggleButton,
  PholioToggleGroup,
} from '../../../../shared/components/ui/PholioButton';
import { PholioTextarea } from '../../../../shared/components/ui/forms';
import styles from './BioWriter.module.css';

const markVariants = {
  idle: { scale: 1, rotate: 0 },
  awake: {
    scale: [1, 0.96, 1.045, 1],
    rotate: [0, -3, 2, 0],
    transition: {
      duration: 1.8,
      times: [0, 0.28, 0.62, 1],
      ease: [0.22, 1, 0.36, 1],
      repeat: Infinity,
    },
  },
  working: {
    scale: [1, 0.94, 1.06, 1],
    rotate: [0, -5, 3, 0],
    transition: {
      duration: 1.15,
      times: [0, 0.28, 0.62, 1],
      ease: [0.22, 1, 0.36, 1],
      repeat: Infinity,
    },
  },
};

const majorVariants = {
  idle: { scale: 1, opacity: 1 },
  awake: {
    scale: [1, 0.86, 1.08, 1],
    opacity: [1, 0.72, 1, 1],
    transition: { duration: 1.8, times: [0, 0.3, 0.62, 1], repeat: Infinity },
  },
  working: {
    scale: [1, 0.82, 1.1, 1],
    opacity: [1, 0.64, 1, 1],
    transition: { duration: 1.15, times: [0, 0.3, 0.62, 1], repeat: Infinity },
  },
};

const upperVariants = {
  idle: { x: 0, y: 0, scale: 1, opacity: 0.82 },
  awake: {
    x: [0, -1.1, 0.45, 0],
    y: [0, 1.1, -0.45, 0],
    scale: [1, 0.62, 1.22, 1],
    opacity: [0.82, 0.28, 1, 0.82],
    transition: { duration: 1.8, times: [0, 0.28, 0.64, 1], repeat: Infinity },
  },
  working: {
    x: [0, -1.2, 0.5, 0],
    y: [0, 1.2, -0.5, 0],
    scale: [1, 0.55, 1.26, 1],
    opacity: [0.82, 0.2, 1, 0.82],
    transition: { duration: 1.15, times: [0, 0.28, 0.64, 1], repeat: Infinity },
  },
};

const lowerVariants = {
  idle: { x: 0, y: 0, scale: 1, opacity: 0.62 },
  awake: {
    x: [0, -0.8, 0.5, 0],
    y: [0, -0.8, 0.5, 0],
    scale: [1, 0.68, 1.16, 1],
    opacity: [0.62, 0.22, 0.92, 0.62],
    transition: {
      duration: 1.8,
      times: [0, 0.34, 0.7, 1],
      repeat: Infinity,
      delay: 0.12,
    },
  },
  working: {
    x: [0, -0.9, 0.55, 0],
    y: [0, -0.9, 0.55, 0],
    scale: [1, 0.6, 1.2, 1],
    opacity: [0.62, 0.18, 1, 0.62],
    transition: {
      duration: 1.15,
      times: [0, 0.34, 0.7, 1],
      repeat: Infinity,
      delay: 0.08,
    },
  },
};

/**
 * The original thin-waisted Pholio spark, animated as one coordinated mark.
 * Motion variants propagate from the SVG to each path so the major and two
 * minor forms gather and release with one rhythm.
 */
function PholioMagicMark({ size = 24, state = 'idle' }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={styles.magicMark}
      aria-hidden="true"
      focusable="false"
      initial={false}
      animate={state}
      variants={markVariants}
    >
      <motion.path
        className={styles.magicMajor}
        d="M9.7 3.4 C10.9 8.2 12.6 9.9 17.4 11.1 C12.6 12.3 10.9 14 9.7 18.8 C8.5 14 6.8 12.3 2 11.1 C6.8 9.9 8.5 8.2 9.7 3.4 Z"
        variants={majorVariants}
      />
      <motion.path
        className={styles.magicMinor}
        d="M18.6 1 C19.1 3 19.8 3.7 21.8 4.2 C19.8 4.7 19.1 5.4 18.6 7.4 C18.1 5.4 17.4 4.7 15.4 4.2 C17.4 3.7 18.1 3 18.6 1 Z"
        variants={upperVariants}
      />
      <motion.path
        className={styles.magicMinor}
        d="M18.6 15.6 C19.1 17.6 19.8 18.3 21.8 18.8 C19.8 19.3 19.1 20 18.6 22 C18.1 20 17.4 19.3 15.4 18.8 C17.4 18.3 18.1 17.6 18.6 15.6 Z"
        variants={lowerVariants}
      />
    </motion.svg>
  );
}

/**
 * The bio writer.
 *
 * Hover/focus reveals the writing controls; the magic mark itself generates.
 * On touch, the first tap reveals the controls and the second activates them.
 */
const LENGTHS = [
  { value: 'tight', label: 'Tight' },
  { value: 'standard', label: 'Standard' },
];

const VOICES = [
  { value: 'third', label: 'Agency' },
  { value: 'first', label: 'Personal' },
];

const MIN_REFINE_LENGTH = 10;

function countWords(value) {
  return (String(value || '').trim().match(/\S+/g) || []).length;
}

export default function BioWriter({
  field,
  error,
  value = '',
  isWorking = false,
  options = { length: 'standard', person: 'third' },
  onOptionsChange,
  onWrite,
  onRefine,
  previousBio,
  onRevert,
}) {
  const reduceMotion = useReducedMotion();
  const panelId = `bio-composer-${useId()}`;
  const [open, setOpen] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const magicAnchorRef = useRef(null);
  const closeTimerRef = useRef(null);
  const touchPrimedRef = useRef(false);

  const length = options?.length === 'tight' ? 'tight' : 'standard';
  const person = options?.person === 'first' ? 'first' : 'third';
  const hasBio = String(value || '').trim().length >= MIN_REFINE_LENGTH;
  const wordCount = useMemo(() => countWords(value), [value]);
  const motionState = reduceMotion
    ? 'idle'
    : isWorking
      ? 'working'
      : engaged || open
        ? 'awake'
        : 'idle';

  const setOption = (patch) => {
    onOptionsChange?.({ length, person, ...patch });
  };

  const cancelScheduledClose = () => {
    if (!closeTimerRef.current) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const schedulePanelClose = () => {
    cancelScheduledClose();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setEngaged(false);
      closeTimerRef.current = null;
    }, 140);
  };

  useEffect(() => () => cancelScheduledClose(), []);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    const handlePointerDown = (event) => {
      if (magicAnchorRef.current?.contains(event.target)) return;
      cancelScheduledClose();
      setOpen(false);
      setEngaged(false);
    };
    const handleFocusIn = (event) => {
      if (magicAnchorRef.current?.contains(event.target)) return;
      cancelScheduledClose();
      setOpen(false);
      setEngaged(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [open]);

  const runWriter = () => {
    cancelScheduledClose();
    setOpen(false);
    setEngaged(false);
    if (hasBio) onRefine?.();
    else onWrite?.();
  };

  const handleTriggerClick = () => {
    if (touchPrimedRef.current) {
      touchPrimedRef.current = false;
      return;
    }
    if (!open) {
      setOpen(true);
      return;
    }
    runWriter();
  };

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' || open) return;
    touchPrimedRef.current = true;
    setOpen(true);
  };

  return (
    <div className={styles.writer}>
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>
            About <em>you</em>
          </h3>

          <div
            ref={magicAnchorRef}
            className={styles.magicAnchor}
            onMouseEnter={cancelScheduledClose}
            onMouseLeave={schedulePanelClose}
          >
            <PholioIconButton
              label={hasBio ? 'Refine your bio with Pholio' : 'Write your bio with Pholio'}
              title={hasBio ? 'Refine bio with Pholio' : 'Write bio with Pholio'}
              className={`${styles.magicButton} ${open ? styles.magicOpen : ''} ${
                isWorking ? styles.magicWorking : ''
              }`}
              loading={isWorking}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={open ? panelId : undefined}
              onMouseEnter={() => {
                cancelScheduledClose();
                setEngaged(true);
                setOpen(true);
              }}
              onMouseLeave={() => setEngaged(false)}
              onPointerDown={handlePointerDown}
              onFocus={() => {
                setEngaged(true);
                setOpen(true);
              }}
              onBlur={() => setEngaged(false)}
              onClick={handleTriggerClick}
            >
              <PholioMagicMark size={25} state={motionState} />
            </PholioIconButton>

            <AnimatePresence>
              {open && (
                <motion.div
                  id={panelId}
                  role="dialog"
                  aria-label="Pholio bio writer"
                  className={styles.panel}
                  initial={{ opacity: 0, y: -7, scale: 0.975 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.985 }}
                  transition={
                    reduceMotion
                      ? { duration: 0.1 }
                      : { type: 'spring', stiffness: 360, damping: 28, mass: 0.62 }
                  }
                >
                  <div className={styles.param} role="group" aria-label="Bio length">
                    <PholioToggleGroup className={styles.paramOptions}>
                      {LENGTHS.map((item) => (
                        <PholioToggleButton
                          key={item.value}
                          active={length === item.value}
                          disabled={isWorking}
                          onClick={() => setOption({ length: item.value })}
                        >
                          {item.label}
                        </PholioToggleButton>
                      ))}
                    </PholioToggleGroup>
                  </div>

                  <div className={styles.param} role="group" aria-label="Bio voice">
                    <PholioToggleGroup className={styles.paramOptions}>
                      {VOICES.map((item) => (
                        <PholioToggleButton
                          key={item.value}
                          active={person === item.value}
                          disabled={isWorking}
                          onClick={() => setOption({ person: item.value })}
                        >
                          {item.label}
                        </PholioToggleButton>
                      ))}
                    </PholioToggleGroup>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <p className={styles.lede}>
          The paragraph an agency reads before they meet you.
        </p>
      </div>

      <div className={styles.field} data-working={isWorking ? 'true' : undefined}>
        <PholioTextarea
          label=""
          placeholder="Tell us about yourself, your passions, and what drives your career..."
          rows={6}
          error={error}
          aria-busy={isWorking || undefined}
          {...field}
          value={value}
        />
        <AnimatePresence>
          {isWorking && (
            <motion.svg
              className={styles.thinkingSweep}
              aria-hidden="true"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              initial={{ opacity: 0, scale: 0.997 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.003 }}
              transition={{
                duration: reduceMotion ? 0.1 : 0.42,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <motion.rect
                className={styles.thinkingSweepBase}
                x="0.75"
                y="0.75"
                width="98.5"
                height="98.5"
                rx="1.2"
                pathLength={1}
                vectorEffect="non-scaling-stroke"
                initial={false}
                animate={
                  reduceMotion
                    ? { opacity: 0.34 }
                    : { opacity: [0.2, 0.36, 0.2] }
                }
                transition={
                  reduceMotion
                    ? { duration: 0.1 }
                    : { duration: 3.2, ease: 'easeInOut', repeat: Infinity }
                }
              />
              <motion.rect
                className={styles.thinkingSweepCurrent}
                x="0.75"
                y="0.75"
                width="98.5"
                height="98.5"
                rx="1.2"
                pathLength={1}
                strokeDasharray="0.16 0.84"
                vectorEffect="non-scaling-stroke"
                initial={false}
                animate={
                  reduceMotion
                    ? { opacity: 0 }
                    : { strokeDashoffset: [0, -1], opacity: [0.52, 0.78, 0.52] }
                }
                transition={
                  reduceMotion
                    ? { duration: 0.1 }
                    : {
                        strokeDashoffset: {
                          duration: 4.6,
                          ease: 'linear',
                          repeat: Infinity,
                        },
                        opacity: {
                          duration: 2.8,
                          ease: 'easeInOut',
                          repeat: Infinity,
                        },
                      }
                }
              />
            </motion.svg>
          )}
        </AnimatePresence>
      </div>

      <div className={styles.footer}>
        {previousBio ? (
          <PholioButton
            variant="meta"
            onClick={onRevert}
            disabled={isWorking}
            className={styles.revert}
          >
            Revert to original
          </PholioButton>
        ) : (
          <span />
        )}

        {isWorking ? (
          <p className={styles.status} role="status">
            {hasBio ? 'Pholio is refining your bio' : 'Pholio is writing your bio'}
          </p>
        ) : (
          <p className={styles.count}>
            {wordCount === 1 ? '1 word' : `${wordCount} words`}
          </p>
        )}
      </div>
    </div>
  );
}
