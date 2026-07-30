# Plan — Remove `/reveal` From The Talent Experience

Design: `docs/superpowers/specs/2026-07-29-remove-talent-reveal-design.md`

## 1. Rename the entry-splash suppression to onboarding intent

- `client/src/shared/lib/pholio-auth/entry-transition.js`: rename
  `REVEAL_ARRIVAL_KEY` → `ONBOARDING_ARRIVAL_KEY` (`pholio:arrived-from-onboarding`),
  export `markArrivedFromOnboarding()`, rename `consumeArrivedFromReveal` →
  `consumeArrivedFromOnboarding`, and update the doc comment to describe the
  onboarding handoff rather than the reveal letter.
- `client/src/domains/auth/components/AuthEntryTransitionProvider.jsx`: consume the
  renamed function; update the comment.
- New test `client/src/shared/lib/pholio-auth/__tests__/entry-transition.test.js`:
  mark → consume returns true once, then false; no flag → false.

## 2. Point onboarding completion at the dashboard

- `client/src/domains/onboarding/pages/CastingCallPage.jsx`:
  - `finishToReveal` → `finishToDashboard`; mark the onboarding arrival, then
    navigate to `/dashboard/talent` after the existing 2.8s beat.
  - `handleComplete` uses the same handoff (keeping `writeStoredView(null)`).
  - Drop the dev-preview `preview.view === 'reveal'` branch.
  - Update the flow comment in the file header and the stale `/reveal` comments.
- `client/src/domains/onboarding/dev/onboardingPreview.js`: drop the reveal step.

## 3. Replace the routes and delete the page

- `client/src/App.jsx`: remove the `RevealPage` lazy import; make `/reveal` and
  `/dashboard/talent/reveal` redirect to `/dashboard/talent` with `replace`.
- Delete `client/src/domains/talent/pages/RevealPage/{index.jsx,FirstCard.jsx,FirstCard.css}`.
- `client/src/domains/onboarding/hooks/useCasting.js`: remove
  `useCastingRevealComplete`.
- `client/src/shared/components/Breadcrumbs.jsx`: remove the `/reveal` label and
  its redundant early-return clause.

## 4. Retire the reveal CSS

- `client/src/domains/onboarding/styles/CastingCinematic.css`: delete the reveal
  scorecard block (stage, calculating, score hero, petals, breakdown, verdict,
  runners, and their responsive rules). Keep `.reveal-cta` / `.reveal-cta-arrow`,
  used by the onboarding error screen.

## 5. Remove the reveal-complete endpoint and its step data

- Delete `POST /onboarding/reveal-complete` from
  `src/domains/onboarding/routes/casting.js`.
- Drop `can_enter_reveal` from `initialState` in the state machine and from
  `scripts/reset-onboarding.js`.
- Heal legacy `reveal` current_step → `done` on both server and client
  `LEGACY_STEP_MAP`s.
- Update `scripts/test_casting_flow.js` to go profile → done without
  `reveal_viewed`; drop reveal-complete checks from
  `scripts/test_api_endpoints.sh`.
- Delete orphaned `client/src/domains/onboarding/styles/CastingCall.css`.

## 6. Verify

- `cd client && npm run test -- src/shared/lib/pholio-auth/__tests__/entry-transition.test.js`
- `cd client && npx eslint <changed files>` → exit 0
- `npm run client:build` → exit 0
- Grep for `RevealPage`, `arrived-from-reveal`, `useCastingRevealComplete`, and
  `navigate('/reveal')` → no remaining references outside the documented
  compatibility route.
