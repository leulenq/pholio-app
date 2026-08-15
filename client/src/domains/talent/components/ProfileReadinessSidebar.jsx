import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ClipboardList } from 'lucide-react';
import { buildReadinessLists } from './profileReadinessItems';
import { getReadinessThreshold, READINESS_THRESHOLDS } from '../../../shared/utils/profileScoring';
import PholioButton from '../../../shared/components/ui/PholioButton';
import styles from './ProfileReadinessSidebar.module.css';

const TOOLTIP_PAD = 8;
const TOOLTIP_MIN_WIDTH = 120;
const TOOLTIP_ESTIMATED_HEIGHT = 56;

/** Numeral roll + rail fill share one duration so they land together. */
const COUNT_UP_MS = 750;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Never assume matchMedia resolves: jsdom and stubbed environments return undefined. */
function reducedMotionQuery() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(REDUCED_MOTION_QUERY) || null;
}

function subscribeReducedMotion(onChange) {
  const query = reducedMotionQuery();
  query?.addEventListener?.('change', onChange);
  return () => query?.removeEventListener?.('change', onChange);
}

function readReducedMotion() {
  return !!reducedMotionQuery()?.matches;
}

/**
 * Read the preference live rather than through framer's cached global, so it is
 * re-evaluated per mount and a test can flip it without module surgery.
 */
function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
}

/**
 * Count-up ported from the previous strength sidebar: 750ms with an ease-out
 * quad (`p * (2 - p)`) so the numeral decelerates into its final value.
 * Reduced motion renders the target immediately.
 */
function useCountUp(target, disabled) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (disabled) {
      fromRef.current = target;
      return undefined;
    }

    const start = fromRef.current;
    if (start === target) return undefined;

    const startTime = performance.now();
    let frameId;

    const step = (now) => {
      const progress = Math.min((now - startTime) / COUNT_UP_MS, 1);
      const eased = progress * (2 - progress);
      const current = Math.round(start + (target - start) * eased);
      fromRef.current = current;
      setDisplay(current);
      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [target, disabled]);

  return disabled ? target : display;
}

function computeTooltipPosition(btnEl, containerEl) {
  const rect = btnEl.getBoundingClientRect();
  const containerRect = containerEl?.getBoundingClientRect();
  const maxWidth = containerRect
    ? containerRect.width - TOOLTIP_PAD * 2
    : Math.max(window.innerWidth - TOOLTIP_PAD * 2, TOOLTIP_MIN_WIDTH);
  const width = Math.min(Math.max(rect.width - TOOLTIP_PAD * 2, TOOLTIP_MIN_WIDTH), maxWidth);

  let left;
  if (containerRect) {
    const idealLeft = rect.left + TOOLTIP_PAD;
    left = Math.max(
      containerRect.left + TOOLTIP_PAD,
      Math.min(idealLeft, containerRect.right - width - TOOLTIP_PAD),
    );
  } else {
    left = rect.left + TOOLTIP_PAD;
  }

  const containerTop = containerRect?.top ?? 0;
  const containerBottom = containerRect?.bottom ?? window.innerHeight;
  const spaceAbove = rect.top - containerTop;
  const spaceBelow = containerBottom - rect.bottom;
  const placeAbove =
    spaceAbove >= TOOLTIP_ESTIMATED_HEIGHT + TOOLTIP_PAD || spaceAbove >= spaceBelow;

  return {
    left,
    width,
    top: placeAbove ? rect.top - TOOLTIP_PAD : rect.bottom + TOOLTIP_PAD,
    placement: placeAbove ? 'above' : 'below',
  };
}

/** A still-missing checklist row: item name, quiet right-aligned "Add" action. */
function ReadinessGap({
  item,
  scrollTargetByKey,
  onItemClick,
  inAuditList = false,
  containerRef,
}) {
  const targetSection = scrollTargetByKey[item.key];
  const btnRef = useRef(null);
  const [fixedTip, setFixedTip] = useState(null);
  const tipId = item.why
    ? `gap-tip-${inAuditList ? 'audit' : 'next'}-${item.key}`
    : undefined;

  const placeFixedTip = () => {
    if (!item.why || !btnRef.current) return;
    const position = computeTooltipPosition(btnRef.current, containerRef?.current);
    setFixedTip({
      ...position,
      text: item.why,
    });
  };

  const clearFixedTip = () => setFixedTip(null);

  useEffect(() => {
    if (!fixedTip) return undefined;

    const hideOnScroll = () => setFixedTip(null);
    window.addEventListener('scroll', hideOnScroll, true);
    window.addEventListener('resize', hideOnScroll);
    return () => {
      window.removeEventListener('scroll', hideOnScroll, true);
      window.removeEventListener('resize', hideOnScroll);
    };
  }, [fixedTip]);

  return (
    <>
      <PholioButton
        ref={btnRef}
        type="button"
        variant="tertiary"
        className={`${styles.gapItem}${inAuditList ? ` ${styles.gapItemAudit}` : ''}`}
        onClick={() => targetSection && onItemClick?.(targetSection)}
        disabled={!targetSection}
        aria-describedby={tipId}
        onMouseEnter={item.why ? placeFixedTip : undefined}
        onMouseLeave={item.why ? clearFixedTip : undefined}
        onFocus={item.why ? placeFixedTip : undefined}
        onBlur={item.why ? clearFixedTip : undefined}
      >
        <span className={styles.gapRow}>
          <span className={styles.gapLabel}>{item.label}</span>
          {targetSection ? <span className={styles.gapAction}>Add</span> : null}
        </span>
      </PholioButton>
      {fixedTip
        ? createPortal(
            <div
              id={tipId}
              className={styles.gapTooltipFixed}
              role="tooltip"
              data-placement={fixedTip.placement}
              style={{
                left: fixedTip.left,
                width: fixedTip.width,
                top: fixedTip.top,
              }}
            >
              {fixedTip.text}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** A satisfied checklist row: quiet text with a gold check — never a dot or badge. */
function ReadinessDone({ item }) {
  return (
    <p className={styles.doneItem}>
      <Check size={14} className={styles.doneIcon} aria-hidden="true" />
      <span className={styles.doneLabel}>{item.label}</span>
    </p>
  );
}

export default function ProfileReadinessSidebar({
  readiness,
  profile = null,
  images = [],
  isSaving,
  hasChanges,
  onSaveClick,
  onItemClick,
  auditOpen,
  onToggleAudit,
}) {
  const {
    isRequiredComplete,
    fieldCompletion,
    scrollTargetByKey = {},
    score: rawScore,
  } = readiness;
  const hasUnsavedChanges = hasChanges && !isSaving;

  const threshold = getReadinessThreshold(rawScore);
  const score = threshold.value;
  const isPerfect = score === 100;

  const reduceMotion = usePrefersReducedMotion();
  const displayScore = useCountUp(score, reduceMotion);
  const cardRef = useRef(null);

  const { requiredItems, missingRequired, missingImprove, topGaps } = buildReadinessLists(
    fieldCompletion,
    profile,
    images,
  );

  const topGapsKeys = new Set(topGaps.map((item) => item.key));
  const hiddenRequired = missingRequired.filter((item) => !topGapsKeys.has(item.key));
  const hiddenImprove = missingImprove.filter((item) => !topGapsKeys.has(item.key));
  const completedRequired = requiredItems.filter((item) => item.isComplete);
  const auditItemCount = hiddenRequired.length + hiddenImprove.length + completedRequired.length;

  const statusMessage = isPerfect
    ? 'Every item is in place — your package is ready for agency review.'
    : isRequiredComplete
      ? 'Your required identity, stats, and digitals are in place.'
      : `${missingRequired.length} required ${missingRequired.length === 1 ? 'item is' : 'items are'} still missing.`;

  return (
    <aside className={styles.sidebar} aria-label="Submission readiness">
      <div className={styles.card} ref={cardRef}>
        <h2 className={styles.title}>Submission readiness</h2>

        <div className={styles.readout}>
          <p className={styles.srOnly} aria-live="polite">
            {`Submission readiness: ${score}% — ${threshold.label}`}
          </p>
          <motion.span
            key={isPerfect ? 'readout-complete' : 'readout-working'}
            className={styles.numeral}
            data-tone={threshold.tone}
            aria-hidden="true"
            initial={!reduceMotion && isPerfect ? { scale: 1.06 } : false}
            animate={{ scale: 1 }}
            transition={
              reduceMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0.28 }
            }
          >
            {displayScore}
          </motion.span>
          <span className={styles.percent} aria-hidden="true">
            %
          </span>
          <span className={styles.thresholdLabel}>{threshold.label}</span>
        </div>

        <div className={styles.rail} aria-hidden="true">
          <span className={styles.tick} style={{ left: `${READINESS_THRESHOLDS.core}%` }} />
          <span
            className={styles.tick}
            style={{ left: `${READINESS_THRESHOLDS.submissionReady}%` }}
          />
          <motion.span
            className={styles.railFill}
            initial={reduceMotion ? false : { width: '0%' }}
            animate={{ width: `${score}%` }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: COUNT_UP_MS / 1000, ease: [0.4, 0, 0.2, 1] }
            }
          />
        </div>

        {topGaps.length > 0 ? (
          <div className={styles.gapsBlock}>
            <p className={styles.gapsLabel}>Next up</p>
            <ul className={styles.gapList}>
              {topGaps.map((item) => (
                <li key={item.key} className={styles.listRow}>
                  <ReadinessGap
                    item={item}
                    scrollTargetByKey={scrollTargetByKey}
                    onItemClick={onItemClick}
                    containerRef={cardRef}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {auditItemCount > 0 ? (
          <button
            type="button"
            data-button-exception="profile-checklist"
            className={`${styles.auditToggle} ${auditOpen ? styles.auditToggleActive : ''}`}
            onClick={onToggleAudit}
            aria-expanded={auditOpen}
          >
            <ClipboardList size={15} aria-hidden="true" />
            {auditOpen ? 'Hide full checklist' : 'View full checklist'}
          </button>
        ) : null}

        <AnimatePresence initial={false}>
          {auditOpen && auditItemCount > 0 ? (
            <motion.div
              key="audit-panel"
              className={styles.auditPanelMotion}
              role="region"
              aria-label="Full profile checklist"
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={
                reduceMotion
                  ? { height: 'auto', opacity: 1 }
                  : {
                      height: 'auto',
                      opacity: 1,
                      transition: {
                        height: { type: 'spring', stiffness: 55, damping: 16 },
                        opacity: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
                      },
                    }
              }
              exit={
                reduceMotion
                  ? { height: 0, opacity: 0, transition: { duration: 0 } }
                  : {
                      height: 0,
                      opacity: 0,
                      transition: {
                        height: { type: 'spring', stiffness: 55, damping: 16 },
                        opacity: { duration: 0.14, ease: [0.4, 0, 1, 1] },
                      },
                    }
              }
            >
              <div className={styles.auditPanel}>
                <div className={styles.auditPanelScroll}>
                  {hiddenRequired.length + completedRequired.length > 0 ? (
                    <div className={styles.auditSection}>
                      <p className={styles.auditSectionLabel}>Core</p>
                      <ul className={styles.gapList}>
                        {hiddenRequired.map((item) => (
                          <li key={item.key} className={styles.listRow}>
                            <ReadinessGap
                              item={item}
                              scrollTargetByKey={scrollTargetByKey}
                              onItemClick={onItemClick}
                              inAuditList
                              containerRef={cardRef}
                            />
                          </li>
                        ))}
                        {completedRequired.map((item) => (
                          <li key={item.key} className={styles.listRow}>
                            <ReadinessDone item={item} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {hiddenImprove.length > 0 ? (
                    <div className={styles.auditSection}>
                      <p className={styles.auditSectionLabel}>Optional context</p>
                      <ul className={styles.gapList}>
                        {hiddenImprove.map((item) => (
                          <li key={item.key} className={styles.listRow}>
                            <ReadinessGap
                              item={item}
                              scrollTargetByKey={scrollTargetByKey}
                              onItemClick={onItemClick}
                              inAuditList
                              containerRef={cardRef}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <p className={styles.statusMessage}>{statusMessage}</p>

        {hasUnsavedChanges ? (
          <p className={styles.unsavedHint}>Unsaved changes — save to update this checklist.</p>
        ) : null}

        <div className={styles.saveContainer}>
          <PholioButton
            as={motion.button}
            variant={!hasChanges && !isSaving ? 'secondary' : 'primary'}
            className={styles.saveButton}
            fullWidth
            onClick={onSaveClick}
            disabled={isSaving || !hasChanges}
            whileHover={hasChanges && !isSaving ? { scale: 1.015 } : {}}
            whileTap={hasChanges && !isSaving ? { scale: 0.985 } : {}}
          >
            {isSaving ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                <span>Synchronizing...</span>
              </>
            ) : (
              'Save profile'
            )}
          </PholioButton>
        </div>
      </div>
    </aside>
  );
}
