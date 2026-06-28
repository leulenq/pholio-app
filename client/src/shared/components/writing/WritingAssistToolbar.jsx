import React from 'react';
import { Loader2 } from 'lucide-react';
import PholioButton from '../ui/PholioButton';
import styles from './WritingAssistToolbar.module.css';

/**
 * Ambient writing assist controls — matches Profile bio pattern.
 * @param {{
 *   actions: Array<{ id: string, label: string, onClick: () => void, disabled?: boolean, emphasis?: 'primary' }>,
 *   busy?: boolean,
 *   busyActionId?: string | null,
 *   busyLabel?: string,
 *   onUndo?: () => void,
 *   showUndo?: boolean,
 *   className?: string,
 *   variant?: 'filter' | 'architectural',
 *   buttonSystem?: 'native' | 'dashboard',
 * }} props
 */
export default function WritingAssistToolbar({
  actions = [],
  busy = false,
  busyActionId = null,
  busyLabel = 'Working…',
  onUndo,
  showUndo = false,
  className = '',
  variant = 'filter',
  buttonSystem = 'native',
}) {
  if (!actions.length && !showUndo) return null;

  return (
    <div
      className={[
        styles.toolbar,
        variant === 'architectural' ? styles.toolbarArchitectural : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className={styles.actions}>
        {actions.map((action) => {
          const isBusyAction =
            busy && (!busyActionId || action.id === busyActionId);

          const content = (
            <>
              {isBusyAction ? (
                <Loader2 size={11} className={styles.spin} aria-hidden />
              ) : null}
              {isBusyAction ? busyLabel : action.label}
            </>
          );

          return buttonSystem === 'dashboard' ? (
            <PholioButton
              key={action.id}
              type="button"
              variant={action.emphasis === 'primary' ? 'primary' : 'secondary'}
              system="dashboard"
              onClick={action.onClick}
              disabled={busy || action.disabled}
              aria-busy={isBusyAction || undefined}
            >
              {content}
            </PholioButton>
          ) : (
            <button
              key={action.id}
              type="button"
              className={[
                styles.actionBtn,
                action.emphasis === 'primary' ? styles.actionBtnPrimary : '',
                isBusyAction ? styles.actionBtnBusy : '',
              ].filter(Boolean).join(' ')}
              onClick={action.onClick}
              disabled={busy || action.disabled}
              aria-busy={isBusyAction || undefined}
            >
              {content}
            </button>
          );
        })}
      </div>
      {showUndo && onUndo ? (
        buttonSystem === 'dashboard' ? (
          <PholioButton type="button" variant="ghost" size="sm" system="dashboard" onClick={onUndo}>
            Revert to original
          </PholioButton>
        ) : (
          <button type="button" className={styles.undoBtn} onClick={onUndo}>
            Revert to original
          </button>
        )
      ) : null}
    </div>
  );
}
