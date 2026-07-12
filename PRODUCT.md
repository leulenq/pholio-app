# Product

## Register

product

## Users

Two distinct authenticated audiences, each in their own task and their own visual system:

- **Talent** — models, actors, and creatives building a professional presence. They are in a *creation and pride* mindset: uploading images, curating a portfolio, generating comp-card PDFs, tracking profile strength, and applying to agencies. The interface should make them feel their work is being staged, not stored.
- **Agencies** — bookers, scouts, and agency owners managing a roster. They are in an *operations and judgement* mindset: reviewing submissions, triaging an inbox, running casting boards (Kanban), scheduling interviews, and signing talent. Pholio does not charge agencies and has no money/commission workflow. They need density, scan-ability, and authority — many talent, many signals, fast decisions.

Both surfaces are used at a desk, in good light, often for extended working sessions. The platform also has a separate Next.js marketing site (`pholio-landing` repo) which is the brand gold-standard but is out of scope for these app design systems.

## Product Purpose

Pholio is a full-stack talent portfolio and agency management platform. Talent create portfolios and comp cards and apply to agencies; vetted agencies manage rosters, review submissions, and run casting/signing workflows. Pholio does not charge agencies and has no money/commission workflow. Success looks like: a talent who feels their portfolio is *premium* enough to represent them professionally, and an agency that can run its entire roster workflow without the tool getting in the way. The product earns trust by feeling like a high-end studio asset, not a generic SaaS CRM.

## Brand Personality

**Warm. Editorial. Confident.** Pholio reads like a fashion house's software — cream paper, gold leaf, serif headlines — not a blue-and-white dashboard. Voice is calm and authoritative, never loud or gamified-for-its-own-sake. Talent surfaces lean cinematic and tactile (the portfolio *performs*); agency surfaces lean composed and dense (the roster reads like a printed casting book). The two share a material vocabulary — warm neutrals, a single gold accent, Inter body type — but are intentionally **separate design systems** with different display serifs, density, and motion energy.

## Anti-references

Pholio explicitly rejects generic SaaS dashboard conventions and a specific list of UI patterns that have been removed from the codebase and must never return:

- **No eyebrow / kicker text** above headings — no small uppercase or letter-spaced label sitting above a heading. Use the heading alone.
- **No pill-chip or hero-chip versions** of that eyebrow.
- **No status badges** (green/yellow/red dots or pills encoding "available / on booking / inactive"). Status is plain text or a non-badge stripe/dot.
- **No New / Beta / Live / AI-powered feature badges.**
- **No accent-dot-plus-badge** decorative metadata combos.
- **No tiny corner metadata chips** on cards or photo thumbnails (no MatchScoreBadge, TalentTypePill, etc.). Type and score render as plain inline text.
- **No glassmorphism** — no `backdrop-filter: blur()` on cards, panels, or buttons. Permitted only on full-screen functional scrims.
- **No count-bubble badges** on nav items or cards.
- Not a cold, corporate, blue-and-white admin panel. Not a flat, lifeless, static page. Not template-feeling enumerated design variants.

## Design Principles

1. **The landing page is the gold standard.** Motion is alive, spring-based, and tactile; the app should never feel static or lifeless. Motion is part of the build, not an afterthought.
2. **Two systems, one material.** Talent and agency are separate design languages that share warm neutrals, one gold accent, and Inter — but never get blended into a single averaged look.
3. **Editorial over decorative.** Serif display type, generous warm canvas, and real photography carry the premium feel — not chips, badges, gradients, or chrome.
4. **Density with composure (agency) / stage with motion (talent).** Match information density and motion energy to the user's task, not to a uniform house style.
5. **Earned familiarity.** Standard affordances for standard tasks; surprise is reserved for moments (unlocks, reveals), never scattered across every screen.

## Accessibility & Inclusion

No formal WCAG conformance level is committed. Existing practices to preserve: keyboard `:focus-visible` rings (gold outline, 2px, 4px offset), a skip link, and `prefers-reduced-motion` alternatives for scroll and entrance animation. Body contrast should stay legible on tinted warm surfaces — bump muted grays toward the ink end of the ramp rather than chasing elegance with light gray on cream.
