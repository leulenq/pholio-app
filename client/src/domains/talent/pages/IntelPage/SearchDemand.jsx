import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Zone — Search Signal (Discover WS9.3). Plain-prose lines mined from
 * `discover_query_log`: which hard-constraint fields agencies actually
 * searched by, cross-referenced against this talent's own blank fields.
 * Zero state (no query log yet, or nothing blank that's in demand) renders
 * nothing — never a fabricated line.
 */
export default function SearchDemand({ demand }) {
  const nudges = Array.isArray(demand?.nudges) ? demand.nudges : [];
  if (nudges.length === 0) return null;

  return (
    <div className="intel2-demand">
      <ul className="intel2-demand-list">
        {nudges.map((nudge) => (
          <li key={nudge.field} className="intel2-demand-row">
            <p className="intel2-demand-text">
              {nudge.text}{' '}
              <Link to={nudge.to} className="intel2-inline-link">
                Fill it in
              </Link>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
