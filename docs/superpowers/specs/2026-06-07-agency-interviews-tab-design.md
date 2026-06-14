# Agency Interviews Tab — Design Spec

**Date:** 2026-06-07
**Status:** Approved for implementation
**Surface:** `client/src/domains/agency/pages/InterviewsPage.jsx` (`/dashboard/agency/interviews`)

## 1. Purpose

The Interviews tab is the **coordination layer** of the agency dashboard — where an
agency manages interview activity across its pipeline in one clear, premium view.
It answers, at a glance: what is **scheduled**, what is **pending**, what **needs
action**, and which talent is **moving forward**.

It must feel organized, high-trust, and operationally strong — a status-pipeline
ledger, not a generic calendar/scheduling dashboard — and stay visually aligned
with the agency shell (the `CastingPage` "ledger" pattern is the reference).

## 2. Backend reality (no changes required)

- **`GET /api/agency/interviews`** returns `interviews.*` joined with
  `talent_name` (`first || ' ' || last`), `talent_email`, `talent_slug`,
  ordered by `proposed_datetime ASC`. Client: `getInterviews()`.
- **`interviews` table** columns: `id`, `application_id`, `agency_id`,
  `talent_id`, `proposed_datetime`, `duration_minutes`, `interview_type`
  (`video_call` | `phone_call` | `in_person`), `location`, `meeting_url`,
  `notes`, `status` (`pending` | `accepted` | `declined` | `rescheduled` |
  `cancelled` | `completed`), `response_message`, `responded_at`.
- **Mutations already exist:**
  - `scheduleInterview(applicationId, data)` → `POST /applications/:id/interviews`
  - `updateInterview(id, updates)` → `PATCH /interviews/:id` (accepts `status`,
    `proposed_datetime`, `meeting_url`, etc. — so "Mark complete" =
    `updateInterview(id, { status: 'completed' })`)
  - `cancelInterview(id)` → `DELETE /interviews/:id` (soft-cancel → `cancelled`)
- **Applicant picker source:** `getApplicants()` → `GET /api/agency/applications`
  returns profiles with `application_id`, `first_name`, `last_name`, `city`,
  `application_status`. Filter client-side to rows with a non-null
  `application_id` (real applicants to this agency).

**No migration, route, or API-client additions are required.**

## 3. Information architecture — the status pipeline

The page spine is a vertical sequence of **lanes** by lifecycle. Lanes derive
client-side from `status` + `proposed_datetime` + `meeting_url`. `now` = current time.

Lane order (top → bottom):

1. **Needs Action** — urgent items pulled OUT of their normal lane, sorted
   most-urgent first. An interview is "needs action" if any of:
   - `status === 'declined'` → reason: *"Declined — propose a new time"*
   - `status === 'rescheduled'` → reason: *"Reschedule requested"*
   - `(status === 'pending' || status === 'accepted')` AND `proposed_datetime < now`
     → reason: *"Past — mark complete or follow up"*
   - `(status === 'pending' || status === 'accepted')` AND `proposed_datetime >= now`
     AND `interview_type === 'video_call'` AND no `meeting_url`
     → reason: *"Add a meeting link"*

   Renders only when count > 0. Gold-toned section header.
2. **Scheduled** — `status === 'accepted'`, upcoming, not flagged above. Confirmed.
3. **Awaiting Response** — `status === 'pending'`, upcoming, not flagged above.
   Sent, no reply yet. Muted tone.
4. **Completed** — `status === 'completed'`. Collapsible, secondary tone,
   **collapsed by default**.

`cancelled` interviews are hidden by default, revealed via a small
**"Show cancelled"** toggle near the Completed lane (rendered muted/struck).

Empty lanes (other than the always-present structure) are skipped.

## 4. Layout

```
Interviews                                              [+ Schedule]
Coordinate every conversation in your pipeline
[ search talent by name … ]
────────────────────────────────────────────────────────────────────
 LEDGER:  3 Need Action  ·  8 Scheduled  ·  5 Awaiting  ·  12 Completed
────────────────────────────────────────────────────────────────────
 NEEDS ACTION (3)
 SCHEDULED (8)
 AWAITING RESPONSE (5)
 COMPLETED (12)  ▸ (collapsed)        [Show cancelled]
```

- **Header:** editorial serif `Interviews` title + one-line subhead + a slim
  header-right `[+ Schedule]` button.
- **Search:** a lightweight text input filtering across all lanes by
  `talent_name` (case-insensitive substring). Empty query = show everything.
- **Ledger:** non-interactive summary row mirroring the four lanes
  (`Need Action` gold-toned when > 0), styled like the `CastingPage` ledger.

### Visual identity
Warm light shell — canvas `--ag-surface-0`, white cards `--ag-surface-1`.
**Monogram avatars** (initials), no portrait photos. Each card carries a calm
color-coded **status spine** on its left edge (gold = needs action, neutral =
scheduled/awaiting, muted = completed). Editorial serif lane headers. Framer
Motion spring entrances (`stiffness: 55, damping: 16`), staggered per card.

## 5. Components

### 5.1 `InterviewsPage.jsx` (rewrite)
Owns:
- `useQuery(['agency-interviews'], getInterviews)`.
- Derivation of interviews into lanes (memoized) + ledger counts.
- Name search state; Completed collapse state; Show-cancelled state.
- Renders header, ledger, lanes, and the schedule modal trigger.
- States: loading spinner; `EmptyErrorState` (retry) on error; full-empty
  `AgencyEmptyState` (Calendar icon, *"No interviews yet"*) with a
  **"Schedule an interview"** CTA that opens the modal.

### 5.2 `InterviewRow.jsx` (new)
Single interview card. Self-contained; owns its own mutations
(`updateInterview`, `cancelInterview`) and inline-edit UI state.

Anatomy:
`▌[status spine] (MR monogram) · Name · type-icon + relative "when" · reason tag · [primary action] [⋯]`

- **Primary contextual action** by state:
  - Needs Action / declined → **Reschedule**
  - Needs Action / missing link → **Add link**
  - Needs Action / past → **Mark complete**
  - Scheduled with `meeting_url` → **Join** (opens link)
  - otherwise → none (kebab only)
- **`[⋯]` dropdown:** Reschedule · Add/edit link · Mark complete · Cancel ·
  Message talent (Message routes to the talent/messages surface; out-of-scope
  actions degrade gracefully — see §7).
- **Reschedule** opens a compact inline editor inside the card
  (`datetime-local`, optional duration) → `updateInterview`.
- **Add/edit link** opens an inline link field → `updateInterview({ meeting_url })`.
- **Mark complete** → `updateInterview({ status: 'completed' })`.
- **Cancel** → confirm → `cancelInterview(id)`.
- All mutations `invalidateQueries(['agency-interviews'])` + `sonner` toast.

### 5.3 `InterviewScheduleModal.jsx` (new)
Portal modal styled in the spirit of `CastingNewModal` (overlay + spring form),
with its own `iv-`-prefixed styles. Single form:

1. **Applicant picker** — searchable select from `getApplicants()` filtered to
   rows with `application_id`; shows name + city; selection sets `applicationId`.
2. **Date & time** — `datetime-local` (required).
3. **Duration** — select (15 / 30 / 45 / 60 min; default 30).
4. **Type** — segmented control Video / Phone / In person →
   `video_call` / `phone_call` / `in_person`.
5. **Conditional field** — Video → meeting link; In person → location; Phone → none.
6. **Notes** — textarea (optional).

Submit → `scheduleInterview(applicationId, { proposed_datetime, duration_minutes,
interview_type, meeting_url, location, notes })` → invalidate
`['agency-interviews']` → toast → close. New interview appears in
**Awaiting Response**.

### 5.4 Styling — `InterviewsPage.css` (rewrite, `iv-` prefix)
Light shell, lanes, ledger, cards, monogram, status spine, dropdown menu, inline
editors, segmented control, and modal. Uses `agency-tokens.css` custom
properties. Standard transition `all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`.

## 6. Files

| Action | File |
| --- | --- |
| Rewrite | `client/src/domains/agency/pages/InterviewsPage.jsx` |
| Rewrite | `client/src/domains/agency/pages/InterviewsPage.css` |
| New | `client/src/domains/agency/components/InterviewRow.jsx` |
| New | `client/src/domains/agency/components/InterviewScheduleModal.jsx` |
| Untouched | `InterviewList.jsx` (only consumer was `InterviewsPage`; now unused, left in place) |
| Untouched | `InterviewCard.jsx`, `InterviewScheduler.jsx`, `InterviewSection.jsx` (used by applicant-detail view) |

No backend / migration / `agency.js` API-client changes.

## 7. Edge cases & decisions

- **Message talent** action: routes to the existing agency messages surface for
  that application if available; if no such route is wired, the action is omitted
  rather than dead-ended (decided during implementation by checking routes).
- **Past `accepted`/`pending`** always surface in Needs Action so nothing rots
  silently in a lane.
- **`rescheduled` status** is treated as Needs Action (agency must re-propose).
- **`cancelled`** hidden behind a toggle; never counts toward ledger lanes.
- **Date parsing:** `proposed_datetime` may be a full ISO timestamp; parse via
  `new Date(...)` and guard `NaN`.
- **Empty applicant list** in the schedule modal: show an inline note pointing to
  the Applicants page rather than an empty dropdown.

## 8. Verification

- `cd client && npm run lint` clean for new/edited files.
- Manual: load `/dashboard/agency/interviews` — lanes render and bucket correctly;
  Needs Action surfaces declined/past/missing-link; ledger counts match; search
  filters by name; Completed collapses; Show-cancelled toggles.
- Schedule modal: pick applicant → create → toast → new row in Awaiting Response.
- Row actions: reschedule (inline), add link (inline), mark complete, cancel —
  each updates optimistically/after-invalidate with a toast.
- Confirm applicant-detail interview UI (`InterviewSection`) still works (untouched).
```
```
