# Talent Dashboard: Sidebar → Top Nav

**Date:** 2026-05-19
**Status:** Approved

## Summary

Replace the left sidebar in the talent dashboard with a restructured single topbar that contains inline navigation. The sidebar is removed entirely; navigation moves into the topbar as a centered group of six links.

## Topbar Layout

The existing `tl-topbar` is restructured into three flex zones at the same 68px height:

| Zone | Content |
|------|---------|
| Left | Logo lockup (PHOLIO word + gold sweep). Editorial kicker ("Talent Workspace") and user name line removed. |
| Center | 6 NavLinks — see nav items below |
| Right | Bell icon button + Settings icon button + Avatar (initials, gold gradient). Date and dividers removed. |

`justify-content: space-between` with a centered absolute or flex-grow approach for the nav group.

## Nav Items

All six links use plain names and map to existing routes:

| Label | Route | `end` |
|-------|-------|-------|
| Overview | `/dashboard/talent` | yes |
| Portfolio | `/dashboard/talent/media` | — |
| Applications | `/dashboard/talent/applications` | — |
| Analytics | `/dashboard/talent/analytics` | — |
| Profile | `/dashboard/talent/profile` | — |
| Comp Card | `/dashboard/talent/pdf-customizer` | — |

## Link Style

Identical to `ov-footer-link` in OverviewPage:

- `font-size: 10px; font-weight: 700; letter-spacing: 0.35em; text-transform: uppercase`
- Default color: `rgba(245, 240, 232, 0.22)`
- Hover + active: `color: var(--tl-gold); letter-spacing: 0.5em`
- Transition: `color 0.25s, letter-spacing 0.25s` (standard ease)
- No icons in the nav links (icon-only was a sidebar concern)

## Sidebar Removal

Remove entirely:

- `<aside class="tl-sidebar">` and all its children from `TalentLayout/index.jsx`
- All `.tl-sidebar*`, `.tl-nav*`, `.tl-tier-badge`, `.tl-profile-avatar` CSS rules from `TalentLayout.css`
- `--tl-sidebar-w` CSS variable (no longer needed)
- The `tl-body` wrapper div is kept but becomes just a flex container for `tl-content` at full width. (Or simplified away if it adds no value.)
- Responsive sidebar collapse rules (`@media (max-width: 1024px)` sidebar block) removed.

## What Is Preserved

- `tl-root` dark background, noise texture overlay
- `tl-topbar` background, border-bottom, z-index
- Logo lockup (word + sweep)
- Bell, Settings icon buttons
- Avatar (initials + gold gradient)
- Flash message handling in `tl-content`
- `tl-content` scroll behavior

## Responsive

- Below ~768px: nav links collapse. Options: hide non-essential links (show only Overview + Portfolio) or use a hamburger. Out of scope for this pass — links wrap or scroll horizontally.

## Files Changed

- `client/src/shared/layouts/TalentLayout/index.jsx` — restructure topbar, remove sidebar JSX
- `client/src/shared/layouts/TalentLayout/TalentLayout.css` — remove sidebar CSS, add centered nav styles
