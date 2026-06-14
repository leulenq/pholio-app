# Agency Settings — Control-Center Redesign

**Date:** 2026-06-07
**Status:** Implemented; revised to elite-agency domain model (see Revision 2)

## Revision 2 — Elite-agency domain (research-driven)

Industry research (modeling/casting houses: divisions & the New Faces → Development →
Main Board ladder; scout/booker/agent role taxonomy; booking-centric notification
logic — options, castings, call sheets, book-outs; representation by exclusivity +
commission, never SaaS billing). Sources: a model's diary, Wikipedia (Modeling
agency), The Mother Agents, Syngency, Get Scouted, CM Models, Skylar Modeling.

Changes from the original console:
- **Billing removed entirely** (these houses run on exclusive contracts, not
  subscriptions). `BillingPanel.jsx` deleted.
- **Rail re-cut** into House (Identity, Branding) · Roster (Divisions & Boards,
  Team & Permissions) · Operations (Notifications, Representation) · Account (Security).
- **Notifications** reframed to agency events: two **real** wired alerts (talent
  submissions = `notify_new_applications`; pipeline movement = `notify_status_changes`)
  + real `default_view`, plus a clearly-marked **"Soon"** booking-desk group (options,
  castings, call sheets, book-outs, expiry) shown disabled — no fake persistence.
- **Team & Permissions** maps the three system roles to agency seats — Principal
  (OWNER), Agent · Booker (ADMIN), Scout · Junior (MEMBER) — plus a "Soon" scouting
  approvals note; still links to the real Team page.
- **New `DivisionsPanel`**: the board ladder (real, explanatory), standard divisions
  as illustrative chips, and a "Soon" board-standards (measurements) note.
- **New `RepresentationPanel`**: commission split (mother 10% / placement 20%),
  exclusivity-by-market-&-division terms, and the placement-network markets — framed
  as house configuration held with the account team (honest, non-fabricated).
- Identity panel copy aligned to house language (Principal, the agency).

Honesty rule unchanged: only Profile, Branding, the two notification flags, and
default_view persist; every domain section that has no backend is labelled "Soon" /
"configured with your account team" rather than shown as fake saved data.

---

**Date:** 2026-06-07
**Status:** Approved for implementation (user delegated the decision)
**Surface:** `client/src/domains/agency/pages/SettingsPage.jsx` (`/dashboard/agency/settings`)

## 1. Purpose

Settings is where the agency **defines and governs itself** — identity, branding,
team structure, permissions, billing, and security. The current page is a flat,
open admin form. The redesign makes it feel like a **control center**: structured,
calm, premium, with strong hierarchy, real containment, and a clear relationship
between the settings navigation and the active content.

## 2. Real vs. mock (honesty mandate)

Backend audit (`src/domains/agency/routes/inbox.js`):

- **Real & persisted (gated OWNER/ADMIN):**
  - Profile — `PUT /api/agency/profile` → `first_name`, `last_name`, `agency_name`,
    `agency_location`, `agency_website`, `agency_description`.
  - Branding — `POST /api/agency/branding` → logo upload/remove + `brand_color`.
  - Settings — `PUT /api/agency/settings` → `notify_new_applications`,
    `notify_status_changes`, `default_view` (exactly these).
  - Team — full `/api/agency/team` CRUD (already powering the new Team page).
  - `GET /api/agency/me` returns all of the above plus `email`.
- **No backend exists for:** billing/Stripe/subscriptions/invoices, password change,
  org deletion, access logs.

The redesign **only renders what is real**. Billing and Security become honest,
calm panels (managed-by-Pholio / contact support / "coming soon") — never fake
invoices, plans, or "password changed 4 months ago". The current notifications UI
(4 toggles, never saved) is replaced by the **two real toggles + default-view**,
actually wired to `PUT /settings`.

## 3. Structure — the bound two-pane console

One contained console shell:

```
┌─ Settings ──────────────────  PHOLIO · {agency}   [You · Owner] ┐
│ ┌── rail ──────┐┏━━━ panel ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │
│ │ IDENTITY     ┃ Branding                          ┃ │
│ │  Profile     ┃ Logo, color & visual identity     ┃ │
│ │ ▸Branding   ━┫ ─────────────────────────────────  ┃ │
│ │ ORGANIZATION ┃  …contained controls…             ┃ │
│ │  Team        ┃                                    ┃ │
│ │  Notifications┃                                   ┃ │
│ │ ACCOUNT      ┃                                    ┃ │
│ │  Billing     ┃ ───────────── sticky save bar ──── ┃ │
│ │  Security    ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
│ └──────────────┘                                        │
└─────────────────────────────────────────────────────────┘
```

- **Console shell:** a single bounded container (border, soft shadow, warm surface)
  so the whole page reads as one governed object — not floating cards.
- **Grouped rail** (replaces the flat 6-item list), three labelled groups:
  - **Identity** → Profile, Branding
  - **Organization** → Team, Notifications
  - **Account** → Billing, Security
  Active row carries a gold accent and **visually fuses into the panel** (the seam
  between rail and panel opens at the active row), making the nav↔content relationship
  explicit. The old "Need help?" promo and the fake "Enterprise Plan" badge are removed.
- **Panel:** its own header bar (section title + one-line description + optional
  contextual action), a contained scrolling body, and a **sticky save footer** that
  appears only when the section is dirty (Profile, Notifications). Branding saves
  per-control. Section transitions keep the existing `?tab=` deep-linking.

## 4. Visual identity

Light agency shell (`--ag-surface-0/1`), Playfair serif section titles, gold accents,
`agency-tokens.css`. Standard transition `all 0.2s cubic-bezier(0.4,0,0.2,1)`;
framer-motion spring (`stiffness: 55, damping: 16`) for panel entrance and the
`layoutId` active-rail indicator (kept). Calm and dense-but-breathing — containment
over decoration.

## 5. Governance signal

Header shows agency identity (`PHOLIO · {agency_name}` or logo) and the viewer's
**real role** ("You · Owner/Admin/Member"), derived exactly as the shell does:
`team.find(m => m.userId === profile.id)?.membership_role`. `canManage = OWNER || ADMIN`.

**Permission behavior mirrors the backend:** for Members, the editable panels
(Profile, Branding, Notifications) render **read-only** (inputs disabled, save hidden)
with a quiet "Read-only — ask an admin to change this" note. Team/Billing/Security are
viewable by everyone. The UI never offers an action the API will reject.

## 6. Components

Break the 566-line monolith into a shell + one file per panel.

### 6.1 `SettingsPage.jsx` (rewrite — shell only)
- Loads `getAgencyProfile` (`['agency-profile']`) + `useAgencyTeam()`.
- Derives `myRole`, `canManage`, agency identity.
- Renders header, grouped rail (active via `?tab=`), and the active panel inside the
  console frame. Loading skeleton; reuses `EmptyErrorState` on profile error.

### 6.2 `pages/settings/ProfilePanel.jsx` (real)
Form (names, agency name/location/website/description) with dirty tracking and the
shell's sticky save → `updateAgencyProfile`. Read-only for Members.

### 6.3 `pages/settings/BrandingPanel.jsx` (real)
Logo upload/remove + brand-color → `updateAgencyBranding`. Adds a small **live brand
preview** (logo + color swatch + agency name) for a premium, governed feel. Read-only
for Members.

### 6.4 `pages/settings/TeamPanel.jsx` (real governance summary)
Reads `useAgencyTeam()`: people count, leadership count, your role, and a compact
monogram row (reuses `components/team-presence.js`). A short **permissions explainer**
(what Owner / Admin / Member can do). Primary action **"Manage team →"** →
`/dashboard/agency/team`. No member management here (the Team page owns that) — this
reconciles the previously-duplicated, fake team list.

### 6.5 `pages/settings/NotificationsPanel.jsx` (real)
The two real toggles — **New applications** (`notify_new_applications`), **Status
changes** (`notify_status_changes`) — plus a **Default landing view** select
(`default_view`: Overview / Applicants / Casting). Initialized from `profile`, saved
via `updateAgencySettings` (`PUT /settings`) with the shell's save bar. Read-only for
Members. Replaces today's four unsaved fake toggles.

### 6.6 `pages/settings/BillingPanel.jsx` (honest placeholder)
Calm panel: "Billing is managed directly with Pholio." Sign-in/account email shown,
a "Contact your account manager" mail-to, and an empty "Invoices will appear here"
state. No fabricated plan, price, card, or invoices.

### 6.7 `pages/settings/SecurityPanel.jsx` (honest)
Real **sign-in email** (read-only). **Password** and **Deactivate organization** are
presented as honestly-unavailable actions ("Manage via Pholio support" / disabled
with a "coming soon" note) rather than fake states/dates. A clearly-labelled danger
zone for the (not-yet-wired) deactivate action.

### 6.8 `SettingsPage.css` (rewrite, `st-` prefix)
Console shell, grouped rail with fused active row, panel header + scroll body + sticky
save footer, contained field groups, toggles, brand preview, team summary, honest
billing/security panels. Uses `agency-tokens.css`.

## 7. Files

| Action | File |
| --- | --- |
| Rewrite | `client/src/domains/agency/pages/SettingsPage.jsx` (shell) |
| Rewrite | `client/src/domains/agency/pages/SettingsPage.css` |
| New | `client/src/domains/agency/pages/settings/ProfilePanel.jsx` |
| New | `client/src/domains/agency/pages/settings/BrandingPanel.jsx` |
| New | `client/src/domains/agency/pages/settings/TeamPanel.jsx` |
| New | `client/src/domains/agency/pages/settings/NotificationsPanel.jsx` |
| New | `client/src/domains/agency/pages/settings/BillingPanel.jsx` |
| New | `client/src/domains/agency/pages/settings/SecurityPanel.jsx` |
| Reused | `components/team-presence.js` (Team summary monograms) |

No backend / migration / `agency.js` API-client changes. `App.jsx` already routes
`/settings` → this page and `/team` → the Team page.

## 8. Edge cases & decisions

- **Deep links** (`?tab=branding`, etc.) preserved; unknown tab → `profile`.
- **Member read-only** everywhere writes are gated; the backend stays source of truth.
- **Branding color default** `#C9A55A` when unset; logo path prefixed `/`.
- **default_view** options limited to real, existing routes (Overview/Applicants/Casting).
- **No fiction:** any unbuilt capability is labelled as managed-by-support or
  coming-soon, never mocked with plausible fake data.

## 9. Verification

- `cd client && npm run lint` clean for all new/edited files.
- `npm run client:build` green.
- Manual: console renders as one bound shell; grouped rail; active row fuses into the
  panel; `?tab=` deep-links work. Profile edit → dirty → sticky save → persists.
  Branding logo/color persists. Notifications toggles + default view persist via
  `/settings`. Team panel shows real counts/role and links to the Team page. Billing
  & Security show honest panels (no fake data). As a Member, editable panels are
  read-only.
