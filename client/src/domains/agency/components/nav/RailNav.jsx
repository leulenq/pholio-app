import React from 'react';
import { NavLink } from 'react-router-dom';
import { AGENCY_NAV_GROUPS } from '../../constants/agencyNav';

export default function RailNav({ counts = {} }) {
  return (
    <nav className="ag-rail-nav" aria-label="Agency workspace">
      {AGENCY_NAV_GROUPS.map((group) => (
        <div className="ag-nav-group" key={group.label}>
          <div className="ag-nav-group-label">{group.label}</div>
          {group.items.map((item) => {
            const Icon = item.icon;
            const count = item.countKey ? counts[item.countKey] : undefined;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `ag-nav-item${isActive ? ' ag-nav-item--active' : ''}`}
                title={item.label}
              >
                <Icon className="ag-nav-icon" size={14} strokeWidth={1.6} />
                <span>{item.label}</span>
                {count != null && count !== 0 && (
                  <span className={`ag-nav-count${item.countKey === 'applicants' ? ' ag-nav-count--accent' : ''}`}>{count}</span>
                )}
              </NavLink>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
