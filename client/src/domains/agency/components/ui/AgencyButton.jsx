import React from 'react';
import { Loader2, X } from 'lucide-react';
import PholioButton from '../../../../shared/components/ui/PholioButton';
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
  let pholioVariant = 'primary';
  if (variant === 'secondary') pholioVariant = 'secondary';
  else if (variant === 'ghost' || variant === 'tertiary') pholioVariant = 'tertiary';
  else if (variant === 'destructive') pholioVariant = 'destructive';
  else if (variant === 'icon') pholioVariant = 'icon';

  let resolvedIcon = null;
  if (Icon) {
    resolvedIcon = React.isValidElement(Icon) ? Icon : <Icon size={size === 'sm' ? 14 : 16} />;
  }

  return (
    <PholioButton
      type={type}
      variant={pholioVariant}
      loading={loading}
      disabled={disabled}
      icon={resolvedIcon}
      className={className}
      {...props}
    >
      {children}
    </PholioButton>
  );
}

export function DeclineButton({ children = 'Decline', loading, disabled, ...props }) {
  return (
    <button
      type="button"
      className="tact-btn tact-btn--danger"
      disabled={loading || disabled}
      {...props}
    >
      {loading ? <Loader2 className="agency-btn-spinner" size={15} /> : <X size={15} />}
      <span>{children}</span>
    </button>
  );
}
