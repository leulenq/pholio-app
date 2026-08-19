import React, { useRef } from 'react';

/**
 * The Spotlight Field (`client/src/domains/onboarding/DESIGN.md` §3).
 *
 * No box and no underline: the answer is typed directly onto the stage in the
 * same display serif the question is set in, with a gold caret, a ghosted
 * italic prompt, and a soft radial gold pool that ignites on focus — which is
 * also the field's focus indicator, since there is no border to light.
 *
 * One instrument for every typed answer, plus the native date variant.
 *
 * @param {'text'|'email'|'tel'|'url'|'date'|'number'} [type]
 * @param {string}   value
 * @param {Function} onChange   Receives the raw string value.
 * @param {Function} [onEnter]
 * @param {boolean}  [inline]   Smaller scale, for the secondary field on a
 *                              paired screen (phone under email).
 */
export default function SpotlightField({
  type = 'text',
  value,
  onChange,
  onEnter,
  placeholder,
  inline = false,
  autoFocus = false,
  ...rest
}) {
  const ref = useRef(null);
  const isDate = type === 'date';

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onEnter?.(event);
    }
  };

  return (
    <div className={`oc-spotlight${inline ? ' oc-spotlight--inline' : ''}`}>
      <input
        ref={ref}
        type={type}
        className={`oc-spotlight__input${isDate ? ' oc-spotlight__input--date' : ''}`}
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isDate ? undefined : placeholder}
        autoComplete="off"
        // The screen holds a single question; landing the caret in it is the
        // whole interaction, so autofocus is opt-in per screen rather than a
        // trap the reader has to escape.
        autoFocus={autoFocus}
        enterKeyHint="next"
        {...rest}
      />
      <div className="oc-spotlight__glow" aria-hidden="true" />
    </div>
  );
}
