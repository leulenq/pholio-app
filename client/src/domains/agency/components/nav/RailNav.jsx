import React from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { AGENCY_NAV_GROUPS, AGENCY_NAV_COLLAPSE_AFTER } from '../../constants/agencyNav';
import { useAgencyPermissions } from '../../hooks/useAgencyPermissions';

export default function RailNav({ collapsed, onToggleCollapse }) {
  const { can } = useAgencyPermissions();

  const groups = AGENCY_NAV_GROUPS.map((group) => {
    const items = group.items.filter((item) => !item.permission || can(item.permission));
    return items.length ? { ...group, items } : null;
  }).filter(Boolean);

  const collapseAfterIndex = Math.max(
    0,
    groups.findIndex((group) => group.label === AGENCY_NAV_COLLAPSE_AFTER),
  );

  return (
    <nav className="ag-rail-nav" aria-label="Agency workspace">
      {groups.map((group, groupIndex) => (
        <React.Fragment key={group.label ?? 'home'}>
          <div className={`ag-nav-group${group.label ? '' : ' ag-nav-group--home'}`}>
            {group.label ? <div className="ag-nav-group-label">{group.label}</div> : null}
            {group.items.map((item) => {
              const Icon = item.icon;
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
                </NavLink>
              );
            })}
          </div>
          {groupIndex === collapseAfterIndex && onToggleCollapse && (
            <div className="ag-rail-collapse-slot" role="presentation">
              <button
                type="button"
                className={`ag-rail-collapse${collapsed ? ' ag-rail-collapse--collapsed' : ''}`}
                onClick={onToggleCollapse}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <ChevronLeft size={collapsed ? 21 : 13} strokeWidth={collapsed ? 1.6 : 1.5} aria-hidden="true" />
              </button>
            </div>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
