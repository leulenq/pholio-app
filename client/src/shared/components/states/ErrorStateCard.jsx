import React from 'react';
import clsx from 'clsx';
import { AlertTriangle } from 'lucide-react';
import PholioButton from '../ui/PholioButton';
import './error-state-primitives.css';

function ErrorStateAction({ action, tone = 'secondary' }) {
  if (!action?.label || typeof action.onClick !== 'function') {
    return null;
  }

  return (
    <PholioButton
      type="button"
      variant={tone === 'primary' ? 'primary' : 'secondary'}
      onClick={action.onClick}
    >
      {action.label}
    </PholioButton>
  );
}

export default function ErrorStateCard({
  variant = 'section',
  severity = 'error',
  context = 'generic',
  title,
  body,
  icon: Icon = AlertTriangle,
  retry,
  primaryAction,
  secondaryAction,
  supportingMeta,
  className,
}) {
  return (
    <section
      className={clsx(
        'ph-error-card',
        `ph-error-card--${variant}`,
        `ph-error-card--${severity}`,
        `ph-error-card--${context}`,
        className,
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="ph-error-icon-wrap" aria-hidden="true">
        <Icon size={20} />
      </div>
      <h2 className="ph-error-title">{title}</h2>
      {body ? <p className="ph-error-body">{body}</p> : null}
      {supportingMeta ? <p className="ph-error-meta">{supportingMeta}</p> : null}
      <div className="ph-error-actions">
        <ErrorStateAction action={primaryAction} tone="primary" />
        {retry ? <ErrorStateAction action={retry} tone="primary" /> : null}
        <ErrorStateAction action={secondaryAction} tone="secondary" />
      </div>
    </section>
  );
}
