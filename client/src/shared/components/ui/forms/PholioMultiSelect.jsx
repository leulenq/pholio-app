import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, X, Search } from 'lucide-react';
import './PholioForms.css';

const PholioMultiSelect = ({ 
  label, 
  options = [], 
  value = [], 
  onChange, 
  placeholder = "Select options",
  error,
  disabled = false,
  id,
  searchable = false,
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const listboxRef = useRef(null);
  const blurTimeoutRef = useRef(null);
  const searchInputRef = useRef(null);
  const selectId = id || 'pholio-multiselect';

  const openSelect = () => {
    setActiveIndex(options.length ? 0 : -1);
    setIsOpen(true);
  };

  const closeSelect = () => {
    setIsOpen(false);
    setActiveIndex(-1);
    setSearchQuery('');
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        closeSelect();
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

  const filteredOptions = useMemo(() => {
    if (!searchable) return options;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (option) =>
        String(option.label ?? '').toLowerCase().includes(q) ||
        String(option.value ?? '').toLowerCase().includes(q),
    );
  }, [options, searchable, searchQuery]);

  useEffect(() => {
    if (isOpen && searchable) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [isOpen, searchable]);

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSelect();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isOpen) {
        if (!searchable && activeIndex >= 0 && activeIndex < filteredOptions.length) {
          handleSelect(filteredOptions[activeIndex].value);
        }
      } else {
        openSelect();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        openSelect();
      } else if (filteredOptions.length > 0) {
        setActiveIndex((prev) => (prev + 1) % filteredOptions.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        openSelect();
      } else if (filteredOptions.length > 0) {
        setActiveIndex((prev) => (prev - 1 + filteredOptions.length) % filteredOptions.length);
      }
      return;
    }
    if (e.key === 'Home') {
      if (isOpen && filteredOptions.length > 0) {
        e.preventDefault();
        setActiveIndex(0);
      }
      return;
    }
    if (e.key === 'End') {
      if (isOpen && filteredOptions.length > 0) {
        e.preventDefault();
        setActiveIndex(filteredOptions.length - 1);
      }
      return;
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeSelect();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        setActiveIndex((prev) => (prev + 1) % filteredOptions.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        setActiveIndex((prev) => (prev - 1 + filteredOptions.length) % filteredOptions.length);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
        handleSelect(filteredOptions[activeIndex].value);
      }
      return;
    }
    if (e.key === 'Home') {
      if (filteredOptions.length > 0) {
        e.preventDefault();
        setActiveIndex(0);
      }
      return;
    }
    if (e.key === 'End') {
      if (filteredOptions.length > 0) {
        e.preventDefault();
        setActiveIndex(filteredOptions.length - 1);
      }
      return;
    }
  };

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
              if (isOpen) closeSelect();
              else openSelect();
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
              closeSelect();
            }, 120);
          }}
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
          <div ref={listboxRef} id={`${selectId}-listbox`} className="pholio-custom-select-dropdown" role="listbox" aria-multiselectable="true" aria-label={label || placeholder}>
            {searchable && (
              <div
                className="pholio-multiselect-search"
                onMouseDown={(e) => e.preventDefault()}
              >
                <Search size={14} aria-hidden className="pholio-multiselect-search-icon" />
                <input
                  ref={searchInputRef}
                  type="search"
                  className="pholio-multiselect-search-input"
                  value={searchQuery}
                  onChange={(e) => {
                    const nextQuery = e.target.value;
                    const normalizedQuery = nextQuery.trim().toLowerCase();
                    const hasMatches = options.some(
                      (option) =>
                        !normalizedQuery ||
                        String(option.label ?? '').toLowerCase().includes(normalizedQuery) ||
                        String(option.value ?? '').toLowerCase().includes(normalizedQuery),
                    );
                    setSearchQuery(nextQuery);
                    setActiveIndex(hasMatches ? 0 : -1);
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  aria-controls={`${selectId}-listbox`}
                  aria-activedescendant={isOpen && activeIndex >= 0 ? `${selectId}-opt-${activeIndex}` : undefined}
                  onKeyDown={handleSearchKeyDown}
                />
              </div>
            )}
            {filteredOptions.length === 0 ? (
              <div className="pholio-multiselect-empty" role="status">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((option, index) => {
                const isSelected = safeValue.includes(option.value);
                return (
                  <div
                    key={option.value}
                    id={`${selectId}-opt-${index}`}
                    className={`pholio-select-option ${isSelected ? 'selected' : ''} ${index === activeIndex ? 'active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(option.value)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <span>{option.label}</span>
                    {isSelected && <Check size={14} className="check-icon" />}
                  </div>
                );
              })
            )}
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

export default PholioMultiSelect;
