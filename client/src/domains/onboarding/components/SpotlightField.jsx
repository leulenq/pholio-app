import React, { useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTypeToFocus } from '../../../shared/hooks/useTypeToFocus';
import './SpotlightField.css';

/**
 * SpotlightField — the typed-onto-stage input. No box, no underline: centered
 * Playfair set in the same light as the question, a gold caret, a ghost italic
 * placeholder, and a soft radial gold pool that ignites on focus.
 *
 * One instrument reused for every text answer, plus a native date variant.
 *
 * @param {'text'|'email'|'password'|'date'} [type='text']
 * @param {string}   value
 * @param {Function} onChange     Standard input onChange.
 * @param {Function} [onEnter]    Called when Enter is pressed (event passed through).
 * @param {string}   [placeholder]
 * @param {object}   [inputRef]   Optional ref; if omitted an internal ref is wired to useTypeToFocus.
 * @param {boolean}  [autoFocus=false]
 *
 * Extra props (min/max for date, aria-invalid, aria-label, etc.) pass through
 * to the underlying <input>.
 */
export default function SpotlightField({
  type = 'text',
  value,
  onChange,
  onEnter,
  placeholder,
  inputRef,
  autoFocus = false,
  className = '',
  onKeyDown,
  ...rest
}) {
  const internalRef = useRef(null);
  const ref = inputRef || internalRef;
  useTypeToFocus(ref);

  const isDate = type === 'date';
  const isPassword = type === 'password';
  const [showPass, setShowPass] = useState(false);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter?.(e);
    }
    onKeyDown?.(e);
  };

  // The date variant relies on :required:invalid to ghost the MM/DD/YYYY
  // segments; default to required so the ghost state shows (overridable).
  const dateProps = isDate ? { required: true } : {};
  const inputType = isPassword ? (showPass ? 'text' : 'password') : type;

  return (
    <div className="spotlight">
      <input
        ref={ref}
        type={inputType}
        className={`spotlight-input${isDate ? ' spotlight-input--date' : ''}${className ? ` ${className}` : ''}`}
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        placeholder={isDate ? undefined : placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        {...(!isDate && { enterKeyHint: 'next' })}
        {...dateProps}
        {...rest}
      />

      {isPassword && (
        <button
          type="button"
          onClick={() => setShowPass(!showPass)}
          className="absolute right-4 md:right-8 z-10 text-white/30 hover:text-white/70 transition-colors cursor-pointer flex items-center justify-center p-2"
          aria-label={showPass ? 'Hide password' : 'Show password'}
        >
          {showPass ? <EyeOff size={20} strokeWidth={1.8} /> : <Eye size={20} strokeWidth={1.8} />}
        </button>
      )}

      <div className="spotlight-glow" aria-hidden="true" />
    </div>
  );
}
