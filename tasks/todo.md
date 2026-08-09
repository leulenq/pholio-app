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
- [ ] **Intel / analytics pages inferring intent from view counts** (A3) — revise, do not
      remove. Keep Intel and analytics as talent-owned tools, restore the surface, and replace
      unsupported intent/attention/momentum claims with attributable first-party traffic,
      application outcomes, material usage, and clearly labeled factual trends.
- [ ] **"Verified adult" state with no verification behind it** (A3) — build a real age-
      verification layer behind the state; do not remove the capability. Adult-context data
      remains private and requires explicit, opportunity-specific sharing consent.
- [ ] **Gamification and profile-strength theatre** (A3). The reveal page is already gone —
      `/reveal` and `/dashboard/talent/reveal` are redirects only.

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

# Phase 3 — Defects (A5) — not started

Application status machine (`booked` → `represented` consolidation, `NOTIFY_STATUSES`
missing `represented`), the submission-receipt gap in `inbox.js`, blocked agencies not
enforcing, the safety report passing the reporter's own `user_id` as target, and account
deletion reporting success when `fullyErased: false`.

# Phase 4 — The wedge (Part B) — not started

Spec Registry → Spec Builder → talent-side preflight → guided capture → freshness engine →
auto-close.

---

## Verification standard used throughout

Every slice is checked against a baseline taken at this branch's own HEAD (not the local
`main` ref, which is stale — see `lessons.md`). Before the Intel removal, backend `npm test`
held at **5 pre-existing failing suites / 39 failing tests**: seed-dependent `app`,
`notifications`, `overview-backend`, `intel`, plus `password-changed-notification`.
`same-origin-app` flakes under parallel load on a 5s migration hook and passes in isolation.
The Intel suite and its 18 failures are now intentionally gone; the current count is recorded
below. Client lint keeps one pre-existing warning in an untouched file.

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

The Intel/intent-analytics slice's focused public tracking checks pass **3/3** and its route
modules load cleanly. Full client Vitest passes **189/189**, lint has only the same untouched
React Hook Form warning, and the production build succeeds. The full backend run passes
**1,913 tests** and reports **5 suites / 23 tests** failing: the prior local 6/41 count minus
the intentionally deleted Intel suite and its 18 already-failing tests. The remaining failures
are unchanged (`app`, `notifications`, `overview-backend`, `password-changed-notification`,
and the two Chrome-less Puppeteer raster tests).

## Tables deliberately left in place

`talent_commitments`, `interviews`, `reminders`, `talent_records`, `roster_memberships`,
`roster_board_standings`, `agency_import_jobs`, `profile_events`, and `share_tokens`. Only
`casting_briefs` was dropped, because
the plan calls it dormant and it had zero writers and no rows. The others may hold real history;
their product readers and writers are retired, while existing cascade and application-erasure
paths continue to remove linked talent data.
