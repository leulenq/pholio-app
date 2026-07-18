import React, { useRef, useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import UserDropdown from './UserDropdown';

// OWNER/ADMIN/MEMBER → Owner/Admin/Member
function formatRole(role) {
  if (!role) return 'Member';
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

export default function MemberAccountChip({ profile, role }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const first = profile?.first_name || '';
  const last = profile?.last_name || '';
  const name = [first, last].filter(Boolean).join(' ') || profile?.email?.split('@')[0] || 'Member';
  const roleLabel = formatRole(role || profile?.membership_role);
  const avatar = profile?.avatar_url
    || (profile?.images?.[0]?.path ? `/${profile.images[0].path}` : null);
  const ini = ((first[0] || '') + (last[0] || '')).toUpperCase() || 'ME';

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className={`ag-rail-footer${open ? ' ag-rail-footer--menu-open' : ''}`} ref={ref}>
      <button
        type="button"
        className="ag-member"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {avatar
          ? <img className="ag-member-avatar" src={avatar} alt="" />
          : <span className="ag-member-avatar">{ini}</span>}
        <span style={{ minWidth: 0 }}>
          <span className="ag-member-name" style={{ display: 'block' }}>{name}</span>
          <span className="ag-member-role">{roleLabel}</span>
        </span>
        <ChevronDown size={14} className={`ag-member-chev${open ? ' ag-member-chev--open' : ''}`} aria-hidden="true" />
      </button>
      <UserDropdown isOpen={open} onClose={() => setOpen(false)} />
    </div>
  );
}
