import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Measures a container so SVG charts can be drawn in real pixels.
 *
 * Charts here are laid out at measured width with a fixed height rather than a
 * scaled `viewBox`, because a scaled viewBox would stretch label type along
 * with the geometry.
 */
export function useMeasure(initialWidth = 640) {
  const [width, setWidth] = useState(initialWidth);
  const observerRef = useRef(null);

  const ref = useCallback((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!node) return;
    setWidth(node.clientWidth || initialWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect?.width;
      if (next) setWidth(next);
    });
    observer.observe(node);
    observerRef.current = observer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return [ref, Math.max(240, Math.round(width))];
}
