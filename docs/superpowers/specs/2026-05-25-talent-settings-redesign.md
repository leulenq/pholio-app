# Talent Settings Page — Frontend Redesign

**Date:** 2026-05-25  
**Scope:** `client/src/domains/talent/pages/SettingsPage/`  
**Goal:** Full frontend redesign of the talent settings page. Polished, product-ready UI using Pholio's cream/editorial aesthetic. Backend wiring is secondary — structure and visual quality come first.

---

## Overview

The current talent settings page is a minimal stub with inline styles and three under-designed sections. This redesign replaces it with a premium, intentional settings experience aligned with Pholio's brand reference and design philosophy: Noto Serif Display headings, JetBrains Mono labels, warm cream surfaces, gold accents, and hairline borders.

**Not in scope:** Full API wiring for each new section (Security, Subscription, Privacy/Portfolio slug). Form shells and visual state are required; live API calls are optional where the backend doesn't exist yet.

---

## Architecture

### Files

| File | Change |
|------|--------|
| `client/src/domains/talent/pages/SettingsPage/index.jsx` | Full rewrite |
| `client/src/domains/talent/pages/SettingsPage/SettingsPage.css` | New file (currently none exists) |

No new routes are needed. Existing routes in `App.jsx` are preserved:

```
/dashboard/talent/settings          → SettingsPage (default: account)
/dashboard/talent/settings/:section → SettingsPage (section param)
```

### Component structure

```
SettingsPage (index.jsx)
├── Page shell (header, grain, back link)
├── Two-column layout
│   ├── SettingsSidebar (inline or extracted)
│   │   ├── NAV_GROUPS (grouped nav items)
│   │   └── SupportCallout
│   └── SettingsContent
│       ├── AccountSection
│       ├── NotificationsSection
│       ├── PrivacySection
│       ├── SubscriptionSection
│       ├── SecuritySection
│       └── DangerZoneSection
```

Sections are rendered inline in `index.jsx` (same pattern as existing agency settings). CSS lives in `SettingsPage.css` using `st-` namespace to match the agency settings prefix convention.

---

## Visual Language

### Palette

| Token | Value | Usage |
|-------|-------|-------|
| Canvas | `#FAF7F2` | Page background |
| Surface | `#FFFFFF` | Cards |
| Surface-input | `#EDE8DD` | Form inputs background |
| Border | `rgba(26,24,21,0.08)` | All card and input borders |
| Border-strong | `rgba(26,24,21,0.14)` | Focused / hover borders |
| Gold | `#C9A55A` | Active nav, accents, toggles |
| Gold-ghost | `rgba(201,165,90,0.06)` | Active nav background |
| Gold-glow | `0 0 8px rgba(201,165,90,0.4)` | Active nav indicator shadow |
| Text-primary | `#1A1A1A` | Headlines, labels |
| Text-soft | `rgba(26,26,26,0.62)` | Body, descriptions |
| Text-faint | `rgba(26,26,26,0.42)` | Group labels, hints |
| Danger-surface | `rgba(192,57,43,0.06)` | Danger zone card background |
| Danger-border | `rgba(192,57,43,0.20)` | Danger zone card border |

### Typography

| Role | Font | Size | Weight | Style notes |
|------|------|------|--------|-------------|
| Page title | Noto Serif Display | 52px | 300 | letter-spacing -0.02em |
| Section title | Noto Serif Display | 26px | 300 | card header |
| Eyebrow / mono label | JetBrains Mono | 9–10px | 500 | uppercase, letter-spacing 0.28em |
| Nav item label | Inter | 14px | 500 | |
| Nav item descriptor | Inter | 11px | 400 | text-faint |
| Body / descriptions | Inter | 14px | 300–400 | |
| Field label | Inter | 12px | 600 | uppercase, letter-spacing 0.06em |
| Input value | Inter | 14px | 400 | |

### Motion

- Page entrance: `opacity 0→1, translateY 12px→0`, 0.5s, `cubic-bezier(0.22, 1, 0.36, 1)`
- Section transition: AnimatePresence `x: 10→0`, `opacity 0→1`, 0.35s same easing
- Toggle: `background` and `transform` transition 0.3s ease
- Grain texture: `opacity: 0.028`, `mix-blend-mode: multiply`, static

---

## Page Shell

### Header

```
[PHOLIO wordmark — serif, letter-spaced, gold, 16px]

[← Dashboard — mono, 10px, uppercase, gold]

[eyebrow: ACCOUNT SETTINGS — mono, 9px, gold]
[title: Settings — Noto Serif Display, 52px, weight 300]

[horizontal gradient rule: transparent → #C9A55A → transparent, 1px, full width]
```

The PHOLIO wordmark is non-interactive (orientation only). The `← Dashboard` link navigates to `/dashboard/talent`. The gradient rule is `margin-bottom: 48px`.

Page padding: `56px 64px`. Max-width: `1200px`, centered.

Paper grain overlay (fixed, full-viewport):
```css
background-image: url("data:image/svg+xml,...fractalNoise...");
opacity: 0.028;
mix-blend-mode: multiply;
pointer-events: none;
```

---

## Sidebar Navigation

### Structure

```
[group eyebrow: IDENTITY]
  • Account         — Name, email, phone
[group eyebrow: PREFERENCES]
  • Notifications   — Email and in-app alerts
  • Privacy         — Visibility and portfolio URL
[group eyebrow: YOUR PLAN]
  • Subscription    — Plan and billing
  • Security        — Password and access
  • Danger Zone     — Account actions
```

### Nav item anatomy

Each item:
- 6px gold dot (`#C9A55A`, border-radius 50%, flex-shrink 0)
- Label: Inter 14px weight 500 `#1A1A1A`
- Descriptor: Inter 11px `rgba(26,26,26,0.42)` on the line below
- Full-width button, `border-radius: 10px`, padding `12px 16px`

Active state:
- Background: `rgba(201,165,90,0.06)`
- Left bar: `position: absolute; left: 0; top: 15%; bottom: 15%; width: 3px; background: #C9A55A; border-radius: 0 4px 4px 0; box-shadow: 0 0 8px rgba(201,165,90,0.4)`
- Label color: `#C9A55A`

Hover (inactive): background `rgba(26,26,26,0.03)`

Group eyebrows: `margin-top: 24px` (8px for first group), `margin-bottom: 8px`, `padding-left: 16px`

### Support callout

At the bottom of the sidebar (margin-top auto):
```
[gold-tinted border card, border-radius 12px, padding 20px]
NEED HELP?                  [mono eyebrow, gold]
Questions about your        [13px, text-soft]
account or billing?

support@pholio.studio ↗     [mono link, gold, 12px]
```

---

## Content Sections

### Shared card pattern

```css
.st-card {
  background: #FFFFFF;
  border: 1px solid rgba(26,24,21,0.08);
  border-radius: 16px;
  overflow: hidden;
}
```

Card header inside each card:
```
[mono eyebrow — e.g. "01 / ACCOUNT"]
[Noto Serif Display title — 26px weight 300]
```

Card footer (for save actions):
```
border-top: 1px solid rgba(26,24,21,0.08);
padding: 20px 32px;
display: flex; justify-content: flex-end;
```

Input pattern:
```css
.st-input {
  background: #EDE8DD;
  border: 1px solid rgba(26,24,21,0.08);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 14px;
  color: #1A1A1A;
  transition: border-color 0.2s ease;
}
.st-input:focus {
  outline: none;
  border-color: #C9A55A;
  background: #F5F0E8;
}
```

Field label:
```css
.st-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(26,26,26,0.62);
  margin-bottom: 6px;
}
```

---

### 1. Account

**Card content:**

- **Avatar upload** (top of card): circular 80px placeholder with upload icon center, "Update photo" ghost link below. On hover: darkened overlay with camera icon.
- **Name grid** (2-col): First Name, Last Name
- **Email** (full width): disabled input, small helper text "Managed by Firebase authentication — contact support to update"
- **Phone** (full width): editable

**Footer:** "Save Changes" button (gold background, dark label, 8px radius, 14px Inter weight 500)

A `isChanged` state flag drives disabled/enabled state on the save button (same pattern as agency ProfileSection).

---

### 2. Notifications

**Card content (no save button — optimistic auto-save with toast):**

Two labeled groups separated by a hairline:

**By Email**
- Email Notifications — "All account-related emails"
- Profile View Alerts — "When an agency views your profile"
- Application Updates — "Status changes on your applications"
- Marketing & Tips — "Feature announcements and editorial tips"

**In App**
- Application Updates — "In-dashboard application status alerts"
- New Messages — "Direct messages from agencies"

Each row:
```
[toggle label — Inter 14px weight 500]   [gold toggle switch]
[descriptor — Inter 13px text-soft]
```

Toggle HTML pattern (matching agency settings):
```html
<label class="st-switch">
  <input type="checkbox" />
  <span class="st-slider" />
</label>
```

---

### 3. Privacy & Portfolio

**Card content:**

- **Portfolio URL** — labeled "YOUR PORTFOLIO SLUG", input with prefix `pholio.studio/p/` shown as read-only prefix text, editable slug field. Below: "Share this link with agencies and clients."
- **Profile Visibility** — select dropdown: `Public — anyone can view`, `Agencies Only`, `Private — hidden from search`
- **Show Contact Information** — toggle: "Display email and phone on your public portfolio"
- **Allow Search Indexing** — toggle: "Let search engines index your portfolio page"

Footer: "Save Changes" button

---

### 4. Subscription & Billing

**Two stacked cards:**

**Plan card** (gold-tinted gradient background `linear-gradient(135deg, rgba(201,165,90,0.08), rgba(201,165,90,0.03))`):
```
STUDIO+                           [mono eyebrow, gold]
$29                               [Noto Serif Display, 48px weight 300]
  /month                          [Inter 16px text-soft, baseline]

Next renewal: June 1, 2026        [Inter 13px text-soft]
[Change Plan — ghost button]
```

Right side of plan card:
```
•••• 4242                         [mono, with card icon]
[Update Payment Method — ghost]
```

**Invoice card:**
```
[card header: "Invoice History"]
[table rows: #INV-001 | Apr 01 | $29.00 | ✓ Paid | Download]
[table rows: #INV-000 | Mar 01 | $29.00 | ✓ Paid | Download]
```

Invoice row anatomy: `border-bottom: 1px solid rgba(26,24,21,0.06)`, padding `16px 32px`. Download is a gold text button.

---

### 5. Security

**Two stacked cards:**

**Card 1 — Credentials:**
- Email (readonly, with mail icon prefix): `value={profile?.email}`, disabled
- Helper: "Primary authentication email. Managed by Firebase."
- "Update Password" button (secondary style, full-width or right-aligned)

**Card 2 — Access log:**
- Card header: "Recent Sessions"
- Up to 5 rows: device icon + "Chrome on macOS" + location + relative time + "Active" or "Expired" badge
- Data is static/mock until backend sessions endpoint exists

2FA row (between the two cards, or inside Card 1):
- Label: "Two-Factor Authentication"
- Description: "Add an extra layer of security"
- Right: "Coming Soon" badge (`rgba(201,165,90,0.12)` background, gold text, mono, uppercase)

---

### 6. Danger Zone

**Single card with danger tint:**

```css
.st-card--danger {
  background: rgba(192,57,43,0.04);
  border-color: rgba(192,57,43,0.18);
}
```

Card header: mono eyebrow "IRREVERSIBLE ACTIONS", title "Danger Zone" in Noto Serif Display.

Two action rows (separated by hairline):

**Deactivate Account**
- Description: "Temporarily hide your profile and suspend access. Reactivate any time."
- Button: "Deactivate" — ghost button, `color: #C0392B`, `border-color: rgba(192,57,43,0.3)`

**Delete Account**
- Description: "Permanently delete all data, images, and applications. This cannot be undone."
- Button: "Delete Account" — filled danger button, `background: #C0392B`, `color: white`

Both buttons open confirmation modals (not in scope for this redesign — buttons are wired to `toast.error('This action requires confirmation — coming soon')` as a placeholder).

---

## Routing & State

- `useParams()` reads `:section` — maps to section ID (default: `account`)
- `navigate('/dashboard/talent/settings/account')` on sidebar click
- AnimatePresence key on active section drives enter/exit animation

Sections map:

```js
const SECTIONS = [
  { id: 'account',       label: 'Account',       group: 'IDENTITY',     desc: 'Name, email, phone' },
  { id: 'notifications', label: 'Notifications',  group: 'PREFERENCES',  desc: 'Email and in-app alerts' },
  { id: 'privacy',       label: 'Privacy',        group: 'PREFERENCES',  desc: 'Visibility and portfolio URL' },
  { id: 'subscription',  label: 'Subscription',   group: 'YOUR PLAN',    desc: 'Plan and billing' },
  { id: 'security',      label: 'Security',       group: 'YOUR PLAN',    desc: 'Password and access' },
  { id: 'danger',        label: 'Danger Zone',    group: 'YOUR PLAN',    desc: 'Account actions' },
];
```

---

## What Is and Isn't Wired

| Section | Backend status | Approach |
|---------|---------------|----------|
| Account | Wired (`updateProfile` exists) | Fully functional save |
| Notifications | No backend | State lives in component; toast on toggle (placeholder) |
| Privacy | Partial (visibility may exist on profile) | Wire what exists, stub the rest |
| Subscription | No billing endpoint for talent | Static demo data |
| Security | Password: Firebase `sendPasswordResetEmail` | Email reset flow; sessions = static mock |
| Danger Zone | No endpoint | Toast placeholder on both buttons |

---

## Accessibility

- All toggles use `<label>` wrapping `<input type="checkbox">` with sr-only label text
- Nav buttons have `aria-current="page"` when active
- Danger zone buttons are `type="button"` (not submit)
- Focus visible outlines: gold `2px solid #C9A55A` offset `2px`

---

## Non-Goals

- Backend API implementation for Subscription, Security sessions, or Danger Zone
- Mobile responsive breakpoints (future iteration)
- Real billing integration (Stripe portal link is a placeholder)
- Animation beyond page/section entrance
