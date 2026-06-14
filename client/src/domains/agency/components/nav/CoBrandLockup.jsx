import React from 'react';
import { resolveAgencyLogoUrl } from '../../lib/agency-branding';

const ONE_LINE_MAX = 13;

function stackLines(words, maxLines = 3) {
  if (words.length <= maxLines) return words;
  const perLine = Math.ceil(words.length / maxLines);
  const lines = [];
  for (let i = 0; i < words.length; i += perLine) {
    lines.push(words.slice(i, i + perLine).join(' '));
  }
  return lines;
}

function agencyTreatment(name) {
  const trimmed = (name || '').trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (trimmed.length > ONE_LINE_MAX && words.length >= 2) {
    return { mode: 'stack', lines: stackLines(words, 3) };
  }
  return { mode: 'line', text: trimmed };
}

/** Co-brand lockup: Pholio wordmark · agency PNG/SVG logo (preferred) or name fallback. */
export default function CoBrandLockup({ profile, collapsed }) {
  const agencyName = profile?.agency_name || 'Agency';
  const logo = resolveAgencyLogoUrl(profile);
  const members = profile?.member_count;

  const treatment = logo ? null : agencyTreatment(agencyName);
  const stacked = treatment?.mode === 'stack';

  return (
    <div className="ag-rail-header">
      <div
        className={[
          'ag-cobrand',
          stacked && !logo ? 'ag-cobrand--stacked' : '',
          logo && !collapsed ? 'ag-cobrand--logo' : '',
        ].filter(Boolean).join(' ')}
      >
        <span className="ag-cobrand-pholio">PHOLIO</span>
        {!collapsed && (
          <>
            <span className="ag-cobrand-div" aria-hidden="true" />
            <span className="ag-cobrand-agency">
              {logo ? (
                <img className="ag-cobrand-logo" src={logo} alt={agencyName} />
              ) : stacked ? (
                <span className="ag-cobrand-stack" title={agencyName}>
                  {treatment.lines.map((line, i) => (
                    <span key={i}>{line}</span>
                  ))}
                </span>
              ) : (
                <span className="ag-cobrand-name" title={agencyName}>{treatment.text}</span>
              )}
            </span>
          </>
        )}
      </div>
      {!collapsed && !logo && (
        <div className="ag-rail-meta" style={{ textAlign: 'center' }}>
          Powering {members ? `${members} members` : 'Agency'}
        </div>
      )}
    </div>
  );
}
