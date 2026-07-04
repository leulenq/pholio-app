import React from 'react';
import { Toaster, toast } from 'sonner';
import { AlertTriangle, Check, Info, Loader2 } from 'lucide-react';
import PholioButton from '../ui/PholioButton';
import './PholioToaster.css';

const ICONS = {
  success: Check,
  error: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  loading: Loader2,
};

const KICKERS = {
  success: 'Saved',
  error: 'Needs attention',
  warning: 'Review',
  info: 'Note',
  loading: 'Working',
};

export function PholioToastCard({
  id,
  type = 'info',
  title,
  description,
  meta,
  actionLabel,
  onAction,
}) {
  const Icon = ICONS[type] || Info;
  const kicker = KICKERS[type] || KICKERS.info;
  const isLoading = type === 'loading';

  const stopControlEvent = (event) => {
    event.stopPropagation();
  };

  const handleAction = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    onAction?.();
    toast.dismiss(id);
  };

  return (
    <div className={`pholio-toast-card pholio-toast-card--${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <div className="pholio-toast-card__rail" aria-hidden="true" />
      <div className="pholio-toast-card__body">
        <div className="pholio-toast-card__masthead">
          <span className="pholio-toast-card__kicker">
            <Icon size={12} className={isLoading ? 'pholio-toast-card__spin' : ''} aria-hidden="true" />
            {kicker}
          </span>
        </div>

        <div className="pholio-toast-card__title">{title}</div>
        {description ? (
          <div className="pholio-toast-card__description">{description}</div>
        ) : null}

        {(meta || actionLabel) ? (
          <div className="pholio-toast-card__footer">
            {meta ? <span className="pholio-toast-card__meta">{meta}</span> : <span />}
            {actionLabel && onAction ? (
              <PholioButton
                type="button"
                variant="meta"
                className="pholio-toast-card__action"
                onPointerDown={stopControlEvent}
                onPointerUp={stopControlEvent}
                onClick={handleAction}
              >
                {actionLabel}
              </PholioButton>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function PholioToaster() {
  return (
    <Toaster
      position="top-right"
      visibleToasts={1}
      gap={0}
      offset={{ top: 104, right: 40 }}
      mobileOffset={{ top: 88, right: 16, left: 16 }}
      toastOptions={{
        duration: 3000,
        classNames: {
          toast: 'pholio-sonner-toast',
          title: 'pholio-sonner-title',
          description: 'pholio-sonner-description',
          actionButton: 'pholio-sonner-action',
          cancelButton: 'pholio-sonner-cancel',
          closeButton: 'pholio-sonner-close',
          success: 'pholio-sonner-toast--success',
          error: 'pholio-sonner-toast--error',
          warning: 'pholio-sonner-toast--warning',
          info: 'pholio-sonner-toast--info',
          loading: 'pholio-sonner-toast--loading',
        },
      }}
    />
  );
}
