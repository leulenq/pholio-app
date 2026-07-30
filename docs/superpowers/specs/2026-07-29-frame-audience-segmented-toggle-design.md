# Frame Editor Audience Segmented Toggle — Design

**Date:** 2026-07-29  
**Surface:** Talent Frame Editor → Details → Publishing  
**Status:** Approved

## Problem

Publishing audience controls (“Public book”, “Agency submissions”) needed to match the Profile tab Metric / Imperial segmented control instead of checkbox / switch patterns.

## Decision

Keep the existing two-row layout (label + note on the left, control on the right). Replace binary Off / On segment labels with **Hidden** / **Shown**. Style the control as an editorial text tab matching Profile’s visible Metric / Imperial control, adapted to Frame Editor’s dark palette.

## Behavior (unchanged)

| Row | Hidden | Shown |
|-----|--------|-------|
| Public book | `exclude_from_public = true` | `exclude_from_public = false` |
| Agency submissions | `exclude_from_agency = true` | `exclude_from_agency = false` |

`metadata.visibility` continues to derive from `exclude_from_public` via `setAudience`.

## Visual

- Container: transparent, borderless, with generous space between choices
- Choices: uppercase monospaced labels with deliberate tracking
- Inactive: soft cream text with no fill
- Active: primary cream text with a thin gold underline
- Reuse the shared toggle button underline state and keep focus-visible behavior intact

## Out of scope

- ImageMetadataModal publishing controls
- Shared component extraction
- Persistence / API changes
