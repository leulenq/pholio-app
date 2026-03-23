import { useEffect } from 'react';

const INPUT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

export default function useKeyboardShortcuts(shortcuts, deps = []) {
  useEffect(() => {
    function handler(e) {
      // Suppress in text inputs
      if (INPUT_TAGS.includes(e.target.tagName)) return;
      if (e.target.isContentEditable) return;

      const binding = shortcuts.find(s => s.key === e.key && !s.ctrl === !e.ctrlKey);
      if (binding) {
        e.preventDefault();
        binding.action();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, deps);
}
