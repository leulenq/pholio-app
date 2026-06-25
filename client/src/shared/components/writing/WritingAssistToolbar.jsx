import React from 'react';
import { Sparkles } from 'lucide-react';
import styles from './WritingAssistToolbar.module.css';

/**
 * Ambient writing assist controls — matches Profile bio pattern.
 * @param {{
 *   actions: Array<{ id: string, label: string, onClick: () => void, disabled?: boolean }>,
 *   busy?: boolean,
 *   busyLabel?: string,
 *   onUndo?: () => void,
 *   showUndo?: boolean,
 *   className?: string,
 * }} props
 */
export default function WritingAssistToolbar({
  actions = [],
  busy = false,
  busyLabel = 'Working…',
  onUndo,
  showUndo = false,
  className = '',
}) {
  if (!actions.length && !showUndo) return null;

  return (
    <div className={`${styles.toolbar} ${className}`.trim()}>
      <div className={styles.actions}>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={styles.actionBtn}
            onClick={action.onClick}
            disabled={busy || action.disabled}
          >
            <Sparkles size={11} className={busy ? styles.spin : ''} aria-hidden />
            {busy ? busyLabel : action.label}
          </button>
        ))}
      </div>
      {showUndo && onUndo ? (
        <button type="button" className={styles.undoBtn} onClick={onUndo}>
          Revert to original
        </button>
      ) : null}
    </div>
  );
}
