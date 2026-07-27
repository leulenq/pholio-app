import React, { useCallback, useState } from 'react';

/**
 * Hover/focus readout shared by every chart.
 *
 * Tooltips enhance here, they never gate: the same values are reachable from
 * the direct labels on the marks and from each panel's table view.
 */
export function useTooltip() {
  const [tip, setTip] = useState(null);

  const show = useCallback((x, y, content) => setTip({ x, y, content }), []);
  const hide = useCallback(() => setTip(null), []);

  const node = tip ? (
    <div className="sv-tip" style={{ left: `${tip.x}px`, top: `${tip.y}px` }} role="status">
      {tip.content}
    </div>
  ) : null;

  return { tip, show, hide, node };
}

export default useTooltip;
