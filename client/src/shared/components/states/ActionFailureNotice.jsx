import React from 'react';
import { Ban } from 'lucide-react';
import ErrorStateCard from './ErrorStateCard';

export default function ActionFailureNotice({
  title = 'Action unavailable',
  body = 'We could not complete that action. Try again in a moment.',
  retry,
  secondaryAction,
  supportingMeta,
  className,
}) {
  return (
    <ErrorStateCard
      variant="compact"
      context="action"
      severity="error"
      icon={Ban}
      title={title}
      body={body}
      retry={retry}
      secondaryAction={secondaryAction}
      supportingMeta={supportingMeta}
      className={className}
    />
  );
}
