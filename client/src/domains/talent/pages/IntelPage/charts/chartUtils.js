import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * One in-view flag per chart, observed on the wrapping HTML element.
 *
 * Framer Motion's `whileInView` observes each animated node directly. On SVG
 * children that is unreliable — Chrome reports collapsed intersection rects for
 * elements inside a tall <svg>, so marks lower in the chart never receive their
 * `animate` state and stay stuck at `initial` (opacity 0, scaleX 0). That is
 * exactly how the conversion ladder's bottom two bars and every read-clock dot
 * rendered as blank rows.
 *
 * Observing the HTML wrapper once and driving children from that flag makes the
 * reveal deterministic: either the chart is on screen and every mark is drawn,
 * or it isn't and none are.
 */
export function useMeasure() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      setWidth(Math.round(w));
    });
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  // The reveal flag is simply "the plot has been measured". Marks mount only
  // once a width exists, so flipping this on that same render gives framer
  // motion its initial → animate transition for free, with no observer in the
  // path. Nothing about whether data is visible depends on scroll position.
  return [ref, width, width > 0];
}

/**
 * Keyboard + pointer cursor over an evenly-spaced series. Arrow keys move it,
 * so every value a tooltip can show is also reachable without a mouse.
 *
 * The index is clamped on read rather than corrected in an effect — a series
 * that shrinks under a live cursor must not trigger a second render pass.
 */
export function useSeriesCursor(count) {
  const [raw, setIndex] = useState(null);
  const index = raw == null ? null : Math.min(raw, Math.max(0, count - 1));

  const fromPointer = useCallback(
    (event, rect, insetLeft, plotWidth) => {
      if (count < 1 || plotWidth <= 0) return;
      const x = event.clientX - rect.left - insetLeft;
      const frac = Math.min(1, Math.max(0, x / plotWidth));
      setIndex(Math.round(frac * (count - 1)));
    },
    [count],
  );

  const onKeyDown = useCallback(
    (event) => {
      if (count < 1) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const forward = event.key === 'ArrowRight';
        setIndex((prev) => {
          const clamped = prev == null ? null : Math.min(prev, count - 1);
          const start = clamped == null ? (forward ? -1 : count) : clamped;
          return Math.min(count - 1, Math.max(0, start + (forward ? 1 : -1)));
        });
      }
      if (event.key === 'Escape') setIndex(null);
    },
    [count],
  );

  return { index, setIndex, fromPointer, onKeyDown };
}

/** Rounded data-end on a horizontal bar: square at the baseline, 4px at the tip. */
export function barPath(x, y, w, h, r = 4) {
  const radius = Math.min(r, Math.max(0, w), h / 2);
  if (w <= 0) return '';
  if (radius <= 0.5) return `M${x},${y} h${w} v${h} h${-w} Z`;
  return [
    `M${x},${y}`,
    `h${w - radius}`,
    `a${radius},${radius} 0 0 1 ${radius},${radius}`,
    `v${h - radius * 2}`,
    `a${radius},${radius} 0 0 1 ${-radius},${radius}`,
    `h${-(w - radius)}`,
    'Z',
  ].join(' ');
}

/** Rounded data-end on a vertical column: 4px at the top, square on the axis. */
export function columnPath(x, y, w, h, r = 4) {
  const radius = Math.min(r, w / 2, Math.max(0, h));
  if (h <= 0) return '';
  if (radius <= 0.5) return `M${x},${y} h${w} v${h} h${-w} Z`;
  return [
    `M${x},${y + radius}`,
    `a${radius},${radius} 0 0 1 ${radius},${-radius}`,
    `h${w - radius * 2}`,
    `a${radius},${radius} 0 0 1 ${radius},${radius}`,
    `v${h - radius}`,
    `h${-w}`,
    'Z',
  ].join(' ');
}
