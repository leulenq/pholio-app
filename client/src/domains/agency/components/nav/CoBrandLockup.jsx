import React from 'react';

export default function CoBrandLockup({ profile, collapsed, onToggle }) {
  const agencyName = profile?.agency_name || 'Agency';
  const logoPath = profile?.agency_logo_path || profile?.logo_path;
  const logo = logoPath ? `/${logoPath}` : null;
  const initial = agencyName.trim().charAt(0).toUpperCase() || 'A';
  const location = profile?.agency_location || profile?.location || '';
  const members = profile?.member_count;

  return (
    <div className="ag-rail-header">
      <div className="ag-cobrand">
        <div className="ag-cobrand-agency">
          <span className="ag-cobrand-pholio">PHOLIO</span>
          <span className="ag-cobrand-div" aria-hidden="true" />
          {logo
            ? <img className="ag-cobrand-mark" src={logo} alt="" />
            : <span className="ag-cobrand-mark" aria-hidden="true">{initial}</span>}
          <span title={agencyName}>{agencyName.toUpperCase()}</span>
        </div>
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
        <div className="ag-rail-meta">
          Powering{location ? ` · ${location}` : ''}{members ? ` · ${members} members` : ''}
        </div>
      )}
    </div>
  );
}
