# Intel page — canonical frontend

**Spec:** `tasks/intel-page-spec.md` (v2). **Routes:** `/dashboard/talent/intel`, `/dashboard/talent/analytics`.

## Architecture (do not revert)

The shipped Intel UI is the **intel2** panel: flat zone components in this
directory (`PulseZone`, `PipelineFlow`, `AgencyLens`, …) with shared chrome in
`IntelKit.jsx` and styles in `IntelPage.css` (`intel2-*` classes).

| Use | Do not use |
|-----|------------|
| Root-level `*.jsx` zone files here | `instruments/` subfolder |
| `PulseZone` + `SignalSpectrum` | `instruments/Pulse.jsx` |
| Currency **rings** in Agency Lens | Linear runway bars from the discarded rewrite |
| `{ intel, meta }` from `useIntel` | Raw `useQuery` or `{ data }` only |

A parallel **`instruments/` rewrite** landed briefly on `main` (commits around
`c6fa4b5`–`17cb101`). It was an older branch implementation, superseded by this
intel2 tree. **Do not restore `instruments/` from git history** — merge conflicts
and agent checkouts have regressed production twice.

## Data contract

- Hook: `client/src/domains/talent/hooks/useIntel.js` → `GET /api/talent/intel`
- Page destructures `{ intel, meta, isLoading, isError, refetch }`
- Zone props match backend compose (`pulse`, `seismograph`, `pipeline`, `book`, `lens`, …)

## Editing

Extend existing zone components; preserve editorial serif + hand-drawn instruments
from the spec. Run `cd client && npx eslint src/domains/talent/pages/IntelPage/`
before merge.
