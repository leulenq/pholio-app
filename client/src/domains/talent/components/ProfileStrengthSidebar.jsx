import React from 'react';
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
  isDisabled,
  onSaveClick,
  onItemClick,
  auditOpen,
  onToggleAudit,
}) {
  const { score, isRequiredComplete, fieldCompletion, scrollTargetByKey } = strength;
  const ui = getStrengthUI(score, isRequiredComplete);
  const hasUnsavedChanges = !isDisabled && !isSaving;

  const { missingRequired, missingImprove, topGaps } = buildReadinessLists(fieldCompletion);
  const totalGaps = missingRequired.length + missingImprove.length;
  const isComplete = isRequiredComplete && missingImprove.length === 0;

  const statusColor = isRequiredComplete ? (score === 100 ? 'statusGold' : 'statusGreen') : 'statusRed';
  const progressColor = isRequiredComplete ? (score === 100 ? 'statusGold' : 'progressGreen') : 'progressRed';

  return (
    <aside className={styles.sidebar} aria-label="Profile readiness">
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.title}>Readiness</span>
          <div className={styles.scoreBlock}>
            <span className={styles.score} aria-live="polite">{score}%</span>
            <div className={`${styles.statusPill} ${styles[statusColor]}`}>
              {ui.label}
            </div>
          </div>
          {hasUnsavedChanges && (
            <p className={styles.unsavedHint}>Unsaved changes</p>
          )}
        </div>

        <div className={styles.progressContainer}>
          <div className={styles.progressBar}>
            <div
              className={`${styles.progressFill} ${styles[progressColor]}`}
              style={{ width: `${score}%` }}
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

        {auditOpen && totalGaps > 0 && (
          <div className={styles.auditPanel} role="region" aria-label="Full profile checklist">
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
          </div>
        )}

        <div className={styles.saveContainer}>
          <button
            type="submit"
            form="profile-form"
            className={styles.saveButton}
            onClick={onSaveClick}
            disabled={isDisabled}
          >
            {isSaving ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                <span>Synchronizing...</span>
              </>
            ) : (
              'Save profile'
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
