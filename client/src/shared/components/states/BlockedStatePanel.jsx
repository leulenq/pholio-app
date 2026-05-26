import React from 'react';
import { Lock } from 'lucide-react';
import ErrorStateCard from './ErrorStateCard';

export default function BlockedStatePanel({
  title = 'This area is currently locked',
  body = 'Complete the required profile steps to unlock this section.',
  eyebrow = 'Profile requirement',
  primaryAction,
  secondaryAction,
  variant = 'section',
  className,
}) {
  return (
    <ErrorStateCard
      variant={variant}
      context="blocked"
      severity="warning"
      icon={Lock}
      eyebrow={eyebrow}
      title={title}
      body={body}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
      className={className}
    />
  );
}
