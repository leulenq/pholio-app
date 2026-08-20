# The Open Call as its own product — applicant flow, identity, and claiming

**Status:** IMPLEMENTED on `claude/open-call-applicant-flow-0w71i7` (2026-08-19), per the rulings recorded in `tasks/todo.md`. Q1 (minors/age policy) remains open and owned by a separate workstream; everything else in §9 was resolved as recommended. Implementation notes that deviate from or sharpen this text:

- `intake_spec` is stored NULL meaning "platform default for the call kind", so revising the default never needs a data migration.
- A claimed user lands in a *shortened, prefilled* onboarding rather than a faked-complete one — the event spec collects no date of birth, and the dashboard gates legitimately need it.
- The C4 claim-key fix shipped, including the review-caught inverse (a representation submission can no longer consume an event-edition claim).
- Materials tokens are bound to the specific request they were minted for.
- **Open gates before production:** §7.1's anonymous-media CSAM/moderation wiring is NOT closed (named in `src/domains/opencall/services/media.js`); the board-pipeline candidates endpoint doesn't resolve identity rows' truth fields; HEIC uploads are not accepted (uploader-wide decision). On PostgreSQL the schema migrations take ACCESS EXCLUSIVE on `applications` and the snapshot/consent tables — schedule accordingly.

Original proposal status: it asked for rulings before any lane started.
**Revision note (2026-08-19):** v2 restructures the design around the two-sided constraint (§2): the applicant flow must stay genuinely quick, *and* what the organizer receives must be materially better than Forms + Sheets. The main change from v1: the heavy event-intake asks (walk video, availability, measurement confirmation) move from submit-gates to a shortlist-stage request. v1's identity ladder, claim flow, and containment strategy stand.
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

But there are two traps here, not one, and v1 of this document only escaped the first:

- **The friction trap.** Keep the current wall and applicants choose the Google Form every time. This is the trap §0's table documents.
- **The prettier-form trap.** Strip the flow down to Google-Forms parity and Pholio becomes a nicer form with a login — and there is no reason for FWBK, or any future partner, to switch. The organizer's willingness to send their applicants to Pholio is the whole channel; a product that only relocates their spreadsheet does not earn it.

§2 states the constraint that escapes both traps, and the rest of the document is rebuilt on it.

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

### C7. v1 of this document kept the full event-intake bar at submit
v1 removed the account wall but still required walk video, availability and measurement confirmation from every applicant before send whenever the call asked for them. That charges the whole line for what only the callback needs (see §2). This revision moves those asks to the shortlist stage.

---

## 2. The two-sided constraint

### 2.1 The Google Form's cheapness is an accounting trick

The Form does not remove the cost of casting a show. It defers the cost, and moves it onto other people:

- **Onto the organizer.** The form has no photos, so reviewing 250 rows means manually opening 250 Instagram profiles — a curated feed with no height, no digitals, no stats. Then DMing and emailing individuals for the materials the form never collected.
- **Back onto the applicant, later.** The strategy research documents 250+ models at a single in-person Queens casting. The cattle call *is* the real intake; the Google Form is just a ticket to it. The applicant's true cost today is ninety seconds of typing plus hours of travel and standing in line to be seen for thirty seconds.
- **Onto the data.** The response sheet itself shows the price: "I don't have a phone num" sitting in a phone-number column, and an 18+ column that may be misaligned against its rows. Even seven fields do not arrive clean.

Forms is only frictionless if you stop the clock at row-insertion. So the design constraint is not *be as cheap as the Form*. It is:

> **Price each stage of the funnel at what that stage is worth to both sides.**

Three laws fall out of that, and they are the spine of this design.

### 2.2 Law 1 — value density governs the apply stage

Every second of applicant effort at the top of the funnel must buy the organizer review capability at the pool stage. Run each candidate field through that test:

| Ask | Applicant cost | Organizer value at pool triage | Verdict |
|---|---|---|---|
| Name, email, phone, 18+, gender, city | ~90s typed | Table stakes; arrives validated and deduplicated | **Apply** |
| Height | ~5s, one number | Instagram cannot supply it; every lineup decision needs it | **Apply** |
| Two photos (headshot + full length) from the camera roll | ~90s | Transforms review from Instagram-tab archaeology into visual triage — the single highest value-per-second ask that exists | **Apply** (default; the spec decides, §3.1) |
| Instagram | ~10s | Useful secondary signal | **Apply, optional** |
| Walk video | Minutes to produce; the #1 abandonment risk | Nobody watches 250 walk videos at pool triage — not the organizer, not 40 designers | **Shortlist** |
| Availability for event dates | ~30s but answered weeks early, so often wrong by the fitting | Only matters for people actually being considered | **Shortlist** |
| Confirmed current measurements | Requires care and honesty | Only matters at fitting/lineup time | **Shortlist** |

The apply stage lands at roughly **four minutes on a phone, no account**: the Google Form's seven answers, plus height, plus two photos. Deliberately *slightly* heavier than the Form — and every extra second is spent on the two items with the highest value density.

### 2.3 Law 2 — the heavy asks follow selection, not precede it

The walk video, availability and measurement confirmation move from submit-gates to a **shortlist-stage request**. When the organizer shortlists an applicant, one click sends:

> "Fashion Week Brooklyn shortlisted you. They need your walk video and your availability for October 4–10 by Friday."

Fulfilled on a tokenized page — no account required (§5.4) — with the system, not the organizer, doing the chasing and the deadline.

Why this resolves the tension rather than relocating it:

- **The arithmetic.** 250 applicants spend four minutes each; the ~60 shortlisted spend ten more. Total applicant effort collapses versus charging everyone the full package, and the effort that remains is spent by people who now have a concrete reason to spend it.
- **The psychology.** The request arrives as *good news*. "You've been shortlisted, send your walk" converts at callback-motivation, not cold-form-motivation.
- **The industry shape.** This is what casting already is: submission → callback with more materials → fitting. v1 was asking the whole line for what only the callback needs. The software should sequence asks the way the industry already does.
- **The organizer's side.** Materials arrive only from people they chose, at the moment they need them, collected automatically. Their current version of this step is manual DMs.

### 2.4 Law 3 — the product is the casting room, not the doorway

Google can always match the doorway. What Forms + Sheets structurally cannot do:

- Photo-led pool triage with lifecycle states, on data that arrived validated and deduplicated.
- Per-designer pick lists with selections flowing back (already designed and partly built).
- The one-click **Request materials** verb with automatic chasing and a deadline.
- Confirmations and no-show management.
- Status flowing back to the applicant — a Form ends in "your response has been recorded" and permanent silence.
- A deduplicated identity across Brooklyn, Queens, Japan, Italy and London editions (§3.2).

**The test this imposes on every future feature: it must do something structurally impossible in Forms + Sheets, or it is decoration.** The form is the doorway; the casting room is the product.

This also defines the adoption wedge. An organizer may configure their intake spec at literal Google-Forms parity — no photos, seven fields — and *still* get dedup, pick lists, statuses, confirmations and export. Even at parity intake the workflow is the product, so there is no configuration in which Pholio is merely a prettier form. The Request-materials verb then teaches them, on their own pool, why photos in the spec are worth asking for.

### 2.5 What the applicant sees that a Form never gives them

The applicant spends ~4 minutes instead of 90 seconds. The reasons must be on the screen while they spend them, not discovered later:

- The photos go straight to the casting team — not a maybe-clicked Instagram link.
- Compensation is stated verbatim (paid / unpaid / stipend) before they invest a minute.
- They get a live status — submitted, shortlisted, offered — instead of silence, the number-one applicant complaint in any casting context.
- Next edition is one tap: a claimed profile prefills the whole spec (§5.3).
- They leave with the start of a profile and a comp card (§5.2).
- Their submission remains theirs: visible, editable until the deadline, withdrawable. A Form response vanishes into someone's Drive.

The bar: the applicant must never think "why couldn't this just have been a Google Form" — and the answer to that thought must be visible at the moment it would occur.

### 2.6 The principle, restated

> **An open call is a form that works on its own. A Pholio profile is what the applicant is offered afterwards, for having filled it in. And each stage of the funnel is charged exactly what that stage needs — nothing is asked before the moment it earns its ask.**

Three consequences carried over from v1, unchanged:

1. **The application is the primary object.** It does not depend on a user, a profile, or a session.
2. **The account is opt-in, after the fact, and proven by email.** No `users` row is written for someone who has not asked for one.
3. **Nothing an open call asks for is wasted.** Every intake field maps to a canonical profile field, so "your application becomes your profile" is a *projection*, not a migration.

---

## 3. Architecture

### 3.1 The intake spec — the call declares what it needs, *and when*

Today a call's requirements are three booleans (`requires_walk_video`, `requires_availability`, `requires_measurements`) sitting on top of a fixed, universal send-readiness bar. That is backwards twice over: the universal bar is the demanding part and no call chose it, and the booleans can only gate submission — they cannot say *when* a material is due.

Replace with an **intake spec** on the link: an ordered list of field keys drawn from a **closed platform vocabulary**, each carrying `required | optional | hidden` **and a stage**:

```
agency_open_call_links.intake_spec        json NOT NULL DEFAULT (platform default for call_kind)
agency_open_call_links.intake_spec_version integer NOT NULL DEFAULT 1

-- spec entry shape
{ key: "walk_video_url", requirement: "required", stage: "apply" | "shortlist" }
```

The vocabulary is closed and platform-owned. This is the load-bearing constraint:

- **Every key maps to exactly one canonical profile or application column.** `legal_name`, `email`, `phone`, `date_of_birth`, `gender`, `city`, `height`, `core_measurements`, `instagram`, `portfolio_url`, `digital_headshot`, `digital_full_length`, `digital_profile`, `walk_video_url`, `availability_window`.
- An organizer who wants to ask something outside the vocabulary gets a **custom question** instead: free text, stored as an answer on the application, shown in the organizer's inbox and CSV, and **never promoted to a profile**. Custom questions are how a partner gets flexibility without polluting the profile schema.
- `stage` is per-call configuration, defaulted by the platform. The default event spec puts the two photos and height at `apply` and walk video / availability / measurement confirmation at `shortlist` (§2.2's table). An organizer who wants The-Bureau-style everything-up-front moves those keys to `apply`; the spec is the mechanism, the default is the recommendation.
- Send-readiness stops being a universal gate for open-call submissions and becomes the *default spec* for a representation call. `evaluate/validateSubmissionPackage` keeps its current behaviour when the spec is the representation default, so existing agencies see no change.

FWBK's Brooklyn apply-stage spec is then, concretely: legal name, email, phone, 18+ attestation, gender, city, height, Instagram (optional), digital headshot, digital full-length. Ten asks, four of them one tap, two of them camera-roll picks. Finishable in one sitting on a phone in about four minutes.

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
  disowned_at       timestamp NULL          -- "this wasn't me" (§5.5)
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
  purpose varchar(16) NOT NULL             -- claim | disown | materials
  expires_at timestamp NOT NULL · consumed_at timestamp NULL
  created_at

open_call_material_requests                -- the shortlist-stage ask (§2.3)
  id uuid pk
  application_id    uuid NOT NULL FK applications ON DELETE CASCADE
  requested_keys    json NOT NULL           -- shortlist-stage keys from the call's intake spec
  due_at            timestamp NULL
  requested_by_user_id uuid NULL FK users ON DELETE SET NULL
  fulfilled_at      timestamp NULL
  created_at / updated_at
  UNIQUE (application_id)                   -- one live request per application; re-request updates it
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

The material request rides the same rails: it is keyed to the `applications` row, triggered from the existing `shortlisted` status, delivered through the claim-token email channel, and its fulfillment lands in the frozen submission snapshot the organizer already reads.

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
  ├─ Screens 2..n — exactly the apply-stage spec, one thought per screen,
  │             phone-first. Autosaved to the anonymous draft on every step.
  │             A closed tab is resumable from the same device for 14 days.
  │             Photos come LAST, so every typed answer is banked in the
  │             draft before the highest-abandonment step (ruling Q7).
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

A draft abandoned at the photo step gets **one** email nudge — "finish your application, two photos left" — and nothing more. The typed answers are already in the draft; the nudge is the recovery path for the one step most likely to fail on a bad connection.

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

There is also a **fast path that is not an oracle**: a "Already on Pholio? Sign in" affordance the applicant chooses for themselves. Signing in pre-fills the entire spec from the existing profile, and the flow collapses to reviewing pre-filled answers, adding whatever the call needs that the profile lacks, and consenting. This is the answer to *"existing Pholio users should obviously be able to reuse their profile information"* — offered, never forced, and it never confirms anything about an address the visitor typed. A returning claimed applicant's second edition is a one-minute review, which is §2.5's strongest applicant-side argument.

### 5.4 The shortlist request — fulfilment without an account

When the organizer requests materials (§6), the applicant receives:

> "Fashion Week Brooklyn shortlisted you. They need your walk video and your availability for October 4–10 by Friday."

The link carries a `materials`-purpose token and opens a tokenized page in the shape of `/reply/:token` — **no account, no claim required**. The page restates the designer-visibility clause for the new materials ("designers working the event will see your walk video and availability through a read-only link"), collects exactly the requested keys, and writes them into the frozen submission snapshot the organizer and designers already read.

Fulfilling the request is also the natural claim moment — the page offers it, after the materials are sent, never as a precondition. The talent most worth converting are precisely the ones getting traction, and this is where they are.

### 5.5 "That wasn't me"

Because the flow accepts an unverified email by design, someone can submit an application using another person's address. That person then receives a receipt for something they did not do. This is a requirement, not a nicety:

The **That wasn't me** link consumes a `disown` token, sets `applicant_identities.disowned_at`, severs the identity from the submission, and flags the application to the organizer as *identity disputed*. It never deletes the organizer's application — the organizer decides what to do with it — and it never reveals anything about the submission's contents to the person disowning it beyond the call it went to.

### 5.6 Duplicates the system will not resolve

The same human with two email addresses is two identities. This is unavoidable without an identity provider, and **automatic merging is not the answer** — merging two humans because a phone number matched leaks one person's data to another.

The correct posture: `phone_normalized` is a **signal**, surfaced to the organizer as plain inline text on the row ("possible duplicate of an earlier submission") and never as an automatic action or a badge. The organizer knows their pool; the system does not.

---

## 6. FWBK's review workflow

The existing design gives FWBK triage → per-designer pick lists → offers → confirmations → CSV. That is strictly better than the spreadsheet and is already built. This design adds one verb and four requirements.

**The verb: Request materials.** On any shortlisted application (single or bulk), one action sends the shortlist-stage asks from the call's intake spec, with a due date. The system chases; fulfilment lands in the snapshot; the row shows requested / fulfilled / overdue as plain text. This is the moment the organizer understands the product is not a form — their current version of this step is DMing people one at a time. It is also structurally impossible in Forms + Sheets, which is the §2.4 test.

The four requirements, all small, all mandatory before FWBK is asked to switch:

1. **Every organizer surface must include unclaimed applicants.** Guaranteed by §4's resolver and its enforcement test, not by review.
2. **Verified-email state must be visible** — the row shows whether the address was proven by a claim or materials click. It is real signal about who will actually turn up to a fitting, and it is FWBK's replacement for "I emailed them and it bounced." Plain text, not a badge (banned pattern #4). The pool likewise shows **completeness honestly**: an application missing requested materials reads as exactly that, in words.
3. **CSV export must be at least as good as their spreadsheet on day one.** The export is FWBK's exit ramp and their comfort blanket; an export that silently omits unclaimed rows is worse than the Google Form and would end the partnership on contact.
4. **Their highlighting maps to marks.** The yellow rows in the sheet are "maybe". `PICK_MARKS = {pick, maybe, pass}` already models exactly this. Say so to Alex in those words — it is the one place where the product already speaks their existing workflow back to them.

---

## 7. Generalisation beyond FWBK

Three orthogonal axes on the call, replacing what is currently one implicit shape:

| Axis | Column | Values | Today |
|---|---|---|---|
| Purpose | `call_kind` | `representation` \| `event_casting` | exists |
| Requirements | `intake_spec` | closed vocabulary + stages + custom questions | 3 booleans |
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
   3. What happens to a row after it is highlighted — the real workflow, not the described one. (Prediction to test: yellow = "maybe", and the follow-up is manual DMs — which is exactly what the Request-materials verb replaces.)
   4. How many of the ~40 designers would actually open a pick link.

**1 · Ship the C4 claim-key fix.** Independent of everything else, small, and it is currently taxing the multi-edition path that the strategy calls the real prize.

**2 · Intake spec (with stages) + anonymous draft + submit.** The core. Ends at an application row with an identity and no account.

**3 · The resolver and its enforcement test, then inbox and CSV.** Organizer surfaces must be correct *before* real applicants are unclaimed, not after.

**4 · The claim email and the claim transaction.** The receipt.

**5 · The Request-materials verb and the tokenized fulfilment page.** The casting-room feature that separates this from a prettier form; it reuses the claim-token idiom and the snapshot write path from steps 2–4.

**6 · Retire the arrival page as a gate** — fold it into screen one of the form.

**7 · Pre-account funnel instrumentation** — `call_viewed → field_reached(key) → submitted → claim_sent → claimed → materials_requested → materials_fulfilled`. Without step 7 the next version of this document is written from guesses again (C2).

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
| Q7 | Do the two photos gate submission, or follow it? | **Gate it, by default — but sequenced last.** A pool where half the rows have no photos sends the organizer back to Instagram-tab hell for that half, which forfeits the highest-value organizer win (§2.2). Sequencing photos as the final step banks every typed answer into the draft first, and the abandoned-at-photos draft gets one email nudge. The spec remains the escape hatch: an organizer may mark photos optional and accept the triage cost knowingly. |
| Q8 | Does fulfilling a materials request require claiming? | **No.** Fulfilment happens on a tokenized page, no account needed — a shortlisted applicant forced through account creation to answer the organizer is the original wall rebuilt in the middle of the funnel. The page restates the designer-visibility consent for the new materials, and offers the claim *after* the materials are sent. |

---

## 10. What this does not change

- The organizer's dashboard: still the same inbox, RBAC, settings and export (R10 upheld). The Request-materials verb is an action on it, not a fork of it.
- The designer pick page: unchanged, it already reads only the frozen snapshot.
- The consent content and versioning model: unchanged; it binds to a submission instead of a profile, and the materials page restates the relevant clause for late-arriving materials.
- Representation calls at existing agencies: unchanged, by `identity_policy` default.
- The intake **bar** for FWBK: **re-sequenced, not lowered.** Everything the event needs is still collected — digitals and height from everyone at apply, walk video, availability and confirmed measurements from the shortlisted when they are shortlisted. Each stage of the funnel is charged what that stage needs, and no more.
