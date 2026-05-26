import React from 'react';
import ErrorStateCard from './ErrorStateCard';

export default function EmptyErrorState({
  title = 'We could not load this view',
  body = 'Refresh this section or retry to continue where you left off.',
  retry,
  supportingMeta,
  variant = 'section',
}) {
  return (
    <ErrorStateCard
      variant={variant}
      context="empty-error"
      severity="error"
      title={title}
      body={body}
      retry={retry}
      supportingMeta={supportingMeta}
    />
  );
}
