# Industry alignment audit — pholio-app

**Date:** 2026-08-29
**Authority:** `.claude/skills/industry/` (SKILL.md + standards, glossary, lifecycle, gaps),
read as the Booker: an agency director / head booker / mother agent.
**Question:** would a real agency or a working model look at this and trust it?
**Method:** four domain lanes (representation and roster; booking, casting and
calendar; materials and stats; minors, rights and the money boundary) plus a lead
sweep. Every absence was checked against `migrations/` and the domain routers
before being called a gap. Claims that did not survive verification, including two
of my own, are in §7.

---

## 1. Verdict

**Pholio's industry model is the best I have audited in this class of software, and
a surprising amount of it is not connected to anything.**

The vocabulary is right, and that is rare. The representation model is right in a
way almost no platform gets right: one mother agency enforced, non-exclusive market
and placement agencies, market and territory scoped. The comp-card engine knows a
kids card carries no body measurements. The digitals freshness engine refuses to
call an undated set current. The event-casting offer clock refuses to let an
organizer record a confirmation the talent never gave.

The failures are almost all of one kind: **a correct model with no write path, or a
correct model that the surface a user actually reads does not consult.** That is a
much better problem than a wrong model, and it makes most of the fixes small.

Three findings would each, on their own, cost Pholio the trust of a working booker
or a working model:

1. **Every comp card prints "Direct Bookings" over the model's personal phone**, for
   represented and unrepresented talent alike (§2.1).
2. **A talent who declares themselves unavailable is shown to agencies as
   "Available"** (§2.2).
3. **Two independent code paths print a minor's bust, waist and hips** (§2.3).

---

## 2. P0 — breaks trust or creates compliance risk

### 2.1 Every comp card says "Direct Bookings" and prints the model's phone

**Industry.** A comp card is the *booking agency's* leave-behind. The agency block
is the whole point of the back of the card. Printing the model's own phone number
invites the client to book around the agency, and in the trade that is how a model
gets dropped.

**Pholio.** Verified end to end:

- `src/domains/pdf/routes/pdf.js:942-951` resolves representation from
  `profile.partner_agency_id`.
- `profiles.partner_agency_id` is **never written**. It appears only in a field
  allowlist (`src/domains/talent/routes/profile.js:170`), and `lockedAgencyId`, the
  session key that once set it, has **zero occurrences anywhere in `src/`**.
- So `representation` is always `null`, and
  `src/domains/pdf/composition/composition-director.js:155-182` falls to the
  `direct` branch: `label: options.kids ? "Guardian Contact" : "Direct Bookings"`,
  `primary: phone`.
- `talent_representations` — the correct table, with mother/placement, market and
  territory — is never consulted by the PDF path at all.

A model with a recorded mother agency and three market placements still gets a card
headed "Direct Bookings" with their personal number on it. This is the most visible
artifact the product makes, and the reason a talent pays for Studio+ themes.

**Fix.** The machinery is right and only the input is missing. The `represented`
branch works, and the kids branch is already industry-correct ("Guardian Contact",
never the child's own booking identity, with the reasoning in the JSDoc at
`:149-151`). Resolve `representation` from `talent_representations`, scoped to the
card preset's market, falling back to the mother agency. Presets are already
market-scoped (`migrations/20260627130000_add_comp_card_preset_purpose.js`), so the
card already knows which market it is for.

### 2.2 A talent who declares "unavailable" is shown to agencies as "Available"

**Industry.** Declared availability is the first thing a booker reads before
promising a client dates. Showing the wrong one is how a client gets a model who
cannot work.

**Pholio.**

- `src/domains/talent/routes/availability.js:37` writes exactly three values:
  `available | limited | unavailable`.
- `client/src/domains/agency/components/status/statusConfig.js` `STATES` has an
  `available` key and **no `limited` and no `unavailable` key**.
- `:103` — `export const getState = (status) => STATES[norm(status)] || STATES.available;`

The fallback is the **most optimistic** state. A talent who blocked themselves out
reads as open, in both `ReadoutBand.jsx` and `CalendarLine.jsx`.

**The correct discipline already exists one layer away.**
`src/domains/agency/services/discover/constraint-eval.js:104-130` states the right
rule in its own docstring: *"Pass ONLY when we have positive declared data
(bookouts) that do not overlap the requested window. Missing data → unknown (never
pass)."* The search engine is careful; the screen a booker reads is not. Neither
handles `limited`.

**Fix.** Add `limited` and `unavailable` to `STATES`; make `getState` return an
explicit unknown rather than the most optimistic state. Never default an
availability read to available.

### 2.3 Two independent paths print a minor's bust, waist and hips

**Industry.** A kids card carries age, height, clothing size, shoes, hair, eyes.
Never bust, waist, hips. Pholio knows this and implements it correctly at
`src/domains/pdf/composition/stats-formatter.js:12-13` and `:687-700`. Both paths
below bypass that code.

**Path A — a stale `profiles.age` beats the date of birth.**
`stats-formatter.js:303-306`:

```js
function resolveAge(profile, ref) {
  const direct = toPositiveNumber(profile?.age);
  if (direct != null) return Math.floor(direct);
  return ageFromDob(profile?.date_of_birth, ref);
}
```

`src/domains/talent/routes/profile.js:925-932` refuses to *write* the column
("Stored age is no longer a source of truth… Defensively guarantee neither age
column is ever written from this path") but never *clears* an existing value. A
legacy row carrying a stale adult `age` with a minor date of birth renders the
adult stats track. The kids suppression list is correct and simply never reached.

**Path B — the digitals sheet has no kids branch at all.**
`src/domains/pdf/routes/pdf.js:1997-2030` bypasses the canonical formatter
entirely: it derives `isMale` from `gender` (the exact thing `stats_track` was built
to replace), pushes bust, waist and hips with no age check, and reads a man's suit
size out of the `dress_size` column while `suit_size` is ignored. And
`src/app.js:936` mounts `app.use("/", pdfRoutes)` with **no auth**; the route gates
only on `minorPublicExposureAllowed`, which a *consented* minor passes.

**Fix.** Delete `resolveAge`'s `profile.age` branch and add a migration that nulls
or drops the column; route the digitals sheet through `buildCanonicalStats` and the
audience DTO, and require a share token or agency session.

### 2.4 The shoe converter shown to the talent is wrong by roughly a factor of two

`client/src/shared/utils/measurementConversions.js:35`:

```js
'US': { 'UK': s - 1, 'EU': (s * 2) + 31 },
'EU': { 'US': (s - 31) / 2, 'UK': (s - 33) / 2 }
```

EU is computed as `US × 2 + 31`, so a US 9 renders **"EU 49.0"** — a men's 15. The
server is correct: `src/domains/pdf/composition/stats-formatter.js:47` uses
`SHOE_EU_OFFSET = { women: 31, men: 33 }`, i.e. EU = US + offset, giving EU 40.

So the profile screen and the comp card generated by the same product print
different shoe sizes for the same person, and the one the talent reads is the wrong
one. It is also gender-blind. A model repeats "EU 49" into a European agency's
intake form and wastes a fitting.

**Fix.** Delete `getShoeConversions` and call a shared, track-aware port of the
server's `renderShoe`. Smallest diff in this document, and the one place the product
prints an obviously wrong number to the talent's face.

---

## 3. The structural finding: correct models with no write path

This is the shape of most of what is wrong, and it is worth naming as one pattern
rather than five bugs.

| Model | Quality of the model | Live status |
|---|---|---|
| `talent_commitments` (options, holds, bookings) | Excellent: `kind`, `option_tier` 1/2, `exclusivity`, `usage {territory, media[]}`, `client_ref` marked non-financial; hardened with `confirmed_at/by`, `released_at/by`, `release_reason` | **Read-only.** Only production reader is `talent-dossier.js:334`. Only writers are tests. No route exposes a write. |
| `roster_board_standings` | Correct per-board standing, `is_primary`, nine-value check including `onfile` and `developing` | **Zero references in `src/`** |
| `talent_records` | Built for entering an existing roster | **Zero references in `src/`** |
| `roster_memberships` | Per-agency roster membership | Dead by the codebase's own admission: `minor-submission-access.js:182` — *"roster_memberships has had no active writers since roster-as-system-of-record was removed"* |
| `minor_permits` | Correct: `permit_type`, `jurisdiction`, `issued_at`, `expires_at`, `chaperone_required`, `school_constraints` | Zero reads, zero writes. Appears only in the DSAR catalogue. What ships instead is a self-ticked `profiles.work_permit_on_file` boolean that gates nothing and scores +4. |
| `profile_field_visibility` | A 9-field × 6-audience matrix with a documented default table | Drives **one** decision (public stats on the portfolio). Not consulted by `audience-dto.js`, `talent-dossier.js`, `submission-profile.js` or `pdf/generator.js` — verified, zero references in all four. No client surface calls its PATCH endpoint. |
| `interviews`, `reminders` | Scheduling models | Removed from code, still in schema |

### 3.1 The booking desk: the amputation is half-done

I first read this as "built and never wired" and was about to recommend adding CRUD.
That was wrong. `docs/pholio-product-plan-2026-08.md:187-192` draws an explicit
scope line:

> **Pholio's agency product ends when a decision is made.** Collect, compare,
> triage, request, decide, hand off — ours. Options, bookings, calendars, invoices,
> contracts, ongoing relationship — theirs, in the system they already pay for.
> "Invite to apply" and "shortlist" sit just inside the line. "Interview scheduling"
> and "roster management" sit just outside it.

`casting_briefs` and `talent_commitments` were created by the *same* July migration.
`talent_commitments` was then hardened with the full confirm-or-release column set.
August's cleanup dropped `casting_briefs` with an exemplary migration and stopped
there. The table, its read path, its view model (`dossierModel.js` `calendarSpans`,
which correctly draws talent bookouts and agency commitments on one rule) and its UI
vocabulary (`1st Option`, `2nd Option`, `On Hold`, `Released`) all survived.

**The consequence is the live P0 in §2.2 plus a second false assertion:**
`ReadoutBand.jsx:60` renders **"Clear for 90 days"** computed from bookouts alone,
and `CalendarLine.jsx:48` reads *"No bookouts, options, or holds on record for this
window"* — naming two record types the product cannot hold. "Clear" is a claim about
the agency's calendar, and Pholio does not have one.

**Recommendation: finish the amputation, do not build the desk.** Drop
`talent_commitments`, `interviews` and `reminders` the way `drop_casting_briefs.js`
did it; delete the commitments branch of `buildAvailability` and `calendarSpans`;
delete the option/hold/booked/released rows from `STATES`. Unless the owner reverses
the scope line — in which case the harden migration already built the columns, and
the event-casting offer clock is the model to copy for confirm-or-release. **Either
way, §2.2 and the "Clear for 90 days" line must be fixed first and independently:
they are wrong under both decisions.**

### 3.2 The signing loop is open

`PATCH /api/agency/applications/:id/status → represented`
(`src/domains/agency/routes/inbox.js:1687-1770`) writes **one string on a historical
application row**. No `talent_representations` row, no market, no board, no start
date, no counter-signature. And `talent_representations` is writable only by the
talent (`src/domains/talent/routes/representations.js`, every route
`requireRole("TALENT")`).

So an agency's entire knowledge of its own signed talent is an `applications.status`
string, and the signing agency reads its own model as `unrepresented` in Discover.

The scope line puts "roster management" outside, so the absence of a roster *page*
may be deliberate. But `represented` is the decision the line ends **at**, so
recording it properly is inside the line by the plan's own logic.

---

## 4. P1 — real users will hit this

**Representation and roster**

- **Representation is an unverified claim about a named third party.** A talent
  POSTs any `agency_id` (`representations.js:22`, zod `uuid()` only, no consent
  check), and `deriveRepresentationStatus` then broadcasts *"represented by <that
  real agency>"* to every other agency in Discover. An internal representation
  should be `pending_confirmation` until that agency accepts.
- **`exclusive_elsewhere` is market-blind.** `audience-dto.js:460-462` treats any
  active `is_exclusive` row as exclusive everywhere, while the talent's own checkbox
  says *"Exclusive in this market or territory"*. A model exclusively signed in
  Paris is broadcast as untouchable to Tokyo, NYC and Milan — the opposite of how
  placement works.
- **The highest-value scouting query cannot be asked.** `RepresentationSection.jsx:53-60`
  sets `seeking_representation = false` the moment a talent picks "Represented". A
  model with a Kansas mother agency actively seeking NYC placement is invisible to
  every scout. Seeking needs a market dimension.
- **Commission split is structurally inexpressible.** Money is correctly out of
  scope, but *which mother agency placed this talent with which market agency* is a
  representation fact. `talent_representations` rows are flat and unlinked — no
  self-FK — so a mother agent cannot see their own placements.
- **Relationship types are too narrow**: `('mother','placement')` only. Missing
  **management** (standard for the actors the product also claims) and the
  market-agency versus placement-agency distinction the UI label already blurs.
- **A scout can sign the roster.** `SCOUT` lacks `applications.accept` but has
  `applications.bulk_update_status`, and `PATCH .../status` accepts any writable
  status including `represented` (`route-permissions.js:233-236`). A scout can bulk-set
  400 submissions to represented. In a real agency a scout finds faces; the board
  director signs.
- **A declined talent can never re-apply, while the decline tells them to.**
  `decline-reasons.js:74` says *"worth shooting a fresh set before you apply
  again"*, and `applications.js:1078-1088` returns 409 for any non-withdrawn prior
  row — including `closed_no_response`, an agency that simply never answered.
- **Kept-on-file and development have no view.** Both are correct, reachable
  actions, and `LIFECYCLE_TABS` drops both from the desk. The kept-on-file pool is
  the asset an agency opens at the start of a season, and it is reachable only by
  scrolling "All".
- **A stage drag destroys finer-grained outcomes.** `casting-stage-helpers.js:9-45`
  maps kept-on-file, requested-more and meeting-requested all to "Shortlisted", and
  the inverse map writes `shortlisted` back. One drag silently converts a
  kept-on-file into live consideration.

**Materials and stats**

- **Shoe region is stored and then discarded.** `profiles.shoe_region` is collected
  and validated, and is **not** in `SNAPSHOT_FIELDS`, so the frozen submission hands
  the agency `shoe_size: 9` with no system. `buildCanonicalStats` emits a bare
  `Shoe`. UK never appears anywhere, and `renderShoe` applies the men's UK→US offset
  to everyone.
- **Garment localization exists and is dead code.** `dressIntl` computes US/EU/UK/IT/FR
  correctly and has **zero consumers**; the shipped card emits US/EU only, and the
  talent input is a US-only dropdown. Milan and Paris ask in IT and FR.
- **Men's collar/neck does not exist, nor do parts fields.** Tellingly, the comp-card
  importer already *parses* collar and cup off other agencies' cards
  (`parse-card.js:46-47`) and then discards them for want of a mapping. `parts` is a
  live booking lane.
- **The frozen submission package strips the shoot date and the tearsheet credit.**
  `snapshotSubmissionImage` (`applications.js:457-468`) carries no `captured_at` and
  no credits. Undated, a digital is just a photo; uncredited, a tear is just an
  image. Both facts are collected and then lost at the handoff.
- **Readiness and the apply flow disagree about the digitals set.** The apply flow is
  correct (headshot, ¾, full-length, profile, back). `profile-readiness-images.js:69`
  lets a ¾ frame satisfy the full-length slot and has no ¾ slot at all, so profile
  strength tells a talent their digitals are complete and the apply flow then shows
  an empty slot.
- **Required fields do not change by division.** Twelve booking lanes, one universal
  field set. Fit is booked on exact measurements; parts needs ring, glove and nail;
  fitness needs athletic measures. A comment at `MeasurementsSection.jsx:36-39`
  records that lane-driven fields were *removed*.
- **Weight validation excludes children.** `validation.js:234` requires 30–200 kg,
  and the UI tapes clamp height at 122–130 cm and shoe at US 3. A child under about
  seven cannot record their stats — while the comp-card engine has a complete,
  correct kids track that the input layer cannot feed. This is the one place the
  "never hardcode ranges as validation" rule is broken; height, bust, waist and hips
  correctly have no min or max.

**Minors and rights**

- **Guardian consent gates exposure and two collection classes, not collection.** A
  minor's identity, city, phone, emergency contacts and headshots are collected
  before any guardian is contacted — and the guardian's own consent email is built
  *from* the photo Pholio already holds (`guardian-consent.js:57`).
- **The whole minor regime hangs off a self-declared, freely editable date of
  birth.** Stripe Identity exists but is optional and only unlocks adult content. A
  15-year-old who types 1998 is an adult everywhere in the codebase. Equally, an
  onboarded adult can edit their DOB into minor range and no re-check runs, no
  suspension follows, and previously collected body data is un-exposed but not
  quarantined.
- **Nothing stops the guardian email being the minor's own second address.**
  `guardian-consent.js:110-117` validates the format and nothing else. The token flow
  is cryptographically sound and semantically empty.
- **A minor can self-grant an AI-likeness licence.** The only write path hardcodes
  `actorType: "talent"` (`settings.js:312`, `:988`) and the service imports nothing
  from `talent-age.js` — while the migration's own comment says `actor_type` exists
  *"because a guardian may consent for a minor and that must be distinguishable in
  the record forever."*
- **The guardian-signed model release is typed by the talent.** `image-rights.js:170-178`
  correctly requires `signer_role === "guardian"` for a minor's submission, and
  `PUT /api/talent/media/:id/model-release` writes `signer_role` straight from the
  request body under `requireRole("TALENT")`.
- **A consented minor's public portfolio publishes "Under 18" beside their name,
  city and photos** (`portfolio.js:305-309`), while the visibility matrix seeds
  `dob.public = false` precisely to prevent it. The submission path gets this right.
- **Cross-border transfer has no disclosure.** `agencies.primary_market_country` is
  collected and never surfaced. The submission disclosure never says the package may
  leave the applicant's country.

---

## 5. P2 — realism and maturity

- **Divisions shift emphasis, not shape.** `DIVISION_READINESS_CONFIG` genuinely
  re-weights readiness per board, and Fit correctly prioritises exact measurements.
  But it re-weights fields that already exist. For fashion, commercial and fit that
  is fine; for **Talent & Performance** it is not. The product detects actors,
  hosts, voice and dancers by keyword, tells them their board scans for "story,
  training, and audience-facing presence", and then hands them a modelling comp
  card. There is **no union concept anywhere** (the only `union` matches in the
  codebase are Zod's `z.union`), no sides, no credits, and a reel exists only as a
  social-account platform.
- **Onboarding asks for a fashion stat set before it asks what work you want.**
  `RAIL_STEPS` is a single fixed path — Identity, Digitals, Stats, Details — with the
  lane picker in the *last* step, after measurements. Gender-based track variation is
  present and good; division-based variation is absent.
- **No A5.** `machine-readable.js:50` fixes trim at 5.5 × 8.5 in and calls it "the
  standard". It is the *US* standard; A5 is the European one, and presets already
  carry a market. Geometry is otherwise correct.
- **Measurements are timestamped, not versioned.** One column, no history table. The
  re-confirm endpoint is honestly labelled but writes a bare `now()`, so nothing
  distinguishes "re-measured" from "cleared the stale flag".
- **Test/TFP is a label, not an object**, with no TFP flag and no usage terms of its
  own — and a test shoot is both the most common origin of a new face's book and the
  most common source of a later usage dispute. Tearsheet credits live in a JSON blob,
  so "how many tears does she have" cannot be answered.
- **The digitals no-retouch rule is enforced in the UI only.** `FrameEditor.jsx:948`
  hides the field with exactly the right copy; `validation.js:1478` accepts
  `retouched_at` on any image regardless of type.
- **Three overlapping "kind of board" discriminators** (`boards.kind`,
  `boards.board_type`, and the client's `BOARD_KIND`), so the Signing page mixes
  permanent divisions with per-job packages and lets a Women's board be "wrapped".
- **No prospect or lead object.** Invite-to-apply is present and inside the scope
  line, and `applicant_identities` correctly makes a pre-account applicant
  first-class. What is missing is a lead a scout can enter for someone with only a
  name and a face.
- **"Booking lanes" is invented vocabulary** for what the trade calls boards or
  divisions — and `divisions.js` already ships the correct taxonomy, so there are two
  vocabularies for one concept.
- **"Tall" is hardcoded to 175 cm, gender-blind** (`intent-parser.js:273`). A 175 cm
  man is not tall.

---

## 6. What is working, and should not be re-litigated

- **The terminology passes the fastest "built by outsiders" test.** I swept every
  user-facing string against the glossary's wrong-to-right map. Zero hits for
  "business card", "profile card", "photo gallery", "album", "cover letter", "job
  application", "timesheet", or "selfies" used for digitals. The two "selfie" uses
  are correct (one quotes an agency's own rule, one describes Stripe's ID check) and
  "Interview Magazine" is a real publication in a bio-writer grounding list. The word
  "interview" never reaches a user: the shipped UI says **meeting / go-see**.
- **The representation model itself**: one active mother agency enforced,
  non-exclusive market and placement agencies, market and territory scoped,
  history retained.
- **`decline-reasons.js`**: two registers for one event, reasons that describe the
  agency's situation rather than the person, and the refusal to coerce absence into a
  reason nobody chose.
- **The digitals engine**: four honest freshness states, "undated is never reported as
  current", a refusal to infer a shoot date from upload time, the
  `portfolio_as_digital` advisory, and `isDigitalSlot` refusing to let book frames
  fill digitals slots. The digitals-versus-book distinction is held rigorously nearly
  everywhere.
- **The comp-card engine**: correct trim and front/back structure, `curateBackStory({ max: 5 })`
  with a warning below three, the kids track (age, clothing size, no body
  measurements, native kids shoe sizing), and `measured_in_person_at` as the only
  state permitted to say "confirmed".
- **Event casting is the best-modelled area in the product.** A designer's mark is
  explicitly never an application status — *"several designers hold private,
  conflicting opinions about the same applicant, and none of them is the organizer's
  decision"*. A partial unique index enforces one live offer per applicant. The
  72-hour offer clock is real, and `confirmed` / `declined_by_talent` are writable
  **only by the talent**, so an organizer cannot record a confirmation that was never
  given. If options ever return, model the challenge on this code.
- **The option/hold/bookout vocabulary is correct** where it appears, and **Curve** is
  used throughout, never "plus-size".
- **Two exemplary retirement migrations.** `drop_commissions.js` and
  `drop_casting_briefs.js` both explain what the table was, why it is going, and that
  it never had a writer. This team knows how to remove a mechanic honestly, which is
  exactly the skill §3.1 needs.

---

## 7. Corrections — claims that did not survive verification

**Two of these are corrections to my own findings.** Recorded so nobody acts on them.

- **The mock social-OAuth route is not a production exposure.** Reported in the
  language audit as unconditionally mounted. It is not:
  `src/domains/talent/routes/index.js:81-83` wraps the mount in
  `if (isDevelopmentRuntime())`, and that helper is a fail-**closed** allowlist of
  exactly `["development","test"]`.
- **`commissions` was already dropped — my own error.** I reported it as a vestigial
  table still present with zero reads, and recommended dropping it.
  `migrations/20260712010000_drop_commissions.js` removed it in July, with an
  exemplary rationale. **Method error:** I built the table inventory from
  `createTable` greps, which do not account for later drops, so that inventory
  over-reports. Exactly two tables have dedicated drop migrations: `commissions` and
  `casting_briefs`.
- **The booking desk was not "forgotten" — my own framing error.** I first read it as
  built-and-never-wired and was about to recommend adding CRUD. The product plan
  deliberately excludes it. The correct finding is that the *removal* is half-done,
  and the correct fix is to finish it, not to build. See §3.1.
- **The scouting-pipeline gap is smaller than it first appears.** Invite-to-apply is
  explicitly inside the scope line and is implemented, and `applicant_identities`
  exists precisely so an application "does not depend on a `users` row, a `profiles`
  row or a session". What remains is only the pre-account lead.
- **Stays, travel and visas are out of scope, not a gap.** "Ongoing relationship —
  theirs" puts them outside the line. Per-market representation, which is inside, is
  present.
- **Coogan accounts, vouchers, invoicing and net pay are out of scope by design** and
  correctly so. No live surface contradicts the no-money posture; the two residual
  leaks are wording, in §8.

---

## 8. Conflicts between the governing documents

Four, all needing one owner decision each.

1. **PRODUCT.md versus the product plan on scope.** PRODUCT.md:18 says agencies
   should "run their **entire roster workflow** without the tool getting in the way",
   and :12 lists "scheduling interviews". The product plan:192 puts "interview
   scheduling" and "**roster management**" *outside* the line. The half-amputated
   booking desk is the visible symptom.
2. **The `industry` skill versus PRODUCT.md on commissions.** `industry/SKILL.md`
   describes Pholio as a platform where agencies "track commissions". PRODUCT.md says
   the opposite, twice, and the table was dropped in July. An agent following the
   skill would rebuild a mechanic that was deliberately removed.
3. **"Go-See Requested" — the trade word used backwards, recorded as canon.**
   `applicationStatus.js:105` labels an agency meeting "Go-See Requested" to talent.
   A go-see is a meeting with a **client or casting director**; the agency side of
   the same event correctly says "Meeting requested". The language skill's
   `product-facts.md:168` records the wrong word as the shipped canonical label, so
   the language audit passed it. CLAUDE.md says domain truth defers to `industry`, so
   the industry skill wins and both the label and the skill file should change.
4. **"getting scouted" in the industry glossary** is offered as the correct term for
   an agency submission, while `banned-language.md` §2 forbids it outright. Carried
   over from the language audit; still unresolved.

**Two wording leaks on the money boundary**, both one sentence:

- `LikenessMovement.jsx:199` labels a compensation input *"what you are paid"* on a
  form whose counterparty is Pholio, with nothing saying Pholio does not pay it.
- The event compensation disclosure tells the applicant *"{organizer} states this is
  PAID"* but never says **Pholio does not collect, hold, invoice or enforce this
  payment**. For an unagented applicant answering an anonymous open call — the person
  with no booker to chase it — that is the sentence they most need.

---

## 9. Recommended order

1. **The four P0s.** All are small diffs: the comp-card representation source, the
   availability fallback, the two minor-measurement paths, and the shoe converter.
   None depends on a scope decision.
2. **Stop the remaining false assertions** from the half-removed desk: "Clear for 90
   days" and "No bookouts, options, or holds on record".
3. **Decide the scope line in writing**, reconciling PRODUCT.md with the product
   plan. Then either finish the amputation (§3.1) or restore the write path.
4. **Close the signing loop** (§3.2) — on `represented`, write a real representation
   record with market, board and date, and let the talent confirm it. This is the
   highest credibility-per-effort item after the P0s, and it turns three disconnected
   models into one.
5. **Fix the four read-side distortions**: market-scoped exclusivity, per-market
   seeking, lossless stage-to-status mapping, and a status filter on the board
   candidates query.
6. **Close the shoe and sizing loop end to end**, then make the submission package
   self-describing (`captured_at`, tearsheet credits, `inseam_cm`, `stats_track`,
   `shoe_region`).
7. **Gate likeness consent and the guardian release signature** on the verified
   guardian record; reject a guardian email equal to the talent's own.
8. **Pick one visibility authority** — make `audience-dto.js` consume
   `profile_field_visibility`, or shrink the table to the single flag it actually is.
9. **Resolve the four document conflicts** in §8 and correct both skill files.

---

## 10. Coverage

Four domain lanes plus a lead sweep, against `.claude/skills/industry/` as the
authority. 228 migrations and roughly 110 tables inventoried, then re-checked for
drops. Behaviour traced into the domain routers for every absence claim, per the
`gaps` playbook's rule that a concept may exist under a different name. Every P0 in
§2 was verified by hand at the cited lines. Nothing was modified; this pass is
read-only.
