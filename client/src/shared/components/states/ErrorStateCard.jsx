import React from 'react';
import clsx from 'clsx';
import { AlertTriangle } from 'lucide-react';
import './error-state-primitives.css';

function ErrorStateAction({ action, tone = 'secondary' }) {
  if (!action?.label || typeof action.onClick !== 'function') {
    return null;
  }

  return (
    <button
      type="button"
      className={clsx('ph-error-action', {
        'ph-error-action--primary': tone === 'primary',
        'ph-error-action--secondary': tone !== 'primary',
      })}
      onClick={action.onClick}
    >
      {action.label}
    </button>
  );
}

export default function ErrorStateCard({
  variant = 'section',
  severity = 'error',
  context = 'generic',
  title,
  body,
  eyebrow,
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
      {eyebrow ? <p className="ph-error-eyebrow">{eyebrow}</p> : null}
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
