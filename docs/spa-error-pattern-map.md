# SPA Error Pattern Map

Canonical mapping from SPA surfaces to shared error-state patterns (`client/src/shared/components/states/`).

## Target patterns

| Pattern | Component | When to use |
|---------|-----------|-------------|
| `page` | `ErrorStateCard` (`variant="page"`) | Global crash / fatal boundary |
| `section` | `ErrorStateCard` / `EmptyErrorState` | Route or panel load failure with retry |
| `compact` | `ErrorStateCard` (`variant="compact"`) | Inline card/widget failure |
| `inline` | `InlineErrorText` | Field validation / submit errors |
| `blocked` | `BlockedStatePanel` / `ProfileGateBanner` | Profile/permission gates (not failures) |
| `action-failure` | `ActionFailureNotice` | Mutations, destructive actions |
| `transfer-failure` | `TransferFailureNotice` | Upload/download/PDF transfer |

## Surface → pattern

### Global
- `shared/components/ErrorBoundary.jsx` → `page`

### Agency — load failures (section + retry)
- `domains/agency/pages/InboxPage/index.jsx` → `section`
- `domains/agency/pages/RosterPage/index.jsx` → `section`
- `domains/agency/pages/MessagesPage/index.jsx` → `section` (threads + active thread)
- `domains/agency/pages/DiscoverPage/index.jsx` → `section` / `empty-error` split
- `domains/agency/components/InterviewList.jsx` → `compact` + empty split
- `domains/agency/components/ReminderList.jsx` → `compact` + empty split
- `domains/agency/components/DueReminders.jsx` → `compact`

### Talent — load failures
- `domains/talent/components/AnalyticsView.jsx` → `section`
- `domains/talent/components/OverviewView.jsx` → `section` (summary/activity partial errors)

### Empty / error hybrids
- Discover curated grid, inbox/roster filtered lists, interview/reminder lists → distinct `AgencyEmptyState` vs `EmptyErrorState`

### Blocked / gated
- `shared/components/gating/ProfileGateBanner.jsx` → `blocked` (editorial rich variant)
- `shared/layouts/DashboardLayoutShell.jsx`, `Header.jsx`, `ApplicationsView.jsx` → consume gate banner

### Action failures
- `domains/agency/components/TalentDetailPanel.jsx` → `action-failure`
- `domains/agency/components/ReminderList.jsx` → `action-failure` (per-action toast + notice)
- `domains/agency/components/nav/UserDropdown.jsx` → toast + redirect fallback

### Transfer failures
- `domains/talent/components/CompCardPreview.jsx` → `transfer-failure`
- `domains/talent/components/MediaGallery.jsx`, `PhotosTab.jsx` → `transfer-failure` + toast
- `domains/onboarding/pages/CastingScout.jsx` → `transfer-failure`

### Inline forms
- `shared/components/ui/forms/PholioInput|Select|Textarea` → `inline` via `InlineErrorText`
- `domains/onboarding/pages/CastingEntry.jsx` → `inline` + optional toast
- `domains/agency/components/InterviewScheduler.jsx` → `inline` + toast summary
- `domains/agency/pages/SettingsPage/TeamSection.jsx` → `inline` on invite field

## Copy tone

- Headlines: calm, specific, editorial (Playfair display in cards).
- Body: one sentence — what happened + what to do next.
- Retry label: **Try again** (loads) or **Retry** (transfers).
- Gates: never use “error” language — use “locked”, “complete profile”, “required”.

## Feedback channel rules

- **Toast only**: ephemeral success and non-blocking hints.
- **Inline + toast**: form submit failures (field detail inline, summary toast).
- **Persistent card**: blocking load failures, action failures affecting data, transfer failures.
