import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import PholioButton from './PholioButton';
import './ConfirmationDialog.css';

/**
 * ConfirmationDialog — simple confirm/cancel modal
 */
export default function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  count,
  isConfirming = false,
  onConfirm,
  onCancel,
}) {
  React.useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !isConfirming) onCancel?.();
    };
    document.addEventListener('keydown', onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [isOpen, isConfirming, onCancel]);

  if (!isOpen || typeof document === 'undefined') return null;

  const variantStyles = {
    danger: { icon: AlertTriangle, iconClass: 'cfd-icon--danger', btnClass: 'cfd-btn--danger' },
    warning: { icon: AlertTriangle, iconClass: 'cfd-icon--warning', btnClass: 'cfd-btn--warning' },
    info: { icon: Info, iconClass: 'cfd-icon--info', btnClass: 'cfd-btn--info' },
  };

  const style = variantStyles[variant] || variantStyles.danger;
  const Icon = style.icon;

  return createPortal(
    <div
      className="cfd-overlay"
      role="presentation"
      onClick={() => { if (!isConfirming) onCancel?.(); }}
    >
      <div
        className="cfd-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cfd-title"
        aria-describedby="cfd-message"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cfd-body">
          <div className={`cfd-icon ${style.iconClass}`}>
            <Icon size={18} aria-hidden="true" />
          </div>

          <div className="cfd-copy">
            <h3 id="cfd-title" className="cfd-title">{title}</h3>
            <p id="cfd-message" className="cfd-message">{message}</p>
            {count !== undefined && (
              <p className="cfd-count">
                {count} applicant{count !== 1 ? 's' : ''} will be affected.
              </p>
            )}
          </div>

          <div className="cfd-foot">
            <PholioButton
              type="button"
              variant="tertiary"
              disabled={isConfirming}
              onClick={onCancel}
            >
              {cancelLabel}
            </PholioButton>
            <PholioButton
              type="button"
              variant={variant === 'danger' ? 'destructive' : 'primary'}
              disabled={isConfirming}
              onClick={onConfirm}
            >
              {isConfirming ? (
                <>
                  <Loader2 size={14} className="cfd-spin" aria-hidden="true" />
                  {confirmLabel}
                </>
              ) : confirmLabel}
            </PholioButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
