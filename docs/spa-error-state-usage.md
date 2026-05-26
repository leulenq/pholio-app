# SPA Error State Usage

Shared error UI lives in `client/src/shared/components/states/`. Import from the barrel:

```js
import {
  ErrorStateCard,
  EmptyErrorState,
  BlockedStatePanel,
  ActionFailureNotice,
  TransferFailureNotice,
  InlineErrorText,
} from '@/shared/components/states';
```

Semantic tokens (`--ph-error-*`) are defined in `client/src/styles/tokens.css` and styled in `error-state-primitives.css`.

## Pattern guide

| Pattern | Component | When to use |
|---------|-----------|-------------|
| `page` | `ErrorStateCard` (`variant="page"`) | Global crash / `ErrorBoundary` |
| `section` | `EmptyErrorState` or `ErrorStateCard` | Route or panel load failure with retry |
| `compact` | `ErrorStateCard` / `EmptyErrorState` (`variant="compact"`) | Widget or sidebar failure |
| `inline` | `InlineErrorText` | Field validation (pair with toast on submit) |
| `blocked` | `BlockedStatePanel` / `ProfileGateBanner` | Profile gates — never “error” copy |
| `action-failure` | `ActionFailureNotice` | Failed mutations (archive, reminder actions) |
| `transfer-failure` | `TransferFailureNotice` | Upload/download/PDF transfer |

## React Query load failures

Destructure `isError` and `refetch` from `useQuery`, then branch **before** empty states:

```jsx
const { data, isLoading, isError, refetch } = useQuery({ ... });

if (isError) {
  return (
    <EmptyErrorState
      title="Could not load roster"
      body="Your talent roster did not load. Try again to refresh."
      retry={{ label: 'Try again', onClick: () => refetch() }}
    />
  );
}

if (isLoading) return <Skeleton />;
if (!data?.length) return <AgencyEmptyState ... />;
```

**Do not** treat `isError` as an empty list (silent failure).

## Empty vs error

- **Empty:** `AgencyEmptyState` or domain empty UI — filters returned zero rows, or no data yet.
- **Error:** `EmptyErrorState` — network/API failure; always offer **Try again**.

## Blocked / gated surfaces

`ProfileGateBanner` uses `BlockedStatePanel` for `variant="compact"`. Banner/page variants use `profile-gate--blocked-pattern` and lock icon kicker — copy uses “locked” / “complete profile”, not “error”.

## Mutations and transfers

- **Mutations:** show `ActionFailureNotice` in the panel plus `toast.error` for ephemeral feedback.
- **Transfers:** show `TransferFailureNotice` with **Retry** (downloads) or **Dismiss** after toast; keep notice until user acts.

## Forms

- `PholioInput`, `PholioSelect`, `PholioTextarea` render `InlineErrorText` when `error` prop is set.
- Multi-field flows (e.g. `InterviewScheduler`, `CastingEntry`): inline field errors + toast for summary/server failures.

## Copy tone

- Headlines: calm, specific, editorial.
- Body: one sentence — what happened + what to do next.
- Retry: **Try again** (loads) or **Retry** (transfers).
- Gates: **locked**, **complete profile**, **required** — not “failed” or “error”.

## Migrated surfaces (Phase 2)

- **Load:** `InboxPage`, `RosterPage`, `MessagesPage`, `AnalyticsView`, `InterviewList`, `ReminderList`, `DueReminders`, `DiscoverPage`, `TeamSection` (list load)
- **Hybrids:** Discover curated grid; interview/reminder lists
- **Blocked:** `ProfileGateBanner`, `DashboardLayoutShell` gate
- **Actions:** `TalentDetailPanel`, `ReminderList`, `UserDropdown` (logout)
- **Transfers:** `CompCardPreview`, `PhotosTab`, `MediaGallery`, `CastingScout`
- **Inline:** `PholioInput` family, `CastingEntry`, `InterviewScheduler`, `TeamSection` (invite)

See `docs/spa-error-pattern-map.md` for the full surface → pattern map.
