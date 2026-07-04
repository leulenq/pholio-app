# Agency Open Call Links — Quota-Exempt Direct-Agency Submissions

**Date:** 2026-07-04
**Status:** Implemented (Phases 0–2 core: schema, claims, quota accounting, arrival screen, dashboard surfaces, agency link management). Phase 3 (signed personal invite tokens) and Phase 4 (Discover-invite consolidation) remain as designed.
**Scope:** A system that lets talent who arrive through an agency-controlled path (agency website, email, campaign link) submit to *that agency* without consuming the free-tier monthly submission allowance, while platform-discovery submissions continue to count toward the limit and drive Studio+ conversion.

---

## 0. Industry framing (read this first)

The correct industry frame for "a talent arriving from an agency's own website to apply" is an **open call**. Agencies run "Become a model / Apply" pages on their own sites; submissions arriving through that funnel belong to the *agency's* pipeline — the agency solicited them. Submissions a talent initiates by browsing a directory are **self-submissions through platform discovery**. This distinction is real and load-bearing in the industry, which is exactly why the quota split is defensible as product policy and credible to both audiences:

- **Talent-facing term:** "**Open call**" / "**invited submission**". Never "referral code", "promo link", or "token".
- **Agency-facing term:** "**Open call link**" — the link an agency puts on its website/emails that routes its own applicant funnel through Pholio.
- **Exempt-submission label:** "Open call — invited by {Agency}". **Counting submissions label:** "Pholio discovery".

This also explains *to the user* why the exemption exists without sounding like a billing trick: Pholio's monthly limit is a quality/anti-spam control on cold self-submissions; an agency that invites inbound applicants through its own open call has already consented to the volume.

### Prior art in this repo (do not repeat it)

A first attempt at this feature — `POST /api/talent/applications/redirect-apply` — was **retired with a 410** (`tests/talent/redirect-apply-retired.test.js`) after the 2026-06-28 audits (`tasks/apply-audit.md`) found it fatally flawed:

1. **Token design (Security MEDIUM):** static `HMAC(secret, agencyId)` — non-expiring, not profile-bound, replayable by anyone who ever saw one URL, no nonce, no one-time marker.
2. **Gate bypass (Security MEDIUM, Legal P1-6):** it skipped *every* gate the main submit path enforces — submission-program acknowledgment, consent capture, package/rights validation, minor guardian consent, agency-ACTIVE check, idempotency.
3. It minted bare `applications` rows with no snapshot, no note, no consent record.

The new design inverts both mistakes: **the security property comes from server-side state (claims), not link secrecy**, and **the exemption changes only the quota accounting — the submission itself always travels the one standard, fully-gated pipeline** (`POST /api/talent/applications` in `src/domains/talent/routes/applications.js`).

---

## 1. Current-state inventory (grounded)

| Concern | Where it lives today |
|---|---|
| Monthly limit constant (5 free) | `src/domains/talent/services/application-quota.js` (`FREE_MONTHLY_APPLICATION_LIMIT`) |
| Quota counting basis | `application_submission_requests` rows with `status='completed'` + `completed_at` in the UTC month window; backfilled by `migrations/20260629230000_backfill_submission_quota_events.js` |
| Unlimited tier | `profiles.is_pro` (Studio+, `$9.99/mo` — `src/shared/lib/billing-plan.js`) |
| Enforcement | `POST /api/talent/applications`: UX preflight (`applications.js` ~line 606) + authoritative re-check under a `forUpdate` profile lock inside the submit transaction (~line 768) → `MONTHLY_APPLICATION_LIMIT` → 403 with `upgradeRequired: true` |
| Consent/audit infra | Versioned submission-program acknowledgment (`submission-program.js`), per-submission disclosure consent events with package fingerprint + IP/UA (`submission-disclosure-consent.js`), per-agency guardian consent grants for minors (`guardian-consent.js`) |
| Legacy invite artifacts | `applications.invited_by_agency_id` (still written by the agency **Discover → Invite** path, `src/domains/agency/routes/roster.js` ~line 293; read by `GET /applications/prompt-context`) |
| Discovery paywall sibling | Free talent see only the top-20 agency directory (`src/domains/talent/routes/agencies.js:76`); Studio+ sees all |
| Frontend quota surfaces | `ApplyExperience.jsx` (header meter line ~1164, limit toast ~703, `upgradeRequired` branch ~702), `DashboardLayoutShell.jsx` targeted apply prompt (~141), `RightSidebar.jsx` Zone 4 upsell, `OverviewPage` tier line, `SettingsPage` "Studio+" section ("…application volume…"), `TierBadge` |

Notable precedent: the agency **Discover invite** already creates an application without writing a quota event — agency-initiated interest already doesn't consume talent quota. This design generalizes that principle to agency-originated *inbound* traffic.

---

## 2. Recommended system design

### 2.1 Model choice: **agency-scoped open call links + server-side claim records** (hybrid)

Evaluated options:

| Model | Verdict |
|---|---|
| **Signed one-time tokens** (per-recipient) | Right for *personal email invites*, wrong as the primary mechanism: agencies will paste the link on a public website, so per-recipient issuance doesn't fit the main funnel. Keep as **Phase 3** for campaign emails. |
| **Reusable signed tokens** (the retired design) | Rejected. A reusable bearer secret on a public webpage is not a secret; secrecy-based security is theater here. |
| **Short-lived redirect entitlements** (cookie/session only) | Too fragile (cross-device signup, cookie loss) and not auditable. Used only as the *carrier* between arrival and claim, never as the entitlement itself. |
| **Claim records** (server-side rows) | The core. Durable, revocable, single-consumption, auditable, and bound to `(profile, agency)` — the entitlement lives in the database, not in the URL. |
| **Hybrid: public agency-scoped link → arrival event → claim record → consumed at submission** | **Recommended.** The link is *addressing + attribution*; the claim is *entitlement*; the standard submit pipeline is *enforcement*. |

### 2.2 Flow

```
Agency site "Apply" button
  → https://app.pholio.studio/opencall/{code}          (public, stable, per-channel)
  → GET /opencall/:code (Express or SPA route)
       server validates code → agency ACTIVE? link active?
       records agency_open_call_arrivals row (link_id, ip_hash, UA, ts)
       stores { linkId, agencyId, arrivalId, exp } in req.session.openCallContext
  → Cinematic agency-arrival screen (§6.1)
       ├─ not authenticated → signup/login → onboarding
       │     session survives; context is server-side, never client-supplied
       └─ authenticated → continue
  → On first authenticated request with openCallContext:
       mint agency_open_call_claims row
         (profile_id, agency_id, link_id, arrival_id, status=active, expires_at = now + 14d)
       one active claim per (profile, agency); re-arrival refreshes expiry
  → /apply with the agency preselected — the ONE standard submission wizard,
       all gates intact (program acknowledgment, consent + fingerprint,
       minors/guardian, package validation, drafts, idempotency)
  → Submit transaction (applications.js POST "/"):
       resolve active claim for (profile_id, agency_id) with conditional UPDATE
       ├─ claim valid → application_submission_requests row written with
       │    quota_exempt = true, exemption_claim_id = claim.id;
       │    claim → consumed (same transaction); quota gate skipped
       └─ no claim  → existing quota gate unchanged
  → loadApplicationQuota counts only quota_exempt = false rows
```

**Invariant:** nothing the client sends can assert exemption. The client never transmits "I am exempt"; the server derives it from its own claim table inside the same transaction that enforces quota. Forged query params, replayed URLs, and tampered request bodies are all inert.

### 2.3 Why this contains the bypass to the intended agency

- A claim is a `(profile_id, agency_id)` row; consuming it exempts exactly one submission **to that agency**. It is mechanically incapable of exempting a submission elsewhere.
- Duplicate applications are already impossible (`application_already_submitted`, one live application per `(profile, agency)`), so a claim's maximum lifetime value is **one** exempt submission per agency — and re-submission after withdrawal deliberately does **not** re-exempt (§5, E7).
- A monthly **exemption velocity cap** (recommend `3/month/profile`) bounds the "harvest every agency's public link" strategy (§3, T1).

---

## 3. Threat model / abuse cases

| # | Threat | Mitigation |
|---|---|---|
| **T1** | **Link harvesting:** talent collects many agencies' public open call links to farm free submissions past the 5/month cap. | (a) One exemption per `(profile, agency)` **ever** — you can't reuse a link on the same agency; (b) monthly exemption velocity cap (`OPEN_CALL_EXEMPT_MONTHLY_CAP = 3`): beyond it, invited submissions fall back to normal quota accounting (never blocked outright if quota remains — clear error code `open_call_exemption_cap_reached` otherwise); (c) genuine behavior — arriving from one agency's site — is untouched. Worst case, a determined harvester gets 3 extra targeted submissions/month to agencies that *invited inbound applicants*, which is close to legitimate use. |
| **T2** | **Token replay / shared URLs** (the flaw that killed redirect-apply). | The URL grants nothing by itself. It creates an arrival + claim bound to the *authenticated profile*; consumption is a conditional `UPDATE … WHERE status='active'` inside the submit transaction — atomically once. Concurrent double-submit is already blocked by the idempotency table + unique application constraint. |
| **T3** | **Forged parameters** (`?agency=X&exempt=1`, spoofed Referer). | No client-supplied value participates in the exemption decision. Referer is never trusted. Codes resolve server-side against `agency_open_call_links`; unknown/paused/revoked codes render a graceful non-invited state. |
| **T4** | **Multi-accounting** (new account per 5 submissions). | Orthogonal to this feature (the base quota has the same exposure) but the design adds signal: arrivals record `ip_hash` + UA; disclosure-consent events already record IP/UA per submission (`submission-disclosure-consent.js`). Rate-limit `/opencall/:code` per IP (existing limiter infra in `src/app.js`). Flag profiles whose claims arrive from one IP cluster across many accounts. Firebase-verified email remains the identity anchor. |
| **T5** | **Colluding/fake agency** mints links to sell "unlimited applications". | Structurally worthless: a claim only exempts submissions *to the issuing agency*. A fake agency inflates its own inbox, nothing else. Links require agency `status='ACTIVE'`; agency onboarding is already gated. Monitor per-link claim→submission conversion; Trust & Safety can revoke a link (`status='revoked'`), which cascades `revoked` onto unconsumed claims. |
| **T6** | **Withdraw → resubmit laundering** (audit finding P2-12 noted revived rows historically dodged the counter). | Resubmission after withdrawal writes a fresh quota event and is **never** exempt (the claim was consumed by the original submission). This design closes rather than widens that hole. |
| **T7** | **Open-redirect / phishing via arrival route.** | `/opencall/:code` never redirects to client-supplied URLs; it resolves a code to a known agency row and renders our own screen. Invalid code → generic "this open call isn't available" state, no agency enumeration (codes are 12+ chars, unguessable, no sequential IDs). |
| **T8** | **Minor arrives via agency email link.** | Arrival screen collects nothing. The claim only changes quota math; every minor gate (per-agency guardian consent grant, data minimization, `minor_guardian_consent_required` 403) runs unchanged in the standard pipeline. Agency-side link-management UI should carry a notice that soliciting minors routes through guardian consent. |
| **T9** | **Claim hoarding** (arrive everywhere now, submit months later). | Claims expire 14 days after (re)arrival. Re-arrival refreshes — legitimate, since the talent re-demonstrated the agency-originated path. |
| **T10** | **Agency staff mass-inviting from Discover to dodge talent quotas.** | Discover invites already don't consume talent quota (they're agency-initiated). No new surface. Later: unify Discover invites onto claim records for one audit trail (§8, Phase 4). |

---

## 4. Backend design

### 4.1 Data model (new migrations)

```js
// agency_open_call_links
id                uuid pk
agency_id         uuid fk agencies.id (indexed)
code              string unique — 12–16 char url-safe, crypto-random (not agency slug)
label             string — agency-facing channel name ("Website", "Spring scouting email")
status            enum: active | paused | revoked   (default active)
created_by_user_id uuid fk users.id
created_at / updated_at / revoked_at

// agency_open_call_arrivals  (append-only)
id            uuid pk
link_id       uuid fk agency_open_call_links.id (indexed)
agency_id     uuid (denormalized for reporting)
ip_hash       string  — HMAC(server salt, ip); never raw IP
user_agent    string  — capped length
arrived_at    timestamp
claimed_by_profile_id uuid nullable — set when converted to a claim

// agency_open_call_claims
id             uuid pk
link_id        uuid fk
arrival_id     uuid fk
agency_id      uuid fk (indexed with profile_id)
profile_id     uuid fk profiles.id
status         enum: active | consumed | expired | revoked
created_at / expires_at / consumed_at / revoked_at
consumed_application_id  uuid nullable fk applications.id
// PG: partial unique index on (agency_id, profile_id) WHERE status IN ('active','consumed')
// SQLite dev: enforce in the claim-mint transaction (same pattern the draft table uses)

// alter application_submission_requests
quota_exempt        boolean not null default false
exemption_claim_id  uuid nullable fk agency_open_call_claims.id
// existing idx_submission_requests_profile_status_completed still serves the
// quota count; add (profile_id, quota_exempt, completed_at) if PG plans demand it
```

Nothing changes on `applications` itself; provenance for reads joins through `application_submission_requests.exemption_claim_id` (and the talent-facing list can select it the same way the note subquery works in `GET /api/talent/applications`).

### 4.2 Entitlement & quota logic

`src/domains/talent/services/application-quota.js`:

```js
// count query gains:
.where({ quota_exempt: false })
// return shape gains:
{ used, limit, remaining, unlimited, periodStart, periodEnd,
  exemptUsed,                       // exempt submissions this month (for the meter's honesty line)
  exemptRemainingThisMonth,         // cap - exemptUsed
  activeClaims: [{ agencyId, agencyName, agencyLogo, expiresAt }] }
```

New service `src/domains/talent/services/open-call-claims.js`:
- `resolveActiveClaim(trx, profileId, agencyId)` — `SELECT … FOR UPDATE` on PG.
- `consumeClaim(trx, claimId, applicationId)` — conditional `UPDATE … WHERE id = ? AND status = 'active'`; throws on 0 rows (raced/expired).
- `mintClaimFromSession(db, req, profile)` — converts `req.session.openCallContext`, upserting the one active claim per `(profile, agency)`, refreshing `expires_at`.
- `expireStaleClaims(db)` — sweep, same pattern as `expireInactiveDrafts`.

`POST /api/talent/applications` submit transaction (the **only** insertion point — ~6 lines of change around the existing quota gate at `applications.js` ~768):

```js
const claim = await resolveActiveClaim(trx, profile.id, agencyId);
const exemptCapLeft = await exemptUsedThisMonth(trx, profile.id) < OPEN_CALL_EXEMPT_MONTHLY_CAP;
const exempt = Boolean(claim) && exemptCapLeft;
if (!exempt && !quota.unlimited && quota.remaining === 0) throw MONTHLY_APPLICATION_LIMIT; // enriched: include activeClaims so the UI can offer the invited path
// … existing pipeline unchanged …
await trx("application_submission_requests").insert({ …, quota_exempt: exempt, exemption_claim_id: exempt ? claim.id : null });
if (exempt) await consumeClaim(trx, claim.id, applicationId);
```

Studio+ members: claims are still minted and consumed (attribution + correct history if they later downgrade); `quota_exempt` is recorded but `unlimited` short-circuits the gate exactly as today.

### 4.3 Routes

**Public (`src/routes/api/public.js` + a page route):**
- `GET /opencall/:code` — page entry; records arrival, sets session context, serves the SPA arrival route. (Add `/opencall` to the Vite dev proxy list in `client/vite.config.js`.)
- `GET /api/public/open-call/:code` — arrival-screen data: `{ agency: { name, location, logoPath, openBoards }, valid, alreadyApplied? }`. Rate-limited; no talent data; safe fields only.

**Talent (`src/domains/talent/routes/`):**
- `GET /api/talent/applications/quota` — extended shape (§4.2).
- Rewrite `GET /api/talent/applications/prompt-context` to read **active claims** instead of legacy `invited_by_agency_id` rows (the legacy read stays for history, as the code comment already promises).

**Agency (`src/domains/agency/routes/`, new `open-call.js` composed in `index.js`):**
- `GET/POST /api/agency/open-call/links` — list/create (label required; code server-generated).
- `PATCH /api/agency/open-call/links/:id` — pause/revoke (revoke cascades to unconsumed claims).
- `GET /api/agency/open-call/links/:id/stats` — arrivals → claims → submissions funnel counts.
- RBAC via existing `agency-api-guard.js` / `team-rbac.js` membership checks.

### 4.4 Token/link handling strategy

- **Primary (Phases 1–2): unsigned unguessable codes.** The code is a database key, not a credential. Revocation, pausing, expiry, and scoping are all server-side state — every property the old HMAC design lacked.
- **Phase 3 (personal email invites): signed single-use tokens layered on top.** `base64url(linkId ∥ nonce ∥ exp ∥ HMAC-SHA256(secret, linkId:nonce:exp[:emailHash]))`, verified with `crypto.timingSafeEqual`, nonce persisted on redemption (single-use), short expiry (7 days). This implements exactly the audit's prescription: profile/recipient-bound, expiring, nonce'd, no agency-only payload. A personal token arrival mints the same claim record — everything downstream is identical.
- **Never:** trust in `Referer`/UTM for entitlement (attribution only), client-visible "exempt" flags, non-expiring bearer secrets.

### 4.5 Auditability

Every step leaves a durable, queryable artifact:

1. **Arrival:** append-only `agency_open_call_arrivals` (link, ip_hash, UA, ts).
2. **Entitlement:** claim row with full lifecycle timestamps + terminal status; revocations record `revoked_at`.
3. **Consumption:** `exemption_claim_id` on the immutable quota event (`application_submission_requests`), giving a two-way join: *this submission didn't count because of this claim from this link on this date*.
4. **Consent:** the existing per-submission disclosure event (fingerprint, IP/UA, versions) fires unchanged. Extend the disclosure snapshot with `openCallInvited: true, openCallAgencyId` so the consent record itself reflects the invited framing shown to the user.
5. **Ops:** log lines under an `[OpenCall]` prefix on mint/consume/revoke; funnel metrics per link for the agency and for internal dashboards.

This is the defensibility story: if a user disputes a charge ("I subscribed because Pholio said I was out of submissions"), we can reconstruct exactly which submissions counted, which were exempt, and what the meter displayed.

---

## 5. Edge cases

| # | Case | Behavior |
|---|---|---|
| E1 | Arrival, talent already has a live application to that agency | Arrival screen swaps CTA to "View your submission" (status-aware); no claim minted (`alreadyApplied` from the public endpoint after auth, or resolved at claim-mint time). |
| E2 | Claim expires mid-draft (drafts already have their own TTL) | Submission falls back to normal quota; wizard shows an inline notice ~72h before claim expiry ("Your invitation from {Agency} expires {date}"). |
| E3 | Agency goes non-ACTIVE / is blocked by talent between claim and submit | Existing `agency_unavailable` / blocked-agency gates already abort the submit; sweep marks the claim `revoked`. |
| E4 | Minor arrives via link | All guardian-consent gates unchanged (per-agency grant required). The claim quietly waits; nothing about the invited path may weaken the minor branch. |
| E5 | Studio+ talent arrives via link | Invited framing shown, exemption recorded for attribution, no quota copy (they're unlimited). Downgrade later → history remains correct because counting keys off `quota_exempt`, not tier-at-read-time. |
| E6 | Same agency, multiple links / repeat arrivals | One active claim per `(profile, agency)`; re-arrival updates `link_id`/`arrival_id` and refreshes `expires_at` (last-touch attribution). |
| E7 | Withdraw then resubmit to the invited agency | Claim already `consumed`; resubmission counts against quota. Prevents infinite exempt churn against one agency. |
| E8 | Exemption velocity cap reached with quota also exhausted | 403 with distinct `open_call_exemption_cap_reached` (not the generic limit error) so the UI can explain honestly rather than upselling on a state Studio+ wouldn't change… (it would — Studio+ is unlimited — but the copy must name the actual cause). |
| E9 | Cross-device: arrives on phone, signs up on laptop | Session context is device-bound; Phase 3 personal tokens solve this fully (token redeemable once post-auth). Interim: re-tapping the link while authenticated mints the claim — arrival screen says so if we detect no session ("open this link on the device where you're signed in, or sign in here"). |
| E10 | UTC month boundary, DST | Unchanged — `utcMonthWindow` already anchors UTC; exempt counting reuses it. |
| E11 | Agency deletes/regenerates a link | Old code → `revoked` (unconsumed claims revoked); new code minted. Agencies see a confirm dialog warning live campaigns break. |
| E12 | Race: two tabs submit simultaneously with one claim | Idempotency table + unique application constraint already serialize; claim consumption's conditional UPDATE is the final backstop. |

---

## 6. Frontend changes

### 6.1 Cinematic agency-arrival screen (`/opencall/:code`)

A standalone route like `/reveal` (outside both dashboard shells; registered near `App.jsx:90`). This is the talent's first impression of Pholio *and* a continuation of the agency's own funnel — it must feel like a velvet-rope handoff, not a landing page.

**Design language:** talent-side system (`client/src/domains/talent/DESIGN.md` governs; read before build), landing-page motion physics per root `CLAUDE.md` — Framer Motion springs `stiffness: 55, damping: 16`, standard easing `cubic-bezier(0.4, 0, 0.2, 1)`.

**Staging (one continuous choreography, ~2.5s total, skippable, `prefers-reduced-motion` collapses to a fade):**
1. **Curtain:** `--ag-surface-0` canvas with a single soft radial gold glow (`--ag-shadow-gold` family) breathing in from black-on-cream. No particles, no grain (banned pattern #15).
2. **Agency mark:** the agency logo scales in on the spring (0.92 → 1), followed by the agency name set in Playfair Display / Noto Serif Display — editorial serif, solid ink (`--ag-text-0`). **No gradient text** (banned #12), **no eyebrow/kicker line above it** (banned #1–3).
3. **Headline:** "**{Agency} invited you to submit.**" One serif line. Beneath it, plain-prose supporting copy in Inter (`--ag-text-2`): "You're joining {Agency}'s open call through Pholio — build your submission with digitals, stats, and a comp card, and send it straight to their team."
4. **The honesty line (load-bearing, legal §7):** "Invited submissions to {Agency} don't use your monthly Pholio allowance." Plain text — **not** a pill, chip, or badge (banned #4–7).
5. **What happens next:** three short numbered lines (prepare digitals → review your package → {Agency} reviews) as typeset text with hover-scale micro-interactions — not an icon-card grid (banned #14).
6. **CTA:** one primary gold button (`--ag-gold`). Authenticated → `/dashboard/talent/applications/apply` with the agency preselected. Anonymous → signup, then onboarding, with the claim minted server-side on first authenticated request.
7. **States:** invalid/revoked code → quiet neutral state ("This open call isn't available right now") with a plain path into normal signup — never an error page, never confirmation that an agency exists behind a bad code. `alreadyApplied` → status-aware variant (E1).

**Data:** `GET /api/public/open-call/:code` only. Nothing about the visitor is collected on this screen (T8).

### 6.2 Talent dashboard audit — every surface that must speak the exemption

Grounded against the current tree; each item names the file and the change. All status/provenance rendering is **plain inline text** — the banned-patterns list (root `CLAUDE.md`) rules out chips, badges, count bubbles, and dot indicators for exactly this kind of metadata.

| Surface | File | Change |
|---|---|---|
| **Apply wizard header meter** | `ApplyExperience.jsx` ~1164 (`monthlyLimitLabel`) | Relabel to discovery-only: "2/5 discovery submissions this month". When the *selected agency* has an active claim, the meter line becomes "Invited by {Agency} — this submission won't use your monthly allowance." |
| **Agency chooser step** | `ApplyExperience.jsx` chooser list | On the invited agency's row, one inline text line: "Open call invitation · expires {date}". No corner chip (banned #7). Sort the invited agency first — that's genuine relevance, unlike the removed random matchScore. |
| **Review & Send rail** | `ApplyExperience.jsx` ReviewSendPage acknowledgment rail | Add a line item to the submission-terms rail: "This is an invited open call submission to {Agency}. It does not count toward your monthly limit and is recorded with your consent receipt." Mirrors what §4.5 writes into the disclosure snapshot — UI and audit record must match verbatim in substance. |
| **Limit-reached error path** | `ApplyExperience.jsx` ~702 (`upgradeRequired` branch) + server 403 payload | Server 403 now includes `activeClaims`. The limit state must show the escape hatch *before* the upsell: "You've used 5/5 discovery submissions. You can still submit to {Agency} — they invited you." Then the Studio+ offer. Upselling while hiding a free entitlement the user already holds is the dark-pattern failure mode this feature must never ship with. |
| **Quota toast** | `ApplyExperience.jsx` ~703 | Same copy correction: "Monthly discovery limit reached." |
| **Applications list** | `ApplicationsPage` / applications view + `GET /api/talent/applications` (add provenance via `exemption_claim_id` join) | Each row gains a one-word provenance in the existing metadata line: "Open call" vs "Discovery" — plain text beside the date, matching how `kept_on_file` renders as text. |
| **Dashboard apply prompt** | `DashboardLayoutShell.jsx` ~141 + `GET /applications/prompt-context` | Re-point `targeted` mode from legacy `invited_by_agency_id` to **active claims**: "Finish your submission to {Agency} — their invitation expires {date}." This is the re-engagement loop for talent who bounced at the arrival screen. |
| **Right-sidebar upsell (Zone 4)** | `RightSidebar/RightSidebar.jsx` ~82 | Copy audit: the unlimited-applications pitch becomes "Unlimited discovery submissions". If a quota meter is added here, it counts discovery only, with a secondary plain-text line "+1 invited submission this month" when `exemptUsed > 0`. |
| **Overview tier line** | `OverviewPage/index.jsx` ~248 | If the overview grows a submissions stat, discovery-only with the same secondary line. No new badge. |
| **Settings → Studio+** | `SettingsPage/index.jsx` ~421 | Panel intro "…expanded insights, application volume…" → "…discovery submission volume…", plus one sentence: "Submissions invited by an agency through their open call never count toward the monthly limit, on any plan." Settings is where a user deciding whether to pay reads the fine print — this sentence is the refund-risk killer. |
| **Notifications** | `src/shared/services/notifications.js` + talent notifications routes | Two events: claim minted while signed-out→in ("{Agency} invited you to submit") and claim expiring in 72h. |
| **Submission-program threshold** | server content, §7 | Re-acknowledgment flows through the existing versioned modal automatically. |

**Agency dashboard (companion, smaller):** a "Open call links" panel in `AgencySettings` (or `AgencyTeam`-adjacent) — create/label/pause/revoke links, copy-to-clipboard, and the arrivals→claims→submissions funnel per link. Applicants inbox rows show source "Open call" as plain text — bookers get channel attribution for free, which is the carrot that makes agencies adopt the links.

---

## 7. Legal / policy / subscription communication

*(Engineering/product analysis, not legal advice; items marked [counsel] need attorney review.)*

1. **Versioned in-product disclosure.** Add a section to `SUBMISSION_PROGRAM_CONTENT` (`src/shared/lib/submission-program-content.js`) and bump `CURRENT_SUBMISSION_PROGRAM_VERSION` so every talent re-acknowledges:
   > **Monthly submissions and agency open calls.** Free accounts include 5 discovery submissions per calendar month (UTC); this limit keeps agency inboxes high-quality. When an agency invites you through its own open call link, your submission to that agency does not use your monthly allowance (invited submissions are limited to 3 per month). Studio+ removes the discovery limit.
   The existing acknowledgment machinery gives a timestamped, versioned record that every user saw the rule — the defensibility backbone.
2. **Repo boundary:** Terms of Service / Submission Program Notice *pages* live in **`pholio-landing`**, not here (root `CLAUDE.md` boundary rule). The ToS needs matching fair-use language: limits may change with notice; anti-abuse enforcement (claim revocation, velocity caps) is at Pholio's discretion; open call links are provided to agencies for their own applicant funnels and may not be resold or syndicated. [counsel]
3. **Truthful upsell framing (FTC/consumer-protection posture).** The quota's stated rationale (the existing 403 copy: "to ensure agency submission quality and prevent spam") and its commercial function (Studio+ conversion) must not contradict. The exemption actually *strengthens* the story — the limit demonstrably targets cold discovery volume, not the user's ability to answer an agency that asked for them. Rules: never display an exempt submission as consuming the meter; never show the upgrade CTA as the only path when an active claim exists (§6.2 limit-state); Settings states the exemption before purchase. [counsel on subscription-disclosure wording]
4. **Billing-adjacent copy:** `SubscriptionCheckoutDisclosure.jsx` and the plan blurb should say "unlimited **discovery** submissions" so a subscriber can't claim they paid for something invited submissions already gave them.
5. **Privacy:** arrivals store hashed IP + UA (legitimate-interest anti-abuse telemetry; disclose in the privacy policy's fraud-prevention section — landing repo). Claims are personal data tied to a profile: include them in any DSR export/erasure path; arrival rows with `ip_hash` get a retention window (suggest 13 months, matching a typical fraud-analytics horizon). [counsel]
6. **Minors:** no relaxation anywhere on the invited path (T8/E4). Agency link-management UI carries: "If your campaign reaches talent under 18, Pholio requires verified parent or guardian consent before any submission data is collected."
7. **Industry credibility check (the Booker's sign-off):** "Open call" is the trade-correct term; agencies will recognize routing their own applicant page through a structured submission tool as exactly what premium agency software does. Talent-facing copy keeps the register the apply flow already earned: *submission*, *digitals*, *comp card*, *board* — the invitation framing ("they asked to see you") is also emotionally accurate to how open-call traffic feels, which is why the arrival screen works.

---

## 8. Rollout plan

**Phase 0 — Schema + accounting (invisible).**
Migrations for the three tables + `application_submission_requests` columns (default `false` ⇒ zero behavior change). Extend `loadApplicationQuota` with the `quota_exempt=false` predicate and new return fields. Tests: quota math unchanged for existing data; exempt rows excluded; SQLite + PG parity (the old redirect-apply broke on exactly this).

**Phase 1 — Claims + enforcement behind a flag (`OPEN_CALL_LINKS_ENABLED`).**
Arrival route + public endpoint + session carry-through signup/onboarding + claim mint/consume in the submit transaction + velocity cap. Links minted manually (script/admin) for 3–5 pilot agencies. Integration tests mirroring `redirect-apply-retired.test.js` in spirit: forged params inert, replay-safe, consumption atomic, minor gates intact, cap enforced, revocation works.

**Phase 2 — Full product surface.**
Cinematic arrival screen (§6.1); all §6.2 dashboard surfaces; agency self-serve link management + funnel stats; notifications; `SUBMISSION_PROGRAM_CONTENT` version bump; coordinated ToS/privacy update in `pholio-landing`. Pilot exits to GA on healthy metrics.

**Phase 3 — Personal invite tokens.**
Signed single-use tokens (§4.4) for agency email campaigns; solves cross-device (E9). Same claims downstream.

**Phase 4 — Consolidation.**
Fold agency Discover invites (`invited_by_agency_id`) onto claim records for one provenance model; then retire the legacy column reads in `prompt-context`. Tune the velocity cap on observed data.

**Metrics to watch from Phase 1:** arrivals → claims → submissions funnel per link; exempt share of total submissions; distribution of exemptions per profile (harvesting tell: many agencies, low package quality, near-cap every month); Studio+ conversion rate among users who hit the discovery limit (the feature should *not* reduce this — it removes only conversions that would have churned or charged back); claim-expiry re-engagement rate from the dashboard prompt.

**Kill switch:** flag off ⇒ arrival route degrades to plain signup redirect, claims stop minting/consuming, quota math reverts to counting everything (existing exempt rows retain their flag for history).

---

## 9. Get-right-now vs. safe-to-defer

**Must be real in v1 (Phases 0–1):** claim records with atomic single consumption inside the existing quota transaction; zero client-supplied exemption input; all existing gates untouched (especially minors); exempt-aware quota counting on both SQLite and PG; velocity cap; revocation; the honesty line at arrival and in the limit-reached state.

**Safe to defer:** personal signed tokens (Phase 3); agency self-serve link CRUD (manual issuance is fine for pilot); funnel dashboards; Discover-invite consolidation; notification polish; per-channel attribution reporting.
