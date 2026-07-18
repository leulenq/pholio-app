# Agency User Menu — Rail DNA Redesign

**Date:** 2026-07-16  
**Surface:** Agency command rail account popup (`UserDropdown`)  
**Status:** Approved direction (Approach 1 — Rail clone)  
**Files:** `client/src/domains/agency/components/nav/UserDropdown.jsx`, `UserDropdown.css` (optional tiny open-state sync on `MemberAccountChip`)

## Problem

The account menu opens from the ink rail footer but does not share the rail’s visual DNA. It currently reads as a separate floating card: gold top rule, rounded frame, gold icons at rest, Playfair identity type, and hover gold left-bars with glow. That fights the sidebar language (flat ink, muted icons, gold only for active selection).

## Goal

Make the popup feel like the same system as the sidebar: same materials, type, item rhythm, and gold discipline — while remaining a lightweight overlay so it can sit above the footer without layout surgery.

## Non-goals

- No cream/light paper popover over the rail
- No inline footer expand / reflow of the rail
- No menu item IA changes (keep Settings, Team Members, Help & Support, Log out)
- No MemberAccountChip visual redesign beyond optional open-state affordance
- No glass / backdrop-blur on the panel

## Approach: Rail clone

Keep a floating panel for stacking, restyle it as a rectangular ink sheet that reuses rail tokens and nav item states.

### Surface

| Token / rule | Value |
|---|---|
| Background | `var(--ag-rail-bg)` |
| Border | `1px solid var(--ag-rail-line)` on all sides |
| Corner radius | `0`–`2px` max (prefer `2px` or less; no soft “card” radius) |
| Top accent | **None** — no gold top rule |
| Shadow | Soft dark lift only, e.g. `0 12px 40px rgba(0,0,0,.35)` — no gold glow |
| Width | ~248px (current), clamp to viewport |

### Identity block

Match `.ag-member` language, not a masthead card:

- Name: Inter, ~12.5–13px, weight 600, `var(--ag-cream)` — **not** Playfair
- Secondary: agency name when present (Inter, muted `--ag-ink-faint`) — **not** uppercase tracked eyebrow treatment; role stays on the footer chip, not duplicated here
- Avatar: 36px circle, same border/background treatment as `.ag-member-avatar`
- No gold gradient wash behind the header
- Divider under identity: `1px` `var(--ag-rail-line)` (ink hairline, never gold)

### Menu items

Clone `.ag-nav-item` / `.ag-nav-icon` behavior:

| State | Appearance |
|---|---|
| Default | Text `#9a9082` (or current rail default), icons `--ag-ink-faint` / muted — **not gold** |
| Hover | Text → `var(--ag-cream)`; icon slightly brighter; **no** gold left marker, **no** gold glow |
| Active (route match for Settings / Team) | Same as `.ag-nav-item--active`: cream/bright text, gold icon, thin gold left marker |
| Focus-visible | Gold ring consistent with rail controls |
| External (Help & Support) | Same item style; keep small external-link glyph in muted faint, not gold |

Typography: Inter 14px, icon size 14 / stroke ~1.6 to match rail. Padding aligned with rail footer rhythm (`~9–10px` vertical, horizontal consistent with panel inset).

### Log out

Separate by the same ink hairline. Quieter danger treatment on hover only (warm tint + danger-leaning text/icon). No gold accent on logout.

### Motion

- Open: opacity + 4–6px rise, 150–200ms, ease matching agency (`cubic-bezier(0.4, 0, 0.2, 1)` or existing rail ease)
- `@media (prefers-reduced-motion: reduce)`: opacity-only or instant

### Behavior preserved

- Click-outside close (chip wrapper)
- Focus first item on open
- Logout → Firebase signOut + marketing redirect
- Mailto for Help & Support
- Links close the menu on navigate

## Implementation notes

1. Prefer reusing rail CSS variables already scoped on `.ag-shell` (`--ag-rail-bg`, `--ag-rail-line`, `--ag-ink-faint`, `--ag-cream`, `--ag-pholio-gold`).
2. Where practical, share class names or mirror selectors so hover/active stay in sync with `AgencyLayout.css` nav items — avoid inventing a parallel gold system in `UserDropdown.css`.
3. Use `NavLink` (or `useLocation`) for Settings / Team so active state mirrors the rail.
4. Do not reintroduce banned patterns: eyebrows, gold side stripes wider than the rail’s 2px active marker, glass blur, count badges.

## Success criteria

- Side-by-side with the open rail: menu items read as the same family as Overview / Roster / etc.
- No decorative gold at rest (no gold frame, no gold icons idle, no gold header rules)
- Gold appears only for active route selection (and focus rings), matching the One Voice Rule
- Feels premium through restraint and material match, not through extra chrome

## Verification

- Open menu on Overview (no Settings/Team active) → all items muted
- Navigate to Settings / Team with menu open or re-open → active marker + gold icon on the matching row
- Hover each row + logout; keyboard focus-visible
- Collapsed rail + mobile drawer: panel still visible, not clipped oddly
- Reduced-motion preference respected
