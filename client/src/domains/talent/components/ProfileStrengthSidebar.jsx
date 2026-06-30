import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check, ClipboardList } from 'lucide-react';
import { getStrengthUI } from '../../../shared/utils/profileScoring';
import { buildReadinessLists } from './profileReadinessItems';
import PholioButton from '../../../shared/components/ui/PholioButton';
import styles from './ProfileStrengthSidebar.module.css';

function ReadinessGap({
  item,
  tier,
  scrollTargetByKey,
  onItemClick,
  showTier = false,
  inAuditList = false,
}) {
  const targetSection = scrollTargetByKey[item.key];
  const btnRef = useRef(null);
  const [fixedTip, setFixedTip] = useState(null);
  const tipId = item.why
    ? `gap-tip-${inAuditList ? 'audit' : 'next'}-${item.key}`
    : undefined;

  const placeFixedTip = () => {
    if (!inAuditList || !item.why || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setFixedTip({
      left: rect.left + 8,
      width: Math.max(rect.width - 16, 120),
      top: rect.top - 8,
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
        onMouseEnter={inAuditList ? placeFixedTip : undefined}
        onMouseLeave={inAuditList ? clearFixedTip : undefined}
        onFocus={inAuditList ? placeFixedTip : undefined}
        onBlur={inAuditList ? clearFixedTip : undefined}
      >
        <span className={styles.gapRow}>
          <span className={styles.gapLabel}>{item.label}</span>
          {showTier && tier === 'required' ? (
            <span className={styles.gapTier}>Core</span>
          ) : null}
        </span>
        {!inAuditList && item.why ? (
          <span id={tipId} className={styles.gapTooltip} role="tooltip">
            {item.why}
          </span>
        ) : null}
      </PholioButton>
      {inAuditList && fixedTip
        ? createPortal(
            <div
              id={tipId}
              className={styles.gapTooltipFixed}
              role="tooltip"
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

export default function ProfileStrengthSidebar({
  strength,
  profile = null,
  images = [],
  isSaving,
  hasChanges,
  onSaveClick,
  onItemClick,
  auditOpen,
  onToggleAudit,
}) {
  const { score, isRequiredComplete, fieldCompletion, scrollTargetByKey } = strength;
  const ui = getStrengthUI(score, isRequiredComplete);
  const hasUnsavedChanges = hasChanges && !isSaving;

  const { missingRequired, missingImprove, topGaps } = buildReadinessLists(
    fieldCompletion,
    profile,
    images,
  );

  const topGapsKeys = new Set(topGaps.map((item) => item.key));
  const hiddenRequired = missingRequired.filter((item) => !topGapsKeys.has(item.key));
  const hiddenImprove = missingImprove.filter((item) => !topGapsKeys.has(item.key));
  const hiddenGapsCount = hiddenRequired.length + hiddenImprove.length;

  const isComplete = isRequiredComplete && missingImprove.length === 0;
  const reduceMotion = useReducedMotion();

  const progressColor = isRequiredComplete
    ? (score === 100 ? 'statusGold' : 'progressGreen')
    : 'progressRed';

  const [displayScore, setDisplayScore] = React.useState(score);
  const displayScoreRef = useRef(score);

  useEffect(() => {
    const start = displayScoreRef.current;
    const end = score;
    if (start === end) {
      return undefined;
    }

    const duration = 750;
    const startTime = performance.now();
    let animationFrameId;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = progress * (2 - progress);
      const currentScore = Math.round(start + (end - start) * easeProgress);
      setDisplayScore(currentScore);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        displayScoreRef.current = end;
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [score]);

  return (
    <aside className={styles.sidebar} aria-label="Profile completeness">
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.smallTitle}>Profile readiness</span>
          <div className={styles.scoreBlock}>
            <span className={styles.score} aria-live="polite">
              {displayScore}
              <span className={styles.percentSign}>%</span>
            </span>
          </div>
          {hasUnsavedChanges ? (
            <p className={styles.unsavedHint}>Unsaved changes — save to sync your score</p>
          ) : null}
        </div>

        <div className={styles.progressContainer}>
          <div className={styles.progressInstrument}>
            <div className={styles.progressBarTrack}>
              <div
                className={`${styles.tick} ${score >= 60 ? styles.tickActive : ''}`}
                style={{ left: '60%' }}
                aria-hidden
              />
              <div
                className={`${styles.tick} ${score >= 85 ? styles.tickActive : ''}`}
                style={{ left: '85%' }}
                aria-hidden
              />

              <motion.div
                className={`${styles.progressFill} ${styles[progressColor]}`}
                initial={false}
                animate={{ width: `${score}%` }}
                transition={{ type: 'spring', stiffness: 55, damping: 16 }}
                role="progressbar"
                aria-valuenow={score}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>

            <div className={styles.progressLabels} aria-hidden>
              <span
                className={`${styles.progressLabel} ${styles.progressLabelCore} ${score >= 60 ? styles.progressLabelActive : ''}`}
              >
                Core
              </span>
              <span
                className={`${styles.progressLabel} ${styles.progressLabelStrong} ${score >= 85 ? styles.progressLabelActive : ''}`}
              >
                Strong
              </span>
            </div>
          </div>
          <p className={styles.statusMessage}>{ui.message}</p>
        </div>

        {isComplete ? (
          <div className={styles.completeBrief}>
            <Check size={20} className={styles.checkIcon} aria-hidden="true" />
            <p>Submission package complete — ready for agency review.</p>
          </div>
        ) : topGaps.length > 0 ? (
          <div className={styles.gapsBlock}>
            <p className={styles.gapsLabel}>Next up</p>
            <div className={styles.gapList}>
              {topGaps.map((item) => (
                <ReadinessGap
                  key={item.key}
                  item={item}
                  tier={item.tier}
                  scrollTargetByKey={scrollTargetByKey}
                  onItemClick={onItemClick}
                />
              ))}
            </div>
          </div>
        ) : null}

        {hiddenGapsCount > 0 ? (
          <PholioButton
            type="button"
            variant="meta"
            className={`${styles.auditToggle} ${auditOpen ? styles.auditToggleActive : ''}`}
            onClick={onToggleAudit}
            aria-expanded={auditOpen}
          >
            <ClipboardList size={15} aria-hidden="true" />
            {auditOpen ? 'Hide full checklist' : `View full checklist (${hiddenGapsCount})`}
          </PholioButton>
        ) : null}

        <AnimatePresence initial={false}>
          {auditOpen && hiddenGapsCount > 0 ? (
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
                  {hiddenRequired.length > 0 ? (
                    <div className={styles.auditSection}>
                      <p className={styles.auditSectionLabel}>Core</p>
                      {hiddenRequired.map((item) => (
                        <ReadinessGap
                          key={item.key}
                          item={item}
                          tier="required"
                          scrollTargetByKey={scrollTargetByKey}
                          onItemClick={onItemClick}
                          showTier
                          inAuditList
                        />
                      ))}
                    </div>
                  ) : null}
                  {hiddenImprove.length > 0 ? (
                    <div className={styles.auditSection}>
                      <p className={styles.auditSectionLabel}>Strengthen</p>
                      {hiddenImprove.map((item) => (
                        <ReadinessGap
                          key={item.key}
                          item={item}
                          tier="improve"
                          scrollTargetByKey={scrollTargetByKey}
                          onItemClick={onItemClick}
                          inAuditList
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className={styles.saveContainer}>
          <PholioButton
            as={motion.button}
            variant={!hasChanges && !isSaving ? 'secondary' : 'primary'}
            className={styles.saveButton}
            fullWidth
            onClick={onSaveClick}
            disabled={isSaving}
            aria-disabled={!hasChanges && !isSaving}
            whileHover={!isSaving ? { scale: 1.015 } : {}}
            whileTap={!isSaving ? { scale: 0.985 } : {}}
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
