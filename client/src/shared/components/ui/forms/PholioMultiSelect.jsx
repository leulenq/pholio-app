import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import './PholioForms.css';

const PholioMultiSelect = ({ 
  label, 
  options = [], 
  value = [], 
  onChange, 
  placeholder = "Select options",
  error,
  disabled = false,
  id
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optionValue) => {
    const safeValue = Array.isArray(value) ? value : [];
    let newValue;
    if (safeValue.includes(optionValue)) {
      newValue = safeValue.filter(v => v !== optionValue);
    } else {
      newValue = [...safeValue, optionValue];
    }
    onChange?.(newValue);
  };

  const removeTag = (e, optionValue) => {
    e.stopPropagation();
    const safeValue = Array.isArray(value) ? value : [];
    const newValue = safeValue.filter(v => v !== optionValue);
    onChange?.(newValue);
  };

  const safeValue = Array.isArray(value) ? value : [];

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
      >
        <div className="pholio-tags-container pr-8">
          {safeValue.length === 0 && (
            <span className="selected-value placeholder text-gray-400 italic">
              {placeholder}
            </span>
          )}
          
          {safeValue.map(val => {
             const opt = options.find(o => o.value === val);
             return (
               <span 
                 key={val} 
                 className="pholio-tag"
                 onClick={(e) => e.stopPropagation()}
               >
                 {opt ? opt.label : val}
                 <X 
                   size={14} 
                   className="pholio-tag-remove"
                   onClick={(e) => removeTag(e, val)}
                 />
               </span>
             );
          })}
        </div>

        <ChevronDown size={16} className={`chevron-icon absolute right-4 top-1/2 -translate-y-1/2 ${isOpen ? 'rotate' : ''}`} />
      </div>

      {isOpen && (
        <div className="pholio-custom-select-dropdown" role="listbox">
          {options.map((option) => {
            const isSelected = safeValue.includes(option.value);
            return (
              <div
                key={option.value}
                className={`pholio-select-option ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelect(option.value)}
                role="option"
                aria-selected={isSelected}
              >
                <span>{option.label}</span>
                {isSelected && <Check size={14} className="check-icon" />}
              </div>
            );
          })}
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

export default PholioMultiSelect;
