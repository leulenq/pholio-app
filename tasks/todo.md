# Open-call applicant flow — implementation plan (v2 design)

Design authority: `docs/open-call-applicant-flow-design-2026-08.md` (rev 2, commit `441af8f`).
Branch: `claude/open-call-applicant-flow-0w71i7`. Lead integrates and commits; workers never commit.
Out of scope per owner: FWBK age policy / minor intake (another agent owns it). The 18+ attestation
field stays as a plain apply-stage attestation; no guardian machinery is touched.

Rulings assumed (per doc §9 recommendations, owner said proceed): Q2 yes, Q3 nullable+resolver,
Q4 yes, Q5 event_ends_on+90d, Q6 yes, Q7 photos gate submit but come last, Q8 fulfilment needs no claim.

## Waves

- [x] **W1-A1 (Opus)** C4 claim-key fix: `agency_open_call_claims.call_purpose`, per-purpose partial
      uniques (repr: agency+profile; event: link+profile), service + submit-path updates, tests.
- [x] **W1-A2 (Opus)** Schema: `applicant_identities`, `open_call_submissions`,
      `open_call_submission_media`, `applicant_claim_tokens`, `open_call_material_requests`;
      `applications.profile_id` → nullable (SQLite introspect-and-rebuild per `20260815090000`
      precedent) + `applicant_identity_id` + CHECK + identity-keyed partial uniques;
      `agency_open_call_links.intake_spec/intake_spec_version/identity_policy`. Migration tests.
- [x] **W1-B (Sonnet)** Intake vocabulary constants, server + client mirror + parity test:
      field keys, stages, requirements, identity policies, default specs per call kind,
      normalize/validate helpers.
- [x] **W2-C1 (Opus)** Identity + token services: `applicant-identities`, claim/disown/materials
      tokens (hashed, message-reply-tokens idiom), claim transaction (users+profiles projection,
      media promotion, application re-pointing, email_verified=true), disown flow. Tests.
- [x] **W2-C2 (Opus)** Anonymous draft + submit: draft cookie service, public endpoints
      (spec fetch, draft CRUD, media upload gated behind email, submit → applications row +
      frozen snapshot + consent event + receipt email), moderation wiring, funnel events. Tests.
- [x] **W3-D (Opus)** `resolveApplicantIdentity` resolver + enforcement test; the 8 agency
      `profiles`-join sites; unclaimed rows in inbox + CSV; verified-email/completeness as plain
      text; Request-materials endpoint + chase email. Tests.
- [x] **W4-E (Opus)** Client applicant flow at `/opencall/:code`: screen-1-with-first-question,
      apply-stage spec screens (photos last), email step (no oracle), consent, send, payoff;
      draft resume; retire arrival page as a gate.
- [x] **W4-E2 (Opus)** Materials fulfilment page (tokenized, ReplyPage shape) + claim offer after send.
- [x] **W5 (lead)** Full test suite + client lint + adversarial diff review; docs updated; commits.

## Review log
- W1-B landed: constants + parity test (19 tests). Committed.
- W1-A1 landed: claims keyed per purpose; verified diff + 17 migration tests; also confirmed a
  PRE-EXISTING harness hazard — tests/setup/isolated-db.js mutates process.env.DATABASE_URL and
  never restores it, so two suites sharing one jest worker can collide (reproduced with suites
  from main). Revisit at final full-suite pass; not a lane regression.
- W1-A2 landed: 5 tables + nullable applications.profile_id via shared introspect-and-rebuild
  helper; 36 tests; agent ran FULL suite green (230 suites / 2965 tests, --runInBand).
  Runbook note: PG ACCESS EXCLUSIVE locks on applications + snapshot/consent tables.
- W2-C1 (identity/tokens/claim) and W3-D (resolver/organizer) launched in parallel, disjoint files;
  snapshot payload.identity contract fixed by lead and written into both specs.
- W2-C1 landed: identity/tokens/claim (46 tests); lead fixed the funnel-vocabulary pin in
  event-casting-schema.test.js (8 -> 12 types). Committed 1112431.
- W3-D landed: resolver + 10 join sites (2 explicit excludes in messaging), CSV identity columns,
  request-materials endpoint riding requested_more; full suite green under the lane (3035).
  Committed f884781. Flagged: talent-dossier 404 for identity rows (W3-D2 lane dispatched);
  agency SPA needs a null path for profile.id/slug on identity rows (folded into Wave 4 scope).
- W3-D2 landed: dossier identity branch (18 tests + key-parity with the profile branch);
  truth fields added to both branches so account-backed rows never read as unclaimed. Committed.
- W2-C2 landed after a session-limit interruption + resume: draft cookie, spec validation,
  email-gated uploads, submit transaction writing applications/snapshot/consent, no-oracle email
  step, fail-closed anonymous moderation (7.1 gate named open in the module header). Lead applied
  its rate-limiter recommendation in app.js (claim/disown strict, form on onboarding ceiling).
  Committed 3c20c8c. NOTE: HEIC uploads not accepted (uploader-wide decision, deferred).
- W4 launched (3 parallel): E applicant flow client (Opus), E2 materials fulfilment server+client
  (Opus — also closes the missing /materials/:token endpoints), E3 agency SPA identity null-path
  (Sonnet).
- W4 all landed: E applicant flow (543 client tests + build), E2 materials fulfilment (16+5 tests;
  lead wired the App.jsx route), E3 agency SPA null-path (121 tests; found+fixed a pre-existing
  bug where the overview substituted application ids for null profile ids).
- W5: full server suite 3092 passed / 0 failed; client 549 passed; lint clean (1 pre-existing
  warning). High-effort adversarial review found 5 correctness issues (cross-purpose claim
  consumption, minor-profile attach bypassing the guardian gate, materials token unbound to its
  request, plus-tag matching no-op, identity rows crowding the inbox hard cap) + 1 cleanup —
  fix lane dispatched; one finding referenced a file absent from HEAD (moot).
- Open before production: 7.1 anonymous-media moderation wiring; board-candidates endpoint
  identity fields; HEIC; minors policy (other workstream).

---

# Spec Pack coverage — the six selected agencies that had no series

Closed 2026-08-29. `docs/pholio-strategic-analysis-2026-08.md` §7 wants 40-60
hand-verified agencies; the pack shipped with six routes while the 2026-08-19
rebuild (`docs/spec-registry-rebuild-2026-08/`) had already researched eleven
entries from the live forms. Six of them had no registry series at all, so the
export and preflight machinery had nothing to point at for the agencies the
launch cohort was selected around.

- [x] Author six revisions from the rebuild research, into the live v1 schema:
      `state:online`, `q-management:online`, `one-management:online`,
      `jag:online`, `curv:online`, `bicoastal:online`. Pack is 6 -> 12 series.
- [x] Series ids match the ones `agencyBriefs.js` already predicted
      (`<entry id>:online`), so wiring the authored copy was a one-line change
      per entry rather than a rewrite. Ten of the eleven entries now resolve.
- [x] `shot.frame` gains `three_quarter_length` — Q and State both publish a
      3/4 slot and the vocabulary had no word for it.
- [x] Six NY DOL verifications added, each byte-checked against the in-repo
      registry snapshot by the trust validator. `agencyId` stays null: these are
      reference entries, and hand-inserting `agencies` rows is the operation
      that produced the eight duplicates scoped below.
- [x] Tests: 223 spec-registry, 14 trust-registry, 738 client, lint clean. Two
      tests that pinned the pack's size or its single observation date now
      assert the invariant instead.

What was left out, deliberately:

- **State's Snapcast channel.** A real second channel with different formats, a
  3MB cap, an account step and the platform's own perpetual likeness licence.
  v1 holds one channel per revision, and a second series would inherit a brief
  written for the first. The authored brief already sets the two side by side.
- **Fashion Week Brooklyn.** Event casting, not representation; its series is
  still prospective.
- **Ford's r2 — done 2026-08-29.** `ford-models:selected-city-online@2` moves
  the series off the Snapcast form, which fordmodels.com mounts for Paris only:
  the canonical route for New York, Chicago, LA, Miami and Barcelona is one
  shared selectroom.app form. Two required slots and two not, JPEG and PNG, and
  no published size cap — the 3MB the series carried was Paris's. The authored
  brief had already been written from this research, so the correction closed a
  gap between the copy and the registry rather than opening one; one sentence of
  that copy listed a shoe-size field the form does not have, and is fixed.
  Paris is not published: its accept string was never captured.
  Elite, Wilhelmina and Muse are still on 2026-08-09 revisions and superseded by
  the same research, without a wrong-channel defect. Three r2s remain.
- **Slot labels are what exported files are named after.** State's read
  "UPLOAD CLOSE-UP *" and CURV's was a whole instruction sentence; both now
  carry the shot name, and required-marker asterisks are out of slot labels
  since `modality` states requiredness. Two older entries still have this —
  IMG ("Upload Head Shot") and The Society ("Please submit a close-up").
- **IMG and The Society** stay published though `SELECTION.md` dropped them from
  the launch ten. Delisting is a product call; nothing was removed.
- Facts the v1 schema cannot hold (ONE's video-link fields, per-channel legal
  regimes, conditional visibility, honeypots, Bicoastal's gender-selector
  defect, ethnicity/website fields) are written into each revision's
  `review.notes` so they survive into the `MODEL.md` schema when it lands.

---

# Launch gap closure — verified against `docs/pholio-strategic-analysis-2026-08.md`

Source: build-status audit 2026-08-23. Studio+ paid tier excluded by owner (§11 puts it at
week 8+ anyway). Lead = Claude (Opus/Strong). Workers never commit; lead integrates.
Branch: `claude/launch-gap-stage-1`.

## Stage 1 — bleeding now — DONE

- [x] **S1-LEAD (Strong)** Invite-to-Apply consent gate — `45b5b654`.
      `inbox.js` and its drifted page-route twin in `roster.js` both recorded an agency's
      interest as an `applications` row, which (a) satisfied the ownership check on
      `/applications/:id/details` and so handed over the submission-grade dossier — exact
      `date_of_birth` via `AGE_GATING_COLUMNS`, plus email — for a talent who had never
      applied, and (b) made `alreadyAppliedToTarget` self-fulfilling, telling that talent
      they had already applied. Now `agency_invitations`; `applications` row only on a real
      apply; `invited_by_agency_id` kept but written at apply time so the dossier's
      `invited` flag keeps its honest meaning. Guarded reads (deploy-before-migrate).
      10 tests. No backfill — production held zero such rows.
- [x] **S1-W1 (Standard)** Deletions — `7d2cec12`.
      ZipSite removed from every shipping surface; `public/scripts/pdf-export.js` and
      `render-pdf.js` deleted outright (unreferenced, carried a `bookings@zipsite.com`
      contact and a "Refined by ZipSite" watermark). `board_scoring_weights` +
      `applications.match_score` drop migration written, NOT applied.
      `FIREBASE_PROJECT_ID=zipsite-78e85` deliberately untouched — live project id, an
      infrastructure migration rather than a rename.
- [ ] **DEFERRED by owner** — `social-oauth.js` mock verifier stays until Phyllo is set up.
      It is production-gated but backs live dev/staging UI (`SocialSection`, `MockConsentPage`).
- [ ] **S1-LEAD** Agency dossier digitals freshness, server-side.
      `client/.../dossier/dossierModel.js:221-240` ages from `created_at` and takes the
      *newest* frame, so a reviewer reads an undated or part-stale set as fresh. Compute in
      `talent-dossier.js` so there is one source of truth, then thin the client.

## Blocker found while verifying Stage 1

- [x] **Spec Registry suites are red on main** — RESOLVED, and this entry was stale.
      Re-run 2026-08-25: `tests/spec-registry/` is 15 suites / 201 tests, all green.
      The FK violations were real historically — old `seeds/seed.js` inserted 8 real
      agencies into `spec_registry_agency_routes` — and were fixed by
      `migrations/20260815103000_reference_agency_conversion.js`, which converts those
      rows to REFERENCE and deletes the routes; the current seed no longer writes that
      table. Left checked rather than deleted because "this blocker was stale" is the
      useful record: it sat here unverified while the feature it blocked was already
      shipped and tested. See the 2026-08-25 correction note at the top of
      `docs/pholio-strategic-analysis-2026-08.md`.

## Stage 2 — the removals §9.2/§9.3 call for

- [ ] Archetype & vibe AI: `analyzeProfileImage.js` still emits `lookType`/`marketSignals`/
      `bookingStrengths`/`developmentNotes`/`castingNotes`, wired at `media.js:44,181` and
      `comp-card-import.js:43`. Also retire `archetype` + `market_fit_rankings` as profile
      columns and PDF composition inputs. Standard impl / Strong review.

## Stage 3 — agency surfaces

- [ ] Applicant inbox: wire the frontend to the sort/city/eligibility/date-range filters the
      backend already supports (`ApplicantsPage.jsx` ignores all of them).
- [ ] Comparison view (not built).
- [ ] Auto-close: expose the per-agency review window in settings (exists in DB/API, no UI)
      + one-click templated decline (no `decline_reason` anywhere).
- [ ] "Request refresh", distinct from "request more materials".
- [ ] Season memory: agency-facing re-application diffing.
- [ ] Export webhook (CSV done; webhook is zero).

## Stage 4 — talent surface

- [ ] Per-recipient share tokens with open tracking: built server-side (`intel.js:104-190`,
      `share_tokens`), consumed by zero client code. §9.2 calls this the single most
      emotionally valuable analytics event Pholio can show.

## Stage 5 — event mode (FWB-blocking)

- [ ] Confirmations / RSVP / no-show handling.
- [ ] Export-back-to-model payoff bundle — funnel event fires, deliverable not located.

## Open question for the owner

- Machine-readable comp card (§9.6 #6, embedded structured data) — not built, unscoped.

## Migration rehearsal log (Neon branches off production)

All six pending migrations rehearsed against forks of production. Production
itself remains at 218 / batch 18 — nothing has been applied there.

- 2026-08-24, `rehearse-launch-gap-clean-2026-08-24`: the first five. Caught a
  real defect — `reconcile_profiles_ai_drift.down()` restored every column it
  found missing, so on production (where `up()` is a no-op) a rollback would
  have CREATED 34 columns production never had, rebuilding the inference
  surface the compliance work removed. Made one-way.
- 2026-08-24, `rehearse-decline-reason-2026-08-24`: all six including
  `20260824100000_application_decline_reason`. Row counts identical across every
  table before and after; the 6 pre-existing declined rows kept NULL rather than
  being backfilled with a reason nobody chose; rollback + re-apply round-trips.
  Ten functional checks against real Postgres rows, including that the reason
  reaches both the HTML and plain-text emails and that the contradictory "they
  don't give a reason" line disappears when one is given.
  - Found: production has `applications.match_score` but NOT
    `match_calculated_at` — another instance of the schema drift. The guards
    handled it, but the log line claimed both were dropped. Fixed to name only
    what it actually drops.

### APPLIED TO PRODUCTION — 2026-08-24, batch 19

All six applied on the owner's instruction. Restore point taken first:
Neon branch `pre-migration-batch19-2026-08-24` (br-rough-block-a44lxze2),
created with NO expiry so it outlives the rehearsal branches.

Verified after: 218 -> 224 migrations, batch 19. Every row count identical to
the pre-migration baseline — applications 47, profiles 62, users 67, images 71,
agencies 22, notes 6, tags 42, onboarding_signals 3, sessions 26. The 6 existing
declined applications kept decline_reason NULL. Ten schema assertions correct
(agency_invitations created; decline_reason added; match_score,
board_scoring_weights, archetype, vibe_score gone; invited_by_agency_id,
ai_processing_consent and age_range all kept). profiles is 109 columns.
Invitation service smoke-tested live: 9/9, and inviting still writes no
applications row (47 -> 47).

Rollback if ever needed: `npx knex migrate:rollback` reverses batch 19; the
reconcile migration is deliberately one-way and restores nothing, by design.

Still open: decide the orphaned Elite trust-registry org key (`elite-models` vs
the delisted `elite-model-management`).

---

# Scoped: deduplicate the reference agency rows

Found 2026-08-24 while mapping trust-registry verifications. NOT done — scoped
here deliberately, because the first instinct (delete the empty twin) is wrong.

## The defect

Eight seeded reference agencies exist TWICE in production, created 2026-07-28,
identical in name, website and REFERENCE status:

  DNA Model Management · Elite Model Management · Ford Models · IMG Models
  Marilyn Agency · Next Management · The Society Management · Wilhelmina Models

Talent see each of them twice in the directory. That is the user-visible half.

## Why it is not a five-minute cleanup

- **40 foreign keys reference `agencies.id`, 22 of them ON DELETE CASCADE** —
  applications, boards, application_tags, application_submission_consent_events,
  guardian_consent_requests, open_call_submissions, roster_memberships,
  spec_registry_series and more. Deleting a row silently destroys whatever
  points at it. Only 3 of the 40 have been checked.
- **The twins are not interchangeable.** In every pair one row carries a real
  talent application and the other is empty (Elite ed82df8b / Ford f2b7bec8 /
  IMG d1ffbc1c / Society fe9a146a / Wilhelmina ed5c17a4 each hold 1). Five real
  applications hang off one arbitrary half.
- **Root cause unknown.** `20260701110000` only UPDATEs by name, so it is not
  the source. Whatever created them on 2026-07-28 has not been found, and until
  it is, a dedupe may simply be undone by the next deploy.
- **Name-keyed writes currently hit both rows** (`.where({ name }).update()` in
  20260701110000). That is why the twins stay identical — and it means any other
  name-keyed write needs auditing before one row disappears.

## The work, in order

1. Find what inserted the duplicates on 2026-07-28 and stop it recurring.
   Until this is answered, do not delete anything.
2. Audit all 40 FK references for rows pointing at each doomed id. Not a
   spot-check — enumerate.
3. Decide the survivor per pair: the applications-bearing row, which is also the
   row the trust-registry mapping now points at (see the mapping section above).
4. Write it as a MIGRATION, not ad-hoc SQL: re-point every reference, then
   delete. Rehearse on a Neon branch off production, verifying row counts per
   affected table before and after.
5. Add a uniqueness constraint so it cannot recur. Note reference agencies have
   `slug: null`, so the constraint cannot be on slug alone.
6. Re-run `npm run release:trust-registry` afterwards if any survivor id changes.

## Not blocking

The verification mapping does not depend on this. Four verifications are mapped
and live against the applications-bearing rows; the empty twins simply render no
verification, which is what they rendered before.

## Trust-registry mapping — decisions taken 2026-08-24

**Elite: MAPPED.** The criterion used for every other entry is organizationId ->
the agency row of that name, and by that criterion Elite is unambiguous:
`elite-model-management` -> the "Elite Model Management" row. Worth noting the
criterion is NOT legal-name matching — The Society Management maps to "SCTY
Management, LLC", an entirely different registered name — so requiring Elite's
domains to line up would have been a stricter test than any other entry passed.
The `elitemodel.com` on the agency row matches neither spec and is seed-data
noise, not evidence of a distinct entity. What is asserted is "Elite Model
Management holds NY DOL registration 26-69YIX-LSFW", which the register says.

**Muse: DEFERRED, on purpose.** Muse has a live certificate and an active call
window but no `agencies` row. Creating one by hand would mean hand-inserting a
reference agency into production — which is exactly the operation that produced
the eight duplicate rows nobody can account for. Muse belongs to the dedupe
work: find the process that creates reference agencies, fix it, and let it
create Muse. Its call window already renders regardless, since that path never
needed an agency link.

Five of six verifications now render. Muse renders nothing, which is the
designed behaviour for an unmatched agency (never "unverified").

### BATCH 20 APPLIED TO PRODUCTION — 2026-08-24

`20260824110000_material_request_kind` and `20260824120000_agency_export_webhooks`.
Rehearsed on `rehearse-batch20-2026-08-24` (br-broad-firefly-a4wjciu2), a fork of
production: migrate, rollback, re-apply — clean round-trip, row counts identical.

Nine functional checks against real Postgres rows: the webhook FK holds, one
endpoint per agency is enforced, the failure ceiling auto-disables at 10, a
disabled endpoint stops being active, a success resets the run, and
`last_delivered_at` comes back as a Date rather than a string (the pg/SQLite
difference that has broken date handling in this repo before). Dispatch with no
configured endpoint reports rather than throws.

Production: 226 migrations, batch 20. `open_call_material_requests.kind` defaults
to 'materials', so every pre-existing row keeps the meaning it was written with.
The export webhook panel stops reporting "briefly unavailable" now its table
exists.

Restore point from batch 19 (`pre-migration-batch19-2026-08-24`) is retained.

### BATCH 21 APPLIED TO PRODUCTION — 2026-08-25

`20260825090000_likeness_consents` and `20260825100000_stripe_webhook_events`.
Rehearsed on `rehearse-batch21-2026-08-25` (br-small-glade-a47ka6fh): migrate,
rollback, re-apply — clean round-trip, row counts identical.

Eight functional checks against real Postgres: marketing consent grants and
grants nothing about AI replica; a replica grant without its statutory terms is
refused with the Fashion Workers Act message; withdrawal takes effect; the
ledger is append-only and ordered by sequence; a duplicate Stripe event is
refused; and an older event is refused as stale — the guard that stops a
cancelled subscription being resurrected.

Production: 228 migrations, batch 21.

Note on ordering: the code shipped BEFORE these migrations, which is the safe
direction — both services carry deploy-before-migrate guards, so reads denied
and writes refused loudly rather than 500ing. The reverse (batch 19) is what
briefly left deployed code selecting a dropped column.
