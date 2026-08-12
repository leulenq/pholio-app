import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check, ClipboardList } from 'lucide-react';
import { buildReadinessLists } from './profileReadinessItems';
import PholioButton from '../../../shared/components/ui/PholioButton';
import styles from './ProfileReadinessSidebar.module.css';

const TOOLTIP_PAD = 8;
const TOOLTIP_MIN_WIDTH = 120;
const TOOLTIP_ESTIMATED_HEIGHT = 56;

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

function ReadinessGap({
  item,
  tier,
  scrollTargetByKey,
  onItemClick,
  showTier = false,
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
          {showTier && tier === 'required' ? (
            <span className={styles.gapTier}>Core</span>
          ) : null}
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
  const { isRequiredComplete, fieldCompletion, scrollTargetByKey } = readiness;
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

  const reduceMotion = useReducedMotion();
  const cardRef = useRef(null);

  return (
    <aside className={styles.sidebar} aria-label="Submission checklist">
      <div className={styles.card} ref={cardRef}>
        <div className={styles.header}>
          <h2 className={styles.title}>Submission checklist</h2>
          <p className={styles.statusMessage} aria-live="polite">
            {isRequiredComplete
              ? 'Your required identity, stats, and digitals are in place.'
              : `${missingRequired.length} required ${missingRequired.length === 1 ? 'item is' : 'items are'} still missing.`}
          </p>
          {hasUnsavedChanges ? (
            <p className={styles.unsavedHint}>Unsaved changes — save to update this checklist.</p>
          ) : null}
        </div>

        {isRequiredComplete ? (
          <div className={styles.completeBrief}>
            <Check size={20} className={styles.checkIcon} aria-hidden="true" />
            <p>Required package materials are ready for agency review.</p>
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
                  containerRef={cardRef}
                />
              ))}
            </div>
          </div>
        ) : null}

        {hiddenGapsCount > 0 ? (
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
                          containerRef={cardRef}
                        />
                      ))}
                    </div>
                  ) : null}
                  {hiddenImprove.length > 0 ? (
                    <div className={styles.auditSection}>
                      <p className={styles.auditSectionLabel}>Optional context</p>
                      {hiddenImprove.map((item) => (
                        <ReadinessGap
                          key={item.key}
                          item={item}
                          tier="improve"
                          scrollTargetByKey={scrollTargetByKey}
                          onItemClick={onItemClick}
                          inAuditList
                          containerRef={cardRef}
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
