import React from 'react';
import clsx from 'clsx';
import './error-state-primitives.css';

export default function InlineErrorText({ message, className, id }) {
  if (!message) {
    return null;
  }

  const text = typeof message === 'string' ? message : message?.message || String(message);

  return (
    <p id={id} className={clsx('ph-inline-error-text', className)} role="alert">
      {text}
    </p>
  );
}
