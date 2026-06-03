import React from 'react';

// Co-brand lockup: Pholio wordmark (always the talent-dashboard text logo)
// followed by the agency's own logo OR name — never both.
export default function CoBrandLockup({ profile, collapsed, onToggle }) {
  const agencyName = profile?.agency_name || 'Agency';
  const logoPath = profile?.agency_logo_path || profile?.logo_path;
  const logo = logoPath ? `/${logoPath}` : null;
  const location = profile?.agency_location || profile?.location || '';
  const members = profile?.member_count;

  return (
    <div className="ag-rail-header">
      <div className="ag-cobrand-top">
        <span className="ag-cobrand-pholio">PHOLIO</span>
        <button
          className="ag-rail-collapse"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
      {!collapsed && (
        <div className="ag-cobrand-agency">
          {logo
            ? <img className="ag-cobrand-logo" src={logo} alt={agencyName} />
            : <span className="ag-cobrand-name" title={agencyName}>{agencyName}</span>}
        </div>
      )}
      {!collapsed && (
        <div className="ag-rail-meta">
          Powering{location ? ` · ${location}` : ''}{members ? ` · ${members} members` : ''}
        </div>
      )}
    </div>
  );
}
