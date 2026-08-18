# Agency Dashboard Claude Guide

Scope: `client/src/domains/agency/**` and agency-facing dashboard routes under `/dashboard/agency/*`.

## Product role

The agency dashboard is a focused intake and casting workspace for bookers, scouts, and agency owners. They review submissions, triage inboxes, discover opt-in talent, and run casting boards. Pholio records representation decisions but does not replace an agency's roster, booking, commission, interview, or reminder systems. The interface must feel like a premium agency working tool, not a generic SaaS CRM.

## Required design context

Before editing agency UI, read `client/src/domains/agency/DESIGN.md`.

Agency design summary:
- Editorial ledger / command center.
- Warm cream canvas, white paper panels, restrained gold accent.
- Playfair Display for mastheads and page/section titles only.
- Inter for controls, data, tables, labels, cards, and dense operational text.
- Dense, scan-able layouts are allowed when they help bookers work faster.
- Rectangular controls with moderate radius; do not import talent pill-button vocabulary.
- Motion is quick and state-conveying, usually 150–200ms.

## Agency-specific banned UI

- Do not use status badges for talent availability or pipeline state. Use plain text, a subtle full-surface tint, or an approved non-badge treatment from the design file.
- Do not add corner chips to talent cards, submission rows, image thumbnails, or casting cards.
- Do not use nav count bubbles, `ag-nav-count`, or equivalent attached counters.
- Do not use glass cards, frosted panels, blurred toolbars, gradient text, colored side stripes, or decorative dashboard particles.
- Do not make agency screens cinematic or over-choreographed. Agency motion must support state and scanning.
- Do not use serif type in buttons, table cells, field labels, dense data, or controls.
- Do not use a cold blue-and-white admin look.

## Implementation guidance

- Prefer existing agency components, hooks, and API helpers before creating new primitives.
- Preserve density where it serves submission triage and casting work.
- Keep gold rare: active selection, primary action, focus ring, or one important accent.
- Use skeletons and informative empty states for operational data.
- Verify long talent names, agency names, board labels, and market names do not overflow.
- When editing shared components, check whether talent uses the same component before changing visual defaults.

## Verification

For agency UI changes, run the narrowest relevant lint/build checks and inspect responsive behavior when possible. If a browser is available, capture screenshots for meaningful visual changes.
