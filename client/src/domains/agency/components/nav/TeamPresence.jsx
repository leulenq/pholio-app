import React from 'react';

function initials(m) {
  const f = (m.first_name?.[0] || '') + (m.last_name?.[0] || '');
  return (f || m.full_name?.[0] || '?').toUpperCase();
}

export default function TeamPresence({ members = [], max = 3 }) {
  if (!members.length) return null;
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <div className="ag-presence" aria-label={`${members.length} team members`}>
      {shown.map((m) =>
        m.avatar_url ? (
          <img
            key={m.membershipId || m.userId}
            className="ag-presence-avatar ag-presence-avatar--photo"
            src={m.avatar_url}
            alt=""
            title={m.full_name}
            aria-label={m.full_name}
          />
        ) : (
          <span
            key={m.membershipId || m.userId}
            className="ag-presence-avatar"
            title={m.full_name}
            aria-label={m.full_name}
          >
            {initials(m)}
          </span>
        ),
      )}
      {extra > 0 && <span className="ag-presence-more" aria-hidden="true">+{extra}</span>}
    </div>
  );
}
