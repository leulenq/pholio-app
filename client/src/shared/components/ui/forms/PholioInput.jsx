import React, { forwardRef, useId } from 'react';
import InlineErrorText from '../../states/InlineErrorText';
import './PholioForms.css';

const PholioInput = forwardRef(({ label, error, prefix, className = '', id: providedId, ...props }, ref) => {
  const generatedId = useId();
  const inputId = providedId || `input-${generatedId}`;
  const hasPrefix = !!prefix;
  const errorId = error ? `${inputId}-error` : undefined;
  
  return (
    <div className={`pholio-form-group ${className}`}>
      {label && (
        <label htmlFor={inputId} className="pholio-label">
          {label}
        </label>
      )}
      <div className={hasPrefix ? 'pholio-input-with-prefix' : ''}>
        {hasPrefix && <span className="pholio-input-prefix" aria-hidden="true">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          className={`pholio-input ${error ? 'has-error' : ''}`}
          aria-invalid={!!error}
          aria-describedby={errorId}
          {...props}
        />
      </div>
      {error && <InlineErrorText id={errorId} message={error} className="pholio-error-message" />}
    </div>
  );
});

PholioInput.displayName = 'PholioInput';

export default PholioInput;
