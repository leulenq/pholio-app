# Talent Overview — Implementation Plan

**Surface:** `client/src/domains/talent/pages/OverviewPage/index.jsx` (+ `OverviewPage.css`)
**Source docs:** `talent-overview-industry-audit.md`, `talent-overview-ia-consult.md`, `talent-submission-lifecycle.md`
**Scope:** Full — presentation re-spine + minor compliance branch + representation status block
**Date:** 2026-06-24

---

## Orienting facts (what already exists — do NOT rebuild)

A lot of the audit's P0/P1 infrastructure is already in the codebase; the Overview just doesn't consume it.

| Capability | Already built | Gap |
|---|---|---|
| Minor detection + consent | `client/src/shared/utils/talentAge.js` → `isMinorProfile`, `hasGuardianConsent`, `hasWorkPermitOnFile` | Overview doesn't call them |
| Minor compliance columns | `profiles.guardian_consent_at`, `profiles.work_permit_on_file` (`migrations/20260624210000`, committed) | — |
| Minor-aware readiness | `profileReadinessItems.js` → `activeRequiredItems()` prepends consent/permit, hides `SENSITIVE_READINESS_KEYS` until `minorSensitiveFieldsUnlocked` | Only the "Audit" block inherits it (via `useProfileStrength`); book/comp-card/website blocks don't |
| Digitals recency | a `digitals_recency` readiness key exists in `profileReadinessItems.js` | Overview shows no recency state; `readinessPct` can read 100% on a stale book |
| Soft-yes submission states | DB CHECK has `shortlisted`, `kept_on_file`; `statusConfig` labels them | `bucketCounts` files `kept_on_file` under `tone:'closed'` (buries it with rejections) |
| Identity minor UI | `IdentitySection.jsx` already branches on `isMinorProfile` | Pattern to reuse, not invent |

**What genuinely does NOT exist:** structured current-representation data for talent (only freeform `profiles.previous_representations`). Representation status in Phase 4 is **derived** from application outcomes in v1.

**Phasing = ship order.** Phase 1 is compliance (P0). Phases 2–3 are the "stop misrepresenting" presentation fixes. Phase 4 is the one net-new build.

---

## Phase 1 — Minor compliance branch on the Overview (P0, ship first)

**Goal:** A under-18 talent must not be prompted to publish measurements/full-length imagery or expose a public stats-bearing card. The infra exists; wire the Overview to it.

**Files:** `OverviewPage/index.jsx`, `OverviewPage.css`

**Changes:**
1. Read minor state from the profile already in scope: `const minor = isMinorProfile(profile)` and `const sensitiveUnlocked = minorSensitiveFieldsUnlocked(profile)` (import from `shared/utils/talentAge.js`).
2. **Public website panel** (`index.jsx:524–569`, currently only `isPro`-gated): also gate `&& !minor`. A minor's public portfolio URL with images must not be surfaced/encouraged here.
3. **Comp-card export** (`index.jsx:488–519`): when `minor && !sensitiveUnlocked`, render the card as locked with copy pointing to guardian consent (deep-link `/dashboard/talent/profile?tab=identity`) instead of an Export/Wallet CTA. The card carries stats — it must not be exportable for an unconsented minor.
4. The "Audit" checklist already branches correctly (via `useProfileStrength` → `activeRequiredItems`); **no change** there beyond confirming it renders the consent/permit items first for minors.

**Acceptance:** With a DOB < 18 profile and no `guardian_consent_at`: no public URL block, comp-card export disabled with a consent path, Audit shows guardian consent + work permit as the top required items. With consent set: sensitive flow unlocks per existing `minorSensitiveFieldsUnlocked`.

**Risk/defer:** Coogan/trust-account and chaperone tracking are out of scope here (booking-side). This phase is *exposure suppression on the Overview only*.

---

## Phase 2 — Submission lifecycle correctness (P0/P1, fast, no migrations)

**Goal:** Stop the Overview from burying the soft-yes and using deal-CRM language. Pure presentation-layer fix per `talent-submission-lifecycle.md`.

**Files:** `client/src/domains/talent/utils/applicationStatus.js`, `OverviewPage/index.jsx`

**Changes:**
1. **Re-group `bucketCounts`** (`applicationStatus.js:120`). Replace `{ active, won, closed }` with industry-true standing:
   - `inReview`: `pending`, `submitted`, `reviewing`
   - `advancing`: `shortlisted`, `kept_on_file` *(+ meeting-requested, joined from interviews)*
   - `signed`: `accepted` (keep `booked` labeled distinctly as a booking)
   - `closed`: `declined`, `passed`, `archived`, `withdrawn`
   The non-negotiable: `kept_on_file` and `shortlisted` **must not** land in `closed`. Introduce a non-rejection tone (e.g. `advancing`) so `kept_on_file`'s `tone:'closed'` (`:100`) no longer routes it to the closed bucket. Audit `statusConfig` consumers for the tone change (search `tone ===`).
2. **Overview standing strip** (`index.jsx:437–449`): render `In review · Advancing · Signed · Closed`; delete the word "won" (`:444`).
3. Keep the existing `interviewsNeedingResponse` ball-in-court row (`:451–459`) — fold "meeting requested" into the `advancing` group's prominence.

**Acceptance:** An application set with a `kept_on_file` and a `shortlisted` shows them under "Advancing," never in a count alongside `declined`. No string "won" anywhere on the Overview. Existing filters/pages that call `bucketCounts`/`statusConfig` still render (regression check on `ApplicationsPage`).

**Risk/defer:** Adding persisted `requested_more` / `development_offer` states is deferred (see lifecycle doc); v1 rides existing states + interviews.

---

## Phase 3 — Overview re-spine + readiness recency (P1)

**Goal:** Flip the page from vanity-first to standing-first, and surface the ≤3-month digitals rule.

**Files:** `OverviewPage/index.jsx`, `OverviewPage.css`

**Changes (per `talent-overview-ia-consult.md`):**
1. **Delete "Visibility Index"** (`:463–464`) — it's `readinessPct` relabeled as reach. Remove the block; do not replace with a fake reach number.
2. **Hero KPIs** (`:198–211`): swap `Profile Views · Readiness · Submissions` → standing-first `Representation · Live submissions · Package`. (Representation value comes from Phase 4; until then show `Submitted/None` derived count.)
3. **Rename headings:** "The Audit." → **Submission Readiness** / **Your Package** (`:319`); "The Market." → **Your Reach** / **Activity** (`:384`); "Global Views" → **Profile views** (`:425`).
4. **Demote analytics:** move the reach metrics + `Your Website` Studio+ block (`:524–641`) below readiness and the book. Lead order: Representation → Submissions → Readiness → Book → Comp card → Reach.
5. **Digitals recency:** surface the existing `digitals_recency` readiness signal. When digitals are >3 months old, the readiness next-step CTA (`:371–373`, currently "Continue Audit"/"View Profile") becomes **"Reshoot your digitals,"** and the readiness % must not present as complete.
6. **Vocabulary:** "frames"/"Manage Frames" → **images/shots** (`:227, 232, 294`); keep "The Book."
7. **Gate comp-card export** on the required digitals set being present + current (reuse `isRequiredComplete` from `useProfileStrength`); de-weight the Apple Wallet pass below Export.

**Acceptance:** Page reads representation→submissions→readiness→book→card→reach top to bottom. No "Visibility Index," no "The Market"/"The Audit"/"frames"/"Global Views" strings. Stale-digitals profile shows a reshoot prompt and sub-100% readiness. Export disabled when required digitals incomplete.

**Risk/defer:** This is the largest CSS reflow; hand visual execution polish to `impeccable`. Respect banned UI patterns (no badges/eyebrows/count bubbles/glass) — representation/standing render as plain text or a non-badge stripe.

---

## Phase 4 — Representation status block (P1, net-new, derived v1)

**Goal:** Give the talent the single most important fact — where they stand on representation — without inventing a full data model yet.

**Files:** new selector `client/src/domains/talent/utils/representationStatus.js`; `OverviewPage/index.jsx`; (optional v2) migration.

**Changes:**
1. **v1 derivation (no migration):** a pure function over the already-fetched `applicationsList` + `profile`:
   - `Signed` if any application is `accepted`/`booked` → "Represented · {agency}" (agency name from the application record).
   - `In conversation` if any `shortlisted`/`kept_on_file` or a pending interview.
   - `Submitted` if any open `submitted`/`pending`.
   - `Unrepresented` otherwise → primary action **Submit to agencies** (`/dashboard/talent/apply`).
   - Surface `profiles.previous_representations` as history only, never as current.
2. **Representation block** as new Section 1 under the hero: plain-text status + board/division if known + the one contextual action. Tolerate a list (mother agency + market agencies) in the data shape even if v1 usually shows one.
3. **v2 groundwork (deferred, documented not built):** a structured `talent_representation` table (talent_id, agency_id, kind: `mother`/`market`, board, status, started_at, non-exclusive) so representation stops being inferred from application rows. Note the migration shape; don't build it this pass.

**Acceptance:** Each talent state (unrepresented / submitted / in conversation / signed) renders the correct line + action, derived purely from existing data, with no new migration. `previous_representations` never shows as current.

**Risk/defer:** Derivation is lossy (a signed-offline talent with no `accepted` application reads as unrepresented). Acceptable for v1; the structured table in v2 resolves it. Flag this limitation in the block's empty-state copy.

---

## Cross-cutting

- **No backend changes required for Phases 1–3.** Phase 4 v1 is frontend-only; the structured-representation migration is explicitly deferred.
- **Regression surface:** `bucketCounts`/`statusConfig` are shared — verify `ApplicationsPage` and any agency mirror after Phase 2.
- **Banned patterns (CLAUDE.md):** all new status/representation UI is plain text or a non-badge stripe; no eyebrows, status badges, count bubbles, or glass cards.
- **Tests:** add/adjust unit coverage for `bucketCounts` (kept_on_file not in closed), the representation derivation selector, and a minor-branch render test (no public URL / locked export under 18).
- **Visual polish:** Phase 3 reflow and any motion go to `impeccable`; this plan defines structure, states, and copy, not pixels.

## Suggested ship order & size

1. **Phase 1** (compliance) — small, mostly conditionals. Ship first.
2. **Phase 2** (lifecycle re-bucket + relabel) — small, no migrations.
3. **Phase 3** (re-spine + recency) — medium, largest CSS work.
4. **Phase 4** (representation, derived) — medium; defer the structured table.

## Confidence

High on Phases 1–3 — they consume infrastructure that already exists and are presentation-layer changes. Medium on Phase 4's derived-representation accuracy (offline signings, multi-market) — treat v1 as directional and plan the structured table for v2.
