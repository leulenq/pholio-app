# Agency User Menu Rail DNA — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the agency account popup so it shares the ink rail’s visual DNA (no gold frame, muted icons at rest, gold only for active routes).

**Architecture:** Keep `UserDropdown` as a footer overlay; rewrite its CSS to rail tokens and mirror `ag-nav-item` states. Use `NavLink` for Settings/Team so active gold matches the rail.

**Tech Stack:** React, React Router `NavLink`, existing `AgencyLayout.css` rail tokens, Lucide icons.

## Global Constraints

- Background `var(--ag-rail-bg)`; border `1px solid var(--ag-rail-line)`; no gold top rule
- Radius ≤2px; soft dark shadow only (no gold glow)
- Identity: Inter cream name + muted agency secondary (not Playfair, not uppercase eyebrow)
- Default icons muted; gold only on active route / focus-visible
- Hover: cream text, no gold left-bar glow
- Preserve IA: Settings, Team Members, Help & Support, Log out
- Respect `prefers-reduced-motion`

---

## File map

| File | Responsibility |
|---|---|
| `client/src/domains/agency/components/nav/UserDropdown.css` | Full visual restyle to rail DNA |
| `client/src/domains/agency/components/nav/UserDropdown.jsx` | NavLink for route items; keep logout/help behavior |
| `client/src/domains/agency/components/nav/MemberAccountChip.jsx` | Optional: `aria-expanded` already present; only touch if needed |

---

### Task 1: Restyle panel + identity CSS

**Files:** `UserDropdown.css`

- [x] Remove gold top border, gold header gradient, Playfair name, circular “premium card” chrome
- [x] Apply rail surface tokens, ink hairline dividers, ≤2px radius, dark soft shadow
- [x] Match identity block to `.ag-member` type scale (Inter, cream name, faint agency)
- [x] Add reduced-motion fallback for open animation

### Task 2: Align item states with rail nav

**Files:** `UserDropdown.css`, `UserDropdown.jsx`

- [x] Switch Settings / Team Members from `Link` to `NavLink` with active class
- [x] Style `.ud-item` like `.ag-nav-item` (default muted, hover cream, active gold icon + thin marker)
- [x] Keep Help & Support as mailto with muted external icon
- [x] Logout: hairline separator + danger-leaning hover only

### Task 3: Verify

- [ ] Visual check: open menu on Overview — no decorative gold at rest
- [ ] On Settings/Team routes — matching row shows active gold marker
- [ ] Keyboard focus-visible + click-outside still work
- [ ] Client lint on touched files if available
