import { useCallback } from 'react';

/**
 * useCardButton — makes a non-button element (card, row) behave like a button
 * for keyboard users. Returns props to spread onto the element when an
 * `onActivate` handler is supplied; returns an empty object otherwise so the
 * element stays inert / non-focusable.
 *
 * Enter and Space both activate. Space additionally calls preventDefault to
 * stop the page from scrolling.
 *
 * @param {(event: KeyboardEvent) => void} onActivate - invoked on Enter/Space.
 * @param {{ disabled?: boolean }} [options]
 * @returns {{ role?: 'button', tabIndex?: number, 'aria-disabled'?: boolean, onKeyDown?: Function }}
 */
export function useCardButton(onActivate, { disabled = false } = {}) {
  const onKeyDown = useCallback(
    (event) => {
      if (disabled || typeof onActivate !== 'function') return;
      const { key } = event;
      if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        // Space would scroll the page; Enter is safe but we keep parity.
        if (key === ' ' || key === 'Spacebar') event.preventDefault();
        onActivate(event);
      }
    },
    [onActivate, disabled]
  );

  if (typeof onActivate !== 'function') {
    return {};
  }

  return {
    role: 'button',
    tabIndex: disabled ? -1 : 0,
    'aria-disabled': disabled || undefined,
    onKeyDown,
  };
}

export default useCardButton;
