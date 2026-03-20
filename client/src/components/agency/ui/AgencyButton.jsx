import React from 'react';
import { Loader2 } from 'lucide-react';
import './AgencyButton.css';

export function AgencyButton({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`agency-btn agency-btn--${variant} agency-btn--${size} ${className}`}
      disabled={loading || disabled}
      {...props}
    >
      {loading ? (
        <Loader2 className="agency-btn-spinner" size={18} />
      ) : Icon ? (
        <Icon size={18} />
      ) : null}
      {children}
    </button>
  );
}
