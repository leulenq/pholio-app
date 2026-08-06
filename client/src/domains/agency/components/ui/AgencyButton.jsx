import React from 'react';
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
  else if (variant === 'danger' || variant === 'destructive') pholioVariant = 'destructive';
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

export function DeclineButton({ children = 'Decline', ...props }) {
  return (
    <AgencyButton variant="danger" {...props}>
      {children}
    </AgencyButton>
  );
}
