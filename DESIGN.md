# Pholio Design System Routing

Pholio uses separate dashboard design systems. Do not average them into one generic app style.

## Dashboard design files

- **Talent dashboard:** `client/src/domains/talent/DESIGN.md`
  - Cinematic portfolio stage.
  - Warm paper, imagery-led composition, Noto Serif / Playfair headings, pill-shaped talent controls, spring-based motion.
  - Applies to `/dashboard/talent/*`, `/reveal`, and shared talent-facing overlays.

- **Agency dashboard:** `client/src/domains/agency/DESIGN.md`
  - Editorial command center for agency operations.
  - Cream canvas, white paper panels, Playfair mastheads, dense roster workflows, rectangular controls, restrained state motion.
  - Applies to `/dashboard/agency/*`, agency roster, inbox, casting, interviews, reminders, messages, and agency-facing overlays.

- **Onboarding:** `client/src/domains/onboarding/DESIGN.md`
  - Dark cinematic screen-test system.
  - Applies to `/onboarding/*` only.

## Global banned AI-generated UI patterns

These bans apply to every Pholio product surface unless a human explicitly approves an exception first.

1. No eyebrow / kicker text above headings, including pill-chip versions.
2. No New / Beta / Live / AI-powered feature badges.
3. No green/yellow/red status badge pills or dot-pill combinations.
4. No tiny corner metadata chips on cards, images, or thumbnails.
5. No count bubbles attached to nav items, tabs, or cards.
6. No decorative glassmorphism on cards, panels, buttons, toolbars, or inputs; `backdrop-filter` is only allowed on full-screen functional scrims.
7. No gradient text, rainbow text, or `background-clip: text` emphasis.
8. No colored side-stripe borders wider than 1px on cards, rows, callouts, or alerts.
9. No generic identical card grids with icon + heading + paragraph repeated as filler.
10. No oversized rounded cards or controls unless the domain design file explicitly calls for a pill control.
11. No decorative pulsing dots, orbiting particles, blobs, grain, diagonal stripes, or AI-dashboard ornament.
12. No draggable or resizable textareas; always enforce `resize: none`.
13. No static, lifeless pages on talent surfaces; motion must be purposeful and have reduced-motion fallbacks.
14. No over-choreographed page-load sequences on agency/product surfaces; agency motion supports state, not spectacle.

## Agent instruction

Before making UI changes, read the domain-specific design file for the touched surface and cite the design rule you are applying in your plan or summary. If a change touches shared components used by both dashboards, verify both domain design files and preserve intentional differences.
