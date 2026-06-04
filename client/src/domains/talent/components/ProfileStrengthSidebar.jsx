import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ClipboardList } from 'lucide-react';
import { getStrengthUI } from '../../../shared/utils/profileScoring';
import { buildReadinessLists } from './profileReadinessItems';
import styles from './ProfileStrengthSidebar.module.css';

function GlanceGap({ item, tier, scrollTargetByKey, onItemClick }) {
  const targetSection = scrollTargetByKey[item.key];
  const dotClass = tier === 'required' ? styles.dotRed : styles.dotSlate;

  return (
    <button
      type="button"
      className={styles.gapItem}
      onClick={() => targetSection && onItemClick?.(targetSection)}
      disabled={!targetSection}
    >
      <span className={`${styles.dot} ${dotClass}`} aria-hidden="true" />
      <span className={styles.gapLabel}>{item.label}</span>
      {tier === 'required' ? (
        <span className={styles.badgeRed}>Required</span>
      ) : null}
    </button>
  );
}

export default function ProfileStrengthSidebar({
  strength,
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

  const { missingRequired, missingImprove, topGaps } = buildReadinessLists(fieldCompletion);
  const totalGaps = missingRequired.length + missingImprove.length;
  const isComplete = isRequiredComplete && missingImprove.length === 0;

  const statusColor = isRequiredComplete ? (score === 100 ? 'statusGold' : 'statusGreen') : 'statusRed';
  const progressColor = isRequiredComplete ? (score === 100 ? 'statusGold' : 'progressGreen') : 'progressRed';

  // Smooth numerical count-up animation for the score
  const [displayScore, setDisplayScore] = React.useState(0);

  React.useEffect(() => {
    let start = displayScore;
    const end = score;
    if (start === end) return;

    const duration = 750; // ms
    const startTime = performance.now();
    let animationFrameId;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out quad
      const easeProgress = progress * (2 - progress);
      const currentScore = Math.round(start + (end - start) * easeProgress);

      setDisplayScore(currentScore);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [score]);

  return (
    <aside className={styles.sidebar} aria-label="Profile readiness">
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.title}>Readiness</span>
          <div className={styles.scoreBlock}>
            <span className={styles.score} aria-live="polite">
              {displayScore}
              <span className={styles.percentSign}>%</span>
            </span>
          </div>
          <div className={styles.statusContainer}>
            <span className={`${styles.statusDot} ${styles[statusColor]}`} aria-hidden="true" />
            <span className={styles.statusLabel}>{ui.label}</span>
          </div>
          {hasUnsavedChanges && (
            <p className={styles.unsavedHint}>Unsaved changes</p>
          )}
        </div>

        <div className={styles.progressContainer}>
          <div className={styles.progressBarTrack}>
            {/* 60% Core Milestone */}
            <div 
              className={`${styles.tick} ${score >= 60 ? styles.tickActive : ''}`} 
              style={{ left: '60%' }}
            >
              <span className={`${styles.tickLabel} ${score >= 60 ? styles.tickLabelActive : ''}`}>Core</span>
            </div>

            {/* 85% Strong Milestone */}
            <div 
              className={`${styles.tick} ${score >= 85 ? styles.tickActive : ''}`} 
              style={{ left: '85%' }}
            >
              <span className={`${styles.tickLabel} ${score >= 85 ? styles.tickLabelActive : ''}`}>Strong</span>
            </div>

            {/* Animated progress fill via Framer Motion */}
            <motion.div
              className={`${styles.progressFill} ${styles[progressColor]}`}
              initial={{ width: 0 }}
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
            <p>Profile complete — ready for agency review.</p>
          </div>
        ) : topGaps.length > 0 ? (
          <div className={styles.gapsBlock}>
            <p className={styles.gapsLabel}>Next up</p>
            <div className={styles.gapList}>
              {topGaps.map((item) => (
                <GlanceGap
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

        {totalGaps > 0 && (
          <button
            type="button"
            className={`${styles.auditToggle} ${auditOpen ? styles.auditToggleActive : ''}`}
            onClick={onToggleAudit}
            aria-expanded={auditOpen}
          >
            <ClipboardList size={15} aria-hidden="true" />
            {auditOpen ? 'Hide full checklist' : `View full checklist (${totalGaps})`}
          </button>
        )}

        {/* Smooth Expand/Collapse Checklist Audit Panel via Framer Motion */}
        <AnimatePresence initial={false}>
          {auditOpen && totalGaps > 0 && (
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
              {missingRequired.length > 0 && (
                <div className={styles.auditSection}>
                  <p className={styles.auditSectionLabel}>Required</p>
                  {missingRequired.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={styles.gapItem}
                      onClick={() => {
                        const target = scrollTargetByKey[item.key];
                        if (target) onItemClick?.(target);
                      }}
                    >
                      <span className={`${styles.dot} ${styles.dotRed}`} aria-hidden="true" />
                      <span className={styles.gapLabel}>{item.label}</span>
                      <span className={styles.badgeRed}>Required</span>
                    </button>
                  ))}
                </div>
              )}
              {missingImprove.length > 0 && (
                <div className={styles.auditSection}>
                  <p className={styles.auditSectionLabel}>Improve</p>
                  {missingImprove.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={styles.gapItem}
                      onClick={() => {
                        const target = scrollTargetByKey[item.key];
                        if (target) onItemClick?.(target);
                      }}
                    >
                      <span className={`${styles.dot} ${styles.dotSlate}`} aria-hidden="true" />
                      <span className={styles.gapLabel}>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className={styles.saveContainer}>
          <motion.button
            type="button"
            className={`${styles.saveButton} ${!hasChanges && !isSaving ? styles.saveButtonMuted : ''}`}
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
          </motion.button>
        </div>
      </div>
    </aside>
  );
}
