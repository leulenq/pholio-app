import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ClipboardList } from 'lucide-react';
import { getStrengthUI } from '../../../shared/utils/profileScoring';
import { buildReadinessLists } from './profileReadinessItems';
import PholioButton from '../../../shared/components/ui/PholioButton';
import styles from './ProfileStrengthSidebar.module.css';

function ReadinessGap({ item, tier, scrollTargetByKey, onItemClick, showWhy = false }) {
  const targetSection = scrollTargetByKey[item.key];

  return (
    <button
      type="button"
      className={styles.gapItem}
      onClick={() => targetSection && onItemClick?.(targetSection)}
      disabled={!targetSection}
    >
      <span className={styles.gapCopy}>
        <span className={styles.gapLabel}>{item.label}</span>
        {showWhy && item.why ? (
          <span className={styles.gapWhy}>{item.why}</span>
        ) : null}
      </span>
      {tier === 'required' ? (
        <span className={styles.gapTier}>Essential</span>
      ) : null}
    </button>
  );
}

export default function ProfileStrengthSidebar({
  strength,
  profile = null,
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
  );
  const totalGaps = missingRequired.length + missingImprove.length;
  const isComplete = isRequiredComplete && missingImprove.length === 0;

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
          <div className={styles.progressBarTrack}>
            <div
              className={`${styles.tick} ${score >= 60 ? styles.tickActive : ''}`}
              style={{ left: '60%' }}
            >
              <span className={`${styles.tickLabel} ${score >= 60 ? styles.tickLabelActive : ''}`}>
                Core
              </span>
            </div>

            <div
              className={`${styles.tick} ${score >= 85 ? styles.tickActive : ''}`}
              style={{ left: '85%' }}
            >
              <span className={`${styles.tickLabel} ${score >= 85 ? styles.tickLabelActive : ''}`}>
                Strong
              </span>
            </div>

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

        {totalGaps > 0 ? (
          <button
            type="button"
            className={`${styles.auditToggle} ${auditOpen ? styles.auditToggleActive : ''}`}
            onClick={onToggleAudit}
            aria-expanded={auditOpen}
          >
            <ClipboardList size={15} aria-hidden="true" />
            {auditOpen ? 'Hide full checklist' : `View full checklist (${totalGaps})`}
          </button>
        ) : null}

        <AnimatePresence initial={false}>
          {auditOpen && totalGaps > 0 ? (
            <motion.div
              key="audit-panel"
              className={styles.auditPanel}
              role="region"
              aria-label="Full profile checklist"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 80, damping: 18 }}
              style={{ overflow: 'hidden' }}
            >
              {missingRequired.length > 0 ? (
                <div className={styles.auditSection}>
                  <p className={styles.auditSectionLabel}>Essentials</p>
                  {missingRequired.map((item) => (
                    <ReadinessGap
                      key={item.key}
                      item={item}
                      tier="required"
                      scrollTargetByKey={scrollTargetByKey}
                      onItemClick={onItemClick}
                    />
                  ))}
                </div>
              ) : null}
              {missingImprove.length > 0 ? (
                <div className={styles.auditSection}>
                  <p className={styles.auditSectionLabel}>Strengthen</p>
                  {missingImprove.map((item) => (
                    <ReadinessGap
                      key={item.key}
                      item={item}
                      tier="improve"
                      scrollTargetByKey={scrollTargetByKey}
                      onItemClick={onItemClick}
                    />
                  ))}
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className={styles.saveContainer}>
          <PholioButton
            as={motion.button}
            variant={!hasChanges && !isSaving ? 'secondary' : 'solid'}
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
