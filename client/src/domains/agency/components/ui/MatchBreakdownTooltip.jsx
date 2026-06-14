import React, { useMemo } from 'react';
import { formatBreakdownLines, breakdownAriaLabel } from '../../lib/discoverMatch';
import './MatchBreakdownTooltip.css';

/**
 * Subtle hover tooltip for hybrid / legacy match score breakdown.
 */
export default function MatchBreakdownTooltip({ breakdown, rationale, children }) {
  const lines = useMemo(() => formatBreakdownLines(breakdown), [breakdown]);
  const aria = useMemo(() => breakdownAriaLabel(breakdown, rationale), [breakdown, rationale]);
  const hasHint = lines.length > 0 || rationale;

  if (!hasHint) return children;

  return (
    <span className="match-breakdown-hint" aria-label={aria || undefined}>
      {children}
      <span className="match-breakdown-hint__pop" role="tooltip">
        {rationale && (
          <span className="match-breakdown-hint__rationale">{rationale}</span>
        )}
        {lines.length > 0 && (
          <span className="match-breakdown-hint__legs">
            {lines.map((line) => (
              <span className="match-breakdown-hint__leg" key={line.label}>
                <span className="match-breakdown-hint__leg-label">{line.label}</span>
                <span className="match-breakdown-hint__leg-val">{line.value}</span>
              </span>
            ))}
          </span>
        )}
      </span>
    </span>
  );
}
