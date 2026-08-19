# Pholio Talent Trust Loop — Technical Design (Phase 6)

**Status:** APPROVED with lead rulings (§R). Implementation lanes execute this document.
**Scope authority:** `docs/pholio-strategic-analysis-2026-08.md` §7.4 (tracker + auto-lapse), §8.4/§9.6-2 (verification rail), §9.2 (open-call calendar), §9.2 "Remove" (reference-entry conversion). Designed against the code at `4cb336c`.

## 0. Verified ground truth

| Fact | Evidence |
|---|---|
| Exports are already recorded per profile/agency/date | `spec_registry_engagement_events` (`migrations/20260814130000:24-54`): `series_id · agency_id(nullable) · profile_id · event_type('export'\|'outbound_click') · revision_id · file_count · created_at`. Write-only telemetry — no per-profile read path, no UI. |
| Auto-close pattern to mirror | `src/shared/lib/application-auto-close.js`: `DEFAULT_REVIEW_WINDOW_DAYS=30`, `status_changed_at` anchor, `closed_no_response` excluded from writable statuses; display copy in `client/.../utils/applicationStatus.js:172-180` ("Treat this as a pass…"). |
| Off-platform submissions | **Nothing exists.** No table, no read API, no response-policy data in the spec pack, no merged UI. |
| Reference-entry conversion (plan §9.2) | **NOT DONE.** `seeds/seed.js:24-146` seeds 8 real agencies (Wilhelmina, IMG, Elite, Ford, DNA, The Society, Next, Marilyn) as `status='ACTIVE'`, wires 5 into `spec_registry_agency_routes` (→ `acceptsPholioSubmissions:true`), and seeds demo applications against them. |
| Applyable-vs-reference already exists at the spec-registry layer | `preflight-service.js:397-433` `deliverableSeriesIds()` requires an ACTIVE `agencies` row via `spec_registry_agency_routes`; client splits via `partitionRoutes()` (`specRegistry.js:88-93`). AgencyPlate already renders plain-text "Verified on {date}", reference copy, provenance disclaimer, outbound CTA. |
| `agencies` has zero verification fields | Full schema walked; no cert/registration/official-URL columns. `org_kind` (`agency`\|`event_organizer`) is the platform-set-vocabulary precedent to follow; `agency_type` is self-declared display copy (never authorization-bearing). |
| `GET /api/talent/agencies` does not filter `org_kind` | `src/domains/talent/routes/agencies.js:28` filters `status='ACTIVE'` only — flagged as a known gap in `migrations/20260815093000:15-16`. |
| NY DOL registry is live and fetchable | Socrata `hder-iq9y`: **75 rows retrieved 2026-08-15** with `certificate_number, business_name, dba, address, model_management_business_type, issue_date, expiration_date, status`. Includes DNA, Elite, Ford, IMG, Muse, Next, The Society, Wilhelmina, Women, State, Que Management. Raw snapshot captured (committed under `data/trust-registry/` as evidence). |
| No schedule/time model anywhere | Spec pack `scope.channel.type` enum includes `official_walk_in` but no fields for recurring days/times; no time-of-day formatter exists in the talent client (date-only precedents: `formatRegistryDate`, `formatDateRange` UTC-midnight idiom). |
| Curated-pack pipeline precedent | `data/spec-registry/v1/` + `scripts/{validate,sync,map}-spec-registry*.js` + `npm run release:spec-registry` (validate → sync → map → verify, idempotent, drift-checked). |
| Vocabulary collision | "Open call" already means Pholio's agency intake-link feature (`agency_open_call_links`, `pholio_open_call` channel). Code for the calendar must use a distinct namespace (`call_windows`). |
| Daily job host | `netlify/functions/cleanup-application-drafts.js` (`@daily`) runs draft cleanup → package redaction → auto-close → returned_d30. **Not needed for this phase** (see R1). |

## (a) Data model — three new tables + one conversion migration (Lane 0)

Idioms: `age_verifications` (`20260809130000`) for talent-owned tables; `jsonColumn`/`createTableIfMissing` helpers from `20260810120000:3-22`; guard per object; dual-dialect.

### M1. `off_platform_submissions`
```
id uuid pk
profile_id uuid NOT NULL FK profiles ON DELETE CASCADE
series_id string NULL FK spec_registry_series(series_id) ON DELETE SET NULL
agency_name varchar(160) NOT NULL          -- denormalized; survives registry changes, supports unlisted agencies
channel varchar(32) NOT NULL DEFAULT 'official_web_form'   -- spec-pack channel vocabulary + 'other'
destination_url varchar(500) NULL
submitted_on date NOT NULL
sent_summary json NULL                     -- {revisionId, fileCount, exportEventId} when logged from an export; else null
note varchar(500) NULL
status varchar(24) NOT NULL DEFAULT 'awaiting'   -- awaiting | heard_back | closed_by_talent
outcome_note varchar(300) NULL
review_window_days integer NOT NULL DEFAULT 30
status_changed_at timestamp NOT NULL DEFAULT now
created_at / updated_at
index (profile_id, submitted_on) · index (profile_id, status)
```
No lapse status is stored — see R1.

### M2. `agency_verifications` (platform-curated; org_kind precedent, never self-declared)
```
id uuid pk
registry varchar(24) NOT NULL              -- 'ny_dol' (closed vocabulary, constants both sides)
organization_id varchar(120) NULL          -- spec-registry organization slug (reference entries)
agency_id uuid NULL FK agencies ON DELETE SET NULL   -- live Pholio agencies
legal_name varchar(200) NOT NULL
dba varchar(200) NULL
certificate_number varchar(64) NOT NULL
registered_on date NULL
expires_on date NULL
registry_status varchar(24) NOT NULL DEFAULT 'active'
official_site_url varchar(500) NULL
official_apply_url varchar(500) NULL
evidence_url varchar(500) NULL             -- Socrata row / source capture
retrieved_on date NOT NULL                 -- when the registry row was pulled
verified_on date NOT NULL                  -- when a human matched it to this org
notes varchar(500) NULL
created_at / updated_at
UNIQUE (registry, certificate_number)
index (agency_id) · index (organization_id)
```
App-level invariant (validator + sync): at least one of `organization_id`/`agency_id` set.

### M3. `agency_call_windows` (recurring open-call hours; distinct namespace per collision note)
```
id uuid pk
organization_id varchar(120) NULL
agency_id uuid NULL FK agencies ON DELETE SET NULL
display_name varchar(160) NOT NULL         -- "Muse Management" (denormalized for the Overview card)
label varchar(120) NOT NULL                -- "Walk-in open call"
weekday integer NOT NULL                   -- ISO 1=Monday … 7=Sunday (constant both sides)
start_minute integer NULL                  -- minutes from local midnight; NULL = day published, time not
end_minute integer NULL
timezone varchar(64) NOT NULL DEFAULT 'America/New_York'
location varchar(200) NULL
instructions varchar(500) NULL             -- "bring unretouched digitals; no heavy makeup"
source_url varchar(500) NULL
verified_on date NOT NULL
active boolean NOT NULL DEFAULT true
created_at / updated_at
index (organization_id) · index (agency_id) · index (active, weekday)
```

### M4. Reference-entry conversion (data migration)
- The 8 seeded real agencies (matched **by slug**, guarded — skip silently if absent): `status = 'REFERENCE'` (agencies.status is a plain string, no CHECK — verify in-lane before relying on it).
- Delete their `spec_registry_agency_routes` rows (deliverability requires ACTIVE anyway; removing the mapping keeps the map-script drift check clean).
- `down()` restores `ACTIVE` + re-inserts mappings for the 5 previously mapped.
- Companion (Lane A2, not the migration): `GET /api/talent/agencies` filters `status='ACTIVE' AND org_kind='agency'` — fixes the flagged org_kind gap in the same pass. `seeds/seed.js` switches demo data to a fictional applyable agency; real names live only in the spec pack + trust registry as reference entries.

## (b) Trust-registry pack (one pipeline for verifications + call windows)

`data/trust-registry/v1/`:
```
schemas/verification-entry.schema.json
schemas/call-window.schema.json
raw/nydol-hder-iq9y-2026-08-15.json      -- committed Socrata snapshot (75 rows), evidence only
verifications/*.json                      -- curated entries, one file per organization
call-windows/*.json
```
Scripts (spec-registry idiom): `scripts/validate-trust-registry.js`, `scripts/sync-trust-registry.js` (upsert by natural key, delist rows absent from the pack), `npm run release:trust-registry` = validate && sync (+ `--verify-only` mode). Sync is idempotent and advisory-locked like the spec-registry publisher.

Curation source: the committed raw snapshot. Entries carry the real `certificate_number`, `issue_date`→`registered_on`, `expiration_date`→`expires_on`, `evidence_url` pointing at the Socrata dataset, `retrieved_on: 2026-08-15`. Seed coverage: the organizations already in the spec pack (Elite, Wilhelmina, IMG, Ford, DNA, The Society, Next, Marilyn, Muse, State — as present in the registry) plus call-window entries for Muse (Thu 3–4pm), Que Management (Thu 10–11am), MSA (Tue, time unpublished → start_minute NULL). MSA has no registry row — call windows and verifications are independent overlays.

## (c) Server surfaces

- **Tracker CRUD** (Lane A1), all under `requireAuth`+TALENT, own router `src/domains/talent/routes/tracker.js`:
  ```
  GET    /api/talent/tracker                 → list (profile-scoped, newest first)
  POST   /api/talent/tracker                 → create {agencyName, seriesId?, channel?, destinationUrl?, submittedOn, sentSummary?, note?}
  PATCH  /api/talent/tracker/:id             → status/note/outcome edits (talent-writable statuses only)
  DELETE /api/talent/tracker/:id             → hard delete (talent-owned record)
  ```
  Lapse math lives in `src/shared/lib/submission-lapse.js` as pure functions (`isLapsed`, `lapseDate`, `reapplyOpensOn`) — shared constants, no writes (R1). Client mirrors the computation for display.
- **Trust data rides existing payloads** (Lane A2):
  - `preflight-service.js` `routeDto()` gains `verification: {registry, certificateNumber, expiresOn, registryStatus, verifiedOn} | null` and `callWindows: [...]` joined via `organization_id`.
  - `GET /api/talent/agencies` gains the same `verification` object per live agency (join by `agency_id`).
  - `GET /api/talent/call-windows` → all active windows w/ display names (feeds the Overview card without dragging the preflight payload in).

## (d) Client surfaces

**Applications hub (Lane C):**
- `ApplicationsView.jsx` "Submission history" merges tracker rows with on-Pholio applications into one ledger (single chronology, shared filter tabs; off-platform rows carry the plain line "Submitted on their site"). New `utils/submissionTracker.js` mirrors `applicationStatus.js` (`statusConfig`-style labels; lapse copy mirrors `closed_no_response`: *"No response — industry convention says treat as a pass. Re-apply window opens ⟨date⟩."*).
- "Log a submission" action on the Applications page → overlay form (agency picker fed by registry routes + free text, date, channel, note). Edit/close/heard-back from the row detail.
- `api/talent.js` gains tracker methods (contract: `listTrackedSubmissions`, `logTrackedSubmission`, `updateTrackedSubmission`, `deleteTrackedSubmission`).

**Requirements ledger + Apply (Lane B):**
- `AgencyPlate.jsx`: verification line (plain text, `plateVerified` idiom): *"NYSDOL-registered · Cert 26-69XXX-LSFW · expires Mar 2028"*; official-channel line stays the existing `sourceUrl` CTA — verification confirms it (*"Registry-verified official channel"* when both present). Call-window line when known: *"Open call: Thursdays 3–4 PM ET · 35 W 36th St"*. Post-export prompt: after a successful export, one inline line + button — *"Submitted it? Log it in your tracker."* → calls Lane C's `logTrackedSubmission` with `{seriesId, agencyName, sentSummary}` prefilled.
- `RequirementsPage`: "This week" strip above the ledger — the curated call windows ordered by next occurrence (Section idiom, `<em>` emphasis, no chips).
- `specRegistry.js` `readRoute()` gains `verification`, `callWindows`, **and `channelType`** (queued backlog item) + email-route plate copy branch ("Applies by email — we prepare the message and attachments").
- `ApplyExperience.jsx` agency dossier: verification line for live agencies (from `/api/talent/agencies` payload).

**Overview (Lane C):** "Open calls this week" card in the existing `ov-col` grid — next 2–3 windows as plain text rows, links to the requirements page. Ungated, free, no counters.

**Time rendering (both B and C via one new shared util `client/src/domains/talent/utils/callWindows.js` — owned by B, imported by C):** format in the window's own timezone with tz label (*"Thu · 3–4 PM ET"*), `Intl.DateTimeFormat` with `timeZone`, ISO-weekday constant. Date-only precedents deliberately don't apply — this is the first wall-clock surface.

## (e) Lanes — strict disjoint ownership, workers never commit, lead integrates

**Lane 0 · Schema & constants** (lands ALONE, first). Owns: migrations M1–M4 · `src/shared/constants/submission-tracker.js` (statuses, `DEFAULT_TRACKER_WINDOW_DAYS=30`, `REAPPLY_CONVENTION_MONTHS=6`, channel vocab, registries, ISO weekdays) · client mirror `client/src/shared/constants/submissionTracker.js` · `tests/migrations/trust-loop-schema.test.js`. Contract = exact columns above + constants exports. No other lane writes a literal `'ny_dol'` or status string.

**Lane A1 · Tracker server** (after 0). Owns: `src/domains/talent/routes/tracker.js` · `src/shared/lib/submission-lapse.js` · tests (`tests/talent/tracker.test.js`). Exports the CRUD contract in (c). Does NOT touch routes `index.js` — lead wires the mount.

**Lane A2 · Trust registry server + directory honesty** (after 0, ∥ A1). Owns: `data/trust-registry/v1/**` (schemas, raw snapshot, curated entries) · `scripts/validate-trust-registry.js` + `scripts/sync-trust-registry.js` · `package.json` script entries · `src/domains/spec-registry/preflight-service.js` (DTO extension) · `src/domains/talent/routes/agencies.js` (filter fix + verification join) · new `src/domains/talent/routes/call-windows.js` · `seeds/seed.js` (fictional demo agency conversion) · tests. Raw snapshot source: `scratchpad/nydol-registry-raw-2026-08-15.json` (copy into pack as `raw/`).

**Lane B · Requirements/Apply client** (after A1+A2 land). Owns: `client/src/domains/talent/lib/specRegistry.js` · `RequirementsPage/**` (incl. AgencyPlate) · `client/src/domains/talent/utils/callWindows.js` · `ApplyPage/ApplyExperience.jsx` (verification line only — one bounded edit) · tests.

**Lane C · Applications/Overview client** (∥ B). Owns: `client/src/domains/talent/components/ApplicationsView.jsx` (+css) · new tracker overlay components · `client/src/domains/talent/utils/submissionTracker.js` · `client/src/domains/talent/api/talent.js` · `OverviewPage/**` (one new card) · tests.

Critical path: **0 → (A1 ∥ A2) → (B ∥ C)**. Lead: per-lane pathspec commits, full-suite + lint + build verification at each wave, push, todo.md update. Workers NEVER `git stash`.

## (R) Lead rulings (2026-08-15, binding)

| # | Question | RULING |
|---|---|---|
| R1 | Lapse: server job vs display-time | **Display-time computation only.** Pure functions from stored `submitted_on + review_window_days`; no daily job, no stored lapse status, nothing to drift. Matches "client-side convention" framing in the plan. Re-apply date = `submitted_on + 6 months` (convention constant). If reminders ship later, a job can be added without schema change. |
| R2 | "Which digitals version" | No new versioning system. `sent_summary` json captures `{revisionId, fileCount, exportEventId}` when the row is logged from a conforming export; null for manual logs. Honest and cheap. |
| R3 | Verification absence | **Positive-only display.** The registry is young (75 rows; majors registered late). Absence renders nothing — no "unverified" copy, no negative inference. The impersonation defense is the positive claim. |
| R4 | Data integrity | **Never fabricate registry data.** Pack entries come only from the committed Socrata snapshot (real certificate numbers, retrieved 2026-08-15). Organizations absent from the registry get no verification entry. Fabricated cert numbers on real agencies would be a trust catastrophe. |
| R5 | Reference conversion mechanism | `status='REFERENCE'` on the 8 seeded real agencies + mapping-row removal (M4) + `ACTIVE AND org_kind='agency'` filter in the directory route (A2). No new column: existing machinery (deliverability requires ACTIVE) already produces the correct reference UX, fully built in AgencyPlate. |
| R6 | Calendar vocabulary | Talent-facing label "Open calls" (the industry term); code namespace `call_windows`/`callWindows` everywhere to avoid the `pholio_open_call` collision. |
| R7 | Tracker home | One merged ledger in ApplicationsView (the "30-agency list" productized), not a separate page. Entry points: Applications-page action + post-export prompt in AgencyPlate. |
| R8 | Calendar homes | AgencyPlate per-agency line + RequirementsPage "This week" strip + Overview card. No new nav item, no new route. |
| R9 | Tracker deletion | Hard delete allowed — this is the talent's own private record (unlike on-Pholio applications, which involve an agency counterparty). |

## Folded-in backlog items
- `readRoute` gains `channelType` + email-route plate copy (Lane B) — from the standing follow-up list.

## Explicitly deferred
- Per-agency response-policy data in the spec pack (only Storm publishes one; the 30-day convention constant is the honest v1 — `review_window_days` is stored per row so future data slots in without migration).
- Re-apply push/email reminders (needs the job; display-only this phase).
- Verification display on the agency-side dashboard (talent-side first; agencies see their own registration in Settings later).
- Live Socrata re-sync automation (quarterly manual re-pull per the "verification day per month" budget in the plan; the pack pipeline makes it a 10-minute task).
