import React, { forwardRef, useId } from 'react';
import './PholioForms.css';

const PholioToggle = forwardRef(({ label, checked, onChange, className = '', id: providedId, ...props }, ref) => {
  const generatedId = useId();
  const toggleId = providedId || `toggle-${generatedId}`;
  
  return (
    <div className={`pholio-toggle-wrapper ${className}`}>
      <input
        type="checkbox"
        ref={ref}
        id={toggleId}
        className="pholio-toggle-input"
        checked={checked}
        onChange={onChange}
        aria-checked={checked}
        {...props}
      />
      <label htmlFor={toggleId} className="pholio-toggle-switch" aria-hidden="true" />
      {label && (
        <label htmlFor={toggleId} className="pholio-toggle-label">
          {label}
        </label>
      )}
    </div>
  );
});

PholioToggle.displayName = 'PholioToggle';

export default PholioToggle;
