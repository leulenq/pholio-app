/**
 * Comp card import, as an overlay.
 *
 * Import is a one-off act, not a permanent fixture of the profile page — most
 * talent will use it once, at the start, and never again. So it lives behind a
 * trigger and takes the screen only while it is being used.
 *
 * It stays on Profile rather than moving to the media workspace on purpose:
 * import creates no image records at all, and sitting it among uploads would
 * suggest the card's photographs come across with it. They do not, and a card
 * standing in for the structured profile is the thing the product is built to
 * prevent.
 */

import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import CompCardImport from './CompCardImport';
import styles from './CompCardImportOverlay.module.css';

export default function CompCardImportOverlay({ open, onClose, onApplied }) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  const handleApplied = useCallback(
    (result) => {
      onApplied?.(result);
    },
    [onApplied],
  );

  // Escape closes, focus returns where it came from, and the page behind does
  // not scroll while the dialog owns the screen.
  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.scrim}
      onMouseDown={(event) => {
        // Only a click that both starts and ends on the scrim dismisses, so a
        // drag that ends outside a text field does not close the review.
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Import an existing comp card"
        tabIndex={-1}
        className={styles.panel}
      >
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <X size={18} strokeWidth={1.5} />
        </button>
        <CompCardImport onApplied={handleApplied} onDone={onClose} />
      </div>
    </div>,
    document.body,
  );
}
