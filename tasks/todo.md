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

- [ ] **Spec Registry suites are red on main** — 8 suites / 59 tests, all
      `spec_registry_agency_routes` FOREIGN KEY violations during dataset seeding.
      Confirmed PRE-EXISTING (reproduced with the Stage 1 source reverted). This is the
      §7 centerpiece and the §9.6 #1 feature; it should not ship red. Investigate before
      further feature work.

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
