import React from 'react';
import { RotateCcw } from 'lucide-react';
import ErrorStateCard from './ErrorStateCard';

export default function TransferFailureNotice({
  title = 'Transfer interrupted',
  body = 'Your upload or download did not finish. Retry the transfer.',
  retry,
  className,
}) {
  return (
    <ErrorStateCard
      variant="compact"
      context="transfer"
      severity="error"
      icon={RotateCcw}
      title={title}
      body={body}
      retry={retry}
      className={className}
    />
  );
}
