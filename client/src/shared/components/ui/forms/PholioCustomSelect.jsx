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
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const listboxRef = useRef(null);
  const blurTimeoutRef = useRef(null);
  const selectId = id || 'pholio-select';

  // Sync activeIndex with selected value or first item when opening
  useEffect(() => {
    if (isOpen) {
      const selectedIdx = options.findIndex(opt => opt.value === value);
      setActiveIndex(selectedIdx >= 0 ? selectedIdx : 0);
    } else {
      setActiveIndex(-1);
    }
  }, [isOpen, value, options]);

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

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isOpen) {
        if (activeIndex >= 0 && activeIndex < options.length) {
          handleSelect(options[activeIndex].value);
        }
      } else {
        setIsOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setActiveIndex((prev) => (prev + 1) % options.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setActiveIndex((prev) => (prev - 1 + options.length) % options.length);
      }
      return;
    }
    if (e.key === 'Home') {
      if (isOpen) {
        e.preventDefault();
        setActiveIndex(0);
      }
      return;
    }
    if (e.key === 'End') {
      if (isOpen) {
        e.preventDefault();
        setActiveIndex(options.length - 1);
      }
      return;
    }
  };

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={`pholio-form-group ${disabled ? 'disabled' : ''}`} ref={containerRef}>
      {label && <label htmlFor={selectId} className="pholio-label">{label}</label>}
      
      <div className="pholio-select-control-wrapper">
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
          aria-controls={`${selectId}-listbox`}
          aria-activedescendant={isOpen && activeIndex >= 0 ? `${selectId}-opt-${activeIndex}` : undefined}
          id={selectId}
          onKeyDown={handleKeyDown}
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
          <div ref={listboxRef} id={`${selectId}-listbox`} className="pholio-custom-select-dropdown" role="listbox" aria-label={label || placeholder}>
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${selectId}-opt-${index}`}
                className={`pholio-select-option ${value === option.value ? 'selected' : ''} ${index === activeIndex ? 'active' : ''}`}
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
      </div>
      
      {error && (
        <span className="pholio-error-message" role="alert">
          {error.message || error}
        </span>
      )}
    </div>
  );
};

export default PholioCustomSelect;
