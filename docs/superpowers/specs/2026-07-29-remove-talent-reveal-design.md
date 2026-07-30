# Remove `/reveal` From The Talent Experience

Date: 2026-07-29
Status: Approved

## Problem

`/reveal` is the post-onboarding "First Card" cinematic: a dark full-screen scene
that draws a gold card border, develops the talent's headshot, sets their name and
height, then closes with a welcome letter and an "Enter Pholio" button.

It is no longer wanted in the talent experience. Onboarding already finalizes the
account server-side (`POST /onboarding/profile` transitions state to `done` and
sets `onboarding_completed_at`), so the reveal contributes nothing the dashboard
does not already provide. It only adds a screen between finishing onboarding and
seeing the product.

## Goal

Talent who finish onboarding land directly on `/dashboard/talent`. No reveal
screen is reachable, and its UI and client plumbing leave the codebase.

## Scope

In scope:

- The onboarding completion handoff (free plan, Stripe-fallback, and the legacy
  `complete` view).
- The `/reveal` and `/dashboard/talent/reveal` routes.
- `RevealPage` / `FirstCard` components and their CSS.
- The dev onboarding-preview entry for the reveal.
- The entry-splash suppression flag formerly owned by the reveal.
- `POST /onboarding/reveal-complete` and its `reveal_viewed` / `can_enter_reveal`
  step data.
- Orphaned `CastingCall.css`.

Out of scope:

- Onboarding step order, copy, timing of the finishing preloader, or the Stripe
  checkout flow itself.
- The `ProfileUnlockExperience` component (a separate profile-unlock feature that
  happens to use `reveal-*` class names of its own).
- `src/routes/chat.js`'s unrelated `/api/chat/reveal` endpoint.

## Behaviour

1. **Finishing onboarding.** The existing finishing preloader still plays for its
   2.8s beat; the navigation target becomes `/dashboard/talent` instead of
   `/reveal`. The Stripe failure fallback and the legacy `complete` view use the
   same handoff.
2. **Legacy URLs.** `/reveal` and `/dashboard/talent/reveal` redirect to
   `/dashboard/talent` (`<Navigate replace />`), so bookmarks and stale links
   resolve without a dead end and without rendering the cinematic. `/reveal` is
   still served the SPA shell — `src/app.js`'s route list, `netlify.toml`'s
   rewrite, and the login page's `SPA_ROUTE_ROOTS` are all unchanged — so a hard
   load reaches that redirect instead of a 404.
3. **Entry splash.** The dashboard's `AuthEntrySplash` stays suppressed on this
   handoff — a "Welcome back" animation immediately after signup is wrong. The
   suppression flag moves from reveal-specific naming
   (`pholio:arrived-from-reveal`, `consumeArrivedFromReveal`) to onboarding
   intent (`pholio:arrived-from-onboarding`, `markArrivedFromOnboarding` /
   `consumeArrivedFromOnboarding`), and the onboarding page becomes its writer.
   One-shot consume semantics and the StrictMode-safe module cache are unchanged.

## Server

`POST /onboarding/reveal-complete` is removed. Onboarding completes at
`POST /onboarding/profile` (with `/onboarding/complete` as the idempotent
safety net). New onboarding state no longer writes `can_enter_reveal` or
`reveal_viewed` / `reveal_viewed_at` step data. A legacy `reveal` current_step
heals to `done` on read.

## Code removal

Deleted: `client/src/domains/talent/pages/RevealPage/` (`index.jsx`,
`FirstCard.jsx`, `FirstCard.css`).

Also removed: the `{ view: 'reveal' }` dev preview step and its navigation
branch, `useCastingRevealComplete`, the `/reveal` breadcrumb label and its
redundant special case, and the dead reveal scorecard CSS block in
`CastingCinematic.css`. `.reveal-cta` stays — the onboarding error screen uses
it — as do the `reveal-*` rules in `ProfileUnlockExperience.css`, which belong to
a different feature.

## Verification

- Focused vitest run for the renamed entry-transition module.
- `npx eslint` (exit 0) on every changed client file.
- `npm run client:build` to prove no dangling imports of the deleted page.
- Repository grep for `RevealPage`, `/reveal`, and `arrived-from-reveal` to
  confirm only the intended compatibility references remain.
