# Product language audit — pholio-app

**Date:** 2026-08-29
**Authority:** `.claude/skills/pholio-app-language/` (SKILL.md + 8 references), with
domain truth deferred to `.claude/skills/industry/`.
**Method:** seven disjoint read-only review lanes over the full string surface
(client SPA, EJS views, backend routes, emails, notifications, generated export
artifacts, PDF templates), plus an independent lead sweep. Every finding below
was traced to shipped code; the severe ones were re-verified by hand. Findings
that did not survive verification are listed in §9.

---

## 1. Verdict

The deepest level present is **Level 6 (product truth)** and it recurs across
every lane: copy that describes behaviour the code does not perform. Under it
sit **eight compliance-severity findings**, of which two are the audit's
headline: `views/guardian-consent.ejs` presents a minor-consent decision with
**no refusal control at all**, and a paying talent's **public** portfolio
renders a `Studio+` badge and a different layout, so payment visibly changes
what a booker sees.

The owner's standing priority — is Pholio representing what it *knows* or what
it *infers* — is the single most productive lens on this codebase. It surfaced
the largest cluster of defects, and it also surfaced the product's best work:
`DigitalsFreshness`, `decline-reasons.js`, the off-Pholio `HandoffScene`, the
`Withheld`/`NotYet` components on Intel, and the magic-link family already
implement exactly the discipline the rest of the product needs.

This is not a codebase with a bad voice. The register is right and, in a dozen
places, exceptional. The failures are concentrated in (a) surfaces where an
inference got written in assertion grammar, (b) copy that outlived the mechanic
it described, and (c) three system-wide naming and register problems that no
per-instance edit can fix.

**Nothing in §2 should be fixed by rewording. Those are decisions.**

---

## 2. Fix first: compliance

### C-1. Guardian consent has no way to refuse
`views/guardian-consent.ejs:106-115`

The `disclose` mode renders exactly one `<form>` containing exactly one
`<button>`:

> `I consent as parent or guardian`
> `I consent to sharing with {agencyName}`

There is no decline control of any kind. The file's second button (line 138,
`Withdraw this consent`) is in `confirmed` mode, after the grant. A guardian who
wants to refuse can only close the tab, which records nothing and tells the
minor nothing.

`app-mechanics.md` §6: *"Refusal costs exactly what acceptance costs: same
screen, same weight, one click each."* §5's friction test: *"Any friction on
exits (delete, withdraw, export, decline) is obstruction and is banned."*

**Level 4/6. This is a surface rebuild, not a sentence.** Minimum shape: two
controls of identical weight, the decline posting to a real endpoint that
records the refusal and notifies the talent. Until that endpoint exists, no copy
fix is honest.

### C-2. Three purposes, including AI, behind one consent click
`views/guardian-consent.ejs:77-81`

> `Account management — collecting and storing measurements, full-length photos, and portfolio details.`
> `Public publication — displaying the profile on a public portfolio page.`
> `AI processing — automated photo analysis used to organize the portfolio.`

One button grants all three. `product-facts.md` §3: *"AI is opt-in and
separately disclosed. Image analysis and profile embeddings are distinct, both
off by default."* The copy itself admits the bundle ("This currently covers
three purposes").

Worse, the second item offers a guardian the ability to authorize **public
publication of a minor's profile**, against `product-facts.md` §3: *"Minor
profiles are never publicly exposable."* Either the copy describes a capability
that must not exist, or the capability exists and contradicts the stated minor
posture. `views/portfolio/show.ejs` does render a public profile page, so this
is not theoretical.

**Level 4/6. Owner plus counsel.** Confirm whether a minor profile can reach
`views/portfolio/show.ejs`; then either delete the list item or fix the mechanic.

### C-3. Payment visibly changes what a booker sees
`src/routes/portfolio.js:473` and `views/portfolio/show.ejs:19`

```js
const layoutType = profile.is_pro ? "portfolio-pro" : "layout";
```
```html
<span class="portfolio-pro-badge">Studio+</span>
```

A paying talent's **public** portfolio renders different chrome and a badge
announcing the payment. Anyone reading the page, bookers included, can see who
paid.

`product-facts.md` §1: *"Anything an agency sees or receives is identical for
every talent."* §4, the corrected Studio+ lede: *"Nothing an agency sees or
receives changes with it."*

**Level 4/6.** Remove the badge unconditionally; that part is not a close call.
The layout fork belongs with the §4 paid-reach removal work.

### C-4. "Agency visibility pending — complete essentials to appear in search"
`client/src/domains/talent/pages/ProfilePage/index.jsx:869-874`

The sentence is false, and it describes the mechanic that must never be
described. Verified:

- `src/domains/agency/services/discover-search.js:128-135` requires **all** of
  `is_discoverable = true`, `profile_status = 'active'`, `bio_curated NOT NULL`.
- `migrations/20250117000000_...:11-13` — `is_discoverable` is
  `NOT NULL DEFAULT false`, with the comment *"Pro talent opt-in for Scout
  Talent pool."*
- `src/domains/talent/services/profile-status.js:19` — `profile_status` becomes
  `'active'` only at `score >= 85 AND isCoreReady`.

Completing essentials sets `isCoreReady` only. It does not set
`is_discoverable`, and does not guarantee score ≥ 85. So completing essentials
does not make anyone appear in search.

`banned-language.md` §5: visibility is never a thing Pholio provides.
`product-facts.md` §4: *"Never write copy that advertises, explains, or depends
on payment changing reach, volume, visibility, or review."*

**Level 6.** The copy cannot be repaired while the mechanic stands. Either state
only the operational fact (`"Essentials incomplete. 3 items remaining."`) or
remove the discoverability gate first. Do not reword.

### C-5. The banned exposure promise is still shipped, at first contact
`client/src/domains/onboarding/pages/CastingEntry.jsx:521`

> `<StepBeat text="Let's get you *seen*" ... />`

Renders at `manualStep === 0`, the first sentence a scam-warned reader meets.
Recorded as defect §6.3 in `product-facts.md` and used as *the* worked example
in `judgment.md` §4. Still live.

The whole onboarding flow was screened for the same speech act in other words;
no second instance exists.

**Level 3. Fix:** `Let's build your *book*`, or name the screen's actual job,
`Create your *account*`.

### C-6. "Upload your best shots to get discovered."
`client/src/domains/talent/components/PhotosTab.jsx:326` (also `:261`
`"...to stand out."`)

`"get discovered"` is on the never-say list verbatim (`banned-language.md` §2,
owner- and strategy-settled).

**Mitigating and important: `PhotosTab.jsx` has zero importers.** It is dead
code. This is a landmine, not a live exposure. See §6.4 — it belongs to a set of
23 orphaned modules whose deletion resolves several findings at once.

### C-7. Email opt-out promised, never honoured
`src/shared/lib/pholio-email/templates-submissions.js:23-27`, consumed by
`footer.js:64-72`

> `label: "Turn off submission updates"`

`talentNotificationPrefEnabled()` (`notifications.js:54-70`) is consulted by
`notifyTalentApplicationStatusChange` and `notifyTalentAgencyProfileView` only.
Every **email** send path — `sendApplicationStatusEmail`,
`sendMaterialsRequestedEmail`, `sendNewMessageEmail`, `sendAgencyInviteEmail` —
sends unconditionally. A talent who follows the footer link and turns submission
updates off keeps receiving submission emails forever.

`app-mechanics.md` §8: *"Every channel one-click revocable."*

**Level 6.** Gate the four email sends on the preference; the footer copy is
already correct and should not change. If that cannot ship now, the footer must
stop claiming a channel control, but do not stop there.

### C-8. A minor's exact age reaches a booker
`client/src/domains/agency/components/review/ReviewRoom.jsx:470-475`

> `<span className="rv-hero-fact">Age {age}</span>`

`buildSubmissionProfileSnapshot` sets both `age` and `age_band` and redacts
contact and social, but not age. Every other agency surface bands it —
`dossierModel.js` (`'Under 18'`), `ComparisonOverlay.jsx:214` (`record.ageBand`),
`DiscoverPage.jsx:38` (`AGE_BAND_LABEL`) — and
`src/domains/agency/services/comparison.js:131` states the rule outright:
*"Banded, never a date of birth — the same rule every other agency surface."*

The review room is the highest-traffic decision surface and the one place the
rule breaks.

**Level 6.** Render `age_band` for minors and stop sending exact `age` for
minors from the details endpoint.

---

## 3. The standing priority: what Pholio knows vs what it infers

This was the owner's stated focus and it is the most valuable section of the
audit. Ordered by consequence.

### K-1. "Under Review" claims agency activity that provably has not happened
The product's own constants define the opposite.
`src/shared/constants/application-status.js:22-30`:

```js
const AWAITING_AGENCY_APPLICATION_STATUSES = Object.freeze([
  "pending", "submitted", "shortlisted",
]);
/** Statuses where the agency holds the next move, so the review window is
    theirs to run down. */
```

`src/domains/agency/routes/inbox.js:401` treats `["submitted","pending"]` as the
**untriaged** inbox queue. So both statuses mean *the agency has not acted.*

The copy says otherwise:

| Location | String |
|---|---|
| `client/src/domains/talent/utils/applicationStatus.js:61,70` | `label: 'Under Review'` (for both `pending` and `submitted`) |
| `:65, :74` | `"The agency is reviewing — we'll notify you the moment this changes."` |
| `src/shared/services/notifications.js:311,315` | title `"Application under review"`, body `` `${agency} is reviewing your submission.` `` |

A separate, real status already exists for the observed case:
`applicationStatus.js:76-79` maps `reviewing` to `'In Review'`. The vocabulary
already distinguishes them; `pending` and `submitted` steal the claim.

**The same repo gets this exactly right elsewhere**, which is the proof the
instinct exists: `offPholio/HandoffScene.jsx:133` renders `"Not sent yet"`, and
its source comment at `:56-58` says *"What it must not borrow is the claim.
Nothing has been submitted... the receipt line, which reads 'Under review' on a
Pholio submission, reads the truth here."* The `detail` strings on the same
objects are also accurate (`'Your submission has been sent to the agency.'`).

**Level 6 plus Level 5** (the label names an axis Pholio cannot observe).
**Fix:** relabel `pending`/`submitted` to the delivered fact (`Delivered`,
`Sent · no response yet`); reserve `In Review` for the agency-set `reviewing`
status; rewrite the two `next` strings and both notification bodies to the
observable event. Also verify `"we'll notify you the moment this changes"`
against the real notification cadence — and note it is false for anyone who
turned the `applicationUpdates` toggle off.

### K-2. A page view relabelled as interest
`src/shared/services/notifications.js:506-509`

> title: `` `${name} showed repeat interest` ``
> body: `"This agency viewed your profile again."` / `` `This agency viewed your profile ${count} times recently.` ``

Derived purely from `occurrence_count`. `product-facts.md` §5 ranks profile
visits as the **tier-4** signal and says: *"Report counts and events only; never
translate them into inferred interest or momentum."*

Same defect, second location:
`client/src/shared/components/NotificationCenter/notificationHelpers.js:53`
labels the whole category `'Agency interest'`, in gold, with an eye icon.

Also `notifications.js:479` vs `:502`: the same event has two bodies, `opened`
on insert and `reviewed` on refresh, so the notification silently upgrades its
own claim on the second view. `reviewed` is the tier-1 word spent on the tier-4
event. Both name `"in Scout"`, an agency-only surface, to a talent.

**Level 3. Fix:** title to the count, body to `"Views only. Pholio cannot tell
you what an agency thought."`, category to `'Profile viewed'`. Delete
`showed repeat interest`; no wording of it survives.

### K-3. Field completeness sold as a verdict about bookers
`client/src/shared/utils/profileScoring.js:400-414` (live, 10 references;
rendered at `ProfileReadinessSidebar.jsx:252`)

> `"Your profile matches what bookers look for when shortlisting."`
> `"Agency grade"` · `"Strong package"` · `"Complete and current — ready for agency review."`

`score` is a weighted sum of filled profile fields (`:145-260`). Nothing in it
observes any booker or any shortlist. This is a selection-odds claim
manufactured from form completeness.

`banned-language.md` §6 records that the shipped CI denylist bans `ready`,
`score`, `improve`, `qualify` precisely because *"every one of them turns a
reading of published documents into advice, a score, or a gate."*
CLAUDE.md banned UI pattern #10 names "Strong Profile" labels directly.

Two more live assertions of the same claim:
`ProfileReadinessSidebar.jsx:258` `"Submission package complete — ready for
agency review."`; `ProfileUnlockExperience.jsx:36` `"...your profile is
submission-ready."` (defensible — that one is Pholio's own gate — but it should
say so).
A third, `ProfileReadinessAudit.jsx:50`, is in dead code.

**Level 3/4, owner's decision.** Replace verdicts with counts:
`"All required fields complete. 8 optional fields remaining."` Delete
"Agency grade", "Strong package", and both "ready for agency review" strings.

### K-4. Every applicant labelled "Editorial" from a column that was deleted
`migrations/20260820110000_drop_profiles_archetype.js` dropped
`profiles.archetype`; its header records *"0 of 62 production `profiles` rows
have a non-null value."* Verified: **zero** readers of `archetype` remain under
`src/domains/agency/`.

The client fallbacks resolve unconditionally:

| File:line | String |
|---|---|
| `components/overview/overviewData.js:179-180` | `type: (a.archetype \|\| 'editorial')`, `typeLabel: a.archetype \|\| 'Editorial'` |
| `components/TalentPanel.jsx:230` | `division={talent.type \|\| talent.typeLabel \|\| talent.archetype \|\| 'editorial'}` |

So division marks render **"Editorial"** about real people who declared nothing.
In industry terms this is the worst possible default: editorial is the narrowest
board, so the label actively misdirects triage.

The rule is already written down one directory away, in
`components/status/divisions.js`: *"NEVER infer a positive standing from
absence — that would assert a representation claim about a real person that
nobody entered."*

**Level 6. Fix:** remove the `|| 'editorial'` fallbacks and render nothing.
`resolveDivision('')` already returns `{ label: 'Unassigned', code: '—',
known: false }`.

### K-5. "Top matches today" over a list that is neither ranked nor matched
`client/src/domains/agency/pages/OverviewPage.jsx:103`

The strip is `incoming.slice(0, 20)` from an endpoint whose only ordering is
`orderBy("applications.created_at", "desc")` (`inbox.js:4262`). No score, no
match, no ranking, no "today" filter. All three words are verdicts Pholio does
not compute, on the agency's landing surface.

It contradicts the product's own stated posture twice in the same directory:
`DiscoverPage.jsx:12` (*"never assigned an affinity score or reranked"*) and
`ComparisonOverlay.jsx:29` (*"a look no competitor computing match scores can
wear"*).

**Level 6, but Level 1 to fix:** `title="Newest submissions"`.

Related, same surface: `ApplicantsPage.jsx:1468` declares a **`Match`** column
header over a column that renders nothing (the grid declares seven tracks,
`LedgerRow` renders six; dead `.ap-score-cell` CSS survives at
`ApplicantsPage.css:542`). Delete the header, the 96px track, and the dead rules.

### K-6. "wants" attributes internal state where an action is the fact
`client/src/domains/talent/utils/applicationStatus.js:103,111,129`;
`src/shared/services/notifications.js:327,331`

> `"The agency wants additional digitals or specific shots before deciding."`
> `"The agency wants to meet — watch for go-see details..."`
> `` `${agency} wants to develop you as a new face before full representation.` ``

The observable fact is the **request the agency made**, not the desire behind
it. The same file already gets this right at `notifications.js:323`
(`'asked for more from your submission.'`).

**Level 3.** Low cost, high consistency gain: `requested`, `asked for`.

### K-7. "Agencies don't ask unless they're interested."
`templates-submissions.js:164`, `text.js:215`,
`templates-materials.js:98` (as *"Organizers don't ask..."*)

Pholio asserting an agency's internal state from one observable action. It is
plausible; it is not Pholio's to say. The comment in `templates-materials.js:20`
records that the line was propagated deliberately.

The correct version of the same move sits two files away
(`templates-submissions.js:212`): *"An invitation isn't an offer. It means a
booker saw your profile and wants a proper look."*

**Level 3. Fix:** `"A request is not a decision. They will look again before
they decide."`

Paired with it, `"Sooner beats perfect."` is a pressure sentence that
contradicts the family's own best instinct (*"A real agency will wait."*). Cut it.

### K-8. Model reads shipped in assertion grammar
- `client/src/shared/constants/frameTaxonomy.js:141` renders
  `retouch_likelihood.none` as flat **`"Unretouched"`**. The field is literally a
  probability. `product-facts.md` §3 and `banned-language.md` §5 both name this
  by rule: *"'Declared unretouched', never 'unretouched'."* Worse,
  `FrameReadCaption.jsx:100-105` drops the "Proposed read" wrapper entirely on
  confirmed frames. **Fix:** `Reads as unretouched`, and keep the wrapper.
- `ProfilePage/BookingLanesControl.jsx:101-103` prints **`"Pholio signal"`** with a
  bare numeric fit score, no scale, no action, no correction path.
  `app-mechanics.md` §7: buckets mapped to actions, never numbers.
- `ApplyExperience.jsx:369-399, 3186, 3266` — `'A book with range'`,
  `` `Leans ${dominant.label}` ``, `'This house scouts commercial'`,
  `'Submission-ready'`. The house claims are regex reads over the boards the
  **talent** picked, rendered as assertions about the agency.
- `BriefUnderstanding.jsx:245-249` labels an **`Aesthetic`** row with no
  "not used for filtering" note, while the `set_aside` rows directly beneath it
  carry one. `soft_query` is echoed and never consumed
  (`services/discover/present.js:171`). A booker will reasonably conclude it was
  applied. Nine of the twelve `CASTING_BRIEFS` autocomplete suggestions are vibe
  language the parser routes to `soft_query` and drops — the product is teaching
  bookers to write briefs it ignores.

### K-9. Smaller inferences, same family
- `ApplyExperience.jsx:4461-4473` invents the agency's process wholesale:
  `` `${agencyName} reviews new submissions in batches... a reply usually takes
  anywhere from a few days to a few weeks` ``, `"and can run longer at a busy
  {market} house during peak casting"`, `"You'll be notified through Pholio the
  moment {agency} responds; nothing further is needed from you."` Nothing in
  `agencies` records cadence, batch behaviour, or a response-time distribution.
  Pholio holds one real fact here — `application_review_window_days`, default 30
  — and the screen omits it, while promising a reply on the surface where the
  true default outcome is `closed_no_response` written by a cron job.
- `ApplyExperience.jsx:462-479, 2976` prints **`Established {year}`** from a
  regex over the agency's marketing prose. No `established_*` or `founded_*`
  column exists in any migration, and `agencies.js:67-80` selects none, so only
  the regex branch can ever fire. `product-facts.md` §3: *"never fabricate an
  address, jurisdiction, registration, or founding date."*
- `TeamPage.jsx:83` — `` · together since {since} `` from the earliest Pholio
  `joined_at`. A twenty-year-old agency reads "together since 2026."
  **Fix:** `· on Pholio since {since}`.
- `ReviewRoom.jsx:615` — `"Not confirmed in person · over 90 days old"` renders
  for measurements that carry **no date at all** (`is_stale` is true when
  `measurements_updated_at` is absent). "Not confirmed in person" also implies
  non-stale measurements were confirmed in person. The correct pattern already
  exists at `dossier/DigitalsSet.jsx:33`: *"carry no capture date, so their age
  is unknown."*
- `ApplicantsPage.jsx:718-723` — **`"Pass rate"`** as a percentage with no sample
  floor. One pass and no signings renders `Pass rate 100%` in the desk hero.
  `app-mechanics.md` §4 requires a named floor ("too early to read"), which this
  product implements beautifully elsewhere (`Withheld` / `NotYet` on Intel).
- `client/src/domains/talent/utils/representationStatus.js:63-72` labels any
  `advancing` row **`'In conversation'`** with the agency's name — including
  `kept_on_file`, which is the industry's soft close. `app-mechanics.md` §7:
  *"kept-on-file is not shortlisted."*
- Dead but worth deleting: `SidebarProfile.jsx:67,136,188` — an emoji, the string
  `"Trending with agencies"` with no data source, and `const targetProgress = 75`
  driving a hardcoded completion ring.

---

## 4. Product truth: copy above a mechanic that is not there

- **The model decision emails are unreachable.**
  `templates-submissions.js:38` defines `` subject: (a) => `${a} kept your book
  on file` `` — the exact string `app-mechanics.md` §8 cites as *the* correct
  subject. It has **zero readers**. `email.js:224-238`'s subject map has only
  `accepted`, `represented`, `declined`; everything else falls through to
  `"Application update"`. And `sendApplicationStatusEmail` is called from just
  three sites, always with `accepted` or `declined`. So `kept_on_file`,
  `shortlisted`, `development` and `represented` — including **`"That's not a
  no."`** — never reach an inbox. The product's best copy is written and parked.
- **The decline that does send arrives disguised.** `email.js:232` —
  `` subject: `Application update from ${agencyName}` ``. The first 11 characters
  are `Application`, true of ten other emails, so the reader opens it not knowing
  whether it is good or bad news. The body says it plainly and well; the subject
  is the only string that flinches. **Fix:** `` `${agencyName} passed on your
  submission` `` plus a preheader.
- **The email verification beat is unreachable.**
  `CastingVerifyEmail.jsx:30-32` calls `onComplete()` unconditionally on mount,
  so the entire screen (headline, address card, resend, 45-second cooldown) is
  written, wired, and never seen.
- **The legacy comp card prints Age and Weight for adults.**
  `views/pdf/../templates/compcard.ejs:517-534`, reachable live via
  `?legacy=true` (`pdf.js:1835`), gates only on presence. `product-facts.md` §5:
  *"age/DOB is never printed for adults; weight only for fitness talent."* The
  same rule is followed correctly by both `stats-formatter.js` modules.
  Related: `views/portfolio/show.ejs:50-55, 241-243` publishes **Weight** for all
  talent with no fitness gate.
- **A fabricated AI capability on the public homepage.**
  `src/routes/api/public.js:432` ships a `bio_curated` that is a full editorial
  rewrite, presented as the curated counterpart to a deliberately messy
  `bio_raw`. `src/shared/lib/curate.js:9-21`'s `curateBio()` only trims
  whitespace, capitalizes the first letter, and appends a period. The demo shows
  a capability the shipped code cannot perform — and the fabricated text uses
  "versatile" and "sought-after", words the repo's **own** bio-writer denylist
  bans (`bio-writer/prompt-builder.js:143`).
- **Event-casting threads render representation labels.**
  `src/domains/talent/routes/messages.js` selects `a.status` but not
  `a.call_purpose`, and `MessagesPage/index.jsx:111,253` call
  `statusConfig(thread.status)` with no purpose argument, so
  `EVENT_STATUS_OVERRIDES` never fires. An applicant offered a **slot in a show**
  reads the header as **"Offer / Moving Forward"** and the cue as *"The agency
  wants to move forward — review the offer and agreement directly with them."*
  The 72-hour answer window is never shown and the slot lapses silently.
  `application-status.js` states the rule it breaks: *"`confirmed` is
  deliberately not `represented`."*
- **"Show nearest (outside spec)" calls an ability the server lacks.**
  `DiscoverPage.jsx:553` sends `include_outside_spec`, which nothing in `src/`
  reads. `discover-search.js:398` emits one group shape, so the button renders on
  every query and returns the same results. Two dead siblings in the same block:
  the `Loosen "…"` button (`honest_zero.removable_chip` is hardcoded `null`) and
  `why_facts` / `key_stat`, which are never produced.
- **"withdraw to free the slot" does not free the slot.**
  `ApplicationsView.jsx:661`. Withdrawal sets `status = 'withdrawn'` and deletes
  the thread (`applications.js:2831-2838`); it never touches
  `application_submission_requests`, which is what the quota counts.
- **"Export everything Pholio holds about you" excludes the photographs.**
  `SettingsPage/index.jsx:1232`. `buildTalentDataExport` returns database rows
  only (`data-export.js:380-384`) — image records, not image files. The
  delete-account panel two tabs away lists *"Your book, every image in it"* as
  what gets destroyed. A talent who exports before deleting loses the one thing
  the brand says they own.
- **"Two you can't" — the UI renders one.** `SettingsPage/index.jsx:833-849`
  names two always-on signals and a meeting time; `ALWAYS_ON_ROWS` has exactly
  one entry and it is not a meeting time.
- **Re-application is permanently blocked and three surfaces say otherwise.**
  `applications.js:1079-1087` refuses any second application where a row exists
  and `status !== 'withdrawn'`, including `closed_no_response` and `declined`.
  The off-Pholio tracker meanwhile promises a 6-month re-apply window. The
  chooser empty state (`ApplyExperience.jsx:2169`) instructs *"Withdraw an active
  submission to reopen a slot"* — impossible for exactly the talent who sees it,
  since closed rows are not withdrawable.
- **`/onboarding/test` is routed in production.** `client/src/App.jsx:81` renders
  `TestPreview.jsx:23` — `<h1>✓ Routing Works!</h1>` — at a publicly reachable
  Pholio URL, with an exclamation mark.
- **A dated one-off casting is stamped current.**
  `content/agencyBriefs.js:607` tells talent to attend an in-person casting on
  *"Wednesday, August 26"* under a pack-level `checkedOn = '2026-08-19'` that
  renders as "Checked 19 August 2026". Today is 29 August. The pack has no
  per-item expiry the renderer can act on.

---

## 5. System-wide decisions (Level 5)

These cannot be fixed instance by instance. Each is one decision applied
everywhere, with a migration cost.

### 5.1 Error registers: seven, not two
`product-facts.md` §6.4 records two. Repo-wide counts of user-facing strings:

| Opener | Count |
|---|---|
| `Failed to …` | 165 |
| `Could not …` | 92 |
| `Unable to …` | 52 |
| `We could not …` | 17 |
| `Something went wrong` | 9 |
| `That did not …` | 5 |
| `An unexpected error …` | 3 |

Plus **148** strings containing "please" or "sorry", including plain validation
errors (`LoginPage.jsx:216` `"Please enter both email and password."`), which
`app-mechanics.md` §3 bans outright. Plus ~30 bare `"Invalid X"` messages, also
banned by name. The app's actual production fallback,
`error-handler.js:411`, is `"An unexpected error occurred. Please try again
later."` — the literal banned genre.

The largest single family (`"Failed to X"`, overwhelmingly
`agency/routes/inbox.js`) has no next step at all, on the surface agency staff
use all day. And `pdf.js` ships `"Unable to connect to the database. Please
check your database configuration."` to end users **17 times** — an instruction
no talent or booker can act on.

**Recommendation:** adopt one error-response helper (the pattern already used
correctly in `comp-card-import.js` and `intel.js`) and one register. Do not
patch 300 strings by hand.

### 5.2 Naming: one object, five names — and it has spread
`product-facts.md` §6.1 records four (The Book / portfolio / images / media).
The audit found a fifth and sixth in live code.

The clearest single exhibit, `OverviewPage/index.jsx:340-341, 406-411`: nav says
**"The Book"**, the card heading says **"The Book."**, the count says
**"{n} images"**, the link text says **"Manage images"**, its `aria-label` says
**"Manage portfolio images"**, and the route is **`/media`**. Four names in one
card.

Also live: `MediaWorkspace.jsx:606` sets `document.title = 'Portfolio | Pholio'`
above a page headed "The Book."; `views/portfolio/show.ejs:207,288` heads a
section **"Gallery"** (which the `industry` glossary lists in its wrong→right
map); `SocialSection.jsx:270` adds a fifth sense of "media"
(**"Socials & Media"**); `agency/components/zones/PortfolioGrid.jsx:10` says
**"No portfolio images yet."** beside `ApplicantsZone.jsx:61`'s **"The book ·
N frames"**.

Four more naming families found, each needing one decision:

- **The terminal decline has five labels**: `Pass`/`Passed`, `Not moving
  forward`, `Decline`, `Declined`, plus a differing toast.
  `DeclineReasonModal` ships three of them in one modal.
- **The five RBAC roles have three complete label sets.** A person invited during
  setup as a **Booker** appears on the Team page as **Agent · Booker** and in
  their own sidebar as **Agent**. `MemberAccountChip.formatRole` emits a sixth,
  **"Member"**. "Principal", "Managing Agent" and "Observer" are invented;
  the trade's own titles are in `industry/reference/standards.md` §1.
- **The development state has seven names**, from `New Face — Development` to
  `Offer development (new face)` to `Developing`.
- **The readiness instrument has five names and its two tiers have six**
  (`Submission Readiness` / `Profile readiness` / `Profile completeness` /
  `Continue Audit` / `Full checklist`; `Required` / `Core` / `Strong` /
  `Strengthen` / `Essential` / `Enhancements`). Its default label is
  **`"Beginner"`** — a gamification tier applied to a working professional.
- **"Editorial" is now overloaded six ways**, not four: style value, deprecated
  image type, comp-card slot, design adjective, image-rights type
  (`FrameEditor.jsx:58`), and a profile-division taxonomy
  (`profileDivision.js` `FASHION_EDITORIAL`).
- **The comp-card axis has three names**: `edition` (shipped, per
  `product-facts.md` §5), `direction`, and `take` — all in `CompCard.jsx`.
- **The onboarding flow has four names**: `Screen Test` (canonical),
  `Casting Call`, `your casting`, `Open Call`. "Casting" is also the wrong
  industry word: a casting is the appointment where a client selects models for
  a specific job.

### 5.3 Em-dashes: 396 in user-facing strings
`banned-language.md` §4 is absolute: *"No em-dashes in published copy. Zero."*

| Area | Count |
|---|---|
| `client/src/domains/talent` | 188 |
| `src/domains/pdf` | 54 |
| `src/shared` (incl. the email family) | 53 |
| `client/src/domains/agency` | 53 |
| everything else | 48 |

Four are in **email subject lines**, where it is least defensible. Note a
genuine tension for the owner: the nine shipped comp-card edition `tone` lines
(`editions.js`) are quoted verbatim **with** em-dashes in `product-facts.md` §5
as the canonical shipped labels, and they are rendered
(`CompCard.jsx:661, 932`). The skill records them as canon while the ban says
zero. That needs one ruling.

### 5.4 Two decline paths for one irreversible decision
The desk, the review room and the Decision Dock all route a pass through
`DeclineReasonModal` — reason picker, "No reason" first and default, and
**"What the talent will read"** shown verbatim before it sends.
`TalentActionBar`'s `DeclineButton` (`:177, :255`) calls `decline.mutate()` with
no reason and no confirmation, one click. Same status write, same irreversible
effect on a person, two completely different degrees of deliberation.

### 5.5 Three definitions of the mandatory compensation label
`submission-disclosure-content.js:167` and `callCopy.js:37` agree
(`PAID` / `UNPAID` / `A STIPEND`, matching `product-facts.md` §5).
`events/pages/PickListPage.jsx:29` defines a third
(`Paid` / `Unpaid` / `Stipend`). `callCopy.js`'s own docstring warns:
*"Two different renderings of the same fact is how 'I thought it was paid'
happens."* The casing difference is arguably contextual; the third independent
source of truth for a mandatory disclosure is not.

### 5.6 The exit ramp has no door
`GET /api/agency/export` ships, supports CSV and JSON, and is gated to
OWNER/ADMIN. **No agency surface calls it.** The only export UI in the lane is
event-scoped. Meanwhile the Settings rail ships an **"Export"** tab that leads to
a developer webhook panel, and the custom-access modal offers an
**"Export data"** permission that unlocks nothing reachable.
`audience.md` §5 names the CSV exit ramp as one of the two things that earn a
third-party platform a booker's respect.

---

## 6. Consistency across surfaces

The user asked for consistency without forcing identical wording. Three findings,
and one deliberate non-finding.

### 6.1 The pass is written well in email and thinly in-app
Same event, two channels:

| | String |
|---|---|
| Email (`templates-submissions.js:79`) | *"They don't give a reason, and there isn't one to read into it. Agencies pass on board space, market and timing far more often than on the work itself."* |
| In-app (`applicationStatus.js:150-156`) | label `Not Selected`; `"This submission is closed. Keep your book current for future outreach."` |

The in-app surface has no reframe, does not name the absent reason, and gives no
structural explanation. A talent who opens the dashboard instead of the email
meets the coldest version of the product's most emotionally loaded moment.

**This is not a request for identical wording.** The two registers should differ.
What is missing is *parity of substance*.

Same check on the other three terminal states:

- **`accepted`** — the email carries *"Take your time over the contract, and
  don't sign anything you don't understand. A real agency will wait."* The
  in-app surface does not. This is the highest-stakes safety moment in the
  product and the in-app surface is what a talent is looking at when an offer
  lands. **Highest-priority parity gap.**
- **`kept_on_file`** — minor gap. In-app is already correct in substance and the
  code comment enforces *"soft yes, never a rejection."*
- **`closed_no_response`** — **no gap. This one is right**: *"Treat this as a
  pass. Keep your book current and keep submitting."* / *"The agency did not
  respond within its review window."* Names the silence, states the convention,
  reads nothing into it. Preserve.

### 6.2 The bell always carries the worse version
The decline notification (`notifications.js:341-348`) gives no reason and no
path to a person, while the email does both. The bell is what a talent checks
on their phone, and it is the only channel they can actually turn off — so the
thinner version is the one that always arrives.

### 6.3 Auto-close attributes Pholio's own window to the agency
`notifications.js:354` — `` `${agency} did not respond within its review window.` ``
`application-auto-close.js:49-53` returns `DEFAULT_REVIEW_WINDOW_DAYS = 30` when
the column is null. For every agency that never set one, "its review window" is
Pholio's convention wearing the agency's name. The auto-close module's own header
says the one thing it must not do is claim the agency decided something.

This is the only place the product's headline promise ("tells you when silence
means no") is cashed, so it is worth getting exactly right — and it currently
reaches the talent **only** through a bell notification they can switch off.
There is no auto-close email, while a message, an invitation and a request for
more photos all get one.

### 6.4 Deliberate non-finding: "a parent or guardian"
`product-facts.md` §3 says *"Say 'guardian', not 'parent', in product copy."*
Around 15 instances exist. For **Pholio's own copy** the rule applies cleanly and
should be followed (`profileScoring.js:174`, `sendReadiness.js:125,131`,
`profileReadinessItems.js:20`, `send-readiness.js:44`, and the guardian-consent
template).

Two categories should **not** be rewritten:

- `content/agencyBriefs.js` (lines 80, 203, 207, 363, 415, 468, 515) **quotes each
  agency's own published policy**. Rewriting the agency's word would misreport a
  third party's rule.
- `src/shared/lib/submission-disclosure-content.js:79,152` is versioned consent
  text hashed into consent records. The skill itself forbids editing it for
  style: *"changes are compliance events."*

---

## 7. Enforcement: make the rules tests

`banned-language.md` §6 already records the technique and asks for it to be
generalized. Today exactly one component is guarded:
`MarketCoverage.test.jsx:633` denies twelve words on one surface.

Evidence that it should be repo-wide: **`unlock` and `upgrade`, both on that
denylist, appear in live billing and toast copy outside the guarded component** —
`pholio-toast.js:52` (`'Upgrade to Studio+ to use this'`, an upsell rendered
through the **error** toast channel), `RightSidebar.jsx:112` (`'Upgrade Now'`,
urgency), `SubscriptionReturnBanner.jsx:10` (`'Premium tools unlock as billing
syncs'`), and four gate strings.

`unlock` is also doing double duty for two different gates — "finish your
profile" (`BlockedStatePanel.jsx:7`, `profileGating.js:238`) and "pay us"
(`pholio-toast.js:52`) — which is exactly the conflation the statutory rules
exist to prevent.

**Recommended CI rules**, cheapest first:

1. **Zero em-dashes** in string literals under `client/src`, `src`, `views`
   (exempting legal corpus and the `'—'` empty-cell glyph).
2. **No emoji, no exclamation marks** in user-facing strings.
3. **The §2 never-say list** as a hard denylist: `get discovered`, `get scouted`,
   `get signed`, `boost your chances`.
4. **Banned error genres**: `Something went wrong`, `An error occurred`, bare
   `Invalid`, and `please`/`sorry` in validation paths.
5. **The MarketCoverage denylist, promoted** to all talent-facing gate, billing
   and readiness surfaces.
6. **A parity test for the four terminal decision states**, asserting the in-app
   `next`/`detail` copy carries the same rule sentence the email does (§6.1).

The repo already proves it can do this well: the
`open-call-consent-copy-parity` test bundles the browser module and diffs it
against the server snapshot, and the bio-writer and submission-note-writer ship
their own denylists and quality rubrics.

---

## 8. What is working, and must be preserved

A critique that cannot name the good parts gets the good parts rewritten. These
are the models; several should become the template for the fixes above.

**The discipline done exactly right**

- `src/domains/agency/services/decline-reasons.js` — two registers for one event,
  deliberately: terse `agencyLabel` ("Wrong market", "Looking for more
  experience") and a fit-not-verdict `talentMessage` with a changeable factor and
  a route back. Plus: *"Absent, null and empty string all mean 'declined without
  a reason', which is valid and must never be coerced into a reason nobody
  chose."* This is the adverse-action rule implemented as a data structure, and
  it refuses to launder the agency's decision. **This is the answer to "different
  contexts need different language" — keep it exactly as it is.**
- `client/src/domains/talent/components/DigitalsFreshness.jsx` — four honest
  states, *"Undated is never reported as current"*, reads the server engine
  rather than re-deriving, and refuses to infer a shoot date from upload time.
  The inference-vs-knowledge discipline, done right, with its reasoning written
  down.
- `offPholio/HandoffScene.jsx:133` — `"Not sent yet"`, and the comment explaining
  why this screen must not borrow the claim.
- `client/src/domains/opencall/components/consentCopy.js` — who-sees-what stated
  before the choice, and honest withdrawal: *"cannot recall copies already
  downloaded or recorded by the organizer or a designer."* Pinned to the server
  snapshot by a parity test.
- `IntelPage`'s `Withheld` and `NotYet` — a gate that states what is behind it
  and a threshold that names its sample floor, never a blurred fake chart.
  *"a rank drawn from three views would be noise wearing a number."*
- The magic-link family (`ClaimPage`, `DisownPage`, `PickListPage`,
  `MaterialsPage`) — four files that document why they refuse to invent a
  distinction the server will not confirm, and converge on one string.
- `components/status/divisions.js` — `'Standing unknown'`, with
  *"NEVER infer a positive standing from absence."*
- `ApplicantsPage.jsx:1405-1409` — *"There are more than that on file — narrow by
  city, date or search and the whole pool is searched, not just what is listed
  here."*

**The register at its best**

- `templates-submissions.js` — *"That's not a no."*, *"They don't give a reason,
  and there isn't one to read into it."*, *"A real agency will wait."*,
  *"An invitation isn't an offer."*, and *"A legitimate agency never asks you to
  pay to be represented."* — scam education inside a transactional email,
  unprompted.
- `SettingsPage/index.jsx:1428-1438` — the delete-account panel, closing on
  *"Anything an agency already downloaded lives outside Pholio and can't be
  recalled."*
- `studioCopy.js:24` — *"Premium comp-card themes and 90-day portfolio analytics.
  Nothing an agency sees or receives changes with it."*
- `submission-program-content.js:22` — *"Every account gets 5 discovery
  submissions per calendar month (UTC). This is an anti-spam limit, it is the
  same on every plan, and no payment lifts it."* Verified true: no `isPro` gate
  exists in `application-quota.js`, whose header cites Cal. Lab. Code §1701 as
  the reason. **The mechanic is clean; only its wording elsewhere is not.**
- `PickListsPanel.jsx:238-243` — *"Nothing they do moves an application; only
  your offer does."*
- `SpecBuilderPanel.jsx:437` — *"It is guidance, not a gate — anyone can still
  submit, and nothing here can turn an applicant away."*
- The spec-registry export bundle (README.txt / STATS.txt / EMAIL.txt) — factual
  only, nothing invented, no send button, and *"Pholio does not send anything on
  your behalf."*
- `guardian-consent.ejs:116` — *"Only clicking the button above records your
  consent. Simply opening this page does not."*

**Structural wins worth defending**

- **Zero marketing in transactional email**, verified family-wide.
- **`notify-profile-readiness.js` fires only on readiness lost, never gained.**
  There is no "your profile is ready" email anywhere. That restraint is exactly
  right and was clearly deliberate.
- **No fabricated entity facts anywhere.** No postal address, jurisdiction,
  registration, or founding date; `footer.js:3-8` documents the deliberate
  absence.
- **The representation data model is industry-correct**: one mother agency plus
  non-exclusive market and placement agencies, with market, territory and
  division. `industry/standards.md` §1 warns that *"software that assumes one
  talent ↔ one agency has already failed."* Pholio does not make that mistake.
- **The option/hold/bookout machine is named correctly**
  (`1st Option`, `2nd Option`, `On Hold`, `Bookout`, `Released`), which almost no
  product in this category gets right. Same for **Curve**, never "plus-size".
- Role nouns are clean: every occurrence of "users"/"customers" in the codebase
  is a table name, route path, or Stripe field. None in user-facing copy.

---

## 9. Corrections, and what I rejected

Reported so the owner does not chase non-issues.

- **The mock social-OAuth route is NOT a production exposure.** One lane reported
  that `src/domains/talent/routes/social-oauth.js` — which generates
  `Math.random()` follower counts, engagement rates and audience demographics —
  is "mounted unconditionally". It is not.
  `src/domains/talent/routes/index.js:81-83` wraps the mount in
  `if (isDevelopmentRuntime())`, and
  `src/shared/lib/runtime-environment.js:40-45` is a fail-**closed** allowlist
  (`["development","test"]`). The file even documents the team already finding
  and fixing the fail-open version of this gate. Two further guards hold:
  `audience-dto.js:186` excludes follower metrics from agency-facing DTOs, and
  `social-helpers.js:20` nulls `instagram_followers`. What remains is low-priority
  wording on a dev-only surface ("Verified", "Authorization Success!",
  "Secured Sandbox connection").
- **`product-facts.md` §6.9 is out of date.** It records the event consent copy as
  *"written and hashed into consent records but unreachable in the UI flow."*
  It is now reachable: `consentCopy.js` is imported and rendered by
  `OpenCallApplyPage.jsx:23` and `ApplyPage/SubmissionTerms.jsx:6`, and pinned by
  `tests/unit/open-call-consent-copy-parity.test.js`. **The defect is resolved;
  the skill should be updated.**
- **I initially recorded "no emoji anywhere" and that was wrong.** A `grep -P`
  unicode range failed silently; a proper scan found two:
  `SidebarProfile.jsx:67` (dead code) and `TestPreview.jsx:23` (routed in
  production).
- **`product-facts.md` §6.4 understates the error problem** (two registers
  recorded; seven found). §6.1 understates the naming problem (four names
  recorded; six found, plus four more naming families).
- **Cross-skill conflict to resolve.** `industry/reference/glossary.md`'s
  wrong→right table answers *"Job application / cover letter (to an agency)"*
  with *"Submission / **getting scouted** / open call"*. `banned-language.md` §2
  puts "get scouted" on the never-say list, and CLAUDE.md says the language skill
  defers to `industry` on domain truth. An agent following the industry skill
  alone would ship a banned phrase — which is plausibly how
  `PhotosTab.jsx:326` happened. Add a compliance pointer to that glossary row.

---

## 10. Dead code carrying live violations

23 modules in `client/src` have **zero** importers, verified across all of
`client/src`. Several carry the audit's worst strings, and deletion resolves them
permanently at no risk:

`AgencyOnboardingPage.jsx` (628 lines, plus its transitively dead
`OnboardingSteps.jsx` and `agencyOnboardingSteps.js`), `ImageMetadataModal.jsx`,
`PhotosTab.jsx`, `TalentSpotlight.jsx`, `PhotoEditorModal.jsx`,
`CosmicBackground.jsx`, `ProfileReadinessAudit.jsx`, `GradientText.jsx`,
`CurationGuidance.jsx`, `spec-marks.jsx`, `Breadcrumbs.jsx`, `TierBadge.jsx`,
`SidebarProfile.jsx`, `SkeletonOverview.jsx`, `MetricCardDetailed.jsx`,
`SharedStatCard.jsx`, `PortfolioGrid.jsx`, `HeroCard.jsx`,
`CinematicNextButton.jsx`, `SidebarActions.jsx`, and three utility modules.
Also `views/auth/partners.ejs`, now unreachable (both `/partners` routes
redirect), which still offers a self-serve **Scout** signup role.

What deletion removes: `"get discovered"` and `"stand out"` (C-6), the
`🌟` emoji, `"Trending with agencies"`, a hardcoded 75% completion ring,
`"Upgrade Now"`, a fifth readiness instrument (`"{score}% Ready"`,
`"Build Your Agency Book"`), a third `"ready for agency review"` assertion, and
the banned gradient-text component.

One live landmine in the same family worth naming separately: the dead agency
onboarding flow labels a step **`Commission`** with the title
*"Ready to commission."* and the button *"Commission workspace"*. In this
industry "commission" is the agency's percentage — the single most
legitimacy-loaded money word — in a product whose position is that it never
charges agencies and takes no commission. **The live instance of the same
mistake is `agency/pages/SetupPage/index.jsx:324`**: *"{agencyName} is
commissioned. Your intake boards and inbox are live."* The honest word is
already on the screen two lines above ("The workspace is open."). Line 331's
*"Enter the command center"* is SaaS-generic where the register should be
industry-institutional.

---

## 11. Recommended order of work

1. **Decide** C-1, C-2, C-3, C-4 (guardian consent rebuild, minor publication,
   the Studio+ public badge, the discoverability gate). Nothing else should ship
   ahead of these.
2. **Fix** C-7 and C-8 (email opt-out, minor age band) — both are small code
   changes with correct copy already written.
3. **Delete** the 23 orphaned modules and `views/auth/partners.ejs`. Resolves
   C-6 and several §3 items at zero risk.
4. **Fix the five inference claims** in §3 that are one-line replacements:
   K-1 (`Under Review`), K-2 (`showed repeat interest` / `Agency interest`),
   K-4 (`|| 'editorial'`), K-5 (`Top matches today` and the `Match` column),
   K-6 (`wants` → `requested`).
5. **Wire the parked email family** (§4) — the product's best copy is already
   written and unreachable.
6. **Take the five naming decisions** in §5.2 as one pass, and the error-register
   decision in §5.1 with a shared helper.
7. **Land the CI rules** in §7, starting with em-dashes and the never-say list.
8. **Update the skill**: `product-facts.md` §6.4, §6.1, §6.9, and the `industry`
   glossary row (§9).

---

## 12. Method and coverage

Seven disjoint read-only lanes plus an independent lead sweep, all against
`.claude/skills/pholio-app-language/` as the authority.

| Lane | Scope | Files | Strings |
|---|---|---|---|
| Talent core | Overview, Media, Profile, Settings, Intel, components | 92 | ~640 |
| Talent applications | Apply, Applications, OpenCalls, Messages, market, tracker | 42 | ~500 |
| Agency | the complete `domains/agency` tree, plus 46 CSS files | 137 | ~700-800 |
| Onboarding, auth, views | Screen Test, auth, all EJS except `views/pdf` | 58 | ~300 |
| Shared client | shared components, all 10 constants files, schemas, opencall, events, messaging, moderation, internal | ~60 | — |
| Emails and notifications | the full `pholio-email` family, 5 notifier services, auto-close | — | 28 emails, 38 notifications |
| Backend and artifacts | all domain routes, middleware, spec-registry export, PDF templates | ~150 | 300+ |

Behaviour was traced into server code for every Level 6 claim. Claims that did
not survive that check are in §9. Nothing was modified; this pass is read-only.
