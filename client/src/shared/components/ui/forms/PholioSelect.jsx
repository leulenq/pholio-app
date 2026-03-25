import React, { forwardRef, useId } from 'react';
import './PholioForms.css';

const PholioSelect = forwardRef(({ label, options = [], error, className = '', placeholder, id: providedId, ...props }, ref) => {
  const generatedId = useId();
  const selectId = providedId || `select-${generatedId}`;
  const errorId = error ? `${selectId}-error` : undefined;
  
  return (
    <div className={`pholio-form-group ${className}`}>
      {label && (
        <label htmlFor={selectId} className="pholio-label">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={`pholio-select ${error ? 'has-error' : ''}`}
        aria-invalid={!!error}
        aria-describedby={errorId}
        {...props}
      >
        <option value="" disabled>
          {placeholder || 'Select an option'}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <span id={errorId} className="pholio-error-message" role="alert">
          {error.message || error}
        </span>
      )}
    </div>
  );
});

PholioSelect.displayName = 'PholioSelect';

export default PholioSelect;
