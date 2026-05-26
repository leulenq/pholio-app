import React, { forwardRef, useId } from 'react';
import InlineErrorText from '../../states/InlineErrorText';
import './PholioForms.css';

const PholioTextarea = forwardRef(({ label, error, className = '', id: providedId, ...props }, ref) => {
  const generatedId = useId();
  const textareaId = providedId || `textarea-${generatedId}`;
  const errorId = error ? `${textareaId}-error` : undefined;
  
  return (
    <div className={`pholio-form-group ${className}`}>
      {label && (
        <label htmlFor={textareaId} className="pholio-label">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        className={`pholio-textarea ${error ? 'has-error' : ''}`}
        aria-invalid={!!error}
        aria-describedby={errorId}
        {...props}
      />
      {error && <InlineErrorText id={errorId} message={error} className="pholio-error-message" />}
    </div>
  );
});

PholioTextarea.displayName = 'PholioTextarea';

export default PholioTextarea;
