import React from 'react';
import { Link } from 'react-router-dom';
import { useAgencyTeam } from '../../hooks/useAgencyTeam';

function initials(m) {
  const f = (m.first_name?.[0] || '') + (m.last_name?.[0] || '');
  if (f) return f.toUpperCase();
  const n = m.full_name || '';
  return (n.includes('@') ? n[0] : n[0] || '?').toUpperCase();
}

function displayName(m) {
  if (m.first_name) return [m.first_name, m.last_name].filter(Boolean).join(' ');
  if (m.full_name && !m.full_name.includes('@')) return m.full_name;
  return m.membership_role === 'OWNER' ? 'Owner' : 'Member';
}

function roleLabel(r) {
  if (!r) return 'Member';
  return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
}

export default function TeamModule() {
  const { data: team = [] } = useAgencyTeam();
  return (
    <section className="ov-module">
      <div className="ov-module-head">
        <h2 className="ov-module-title">Team{team.length ? <span className="ov-module-count">{team.length}</span> : null}</h2>
        <Link to="/dashboard/agency/settings?tab=team" className="ov-module-link">Manage</Link>
      </div>
      <div className="ov-team">
        {team.map((m) => (
          <div key={m.membershipId || m.userId} className="ov-team-member">
            <span className={`ov-team-avatar${m.membership_role === 'OWNER' ? ' is-owner' : ''}`}>{initials(m)}</span>
            <span className="ov-team-info">
              <span className="ov-team-name">{displayName(m)}</span>
              <span className="ov-team-role">{roleLabel(m.membership_role)}</span>
            </span>
          </div>
        ))}
        <Link to="/dashboard/agency/settings?tab=team" className="ov-team-add">+ Invite member</Link>
      </div>
    </section>
  );
}
