# Product plan 2026-08 — implementation log

Source: [`docs/pholio-product-plan-2026-08.md`](../docs/pholio-product-plan-2026-08.md).
Working through its **Sequencing** section in order: compliance → removals → defects →
the wedge.

---

# Phase 1 — Compliance ✅ shipped

A2 fixes 1–8, 10, 11 plus the C1 discovery-cap tripwire. The governing rule is now true
in code:

> Anything an agency sees is identical for every talent. Payment may only change what the
> talent keeps for themselves.

- [x] **A2-1** Agency directory truncated to 20 for free users
- [x] **A2-2/3** Comp card watermark (reading `"ZipSite"`) on free cards
- [x] **A2-4** QR code Studio+ only
- [x] **A2-5** Agency logo Studio+ only (render **and** the three upload/set/delete routes)
- [x] **A2-6** Socials hyperlinked for Studio+ only
- [x] **A2-7** "Advanced" stats Studio+ only — and the whole extended-content block with it
- [x] **A2-8** Social URL generation degraded for free users
- [x] **A2-10** Open-call submissions capped at 3/month
- [x] **A2-11** Quota rationale contradicted itself
- [x] **C1-1** Studio+ lifted the discovery cap (Cal. Lab. Code §1701 tripwire)
- [x] **Sweep** `pool-status.js` gated *discovery visibility* on `is_pro` — found by grepping
      the flag rather than the plan's line numbers, exactly as A2 predicted

**Deliberately out of scope:** A2-9 (the plan rates it acceptable), PDF theme and
card-design gating and the talent's own analytics window (A1 lists both as legitimate
Studio+).

---

# Phase 2 — Removals 🔄 in progress

## Shipped

- [x] **Booking Desk** — commitments write API, calendar page + test, nav, `calendar.view` /
      `calendar.manage`. `talent_commitments` kept: the dossier, roster-data and (then) the
      matching engine read it defensively. Nothing writes it.
- [x] **Commission code** — `commissionRate` (zero readers) and the dead `.st-split*` CSS.
- [x] **Off-platform minor records** — intake now rejects under-18 with 422 instead of
      storing `minor_consent_status: "pending"`; an edit cannot turn an adult record minor.
- [x] **Match scoring / AI ranking engine** — the whole `domains/matching` tree, its three
      routes, `matching.*` permissions, the Fit Briefs panel and board view switch.
- [x] **`casting_briefs`** — dormant with zero writers, dropped with a `down()` that rebuilds
      the schema.
- [x] **Interviews and reminders as a scheduling system** — both routers, the talent-side
      responder, both pages, the dossier Owed sheet, the follow-up tab, eleven permissions,
      and the copy that promised any of it. `meeting_requested` survives as a *status*, so an
      agency can still say it wants to meet.
- [x] **Agency market analytics** — season query layer, both analytics endpoints (including
      the older one buried in `inbox.js`), the Season page and its 13 viz components,
      `org.view_analytics`. This was the last reader of the retired interviews/reminders
      tables.
- [x] **Legacy archetype / vibe / market-fit AI** — the onboarding chat engine and the Scout
      image analyser (already unreachable), plus the archetype vocabulary and mock
      photo-analysis modules. Two of these were non-compliant, not merely unused: Scout
      scored *facial symmetry*, and the chat engine derived a vibe score and market tags from
      it. The compliant shot classifier is untouched.

## Still open

- [x] **Residual match scoring** — removed board score calculation/recalculation, scoring
      weights, score permissions and displays, Discover retrieval/reranking, rollout config,
      evaluation scripts and score-bearing API fields. Discover still accepts a natural-language
      brief: it converts the brief into declared factual constraints, filters strictly on those
      facts, and orders survivors deterministically by name, city or newest with stable tie-breaks.
- [x] **Roster memberships and board standings as an ongoing system of record** — Pholio now
      ends at the representation decision. The roster page, CRUD routes, membership-sync
      writers, standing editor, roster permissions, setup migration path, dossier comparisons,
      and roster-derived overview KPIs are gone. Application outcomes and applicant-routing
      boards remain; agencies continue onboarding and roster operations in their own systems.
- [x] **Intel / analytics pages inferring intent from view counts** (A3) — revised, not
      remove. Keep Intel and analytics as talent-owned tools, restore the surface, and replace
      unsupported intent/attention/momentum claims with attributable first-party traffic,
      application outcomes, material usage, and clearly labeled factual trends.
- [x] **"Verified adult" state with no verification behind it** (A3) — built a real age-
      verification layer behind the state; do not remove the capability. Adult-context data
      remains private and requires explicit, opportunity-specific sharing consent.
- [x] **Gamification and profile-strength theatre** (A3). The reveal page is already gone —
      `/reveal` and `/dashboard/talent/reveal` are redirects only.
      - [x] Removed percentages, score labels, thresholds, and animated strength meters.
      - [x] Kept only factual submission essentials and named missing-material guidance.
      - [x] Removed score-bearing overview API fields, fabricated agency match recommendations,
            and obsolete strength presentation code.
      - [x] Verified focused readiness contracts, client tests, lint, and build.

## Residual match-scoring decision — resolved

A4 **keeps** Discover ("Invite to Apply — from opt-in talent discovery") while the removal
list kills "match scoring and all AI ranking". Discover currently orders results by a
computed `match_score` via `discover-rerank.js`. Removing the score without deciding the
replacement ordering would leave the surface with no defined order.

There is a house precedent for the answer. `talent/routes/agencies.js` carried this comment
before this branch touched it:

> Match scoring is intentionally absent until it is backed by real signals. A stable
> directory order is more useful than fabricated affinity.

Confirmed product direction: **natural-language Discover stays**. The language parser may
translate a written brief into declared factual constraints; it may not produce affinity,
similarity, suitability or face-based ranking. Discover keeps filtering on real facts
(eligibility, boards, location and declared measurements), drops scores and reranking, and
orders matching talent deterministically.

---

# Phase 3 — Defects (A5) — complete

Application status machine (`booked` → `represented` consolidation, `NOTIFY_STATUSES`
missing `represented`), the submission-receipt gap in `inbox.js`, blocked agencies not
enforcing, the safety report passing the reporter's own `user_id` as target, and account
deletion reporting success when `fullyErased: false`.

## A5 defect closure

- [x] **Frozen submission receipts** — agency application details prefer the immutable
      submitted profile and media package over the talent's current live profile, expose the
      submission timestamp, preserve the historical receipt after a later block, and reject
      withdrawn or redacted packages.
- [x] **Blocked-agency enforcement** — blocks resolve against stable agency IDs while retaining
      legacy name/slug compatibility; blocked talent are excluded before Discover totals and
      pagination, and direct preview also fails closed. Settings can still name and remove a
      blocked agency without offering it as a submission destination.
- [x] **Safety-report target integrity** — the generic report flow asks for the actual account,
      agency, portfolio, message, application, or content target instead of pre-filling the
      reporter's own user ID; the API rejects a self-targeted user report.
- [x] **Truthful account deletion** — complete erasure returns 200 and a normal signed-out state;
      provider-pending erasure returns 202 with `fullyErased: false`, a pending status, and a
      persistent warning after sign-out rather than claiming deletion completed.

## Application status consolidation

- [x] Make `represented` the only agreement-complete application status accepted by writes.
- [x] Keep `accepted` as offer / moving forward and distinguish it from representation.
- [x] Remove legacy `booked` application readers, counters, labels, and client groupings.
- [x] Notify talent when an application reaches `represented`.
- [x] Add regression coverage and verify backend/client status consumers.

### Application status review

- Backend and client now share explicit offered (`accepted`) and represented
  (`represented`) vocabularies. Single and bulk status writes reject legacy `booked`.
- Agency pipelines, board counts, overview data, dossier actions, talent standing,
  Intel outcomes, notification copy, and status email copy distinguish an offer from a
  completed agreement. Genuine client booking / availability uses of `booked` remain.
- Focused backend coverage: 53/53 passing. Client: 27 files / 197 tests passing; lint
  has only the pre-existing React Hook Form compiler warning; production build passes.
- Full backend remains red outside this slice: the five known suites plus two untouched PDF
  suites (local Chrome unavailable; editions route returns its existing 400), for 7 suites /
  42 tests after keeping the seed-dependent notifications suite unchanged.

### Phase 3 review

- Focused A5 coverage passes **68/68** across Discover blocking, stable block identity,
  application receipts, moderation, deletion response semantics, and Settings contracts.
- Full client Vitest passes **197/197**; client lint is clean and the production build succeeds.
- Full backend passes **1,942 tests** and remains at the branch's established environmental /
  seed baseline: **6 suites / 41 tests** (Intel, app, overview, password-change notification,
  missing notifications migration state, and Chrome-less PDF rasterization). No A5-focused
  suite regressed.

# Phase 4 — The wedge (Part B) — in progress

Spec Registry → Spec Builder → talent-side preflight → guided capture → freshness engine →
auto-close.

## Spec Registry v1 dataset foundation

- [x] Read the product plan and map the existing requirements, media, signals, and application
  snapshot seams.
- [x] Research current official submission requirements and provenance/versioning practices.
- [x] Define the versioned registry contract, canonical taxonomy, and evidence rules.
- [x] Add four source-backed seed specs: Elite Models North America, Elite Model Management
  global, Elite Japan, and Models 1 UK.
- [x] Add schema, referential-integrity, and semantic validation tests.
- [x] Run focused verification and complete an independent architecture/data review.
- [x] Record implementation decisions and verification results below.

### Spec Registry v1 review

- The first slice is a standalone immutable data package, not a database/API/UI integration.
  A series is scoped by organization, office/market, channel, and applicant track; the manifest
  selects the latest revision without deleting history.
- Four first-party seed revisions are included: Elite Models North America, Elite Model
  Management's global route, Elite Japan Tokyo, and Models1 UK. All are dual-reviewed and
  advisory; only assertion-linked agency confirmation can authorize future blocking behavior.
- Unknown facts are controlled taxonomy entries rather than free-form paths. Public silence is
  represented explicitly and never treated as optional, unrestricted, or satisfied.
- The final strong review found and drove fixes for negative-rule polarity, unknown-fact drift,
  per-assertion blocking provenance, obsolete manifest pointers, stale review deadlines,
  KB/MB normalization, false timestamp precision, generic Hair/Eye fields, and the exact
  Models1 slim-fitting-jeans concept. Its regression pass is clean.
- `npm run validate:spec-registry` passes: **4 current series / 4 revisions / 63 taxonomy
  fields / 26 unknown facts**.
- Focused Jest passes **14/14**. All JSON parses, Node syntax checks pass, Ajv dependencies
  resolve, and scoped `git diff --check` is clean. The full application suite was not rerun for
  this isolated data-and-validator slice.

## Spec Registry v1 ten-route coverage expansion

- [x] Recover the six remaining researched routes from the product-plan provenance.
- [x] Re-check each route against current first-party web sources; do not use the industry skill.
- [x] Extend the controlled taxonomy only for source concepts that the existing vocabulary cannot
      represent without loss.
- [x] Add immutable advisory revisions for Ford, Storm, The Society, Muse, Wilhelmina, and IMG.
- [x] Update the manifest, validation fixtures, and coverage assertions for ten current routes.
- [x] Run focused validation and complete an independent source/normalization review.

### Coverage-expansion decisions

- The intended six are Ford's selected-city agency-branded Snapcast intake, Storm UK/London's
  online form, The Society's New York online form, Muse New York's email submission route,
  Wilhelmina's selected-market form, and IMG's global Get Scouted route. This follows the product
  plan plus its earlier committed market-research memo; uncited legacy migration backfills are not
  source evidence.
- Wilhelmina and IMG currently expose only part of their route to non-interactive web retrieval.
  They remain valuable records: published form and eligibility facts are normalized, while gated
  media requirements are explicit controlled unknowns. No prior research claim is carried forward
  when it is absent from the live source.
- The ten-route manifest has seven `verified`, one `conflicting` (Storm), and two `provisional`
  revisions (Wilhelmina and IMG). Every revision remains `advisory`; public or agency-branded
  source wording never authorizes Pholio to block a submission.
- IMG's adult and guardian-first paths were checked in the live official form without submitting
  an application. Adult counts, slots, file rules, and fields are age-scoped; the 14–17 downstream
  step remains source-access-limited. Its captured public validation bundle is pinned by SHA-256
  and split into assertion-specific evidence records.
- The final strong audit drove fixes for Wilhelmina's US-only division options, IMG adult/minor
  scope leakage, and bundle-evidence locators. The validator now rejects known assertions that
  overlap an age scope explicitly marked source-access-limited.
- `npm run validate:spec-registry` passes: **10 current series / 10 revisions / 88 taxonomy
  fields / 28 unknown facts**. Focused Jest passes **22/22**; all JSON parses, the validator's
  Node syntax check passes, Ajv dependencies resolve, and scoped whitespace checks are clean.
  The full application suite was not rerun for this isolated data-package expansion.

---

## Verification standard used throughout

Every slice is checked against a baseline taken at this branch's own HEAD (not the local
`main` ref, which is stale — see `lessons.md`). Before the Intel removal, backend `npm test`
held at **5 pre-existing failing suites / 39 failing tests**: seed-dependent `app`,
`notifications`, `overview-backend`, `intel`, plus `password-changed-notification`.
`same-origin-app` flakes under parallel load on a 5s migration hook and passes in isolation.
The restored Intel suite remains at its pre-existing 18 seed/auth failures and now includes
the revised factual activity contract. Client lint keeps one pre-existing warning in an
untouched file.

The residual-score slice's focused backend checks pass **167/167**, with **12/12** focused
client tests passing. The full local run reported
the same 5/39 baseline plus **2 Puppeteer raster tests** because Chrome 146 is not installed in
the local Puppeteer cache (6 suites / 41 tests total); that environmental PDF failure is outside
this slice.

The roster-role slice's focused backend contracts pass **138/138** (120 route/DTO/RBAC/setup
checks plus the 18-endpoint minor-access inventory), and focused agency client tests pass
**95/95**. Client lint has only the same untouched React Hook Form compiler warning and the
production build succeeds. The quiet full backend run returns the same local **6 suites / 41
tests** described above, with no roster-slice regression.

The Intel/age-verification correction adds **4/4 passing** age-verification service contracts,
including the explicit-consent requirement.
The restored Intel/searchability run passes **12** tests and holds at its pre-existing **18**
seed/auth failures. Client lint has only the same React Hook Form warning, the production
build succeeds, and full client Vitest passes **194/194**. The full backend run before the final
consent contract passed **1,928 tests** and held at the branch's
local **6 suites / 41 tests** baseline: seed/email-verification failures in `app`, `intel`, and
`overview-backend`; the existing notification and password-confirmation failures; and two
Chrome-less Puppeteer raster tests.

The profile-theatre removal keeps readiness as a factual checklist and removes every
talent-facing percentage, strength label, threshold, and progress meter. The two focused
backend readiness suites pass **30/30**; `overview-backend` remains at its known **15**
email-verification/seed failures. Profile UI tests pass **6/6**, full client Vitest passes
**194/194**, client lint has only the existing React Hook Form warning, and the production
build succeeds.

## Spec Registry application integration

- [x] Define the persisted registry, API, deterministic matcher, and talent preflight contracts.
- [x] Add SQLite/PostgreSQL-safe registry revision, publication, and current-pointer tables.
- [x] Publish the authored v1 package into the database idempotently without mutating revisions.
- [x] Add authenticated list/detail/preflight APIs with source freshness and uncertainty intact.
- [x] Match every applicable rule conservatively against real profile/media signals, returning
      explicit satisfied, missing, conflict, manual-review, and unknown outcomes without a score.
- [x] Build the talent-facing agency-requirements workspace with loading, error, empty, mobile,
      keyboard, and reduced-motion states.
- [x] Add migration, publisher, matcher, API, and client regression coverage.
- [x] Run registry validation, focused/backend/client tests, lint, build, and browser visual QA.
- [x] Record the completed review and verification evidence below.

These boxes were left unticked when the slice shipped. The evidence is the three
`20260810*` migrations, `src/domains/spec-registry/{matcher,matcher-input,preflight-service}.js`,
`src/domains/talent/routes/spec-registry.js`, `client/src/domains/talent/pages/RequirementsPage/`,
and the seven suites in `tests/spec-registry/`.

## Profile form validity and registry runtime readiness

- [x] Trace the hydration warning to the nested bookout form.
- [x] Replace it with a labelled local editor that preserves button and Enter-key submission.
- [x] Add regression coverage for valid form nesting and local keyboard submission.
- [x] Confirm why the configured Spec Registry API returns 503 and identify the safe release action.
- [x] Run focused lint/tests and verify the corrected form behavior.
- [x] Record the completed review and database state below.

### Review

- Replaced the nested bookout `<form>` with an accessible grouped editor. Its button and
  single-line Enter handling submit only the bookout and never the enclosing profile form.
- Profile regression suite passes 7/7, scoped ESLint passes, and the production client build
  passes. The test explicitly rejects `form form` nesting and verifies Enter-key behavior.
- The Spec Registry 503 is caused by database release state, not the route implementation. The
  configured Neon database was missing the three registry migrations. Applied only those three,
  avoiding the unrelated destructive `drop_casting_briefs` migration, then published dataset
  `2026.08.09.2`. Read-only verification reports 10 current series and 10 stored revisions.

## Tables deliberately left in place

`talent_commitments`, `interviews`, `reminders`, `talent_records`, `roster_memberships`,
`roster_board_standings`, `agency_import_jobs`, `profile_events`, and `share_tokens`. Only
`casting_briefs` was dropped, because
the plan calls it dormant and it had zero writers and no rows. The others may hold real history;
their product readers and writers are retired, while existing cascade and application-erasure
paths continue to remove linked talent data.

---

## Spec Builder — agencies author their own registry route (A4 #1)

The registry currently holds ten *researched third-party* routes: file-authored, hash-locked,
published as one immutable dataset. The Spec Builder makes an agency the **first-party author**
of its own route, so its open-call applicants are evaluated against what the agency actually
requires rather than what Pholio observed from outside.

### Why the existing schema already fits

No schema change is needed. The v1 spec-revision schema was written with this case in mind:

- `authority: "agency_confirmed"` and `review.method: "agency_confirmation"` are unused enum
  values reserved for exactly this.
- `publisher.js:44 blockingAuthorized()` already gates on that pair.
- `status: "draft"` is unused and is the natural pre-publish state.
- An agency stating its own requirement *is* `basis: "explicit_text"` — its own words are the
  source text, and the evidence record points at its own open-call page.

### Decisions

- **Advisory only.** Agency-authored specs publish with `evaluationMode: "advisory"`.
  `blockingAuthorized()` stays dormant. A1 invariant 3 — "the open-call path is free and
  unlimited, always" — must stay literally true: talent always sees what is missing and can
  always still send. Revisit only with counsel.
- **Eligibility fields are allowlisted.** An agency may author shot, presentation and file rules
  across the full taxonomy, but *eligibility* rules are restricted to declared, non-inferred
  facts: age, height, measurements, work authorization, location, representation status.
  Appearance-derived fields (`appearance.natural_hair_color`, `appearance.natural_eye_color`,
  `appearance.hair_color`, `appearance.eye_color`, `applicant.nationality`) are rejected as
  eligibility constraints. Recording that a third party publishes such a rule is description;
  giving agencies a Pholio tool to author one is participation. A1 invariant 5.
- **Agency-authored series resolve outside the dataset.** The editorial dataset stays
  hash-locked and republished as a whole; an agency's own series carries its own current
  pointer. One agency, one series, many immutable revisions.

### Plan

- [x] Migration: `spec_registry_series` gains `origin`/`agency_id`/`current_revision_id`;
      new `agency_spec_drafts`; `application_spec_snapshots.dataset_version` becomes nullable
      so an agency-authored receipt can be stored.
- [x] Extract the registry validator core out of `scripts/validate-spec-registry.js` into
      `src/domains/spec-registry/validation/`, re-exported from the script so the CLI and its
      tests keep working. Runtime authoring must validate against the *active* taxonomy.
- [x] Authoring module: authorable-field allowlist, draft load/save, and composition of a
      simplified agency draft into a full schema-valid revision.
- [x] Publish service: validate → mint immutable revision → advance the series pointer →
      upsert `spec_registry_agency_routes`, in one transaction. Republishing an unchanged draft
      is a no-op, never a new revision.
- [x] Resolution: `getCurrentRevision` / `listCurrentRoutes` union editorial and agency-authored
      series; `saveApplicationSnapshot` accepts a revision with no dataset record.
- [x] Agency API: taxonomy, draft GET/PUT, publish, revision history.
- [x] Spec Builder UI in Open Call Manager.
- [x] Tests: allowlist rejection, draft validation, publish immutability and idempotence,
      resolution union, snapshot acceptance, and the client surface.
- [x] Run focused tests, registry validation, lint, build; record the review below.

### Review

**No schema change was needed.** The v1 spec-revision schema already reserved every value this
path requires and the ten researched routes use none of them: `authority: "agency_confirmed"`,
`review.method: "agency_confirmation"`, `channel.type: "pholio_open_call"`, and `status: "draft"`.
`publisher.js:44 blockingAuthorized()` was already written to gate on the first two. An agency
stating its own requirement composes honestly as `basis: "explicit_text"` — its own words are the
source text, and the evidence record points at its own open call.

**What ships**

- `migrations/20260811090000_agency_authored_spec_registry.js` — series origin/pointer columns,
  `agency_spec_drafts`, and a nullable snapshot `dataset_version`. Verified up, down and up again
  on SQLite with every index and the `submission_request_id` unique constraint intact.
- `src/domains/spec-registry/validation/registry-validator.js` — the former script body, moved
  whole. `scripts/validate-spec-registry.js` is now a thin CLI re-exporting the same surface, so
  its 22 tests import unchanged and the command still reports 10/10/88/28.
- `src/domains/spec-registry/authoring/` — `authorable-fields.js` (the compliance gate),
  `compose.js`, `validate-authored.js`, `spec-builder-service.js`.
- `src/domains/agency/routes/spec-builder.js` behind the existing `open_call.view` /
  `open_call.manage` permissions.
- `client/src/domains/agency/pages/settings/SpecBuilderPanel.{jsx,css}`, wired as a
  **Requirements** tab beside Open Call Links.

**Compliance decisions, as built**

- Advisory only. Authored revisions publish `evaluationMode: "advisory"` with
  `enforcement_authorized: false`, and preflight still returns
  `{ canProceed: true, advisoryOnly: true, blockingEligible: false }`. A1 invariant 3 holds
  literally: a published requirement tells an applicant what is missing and never stops them
  sending.
- Eligibility is allowlisted rather than denylisted, and the line drawn is between a rule about
  the *photograph* (presentation — retakeable) and a rule about the *person* (eligibility — not).
  Nationality and hair/eye colour are refused in every group. Gender may scope a requirement but
  never be one, which is the exact shape of a real published spec — The Society states an age
  range scoped to a declared gender. Refused fields are shown in the UI with their reason instead
  of being silently absent.
- An agency's own route supersedes what Pholio observed about it from outside, at priority 0.
- A verified revision must carry a review deadline, so authored specs get `nextReviewOn` one year
  out and age into `review_due` exactly like researched ones.

**Verification**

- `tests/spec-registry/` — **87/87** across 8 suites, including 21 new Spec Builder contracts.
  The three pre-existing suites that build their schema by hand now apply the new migration too.
- Full backend: **2,031 passing**, and the failures hold at the branch's documented baseline of
  **5 suites / 39 tests** (`app`, `notifications`, `overview-backend`, `intel`,
  `password-changed-notification` — all seed/migration-state dependent, none touched here).
- Client: **224/224** Vitest across 31 files, including 10 new panel tests. Lint has only the two
  pre-existing problems in the untouched talent domain. Production build succeeds.
- End-to-end on a fully migrated SQLite database, not the hand-rolled test schema: editorial
  dataset publishes, an agency authors and publishes revision 1, republishing no-ops, the agency
  resolves to its own route with a null dataset version, and the public directory grows 10 → 11.
  A talent preflight against that route returned `canProceed: true` with the gender-scoped height
  floor **satisfied** (female, 178cm ≥ 175) and each unmet shot reported as missing — the wedge
  working: *you have 0 of Northlight's 3*.

**Not in this slice:** the mandatory brief on open-call links (who / what / eligibility / deadline
/ what happens next), which is the other half of A4 #1 and an independent build.

### Postgres rehearsal — three defects SQLite hid

The panel returned 500 in dev. Dev points at the Neon database, where the migration was pending.
Rehearsing on a disposable Neon branch before touching it found three real problems that the
SQLite suites could not have caught:

1. **No deploy-before-migrate guard.** The route answered 500 on a missing column instead of
   degrading. Every other schema-dependent surface here has one (`hasOpenCallSchema` → 503).
   Added `hasSpecBuilderSchema`, cached per process and reset on failure, guarding all five
   entry points; `SpecAuthoringError` now carries a status so environment problems return **503
   `SPEC_BUILDER_UNAVAILABLE`** and are told apart from an agency's own mistake. The panel already
   had an unavailable state; it now recognises this code too.
2. **`String(date).slice(0, 10)` is wrong on Postgres.** `date` columns arrive as JS `Date`
   objects there and strings on SQLite, so the normaliser produced `"Tue Aug 11"`. The composed
   comparison hash therefore never matched what was stored: **every republish minted a redundant
   revision**, `hasUnpublishedChanges` was permanently true, and the UI would have shown
   `Tue Aug 11`. Now uses the repository's existing `dateOnly()`, which handles both.
3. **`seriesIdFor` keyed on the slug.** A slug can be edited; the series id cannot move without
   orphaning every revision published under the old one. Now keyed on the immutable agency id,
   with readable identity left where it is actually read, in `scope.organization`.

A fourth was found in the rollback itself: `down()` dropped the `origin` column while leaving
agency-authored series behind, stranding rows that nothing could interpret afterwards — the
branch ended with 11 series instead of 10. It now reclaims authored series, their revisions,
routes and snapshots *before* dropping the column that identifies them, verified 11 → 10 on both
engines.

**Rehearsal and release**

- Branch `br-sweet-cherry-a4cx2xkb` forked from production, migration applied alone, then
  inspected: all four FKs on `application_spec_snapshots` survived the `ALTER` including the
  `dataset_version` one, the `submission_request_id` unique constraint survived, all 10 existing
  series defaulted to `origin='editorial'`, and no rows were lost.
- Full author → publish → republish → resolve cycle exercised on Postgres against real
  production-shaped data. After the fixes: publish mints r1, both republishes report
  `unchanged`, dates read `2026-08-11` / `2027-08-11`, and only one revision exists.
- `down()` then `up()` re-verified on the branch and on SQLite. Branch deleted.
- **Only `20260811090000` was applied to production**, as batch 14. The other 7 pending
  migrations were left alone — several carry `dropColumn`, `.update`, `.del` or
  `dropTableIfExists`, so `npm run migrate` must not be run casually against that database.
- Post-release check against production: schema guard true, 10 series all editorial, panel loads
  with 43 authorable fields.

**Verification after the fixes:** spec-registry **90/90** (2 new regression tests pinning the
date-type and series-id-stability behaviour); backend **2,034 passing** at the same documented
5-suite/39-test baseline; panel **10/10**; client lint and build unchanged. Full client Vitest
showed 3 failures in `ProfilePage`, an untouched talent file, which passes **7/7** in isolation —
a load-related flake of the same class as the documented `same-origin-app` one.

---

## Open call brief — A4 #1 complete

---

The second half of A4 #1. An open call with no brief is a link into silence: the applicant
cannot tell who it is for, what to send, or what happens after they send it.

- [x] Migration adding the brief to `agency_open_call_links`.
- [x] Shared brief service: validation, storage columns, and the applicant-facing DTO.
- [x] Mandatory on every new link; editable in place on existing ones.
- [x] Surface the brief on the talent arrival page, in the agency's own words.
- [x] A call past its published closing date stops taking submissions and says so.
- [x] Tests, then rehearse the migration on a Neon branch before releasing it.

### Decisions

- **Mandatory for new links, grandfathered for existing ones.** Two links are live in
  production with no brief. Breaking a link an agency has already published on its own site is
  worse than a missing brief, so they keep working and are reported as needing one —
  `brief_completed_at` is what separates "the agency answered" from "nobody has filled this in",
  which a brief of empty strings could not.
- **The deadline is a required decision, not a required date.** Agencies run permanent open
  calls — Storm takes walk-ins Mon–Fri — so an agency either names a closing date or says the
  call runs continuously. Forcing a date would manufacture a deadline nobody means. Refusing to
  answer at all is still rejected.
- **A dated call closes itself.** Past its published date the arrival page says so, no claim is
  minted, and the client does not even fire the beacon. Left open it would keep taking
  submissions into a call the agency considers finished — the exact silence B3 is about.
- **Eligibility may be empty.** A call open to everyone should say nothing rather than invent a
  restriction. `who`, `what` and `next steps` are required; eligibility is not.
- **The brief does not restate the Spec Registry.** Prose says who the call is for and what
  happens next; exact shot requirements stay structured in Requirements, and the field hint
  points there rather than inviting a second, contradictory copy.

### Review

- `src/domains/agency/services/open-call-brief.js` holds validation, columns, closing and the
  DTO in one place because the agency API writes it and the public arrival page renders it —
  a brief the applicant reads differently from the one the agency wrote is worse than none.
- `findActiveLinkByCode` selects the brief columns **conditionally**, so the arrival page still
  works on a database that has the open-call schema but not yet this migration. Verified by
  rolling the migration back on a scratch database and confirming arrivals still resolve.
- The arrival page shows the agency's own four sections and its closing line; links with no
  brief keep the previous generic three steps rather than being given reassuring filler nobody
  wrote.

**Verification.** New: 19 brief-service contracts, 2 API contracts (a link cannot be created
without a brief; an undecided deadline is refused), 7 arrival-page tests, 7 panel tests.
Backend **2,054 passing** at the documented 5-suite/39-test baseline. Client **238/238** across
33 files. Lint back to the two pre-existing talent-domain problems; build passes.

Rehearsed on Neon branch `br-purple-bonus-a4cmrnuk`: columns land as expected, the Postgres
`date` round-trip reads correctly through `dateOnly` (the trap from the Spec Builder slice,
avoided this time by writing it that way from the start), `down()` then `up()` leaves the two
existing links untouched. Branch deleted. **Only `20260811140000` was applied to production**,
as batch 15; the same 7 unrelated pending migrations remain untouched.

---

## Instagram professional login — in progress

- [x] Confirm Meta's Instagram Login applies to professional (business/creator) accounts.
- [x] Preserve validated adult eligibility across the Instagram signup redirect.
- [ ] Verify the login and signup handoffs with focused tests.

---

## Spec-correct export + requirements rebuild — in progress

Brief: [`docs/spec-correct-export-brief.md`](../docs/spec-correct-export-brief.md).

### 1. Export — service + route

- [ ] `export/zip.js` — stored-entry ZIP writer. No new dependency: already-compressed
      JPEG/WebP bytes do not deflate, so `store` is both correct and small.
- [ ] `export/export-plan.js` — pure planner over `rules.files` (`per_file` / `total_set` /
      `whole_package` size, count and mime constraints) plus the shot-slot assignments the
      matcher already produced.
- [ ] `export/spec-export-service.js` — Sharp resize/encode/name pipeline. **No crop step**:
      the schema carries no dimension, aspect or orientation rule, so there is no crop target.
- [ ] `POST /api/talent/spec-registry/export`. Never gated behind Studio+ (guardrail 1).

### 2. Instrumentation (guardrail 4)

- [ ] Migration: `spec_registry_engagement_events`.
- [ ] `export` recorded by the export route; `outbound_click` by a new route.
- [ ] `summarizeEngagement()` + a script that prints the per-agency sentence.

### 3. Removal path (guardrail 3)

- [ ] Migration: `delisted_at` / `delisted_reason` on `spec_registry_series`.
- [ ] Every read path in `store/repository.js` filters delisted series.
- [ ] `scripts/delist-spec-registry-agency.js`.

### 4. Rebuilt talent requirements surface

Rebuild, not extend. The existing markup and CSS are behaviour reference only.

- [ ] Requirement framing — "published requirements", "your set covers 4 of 6"; never
      "Prepare this package for X", because nothing is sent to a non-customer agency.
- [ ] One directory, marked per entry as inline plain text. No badge/chip/pill/dot
      (root `CLAUDE.md` bans 4, 5, 7, 10).
- [ ] The full check for everyone, customer agency or not.
- [ ] Provenance on every entry: source link, checked-on date, non-affiliation.
- [ ] Export action and an instrumented outbound link.
- [ ] One reader only — `lib/specRegistry.js`.
