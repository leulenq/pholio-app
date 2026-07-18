# Agency User Menu — Full-rail Attached Sheet

**Date:** 2026-07-16 (updated)  
**Approach:** A — Full-rail attached sheet  
**Files:** `UserDropdown.jsx`, `UserDropdown.css`, `MemberAccountChip.jsx`, `AgencyLayout.css`

## Behavior

- Panel spans full rail width, flush to footer top (`bottom: 100%`, zero gap)
- Same `--ag-rail-bg`; no outer border/shadow when expanded; seam is footer hairline + panel `border-bottom`
- No duplicate identity block — member chip remains the only identity
- Opacity reveal (160ms); chevron rotates 180° when open
- Collapsed rail: panel expands to `--ag-rail-w` so labels remain readable
- Item states unchanged from rail DNA (muted → cream hover; gold only when active)

## Non-goals

- Inline footer reflow (Approach B)
- Floating trigger-aligned popover (Approach C)
