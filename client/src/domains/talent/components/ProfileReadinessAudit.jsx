import React from 'react';
import { Check, X } from 'lucide-react';
import { buildReadinessLists } from './profileReadinessItems';
import PholioButton, { PholioIconButton } from '../../../shared/components/ui/PholioButton';
import styles from './ProfileReadinessAudit.module.css';

function AuditItem({ item, tier, scrollTargetByKey, onItemClick }) {
  if (item.isComplete) return null;

  const targetSection = scrollTargetByKey[item.key];
  return (
    <PholioButton
      type="button"
      variant="tertiary"
      className={styles.auditItem}
      onClick={() => targetSection && onItemClick?.(targetSection)}
      disabled={!targetSection}
    >
      <span className={styles.auditLabel}>{item.label}</span>
      {tier === 'required' ? <span>Required</span> : null}
    </PholioButton>
  );
}

export default function ProfileReadinessAudit({
  fieldCompletion,
  scrollTargetByKey,
  isRequiredComplete,
  onItemClick,
  onClose,
}) {
  const { missingRequired, missingImprove } = buildReadinessLists(fieldCompletion);
  const totalOpen = missingRequired.length + missingImprove.length;

  if (totalOpen === 0 && isRequiredComplete) {
    return (
      <section className={styles.audit} aria-labelledby="readiness-audit-title">
        <header className={styles.auditHead}>
          <div>
            <h2 id="readiness-audit-title" className={styles.auditTitle}>
              Profile <em>complete</em>
            </h2>
          </div>
          <PholioIconButton type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close checklist">
            <X size={18} />
          </PholioIconButton>
        </header>
        <div className={styles.completeState}>
          <Check size={28} className={styles.completeIcon} aria-hidden="true" />
          <p>Your book is ready for agency review.</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.audit} aria-labelledby="readiness-audit-title">
      <header className={styles.auditHead}>
        <div>
          <h2 id="readiness-audit-title" className={styles.auditTitle}>
            Full <em>checklist</em>
          </h2>
          <p className={styles.auditLede}>
            {totalOpen} {totalOpen === 1 ? 'item' : 'items'} to address — tap any row to jump to that section.
          </p>
        </div>
        <PholioIconButton type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close checklist">
          <X size={18} />
        </PholioIconButton>
      </header>

      <div className={styles.auditGrid}>
        {missingRequired.length > 0 && (
          <div className={styles.auditColumn}>
            <h3 className={styles.columnTitle}>Essential</h3>
            <div className={styles.auditList}>
              {missingRequired.map((item) => (
                <AuditItem
                  key={item.key}
                  item={item}
                  tier="required"
                  scrollTargetByKey={scrollTargetByKey}
                  onItemClick={onItemClick}
                />
              ))}
            </div>
          </div>
        )}

        {missingImprove.length > 0 && (
          <div className={styles.auditColumn}>
            <h3 className={styles.columnTitle}>Enhancements</h3>
            <div className={styles.auditList}>
              {missingImprove.map((item) => (
                <AuditItem
                  key={item.key}
                  item={item}
                  tier="improve"
                  scrollTargetByKey={scrollTargetByKey}
                  onItemClick={onItemClick}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
