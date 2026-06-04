import React, { useState, useRef } from 'react';
import { X, Plus } from 'lucide-react';
import './PholioForms.css';

const PholioTagInput = ({ 
  label, 
  value = [], 
  onChange, 
  placeholder = "Type and press Enter...",
  error,
  disabled = false,
  id
}) => {
  const [inputValue, setInputValue] = useState('');
  const containerRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      // Remove last tag if input is empty and backspace is pressed
      const newValue = [...value];
      newValue.pop();
      onChange?.(newValue);
    }
  };

  const addTag = () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput) return;

    const safeValue = Array.isArray(value) ? value : [];
    if (!safeValue.includes(trimmedInput)) {
      onChange?.([...safeValue, trimmedInput]);
    }
    setInputValue('');
  };

  const removeTag = (tagToRemove) => {
    onChange?.(value.filter(tag => tag !== tagToRemove));
  };

  // Ensure value is always an array
  const safeValue = Array.isArray(value) ? value : [];

  return (
    <div className={`pholio-form-group ${disabled ? 'disabled' : ''}`} ref={containerRef}>
      {label && <label htmlFor={id} className="pholio-label">{label}</label>}
      
      <div 
        className={`pholio-tags-wrapper ${error ? 'error' : ''}`}
        onClick={() => containerRef.current?.querySelector('input')?.focus()}
      >
        {safeValue.map((tag, index) => (
          <span 
            key={index} 
            className="pholio-premium-tag"
            onClick={(e) => {
              e.stopPropagation();
              removeTag(tag);
            }}
            title="Click to remove"
          >
            {tag}
            <X size={12} className="pholio-tag-x" />
          </span>
        ))}
        
        <input
          id={id}
          type="text"
          className="pholio-premium-tag-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          placeholder={safeValue.length === 0 ? placeholder : "+"}
          disabled={disabled}
        />
      </div>
      
      {error && (
        <span className="pholio-error-message" role="alert">
          {error.message || error}
        </span>
      )}
    </div>
  );
};

export default PholioTagInput;
