# Talent Dashboard Claude Guide

Scope: `client/src/domains/talent/**` and talent-facing dashboard routes under `/dashboard/talent/*`, plus talent-facing shared overlays when the touched file is used from talent flows.

## Product role

The talent dashboard is a cinematic portfolio studio for models, actors, creators, and other talent. The user is building a professional presence: uploading images, curating a portfolio, generating comp cards, checking concrete submission requirements, and submitting to agencies. The interface should make their work feel staged and premium, not merely stored.

## Required design context

Before editing talent UI, read `client/src/domains/talent/DESIGN.md`.

Talent design summary:
- Portfolio stage / cinematic studio.
- Warm paper canvas, white surfaces, image-led compositions.
- Noto Serif Display / Playfair for names, titles, reveal moments, and emotional headings.
- Inter for controls, metadata, labels, forms, and operational text.
- Pill-shaped primary talent controls and pressed-paper field treatments are intentional talent vocabulary.
- Spring-based motion is part of the product feel; pair it with reduced-motion fallbacks.

## Talent-specific banned UI

- Do not build static, lifeless pages. Talent surfaces need tactile hover/focus/entrance motion where it supports the task.
- Do not use eyebrow/kicker text above headings, including hero chips or pill labels.
- Do not use profile-strength badges, Live/New/Beta chips, status pills, or gamified badge soup.
- Do not overlay corner metadata chips on photos, portfolio cards, or media thumbnails.
- Do not use glass cards, frosted panels, gradient text, colored side stripes, count bubbles, decorative pulsing dots, or generic AI dashboard ornament.
- Do not make textareas draggable/resizable; enforce `resize: none`.
- Do not flatten talent controls into the agency rectangular command vocabulary unless the component is explicitly shared and neutral.

## Implementation guidance

- Let photography remain the brightest, most saturated element on portfolio surfaces.
- Use gold for primary actions, progress/focus, and select celebration moments; do not flood the page with it.
- Preserve the distinction between profile editing, media curation, comp-card generation, and agency submissions.
- Use real empty states and milestone moments instead of placeholder panels.
- Verify long names, locations, social handles, agency names, and image metadata do not overflow.
- When editing shared components, check agency usage before changing global visual defaults.

## Verification

For talent UI changes, run focused lint/build checks and inspect desktop/mobile behavior when possible. If a browser is available, capture screenshots for meaningful visual changes, especially motion or layout changes.
