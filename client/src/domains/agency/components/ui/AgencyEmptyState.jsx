import React from 'react';
import './AgencyEmptyState.css';

export function AgencyEmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'default',
  className = ''
}) {
  return (
    <div className={`agency-empty-state agency-empty-state--${variant} ${className}`}>
      {Icon && (
        <div className={`agency-empty-icon agency-empty-icon--${variant}`}>
          <Icon size={40} />
        </div>
      )}
      <h3 className="agency-empty-title">{title}</h3>
      {description && (
        <p className="agency-empty-description">{description}</p>
      )}
      {action && (
        <div className="agency-empty-action">
          {action}
        </div>
      )}
    </div>
  );
}
