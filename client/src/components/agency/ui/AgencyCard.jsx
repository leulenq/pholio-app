import React from 'react';
import './AgencyCard.css';

export function AgencyCard({
  children,
  variant = 'default',
  hover = true,
  className = '',
  onClick
}) {
  return (
    <div
      className={`agency-card agency-card--${variant} ${hover ? 'agency-card--hover' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}

export function AgencyCardHeader({ children, className = '' }) {
  return (
    <div className={`agency-card-header ${className}`}>
      {children}
    </div>
  );
}

export function AgencyCardTitle({ children, className = '' }) {
  return (
    <h3 className={`agency-card-title ${className}`}>
      {children}
    </h3>
  );
}

export function AgencyCardContent({ children, className = '' }) {
  return (
    <div className={`agency-card-content ${className}`}>
      {children}
    </div>
  );
}

export function AgencyCardFooter({ children, className = '' }) {
  return (
    <div className={`agency-card-footer ${className}`}>
      {children}
    </div>
  );
}
