import React, { useRef, useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import UserDropdown from './UserDropdown';

export default function MemberAccountChip({ profile }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const first = profile?.first_name || '';
  const last = profile?.last_name || '';
  const name = [first, last].filter(Boolean).join(' ') || profile?.email?.split('@')[0] || 'Member';
  const role = profile?.membership_role || 'Member';
  const avatar = profile?.images?.[0]?.path ? `/${profile.images[0].path}` : null;
  const ini = ((first[0] || '') + (last[0] || '')).toUpperCase() || 'ME';

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="ag-rail-footer" ref={ref}>
      <button className="ag-member" onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open}>
        {avatar
          ? <img className="ag-member-avatar" src={avatar} alt="" />
          : <span className="ag-member-avatar">{ini}</span>}
        <span style={{ minWidth: 0 }}>
          <span className="ag-member-name" style={{ display: 'block' }}>{name}</span>
          <span className="ag-member-role">{role}</span>
        </span>
        <ChevronDown size={13} style={{ marginLeft: 'auto', color: 'var(--ag-ink-faint)' }} />
      </button>
      <UserDropdown isOpen={open} onClose={() => setOpen(false)} profile={profile} />
    </div>
  );
}
