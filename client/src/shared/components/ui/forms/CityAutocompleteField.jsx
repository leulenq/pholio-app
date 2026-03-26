import React, {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { X } from 'lucide-react';
import { CITIES } from '../../../../data/cities';
import './PholioForms.css';

function filterCities(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return CITIES;
  return CITIES.filter(
    (c) =>
      c.label.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.country.toLowerCase().includes(q)
  );
}

const CityAutocompleteField = forwardRef(function CityAutocompleteField(
  {
    label,
    error,
    value = '',
    onChange,
    placeholder = 'City',
    disabled = false,
    className = '',
    id: providedId,
    name,
    autoComplete = 'off',
    ...rest
  },
  ref
) {
  const { onBlur: externalOnBlur, ...inputRest } = rest;
  const generatedId = useId();
  const inputId = providedId || `city-autocomplete-${generatedId}`;
  const listboxId = `${inputId}-listbox`;
  const errorId = error ? `${inputId}-error` : undefined;

  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const blurTimeoutRef = useRef(null);
  const suggestions = useMemo(() => filterCities(value), [value]);

  const clearBlurTimeout = useCallback(() => {
    if (blurTimeoutRef.current != null) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => clearBlurTimeout(), [clearBlurTimeout]);

  const scheduleClose = useCallback(() => {
    clearBlurTimeout();
    blurTimeoutRef.current = setTimeout(() => {
      setOpen(false);
      setHighlightedIndex(-1);
      blurTimeoutRef.current = null;
    }, 120);
  }, [clearBlurTimeout]);

  const pickCity = useCallback(
    (city) => {
      const next = city.label;
      onChange?.(next);
      setOpen(false);
      setHighlightedIndex(-1);
    },
    [onChange]
  );

  const handleInputChange = (e) => {
    onChange?.(e.target.value);
    setOpen(true);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setHighlightedIndex(e.key === 'ArrowDown' ? 0 : suggestions.length - 1);
      return;
    }

    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => {
        if (suggestions.length === 0) return -1;
        return i < suggestions.length - 1 ? i + 1 : 0;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => {
        if (suggestions.length === 0) return -1;
        return i > 0 ? i - 1 : suggestions.length - 1;
      });
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        pickCity(suggestions[highlightedIndex]);
      }
    }
  };

  const handleClear = (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearBlurTimeout();
    onChange?.('');
    setOpen(false);
    setHighlightedIndex(-1);
  };

  const showList = open && !disabled && suggestions.length > 0;

  return (
    <div className={`pholio-form-group pholio-autocomplete-field ${className}`}>
      {label && (
        <label htmlFor={inputId} className="pholio-label">
          {label}
        </label>
      )}
      <div className="pholio-autocomplete-input-wrap">
        <input
          ref={ref}
          id={inputId}
          name={name}
          type="text"
          className={`pholio-input ${error ? 'has-error' : ''}`}
          value={value ?? ''}
          {...inputRest}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            clearBlurTimeout();
            if (!disabled) setOpen(true);
          }}
          onBlur={(e) => {
            scheduleClose();
            externalOnBlur?.(e);
          }}
          disabled={disabled}
          placeholder={placeholder}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-activedescendant={
            showList && highlightedIndex >= 0
              ? `${listboxId}-opt-${highlightedIndex}`
              : undefined
          }
          aria-invalid={!!error}
          aria-describedby={errorId}
          autoComplete={autoComplete}
        />
        {!!value && !disabled && (
          <button
            type="button"
            className="pholio-autocomplete-clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
            aria-label="Clear city"
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>

      {showList && (
        <ul
          id={listboxId}
          className="pholio-custom-select-dropdown pholio-autocomplete-dropdown"
          role="listbox"
        >
          {suggestions.map((city, index) => (
            <li
              key={city.label}
              id={`${listboxId}-opt-${index}`}
              role="option"
              aria-selected={highlightedIndex === index}
              className={`pholio-select-option ${highlightedIndex === index ? 'pholio-autocomplete-option-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => pickCity(city)}
            >
              {city.label}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <span id={errorId} className="pholio-error-message" role="alert">
          {error.message || error}
        </span>
      )}
    </div>
  );
});

CityAutocompleteField.displayName = 'CityAutocompleteField';

export default CityAutocompleteField;
