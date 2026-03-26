import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import './PholioForms.css';

const PholioCustomSelect = ({ 
  label, 
  options = [], 
  value, 
  onChange, 
  placeholder = "Select an option",
  error,
  disabled = false,
  id
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const blurTimeoutRef = useRef(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  const handleSelect = (optionValue) => {
    onChange?.(optionValue);
    setIsOpen(false);
  };

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={`pholio-form-group ${disabled ? 'disabled' : ''}`} ref={containerRef}>
      {label && <label htmlFor={id} className="pholio-label">{label}</label>}
      
      <div 
        className={`pholio-custom-select-trigger ${isOpen ? 'open' : ''} ${error ? 'error' : ''}`}
        onClick={(e) => {
          if (!disabled) {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(!isOpen);
          }
        }}
        tabIndex={0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        id={id}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            setIsOpen(false);
            return;
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
          if (e.key === 'ArrowDown' && !isOpen) {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
        onBlur={(e) => {
          if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
          const nextFocus = e.relatedTarget;
          if (containerRef.current?.contains(nextFocus)) return;
          blurTimeoutRef.current = setTimeout(() => {
            setIsOpen(false);
          }, 120);
        }}
      >
        <span className={`selected-value ${!selectedOption ? 'placeholder' : ''}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={16} className={`chevron-icon ${isOpen ? 'rotate' : ''}`} />
      </div>

      {isOpen && (
        <div className="pholio-custom-select-dropdown" role="listbox">
          {options.map((option) => (
            <div
              key={option.value}
              className={`pholio-select-option ${value === option.value ? 'selected' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(option.value)}
              role="option"
              aria-selected={value === option.value}
            >
              <span>{option.label}</span>
              {value === option.value && <Check size={14} className="check-icon" />}
            </div>
          ))}
        </div>
      )}
      
      {error && (
        <span className="pholio-error-message" role="alert">
          {error.message || error}
        </span>
      )}
    </div>
  );
};

export default PholioCustomSelect;
