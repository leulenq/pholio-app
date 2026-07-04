# `/apply` Draft Lifecycle Audit

Date: 2026-06-27

## Executive verdict

The implementation is a credible server-backed draft foundation, not a
local-only cache. It has a dedicated table, per-profile authorization,
optimistic versions on saves, a local crash buffer, explicit conflict
resolution, debounced auto-save, visible save state, and transactional
retirement of the draft during submission.

It is not yet a complete, polished draft product.

The largest gap is lifecycle ownership outside the editor. `/applications`
does not load or display drafts, the client has no delete experience, only the
latest draft can be discovered, and `Apply New` can silently resume that draft.
Expiration is not implemented: 30 days only sets an unused `isStale` flag.
There are also two server-boundary problems that should block launch:
submission conflict protection is optional, and the server does not require
the final consent flag.

### Lifecycle scorecard

| Capability | Verdict | Evidence |
|---|---|---|
| Create | Pass | First meaningful edit/checkpoint creates version 1 on the server. |
| Auto-save/update | Pass with gaps | 1.5-second debounce, serialized saves, optimistic versioning, local crash copy. No reconnect retry; local-storage failure is ignored. |
| Resume same device | Partial | Server and local copies hydrate the saved step. Old/invalid references are silently removed. |
| Resume another device | Partial | Server copy works. Only the latest draft is discoverable; `/applications` has no draft list. |
| Resolve concurrent edits | Partial | Save conflicts produce an explicit choice. Submit and delete do not consistently require the same precondition. |
| Save and exit | Partial | Correct in the normal editor. In loading, read-error, and conflict states the same label can merely exit without saving. |
| Abandon/discard | Fail | No user-facing discard action or defined abandonment state. |
| Delete | Fail as a product; partial API | An unused endpoint exists. No UI, no local cleanup, no reliable outcome contract, no undo/tombstone. |
| Expire | Fail | No `expires_at`, cleanup job, warning, grace period, or expiry UI. `isStale` is informational and unused. |
| Recover | Partial | Local crash recovery and version-conflict choice exist. No durable delete/expiry recovery policy. |
| Submit/convert | Pass with blockers | Application/package/message/draft deletion are atomic. Version is optional and consent is not enforced server-side. |
| View in `/applications` | Fail | The page queries submitted applications and agencies only. |
| Distinguish draft from submitted | Pass in storage, fail in product UI | Separate tables correctly prevent drafts from reaching agency inboxes, but talent cannot see the distinction in `/applications`. |

## What is solid

1. Drafts are stored separately from `applications`. This is the right
   boundary: a draft cannot accidentally become an agency-visible application
   status.
2. The unique `(profile_id, agency_id)` constraint gives one canonical draft
   per agency and talent.
3. Save writes require `expectedVersion`; the compare-and-update occurs inside
   a transaction.
4. Server normalization rejects foreign profile media, presets, and invalid
   agency boards.
5. The client writes a synchronous same-device buffer before the debounced
   server request and serializes overlapping saves.
6. The client blocks editing when it cannot first check the server copy.
7. Divergent local/server copies are not silently overwritten.
8. The save state uses `aria-live="polite"` and displays browser-local time.
9. Final submission atomically creates/revives the application, snapshots the
   package, writes the initial message, and deletes the matching draft.
10. The focused integration suite passes its three existing cases.

## Prioritized findings

### P0 — release blockers

#### DRAFT-001: submission can bypass optimistic concurrency

`POST /api/talent/applications` only compares the draft when `draftVersion`
parses as an integer. A missing version proceeds, submits the request payload,
and deletes the current server draft. An old client, direct request, or future
caller can therefore submit stale work and retire a newer device's draft.

Required:

- Make a submit precondition mandatory whenever a draft exists.
- Treat “no draft expected” as an explicit version/generation, not an omitted
  field.
- Return a conflict with the current representation when the precondition
  fails.
- Add a regression test where a newer device saves before an older device
  submits.

Reference: `src/domains/talent/routes/applications.js:422-439`.
Conditional writes are the standard defense against lost updates
([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Conditional_requests),
[RFC 6585](https://httpwg.org/specs/rfc6585.html)).

#### DRAFT-002: final consent is UI-only

The UI requires `consent`, but the server only snapshots
`!!submissionPackage.consentConfirmed`; it never rejects `false` or missing.
Client controls are not an authorization or consent boundary.

Required:

- Define exactly what this consent attests to.
- Require it server-side for submission.
- Decide when material changes invalidate consent. At minimum, changing the
  agency, included media, or package after consent should reset it.
- Do not silently restore a legally meaningful confirmation indefinitely
  without an explicit product/legal decision.

Reference: `src/domains/talent/routes/applications.js:465-505`.

### P1 — high-priority product and data-integrity gaps

#### DRAFT-003: `/applications` has no draft ownership surface

`ApplicationsView` does not query drafts. Users cannot see how many drafts
exist, which agency each belongs to, where they stopped, or when each was
saved. The empty state can say “You haven't applied yet” while drafts exist.
Agency discovery still says `Prepare` or `Compose` rather than `Continue`.

Required product shape:

- Add a separate `Draft applications` section above `Application history`.
- Do not mix drafts into submitted status filters, counts, monthly limits, or
  agency-facing records.
- Each row should show agency, current step, last saved local time, `Continue`,
  and a restrained delete action.
- If an agency is no longer available, keep the draft visible with resume
  disabled and a clear reason; allow deletion.
- Add an all-drafts endpoint. `GET /drafts/latest` cannot support this product.

Reference: `client/src/domains/talent/components/ApplicationsView.jsx:95-207`.

#### DRAFT-004: “Apply New” can silently resume existing work

The `/applications` hero opens `/apply` without an agency. `/apply` then
automatically selects the latest draft. The label promises a new action while
the route performs resume, with no choice or explanation.

Required:

- `Apply New` must always open the agency chooser.
- Draft cards should own `Continue`.
- If route-level automatic resume is retained for another entry point, make it
  explicit in the navigation contract or use `?resume=latest`.

References:
`client/src/domains/talent/components/ApplicationsView.jsx:204-207`,
`client/src/domains/talent/pages/ApplyPage/ApplyExperience.jsx:540-552`.

#### DRAFT-005: no user-facing delete or abandon flow

`talentApi.deleteDraft` is unused. There is no intentional discard action,
confirmation, local-buffer cleanup, cache invalidation, or recovery/undo
behavior.

Required:

- Put delete in `/applications`, not as a primary editor action.
- Confirm with the agency name and consequence: “Delete this draft? It has not
  been submitted.”
- Clear the matching local buffer and invalidate list/latest/detail queries
  only after server success.
- Prefer a short undo window or soft-delete/tombstone if recovery is a product
  requirement.
- Do not call leaving the editor “abandoning”; `Save and exit` should preserve
  the draft.

#### DRAFT-006: delete API reports ambiguous success

The delete route makes `expectedVersion` optional. If supplied but wrong, zero
rows are deleted and the response is still `{success:true}`. Deleting a missing
draft returns the same response. The current API client cannot send the
expected version because its delete wrapper supplies no body.

The isolated audit probe verified:

- wrong version → HTTP 200/success, draft remains;
- correct version → HTTP 200/success, draft is deleted;
- repeated delete → the same HTTP 200/success.

Required:

- Require the precondition.
- Return conflict plus latest draft on a stale version.
- Return a clear idempotent result (`deleted:false`, reason) or 404 when
  missing; do not claim an indistinguishable successful deletion.
- Include a deletion generation/tombstone so an old local buffer cannot
  recreate an intentionally deleted draft without an explicit recovery step.

References:
`src/domains/talent/routes/applications.js:797-825`,
`client/src/domains/talent/api/talent.js:79-86`.

#### DRAFT-007: expiration does not exist

`DRAFT_STALE_AFTER_MS` marks a representation after 30 days, but no client
reads `draft.isStale`. There is no expiry column, cleanup process, warning,
grace period, or expired state. The isolated probe verified a 31-day-old draft
remains readable and resumable. The existing task review's claim that a
30-day-old draft gets a reminder is no longer true in current code.

Required:

- Decide and document retention separately from “needs review.”
- Add `expires_at` and an explicit state or deterministic state computation.
- Show advance notice in `/applications`.
- At expiry, either hard-delete or move to a time-bounded recoverable state.
- Exclude expired drafts from automatic resume.
- Run a scheduled cleanup and instrument its results.

Personal data should not be retained indefinitely without a justified policy
([ICO storage limitation guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/)).

#### DRAFT-008: local crash copies persist across logout and account deletion

The local payload includes the note, consent value, media references, agency,
and workflow state. `localStorage` has no expiration and is not cleared by
logout or account deletion. The browser client identifier also persists and is
shared across accounts using that browser. Server-side cascade deletion does
not remove browser storage.

Required:

- Clear all current profile draft keys on logout and account deletion.
- Add an age to local records and purge them after the recovery window.
- Scope/rotate the client ID per signed-in profile or session.
- Never tell the user “changes remain on this device” unless the local write
  returned success.

`localStorage` persists across browser sessions and is shared by documents on
the same origin
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)).

#### DRAFT-009: privacy export omits application drafts

`buildTalentDataExport` exports submitted applications and messages but not
`application_drafts`, even though drafts contain user-provided personal data.
Account deletion cascades the server rows, but the export is incomplete and
the browser copy remains.

Reference: `src/shared/lib/data-export.js:92-143`.

#### DRAFT-010: save failure recovery can make a false promise

`writeLocalDraft` returns `false` when storage is unavailable/quota-limited,
but all callers ignore it. If the network save then fails, the toast says the
changes remain on the device even when they do not. There is also no
online/reconnect listener or retry backoff, so a failed save remains failed
until another edit or explicit action.

Required:

- Track server and local durability separately.
- If both fail, show a blocking “copy your note / retry before leaving” state.
- Retry when connectivity returns, with bounded exponential backoff.
- Preserve `Save and exit` as a retry that exits only after durable save.

Reference:
`client/src/domains/talent/pages/ApplyPage/applicationDraftStorage.js:37-61`,
`client/src/domains/talent/pages/ApplyPage/ApplyExperience.jsx:773-788`.

#### DRAFT-011: `Save and exit` has inconsistent semantics

In the normal editor it saves and exits. In draft-loading, server-read-error,
and conflict views the same visible label is wired directly to
`exitToMarket`, so it exits without performing the named save. In the agency
chooser there is nothing to save.

Required:

- Normal dirty/clean editor: `Save and exit`.
- Chooser/loading: `Back to applications` or `Exit`.
- Read error/conflict: disable the save wording, require resolution, or use an
  explicit `Exit with changes on this device` confirmation.
- Keep behavior and accessible name identical.

References:
`client/src/domains/talent/pages/ApplyPage/ApplyExperience.jsx:1271-1405`,
`:1654-1701`.

#### DRAFT-012: SPA back/navigation is not durably checkpointed

The code handles its own Back/Next buttons, `beforeunload`, and
`visibilitychange`, but has no React Router navigation blocker. Browser Back,
sidebar navigation, or another in-app route can unmount before the 1.5-second
server save. The same-device local copy usually protects the edit; a second
device does not see it.

`beforeunload` is not reliable, especially on mobile; visibility-based saving
is better but still not a substitute for progressive durable saves
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)).

Required:

- Flush or block in-app navigation while a critical server save is unresolved.
- Keep the unload warning attached only while truly unsaved, as current code
  already does.
- Test browser Back, sidebar links, refresh, mobile app switch/kill, and tab
  close separately.

### P2 — important hardening

#### DRAFT-013: stale and invalid media changes are silent

Removed images, changed boards, deleted presets, or invalid sets are normalized
away with no repair summary. A user can resume believing their prior package
is intact. The server accepts any owned image for a digital slot and any owned
image set, while the client applies stricter type/set rules.

Required:

- Centralize canonical media eligibility on the server: active,
  agency-shareable, correct set kind, correct digital type/shot slot, and valid
  rights state.
- Return structured normalization warnings.
- On resume, show a quiet repair message and route the user to affected steps.
- Re-run readiness before submission.

References:
`src/domains/talent/services/application-drafts.js:63-128`,
`client/src/domains/talent/pages/ApplyPage/ApplyExperience.jsx:586-627`.

#### DRAFT-014: unavailable agencies can strand drafts

Draft reads/saves load the agency status but do not enforce it. The discovery
endpoint returns active agencies only. An inactive agency's newest draft can
be returned by `latest`, rejected by the client’s active list, and prevent
older active drafts from being discoverable through `latest`.

Required:

- List all drafts in `/applications`, including unavailable ones.
- Disallow further edits/submission to unavailable or blocked agencies with a
  clear reason.
- Allow delete/export.
- Make latest-resumable query filter eligibility rather than returning one
  unusable row.

#### DRAFT-015: schema version is metadata, not a migration strategy

`schema_version` is stored and returned, but both client and server always
assume version 1. There is no upgrader, unsupported-version response, or test
for a future payload.

Required:

- Implement ordered payload migrations or reject unsupported newer versions
  without overwriting them.
- Test v1 → v2 and future-version safety before changing the schema.

#### DRAFT-016: create and submit retries are not idempotent

The application uniqueness constraint prevents two final rows, but concurrent
submit retries can surface a generic constraint failure rather than the prior
successful result. Two concurrent first saves can similarly race on the draft
unique constraint and produce a server error instead of a normal conflict.

Required:

- Add an idempotency key to final submit and return the original result on
  retry.
- Convert first-save unique races into a draft conflict response.
- Add PostgreSQL concurrency tests; SQLite alone is insufficient.

#### DRAFT-017: conflict choice lacks enough comparison context

The explicit two-copy choice is good. For a long application, timestamps alone
do not tell the user what will be lost.

Required:

- Show current step and a compact change summary: boards, book, excluded frame
  count, digitals, comp card, note edited.
- Move focus to the conflict heading and announce the conflict when the panel
  replaces the editor.
- Do not attempt silent field merging until merge semantics are specified and
  tested.

Requesting confirmation before irreversible data loss is established
accessibility guidance
([W3C G168](https://www.w3.org/WAI/WCAG20/Techniques/general/G168)).

#### DRAFT-018: no operational visibility

There are no draft-specific metrics or structured events for save latency,
save failures, conflicts, local recovery, deletion, expiry, normalization
repairs, or submit conversion.

Required minimum telemetry:

- save attempts/success/failure/latency by endpoint and database;
- conflict rate by save/delete/submit;
- local recovery and conflict-choice outcomes;
- draft age distribution and expiry cleanup count;
- draft-to-submit conversion and abandonment;
- stranded unavailable-agency drafts;
- alerts for elevated save failures and cleanup failures.

Use identifiers that support debugging without logging note text or full
payloads.

## Recommended product model

### States

Use explicit lifecycle semantics even if some are derived:

`active → submitted`

`active → deleted → recoverable → purged`

`active → expired → recoverable → purged`

`active → unavailable` when the agency cannot accept work; this is not
automatic deletion.

Add at least:

- `deleted_at`
- `expires_at`
- `purge_after`
- `submitted_application_id` or a conversion event
- `generation` (or immutable resource ID/tombstone) in addition to edit version

`version` protects edits within one generation. `generation`/tombstones protect
intentional deletion from an old local copy that still thinks the resource
exists.

### `/applications` information architecture

1. `Draft applications` — active, user-owned, resumable work.
2. `Application history` — submitted records only.
3. `Next submissions` — agencies with neither an active submission nor a
   draft; an agency with a draft should say `Continue application`.

Drafts must not affect application totals, active/signed counts, or monthly
submission limits.

### Delete and recovery behavior

1. User selects `Delete draft`.
2. Confirmation names the agency and states it was never submitted.
3. Server conditionally marks the current generation deleted.
4. Client clears the exact local copy and shows `Draft deleted` with `Undo`
   during a short window.
5. Other devices see a tombstone, not “no draft,” and cannot silently recreate
   it.
6. After the recovery window, a scheduled job purges it.

### Expiry behavior

Product must choose the actual durations. A defensible pattern is:

- “Needs review” after a period of inactivity.
- Advance warning before expiration.
- Expired drafts hidden from automatic resume but visible in a recoverable
  area for a short grace period.
- Purge after grace.

Do not encode these dates only in the client. Store/derive them server-side and
test scheduled cleanup.

## Executable QA plan

### Environments and fixtures

Run the matrix against both SQLite and PostgreSQL.

Required fixtures:

- Talent A and Talent B.
- Two browser clients for Talent A plus one private/restricted-storage client.
- Three active agencies, one inactive agency, one blocked agency.
- Multiple book sets, a digitals-kind set, active/inactive images, excluded
  agency images, rights-cleared and non-cleared images.
- A comp-card preset that can be deleted during the test.
- A withdrawn application for reapply.
- A free account at 4/5 and 5/5 monthly submissions.
- Minor/guardian-consent variants if those fields affect send eligibility.

Browser coverage:

- Current Chrome, Safari, Firefox.
- iOS Safari and Android Chrome for app-switch/kill behavior.
- At least two time zones and one locale with a non-US date format.

Network modes:

- normal;
- 2-second latency;
- offline before edit;
- disconnect during save;
- response lost after server commit;
- reconnect without another edit.

### API and database tests

| ID | Scenario | Expected result |
|---|---|---|
| API-01 | Create first draft with expected generation/version | 200; version 1; canonical payload; one row. |
| API-02 | Two concurrent first saves | One succeeds; other receives conflict, never generic 500. |
| API-03 | Update with current version | Version increments exactly once. |
| API-04 | Update with stale version | Conflict returns latest; row remains unchanged. |
| API-05 | Save foreign profile media/preset | References rejected; no cross-profile data returned. |
| API-06 | Save inactive/excluded/unshareable media | Canonical rules reject and return structured repairs. |
| API-07 | Save invalid/closed agency board | Removed with repair detail. |
| API-08 | Read draft as another talent | 404/null; no existence or payload leak. |
| API-09 | Read/write as agency role or unauthenticated | 403/401. |
| API-10 | List three drafts | All returned, deterministic newest-first, with agency and lifecycle metadata. |
| API-11 | Latest draft is unavailable/expired | Resume query skips it; list still exposes it with reason. |
| API-12 | Delete with current precondition | Deleted/tombstoned once; result identifies deletion. |
| API-13 | Delete with stale precondition | Conflict; draft remains. |
| API-14 | Repeat same delete request | Idempotent documented result; no false “new deletion.” |
| API-15 | Old client saves after delete | Tombstone conflict; no resurrection without recovery. |
| API-16 | Recover within grace | New active generation or restored tombstone; content preserved. |
| API-17 | Recover after purge | Not recoverable; clear result. |
| API-18 | Expiry job at boundary | Correct timezone-independent transition; repeat job idempotent. |
| API-19 | Submit with current draft version + consent | Application/package/message conversion atomic; draft retired. |
| API-20 | Submit with missing/stale version | Rejected; no application or draft deletion. |
| API-21 | Submit without consent | Rejected server-side. |
| API-22 | Save occurs during submit transaction | One operation wins; loser gets conflict; no split state. |
| API-23 | Retry submitted idempotency key | Same application result; no generic unique failure. |
| API-24 | Any insert/package/message failure | Transaction rolls back; draft remains active. |
| API-25 | Reapply after withdrawal | Existing journey is revived intentionally; correct package retained; draft retired. |
| API-26 | Monthly limit reached | Submit rejected; draft remains resumable. |
| API-27 | Block agency after drafting | Resume is read-only/unavailable; submit/save rejected; delete allowed. |
| API-28 | Agency removed/inactivated | Draft remains manageable and never vanishes silently. |
| API-29 | Export talent data | Active/recoverable drafts included as defined. |
| API-30 | Delete account | Server drafts cascade; device cleanup contract is triggered. |
| API-31 | Future schema version | Preserved and rejected safely; never overwritten as v1. |
| API-32 | Oversized/malformed payload | Bounded validation error; service remains healthy. |

Run concurrency tests with real parallel database connections on PostgreSQL,
not only sequential Supertest calls.

### Client lifecycle tests

| ID | Scenario | Expected result |
|---|---|---|
| UI-01 | Select agency, edit, idle 1.5 seconds | `Unsaved changes → Saving… → Last saved`; server has exact current step/payload. |
| UI-02 | Edit repeatedly during in-flight save | Writes serialize; final server fingerprint matches UI. |
| UI-03 | Next/Back checkpoint | Destination step is saved; failed save remains visible. |
| UI-04 | Refresh after successful save | Exact agency, step, and valid selections restore. |
| UI-05 | Refresh before debounce | Local recovery restores; server catches up after hydration. |
| UI-06 | Close tab before debounce | Supported browsers warn only while unsaved; reopening recovers local copy. |
| UI-07 | Mobile app switch then kill | Progressive saves limit loss; result documented per browser. |
| UI-08 | Browser Back/sidebar navigation while dirty | Save flushes or navigation confirmation prevents silent device-switch loss. |
| UI-09 | `Save and exit` while dirty | Waits for server success, then navigates to `/applications`. |
| UI-10 | `Save and exit` while save fails | Does not exit; clear retry/local-durability state. |
| UI-11 | Read error before hydration | Editing blocked; button wording does not claim to save. |
| UI-12 | Reconnect after failed save | Automatic retry succeeds without another edit. |
| UI-13 | localStorage unavailable + network failure | No false recovery promise; high-visibility blocking guidance. |
| UI-14 | Two devices edit | Stale device receives conflict; neither copy overwritten. |
| UI-15 | Conflict screen keyboard/screen reader | Focus/announcement moves to conflict; choices and consequences clear. |
| UI-16 | Choose local version | Saves against latest generation/version only after explicit choice. |
| UI-17 | Choose server version | Local dirty copy is retired; server content shown exactly. |
| UI-18 | Agency board/image/preset removed after save | Resume explains repairs and points to affected steps. |
| UI-19 | Change package after checking consent | Consent resets if defined as package-specific. |
| UI-20 | Last-saved time in New York, Los Angeles, Tokyo | Same instant formatted in each browser's locale/time zone. |

### `/applications` tests

| ID | Scenario | Expected result |
|---|---|---|
| APP-01 | No drafts/no applications | Honest empty state and `Apply New` opens chooser. |
| APP-02 | Draft but no submission | Draft section visible; history still says no submitted applications without contradiction. |
| APP-03 | Multiple drafts | Every draft appears once, newest-first. |
| APP-04 | Continue draft | Opens exact agency and saved step. |
| APP-05 | Apply New with drafts present | Opens chooser; never silently resumes. |
| APP-06 | Agency discovery has a draft | Action says `Continue application`; no duplicate draft is created. |
| APP-07 | Submitted application | Appears only in history; corresponding draft disappears atomically. |
| APP-08 | Delete draft | Confirmation names agency; cancel is safe; confirm removes row and local copy; undo works if supported. |
| APP-09 | Delete conflict from another device | No success toast; latest state is offered. |
| APP-10 | Expiring/expired draft | Advance notice, recovery status, and deadlines are clear. |
| APP-11 | Inactive/blocked agency draft | Visible with explanation; resume disabled; delete/export available. |
| APP-12 | Counts/filters/monthly limit | Drafts never inflate submitted metrics. |
| APP-13 | Draft list load failure | Submitted history remains usable; draft error is scoped and retryable. |
| APP-14 | Keyboard/mobile layout | Continue and delete are reachable, ordered, and do not rely on hover. |

### Security, privacy, and resilience tests

| ID | Scenario | Expected result |
|---|---|---|
| SEC-01 | Logout with local draft | Current profile's local draft and client identifier are removed/rotated per policy. |
| SEC-02 | Shared browser logs into another account | Prior account draft content is inaccessible. |
| SEC-03 | Account deletion | Server and local draft data removed; export before deletion contains drafts. |
| SEC-04 | Authenticated draft GET through browser/proxy cache | Responses are private/no-store as appropriate. |
| SEC-05 | Note contains script/markup | Stored as text and safely rendered everywhere. |
| SEC-06 | Tampered agency/profile/media IDs | Authorization and ownership enforcement hold. |
| SEC-07 | localStorage quota/security exception | UI accurately reports durability and remains usable. |
| SEC-08 | Save endpoint load test | Debounce and rate controls keep latency/error rate within SLO. |

### Accessibility tests

- Save state changes are announced without moving focus
  ([W3C status message guidance](https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html)).
- Save failures are programmatically exposed, not color-only.
- Delete confirmation receives focus, traps it correctly, and returns focus on
  cancel/complete.
- Conflict replacement receives a heading announcement.
- All actions have visible focus, 44px mobile targets where practical, and
  stable accessible names.
- `Saving…`, `Saved`, `Save failed`, expiry, and deletion are understandable
  without icons, badges, or status dots.

## Automation plan

1. Refactor `tests/talent/application-drafts.test.js` so each test owns its
   setup and does not depend on prior versions created by earlier tests.
2. Add backend suites:
   - `application-draft-crud.test.js`
   - `application-draft-concurrency.test.js`
   - `application-draft-lifecycle.test.js`
   - `application-draft-authorization.test.js`
   - `application-draft-retention.test.js`
   - `application-submit-idempotency.test.js`
3. Add client state-machine tests with fake timers and mocked network/storage:
   - hydration selection;
   - debounce/serialization;
   - local write failure;
   - reconnect retry;
   - conflict choices;
   - consent invalidation;
   - navigation flush.
4. Add component tests for `/applications` draft list, counts, resume, delete,
   unavailable, expired, and partial-load-error states.
5. Add Playwright journeys for refresh, two contexts, offline/reconnect,
   browser Back, delete/undo, submit conversion, and local time zones.
6. Run PostgreSQL concurrency/retention tests in CI in addition to SQLite.

## Release gates

Do not call the draft system complete until:

- P0 findings are fixed and regression-tested.
- `/applications` lists every manageable draft separately from submissions.
- Resume and Apply New have distinct, truthful actions.
- Conditional delete, intentional confirmation, local cleanup, and recovery
  semantics pass.
- Retention/expiry policy and cleanup exist end to end.
- Logout, account deletion, and data export cover drafts.
- Offline, refresh, SPA navigation, mobile lifecycle, and two-device tests pass
  to documented expectations.
- Save failures and conflicts are observable in production.
- PostgreSQL concurrency tests pass.

## Audit evidence

Verified in this audit:

- `npm run migrate:status`: 122 completed, zero pending.
- `npm test -- --runInBand tests/talent/application-drafts.test.js`: 3/3 pass.
- Isolated synthetic lifecycle probe:
  - create version 1 succeeds;
  - wrong-version delete returns success but retains the row;
  - 31-day-old draft is stale but resumable;
  - current-version delete removes the row;
  - repeated delete returns the same success response.
- `npm run client:build`: passes; existing large-chunk warning remains.
- Local database aggregate at audit time: 2 drafts for 1 synthetic/development
  profile, none older than 30 days, none colliding with a submitted application,
  none attached to an inactive agency. This tiny sample is not production
  evidence.

Not verified:

- Interactive browser journeys and screenshots. The in-app browser connection
  failed before a tab could be opened.
- Production data health.
- PostgreSQL race behavior.
- Mobile browser lifecycle behavior.

