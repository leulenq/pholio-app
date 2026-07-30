import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import PholioButton, {
  PholioIconButton,
  PholioToggleButton,
  PholioToggleGroup,
} from '../../../../shared/components/ui/PholioButton';
import PholioSpark from '../../../../shared/components/ui/PholioSpark';
import { PholioTextarea } from '../../../../shared/components/ui/forms';
import styles from './BioWriter.module.css';

/**
 * The bio writer.
 *
 * The spark is the only way into the writing experience, and length and voice
 * are settings *of* that action rather than a permanent row of toggles under
 * the field — a standing row implied they did something on their own, which is
 * what made the old arrangement read as three unrelated controls.
 *
 * So: press the spark, a composer opens against it, and the parameters live
 * inside next to the confirm. Ignore the parameters and the defaults write a
 * standard, third-person bio.
 *
 * Word ranges below are the real targets the model is prompted with
 * (`src/domains/talent/services/bio-writer/prompt-builder.js`) — if those
 * change, change these.
 */
const LENGTHS = [
  {
    value: 'tight',
    label: 'Tight',
    note: 'One or two lines, 25–45 words. Built to be scanned on a board.',
  },
  {
    value: 'standard',
    label: 'Standard',
    note: 'A short paragraph, 35–80 words. Room for range and credits.',
  },
];

const VOICES = [
  {
    value: 'third',
    label: 'Agency',
    note: 'Third person — the way a booker introduces you to a client.',
  },
  {
    value: 'first',
    label: 'Personal',
    note: 'First person — your own voice, for direct submissions.',
  },
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
  const [sweeping, setSweeping] = useState(false);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const wasWorkingRef = useRef(false);
  const valueAtWriteRef = useRef(value);

  const length = options?.length === 'tight' ? 'tight' : 'standard';
  const person = options?.person === 'first' ? 'first' : 'third';
  const hasBio = String(value || '').trim().length >= MIN_REFINE_LENGTH;
  const wordCount = useMemo(() => countWords(value), [value]);

  const actionLabel = hasBio ? 'Refine bio' : 'Write bio';
  const workingLabel = hasBio ? 'Refining…' : 'Writing…';

  const setOption = (patch) => {
    onOptionsChange?.({ length, person, ...patch });
  };

  const closePanel = ({ restoreFocus = true } = {}) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  // The composer is a non-modal popover: escape and outside presses dismiss it,
  // and tabbing past the confirm lets it go rather than trapping the keyboard.
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      closePanel();
    };
    const handlePointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleFocusIn = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
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

  // Opening hands the keyboard the first parameter, so the whole composer is
  // reachable with Tab from the spark.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector('[data-pholio-toggle]')?.focus();
  }, [open]);

  // The prose lands in a textarea, so it can't animate in. A gold rule drawn
  // under the field marks the moment instead — but only when the model
  // actually returned something new, never after a failed attempt.
  useEffect(() => {
    if (isWorking) {
      wasWorkingRef.current = true;
      return;
    }
    if (!wasWorkingRef.current) return;
    wasWorkingRef.current = false;
    setOpen(false);
    if (value !== valueAtWriteRef.current && !reduceMotion) setSweeping(true);
  }, [isWorking, value, reduceMotion]);

  const runWriter = () => {
    valueAtWriteRef.current = value;
    if (hasBio) onRefine?.();
    else onWrite?.();
  };

  const activeLengthNote = LENGTHS.find((item) => item.value === length)?.note;
  const activeVoiceNote = VOICES.find((item) => item.value === person)?.note;

  return (
    <div className={styles.writer} ref={rootRef}>
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>
            About <em>you</em>
          </h3>

          <div className={styles.sparkAnchor}>
            <PholioIconButton
              ref={triggerRef}
              label={hasBio ? 'Refine your bio with Pholio' : 'Write your bio with Pholio'}
              className={`${styles.spark} ${open ? styles.sparkOpen : ''} ${
                isWorking ? styles.sparkWorking : ''
              }`}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={open ? panelId : undefined}
              onClick={() => (open ? closePanel({ restoreFocus: false }) : setOpen(true))}
            >
              <PholioSpark size={24} />
            </PholioIconButton>

            <AnimatePresence>
              {open && (
                <motion.div
                  ref={panelRef}
                  id={panelId}
                  role="dialog"
                  aria-label="Pholio bio writer"
                  className={styles.panel}
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={
                    reduceMotion
                      ? { duration: 0.12 }
                      : { type: 'spring', stiffness: 380, damping: 30, mass: 0.6 }
                  }
                >
                  <p className={styles.panelLede}>
                    {hasBio
                      ? 'Pholio rewrites what you have, keeping the facts.'
                      : 'Pholio drafts from your profile — bases, categories, training, credits.'}
                  </p>

                  <div className={styles.param} role="group" aria-label="Bio length">
                    <span className={styles.paramLabel}>Length</span>
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
                    <p className={styles.paramNote}>{activeLengthNote}</p>
                  </div>

                  <div className={styles.param} role="group" aria-label="Bio voice">
                    <span className={styles.paramLabel}>Voice</span>
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
                    <p className={styles.paramNote}>{activeVoiceNote}</p>
                  </div>

                  <PholioButton
                    variant="ai"
                    fullWidth
                    icon={<PholioSpark size={14} />}
                    loading={isWorking}
                    className={styles.confirm}
                    onClick={runWriter}
                  >
                    {isWorking ? workingLabel : actionLabel}
                  </PholioButton>
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
        />
        <AnimatePresence>
          {sweeping && (
            <motion.span
              className={styles.sweep}
              aria-hidden="true"
              initial={{ scaleX: 0, opacity: 1 }}
              animate={{ scaleX: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => setSweeping(false)}
            />
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
