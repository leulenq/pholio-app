# Talent Dashboard — Overview Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new Pholio talent dashboard — a left-sidebar shell, a set of reusable primitives, and the Overview page as the reference implementation — replacing the current top-tab `DashboardLayoutShell` visual chrome while preserving all auth and gating logic.

**Architecture:** `DashboardLayoutShell` keeps its auth/gating/modal logic but delegates its visual output to the new `TalentLayout` component. `TalentLayout` is a pure visual shell (left sidebar + top utility bar + content area with `<Outlet />`). The Overview page composes `PresencePanel`, `ModuleCard`, and `StatBlock` primitives using data from existing hooks (`useAuth`, `useProfileStrength`, `useAnalytics`) plus a new `strengthActions` utility.

**Tech Stack:** React 19, React Router v7, TanStack Query v5, Lucide React icons, CSS custom properties (`--ag-*` tokens), Playfair Display + Inter fonts (already loaded via `index.css`)

**Design spec:** `docs/superpowers/specs/2026-05-07-talent-dashboard-design.md`

> **Note on GreetingHeader:** The spec defines a reusable `GreetingHeader` primitive (spec §4.1). This plan builds the greeting inline in `OverviewPage` (YAGNI — one page). When a second page needs it, extract to `client/src/shared/components/GreetingHeader/`.

---

## File Map

**Create:**
- `client/src/shared/layouts/TalentLayout/index.jsx`
- `client/src/shared/layouts/TalentLayout/TalentLayout.css`
- `client/src/shared/components/PresencePanel/index.jsx`
- `client/src/shared/components/PresencePanel/PresencePanel.css`
- `client/src/shared/components/ModuleCard/index.jsx`
- `client/src/shared/components/ModuleCard/ModuleCard.css`
- `client/src/shared/components/StatBlock/index.jsx`
- `client/src/shared/components/StatBlock/StatBlock.css`
- `client/src/domains/talent/utils/strengthActions.js`
- `client/src/domains/talent/pages/OverviewPage/index.jsx`
- `client/src/domains/talent/pages/OverviewPage/OverviewPage.css`

**Modify:**
- `client/src/styles/agency-tokens.css` — add `--td-*` layout dimension tokens
- `client/src/shared/layouts/DashboardLayoutShell.jsx` — replace `<Header>` + `<main>` with `<TalentLayout>`
- `client/src/App.jsx` — swap `DashboardPage` import with `OverviewPage`

---

## Task 1: Add talent dashboard design tokens

**Files:**
- Modify: `client/src/styles/agency-tokens.css`

- [ ] **Step 1: Open `client/src/styles/agency-tokens.css` and locate the `/* Layout */` section (or the end of `:root {`). Add the following block immediately after the existing layout tokens:**

```css
/* ---- Talent Dashboard Layout Dimensions ---- */
--td-sidebar-w: 185px;
--td-topbar-h: 52px;
--td-content-pad-x: 60px;
--td-content-pad-top: 56px;
--td-content-pad-bottom: 64px;
--td-section-gap: 40px;
--td-module-gap: 24px;
--td-presence-pad-y: 48px;
--td-presence-pad-x: 52px;
--td-ink-deep: #141210;
```

- [ ] **Step 2: Commit**

```bash
git add client/src/styles/agency-tokens.css
git commit -m "feat(tokens): add talent dashboard layout dimension tokens"
```

---

## Task 2: Build TalentLayout — visual shell

**Files:**
- Create: `client/src/shared/layouts/TalentLayout/index.jsx`
- Create: `client/src/shared/layouts/TalentLayout/TalentLayout.css`

- [ ] **Step 1: Create `client/src/shared/layouts/TalentLayout/index.jsx`**

```jsx
import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Images, FileText, BarChart2, User, CreditCard, Bell, Settings } from 'lucide-react';
import { useAuth } from '../../../domains/auth/hooks/useAuth';
import { useFlash } from '../../hooks/useFlash';
import { TierBadgeFromSubscription } from '../../components/ui/TierBadge';
import './TalentLayout.css';

const WORKSPACE_NAV = [
  { label: 'Overview',     to: '/dashboard/talent',               icon: LayoutDashboard, end: true },
  { label: 'Portfolio',    to: '/dashboard/talent/media',         icon: Images },
  { label: 'Applications', to: '/dashboard/talent/applications',  icon: FileText },
  { label: 'Analytics',    to: '/dashboard/talent/analytics',     icon: BarChart2 },
];

const PROFILE_NAV = [
  { label: 'My Profile', to: '/dashboard/talent/profile',        icon: User },
  { label: 'Comp Card',  to: '/dashboard/talent/pdf-customizer', icon: CreditCard },
];

export default function TalentLayout({ outletContext = {} }) {
  const { user, profile, subscription } = useAuth();
  const { message, clearFlash } = useFlash();

  const firstName = profile?.first_name || profile?.name?.split(' ')[0] || '';
  const initials  = firstName ? firstName.slice(0, 2).toUpperCase() : 'ME';
  const today     = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div className="tl-root">
      {/* ── Top utility bar ── */}
      <div className="tl-topbar">
        <div className="tl-topbar-logo-zone">
          <span className="tl-logo">PHOLIO.</span>
        </div>
        <div className="tl-topbar-actions">
          <span className="tl-date">{today}</span>
          <div className="tl-topbar-divider" />
          <button className="tl-icon-btn" aria-label="Notifications">
            <Bell size={15} strokeWidth={1.75} />
          </button>
          <button className="tl-icon-btn" aria-label="Settings">
            <Settings size={14} strokeWidth={1.75} />
          </button>
          <div className="tl-topbar-divider" />
          <div className="tl-avatar" aria-hidden="true">{initials}</div>
        </div>
      </div>

      {/* ── Body: sidebar + content ── */}
      <div className="tl-body">
        <aside className="tl-sidebar">
          <nav className="tl-nav" aria-label="Main navigation">
            <span className="tl-nav-section">Workspace</span>
            {WORKSPACE_NAV.map(item => <TalentNavItem key={item.to} item={item} />)}
            <span className="tl-nav-section">Profile</span>
            {PROFILE_NAV.map(item => <TalentNavItem key={item.to} item={item} />)}
          </nav>

          <div className="tl-sidebar-footer">
            <div className="tl-profile-card">
              <div className="tl-profile-avatar" aria-hidden="true" />
              <div className="tl-profile-info">
                <span className="tl-profile-name">
                  {firstName || user?.email?.split('@')[0] || 'You'}
                </span>
                <TierBadgeFromSubscription
                  subscription={subscription}
                  size="sm"
                  showIcon={false}
                  className="tl-tier-badge"
                />
              </div>
            </div>
          </div>
        </aside>

        <main className="tl-content">
          {message && (
            <div className={`flash-message ${message.type}`} style={{ margin: '16px 60px 0' }}>
              <span>{message.text}</span>
              <button onClick={clearFlash} className="flash-close">&times;</button>
            </div>
          )}
          <Outlet context={outletContext} />
        </main>
      </div>
    </div>
  );
}

function TalentNavItem({ item }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `tl-nav-item${isActive ? ' tl-nav-item--active' : ''}`
      }
    >
      <span className="tl-nav-icon" aria-hidden="true">
        <Icon size={10} strokeWidth={2} />
      </span>
      {item.label}
    </NavLink>
  );
}
```

- [ ] **Step 2: Create `client/src/shared/layouts/TalentLayout/TalentLayout.css`**

```css
/* ─────────────────────────────────────────
   TalentLayout — app shell
   ───────────────────────────────────────── */
.tl-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* Top utility bar */
.tl-topbar {
  height: var(--td-topbar-h, 52px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px 0 0;
  background: rgba(250, 248, 245, 0.97);
  border-bottom: 1px solid rgba(26, 24, 21, 0.06);
  flex-shrink: 0;
  z-index: 10;
  position: relative;
}

.tl-topbar-logo-zone {
  width: var(--td-sidebar-w, 185px);
  padding-left: 22px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.tl-logo {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 0.9375rem;
  font-weight: 400;
  letter-spacing: 0.2em;
  color: var(--ag-gold, #C9A55A);
}

.tl-topbar-actions {
  display: flex;
  align-items: center;
  gap: 18px;
}

.tl-date {
  font-size: 0.5625rem;
  font-weight: 600;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: #C8C2BA;
}

.tl-topbar-divider {
  width: 1px;
  height: 16px;
  background: rgba(26, 24, 21, 0.08);
  flex-shrink: 0;
}

.tl-icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #B8B2AA;
  transition: color 0.15s var(--ag-ease, cubic-bezier(0.4, 0, 0.2, 1));
}

.tl-icon-btn:hover { color: #6B6560; }

.tl-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(145deg, #C9A55A, #A8894E);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Inter', -apple-system, sans-serif;
  font-size: 0.5625rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

/* Body row */
.tl-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Sidebar */
.tl-sidebar {
  width: var(--td-sidebar-w, 185px);
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.82);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  border-right: 1px solid rgba(201, 165, 90, 0.09);
  display: flex;
  flex-direction: column;
  padding: 28px 0 24px;
  overflow: hidden;
}

.tl-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 10px;
}

.tl-nav-section {
  display: block;
  font-size: 0.5rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(26, 24, 21, 0.28);
  padding: 16px 12px 6px;
}

.tl-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: rgba(26, 24, 21, 0.38);
  text-decoration: none;
  position: relative;
  transition: color 0.15s var(--ag-ease, cubic-bezier(0.4, 0, 0.2, 1)),
              background 0.15s var(--ag-ease, cubic-bezier(0.4, 0, 0.2, 1));
}

.tl-nav-item:hover {
  color: rgba(26, 24, 21, 0.65);
  background: rgba(26, 24, 21, 0.03);
}

.tl-nav-item--active {
  color: #1A1815;
  background: rgba(201, 165, 90, 0.07);
}

.tl-nav-item--active::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 18px;
  background: #C9A55A;
  border-radius: 0 2px 2px 0;
}

.tl-nav-icon {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(26, 24, 21, 0.05);
  transition: background 0.15s var(--ag-ease, cubic-bezier(0.4, 0, 0.2, 1));
}

.tl-nav-item--active .tl-nav-icon {
  background: rgba(201, 165, 90, 0.14);
}

/* Sidebar footer */
.tl-sidebar-footer {
  margin-top: auto;
  padding: 16px 14px 0;
  border-top: 1px solid rgba(26, 24, 21, 0.06);
  margin-left: 10px;
  margin-right: 10px;
}

.tl-profile-card {
  display: flex;
  align-items: center;
  gap: 9px;
  cursor: default;
}

.tl-profile-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: linear-gradient(145deg, #C9A55A, #A8894E);
  flex-shrink: 0;
}

.tl-profile-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.tl-profile-name {
  font-size: 0.625rem;
  font-weight: 600;
  color: #2D2A26;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tl-tier-badge {
  font-size: 0.5rem !important;
  padding: 2px 7px !important;
}

/* Content area */
.tl-content {
  flex: 1;
  background: #FAF8F5;
  overflow-y: auto;
  min-width: 0;
}
```

- [ ] **Step 3: Start the dev server and verify the layout renders without errors**

```bash
npm run dev:all
```

Open `http://localhost:5173`. The page will still use the old shell — that's expected. We wire it in Task 3. Just confirm no import errors in the console.

- [ ] **Step 4: Commit**

```bash
git add client/src/shared/layouts/TalentLayout/
git commit -m "feat(layout): add TalentLayout shell — left sidebar + top utility bar"
```

---

## Task 3: Wire TalentLayout into DashboardLayoutShell

**Files:**
- Modify: `client/src/shared/layouts/DashboardLayoutShell.jsx`

The current `DashboardLayoutShell` has important auth/gating/modal logic that must be preserved. We keep all of that. We only replace the visual output — swapping `<Header>` + `<main>` for `<TalentLayout>`.

- [ ] **Step 1: Open `client/src/shared/layouts/DashboardLayoutShell.jsx`. Add the TalentLayout import at the top of the import block:**

```js
import TalentLayout from './TalentLayout';
```

- [ ] **Step 2: Remove the existing `Header` import line:**

```js
// DELETE this line:
import Header from '../components/Header/Header';
```

- [ ] **Step 3: Remove `useFlash` from `DashboardLayoutShell` — `TalentLayout` now owns flash rendering.**

Find and delete this import line:
```js
import { useFlash } from '../hooks/useFlash';
```

Find the line that calls it (near the top of the component function body):
```js
const { message, clearFlash } = useFlash();
```
Delete that line too. The flash banner JSX inside the `<main>` block will also be gone once you replace the return in Step 4 — no separate deletion needed there.

- [ ] **Step 4: Replace the final `return` statement in `DashboardLayoutShell`. The current return renders `<div className="dashboard-root">` with `<Header>`, `<main>`, and the modal. Replace it with:**

```jsx
return (
  <>
    <TalentLayout outletContext={{ isBlocked }} />
    <LuxuryCompletionPromptModal
      isOpen={isPromptOpen}
      mode={promptContext?.hasRedirectSignal ? 'targeted' : 'generic'}
      targetAgency={promptContext?.targetAgency}
      isSubmitting={isPrimarySubmitting || isPromptLoading}
      onPrimaryAction={handlePrimaryAction}
      onSecondaryAction={dismissPrompt}
      onClose={dismissPrompt}
      errorMessage={promptError}
    />
  </>
);
```

The loading state return (the spinner) and the error/gating redirects above it stay exactly as they are — do not touch them.

- [ ] **Step 5: Open `http://localhost:5173/dashboard/talent`. You should now see the new sidebar + top bar layout instead of the old header. Verify:**
  - The sidebar is visible on the left with nav items
  - The top utility bar shows the logo, date, and avatar
  - The Overview content area renders (it will show the old `DashboardPage` content — that's expected until Task 7)
  - No console errors

- [ ] **Step 6: Commit**

```bash
git add client/src/shared/layouts/DashboardLayoutShell.jsx
git commit -m "feat(layout): wire TalentLayout into DashboardLayoutShell, remove Header"
```

---

## Task 4: Build PresencePanel component

**Files:**
- Create: `client/src/shared/components/PresencePanel/index.jsx`
- Create: `client/src/shared/components/PresencePanel/PresencePanel.css`

- [ ] **Step 1: Create `client/src/shared/components/PresencePanel/index.jsx`**

```jsx
import { User } from 'lucide-react';
import './PresencePanel.css';

const STATUS = {
  strong:     { label: 'Strong Foundation', pip: 'strong' },
  attention:  { label: 'Needs Attention',   pip: 'attention' },
  incomplete: { label: 'Incomplete',        pip: 'incomplete' },
};

function scoreToStatus(score) {
  if (score >= 70) return 'strong';
  if (score >= 40) return 'attention';
  return 'incomplete';
}

/**
 * @param {object}   props
 * @param {number}   props.score        0–100
 * @param {string}   props.interpretation  Sentence to display in italic
 * @param {Array<{text: string, reason: string, priority: 'high'|'med'|'low'}>} props.actions
 * @param {string|null} props.photoUrl  URL of portrait photo; null → placeholder
 */
export default function PresencePanel({ score = 0, interpretation = '', actions = [], photoUrl = null }) {
  const statusKey = scoreToStatus(score);
  const { label: statusLabel } = STATUS[statusKey];
  const showActions = actions.length > 0 && !(score >= 95 && actions.length === 0);

  return (
    <div className="pp-panel">
      {/* Score zone */}
      <div className="pp-score-zone">
        <span className="pp-eyebrow">Profile Strength</span>
        <div className="pp-number">{score}</div>
        <div className="pp-denom">/ 100</div>
        <div className={`pp-status pp-status--${statusKey}`}>
          <span className="pp-status-pip" aria-hidden="true" />
          <span className="pp-status-text">{statusLabel}</span>
        </div>
      </div>

      {/* Vertical divider */}
      <div className="pp-divider" aria-hidden="true" />

      {/* Content zone */}
      <div className="pp-content-zone">
        <span className="pp-eyebrow pp-content-eyebrow">How you're presenting</span>
        <p className="pp-interpretation">{interpretation}</p>
        {showActions && (
          <ul className="pp-actions" aria-label="Profile improvements">
            {actions.map((action, i) => (
              <li key={i} className="pp-action">
                <div
                  className={`pp-action-bar pp-action-bar--${action.priority}`}
                  aria-hidden="true"
                />
                <div>
                  <div className="pp-action-main">{action.text}</div>
                  {action.reason && (
                    <div className="pp-action-sub">{action.reason}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Photo accent */}
      <div className="pp-photo-zone" aria-hidden="true">
        <div className="pp-photo-frame">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="pp-photo-img" />
          ) : (
            <span className="pp-photo-placeholder">
              <User size={16} strokeWidth={1.5} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `client/src/shared/components/PresencePanel/PresencePanel.css`**

```css
/* ─────────────────────────────────────────
   PresencePanel — dark identity anchor
   ───────────────────────────────────────── */
.pp-panel {
  background: var(--td-ink-deep, #141210);
  border-radius: 20px;
  padding: var(--td-presence-pad-y, 48px) var(--td-presence-pad-x, 52px);
  display: flex;
  align-items: stretch;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(201, 165, 90, 0.09);
  background-image:
    radial-gradient(ellipse 60% 50% at 8% 0%, rgba(201, 165, 90, 0.06) 0%, transparent 70%),
    radial-gradient(ellipse 40% 60% at 95% 100%, rgba(201, 165, 90, 0.04) 0%, transparent 60%);
}

/* Score zone */
.pp-score-zone {
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 200px;
  flex-shrink: 0;
  padding-right: 48px;
}

.pp-eyebrow {
  display: block;
  font-size: 0.5rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(201, 165, 90, 0.5);
  margin-bottom: 12px;
}

.pp-number {
  font-family: 'Inter', -apple-system, sans-serif;
  font-size: 6rem;
  font-weight: 700;
  letter-spacing: -0.04em;
  color: #F5F2EC;
  line-height: 1;
}

.pp-denom {
  font-size: 0.875rem;
  font-weight: 400;
  color: rgba(245, 242, 236, 0.28);
  margin-top: -4px;
  margin-left: 2px;
}

.pp-status {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.pp-status-pip {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pp-status--strong    .pp-status-pip { background: rgba(45, 138, 86, 0.9); }
.pp-status--attention .pp-status-pip { background: rgba(194, 133, 14, 0.8); }
.pp-status--incomplete .pp-status-pip { background: rgba(156, 149, 142, 0.6); }

.pp-status-text {
  font-size: 0.5625rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.pp-status--strong    .pp-status-text { color: rgba(45, 138, 86, 0.75); }
.pp-status--attention .pp-status-text { color: rgba(194, 133, 14, 0.7); }
.pp-status--incomplete .pp-status-text { color: rgba(156, 149, 142, 0.55); }

/* Vertical divider */
.pp-divider {
  width: 1px;
  background: rgba(201, 165, 90, 0.12);
  flex-shrink: 0;
  align-self: stretch;
}

/* Content zone */
.pp-content-zone {
  flex: 1;
  padding-left: 48px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.pp-content-eyebrow {
  margin-bottom: 14px;
}

.pp-interpretation {
  font-family: 'Playfair Display', Georgia, serif;
  font-style: italic;
  font-size: 1.0625rem;
  font-weight: 400;
  color: rgba(245, 242, 236, 0.72);
  line-height: 1.5;
  letter-spacing: -0.01em;
  margin: 0 0 28px;
  max-width: 380px;
}

.pp-actions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pp-action {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.pp-action-bar {
  width: 2px;
  min-height: 34px;
  border-radius: 2px;
  flex-shrink: 0;
  margin-top: 2px;
}

.pp-action-bar--high { background: #C9A55A; }
.pp-action-bar--med  { background: rgba(194, 133, 14, 0.65); }
.pp-action-bar--low  { background: rgba(156, 149, 142, 0.4); }

.pp-action-main {
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(245, 242, 236, 0.82);
  line-height: 1.3;
  margin-bottom: 3px;
}

.pp-action-sub {
  font-size: 0.625rem;
  font-weight: 400;
  color: rgba(245, 242, 236, 0.32);
  line-height: 1.4;
  letter-spacing: 0.01em;
}

/* Photo accent */
.pp-photo-zone {
  width: 90px;
  flex-shrink: 0;
  margin-left: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pp-photo-frame {
  width: 82px;
  height: 108px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(201, 165, 90, 0.08);
  border: 1px solid rgba(201, 165, 90, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}

.pp-photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
}

.pp-photo-placeholder {
  color: rgba(201, 165, 90, 0.35);
  display: flex;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/shared/components/PresencePanel/
git commit -m "feat(components): add PresencePanel — dark identity anchor"
```

---

## Task 5: Build ModuleCard and StatBlock primitives

**Files:**
- Create: `client/src/shared/components/ModuleCard/index.jsx`
- Create: `client/src/shared/components/ModuleCard/ModuleCard.css`
- Create: `client/src/shared/components/StatBlock/index.jsx`
- Create: `client/src/shared/components/StatBlock/StatBlock.css`

- [ ] **Step 1: Create `client/src/shared/components/ModuleCard/index.jsx`**

```jsx
import './ModuleCard.css';

/**
 * @param {object}      props
 * @param {string}      [props.label]    All-caps section label shown above content
 * @param {React.ReactNode} props.children
 */
export default function ModuleCard({ label, children }) {
  return (
    <div className="mc-card">
      {label && <div className="mc-label">{label}</div>}
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create `client/src/shared/components/ModuleCard/ModuleCard.css`**

```css
.mc-card {
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(26, 24, 21, 0.06);
  border-radius: 16px;
  padding: 28px 32px;
}

.mc-label {
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #C8C2BA;
  margin-bottom: 22px;
}
```

- [ ] **Step 3: Create `client/src/shared/components/StatBlock/index.jsx`**

```jsx
import './StatBlock.css';

/**
 * @param {object}   props
 * @param {string|number} props.number   The displayed value (e.g. "1.4k", 89, 3)
 * @param {string}   props.label         All-caps label below number
 * @param {{ text: string, direction: 'up'|'down' }} [props.delta]  Optional delta badge
 * @param {string}   [props.subLine]     Optional muted context line
 * @param {'default'|'pending'|'accepted'|'declined'} [props.color]
 */
export default function StatBlock({ number, label, delta, subLine, color = 'default' }) {
  return (
    <div className="sb-block">
      <div className="sb-label">{label}</div>
      <div className={`sb-number sb-number--${color}`}>
        {number}
        {delta && (
          <span className={`sb-delta sb-delta--${delta.direction ?? 'up'}`}>
            {delta.text}
          </span>
        )}
      </div>
      {subLine && <div className="sb-sub">{subLine}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Create `client/src/shared/components/StatBlock/StatBlock.css`**

```css
.sb-block {
  display: flex;
  flex-direction: column;
}

.sb-label {
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: #C8C2BA;
  margin-bottom: 6px;
}

.sb-number {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 2.25rem;
  font-weight: 400;
  letter-spacing: -0.03em;
  color: #1A1815;
  line-height: 1;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.sb-number--pending  { color: #C2850E; }
.sb-number--accepted { color: #2D8A56; }
.sb-number--declined { color: #C8C2BA; }

.sb-delta {
  font-family: 'Inter', -apple-system, sans-serif;
  font-size: 0.5625rem;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.sb-delta--up   { color: rgba(45, 138, 86, 0.75); }
.sb-delta--down { color: rgba(192, 57, 43, 0.75); }

.sb-sub {
  font-size: 0.625rem;
  color: #9C958E;
  line-height: 1.4;
  margin-top: 4px;
}
```

- [ ] **Step 5: Commit**

```bash
git add client/src/shared/components/ModuleCard/ client/src/shared/components/StatBlock/
git commit -m "feat(components): add ModuleCard and StatBlock primitives"
```

---

## Task 6: Build strengthActions utility

**Files:**
- Create: `client/src/domains/talent/utils/strengthActions.js`

This utility maps `completeness.nextSteps` (returned by `useProfileStrength`) to the `{ text, reason, priority }[]` shape that `PresencePanel` expects, and generates the interpretation sentence.

- [ ] **Step 1: Create `client/src/domains/talent/utils/strengthActions.js`**

```js
const PRIORITIES = ['high', 'med', 'low'];

// Known step text fragments → explanatory reason
const STEP_REASONS = {
  'portfolio': "Agencies scan portfolios first — more range increases your chances of matching a brief.",
  'image':     "Agencies scan portfolios first — more range increases your chances of matching a brief.",
  'photo':     "Agencies scan portfolios first — more range increases your chances of matching a brief.",
  'measurement': "Required for commercial and runway bookings. Missing this filters you out automatically.",
  'height':    "Required for commercial and runway bookings. Missing this filters you out automatically.",
  'weight':    "Required for commercial and runway bookings. Missing this filters you out automatically.",
  'bio':       "Helps agencies understand your background and experience at a glance.",
  'about':     "Helps agencies understand your background and experience at a glance.",
};

function inferReason(text) {
  const lower = text.toLowerCase();
  for (const [key, reason] of Object.entries(STEP_REASONS)) {
    if (lower.includes(key)) return reason;
  }
  return '';
}

/**
 * Maps completeness.nextSteps (any shape) → PresencePanel action items.
 * Handles both string arrays and object arrays from the backend.
 *
 * @param {Array<string|{label?:string, text?:string, title?:string, reason?:string, hint?:string}>} nextSteps
 * @returns {Array<{text: string, reason: string, priority: 'high'|'med'|'low'}>}
 */
export function normalizeStrengthActions(nextSteps = []) {
  return nextSteps.slice(0, 4).map((step, i) => {
    const text =
      typeof step === 'string'
        ? step
        : (step.label ?? step.text ?? step.title ?? '');

    const reason =
      typeof step === 'object'
        ? (step.reason ?? step.hint ?? step.description ?? inferReason(text))
        : inferReason(text);

    return { text, reason, priority: PRIORITIES[i] ?? 'low' };
  });
}

/**
 * Generates a single-sentence interpretation of the profile strength state.
 *
 * @param {number} score       0–100
 * @param {number} actionCount Number of gaps to close
 * @returns {string}
 */
export function getStrengthInterpretation(score, actionCount) {
  if (score >= 95 || actionCount === 0) {
    return 'Your profile is complete and presenting well.';
  }
  if (score >= 70) {
    return actionCount === 1
      ? 'One gap is limiting your visibility to agencies. Closing it would meaningfully change how you appear.'
      : `${actionCount} specific gaps are limiting your visibility to agencies. Closing them would meaningfully change how you appear.`;
  }
  if (score >= 40) {
    return 'Your profile needs attention. Several key areas are incomplete, reducing how agencies discover you.';
  }
  return 'Your profile is incomplete. Finishing the key sections will unlock your visibility to agencies.';
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/domains/talent/utils/strengthActions.js
git commit -m "feat(utils): add strengthActions — normalizer and interpretation generator"
```

---

## Task 7: Build and wire the Overview page

**Files:**
- Create: `client/src/domains/talent/pages/OverviewPage/index.jsx`
- Create: `client/src/domains/talent/pages/OverviewPage/OverviewPage.css`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Before writing anything, open `client/src/domains/talent/hooks/useAnalytics.js` and confirm the exact field names on the `summary` object it returns (e.g. `summary.views` vs `summary.profileViews`, `summary.portfolioOpens` vs `summary.portfolio_opens`). You will use those exact names in Step 2.**

- [ ] **Step 2: Create `client/src/domains/talent/pages/OverviewPage/index.jsx`**

Replace `summary.profileViews` / `summary.portfolioOpens` / `summary.viewsDelta` / `summary.agencyCount` in the data extraction block below with the exact field names you found in Step 1. Everything else stays as written.

```jsx
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../auth/hooks/useAuth';
import { useProfileStrength } from '../../hooks/useProfileStrength';
import { useAnalytics } from '../../hooks/useAnalytics';
import { talentApi } from '../../api/talent';
import { TierBadgeFromSubscription } from '../../../../shared/components/ui/TierBadge';
import PresencePanel from '../../../../shared/components/PresencePanel';
import ModuleCard from '../../../../shared/components/ModuleCard';
import StatBlock from '../../../../shared/components/StatBlock';
import { normalizeStrengthActions, getStrengthInterpretation } from '../../utils/strengthActions';
import './OverviewPage.css';

function applicationsFromPayload(data) {
  if (Array.isArray(data)) return data;
  if (data?.data && Array.isArray(data.data)) return data.data;
  return [];
}

export default function OverviewPage() {
  const { user, profile, images, subscription, isLoading: authLoading } = useAuth();
  const { score, nextSteps } = useProfileStrength();
  const { summary } = useAnalytics();

  const { data: applicationsPayload } = useQuery({
    queryKey: ['applications'],
    queryFn: () => talentApi.getApplications(),
    staleTime: 1000 * 60,
    retry: 1,
  });

  // ── Identity ──────────────────────────────────────────────────────────────
  const firstName = profile?.first_name || profile?.name?.split(' ')[0] || 'You';
  const joinDate  = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  // ── Presence panel ────────────────────────────────────────────────────────
  const actions        = normalizeStrengthActions(nextSteps);
  const interpretation = getStrengthInterpretation(score, actions.length);
  const photoUrl       = images?.[0]?.url ?? images?.[0]?.path ?? null;

  // ── Applications ──────────────────────────────────────────────────────────
  const applications = applicationsFromPayload(applicationsPayload);
  const pending   = applications.filter(a => a.status === 'pending').length;
  const accepted  = applications.filter(a => ['accepted', 'active'].includes(a.status)).length;
  const declined  = applications.filter(a => ['declined', 'rejected'].includes(a.status)).length;

  // ── Traction — update field names to match useAnalytics summary shape ─────
  const profileViews   = summary?.views ?? summary?.profileViews ?? 0;
  const portfolioOpens = summary?.portfolioOpens ?? summary?.portfolio_opens ?? 0;
  const viewsDelta     = summary?.viewsDelta ?? summary?.views_delta ?? null;
  const agencyCount    = summary?.agencyCount ?? summary?.agency_count ?? null;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="ov-loading">
        <div className="ov-spinner" />
      </div>
    );
  }

  return (
    <div className="ov-page">

      {/* Greeting */}
      <div className="ov-greeting">
        <div className="ov-greeting-left">
          <span className="ov-eyebrow">Welcome back,</span>
          <h1 className="ov-name">
            {firstName}
            <TierBadgeFromSubscription
              subscription={subscription}
              size="md"
              className="ov-tier-badge"
            />
          </h1>
        </div>
        {joinDate && (
          <div className="ov-greeting-meta">
            <span className="ov-meta-label">Member since</span>
            <span className="ov-meta-value">{joinDate}</span>
          </div>
        )}
      </div>

      {/* Identity Presence Panel */}
      <PresencePanel
        score={score}
        interpretation={interpretation}
        actions={actions}
        photoUrl={photoUrl}
      />

      {/* Supporting modules */}
      <div className="ov-modules">

        <ModuleCard label="Applications">
          {applications.length === 0 ? (
            <p className="ov-empty">No applications yet.</p>
          ) : (
            <div className="ov-stat-row">
              <StatBlock number={pending}  label="Pending"  color="pending"  />
              <div className="ov-stat-divider" />
              <StatBlock number={accepted} label="Accepted" color="accepted" />
              <div className="ov-stat-divider" />
              <StatBlock number={declined} label="Declined" color="declined" />
            </div>
          )}
        </ModuleCard>

        <ModuleCard label="Traction this week">
          {!summary ? (
            <p className="ov-empty">Stats appear after your first week active.</p>
          ) : (
            <div className="ov-stat-row">
              <StatBlock
                number={profileViews >= 1000
                  ? `${(profileViews / 1000).toFixed(1)}k`
                  : profileViews}
                label="Profile Views"
                delta={viewsDelta > 0
                  ? { text: `+${viewsDelta}%`, direction: 'up' }
                  : null}
                subLine={viewsDelta > 0 ? 'Highest week in last 30 days' : null}
              />
              <div className="ov-stat-divider" />
              <StatBlock
                number={portfolioOpens}
                label="Portfolio Opens"
                subLine={agencyCount
                  ? `From ${agencyCount} ${agencyCount === 1 ? 'agency' : 'agencies'} this week`
                  : null}
              />
            </div>
          )}
        </ModuleCard>

      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `client/src/domains/talent/pages/OverviewPage/OverviewPage.css`**

```css
/* ─────────────────────────────────────────
   OverviewPage — reference implementation
   ───────────────────────────────────────── */
.ov-page {
  padding: var(--td-content-pad-top, 56px) var(--td-content-pad-x, 60px) var(--td-content-pad-bottom, 64px);
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--td-section-gap, 40px);
}

/* Greeting */
.ov-greeting {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.ov-eyebrow {
  display: block;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #9C958E;
  margin-bottom: 8px;
}

.ov-name {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 3.25rem;
  font-weight: 400;
  letter-spacing: -0.025em;
  color: #1A1815;
  line-height: 1;
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0;
}

.ov-tier-badge {
  margin-bottom: 6px;
}

.ov-greeting-meta {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ov-meta-label {
  font-size: 0.5625rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #C8C2BA;
}

.ov-meta-value {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 1.25rem;
  font-weight: 400;
  color: #6B6560;
}

/* Modules */
.ov-modules {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--td-module-gap, 24px);
}

.ov-stat-row {
  display: flex;
  align-items: flex-start;
}

.ov-stat-divider {
  width: 1px;
  background: rgba(26, 24, 21, 0.06);
  align-self: stretch;
  margin: 0 24px;
  flex-shrink: 0;
}

.ov-empty {
  font-size: 0.875rem;
  color: #9C958E;
  padding: 40px 0;
  text-align: center;
  margin: 0;
}

/* Loading */
.ov-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 400px;
}

.ov-spinner {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid rgba(201, 165, 90, 0.2);
  border-top-color: #C9A55A;
  animation: ov-spin 0.8s linear infinite;
}

@keyframes ov-spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 4: Update `client/src/App.jsx` — replace the `DashboardPage` import and route**

Add at the top of the import block (near the other talent page imports):
```js
import OverviewPage from './domains/talent/pages/OverviewPage';
```

Find the route:
```jsx
<Route path="/dashboard/talent" element={<DashboardPage />} />
```

Replace it with:
```jsx
<Route path="/dashboard/talent" element={<OverviewPage />} />
```

Leave all other talent routes untouched. Do not remove the `DashboardPage` import yet (other routes may reference it indirectly).

- [ ] **Step 5: Open `http://localhost:5173/dashboard/talent` and verify:**
  - The greeting row renders with the talent's first name in large Playfair Display
  - The dark presence panel is visible below with score, divider, interpretation, and action items
  - The two supporting module cards appear below with stat numbers
  - No console errors

- [ ] **Step 6: Verify empty states**
  - If the talent has no applications: the Applications module should show `"No applications yet."`
  - If `summary` is null/undefined: the Traction module should show `"Stats appear after your first week active."`

- [ ] **Step 7: Commit**

```bash
git add client/src/domains/talent/pages/OverviewPage/ client/src/App.jsx
git commit -m "feat(overview): build talent Overview page — presence panel, applications, traction"
```

---

## Self-Review Checklist

After implementation, verify:

- [ ] Sidebar active state highlights "Overview" when on `/dashboard/talent` and other nav items when on their respective paths
- [ ] `TalentLayout` renders on all `/dashboard/talent/*` routes (profile, media, applications, analytics, settings) without breaking existing page content
- [ ] Score ≥ 70 shows green pip + "Strong Foundation"; 40–69 shows amber + "Needs Attention"; < 40 shows muted + "Incomplete"
- [ ] Profile photo (first image by sort order) renders in the photo accent frame; placeholder silhouette shown when no images exist
- [ ] Score ≥ 95 with zero action items: action list is hidden, interpretation reads "Your profile is complete and presenting well."
- [ ] `LuxuryCompletionPromptModal` still triggers as before (the logic lives in `DashboardLayoutShell` unchanged)
- [ ] Flash messages render inside the content area (handled by `TalentLayout` via `useFlash`)
- [ ] Profile gating redirect still works (the `isBlocked` + `isRestrictedTalentRoute` logic in `DashboardLayoutShell` is untouched)
