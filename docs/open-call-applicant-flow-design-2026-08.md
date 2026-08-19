# The Open Call as its own product — applicant flow, identity, and claiming

**Status:** PROPOSAL. Nothing in this document is built. It asks for rulings before any lane starts.
**Supersedes in part:** `docs/event-casting-design-2026-08.md` §(e) T1–T3 and the applicant half of §(c). The organizer half of that document (pool triage, pick lists, offers, export) stands unchanged and this design is built to protect it.
**Scope authority:** `docs/pholio-strategic-analysis-2026-08.md` §6. Designed against the code at `69694ba`.
**Trigger:** the FWBK Queens Google Form response sheet, reviewed with Alex (FWBK co-producer).

---

## 0. The observation that forces this

FWBK's live intake is a Google Form with seven fields — timestamp, email, full name, gender, 18-or-older, phone, Instagram, optional website — reviewed in a spreadsheet with yellow row highlighting. An applicant is done in roughly ninety seconds and has no account anywhere.

Pholio's open-call link, as built, asks the same applicant to do this before FWBK sees a single answer:

| # | Step | Where |
|---|---|---|
| 1 | Read an arrival page that collects nothing | `client/src/domains/onboarding/pages/OpenCallArrivalPage.jsx` — the file's own header comment says "It collects nothing" |
| 2 | Create a Firebase account | `/login`, then `POST /onboarding/entry` (`casting.js:272`) |
| 3 | **Leave the browser, open email, click a verification link** | `requireTalentDashboardEligibility` (`require-auth.js:398`) blocks the dashboard until `users.email_verified` |
| 4 | Six onboarding steps | `STEP_ORDER = [entry, birthdate, gender, scout, measurements, profile, done]` (`state-machine.js:148`) |
| 5 | Clear every send-readiness gate | `send-readiness.js`: unretouched digital headshot **and** full-length, non-stale set, height + core + waist + hips, email **and** phone, per-image distribution rights, `isCoreReady` |
| 6 | Clear the event intake gates | `validate-submission-package.js`: walk video URL, availability range, measurements confirmation |
| 7 | Consent, then submit | `applications.js` submit transaction |

Seven fields versus an account, an email round-trip, six onboarding screens and a photo shoot. The gap is not a tuning problem. **The account is currently charged as the price of entry; it should be issued as the receipt.**

Two things are worth separating, because the fix for one is not the fix for the other:

- **The intake bar is mostly right.** A designer cannot cast a show from a name and an Instagram handle. Digitals, height and measurements are what make Pholio worth more to FWBK than their form. Keep the bar.
- **The account wall is wrong.** It is three costs (account, email round-trip, onboarding) stacked in front of an applicant who has not yet done one thing FWBK asked for, and it delivers nothing to them until after all three are paid.

This document keeps the bar and removes the wall.

---

## 1. Critique of the current implementation

### C1. The arrival page is a step whose only output is another step
`OpenCallArrivalPage.jsx` renders the brief, fires an arrival beacon, and ends in a button to `/login`. It is a velvet rope in front of a signup wall. The brief is genuinely useful context — but context belongs *beside the first question*, not on a page that ends in a button. Under this design the arrival screen becomes step one of the form, not a preface to it.

### C2. The funnel measures the leak but cannot locate it
`event_casting_funnel_events` (design §g) defines `call_viewed` → `application_started` → `application_completed`. But `application_started` is written at "first draft write with this link", which is only reachable *after* account creation, email verification and onboarding. Every abandonment at the wall — and that is most of them — is recorded as a `call_viewed` with nothing after it, indistinguishable from a bounce. The instrumentation can prove the funnel leaks and cannot prove **where**. Any pre-account flow must instrument the pre-account steps or it repeats the mistake.

### C3. The claim machinery guards a limit the anonymous path never had
`agency_open_call_claims` exists to make one submission per (agency, profile) `quota_exempt` against `MONTHLY_DISCOVERY_SUBMISSION_LIMIT = 5`. That is coherent — but note the scope: a quota is a property of a *talent account*. An applicant with no account has no quota to exempt. So the entire mint/park-in-session/convert-at-signup apparatus (`ensureClaimFromSession`, `req.session.openCallContext`, the 24h TTL) exists only to carry an entitlement across a signup step that this design deletes. It survives, unchanged, for signed-in Pholio users arriving at a link. It simply stops being on the critical path for new applicants.

### C4. **Bug — the claim uniqueness and the application uniqueness disagree, and multi-edition organizers are the casualty**
`20260815091000` correctly replaced `UNIQUE(profile_id, agency_id)` with a per-edition partial unique for event calls, precisely so a model who walked Brooklyn may also apply to Queens. But `uq_open_call_claims_agency_profile` (`20260704120000:113`) is still keyed `(agency_id, profile_id) WHERE status IN ('active','consumed')`, and `mintClaim` returns `{claim: null}` when it finds a consumed row. Consequence:

> A model applies to FWBK Brooklyn. Claim minted, consumed, `quota_exempt = true`. She then opens the Queens link. `mintClaim` finds the consumed Brooklyn claim and mints nothing. Her Queens application is **not** exempt and burns one of her five monthly discovery submissions.

The strategic analysis calls the cross-edition pool "the bigger FWB prize" (§6.4). The exemption keyed to the organizer rather than the edition quietly taxes exactly that path. Fix: key the claim to `(open_call_link_id, profile_id)` for `call_kind = 'event_casting'`, mirroring the application index. Small migration; should ship regardless of whether the rest of this document is approved.

### C5. Identity has no key but `profile_id`, so cross-edition dedup is impossible
Nothing in the schema matches a human across applications. Brooklyn-with-Gmail and Queens-with-iCloud are two unrelated profiles. The deduplicated cross-edition pool that §6.4 calls the real pitch cannot be built on the current keys.

### C6. **The age question, and why it is the first thing to resolve**
The Queens response sheet's "Are you 18 or older?" column reads *No* on a large share of rows — visibly more *No* than *Yes* in the portion reviewed. I am reading a photograph of a screen at an angle and the data rows appear offset from the header row, so this may be a column-alignment artifact and I am **not** asserting it as fact. But if it is even directionally true, Pholio's hard 18+ gate (ruling R8) rejects the majority of FWBK's actual applicant pool, and every hour spent on applicant friction is spent optimising a funnel whose entrance is closed to most of the people entering it.

**This is the highest-value unknown available and it is one question to Alex.** See §8, item 0.

---

## 2. The principle

> **An open call is a form that works on its own. A Pholio profile is what the applicant is offered afterwards, for having filled it in.**

Three consequences, and they are the whole design:

1. **The application is the primary object.** It does not depend on a user, a profile, or a session.
2. **The account is opt-in, after the fact, and proven by email.** No `users` row is written for someone who has not asked for one.
3. **Nothing an open call asks for is wasted.** Every intake field maps to a canonical profile field, so "your application becomes your profile" is a *projection*, not a migration.

---

## 3. Architecture

### 3.1 The intake spec — the call declares what it needs

Today a call's requirements are three booleans (`requires_walk_video`, `requires_availability`, `requires_measurements`) sitting on top of a fixed, universal send-readiness bar. That is backwards: the universal bar is the demanding part and no call chose it.

Replace with an **intake spec** on the link: an ordered list of field keys drawn from a **closed platform vocabulary**, plus a per-field `required | optional | hidden`.

```
agency_open_call_links.intake_spec        json NOT NULL DEFAULT (platform default for call_kind)
agency_open_call_links.intake_spec_version integer NOT NULL DEFAULT 1
```

The vocabulary is closed and platform-owned. This is the load-bearing constraint:

- **Every key maps to exactly one canonical profile or application column.** `legal_name`, `email`, `phone`, `date_of_birth`, `gender`, `city`, `height`, `core_measurements`, `instagram`, `portfolio_url`, `digital_headshot`, `digital_full_length`, `digital_profile`, `walk_video_url`, `availability_window`.
- An organizer who wants to ask something outside the vocabulary gets a **custom question** instead: free text, stored as an answer on the application, shown in the organizer's inbox and CSV, and **never promoted to a profile**. Custom questions are how a partner gets flexibility without polluting the profile schema.
- Send-readiness stops being a universal gate for open-call submissions and becomes the *default spec* for a representation call. `evaluate/validateSubmissionPackage` keeps its current behaviour when the spec is the representation default, so existing agencies see no change.

FWBK's Brooklyn spec is then, concretely: legal name, email, phone, 18+ attestation, gender, city, height, Instagram (optional), digital headshot, digital full-length, walk video (optional). Eleven fields, four of them one tap. That is a real form, not a Google Form — and it is finishable in one sitting on a phone.

**Reuse note:** `src/domains/spec-registry/authoring/` already implements a curated, versioned, agency-authored field vocabulary with a builder UI (`SpecBuilderPanel.jsx`). It is the closest precedent in the codebase and the spec builder should be evaluated for reuse before a second authoring surface is written.

### 3.2 The identity ladder

Four states, one direction, no silent transitions:

| State | What exists | Who caused it |
|---|---|---|
| **1 · Anonymous draft** | `open_call_submissions` row keyed by a signed, httpOnly draft cookie. No PII until they type it. TTL 14 days. | Opening the link |
| **2 · Submitted, unclaimed** | The submission is `status='submitted'` and carries an `applicant_identity_id`. An `applications` row exists so the organizer can review it. **No `users` row. No `profiles` row.** | Pressing send |
| **3 · Claimed** | `users` + `profiles` created and backfilled from every submission under that identity; email verified by construction. | Clicking the magic link in their own inbox |
| **4 · Pholio talent** | They added a password or Google, finished the rest of the profile. | Continuing |

State 2 is the answer to "don't silently create a full account." What exists at state 2 is a **record of an application the person deliberately made**, held for the retention the consent stated. That is not an account: it has no credentials, no login, no dashboard, no session, and appears nowhere as a Pholio user.

### 3.3 The tables

```
applicant_identities                       -- "this human, as asserted by an application"
  id uuid pk
  email_normalized  varchar(254) NOT NULL   -- lowercased, plus-stripped; the identity key
  phone_normalized  varchar(32) NULL        -- E.164 where parseable; a duplicate SIGNAL, never a key
  profile_id        uuid NULL FK profiles ON DELETE SET NULL   -- set at claim; NULL while unclaimed
  claimed_at        timestamp NULL
  disowned_at       timestamp NULL          -- "this wasn't me" (§5.4)
  created_at / updated_at
  UNIQUE (email_normalized)
  index (phone_normalized), index (profile_id)

open_call_submissions                      -- the application itself, pre-account
  id uuid pk
  open_call_link_id uuid NOT NULL FK agency_open_call_links ON DELETE CASCADE
  agency_id         uuid NOT NULL FK agencies ON DELETE CASCADE
  applicant_identity_id uuid NULL FK applicant_identities ON DELETE SET NULL  -- NULL until email entered
  draft_token_hash  varchar(64) NULL UNIQUE  -- sha256; raw only in the httpOnly cookie
  answers           json NOT NULL DEFAULT '{}'   -- keyed by intake-spec field key
  custom_answers    json NOT NULL DEFAULT '{}'
  intake_spec_version integer NOT NULL
  status            varchar(16) NOT NULL DEFAULT 'draft'   -- draft | submitted | abandoned
  submitted_at      timestamp NULL
  expires_at        timestamp NOT NULL
  ip_hash varchar(64) NULL · user_agent varchar(512) NULL
  created_at / updated_at
  UNIQUE (open_call_link_id, applicant_identity_id) WHERE status = 'submitted'
  index (open_call_link_id, status), index (applicant_identity_id)

open_call_submission_media                 -- anonymous uploads, scoped to one draft
  id uuid pk · submission_id FK CASCADE · field_key varchar(48) NOT NULL
  storage_key varchar(500) NOT NULL · content_type · bytes integer
  moderation_state varchar(16) NOT NULL DEFAULT 'pending'
  promoted_image_id uuid NULL FK images ON DELETE SET NULL   -- set at claim
  created_at
  UNIQUE (submission_id, field_key)

applicant_claim_tokens                     -- the magic link (message-reply-tokens.js idiom)
  id uuid pk · applicant_identity_id FK CASCADE
  token_hash varchar(64) NOT NULL UNIQUE   -- sha256 hex; raw only in the emailed URL
  purpose varchar(16) NOT NULL             -- claim | disown
  expires_at timestamp NOT NULL · consumed_at timestamp NULL
  created_at
```

And on `applications`, making the profile optional:

```
applications.profile_id            → NULLABLE          (was NOT NULL)
applications.applicant_identity_id  uuid NULL FK applicant_identities ON DELETE SET NULL
CHECK (profile_id IS NOT NULL OR applicant_identity_id IS NOT NULL)
```

The two partial uniques from `20260815091000` are re-expressed against whichever key is present. This is the one genuinely invasive schema change in the design and §4 is entirely about containing it.

### 3.4 Why an application row at all, rather than letting the organizer read submissions

Because ruling **R10** — *no separate FWB infrastructure, ever; extend, never fork* — is correct and this design must not break it. The organizer's inbox, triage, pick lists, offers, notifications, auto-close and CSV export all operate on `applications`. An unclaimed applicant that lived only in `open_call_submissions` would need a parallel review surface, which is precisely the fork R10 forbids. Submitting writes an `applications` row exactly as today; only its identity pointer differs.

---

## 4. Containing the `profile_id` change

This is the risk that decides whether the design is buildable.

**Measured blast radius.** Direct `profiles` joins in agency-side application read paths: `inbox.js` ×1, `messages.js` ×2, `activity.js` ×1, `casting.js` ×1, `event-pick-lists.js` ×3 — eight sites. Tractable, but eight sites is also eight chances to leave a path that silently drops unclaimed applicants from a list.

**The containment.** One resolver, and a test that forbids going around it.

```js
// src/domains/agency/services/applicant-identity.js
resolveApplicantIdentity(application) -> {
  displayName, email, phone, city, dateOfBirth, heightCm, measurements,
  instagram, images[], isClaimed, isEmailVerified
}
```

Two sources, one shape:

- **Claimed** → live `profiles` row, exactly as today.
- **Unclaimed** → the **frozen submission snapshot**. This falls out for free: `talent_submission_packages` already exists and organizer surfaces already read the package from it rather than from live profiles. An unclaimed application's identity is *by definition* frozen — the applicant cannot edit it without claiming — so the snapshot is not a workaround, it is the correct home. Extend the snapshot to carry an identity block and the resolver's unclaimed branch is a field read.

The designer pick page needs **no change at all**: per §(d) of the event-casting design it already renders from the frozen snapshot through `AUDIENCE.EVENT_DESIGNER` and never touches live profiles.

**Enforcement.** A unit test in the shape of `tests/unit/agency-route-coverage.test.js` that fails on any new direct `profiles` join inside an agency application read path. Without it, the eighth site gets missed six months from now and one organizer's export quietly omits half their pool.

---

## 5. The applicant experience

### 5.1 The flow

```
/opencall/:code
  │
  ├─ Screen 1 — the call. FWBK's mark, event, dates, compensation stated
  │             verbatim, what they're asking for, deadline.
  │             AND the first question, on the same screen. No "Begin" button
  │             that leads to another page of prose.
  │
  ├─ Screens 2..n — exactly the intake spec, one thought per screen, phone-first.
  │             Autosaved to the anonymous draft on every step. A closed tab
  │             is resumable from the same device for 14 days.
  │
  ├─ Email step — the only field with special behaviour (§5.3)
  │
  ├─ Consent — event disclosure, compensation restated verbatim,
  │             retention stated, 18+ attested. Unchanged content;
  │             it now binds to a submission rather than a profile.
  │
  └─ Send ──▶ "Your application is with Fashion Week Brooklyn."
              │
              └─ THE PAYOFF. "You just built the start of a Pholio profile —
                 your digitals, your stats, and a comp card. Want to keep it?"
                 [ Send me my link ]      [ No thanks ]
```

### 5.2 The claim is the receipt

The confirmation email and the claim email are **the same email**. One message, two jobs:

> **Your application is in.**
> Fashion Week Brooklyn has your submission for the October 4–10 season.
> You built a profile getting here — digitals, stats and a comp card.
> **[ Keep it — takes one tap ]**
> Didn't apply to this? [ That wasn't me ]

Sent on submit regardless of which button they pressed on the payoff screen, because it is a receipt they are owed either way. Clicking **Keep it** consumes an `applicant_claim_tokens` row and, in one transaction: creates `users` (`account_status='active'`, no `firebase_uid` yet) + `profiles`, marks `email_verified = true` — the click *is* the verification — projects every answer under that identity onto profile columns, promotes `open_call_submission_media` into `images`, re-points every `applications` row from the identity to the new `profile_id`, and opens a session on a profile that is already most of the way done with a comp card ready to download.

They still have no password. Adding one, or linking Google, is state 4 and can wait. **The credential is the last thing asked for, not the first.**

If never claimed: the submission and its media are purged on the call's stated retention clock — `event_ends_on + 90 days` per ruling R4 — and the consent copy says so in those words. An unclaimed identity with no live submissions is deleted with them.

### 5.3 Existing Pholio users, and the enumeration trap

At the email step, three cases exist and **the applicant must not be told which one they are in**, because "does this email have a Pholio account?" answered to an anonymous visitor is an account-existence oracle.

So: the flow never branches visibly. It takes the application in every case, and the branch shows up *in the email*, which requires control of the mailbox — the same posture as a password-reset "we sent a link if that address exists."

| Case | Behaviour | What the email says |
|---|---|---|
| Email has a **claimed Pholio account** | Application attaches to that identity → that profile. Not a duplicate. | "We attached this to your Pholio profile. Sign in to see it." |
| Email has an **unclaimed identity** from a prior call | Same identity, second application. Cross-edition dedup, free. | "Keep it — one tap." |
| **New** email | New identity. | "Keep it — one tap." |

There is also a **fast path that is not an oracle**: a "Already on Pholio? Sign in" affordance the applicant chooses for themselves. Signing in pre-fills the entire spec from the existing profile, and the flow collapses to reviewing pre-filled answers, adding whatever the call needs that the profile lacks, and consenting. This is the answer to *"existing Pholio users should obviously be able to reuse their profile information"* — offered, never forced, and it never confirms anything about an address the visitor typed.

### 5.4 "That wasn't me"

Because the flow accepts an unverified email by design, someone can submit an application using another person's address. That person then receives a receipt for something they did not do. This is a requirement, not a nicety:

The **That wasn't me** link consumes a `disown` token, sets `applicant_identities.disowned_at`, severs the identity from the submission, and flags the application to the organizer as *identity disputed*. It never deletes the organizer's application — the organizer decides what to do with it — and it never reveals anything about the submission's contents to the person disowning it beyond the call it went to.

### 5.5 Duplicates the system will not resolve

The same human with two email addresses is two identities. This is unavoidable without an identity provider, and **automatic merging is not the answer** — merging two humans because a phone number matched leaks one person's data to another.

The correct posture: `phone_normalized` is a **signal**, surfaced to the organizer as plain inline text on the row ("possible duplicate of an earlier submission") and never as an automatic action or a badge. The organizer knows their pool; the system does not.

---

## 6. FWBK's review workflow

The existing design gives FWBK triage → per-designer pick lists → offers → confirmations → CSV. That is strictly better than the spreadsheet and is already built. Unclaimed applicants add four requirements, all small, all mandatory before FWBK is asked to switch:

1. **Every organizer surface must include unclaimed applicants.** Guaranteed by §4's resolver and its enforcement test, not by review.
2. **Verified-email state must be visible** — the row shows whether the address was proven by a claim click. It is real signal about who will actually turn up to a fitting, and it is FWBK's replacement for "I emailed them and it bounced." Plain text, not a badge (banned pattern #4).
3. **CSV export must be at least as good as their spreadsheet on day one.** The export is FWBK's exit ramp and their comfort blanket; an export that silently omits unclaimed rows is worse than the Google Form and would end the partnership on contact.
4. **Their highlighting maps to marks.** The yellow rows in the sheet are "maybe". `PICK_MARKS = {pick, maybe, pass}` already models exactly this. Say so to Alex in those words — it is the one place where the product already speaks their existing workflow back to them.

---

## 7. Generalisation beyond FWBK

Three orthogonal axes on the call, replacing what is currently one implicit shape:

| Axis | Column | Values | Today |
|---|---|---|---|
| Purpose | `call_kind` | `representation` \| `event_casting` | exists |
| Requirements | `intake_spec` | closed vocabulary + custom questions | 3 booleans |
| Identity | `identity_policy` | `account_required` \| `account_optional` \| `account_never` | implicit `account_required` |

`identity_policy` is what makes this shippable without breaking anyone:

- **`account_required`** — today's behaviour, preserved exactly. An agency that wants only complete Pholio profiles keeps it. Nothing about the current flow is deleted; it becomes a setting.
- **`account_optional`** — this design. FWBK's setting, and the platform default for new event calls.
- **`account_never`** — anonymous intake with no claim offer at all. Reserved; do not build until something needs it.

Abuse controls, since removing the account wall removes the main spam gate:
- Per-IP-hash rate limit on submit (`authLimiter` is already mounted on `/api/public/open-call`; `hashArrivalIp` already exists).
- Link codes are already unguessable (`randomBytes(12).base64url`).
- One live submitted application per (identity, call) — the partial-unique idiom already used twice in this schema.
- **Uploads are gated behind the email step**, so every stored asset has an accountable address attached before it exists.
- Per-draft media cap, byte cap, and content-type allowlist.

### 7.1 A hard gate before any of this ships
Anonymous photo upload materially changes the CSAM exposure profile: today every uploaded image is attached to a verified, onboarded account. `tasks/csam-escalation-runbook.md` and `moderation_queue` exist, but they were written for the account-backed path. **`open_call_submission_media` must be wired into moderation and the escalation runbook, and the runbook re-read against an anonymous uploader, before the anonymous upload path is enabled in any environment.** If §8 item 0 comes back saying minors are a large share of the pool, this stops being a gate and becomes the whole problem.

---

## 8. Sequencing, ordered by risk retired per day

**0 · Ask Alex four questions. Before anything.** (hours, not days)
   1. **The age distribution in the response sheet** — is the 18+ column what it appears to be? This decides whether the funnel is worth optimising at all (C6).
   2. Actual response counts per edition — R7 sized on an educated assumption and said so.
   3. What happens to a row after it is highlighted — the real workflow, not the described one.
   4. How many of the ~40 designers would actually open a pick link.

**1 · Ship the C4 claim-key fix.** Independent of everything else, small, and it is currently taxing the multi-edition path that the strategy calls the real prize.

**2 · Intake spec + anonymous draft + submit.** The core. Ends at an application row with an identity and no account.

**3 · The resolver and its enforcement test, then inbox and CSV.** Organizer surfaces must be correct *before* real applicants are unclaimed, not after.

**4 · The claim email and the claim transaction.** The receipt.

**5 · Retire the arrival page as a gate** — fold it into screen one of the form.

**6 · Pre-account funnel instrumentation** — `call_viewed → field_reached(key) → submitted → claim_sent → claimed`. Without step 6 the next version of this document is written from guesses again (C2).

---

## 9. Rulings needed before a lane starts

| # | Question | Recommendation |
|---|---|---|
| Q1 | **Minors.** If FWBK's pool skews under 18, do we (a) hold the 18+ gate and reject them honestly at the top of the form, (b) build guardian-consented minor intake, or (c) put an age policy on the call with a guardian-email step that withholds the application from the organizer until the guardian completes it? | **(a) for the FWBK launch, (c) as the specced generalisation — and neither until item 0 answers.** The existing minor machinery (`guardian-consent`, `minor-submission-access.js`, redacted DTOs) assumes accounts throughout; grafting it onto an anonymous flow is a large, high-risk build that must not be started on speculation. |
| Q2 | Is a state-2 record acceptable as "not an account"? | **Yes.** No credentials, no session, no login, no dashboard, invisible as a Pholio user, purged on the stated retention clock. If this is ruled *no*, the design collapses back to the current wall and the honest answer to FWBK is that Pholio is not the right intake tool for them. |
| Q3 | `applications.profile_id` nullable, or a provisional `profiles` row instead? | **Nullable, with the §4 resolver.** A provisional profile row is less code and more dishonest: it is an account record created without consent, which is the thing being objected to. Eight join sites and a guard test is the price of the honest version. |
| Q4 | Does the claim click alone set `email_verified = true`? | **Yes.** It is a single-use, hashed, expiring token delivered to that address — strictly stronger evidence than the current Firebase verification email, and it is the same act. |
| Q5 | Retention for an unclaimed submission. | `event_ends_on + 90d` per R4, stated in the consent in those words. |
| Q6 | Does `account_required` remain available to agencies? | **Yes.** Nothing is deleted; the current behaviour becomes a per-call setting. |

---

## 10. What this does not change

- The organizer's dashboard: still the same inbox, RBAC, settings and export (R10 upheld).
- The designer pick page: unchanged, it already reads only the frozen snapshot.
- The consent content and versioning model: unchanged; it binds to a submission instead of a profile.
- Representation calls at existing agencies: unchanged, by `identity_policy` default.
- The intake **bar** for FWBK: unchanged. Digitals, height and measurements are still asked for. Only the order and the price of admission change.
