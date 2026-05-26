# SPA Error Pattern Map (Phase 1 — superseded)

> **Canonical map:** [`spa-error-pattern-map.md`](./spa-error-pattern-map.md)  
> **Usage guide:** [`spa-error-state-usage.md`](./spa-error-state-usage.md)

# SPA Error Pattern Map (Phase 1)

This internal map links current SPA error surfaces to the target shared error patterns defined in `pholio-error-ui-pass`.

## Canonical Target Patterns

- `page`: full-page blocking failures and global crash states.
- `section`: route-level data load failures inside dashboard shells.
- `compact`: local card/panel failures that keep surrounding content usable.
- `inline`: field-level and form-row validation/submission issues.
- `blocked`: permission/gating/profile lock states.
- `action-failure`: destructive or mutation failures requiring persistent local notice.
- `transfer-failure`: upload/download/import/export failures with retry guidance.

## Current Surface -> Target Pattern

- `client/src/shared/components/ErrorBoundary.jsx` -> `page`
- `client/src/domains/agency/pages/InboxPage/index.jsx` -> `section`
- `client/src/domains/agency/pages/RosterPage/index.jsx` -> `section`
- `client/src/domains/agency/pages/MessagesPage/index.jsx` -> `section`
- `client/src/domains/talent/components/AnalyticsView.jsx` -> `section`
- interview/reminder list empty+error hybrids (agency domain) -> `compact` + `empty-error` split
- discover/list hybrid panels (agency/talent) -> `compact` + `empty-error` split
- `client/src/shared/components/gating/ProfileGateBanner.jsx` and profile-lock flows -> `blocked`
- agency destructive actions (detail panels, reminders, logout edge failures) -> `action-failure`
- comp-card/media/onboarding transfer failures -> `transfer-failure`
- shared form primitives and route forms (`PholioInput` families + domain forms) -> `inline`

## Phase 1 Outcome

- Introduce shared primitives under `client/src/shared/components/states/`.
- Introduce semantic error tokens (`--ph-error-*`) in token CSS for reusable styling hooks.
- Migrate global crash fallback (`ErrorBoundary`) to the new shared `page` pattern.

## Deferred To Later Phases

- Route-by-route migration for section/compact/error-empty hybrids.
- Blocked state standardization across all gating entry points.
- Mutation/transfer failure migration away from console/toast-only behavior.
- Inline form error normalization across all form families.
