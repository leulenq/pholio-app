import React, { forwardRef } from 'react';
import clsx from 'clsx';
import '../../styles/ui.css';

export const Input = forwardRef(({ label, error, helpText, className, type = 'text', ...props }, ref) => {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <input
        ref={ref}
        type={type}
        className={clsx('form-input', error && 'has-error', className)}
        {...props}
      />
      {error && <p className="form-error">{error.message}</p>}
      {helpText && !error && <p className="form-help">{helpText}</p>}
    </div>
  );
});

export const TextArea = forwardRef(({ label, error, helpText, className, rows = 4, ...props }, ref) => {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <textarea
        ref={ref}
        rows={rows}
        className={clsx('form-textarea', error && 'has-error', className)}
        {...props}
      />
      {error && <p className="form-error">{error.message}</p>}
      {helpText && !error && <p className="form-help">{helpText}</p>}
    </div>
  );
});

export const Select = forwardRef(({ label, error, helpText, className, options = [], placeholder = 'Select...', ...props }, ref) => {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <select
        ref={ref}
        className={clsx('form-select', error && 'has-error', className)}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="form-error">{error.message}</p>}
      {helpText && !error && <p className="form-help">{helpText}</p>}
    </div>
  );
});

export const Button = ({ children, variant = 'primary', className, loading, ...props }) => {
  return (
    <button
      className={clsx('btn', `btn-${variant}`, className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? 'Loading...' : children}
    </button>
  );
};

export const Accordion = ({ title, children, defaultOpen = false, className }) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className={clsx('accordion', className)}>
      <button 
        type="button" 
        className={clsx('accordion-header', isOpen && 'bg-zinc-50')} 
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-semibold text-lg text-zinc-900">{title}</span>
        <span className={clsx('accordion-icon', isOpen && 'rotate-180')}>▼</span>
      </button>
      {isOpen && (
        <div className="accordion-content">
          {children}
        </div>
      )}
    </div>
  );
};
