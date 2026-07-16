import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './AgencyModal.css';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * AgencyModal — the ONE modal primitive for the agency surface.
 *
 * - Portals to document.body.
 * - Full-screen functional scrim (`position: fixed; inset: 0`). This is the
 *   only place `backdrop-filter: blur()` is permitted in the agency system.
 * - Centered panel (12px radius, Overlay-LG shadow).
 * - Focus trap: Tab / Shift+Tab cycle within the panel; initial focus lands on
 *   the title (or the panel itself); focus returns to the invoker on close.
 * - Escape and scrim-click both close.
 * - `role="dialog"` + `aria-modal="true"`, labelled by the title.
 * - Reduced-motion safe: fade + small rise normally, crossfade under reduce.
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {React.ReactNode} title       Rendered as the dialog's <h2> label.
 * @param {React.ReactNode} children
 * @param {React.ReactNode} [footer]    Optional footer (actions).
 * @param {React.RefObject} [initialFocusRef] Element to focus on open.
 * @param {string} [closeLabel]         Accessible label for the close button.
 */
export function AgencyModal({
  open,
  onClose,
  title,
  children,
  footer,
  initialFocusRef,
  closeLabel = 'Close',
  className = '',
}) {
  const panelRef = useRef(null);
  const headingRef = useRef(null);
  const invokerRef = useRef(null);
  const titleId = useId();

  // Remember what had focus when the modal opened, so we can restore it.
  useEffect(() => {
    if (open) {
      invokerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Initial focus after paint.
    const focusTimer = window.setTimeout(() => {
      const target =
        initialFocusRef?.current || headingRef.current || panelRef.current;
      target?.focus();
    }, 0);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const nodes = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (node) => node.offsetParent !== null || node === document.activeElement
      );

      if (nodes.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || active === panel || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = prevOverflow;
      const invoker = invokerRef.current;
      if (invoker && typeof invoker.focus === 'function') {
        invoker.focus();
      }
    };
  }, [open, onClose, initialFocusRef]);

  if (!open) return null;

  // Close only when the press starts AND ends on the scrim itself — prevents a
  // text-selection drag that ends outside the panel from closing the modal.
  const handleScrimMouseDown = (event) => {
    if (event.target === event.currentTarget) {
      onClose?.();
    }
  };

  return createPortal(
    <div className="ag-modal-scrim" onMouseDown={handleScrimMouseDown}>
      <div
        ref={panelRef}
        className={`ag-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        <div className="ag-modal-head">
          {title ? (
            <h2 id={titleId} ref={headingRef} tabIndex={-1} className="ag-modal-title">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="ag-modal-close"
            onClick={() => onClose?.()}
            aria-label={closeLabel}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="ag-modal-body">{children}</div>

        {footer ? <div className="ag-modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

export default AgencyModal;
