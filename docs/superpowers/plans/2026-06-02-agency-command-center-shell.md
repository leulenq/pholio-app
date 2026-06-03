# Agency Command Center — Shell & Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the agency dashboard shell and Overview page with a co-branded, team-first, editorial "command center" — a persistent ink left rail + masthead + optional right column, with Overview bound to real API data.

**Architecture:** Rebuild `AgencyLayout` (`client/src/shared/layouts/AgencyLayout.{jsx,css}`) as a three-zone shell and `OverviewPage` (`client/src/domains/agency/pages/OverviewPage.{jsx,css}`) as a real-data command center. New small components live under `client/src/domains/agency/components/nav/` (shell) and `client/src/domains/agency/components/overview/` (page). Data comes from existing endpoints via two new React Query hooks. Routes and backend are unchanged.

**Tech Stack:** React 19, React Router v7, TanStack Query v5, Framer Motion, Recharts, Lucide, plain CSS with `agency-tokens.css`. No client test framework exists; verification is `npm run lint` + `npm run build` + concrete in-app checks.

---

## Testing approach (read first)

The `client/` app has **no test runner** (`package.json` scripts are only `dev`, `build`, `lint`, `preview`) and no testing-library/vitest/jest deps. Standing one up for a visual redesign is out of scope (YAGNI). Therefore **every task is verified by**:

1. `cd client && npm run lint` → **0 errors**.
2. `cd client && npm run build` → **succeeds** (Vite build to `public/dashboard-app/`).
3. A **named manual check** in the running app (`npm run dev:all`, log in as `agency@example.com` / `password123`, seed first if empty: `npm run seed`).

Pure-logic units (collapse persistence, data selectors) are written as tiny pure functions kept trivially correct and exercised by the manual check. Where a `node -e` assertion is cheap, the plan includes one.

**Visual source of truth:** the approved mockup `docs/superpowers/specs/assets/2026-06-02-agency-command-center-mockup.html`. Open it in a browser while building — all exact colors, spacings, and structure come from it. The spec is `docs/superpowers/specs/2026-06-02-agency-command-center-shell-design.md`.

**Commit discipline:** commit after each task. End commit messages with the Co-Authored-By trailer per repo convention.

---

## CSS class contract (shared vocabulary)

All tasks use these class names so JSX and CSS stay in sync. Prefix `ag-` (shell) / `ov-` (overview).

**Shell:** `ag-shell`, `ag-shell--collapsed`, `ag-shell--discover`, `ag-rail`, `ag-rail-header`, `ag-cobrand`, `ag-cobrand-pholio`, `ag-cobrand-div`, `ag-cobrand-agency`, `ag-cobrand-mark`, `ag-rail-meta`, `ag-rail-collapse`, `ag-rail-nav`, `ag-nav-group`, `ag-nav-group-label`, `ag-nav-item`, `ag-nav-item--active`, `ag-nav-icon`, `ag-nav-count`, `ag-rail-footer`, `ag-member`, `ag-member-avatar`, `ag-member-name`, `ag-member-role`, `ag-body`, `ag-main`, `ag-masthead`, `ag-masthead-status`, `ag-masthead-actions`, `ag-presence`, `ag-presence-avatar`, `ag-presence-more`, `ag-rightcol`.

**Overview:** `ov-page`, `ov-greeting`, `ov-greeting-title`, `ov-greeting-sub`, `ov-hero`, `ov-hero-panel`, `ov-hero-img`, `ov-hero-scrim`, `ov-hero-label`, `ov-hero-number`, `ov-hero-cta-row`, `ov-ledger`, `ov-stat`, `ov-stat-label`, `ov-stat-num`, `ov-stat-delta`, `ov-pipeline`, `ov-pipeline-bar`, `ov-pipeline-seg`, `ov-pipeline-legend`, `ov-incoming`, `ov-incoming-row`, `ov-incoming-pic`, `ov-floor`, `ov-floor-row`, `ov-empty`.

---

## Task 1: Data hooks (`useAgencyOverview`, `useAgencyTeam`)

**Files:**
- Create: `client/src/domains/agency/hooks/useAgencyOverview.js`
- Create: `client/src/domains/agency/hooks/useAgencyTeam.js`

API methods already exist in `client/src/domains/agency/api/agency.js`:
- `getAgencyOverview()` → `{ kpis: { pendingReview, activeCastings, rosterSize, placementRate, utilization }, pipeline, talentMix, alerts, pulse }`
- `getRecentApplicants(limit)` → array of applicants
- `getAgencyTeam()` → array of members `{ membershipId, userId, full_name, first_name, last_name, email, membership_role, status }`

- [ ] **Step 1: Create `useAgencyOverview.js`**

```js
import { useQuery } from '@tanstack/react-query';
import { getAgencyOverview, getRecentApplicants } from '../api/agency';

export function useAgencyOverview() {
  return useQuery({
    queryKey: ['agency', 'overview'],
    queryFn: getAgencyOverview,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function useRecentApplicants(limit = 6) {
  return useQuery({
    queryKey: ['agency', 'recent-applicants', limit],
    queryFn: () => getRecentApplicants(limit),
    staleTime: 60 * 1000,
    retry: 1,
  });
}
```

- [ ] **Step 2: Create `useAgencyTeam.js`**

```js
import { useQuery } from '@tanstack/react-query';
import { getAgencyTeam } from '../api/agency';

export function useAgencyTeam() {
  return useQuery({
    queryKey: ['agency', 'team'],
    queryFn: getAgencyTeam,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    select: (data) => (Array.isArray(data) ? data : data?.members ?? []),
  });
}
```

- [ ] **Step 3: Lint**

Run: `cd client && npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/domains/agency/hooks/useAgencyOverview.js client/src/domains/agency/hooks/useAgencyTeam.js
git commit -m "feat(agency): add overview + team data hooks"
```

---

## Task 2: Grouped nav constant

**Files:**
- Create: `client/src/domains/agency/constants/agencyNav.js`

- [ ] **Step 1: Create the constant**

Icons are Lucide components; counts are keys resolved at render time from real data (`applicants`, `casting`, `team`).

```js
import {
  LayoutGrid, Activity, Inbox, Clapperboard, CalendarClock,
  Users, Compass, UsersRound, BarChart3,
} from 'lucide-react';

export const AGENCY_NAV_GROUPS = [
  {
    label: 'Monitor',
    items: [
      { label: 'Overview', to: '/dashboard/agency', end: true, icon: LayoutGrid },
      { label: 'Activity', to: '/dashboard/agency/activity', icon: Activity },
    ],
  },
  {
    label: 'Pipeline',
    items: [
      { label: 'Applicants', to: '/dashboard/agency/applicants', icon: Inbox, countKey: 'applicants' },
      { label: 'Casting', to: '/dashboard/agency/casting', icon: Clapperboard, countKey: 'casting' },
      { label: 'Interviews', to: '/dashboard/agency/interviews', icon: CalendarClock },
    ],
  },
  {
    label: 'Roster',
    items: [
      { label: 'Talent', to: '/dashboard/agency/roster', icon: Users },
      { label: 'Discover', to: '/dashboard/agency/discover', icon: Compass },
    ],
  },
  {
    label: 'Agency',
    items: [
      { label: 'Team', to: '/dashboard/agency/team', icon: UsersRound, countKey: 'team' },
      { label: 'Analytics', to: '/dashboard/agency/analytics', icon: BarChart3 },
    ],
  },
];
```

> Note: `/dashboard/agency/team` has no route yet. Add a placeholder route in a later restyle pass; for now the link renders and 404s gracefully inside the shell. If that is undesirable during this slice, point Team at `/dashboard/agency/settings` — confirm at build time. Default: keep `/team` and add the route in Task 10 Step 4.

- [ ] **Step 2: Lint**

Run: `cd client && npm run lint`
Expected: 0 errors (unused-import errors mean a Lucide name is wrong — fix the import).

- [ ] **Step 3: Commit**

```bash
git add client/src/domains/agency/constants/agencyNav.js
git commit -m "feat(agency): add grouped command-rail nav constant"
```

---

## Task 3: Rail collapse persistence helper

**Files:**
- Create: `client/src/domains/agency/hooks/useRailCollapsed.js`

- [ ] **Step 1: Create the hook**

```js
import { useCallback, useEffect, useState } from 'react';

const KEY = 'pholio.agency.railCollapsed';

export function useRailCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);
  return { collapsed, toggle };
}
```

- [ ] **Step 2: Sanity-check the persistence contract**

Run: `node -e "globalThis.localStorage={_v:{},getItem(k){return this._v[k]??null},setItem(k,v){this._v[k]=String(v)}}; let c=globalThis.localStorage.getItem('pholio.agency.railCollapsed')==='1'; console.log('default', c); globalThis.localStorage.setItem('pholio.agency.railCollapsed', !c?'1':'0'); console.log('persisted', globalThis.localStorage.getItem('pholio.agency.railCollapsed'));"`
Expected: prints `default false` then `persisted 1`.

- [ ] **Step 3: Lint & commit**

```bash
cd client && npm run lint && cd ..
git add client/src/domains/agency/hooks/useRailCollapsed.js
git commit -m "feat(agency): add persisted rail-collapse hook"
```

---

## Task 4: Shell CSS foundation (`AgencyLayout.css`)

**Files:**
- Modify (rewrite): `client/src/shared/layouts/AgencyLayout.css`

Open the mockup (`docs/superpowers/specs/assets/2026-06-02-agency-command-center-mockup.html`) for exact values. This step lays the structural rules; copy color/spacing details from the mockup. Preserve the existing `ag-shell--discover` overrides at the bottom (see Task 10).

- [ ] **Step 1: Replace the file with the foundation**

```css
/* ============================================================
   PHOLIO AGENCY — Command Center Shell
   Visual source: docs/superpowers/specs/assets/2026-06-02-agency-command-center-mockup.html
   ============================================================ */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap');

:root {
  --ag-rail-w: 198px;
  --ag-rail-w-collapsed: 64px;
  --ag-ink: #14110B;
  --ag-ink-line: #221e16;
  --ag-ink-faint: #6e6452;
  --ag-cream: #EFE9DC;
  --ag-gold: #C9A55A;
  --ag-canvas: #F7F3EC;
  --ag-rule: #ddd5c6;
}

/* grain layer used by rail + canvas */
.ag-grain {
  position: absolute; inset: 0; pointer-events: none; opacity: .05; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.ag-shell { display: flex; height: 100vh; overflow: hidden; background: var(--ag-canvas); }

/* ---------- RAIL ---------- */
.ag-rail {
  width: var(--ag-rail-w); flex: none; background: var(--ag-ink);
  border-right: 1px solid var(--ag-ink-line);
  display: flex; flex-direction: column; position: relative;
  transition: width .28s cubic-bezier(0.4,0,0.2,1);
}
.ag-shell--collapsed .ag-rail { width: var(--ag-rail-w-collapsed); }

.ag-rail-header { padding: 15px 16px 13px; border-bottom: 1px solid var(--ag-ink-line); }
.ag-cobrand { display: flex; align-items: center; justify-content: space-between; }
.ag-cobrand-pholio { font-family: 'Playfair Display', serif; font-size: 12px; letter-spacing: .22em; color: var(--ag-gold); }
.ag-cobrand-div { width: 1px; height: 16px; background: #37301f; }
.ag-cobrand-agency { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ag-cobrand-agency span { font-size: 11px; font-weight: 700; letter-spacing: .05em; color: var(--ag-cream); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ag-cobrand-mark { width: 18px; height: 18px; border-radius: 3px; object-fit: cover; background: var(--ag-gold); color: var(--ag-ink); display: flex; align-items: center; justify-content: center; font: 700 11px 'Playfair Display', serif; flex: none; }
.ag-rail-collapse { background: none; border: none; color: var(--ag-ink-faint); font-size: 13px; cursor: pointer; padding: 2px; }
.ag-rail-meta { margin-top: 9px; font-size: 8px; letter-spacing: .16em; text-transform: uppercase; color: var(--ag-ink-faint); white-space: nowrap; overflow: hidden; }
.ag-shell--collapsed .ag-cobrand-agency span,
.ag-shell--collapsed .ag-cobrand-div,
.ag-shell--collapsed .ag-rail-meta,
.ag-shell--collapsed .ag-nav-group-label,
.ag-shell--collapsed .ag-nav-item span,
.ag-shell--collapsed .ag-member-name,
.ag-shell--collapsed .ag-member-role { display: none; }

/* ---------- NAV ---------- */
.ag-rail-nav { padding: 15px 17px; flex: 1; overflow-y: auto; }
.ag-nav-group + .ag-nav-group { margin-top: 14px; }
.ag-nav-group-label { font-size: 7.5px; letter-spacing: .22em; text-transform: uppercase; color: var(--ag-ink-faint); padding: 0 0 7px; }
.ag-nav-item { display: flex; align-items: center; gap: 9px; padding: 6px 0; font-size: 11px; color: #9a9082; text-decoration: none; position: relative; }
.ag-nav-item:hover { color: var(--ag-cream); }
.ag-nav-icon { width: 14px; height: 14px; flex: none; opacity: .55; }
.ag-nav-item--active { color: #F2ECDF; font-weight: 500; }
.ag-nav-item--active .ag-nav-icon { opacity: 1; color: var(--ag-gold); }
.ag-nav-item--active::before { content: ''; position: absolute; left: -17px; width: 2px; height: 15px; background: var(--ag-gold); box-shadow: 0 0 10px rgba(201,165,90,.7); }
.ag-nav-count { margin-left: auto; font-size: 9px; font-weight: 700; color: var(--ag-ink-faint); }
.ag-nav-item--active .ag-nav-count, .ag-nav-count--accent { color: var(--ag-gold); }

/* ---------- MEMBER FOOTER ---------- */
.ag-rail-footer { padding: 12px 14px; border-top: 1px solid var(--ag-ink-line); }
.ag-member { display: flex; align-items: center; gap: 10px; background: none; border: none; width: 100%; cursor: pointer; padding: 0; text-align: left; }
.ag-member-avatar { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--ag-ink); background: #2a2417; color: var(--ag-cream); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; flex: none; }
.ag-member-name { font-size: 11px; font-weight: 600; color: var(--ag-cream); }
.ag-member-role { font-size: 8.5px; color: var(--ag-ink-faint); letter-spacing: .04em; }

/* ---------- BODY / MAIN ---------- */
.ag-body { flex: 1; min-width: 0; display: flex; overflow: hidden; }
.ag-main {
  flex: 1; min-width: 0; overflow-y: auto; position: relative; color: #16130D;
  font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased;
  background: radial-gradient(120% 80% at 85% -10%, rgba(201,165,90,.10), transparent 55%), var(--ag-canvas);
}

/* ---------- MASTHEAD ---------- */
.ag-masthead { display: flex; justify-content: space-between; align-items: center; padding: 15px 22px 10px; }
.ag-masthead-status { font-size: 8px; letter-spacing: .18em; text-transform: uppercase; color: #9b9082; }
.ag-masthead-actions { display: flex; gap: 12px; align-items: center; }
.ag-presence { display: flex; align-items: center; }
.ag-presence-avatar { width: 21px; height: 21px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--ag-canvas); background: #ece4d4; }
.ag-presence-avatar + .ag-presence-avatar, .ag-presence-more { margin-left: -7px; }
.ag-presence-more { width: 21px; height: 21px; border-radius: 50%; background: #ece4d4; display: flex; align-items: center; justify-content: center; font-size: 7px; font-weight: 700; color: #9b9082; border: 1.5px solid var(--ag-canvas); }

/* ---------- RIGHT COLUMN ---------- */
.ag-rightcol { width: 216px; flex: none; border-left: 1px solid #e6ddcd; background: rgba(255,255,255,.45); padding: 16px; overflow-y: auto; position: relative; }

/* ---------- RESPONSIVE ---------- */
@media (max-width: 1280px) { .ag-rightcol { display: none; } }
@media (max-width: 1024px) {
  .ag-rail { position: fixed; z-index: 80; height: 100vh; transform: translateX(-100%); }
  .ag-shell--drawer-open .ag-rail { transform: translateX(0); }
}
```

- [ ] **Step 2: Build (CSS compiles via the JSX import in Task 6; for now just lint the project)**

Run: `cd client && npm run lint`
Expected: 0 errors. (Full build verified in Task 6 once JSX references these classes.)

- [ ] **Step 3: Commit**

```bash
git add client/src/shared/layouts/AgencyLayout.css
git commit -m "feat(agency): command-center shell CSS foundation"
```

---

## Task 5: Shell nav components

**Files:**
- Create: `client/src/domains/agency/components/nav/CoBrandLockup.jsx`
- Create: `client/src/domains/agency/components/nav/RailNav.jsx`
- Create: `client/src/domains/agency/components/nav/MemberAccountChip.jsx`
- Create: `client/src/domains/agency/components/nav/TeamPresence.jsx`

- [ ] **Step 1: `CoBrandLockup.jsx`**

```jsx
import React from 'react';

export default function CoBrandLockup({ profile, collapsed, onToggle }) {
  const agencyName = profile?.agency_name || 'Agency';
  const logo = profile?.logo_path ? `/${profile.logo_path}` : null;
  const initial = agencyName.trim().charAt(0).toUpperCase() || 'A';
  const location = profile?.location || profile?.agency_location || '';
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
```

- [ ] **Step 2: `RailNav.jsx`**

```jsx
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
```

- [ ] **Step 3: `TeamPresence.jsx`**

```jsx
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
      {shown.map((m) => (
        <span key={m.membershipId || m.userId} className="ag-presence-avatar"
          title={m.full_name} aria-label={m.full_name}>
          {m.avatar ? null : initials(m)}
        </span>
      ))}
      {extra > 0 && <span className="ag-presence-more" aria-hidden="true">+{extra}</span>}
    </div>
  );
}
```

> Members from `getAgencyTeam()` have no avatar field today, so initials render. If an avatar field is added later, swap to `<img>`. This is honest: presence = workspace members, not live online status.

- [ ] **Step 4: `MemberAccountChip.jsx`** — reuses existing `UserDropdown`.

```jsx
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
    <div className="ag-rail-footer" ref={ref} style={{ position: 'relative' }}>
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
```

- [ ] **Step 5: Lint & commit**

```bash
cd client && npm run lint && cd ..
git add client/src/domains/agency/components/nav/CoBrandLockup.jsx client/src/domains/agency/components/nav/RailNav.jsx client/src/domains/agency/components/nav/MemberAccountChip.jsx client/src/domains/agency/components/nav/TeamPresence.jsx
git commit -m "feat(agency): co-brand lockup, rail nav, member chip, team presence"
```

---

## Task 6: Rebuild `AgencyLayout.jsx`

**Files:**
- Modify (rewrite): `client/src/shared/layouts/AgencyLayout.jsx`

Preserve the existing top-bar dropdown wiring (messages/notifications) and focus/escape/outside-click handling, but relocate it into the masthead. The right column is rendered by the page via `<Outlet>` context flag — to keep this slice contained, the shell provides the masthead + presence and leaves the right column to `OverviewPage` (Task 9). The masthead actions reuse `MessagesDropdown` and `NotificationsDropdown`.

- [ ] **Step 1: Replace the component**

```jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Bell, MessageSquare } from 'lucide-react';
import { getAgencyProfile, getMessageThreads } from '../../domains/agency/api/agency';
import { useAgencyTeam } from '../../domains/agency/hooks/useAgencyTeam';
import { useRailCollapsed } from '../../domains/agency/hooks/useRailCollapsed';
import CoBrandLockup from '../../domains/agency/components/nav/CoBrandLockup';
import RailNav from '../../domains/agency/components/nav/RailNav';
import MemberAccountChip from '../../domains/agency/components/nav/MemberAccountChip';
import TeamPresence from '../../domains/agency/components/nav/TeamPresence';
import MessagesDropdown from '../../domains/agency/components/nav/MessagesDropdown';
import NotificationsDropdown from '../../domains/agency/components/nav/NotificationsDropdown';
import './AgencyLayout.css';

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AgencyLayout() {
  const location = useLocation();
  const { collapsed, toggle } = useRailCollapsed();
  const [openPanel, setOpenPanel] = useState(null); // 'messages' | 'notifications'
  const messagesRef = useRef(null);
  const notificationsRef = useRef(null);

  const { data: profile } = useQuery({ queryKey: ['agency-profile'], queryFn: getAgencyProfile, staleTime: 5 * 60 * 1000 });
  const { data: team = [] } = useAgencyTeam();
  const { data: threads = [] } = useQuery({ queryKey: ['agency', 'messages', 'threads'], queryFn: getMessageThreads, refetchInterval: 30000 });

  const closePanel = useCallback(() => setOpenPanel(null), []);
  useEffect(() => { setOpenPanel(null); }, [location.pathname]);
  useEffect(() => {
    const h = (e) => {
      if (!messagesRef.current?.contains(e.target) && !notificationsRef.current?.contains(e.target)) setOpenPanel(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setOpenPanel(null); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const profileWithMeta = { ...profile, member_count: team.length || undefined };
  const unreadMessages = threads.filter((t) => t.unread).length;
  const isDiscover = location.pathname === '/dashboard/agency/discover';
  const season = 'SS26';
  const place = (profile?.location || profile?.agency_location || 'Studio').toUpperCase();

  return (
    <div className={`ag-shell ${collapsed ? 'ag-shell--collapsed' : ''} ${isDiscover ? 'ag-shell--discover' : ''}`}>
      <aside className="ag-rail">
        <div className="ag-grain" />
        <CoBrandLockup profile={profileWithMeta} collapsed={collapsed} onToggle={toggle} />
        <RailNav counts={{ applicants: profile?.pending_applications, casting: profile?.active_castings, team: team.length || undefined }} />
        <MemberAccountChip profile={profile} />
      </aside>

      <div className="ag-body">
        <main className="ag-main">
          <header className="ag-masthead">
            <div className="ag-masthead-status">The Floor &nbsp;·&nbsp; {season} Season &nbsp;·&nbsp; {place} &nbsp;·&nbsp; {nowLabel()}</div>
            <div className="ag-masthead-actions">
              <TeamPresence members={team} />
              <span style={{ width: 1, height: 16, background: '#e0d8c7' }} aria-hidden="true" />
              <button className="ag-topbar-icon" aria-label="Search"><Search size={17} /></button>
              <div ref={messagesRef} style={{ position: 'relative' }}>
                <button className="ag-topbar-icon" aria-label="Messages" aria-expanded={openPanel === 'messages'}
                  onClick={() => setOpenPanel((p) => (p === 'messages' ? null : 'messages'))}>
                  <MessageSquare size={17} />
                  {unreadMessages > 0 && <span className="ag-icon-badge">{unreadMessages}</span>}
                </button>
                <MessagesDropdown isOpen={openPanel === 'messages'} onClose={closePanel} threads={threads} onAllRead={() => {}} isLoading={false} isError={false} />
              </div>
              <div ref={notificationsRef} style={{ position: 'relative' }}>
                <button className="ag-topbar-icon" aria-label="Notifications" aria-expanded={openPanel === 'notifications'}
                  onClick={() => setOpenPanel((p) => (p === 'notifications' ? null : 'notifications'))}>
                  <Bell size={17} />
                </button>
                <NotificationsDropdown isOpen={openPanel === 'notifications'} onClose={closePanel} notifications={[]} onAllRead={() => {}} isLoading={false} isError={false} />
              </div>
              <Link to="/dashboard/agency/settings" className="ag-topbar-icon" aria-label="Settings"><Search size={0} style={{ display: 'none' }} /><span aria-hidden>⚙</span></Link>
            </div>
          </header>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

> The `ag-topbar-icon` / `ag-icon-badge` styles exist in the current CSS — carry them forward (they remain valid masthead button styles). If they were removed in Task 4, add minimal equivalents: `.ag-topbar-icon{width:25px;height:25px;border:1px solid #e0d8c7;border-radius:3px;background:rgba(255,255,255,.5);color:#6b6256;display:flex;align-items:center;justify-content:center;position:relative;cursor:pointer}` and `.ag-icon-badge{position:absolute;top:-5px;right:-5px;background:var(--ag-gold);color:#16130D;font-size:8px;font-weight:700;border-radius:8px;padding:0 4px}`.

- [ ] **Step 2: Ensure the masthead button styles exist in `AgencyLayout.css`**

Add the `.ag-topbar-icon` and `.ag-icon-badge` rules from the note above to `AgencyLayout.css` if not present.

- [ ] **Step 3: Build**

Run: `cd client && npm run build`
Expected: build succeeds, no unresolved imports.

- [ ] **Step 4: Manual check**

Run `npm run dev:all`, open `http://localhost:5173/dashboard/agency` as the agency seed user. Verify: ink rail with co-brand lockup; grouped nav with gold active marker on Overview; member chip at the bottom opens the user dropdown; masthead shows status line + presence avatars + working messages/notifications dropdowns; `«` collapses the rail to icons and the choice survives a page reload.

- [ ] **Step 5: Commit**

```bash
git add client/src/shared/layouts/AgencyLayout.jsx client/src/shared/layouts/AgencyLayout.css
git commit -m "feat(agency): rebuild shell as collapsible command rail + masthead"
```

---

## Task 7: Overview data selectors

**Files:**
- Create: `client/src/domains/agency/components/overview/overviewData.js`

Maps the real `/overview` payload and applicants into render-ready shapes, with safe fallbacks for empty agencies.

- [ ] **Step 1: Create selectors**

```js
const PIPELINE_COLORS = {
  submitted: '#c4bba8', under_review: '#C9A55A', shortlisted: '#16130D',
  booked: '#7d9b82', passed: '#e3dac9',
};

export function selectKpis(data) {
  const k = data?.kpis || {};
  return {
    pendingReview: k.pendingReview ?? 0,
    activeCastings: k.activeCastings ?? 0,
    rosterSize: k.rosterSize ?? 0,
    placementRate: k.placementRate ?? 0,
    utilization: k.utilization ?? 0,
  };
}

export function selectPipeline(data) {
  const rows = Array.isArray(data?.pipeline) ? data.pipeline : [];
  const total = rows.reduce((s, r) => s + (r.count || 0), 0) || 1;
  return rows.map((r) => ({
    label: r.label || r.stage || '',
    count: r.count || 0,
    pct: Math.round(((r.count || 0) / total) * 100),
    color: PIPELINE_COLORS[(r.key || r.stage || '').toLowerCase()] || '#c4bba8',
  }));
}

export function selectAlerts(data) {
  return Array.isArray(data?.alerts) ? data.alerts : [];
}

export function mapApplicant(a) {
  return {
    id: a.id,
    profileId: a.profile_id ?? a.id,
    name: a.name,
    photo: a.avatar || a.photo || null,
    type: (a.archetype || 'editorial').toLowerCase(),
    typeLabel: a.archetype || 'Editorial',
    city: a.city || null,
    match: a.match ?? a.match_score ?? 0,
  };
}
```

- [ ] **Step 2: Lint & commit**

```bash
cd client && npm run lint && cd ..
git add client/src/domains/agency/components/overview/overviewData.js
git commit -m "feat(agency): overview data selectors with empty-state fallbacks"
```

---

## Task 8: Overview presentation components + CSS

**Files:**
- Create: `client/src/domains/agency/components/overview/PipelineCommandHero.jsx`
- Create: `client/src/domains/agency/components/overview/StatLedger.jsx`
- Create: `client/src/domains/agency/components/overview/CastingPipelineBar.jsx`
- Create: `client/src/domains/agency/components/overview/IncomingList.jsx`
- Create: `client/src/domains/agency/components/overview/OnTheFloorList.jsx`
- Modify (rewrite): `client/src/domains/agency/pages/OverviewPage.css`

Exact colors/spacing come from the mockup. Components below carry the structure + class names.

- [ ] **Step 1: `PipelineCommandHero.jsx`**

```jsx
import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion';

function Counter({ value }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  const [d, setD] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) { setD(value); return; }
    const c = animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    const u = rounded.on('change', setD);
    return () => { c.stop(); u(); };
  }, [value, reduce]);
  return <span>{d}</span>;
}

export default function PipelineCommandHero({ pendingReview, heroImage, onReview, onNewCasting }) {
  return (
    <motion.section className="ov-hero" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .5, ease: [0.16, 1, 0.3, 1] }}>
      <div className="ag-grain" style={{ opacity: .07, zIndex: 3 }} />
      <div className="ov-hero-panel">
        <div className="ov-hero-label">Pipeline Command</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div className="ov-hero-number"><Counter value={pendingReview} /></div>
          <div className="ov-hero-sub">applicants awaiting<br />your decision</div>
        </div>
        <div className="ov-hero-cta-row">
          <button className="ov-cta-gold" onClick={onReview}>Open review queue</button>
          <button className="ov-cta-ghost" onClick={onNewCasting}>New casting</button>
        </div>
      </div>
      <div className="ov-hero-imgwrap">
        <div className="ov-hero-scrim" />
        {heroImage && <img className="ov-hero-img" src={heroImage} alt="" />}
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 2: `StatLedger.jsx`**

```jsx
import React from 'react';

export default function StatLedger({ stats }) {
  // stats: [{ label, value, suffix?, delta?, deltaTone? }]
  return (
    <div className="ov-ledger">
      {stats.map((s) => (
        <div className="ov-stat" key={s.label}>
          <div className="ov-stat-label">{s.label}</div>
          <div className="ov-stat-num">{s.value}{s.suffix && <span className="ov-stat-suffix">{s.suffix}</span>}</div>
          {s.delta && <div className={`ov-stat-delta ov-stat-delta--${s.deltaTone || 'neutral'}`}>{s.delta}</div>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `CastingPipelineBar.jsx`**

```jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';

export default function CastingPipelineBar({ stages, total }) {
  const [hover, setHover] = useState(null);
  if (!stages.length) return <div className="ov-empty">No pipeline activity yet.</div>;
  return (
    <div className="ov-pipeline">
      <div className="ov-pipeline-head">
        <span className="ov-stat-label" style={{ color: '#16130D', letterSpacing: '.16em' }}>Casting Pipeline</span>
        <span className="ov-stat-label">{total} in flight</span>
      </div>
      <div className="ov-pipeline-bar">
        {stages.map((s, i) => (
          <motion.div key={s.label} className="ov-pipeline-seg" style={{ background: s.color }}
            initial={{ width: 0 }} animate={{ width: `${s.pct}%` }}
            transition={{ duration: .7, delay: .1 + i * .08, ease: [0.16, 1, 0.3, 1] }}
            onMouseEnter={() => setHover(s.label)} onMouseLeave={() => setHover(null)}
            title={`${s.label}: ${s.count}`} />
        ))}
      </div>
      <div className="ov-pipeline-legend">
        {stages.map((s) => (
          <span key={s.label} className="ov-stat-label" style={{ opacity: hover && hover !== s.label ? .4 : 1 }}>
            {s.label} · {s.count}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `IncomingList.jsx`**

```jsx
import React from 'react';
import { Link } from 'react-router-dom';

export default function IncomingList({ applicants, onSelect }) {
  return (
    <div className="ov-incoming">
      <div className="ov-rc-head">
        <span className="ov-rc-title">Incoming</span>
        <Link to="/dashboard/agency/applicants" className="ov-stat-label" style={{ color: 'var(--ag-gold)' }}>View all</Link>
      </div>
      {applicants.length === 0 && <div className="ov-empty">No new applicants.</div>}
      {applicants.map((a) => (
        <button key={a.id} className="ov-incoming-row" onClick={() => onSelect(a)}>
          <span className="ov-incoming-pic" style={{ backgroundImage: a.photo ? `url(${a.photo})` : 'none' }} />
          <span style={{ minWidth: 0, textAlign: 'left' }}>
            <span className="ov-incoming-name">{a.name}</span>
            <span className="ov-incoming-meta">{a.typeLabel}{a.city ? ` · ${a.city}` : ''}</span>
          </span>
          <span className="ov-incoming-match">{a.match}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: `OnTheFloorList.jsx`**

```jsx
import React from 'react';
import { Link } from 'react-router-dom';

export default function OnTheFloorList({ alerts }) {
  return (
    <div className="ov-floor">
      <div className="ov-rc-head"><span className="ov-rc-title">On the floor</span></div>
      {alerts.length === 0 && <div className="ov-empty">Nothing needs you right now.</div>}
      {alerts.map((al, i) => {
        const body = (
          <>
            <span className="ov-floor-mark" aria-hidden="true">•</span>
            <span>{al.text || al.message}</span>
          </>
        );
        return al.to
          ? <Link key={i} to={al.to} className="ov-floor-row">{body}</Link>
          : <div key={i} className="ov-floor-row">{body}</div>;
      })}
    </div>
  );
}
```

- [ ] **Step 6: Rewrite `OverviewPage.css`**

Provide the structural rules (copy exact values from the mockup; key rules below).

```css
.ov-page { padding: 4px 22px 28px; position: relative; z-index: 1; }
.ov-greeting { display: flex; align-items: flex-end; justify-content: space-between; margin: 6px 0 14px; }
.ov-greeting-title { font-family: 'Playfair Display', serif; font-size: 23px; color: #16130D; line-height: 1.05; }
.ov-greeting-sub { font-size: 8px; letter-spacing: .18em; text-transform: uppercase; color: #9b9082; margin-top: 6px; }

.ov-hero { position: relative; border-radius: 5px; overflow: hidden; height: 124px; display: flex; margin-bottom: 18px; }
.ov-hero-panel { flex: 1.25; background: linear-gradient(135deg,#16130D,#211b12); padding: 16px 18px; position: relative; z-index: 2; }
.ov-hero-imgwrap { flex: 1; position: relative; }
.ov-hero-img { width: 100%; height: 100%; object-fit: cover; object-position: center 22%; }
.ov-hero-scrim { position: absolute; inset: 0; z-index: 1; background: linear-gradient(90deg,#16130D 2%, rgba(22,19,13,.35) 38%, transparent 70%); }
.ov-hero-label { font-size: 8px; letter-spacing: .18em; text-transform: uppercase; color: rgba(201,165,90,.65); margin-bottom: 8px; }
.ov-hero-number { font-family: 'Playfair Display', serif; font-size: 38px; line-height: .85; color: var(--ag-gold); }
.ov-hero-sub { color: rgba(239,233,220,.6); font-size: 9.5px; padding-bottom: 4px; line-height: 1.4; }
.ov-hero-cta-row { display: flex; gap: 7px; margin-top: 13px; }
.ov-cta-gold { background: var(--ag-gold); color: #16130D; font: 600 9px Inter; padding: 6px 12px; border: none; border-radius: 3px; cursor: pointer; }
.ov-cta-ghost { background: none; border: 1px solid rgba(239,233,220,.28); color: #EFE9DC; font: 400 9px Inter; padding: 6px 12px; border-radius: 3px; cursor: pointer; }

.ov-ledger { display: flex; margin-bottom: 14px; }
.ov-stat { flex: 1; padding: 0 16px; border-left: 1px solid #e2dac9; }
.ov-stat:first-child { border-left: none; padding-left: 0; }
.ov-stat-label { font-size: 8px; letter-spacing: .18em; text-transform: uppercase; color: #9b9082; display: block; margin-bottom: 7px; }
.ov-stat-num { font-family: 'Playfair Display', serif; font-size: 24px; color: #16130D; line-height: 1; }
.ov-stat-suffix { font-size: 14px; }
.ov-stat-delta { font-size: 8px; letter-spacing: .06em; text-transform: uppercase; margin-top: 5px; }
.ov-stat-delta--up { color: #7d9b82; } .ov-stat-delta--gold { color: var(--ag-gold); } .ov-stat-delta--neutral { color: #9b9082; }

.ov-pipeline { border-top: 1px solid var(--ag-rule); padding-top: 12px; }
.ov-pipeline-head { display: flex; justify-content: space-between; margin-bottom: 9px; }
.ov-pipeline-bar { display: flex; height: 6px; gap: 2px; }
.ov-pipeline-seg { transition: opacity .2s; }
.ov-pipeline-legend { display: flex; gap: 18px; margin-top: 10px; flex-wrap: wrap; }

.ov-rc-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.ov-rc-title { font-family: 'Playfair Display', serif; font-size: 14px; color: #16130D; }
.ov-incoming { margin-bottom: 18px; }
.ov-incoming-row { display: flex; gap: 9px; align-items: center; width: 100%; background: none; border: none; border-bottom: 1px solid #ece4d4; padding: 8px 0; cursor: pointer; }
.ov-incoming-pic { width: 32px; height: 42px; border-radius: 2px; background-size: cover; background-position: center; flex: none; box-shadow: 0 2px 8px rgba(20,18,14,.18); background-color: #e7e2d8; }
.ov-incoming-name { display: block; font-weight: 600; font-size: 11px; color: #16130D; }
.ov-incoming-meta { display: block; font-size: 7px; letter-spacing: .1em; text-transform: uppercase; color: #9b9082; }
.ov-incoming-match { margin-left: auto; font-family: 'Playfair Display', serif; font-size: 15px; color: #16130D; }
.ov-floor-row { display: flex; gap: 7px; align-items: center; text-decoration: none; font-size: 10px; color: #6b6256; padding: 6px 0; border-bottom: 1px solid #ece4d4; }
.ov-floor-mark { color: var(--ag-gold); }
.ov-empty { font-size: 10px; color: #9b9082; padding: 12px 0; }
```

- [ ] **Step 7: Lint & commit**

```bash
cd client && npm run lint && cd ..
git add client/src/domains/agency/components/overview/ client/src/domains/agency/pages/OverviewPage.css
git commit -m "feat(agency): overview command-center components + styles"
```

---

## Task 9: Rebuild `OverviewPage.jsx`

**Files:**
- Modify (rewrite): `client/src/domains/agency/pages/OverviewPage.jsx`

Composes the command center, binds real data, renders the right column inside the page (so the shell stays generic), opens `TalentPanel` on select.

- [ ] **Step 1: Replace the page**

```jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgencyOverview, useRecentApplicants } from '../hooks/useAgencyOverview';
import { selectKpis, selectPipeline, selectAlerts, mapApplicant } from '../components/overview/overviewData';
import PipelineCommandHero from '../components/overview/PipelineCommandHero';
import StatLedger from '../components/overview/StatLedger';
import CastingPipelineBar from '../components/overview/CastingPipelineBar';
import IncomingList from '../components/overview/IncomingList';
import OnTheFloorList from '../components/overview/OnTheFloorList';
import { TalentPanel } from '../components/TalentPanel';
import './OverviewPage.css';

const HERO_FALLBACK = 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=600';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function OverviewPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const { data: overview } = useAgencyOverview();
  const { data: applicants = [] } = useRecentApplicants(6);

  const kpis = selectKpis(overview);
  const stages = selectPipeline(overview);
  const alerts = selectAlerts(overview);
  const incoming = applicants.map(mapApplicant);
  const total = stages.reduce((s, x) => s + x.count, 0);
  const firstName = overview?.firstName || 'there';

  const ledger = [
    { label: 'Active Castings', value: kpis.activeCastings, delta: kpis.activeCastings ? 'in market' : '—', deltaTone: 'gold' },
    { label: 'Roster Size', value: kpis.rosterSize, deltaTone: 'up' },
    { label: 'Placement Rate', value: kpis.placementRate, suffix: '%', deltaTone: 'up' },
    { label: 'In Market', value: kpis.utilization, delta: 'on submission', deltaTone: 'neutral' },
  ];

  return (
    <motion.div className="ov-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div style={{ display: 'flex', gap: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ov-greeting">
            <div>
              <div className="ov-greeting-title">{greeting()}, {firstName}.</div>
              <div className="ov-greeting-sub">
                {kpis.pendingReview > 0 ? `${kpis.pendingReview} decisions need you today.` : 'Your roster is all caught up.'}
              </div>
            </div>
          </div>

          <PipelineCommandHero
            pendingReview={kpis.pendingReview}
            heroImage={incoming[0]?.photo || HERO_FALLBACK}
            onReview={() => navigate('/dashboard/agency/applicants')}
            onNewCasting={() => navigate('/dashboard/agency/casting')}
          />

          <StatLedger stats={ledger} />
          <CastingPipelineBar stages={stages} total={total} />
        </div>

        <aside className="ag-rightcol">
          <div className="ag-grain" style={{ opacity: .03, mixBlendMode: 'multiply' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <IncomingList applicants={incoming} onSelect={setSelected} />
            <OnTheFloorList alerts={alerts} />
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {selected && (
          <TalentPanel key={selected.id} talent={selected} context="overview" onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
```

> `TalentPanel` expects a talent object; `mapApplicant` already produces `{ id, profileId, name, photo, type, city, match }`. If `TalentPanel` requires more fields (check its prop usage), extend `mapApplicant` accordingly — do not invent fields it doesn't read.

- [ ] **Step 2: Build**

Run: `cd client && npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual check**

`npm run dev:all` → `/dashboard/agency`. Verify against the mockup: greeting, ink hero with count-up number + real `pendingReview`, ledger of four serif stats from real KPIs, animated pipeline bar, right column with real recent applicants (click one → `TalentPanel` opens) and the "On the floor" alerts list. Confirm empty states render for a fresh agency (no console errors when data is sparse).

- [ ] **Step 4: Commit**

```bash
git add client/src/domains/agency/pages/OverviewPage.jsx
git commit -m "feat(agency): overview command center bound to real API data"
```

---

## Task 10: Discover dark-mode, Team route, responsive & smoke

**Files:**
- Modify: `client/src/shared/layouts/AgencyLayout.css` (append `ag-shell--discover` overrides)
- Modify: `client/src/App.jsx` (add Team placeholder route)

- [ ] **Step 1: Re-add the Discover dark overrides for the new rail/masthead**

Append to `AgencyLayout.css` (adapt the old override block to new class names):

```css
.ag-shell--discover { background: transparent; }
.ag-shell--discover .ag-main { background: transparent; }
.ag-shell--discover .ag-masthead-status { color: rgba(255,255,255,.5); }
.ag-shell--discover .ag-rightcol { background: rgba(1,1,0,.25); border-left-color: rgba(201,165,90,.10); }
/* the ink rail already reads well over the cosmic background; no override needed */
```

- [ ] **Step 2: Lint & build**

Run: `cd client && npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 3: Smoke every agency route**

`npm run dev:all`, then visit each and confirm no crash and the shell renders correctly around the existing page:
`/dashboard/agency` (overview), `/applicants`, `/casting`, `/discover` (dark — rail/masthead legible), `/roster`, `/interviews`, `/reminders`, `/analytics`, `/settings`, `/messages`, `/activity`, `/signed`.

- [ ] **Step 4: Add the Team placeholder route**

In `client/src/App.jsx`, alongside the other agency routes, add:

```jsx
<Route path="/dashboard/agency/team" element={<AgencySettings />} />
```

(Points Team at the existing Settings page as a stopgap until a dedicated Team page is built in a later pass — avoids a dead link. Confirm `AgencySettings` is already imported; it is.)

- [ ] **Step 5: Lint, build, commit**

```bash
cd client && npm run lint && npm run build && cd ..
git add client/src/shared/layouts/AgencyLayout.css client/src/App.jsx
git commit -m "feat(agency): discover dark-mode shell overrides + team route stopgap"
```

---

## Task 11: Final verification

- [ ] **Step 1: Full lint + build**

Run: `cd client && npm run lint && npm run build`
Expected: 0 lint errors, build succeeds.

- [ ] **Step 2: Behavior checklist (in `npm run dev:all`)**

Confirm each:
- Rail collapses/expands via `«`/`»`; state persists across reload.
- Co-brand shows `PHOLIO ｜ <AGENCY>` with logo or monogram fallback.
- Member chip shows logged-in name + role; dropdown signs out.
- Masthead presence shows real team member initials with name tooltips.
- Overview numbers match the API (cross-check `/api/agency/overview` in the network tab).
- `prefers-reduced-motion` (OS setting) disables the count-up/parallax — number shows final value immediately.
- No regression on other agency routes; Discover stays legible.

- [ ] **Step 3: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore(agency): command-center shell verification cleanup"
```

---

## Self-review notes (already reconciled)

- **Spec §4 shell** → Tasks 4,5,6. **§5 Overview** → Tasks 7,8,9. **§6 data binding** → Tasks 1,7,9. **§7 assignment deferred** → intentionally absent (Phase 2); Mine/Team toggle omitted per locked default. **§8 flat roles** → role only displayed (Task 5/6), no gating. **§9 responsive/a11y/discover** → Tasks 4,10,11. **§10 file plan** → matches tasks. 
- **No client test framework** → verification via lint/build/manual is stated up front; no fabricated unit tests.
- **Type consistency** → CSS class contract section is the single source; hook/selector/return shapes match across Tasks 1, 7, 8, 9.
- **Known stopgaps flagged inline:** Team route → Settings; presence = members (not live status); notifications still empty/mock in shell.
