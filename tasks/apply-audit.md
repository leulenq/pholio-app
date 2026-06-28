# /apply System Audit — Functional · Industry · Legal · Security

**Date:** 2026-06-28
**Scope:** The talent `/apply` submission flow end-to-end — the wizard UI (`client/src/domains/talent/pages/ApplyPage/ApplyExperience.jsx`), the talent submission/draft/message endpoints (`src/domains/talent/routes/applications.js`), supporting services (send-readiness, validate-submission-package, image-rights, guardian-consent, submission-note AI), the agencies discovery route, and the middleware/rate-limit chain.
**Method:** Four specialist subagents run in parallel, each read-only (no code changed):

| Audit | Model |
|---|---|
| Functional / data wiring | opus |
| Industry (modeling/talent submission standards) | sonnet |
| Legal / privacy / compliance | opus |
| Security | opus |

Severity keys differ per report (P0/P1/P2 for functional/industry/legal; Critical/High/Medium/Low for security) and are preserved as each auditor wrote them.

---

## Consolidated summary

**Solid foundation (do not over-correct):** the transactional core is well-built — per-profile idempotency keys with request-hash replay protection, version+generation optimistic locking, atomic submit-and-retire with event logging, parameterized SQL throughout, every read/write scoped to the session profile (no IDOR found), the note is really persisted/retrievable, stats & digitals are real data, and both-sided notifications fire reliably. Failures are concentrated at the edges.

**Convergent critical issues (flagged by multiple auditors):**

- **C1 — Minor data can reach an agency without an *enforced* guardian-consent gate.** *(Legal P0-1/P0-2 + Industry P0-4.1/4.2)* The submit endpoint and `evaluateSendReadiness` never check minor status; minors are stopped only incidentally; `DigitalsPage` renders a minor's body images unconditionally; the guardian-consent acknowledgement is a static line the minor self-checks; consent is one global timestamp, not per-agency.
- **C2 — The curated package is write-only; the agency never reads it.** *(Functional P0-1/2/3 + Industry 1.1)* The agency inbox loads all live profile images and never reads the submission snapshot, so held-back frames, the chosen media set, the selected comp-card preset, board selection, and (email/phone) contact have no effect on what the booker sees.
- **C3 — The agency `matchScore` is random** (`agencies.js:62-65`) and is used to sort the list. *(Functional P1-7 + Industry P1-5)*

**Recommended order:** (1) enforce minor consent server-side + gate minor body images; (2) make the agency read the submitted package + persist boards relationally; (3) remove/relabel the random match score; then the P1 set (durable consent record, client rights-check mirror, privacy notice, industry status/tone fixes, AI rate-limit, redirect-apply hardening); then P2 polish (terminology, payload bounds).

---

---

# 1. FUNCTIONAL / DATA AUDIT — /apply

*Model: opus*

Scope: `ApplyExperience.jsx` (wizard) → `talent.js`/`api-client.js` → `applications.js` (submit/drafts/messages) → `agencies.js`, `validate-submission-package.js`, `send-readiness.js`, `application-drafts.js`, `image-rights.js`, `notifications.js`. Traced what is persisted, what is sent, and what the agency actually receives.

Headline: the **draft + submit transactional core is genuinely robust** (optimistic concurrency, idempotency table, atomic submit-and-retire). The failure mode is at the **edges**: a large part of what the wizard lets the talent curate is sent to a write-only snapshot the agency never reads, and several backend safeguards (conflict UI, expired-draft recovery, rights gate) are not wired to the front end, so they surface as silent no-ops or generic failures.

## P0 — Broken / data-loss / silent failure

**1. The entire submission package the talent curates is never shown to the agency — book curation, board pick, comp-card variant, and digital-slot picks are write-only.**
The agency inbox loads *all* live profile images (`src/domains/agency/routes/inbox.js:783-788` — `knex("images").whereIn("profile_id", …)`) and never reads `talent_submission_packages`. The snapshot written on submit (`applications.js:675-712`) is only ever read back in `media.js` (a separate "saved packages" feature), never in `src/domains/agency/`. Consequence: "Held back" frames (`ApplyExperience.jsx:2083`), the selected `mediaSetId`, the chosen comp-card preset, and `digitalSlotPicks` have **zero effect** on what the booker sees. The wizard's core promise ("hold back anything that doesn't earn its place", `PAGES` line 82) is cosmetic. Fix: have the agency application-detail view read the submitted `imageIds`/preset from `talent_submission_packages` (or a join table) instead of dumping the full live roster.

**2. Board selection is never persisted relationally — it cannot place the talent on a board.**
`selectedBoards` is sent as `boards`/`boardLabels` (`ApplyExperience.jsx:997-998`), validated server-side, then stored *only* in the snapshot payload (`applications.js:684-685`). There is no insert into `board_applications` (the table the agency boards UI counts from, `inbox.js:95`). The talent's board indication is dropped on the floor. Fix: write a `board_applications` row (or equivalent) on submit, or stop presenting board selection as functional.

**3. The chosen comp-card preset is lost — the agency renders a different card than the talent reviewed/approved.**
Page 05 lets the talent pick a saved variant and previews it via `presetViewUrl` (`ApplyExperience.jsx:2139-2152`, `2346`). On submit the preset id is validated and snapshotted, but submitting does **not** bump `last_used_at`, and the agency's live `/pdf/view/:slug` renders the default (most-recently-used) preset. Since `setDefaultCompCardPreset`/`apply` is the only thing that bumps `last_used_at` (per the comment at `talent.js:140-141`) and it is not called on submit, the agency sees the default card, not the selected one. Fix: call the preset "apply"/default bump inside the submit transaction, or have the agency render from the snapshotted `compCardSeed`/preset id.

## P1 — Fragile / real inconsistency

**4. Server requires distribution rights on every package image; the client never checks it → "send-ready" submissions get rejected with no field guidance.**
Client `evaluateSendReadiness` (`client/src/shared/utils/sendReadiness.js:50-108`) has no rights check, but server `evaluateSendReadiness` adds `missing_distribution_rights` (`src/domains/talent/services/send-readiness.js:99-107`) via `imageHasDistributionRights`, which **fails closed** when an image has no `image_rights` row and no `license_type` (`image-rights.js:102-104`). Any talent whose images lack rights metadata passes the client gate, clicks Submit, and gets a `submission_package_incomplete` 400. The submit `onError` only does `toast.error(err.message)` (`ApplyExperience.jsx:513-519`) with no per-image mapping. Fix: mirror the rights check in the client `checks`/`sendReadiness`, or relax the server gate for talent-owned originals.

**5. Backend's rich draft-conflict handling is swallowed by the client — conflicts and expired drafts fail silently.**
On a `409` during autosave the client resyncs the version and sets status to `'saved'` without re-applying the server payload (`ApplyExperience.jsx:683-694`) — last-write-wins, the other device's edits are clobbered on the next save. The `'conflict'` status in the header map (`ApplyExperience.jsx:1416`) and the backend's `sendDraftLifecycleConflict` `latest` payload (`applications.js:950-970`) are never surfaced. Worse for **expired/deleted drafts**: hydration treats any non-submitted payload as resumable (`ApplyExperience.jsx:631-643`), but every save then returns a lifecycle `409` that is swallowed → the header reads "Saved" forever while nothing persists. `recoverDraft` exists in the API (`talent.js:97-106`) but is **never called** from `/apply`. Fix: handle `draft_conflict`/`draft_expired`/`draft_deleted` in the save + submit paths (offer recover/reload).

**6. Submit `onError` has no handling for the server's 409/422/428 contract.**
Server can return `submission_references_changed` (boards/images changed, `applications.js:534-542`), `draft_consent_required` (`767-773`), `draft_conflict`, `unsupported_draft_schema` (422), `draft_precondition_required` (428). The client mutation only special-cases `upgradeRequired` and otherwise shows a generic "Failed to submit application" (`ApplyExperience.jsx:513-519`). A talent whose draft references changed gets a dead-end toast with no "review repaired draft" action, even though the server returned `repairWarnings`. Fix: branch on `err.data.error` and route the user back to the affected step.

**7. `matchScore` is an explicit mock and non-deterministic — re-sorts the agency list randomly on every fetch.**
`agencies.js:62-65`: `score = 60 + Math.floor(Math.random()*35)` with a `Math.random() > 0.5` style "breakdown" (`:87`). For Pro users the score is shown (`MatchMark`, `ApplyExperience.jsx:1588-1597`, `1631`) and the list is sorted by it (`agencies.js:105`), so order shuffles between refetches. Free users get it nulled. Fix: replace with a real heuristic (location + division + board fit against profile) or stop sorting/displaying by it.

**8. `redirect-apply` ("bypasses limits") is doubly broken.**
It inserts with `knex.raw("gen_random_uuid()")` (`applications.js:1861`), a Postgres-only function that throws on SQLite-dev. It also never writes a snapshot/note and never checks agency `status`. And the token it requires is never minted anywhere (`verifyAgencyInviteToken` always fails without `AGENCY_INVITE_SECRET` + issuance, per the file's own comment at `:96-98`), so the endpoint rejects every real request today. Fix: use `uuidv4()` like the main path, or remove the dead route until issuance exists.

## P2 — Polish / hardcode

**9. `"5.5 × 8.5"` comp-card format is hardcoded text** in two places (`ApplyExperience.jsx:2299`, `2693`). Correct as the US standard, but it is a literal, not derived from the card engine.

**10. Captured success payload is partly dead.** `applyMutation.onSuccess` stores `mediaSetName`, `compCardName`, `frameCount` (`ApplyExperience.jsx:504-507`) but `ApplySuccess` only consumes `firstName/agencyName/submittedAt/market` (`:2859`). Harmless, but dead data.

**11. `schemaVersion` is not sent in `submissionPackage`** (`ApplyExperience.jsx:994-1013`), so server reads `undefined` → `Number(undefined)=NaN` and the schema-version guard at `applications.js:515` is effectively inert on the submit path (it works on the draft path). Low risk; tighten if schema versioning is meant to gate submit.

**12. Reapply after withdraw does not re-stamp `created_at`,** so the monthly 5/mo counter (`applications.js:473-479`, counts `created_at >= startOfMonth`) doesn't increment on resubmission of a revived row (`:642-650`) — a talent can withdraw+resubmit a given agency without consuming quota. Minor abuse vector.

**13. Client/server month-count basis differs slightly:** client `monthCount` counts all loaded apps incl. withdrawn over current month (`ApplyExperience.jsx:729-734`); server counts the same window but the label "X/5" can drift from the server's authoritative count if pagination ever limits the apps query. Cosmetic today.

## Verified-correct (not findings)

- **Note** is genuinely persisted and retrievable: written as the first `TALENT` message on submit (`applications.js:714-722`) and read back via the subquery in `GET /applications` (`:233-239`) and `GET /:id/messages`. Top-level `note` is consumed; `submissionPackage.consentConfirmed` is enforced (`:407`).
- **Idempotency / draft concurrency / atomic submit** are solid: idempotency-key table with request-hash replay (`:381-405`, `:792-816`), version+generation optimistic locks, `forUpdate` agency guard on PG, transactional draft retire + event log (`:585-753`).
- **Stats and digitals are real data** (`buildStats`/`digitalSet` from `profile`/`images`), not placeholders. The comp-card iframe renders the live `/pdf/view/:slug` (real), with a `seed` fallback — the *content* is real even though the *selected preset* is dropped (finding 3).
- **Notifications fire correctly** for both sides on submit (`:821-847`, `notifyTalentApplicationSubmitted` / `notifyAgencyNewApplication`), each wrapped so a notify failure never fails the submit.

## Top fixes (highest value)

1. **Make the agency read the submitted package** (`talent_submission_packages` imageIds/preset), not the full live roster — this alone makes findings 1 and 3 real instead of theater. (`inbox.js:783`)
2. **Persist board selection relationally** (`board_applications`) on submit so the talent's board indication actually places them. (`applications.js` submit txn)
3. **Mirror the server distribution-rights gate in the client** `checks`, or relax it for owned originals — currently a silent hard-block for talent without rights metadata. (`sendReadiness.js` ↔ `send-readiness.js:99`)
4. **Wire 409/expired-draft handling in the client** save + submit paths (use the existing `recoverDraft` and the `latest` conflict payload) so saves stop silently no-op'ing. (`ApplyExperience.jsx:683-694`, `513-519`)
5. **Replace the random `matchScore`** with a deterministic heuristic so the agency list ordering is stable and the displayed score is meaningful. (`agencies.js:62-65`)

---

---

# 2. INDUSTRY AUDIT — /apply

*Model: sonnet*

**Scope:** The talent submission wizard (7 pages: board → digitals → stats → book → comp card → message → review & send) plus the success state, status model, and agency model. Audited against the in-house industry standards, glossary, and lifecycle canonical state machines.

**Files examined:** `client/src/domains/talent/pages/ApplyPage/ApplyExperience.jsx` · `client/src/domains/talent/utils/applicationStatus.js` · `src/domains/talent/routes/applications.js` · `src/domains/talent/routes/agencies.js`

### Grading key

| Grade | Meaning |
|---|---|
| P0 | Compliance failure or single fastest "built by outsiders" tell |
| P1 | Real workflow or terminology gap that working talent/bookers would notice |
| P2 | Realism polish — right direction, rough edge |

## 1. Package composition — what's included and what's missing

### What works
The five-slot digitals set (headshot · ¾ length · full-length · profile/side · back) is correct and matches the industry standard exactly. The hard separation between digitals and book frames (`isDigitalSlot` / `isBookFrame`) is trade-accurate and explicitly commented: "a styled book frame never stands in." Stats are dual-unit with a 90-day staleness check. The comp card spec (5.5" × 8.5", two-sided) is industry-correct. Board selection sources only the agency's own published `open_boards`, the copy explicitly hands placement back to the agency ("the agency makes the final placement"), and the submission is confirmed as non-public. These are the things that make it read real.

### Finding 1.1 — P1: Email and phone are required for send-readiness but neither appears in the submission package the agency receives
**Industry reality:** A booker receiving a submission must be able to follow up immediately by phone or email. That contact information is part of every real submission — typically printed on the comp card back alongside stats.
**What Pholio does:** The `checks` array (lines 817–823) correctly requires `profile.email` and `profile.phone` for send-readiness. However, `profileSocials()` (line 2532) returns only Instagram, Twitter, TikTok, and YouTube handles — no phone, no email. The `hasContact` flag and the entire "Contact" section in `ReviewSendPage` (lines 2587, 2706–2743) are built from socials + portfolio URL only. The `talent_submission_packages` payload stored in the DB (applications.js lines 680–710) also stores no contact info. The agency receives social icon links and a portfolio URL — not a phone number or email address.
**The fix:** Add `profile.email` and (optionally displayed) `profile.phone` to the contact section in `ReviewSendPage` and to the stored submission package. The data is already required and on file — it just isn't surfaced.

### Finding 1.2 — P1: "Division" field in the review package is the talent's gender, not their board division
**Industry reality:** "Division" on a submission package means the roster grouping — Women's Fashion, Commercial, Curve, Kids, etc. — not the talent's sex.
**What Pholio does:** Line 2577: `const division = gender ? gender.charAt(0).toUpperCase() + gender.slice(1) : boardLabels?.[0] || null;` — so the review package section `apply-package__traits` displays `Division: Female`. A booker reading the submission sees a "Division" field that reads "Female" where they expect "Women's Commercial" or "Curve."
**The fix:** Rename the field to "Gender" if that's what it shows, or derive it from actual board/division data when available. Do not call gender "Division."

### Finding 1.3 — P2: Talent's home market / city not in the review package
**Industry reality:** International bookers need to know where the talent is based (affects placement viability, day rates, travel budget, visa requirements).
**What Pholio does:** The review masthead shows the agency's location, not the talent's. `profile.location` exists in the data but is not surfaced in the submission package view.
**The fix:** Add a single "Based in [talent city/country]" line to the package masthead or stats section.

### Finding 1.4 — P2: No nationality or language fields
Standard for any cross-border submission. Not a blocker at MVP, but visible absence to an international booker.

## 2. Terminology

### What works
"Digitals" is used correctly throughout, including the standfirst: *"Your raw set — the truth check agencies assess first. Current, unretouched, head to toe."* This is trade-accurate. "Book" is distinct from digitals and described correctly as *"Your best work — supporting your digitals, never replacing them."* "Comp card" with the correct format spec. "Board" used as agency-side classification (not a talent-side tag). "Submission" used in the success state, monthly limit copy, and the review masthead ("Representation submission"). "Kept on File" in `applicationStatus.js` — correct industry term. The `meeting_requested` detail correctly says "a go-see." The success-state "What happens next" guidance (*"reviews new submissions in batches... a reply usually takes anywhere from a few days to a few weeks"*) is realistic and honest.

### Finding 2.1 — P1: `aria-label="Application workspace"` and `"Opening application workspace…"` use the wrong register
**Industry reality:** Talent submit digitals to agencies. The industry word is "submission." "Application" is a job-application / HR register — the glossary explicitly maps "job application / cover letter (to an agency)" → "submission / getting scouted / open call."
**What Pholio does:** Line 1433: `<header className="apply-workspace-top" aria-label="Application workspace">`; Line 1068: `Opening application workspace…` (loading state). Both are accessible-tree text and fallback copy that a screen-reader user or developer inspecting the DOM would see.
**The fix:** Replace both with "Submission workspace" / "Opening submission workspace…"

### Finding 2.2 — P2: Status label `meeting_requested` → "Meeting Requested" without "go-see"
**Industry reality:** A talent meeting a client for a specific job is a "casting." A talent meeting a client generally is a "go-see." A talent meeting the *agency itself* (for representation) is a "meeting" or "go-see with the agency."
**What Pholio does:** `applicationStatus.js` line 65: `label: 'Meeting Requested'` with `detail: 'The agency invited you to a meeting (a go-see).'` — the detail correctly uses "go-see" but the headline status label does not.
**The fix:** Change the label to `'Go-See Requested'` or at minimum `'Meeting / Go-See'` to match the detail.

### Finding 2.3 — P2: Section title "Statistics" in the review package
**Industry reality:** The industry says "stats" on comp cards and in casual usage; "measurements" in precision settings. "Statistics" is a formal/mathematical register — a booker doesn't say "please check her statistics."
**What Pholio does:** `ReviewSendPage` line 2614: `title: 'Statistics'`. The Stats page itself (Page 03) correctly uses `title: 'Stats'`.
**The fix:** Change the review package section title from `'Statistics'` to `'Stats'` or `'Measurements'`.

## 3. State model realism

### What works
The pipeline is impressively complete: pending → reviewing → shortlisted → requested_more → meeting_requested → accepted → booked. `kept_on_file` is present and correctly classified as `group: 'advancing'` (soft yes, not a rejection) — above-average industry knowledge. Withdrawal capability exists.

### Finding 3.1 — P1: No "Development / New Face" state
**Industry reality:** At most major agencies the first positive outcome of a submission is *not* a signing — it is a development offer. "New face" / "development" talent are on the agency's books but being built up before they are fully bookable. The lifecycle canonical state machine lists `Development offer (new face)` as distinct from `Signed / represented`.
**What Pholio does:** `accepted` (label: "Accepted") rolls straight to `booked` (label: "Represented"). A talent who gets a development offer sees "Accepted," conflating "we want to develop you over the next 6 months" with "you are signed." `applicationStatus.js` line 69–76.
**The fix:** Add a `development` status with label "Development Offer" / "New Face — Development," `group: 'advancing'`, and a `next` copy explaining the build-up period.

### Finding 3.2 — P1: `WITHDRAWABLE_STATUSES` does not include `requested_more`, `meeting_requested`, `kept_on_file`, or `accepted`
**Industry reality:** A talent can step back from a representation conversation at any point before signing. No agency relationship is coercive before ink.
**What Pholio does:** `applications.js` line 51–56: `const WITHDRAWABLE_STATUSES = new Set(["pending","submitted","reviewing","shortlisted"]);` A talent with status `requested_more` or `meeting_requested` cannot withdraw — locked into the conversation.
**The fix:** Add at minimum `"requested_more"`, `"meeting_requested"`, `"kept_on_file"` (consider `"accepted"`) to `WITHDRAWABLE_STATUSES`.

### Finding 3.3 — P1: `kept_on_file` renders with `tone: 'closed'` visually indistinguishable from rejection
**Industry reality:** "Kept on file" is the industry's most common *positive* inbound outcome — "we like you and will call when a slot opens." Not a rejection.
**What Pholio does:** `applicationStatus.js` line 136: `tone: 'closed'` for `kept_on_file`. The comment is explicit: *"tone stays 'closed' so existing CSS classes and ApplicationsView filter logic continues to work without changes."* In the applications view, "Kept on File" appears visually identically to "Not Selected."
**The fix:** Define a new tone value — `'file'` or `'soft-yes'` — for `kept_on_file` and update the CSS/filter logic. The comment acknowledges the hack; unwind it.

### Finding 3.4 — P2: No multi-agency / mother-agency model in the representation concept
**Industry reality:** A model is normally represented by multiple agencies simultaneously (non-exclusively): one mother agency + market agencies. The "one submission per agency" is correctly modelled, but there is no concept of "I already have a mother agency and am seeking a placement-only relationship here." Architectural, not a fix-in-this-flow item.

## 4. Minors compliance

### What works
`isMinorProfile()` and `hasGuardianConsent()` are imported and used in DigitalsPage, StatsPage, CompCardPage, and ReviewSendPage. The CompCardPage has a hard block (`minorBlocked` gate at line 2168) that prevents a minor without consent from viewing or selecting their comp card. The stats page shows: *"Under-18 — your measurements are shared only with the agency you submit to, never published."*

### Finding 4.1 — P0: Minor's full-body digital images are rendered in DigitalsPage without guardian consent
**Industry reality:** Measurements, full-length, and form-fitting images for a minor are heightened-sensitivity data. Guardian consent must precede collection and exposure — not run concurrently.
**What Pholio does:** In `DigitalsPage` (lines 1797–1849), the `digitalSet.map()` loop renders all five slot images unconditionally — for minors without consent as well. The consent banner (lines 1763–1780) is informational only. Compare `CompCardPage` line 2210: `if (minorBlocked) { return <gated state>; }` — hard gate. DigitalsPage applies no equivalent gate.
**The fix:** For `isMinor && !guardianConsent`, replace image thumbnails in `DigitalsPage` with a redacted/placeholder state (grey slot + lock icon) and a single CTA to record consent.

### Finding 4.2 — P1: "A parent or guardian has consented to this submission" is a static display item, not a verified gate
**What Pholio does:** `ReviewSendPage` line 2797 renders the line statically; it is not gated against `hasGuardianConsent(profile)`. A minor lacking a consent record still sees this text as a declared truth, alongside the consent checkbox they're about to tick.
**The fix:** Conditionally render differently when consent is not on file — e.g. *"Guardian consent not yet recorded — [Record it here] before submitting."* Do not display it as confirmed fact.

## 5. Match score — P1
**Industry reality:** A real match score would derive from division alignment, home market, board openings, physical requirements, agency tier vs. career stage. Agencies don't publish such a score, so it's product-invented — but it must be based on real data to have value.
**What Pholio does:** `agencies.js` line 63: `let score = 60 + Math.floor(Math.random() * 35)` — random, biased only by a loose location match. Rendered as "Match 87 / Strong affinity" with full authority in the chooser, and the list is sorted by it.
**The fix:** Remove it until real signals exist (preferred — absence is more credible than fiction), or label "Provisional match."

## 6. "Secure Submission" framing — P2
**Industry reality:** Real submissions are private by default; there's no "secure vs insecure" framing in talent workflows. The reassurance that matters is "this doesn't go public."
**What Pholio does:** `const SECURE_FLOW_NAME = 'Secure Submission'` (line 2529) labels the review rail; the copy under it is correct but the label reads like SSL/banking UI.
**The fix:** Rename to "Submission Terms," "Agency Submission," or remove the label and let the acknowledgments stand alone.

## Summary scorecard

| # | Finding | Grade | Surface |
|---|---|---|---|
| 1.1 | Email/phone not transmitted in submission package | P1 | ReviewSendPage / applications.js |
| 1.2 | "Division" field is gender, not board division | P1 | ReviewSendPage line 2577 |
| 1.3 | Talent home city absent from package | P2 | ReviewSendPage masthead |
| 2.1 | "Application workspace" instead of "Submission workspace" | P1 | ApplyHeader aria-label / loader |
| 2.2 | "Meeting Requested" doesn't say go-see | P2 | applicationStatus.js line 65 |
| 2.3 | "Statistics" instead of "Stats" in review | P2 | ReviewSendPage section title |
| 3.1 | No development/new face state | P1 | applicationStatus.js |
| 3.2 | Cannot withdraw from requested_more / meeting_requested / kept_on_file | P1 | applications.js line 51 |
| 3.3 | kept_on_file styled identically to rejection (tone:'closed') | P1 | applicationStatus.js line 136 |
| 3.4 | No mother-agency / multi-agency model | P2 | Architecture |
| 4.1 | Minor body images shown without guardian consent in DigitalsPage | P0 | ApplyExperience.jsx DigitalsPage |
| 4.2 | Guardian consent displayed as fact, not verified | P1 | ReviewSendPage line 2797 |
| 5.0 | Match score is randomly generated | P1 | agencies.js line 63 |
| 6.0 | "Secure Submission" label wrong register | P2 | ReviewSendPage line 2529 |

## Highest-leverage fixes (top 5)
1. **P0 — Suppress minor body images in DigitalsPage until guardian consent is on file** (reuse the CompCardPage pattern).
2. **P1 — Surface email and phone in the submission package** (add `profile.email`/`profile.phone` to the contact section + stored payload).
3. **P1 — Remove or honestly label the random match score** (`agencies.js:63`).
4. **P1 — Fix `kept_on_file` visual tone** (new `'file'` tone, update CSS + filter logic).
5. **P1 — Expand `WITHDRAWABLE_STATUSES`** to include `requested_more`, `meeting_requested`, `kept_on_file`.

---

---

# 3. LEGAL AUDIT — /apply

*Model: opus*

**Scope:** Pholio talent submission experience (`/apply`) — consent capture, minor handling, data sharing to third-party agencies, image rights, notice, retention, withdrawal, attestation.
**Method:** Code-grounded read of the apply UI, the submission/draft endpoints, the minor-compliance and image-rights libraries, the submission validator, and the existing `tasks/legal-audit.md` (dated 2026-06-25, app-wide). This is an engineering/product audit, **not legal advice**; items marked *[counsel]* need a licensed attorney. Jurisdiction split flagged US-state vs GDPR.

**Headline:** Since the prior audit, real infrastructure now exists — a **token-verified guardian-consent email flow** (`src/domains/talent/services/guardian-consent.js`), **account-level Terms/Privacy acceptance** at signup (`recordLegalAcceptance`, `migrations/20260625120000_add_legal_acceptance_to_users.js`), a **server-side image-distribution-rights gate** that actually blocks sends, and **idempotent, version-pinned submission acknowledgement**. The apply flow is materially more defensible than the 2026-06-25 baseline. **However, the single highest-risk control — preventing a minor's sensitive data from reaching an agency without guardian authorization — is not enforced on the submission endpoint itself.** It is achieved only as an incidental side-effect of unrelated gates, and the guardian's consent is generic and one-time rather than tied to the specific disclosure.

## P0 — Legal / compliance exposure (minors)

### P0-1 — No explicit guardian-consent gate on the submission endpoint; minor protection on /apply is incidental, not enforced
**Principle:** Disclosing a minor's body measurements, full-length images, and contact data to a commercial third party requires verifiable parental consent *as a precondition of that disclosure* (COPPA for under-13; GDPR Art. 8 for 13–16; state minor-privacy and child-performer law). The control must be a positive gate on the data-sharing action.
**What Pholio does today:** The submission handler `POST /api/talent/applications` (`applications.js:315-851`) validates the package via `validateSubmissionPackage` (`validate-submission-package.js`), which calls `evaluateSendReadiness` (`send-readiness.js:54-130`). **Neither calls `isMinorProfile`, `hasGuardianConsent`, nor `minorPublicExposureAllowed`.** The apply path has zero minor references (minor gating lives only in `profile.js`, `media.js`, `settings.js`, `guardian-consent.js`). The minor branches in `ApplyExperience.jsx` (DigitalsPage `:1764-1780`, StatsPage `:1951-1955`, CompCardPage `minorBlocked` `:2210-2224`) are **UI copy only**; `canSubmit` (`:909-914`) checks `consent`, send-readiness, and draft hydration, never minor status. A minor is stopped only indirectly (can't save measurements `profile.js:718`; can't make full-length/full_body visible `media.js:144`). Any frame whose `shot_type` isn't exactly `full_length`/`full_body` but still shows the body, or data present before a consent revocation (`profile.js:702` nulls `guardian_consent_at` but doesn't scrub already-eligible images), can pass to the agency with no guardian authorization and no explicit check at the point of sharing.
**Remediation:** In the `POST /` handler, after loading the profile, fail closed: `if (isMinorProfile(profile) && !hasGuardianConsent(profile)) return 403`. Add the same assertion inside `evaluateSendReadiness` as a `sendBlocker` (`code: "minor_guardian_consent_required"`). Small, highest value.

### P0-2 — Guardian consent is generic and one-time, not consent to disclose to the specific agency; minor self-attests the guardian acknowledgement
**Principle:** Parental consent must be specific and informed as to *what* is shared and *with whom*.
**What Pholio does today:** `guardian_consent_at` is a single global timestamp (`migrations/20260624210000`, set by `guardian-consent.js:217`). Once set, the minor can submit to unlimited agencies (cap 5/month, `applications.js:479`) with the guardian never told which agencies receive the package and never re-authorizing. At review, the acknowledgement *"A parent or guardian has consented to this submission"* (`ApplyExperience.jsx:2797-2799`) is **checked by the minor**, under the single consent checkbox (`:2821-2826`). Coogan trust / work-permit are absent — `work_permit_on_file` is unverified and never read at submission; no chaperone/hours/trust-account concept. *[counsel]*
**Remediation:** For minors, capture per-submission guardian authorization naming the agency (or notify the guardian-on-file email per agency submission, reusing the existing token infra). Surface `work_permit_on_file` as a submission consideration. Decide policy on minors sharing direct contact/socials at all.

## P1 — Gaps a serious product must close

### P1-1 — No durable, auditable consent record for the act of sharing
**Principle:** Consent must be demonstrable — who consented, to what, when, to which recipient, against which disclosure text/version.
**Today:** Consent is an ephemeral boolean. The server requires `submissionPackage.consentConfirmed === true` (`applications.js:407-413`) and the draft's persisted `consent === true` (`:622-629`), but the only persisted artifact is `talent_submission_packages.payload.consentConfirmed` (boolean) + `submittedAt` + `agencyId` + snapshotted `imageIds` (`:675-711`) — and that write is **conditional on `hasSubmissionPackagesTable`** (`:582`, `:671`), so if the table is absent, nothing is recorded. No record of the consent text/version, the acting user, or IP/UA.
**Remediation:** Write an immutable consent/disclosure event (user_id, profile_id, agency_id, package fingerprint, consent_text_version, acknowledgement_version, timestamp, IP/UA) unconditionally inside the submission transaction. Version the Secure Submission acknowledgement copy the way `submission-program.js` already versions the program notice (`CURRENT_SUBMISSION_PROGRAM_VERSION`).

### P1-2 — Consent is not bound to package contents; re-consent on change is not enforced
**Today:** Consent is deliberately re-confirmed (not auto-restored from draft, `:619`) — good. But once checked, the talent can navigate back, swap digitals/book/comp-card or edit the note, and submit; `consent` is a single boolean (`:430`) not bound to a package hash. The server can legitimately *change* the package (`repairWarnings`/`submission_references_changed`, `:534-542`), yet the consent boolean still reads true.
**Remediation:** Bind consent to a fingerprint of the exact package (image IDs, comp-card preset, boards, note) and invalidate it server-side when the normalized package differs.

### P1-3 — No privacy notice / data-disclosure transparency at the point of submission
**Today:** The one-time "threshold" (`SUBMISSION_PROGRAM_CONTENT`, `src/shared/lib/submission-program-content.js`) explains the *program* but contains **no privacy notice, no Terms/Privacy link, and no enumeration of the sensitive categories disclosed** (DOB-derived age, measurements, full-length body images, contact, socials, portfolio). The Secure Submission rail asserts *"never published, never shared elsewhere"* (`ApplyExperience.jsx:2790-2791`) but says nothing about retention or the agency becoming an independent/joint controller. Account-level Terms/Privacy acceptance exists at signup (`auth.js:427`) but the documents' content/existence is unverified and there is no submission-time disclosure.
**Remediation:** Add a concise data-disclosure notice + Terms/Privacy links to the threshold and/or review step; confirm `/terms` and `/privacy` actually resolve.

### P1-4 — Image-rights gate is enforced but trivially satisfiable; no real model release required
**Today (improved):** `validateImagesForDistribution` (`image-rights.js:107-130`) is wired into the send gate and blocks when rights are missing. **But** `imageHasDistributionRights` (`:83-105`) returns true if *any* non-empty `license_type` string is present and status isn't explicitly denied (`:103`). Typing any value ("x") clears the gate. A genuine model-release schema exists (`imageModelReleasePutSchema`, `validation.js:1597`) but the gate doesn't require it; photographer ownership is unverified. *[counsel]*
**Remediation:** Require a meaningful rights basis (owned/licensed/model-release-on-file) rather than any free-text string; for minors require the release signer to be the guardian.

### P1-5 — Withdrawal is a status flip, not a recall or erasure of shared data; submitted snapshots have no retention limit
**Today:** `POST /:id/withdraw` (`applications.js:1553-1621`) sets status `withdrawn` and notifies the agency, but the agency retains the full snapshot/messages/exports. Drafts have proper lifecycle/TTL (`expires_at`, `expireInactiveDrafts`, `scrubUnrecoverableDrafts`) — good — but the **submitted package snapshot has no TTL or erasure path**. No submission-scoped data-subject-rights handling.
**Remediation:** Define retention for submitted packages; on withdrawal, offer recall/redaction of the shared snapshot and a DSR path scoped to the disclosure. *[counsel]*

### P1-6 — `redirect-apply` path creates applications with zero consent capture
**Today:** `POST /redirect-apply` (`applications.js:1806-1899`) creates an application with **no `submissionPackage`, no `consentConfirmed`, no send-readiness, and no minor gate**. HMAC-gated and fail-closed (no issuance code exists), but if invite issuance is ever built it would mint applications disclosing a profile with no consent record and no minor check.
**Remediation:** Route any future invite-accept through the same consent + minor gates.

## P2 — Improvements
- **P2-1 Attestation bundling:** the three acknowledgements (accurate/unretouched/current; 18+ *or* guardian-consented; review-not-guarantee) are bound by **one** checkbox (`:2794-2826`). Separating the age/guardian attestation strengthens enforceability. "Unretouched" is unvalidated though `retouched_at` metadata exists (`validation.js:1419`).
- **P2-2 Minor data minimization:** minors' measurements, contact, social handles are shared identically to adults — no minor-specific minimization.
- **P2-3 "Never shared elsewhere" accuracy:** backend-true for this flow, but the prior app-wide audit flags public, unsigned R2 image URLs which technically undercut the literal claim.

## Prioritized remediation list
1. **(P0-1)** Add an explicit server-side minor gate to `POST /api/talent/applications` and `evaluateSendReadiness`. Fail closed. *(small, highest value)*
2. **(P0-2)** Make guardian consent specific to the disclosure; stop letting the minor self-check the guardian acknowledgement.
3. **(P1-1)** Persist an immutable, unconditional consent/disclosure event; remove the `hasSubmissionPackagesTable` conditionality for the consent record.
4. **(P1-2)** Bind consent to a package fingerprint; invalidate on normalization changes.
5. **(P1-3)** Add a submission-time data-disclosure notice + Terms/Privacy links; verify those pages exist.
6. **(P1-5)** Define retention for submitted snapshots; add recall/erasure on withdrawal; wire submission-scoped DSR. *[counsel]*
7. **(P1-4)** Tighten the image-rights gate beyond "any license_type string"; guardian-signed for minors. *[counsel]*
8. **(P1-6)** Gate any future `redirect-apply` issuance through consent + minor checks.
9. **(P2)** Separate the age attestation; minor-specific minimization; reconcile "never shared elsewhere" with public R2 URLs.

**Jurisdiction flags:** COPPA (<13), GDPR Art. 8 (13–16), and US state child-performer/minor-privacy law (e.g. CA) bite differently; P0-1/P0-2 are the common floor. Erasure/withdrawal/retention (P1-5) and controller-relationship notice (P1-3) are GDPR/UK-GDPR/CPRA-driven and become mandatory once EU/UK or California talent use the flow. Image redistribution and model release (P1-4) are US copyright + right-of-publicity. All *[counsel]* items need attorney review before launch.

---

---

# 4. SECURITY AUDIT — /apply

*Model: opus*

Scope: talent `/apply` backend (`applications.js`, `submission-note.js`), supporting auth/middleware/validation/rights libs, the agencies discovery route, and the rate-limit/middleware chain in `app.js`. Read-only review.

Overall the surface is materially better hardened than typical: every read/write is scoped to the session's `profile_id`, draft payloads are whitelisted not trusted, idempotency is per-profile, and SQL is parameterized. The real exposure is concentrated in (a) the AI note endpoints having no rate limit, and (b) the design of the redirect-apply invite token and the fact that path bypasses readiness gates.

## Findings

### MEDIUM — AI note endpoints have no rate limit (cost / quota abuse)
- Class: Missing rate limiting / resource exhaustion (CWE-770)
- Location: `src/domains/talent/routes/submission-note.js:65,94,129` (mounted `index.js:37`); limiter wiring `src/app.js:458-482`
- Detail: `app.js` only rate-limits `/login`, `/signup`, `/upload`, `/api/talent/media`, message POSTs, and `/api/reports`. The three Groq-backed endpoints `POST /api/talent/submission-note/{draft,sharpen,shorten}` are not covered. Each call runs up to `MAX_ATTEMPTS = 3` Groq completions (`note-writer.js:14,46`). Studio+ gating is enforced server-side (`requireStudioPlus` → `profile.is_pro`, `studio-plus.js:10-22`), so the abuser must hold a Studio+ session, but any such (or compromised) account can loop unbounded → Groq spend and latency DoS.
- Exploit: authenticated Studio+ talent scripts `while(true) POST /submission-note/draft`.
- Fix: add a dedicated limiter (reuse the `messageLimiter` pattern keyed by session) to `/api/talent/submission-note/*` and the sibling `/api/talent/bio`, `/training-summary`, `/message-polish` AI routes.

### MEDIUM — redirect-apply invite token is static, non-expiring, replayable, and not profile-bound
- Class: Broken authn token design / replay (CWE-294, CWE-640)
- Location: `verifyAgencyInviteToken()` `applications.js:109-139`; consumer `:1806-1899`
- Detail: token is `HMAC_SHA256(AGENCY_INVITE_SECRET, "<agencyId>")` and the verifier accepts the agency-only binding as well as agency+profile (`payloads = ["${agencyId}", "${agencyId}:${profileId}"]`, line 124). The agency-only form is a single static secret per agency with no expiry, no nonce, no per-use invalidation. Anyone who observes one such token (shared invite URL, Referer, history, proxy/CDN logs) can replay it from any talent account, indefinitely, to take the "No limit check" path (line 1858).
- Mitigating reality: latent — no issuance code in the repo, verification fail-closes when `AGENCY_INVITE_SECRET` unset (110-113), HMAC compare is constant-time (132). Risk crystallizes when issuance is built with the agency-only binding.
- Fix: sign `agencyId:profileId:exp:nonce`, require/verify the profile binding and `exp`, drop the agency-only payload, persist a one-time/used marker.

### MEDIUM — redirect-apply skips the readiness, acknowledgment, and agency-active gates the main path enforces
- Class: Inconsistent authorization / gate bypass (CWE-863)
- Location: `applications.js:1806-1899`
- Detail: the main submit enforces program acknowledgment (350), consent (407), package + image-rights validation (453-465, 558-576), agency `ACTIVE` status (502, 590-601), idempotency (361-405). redirect-apply does none — straight to `INSERT` after token check. Uses `knex.raw("gen_random_uuid()")` (1861) — Postgres-only, throws on SQLite; no idempotency/locking so two concurrent posts can double-insert.
- Fix: route through the same validation/acknowledgment/agency-status path, add idempotency, replace raw UUID with `uuidv4()`.

### LOW — Client-supplied package strings stored verbatim and unbounded
- Class: Improper input validation / storage abuse (CWE-20)
- Location: `applications.js:687-708`
- Detail: security-relevant fields (`boards`, `mediaSetId`, `digitalSlotPicks`, `compCardPreset`, `imageIds`) are correctly re-derived server-side, but display fields `mediaSetName`, `compCardName`, `compCardId`, `readiness`, `digitalsGaps`, `untypedImageCount` are taken straight from the body with no length/type validation, persisted, and shown to the agency. No XSS (React auto-escapes), but row bloat / storage abuse.
- Fix: cap and type-check before insert (as already done for `note` at 1200 and `untypedImageCount`).

### LOW — Prompt-injection delimiter breakout in AI note endpoints
- Class: LLM prompt injection (CWE-1427)
- Location: `submission-note-writer/prompt-builder.js:62-64,86-88`
- Detail: the user note is embedded inside `"""…"""` with repeated "treat as content, never instructions" guards and rubric validation (`note-writer.js:62`). A note containing the literal `"""` can break the delimiter; the "context is data" instruction is soft. Impact low — output returns to the same talent and becomes that talent's own message; no cross-tenant/privilege crossing.
- Fix: strip/escape triple-quote sequences, or fence with an unguessable per-request delimiter.

## Checked and NOT vulnerable (verified)
- **IDOR** on drafts/messages/activity/withdraw: every handler resolves the session profile (`getProfileBySessionUserId`) and queries with `profile_id: profile.id`. Draft routes use `{ profile_id, agency_id: req.params.agencyId }`; messages/activity/withdraw use `where({ id, profile_id: profile.id })`. Foreign ids return 404.
- **`imageIds` ownership:** candidates come from `where({ profile_id: profile.id })` and client ids only *filter* the owned set (`:439-448`); foreign ids silently dropped — can't submit images you don't own.
- **Idempotency scoping:** keyed `{ profile_id, idempotency_key }` with request-hash binding (different body + same key → 409) and unique-constraint/transaction race handling. Per-profile.
- **Mass-assignment** on draft `payload`/submissionPackage: `normalizeDraftPayloadWithRepairs` (`application-drafts.js:109-287`) whitelists exactly `schemaVersion, boards (∩ agency open_boards), mediaSetId (ownership-checked), excludedImageIds (owned+eligible), digitalSlotPicks (owned+slot-validated), compCardPreset (scoped to profile_id), note (≤1200), consent (===true)`; everything else discarded.
- **SQL injection:** all parameterized Knex; `knex.raw` uses are bound or contain no user input.
- **SSRF via agency website:** routes only *return* `agency.website` as JSON; nothing server-side fetches it.
- **Banned/suspended enforcement:** the talent dashboard router is mounted behind `requireActiveAccount()` (`app.js:611`).
- **Studio+** enforced server-side on every AI endpoint.
- **Match-score gating:** non-pro responses sliced to top-20 with `matchScore`/`matchBreakdown` stripped; only ACTIVE agencies + public fields returned.
- **Stored XSS** in agency inbox/notifications: note/message preview flows into a notification `body` as plain text, rendered by React (auto-escaped); no HTML email interpolation of talent content in this path.

## Prioritized remediation
1. (MEDIUM) Add session-keyed rate limiting to `/api/talent/submission-note/*` (and sibling bio / training-summary / message-polish AI routes). — smallest change, real cost/DoS exposure today.
2. (MEDIUM) Before any redirect-apply invite issuance ships: require profile-bound + expiring + single-use tokens; remove the agency-only payload acceptance.
3. (MEDIUM) Bring redirect-apply to parity with `POST /` (program acknowledgment, package/rights validation, agency-active check, idempotency); replace `knex.raw("gen_random_uuid()")` with `uuidv4()`.
4. (LOW) Length/type-bound the verbatim display fields written to `talent_submission_packages.payload`.
5. (LOW) Neutralize `"""` delimiter breakout in the submission-note prompt builders.
