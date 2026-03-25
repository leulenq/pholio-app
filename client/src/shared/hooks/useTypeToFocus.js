import { useEffect } from 'react';

/**
 * Automatically focuses the ref element when the user starts typing key characters.
 * Useful for "cinematic" inputs where the input should always capture intent.
 */
export const useTypeToFocus = (ref) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 1. If we are already focused on an input/textarea, do nothing.
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        return;
      }

      // 2. Ignore Meta/Ctrl/Alt/Function keys
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length > 1 && e.key !== 'Backspace') return; // Allow Backspace to re-focus too? Maybe.
      
      // 3. Focus the input
      if (ref.current) {
        ref.current.focus();
        // Note: The key press event will naturally bubble to the newly focused input 
        // in most modern browsers if focus happens synchronously here.
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ref]);
};
