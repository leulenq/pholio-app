# Talent Dashboard: Sidebar → Top Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the left sidebar from the talent dashboard and replace it with a centered horizontal nav inside the topbar.

**Architecture:** The `TalentLayout` shell is restructured: the topbar becomes a 3-column grid (logo | centered nav | actions), the sidebar `<aside>` is deleted, and `tl-content` expands to fill the full viewport width. No new files — two files modified only.

**Tech Stack:** React 19, React Router v7 (NavLink), custom CSS (no Tailwind in this shell)

---

## File Map

| File | Action |
|------|--------|
| `client/src/shared/layouts/TalentLayout/index.jsx` | Rewrite — remove sidebar JSX, restructure topbar, add inline nav |
| `client/src/shared/layouts/TalentLayout/TalentLayout.css` | Rewrite — remove sidebar rules, add `.tl-topnav` styles, update topbar to grid layout |

> **Note:** This is a pure visual/layout change. There are no unit tests for the layout shell in this codebase. Verification is done by running the dev server and checking the result in a browser.

---

## Task 1: Rewrite TalentLayout JSX

**Files:**
- Modify: `client/src/shared/layouts/TalentLayout/index.jsx`

- [ ] **Step 1: Replace the file contents with the new layout**

Open `client/src/shared/layouts/TalentLayout/index.jsx` and replace its entire contents with:

```jsx
import { Outlet, NavLink } from 'react-router-dom';
import { Bell, Settings } from 'lucide-react';
import { useAuth } from '../../../domains/auth/hooks/useAuth';
import { useFlash } from '../../hooks/useFlash';
import './TalentLayout.css';

const NAV_ITEMS = [
  { label: 'Overview',     to: '/dashboard/talent',               end: true },
  { label: 'Portfolio',    to: '/dashboard/talent/media' },
  { label: 'Applications', to: '/dashboard/talent/applications' },
  { label: 'Analytics',    to: '/dashboard/talent/analytics' },
  { label: 'Profile',      to: '/dashboard/talent/profile' },
  { label: 'Comp Card',    to: '/dashboard/talent/pdf-customizer' },
];

export default function TalentLayout({ outletContext = {} }) {
  const { profile } = useAuth();
  const { message, clearFlash } = useFlash();

  const firstName = profile?.first_name || profile?.name?.split(' ')[0] || '';
  const initials  = firstName ? firstName.slice(0, 2).toUpperCase() : 'ME';

  return (
    <div className="tl-root">
      <div className="tl-topbar">
        <div className="tl-logo-lockup" aria-label="Pholio">
          <span className="tl-logo-word">PHOLIO</span>
          <div className="tl-logo-sweep" aria-hidden />
        </div>

        <nav className="tl-topnav" aria-label="Main navigation">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `tl-topnav-link${isActive ? ' tl-topnav-link--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="tl-topbar-actions">
          <button className="tl-icon-btn" aria-label="Notifications">
            <Bell size={14} strokeWidth={1.5} />
          </button>
          <button className="tl-icon-btn" aria-label="Settings">
            <Settings size={14} strokeWidth={1.5} />
          </button>
          <div className="tl-avatar" aria-hidden="true">{initials}</div>
        </div>
      </div>

      <main className="tl-content">
        {message && (
          <div className={`tl-flash tl-flash--${message.type}`} style={{ margin: '16px 32px 0' }}>
            <span>{message.text}</span>
            <button onClick={clearFlash} className="tl-flash-close">&times;</button>
          </div>
        )}
        <Outlet context={outletContext} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify no lint errors**

```bash
cd client && npx eslint src/shared/layouts/TalentLayout/index.jsx --max-warnings 0
```

Expected: no output (clean).

---

## Task 2: Rewrite TalentLayout CSS

**Files:**
- Modify: `client/src/shared/layouts/TalentLayout/TalentLayout.css`

- [ ] **Step 1: Replace the file contents with the new styles**

Open `client/src/shared/layouts/TalentLayout/TalentLayout.css` and replace its entire contents with:

```css
/* Talent layout: editorial shell */
.tl-root {
  --tl-ink: #050505;
  --tl-ink-soft: #0f0f0f;
  --tl-ink-panel: #141414;
  --tl-gold: #c9a55a;
  --tl-gold-warm: #c8a96e;
  --tl-text: rgba(245, 240, 232, 0.88);
  --tl-text-soft: rgba(245, 240, 232, 0.48);
  --tl-border: rgba(255, 255, 255, 0.075);
  --tl-ease: cubic-bezier(0.4, 0, 0.2, 1);
  --tl-topbar-h: 68px;
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--tl-ink);
  color: var(--tl-text);
}

.tl-root::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.028;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  mix-blend-mode: screen;
}

/* ── Topbar: 3-column grid — logo | nav | actions ── */
.tl-topbar {
  height: var(--tl-topbar-h);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 28px 0 20px;
  border-bottom: 1px solid var(--tl-border);
  background: rgba(5, 5, 5, 0.95);
  position: relative;
  z-index: 20;
  flex-shrink: 0;
}

.tl-logo-lockup {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.tl-logo-word {
  font-family: 'Noto Serif Display', Georgia, serif;
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0.2em;
  color: var(--tl-gold-warm);
  text-transform: uppercase;
  line-height: 1;
}

.tl-logo-sweep {
  width: 44px;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--tl-gold-warm), transparent);
}

/* ── Top nav ── */
.tl-topnav {
  display: flex;
  align-items: center;
  gap: 28px;
}

.tl-topnav-link {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.35em;
  text-transform: uppercase;
  color: rgba(245, 240, 232, 0.22);
  text-decoration: none;
  padding: 4px;
  transition: color 0.25s var(--tl-ease), letter-spacing 0.25s var(--tl-ease);
  white-space: nowrap;
}

.tl-topnav-link:hover,
.tl-topnav-link--active {
  color: var(--tl-gold);
  letter-spacing: 0.5em;
}

/* ── Topbar actions ── */
.tl-topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-self: end;
}

.tl-icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid transparent;
  background: transparent;
  color: var(--tl-text-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s var(--tl-ease);
}

.tl-icon-btn:hover {
  color: var(--tl-text);
  border-color: var(--tl-border);
  background: rgba(255, 255, 255, 0.03);
}

.tl-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(145deg, #c9a55a, #a8894e);
  color: #050505;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

/* ── Content ── */
.tl-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background: var(--tl-ink);
  position: relative;
  z-index: 1;
}

/* ── Flash messages ── */
.tl-flash {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(245, 240, 232, 0.85);
  background: rgba(201, 165, 90, 0.08);
  border: 1px solid rgba(201, 165, 90, 0.18);
}

.tl-flash--success {
  background: rgba(16, 185, 129, 0.07);
  border-color: rgba(16, 185, 129, 0.18);
}

.tl-flash--error {
  background: rgba(239, 68, 68, 0.07);
  border-color: rgba(239, 68, 68, 0.18);
}

.tl-flash-close {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.45;
}

.tl-flash-close:hover {
  opacity: 1;
}

/* ── Responsive ── */
@media (max-width: 900px) {
  .tl-topnav {
    gap: 16px;
  }
}

@media (max-width: 700px) {
  .tl-topbar {
    grid-template-columns: auto 1fr auto;
    padding: 0 16px;
  }

  .tl-topnav {
    gap: 12px;
    overflow-x: auto;
    scrollbar-width: none;
    justify-content: center;
  }

  .tl-topnav::-webkit-scrollbar { display: none; }
}
```

- [ ] **Step 2: Verify the dev server starts clean**

```bash
cd /Users/lenquanhone/Projects/pholio-app && npm run client:dev
```

Expected: Vite starts on `:5173` with no compile errors in the terminal output.

---

## Task 3: Commit

**Files:**
- `client/src/shared/layouts/TalentLayout/index.jsx`
- `client/src/shared/layouts/TalentLayout/TalentLayout.css`

- [ ] **Step 1: Stage and commit**

```bash
git add client/src/shared/layouts/TalentLayout/index.jsx \
        client/src/shared/layouts/TalentLayout/TalentLayout.css
git commit -m "$(cat <<'EOF'
feat(shell): replace talent sidebar with centered top nav

Removes the left sidebar entirely and restructures the topbar into a
3-column grid (logo | 6-item centered nav | actions). Nav links match
the footer-nav aesthetic: spaced uppercase, gold active state.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds with 2 files changed.
