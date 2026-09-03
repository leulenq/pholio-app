# Lane 4: talent applications / "Market" / off-Pholio exports · audience: talent

## Verdict

This lane contains two products with opposite postures toward the truth, and a booker would notice
within one screen. The **off-Pholio half** — the agency brief, the prepare/handoff scenes, the ZIP
README, the registry preflight — is the most industry-literate work in the codebase: it says
"silence is the common outcome", "Not sent yet", "Pholio is not affiliated with X", "checked
2026-08-19", "the agency's page is the source of truth". A working scout would read that and think
someone here has actually sat in an agency office. The **on-Pholio half** — the submission the
platform itself carries — asserts almost everything the off-Pholio half refuses to. The instant the
talent presses send, before any agency user has opened anything, Pholio tells them the status is
"Under Review", that "the agency is reviewing", that the named agency "reviews new submissions in
batches", that "a reply usually takes anywhere from a few days to a few weeks", and that they will
be "notified the moment {Agency} responds" — while the agency's own screen, reading the same
database row, says only "Submitted". That is the exact service level R1 §8 names as the thing that
makes a product read as built by someone outside the business, and it is stated about a *named*
agency Pholio holds no process data for.

Underneath the wording, three structural problems: the submission object is a **dossier** (board
choice → digitals → measurements → the whole book → a comp card → a note → review) where the
industry's object is three or four unretouched photos plus height, and 5 of the 7 top-tier fashion
boards in the R1 sample ask for nothing else (R1 §4.2); **bust/waist/hips is a hard send gate for
every agency and every age, minors included**; and **"Represented" is a status an agency sets alone,
with no market, no scope and no counter-signature**, which then drives "Represented by X" on the
talent's Overview. The headline gap is therefore not vocabulary — the vocabulary is unusually good —
it is that the on-Pholio submission path narrates agency behaviour it cannot see, and collects a
package agencies did not ask for.

---

## Findings

### L4-01 [P0] [CLAIM] "Under Review" and "the agency is reviewing" are shown before any agency has touched the submission

- **Where:** `client/src/domains/talent/utils/applicationStatus.js:61,66,70,75` (labels/`next`);
  `src/shared/services/notifications.js:303-311,412` (notification body); written by
  `src/domains/talent/routes/applications.js:1941` at submit time. Reachable via
  `/dashboard/talent/applications` (`SubmissionLedger` → `ApplicationDetail`) and the notification
  centre.
- **String/state:** `pending`/`submitted` → label `'Under Review'`; `next:` `"The agency is
  reviewing — we'll notify you the moment this changes."`; notification `title: "Application
  submitted"`, `body: "Your application to ${name} is in review."`; status-change map
  `pending/submitted → { title: "Application under review", body: "${agency} is reviewing your
  submission." }`.
- **Data trace:** the only fact behind these strings is that an `applications` row exists with
  `status = 'pending'`. `notifyTalentApplicationSubmitted` fires inside the submit handler. No
  agency read, open, or view is recorded or required. The agency's own view of the identical row
  (`client/src/domains/agency/components/status/statusConfig.js:53-54`, `STAGE_MAP.pending →
  'Submitted'`) says **"Submitted"** — so the two audiences are told different things about the
  same row, and only the talent is told something untrue.
- **Industry reality:** R1 §8 lists `"Application status: Under review"` verbatim as language that
  "implies a service level no agency offers"; R1 §3 shows 11 of 24 agencies pre-emptively state
  that most applicants hear nothing, and ONE Management explicitly forbids status enquiries. R0 §21:
  a platform may report what was sent and observed events with the observer named; it may not
  assert review, interest, or intent.
- **Why it fails:** a scout who saw a model's screen saying "Elite is reviewing — we'll notify you
  the moment this changes" would read it as the platform speaking for their desk. It also sets the
  talent up for the auto-close 30 days later, which then has to retract an activity that never
  happened.
- **Fix:** label `pending`/`submitted` as **"Sent"** (or "Received", matching the event override
  which already uses "Application Received"), with `next:` "Delivered to {Agency}. Most agencies
  reply only if interested." Reserve a review-asserting label for a state actually written by an
  agency action. Note `reviewing` ("In Review") already exists client-side and is **unreachable** —
  it is absent from `WRITABLE_APPLICATION_STATUSES` (`src/shared/constants/application-status.js:33`)
  — so the honest mid-state has no writer: either wire "Reviewing" to a recorded agency open, or
  delete it.

### L4-02 [P0] [CLAIM] The submission confirmation invents a named agency's response process and promises a reply

- **Where:** `client/src/domains/talent/pages/ApplyPage/ApplyExperience.jsx:4462-4471,4499`
  (`ApplySuccess`), reachable via `/dashboard/talent/applications/apply` on successful submit.
- **String/state:**
  `"{Agency} reviews new submissions in batches, so you won't always hear back right away — a reply
  usually takes anywhere from a few days to a few weeks, and can run longer at a busy {Market} house
  during peak casting. You'll be notified through Pholio the moment {Agency} responds; nothing
  further is needed from you."` and the receipt line `"{date} · Under review"`.
- **Data trace:** `market` is `agency_location`; nothing else in the sentence is read from any
  field. Pholio holds no per-agency response-time data — the configurable
  `agencies.application_review_window_days` (default 30) is an auto-close clock, not a reply
  promise, and is never referenced here.
- **Industry reality:** R1 §3 and R4 §7 — 13 of 14 sampled organisations contact **only** the
  selected; five state "no response = no" explicitly; Omaha forbids follow-up. The strongest promise
  anywhere in the sample is a *meeting*, and only one commercial (non-fashion) agency guarantees a
  reply to everyone. "Batches", "a few days to a few weeks", and "peak casting" are three separate
  fabrications about a named business; "peak casting" is not even an intake concept (casting season
  belongs to shows and clients, R4 §1).
- **Why it fails:** this is the single screen a first-time applicant screenshots. It teaches them to
  expect a reply the industry does not send, and it does so in Pholio's voice about someone else's
  agency. Pholio already has the correct sentence 200 lines away in the off-Pholio path
  (`offPholio/AgencyBriefScene.jsx:24-25`: *"Across the industry, silence is the common outcome —
  don't read it as a mistake."*).
- **Fix:** reuse that sentence. Replace the whole `guidance` block with: "{Agency} contacts people
  it wants to see. Most submissions get no reply, and that is normal — it is not a verdict on you.
  If nothing has moved in {window} days, Pholio will close this so you know where you stand."
  Change the receipt line from `Under review` to `Sent`.

### L4-03 [P0] [DATA/MINOR] Bust/chest + waist + hips is a hard send gate for every agency, every board and every age

- **Where:** `client/src/shared/utils/sendReadiness.js:29-38` (`hasRequiredMeasurements`) and the
  duplicate gate in `ApplyExperience.jsx:1685-1690,1716-1721`; blocks the submit button via
  `isSendReady` (`ApplyExperience.jsx:1761-1768`). Reachable on every apply flow.
- **String/state:** blocker `{ key: 'measurements', label: 'Measurements', task: 'Complete height
  and core measurements' }`; server-side `DEFAULT_REPRESENTATION_INTAKE_SPEC` likewise marks
  `core_measurements` REQUIRED at apply stage (`client/src/shared/constants/openCallIntake.js:222`).
- **Industry reality:** R1 §4.2 is the sharpest finding in the whole research set — **Storm,
  Premier, Models 1, The Society and IMG collect height only at first submission**; measurements are
  taken in person later. R1 §6.1: "A product must not treat measurements as universally mandatory."
  R3 §7 item 4 and BFMA: measuring under-18s beyond height is inappropriate, and body measurement of
  minors "must be a structural omission, not a blank field."
- **Why it fails:** three ways. (a) Pholio refuses to let a talent submit to Storm until they supply
  three measurements Storm does not ask for and would re-take anyway. (b) The gate demands **hips**
  from a male profile, while `buildStats` (`ApplyExperience.jsx:551-560`) correctly renders men as
  Chest·Waist·**Inseam** and never shows hips — so a man must fill a field that is then never
  displayed. (c) A 15-year-old with guardian consent cannot send anything to any agency until
  bust/waist/hips are on file. Minor measurement capture is guardian-gated in the profile
  (`ProfilePage/index.jsx:576`) but still **required** to submit.
- **Fix:** make the send gate **height + contact + the digitals slots**, which is the universal
  intersection of the R1 sample. Promote measurements from a blocker to a per-route requirement
  driven by the spec registry (the machinery already exists — `RegistryPreflight` computes exactly
  this per agency). For under-18 profiles, drop B/W/H from the gate entirely and send height only,
  regardless of guardian consent. Use the men's track (chest/waist/inseam) in the gate, not the
  women's.

### L4-04 [P1] [TERM/STATE] "Go-See Requested" for an agency's own meeting — the two systems are inverted

- **Where:** `client/src/domains/talent/utils/applicationStatus.js:105-113`, reachable on any
  application detail; contradicted by `src/shared/services/notifications.js:333-336`.
- **String/state:** label `'Go-See Requested'`, short `'Go-See'`, `next:` "The agency wants to meet
  — watch for go-see details…", `detail:` "The agency invited you to a meeting (a go-see)." The
  notification for the same status says `title: "Meeting requested"`.
- **Industry reality:** R4 §2.2 — a go-see is a **client-facing** general meeting where a *signed*
  model shows their book; the agency↔prospective-talent meeting is called an **interview**,
  **meeting**, "come in", or **appointment** (SMG: "we will invite you for an interview"; Neal Hamil:
  "in-person meeting"; The Agency Arizona: "appointment"). R0 §10 says the same. Calling the
  pre-signing agency meeting a go-see is the one inversion R4 §1 names as "the single biggest
  modelling error a product can make" — System A vocabulary applied to System B.
- **Why it fails:** an unsigned applicant told they have a "Go-See Requested" will turn up at an
  agency expecting to show a book to a client. And Pholio already says "Meeting requested" in the
  notification for the same transition, so the talent gets two words for one event.
- **Fix:** label `'Meeting Requested'` everywhere; `detail:` "The agency invited you in to meet."
  Reserve go-see for a future client-side surface.

### L4-05 [P1] [STATE/CLAIM] "Represented" is written by the agency alone, with no scope and no counter-signature

- **Where:** set via `src/domains/agency/routes/casting-stage-helpers.js:41-42`
  (`mapCastingStageToApplicationStatus('represented')`) — an agency drags a Kanban card. Rendered at
  `client/src/domains/talent/utils/applicationStatus.js:132-140`, announced by
  `src/shared/services/notifications.js:341-344`, and promoted to the talent's identity by
  `client/src/domains/talent/utils/representationStatus.js:53-61`.
- **String/state:** label `'Represented'`; `detail:` "You and the agency have completed the
  representation agreement."; notification "Representation confirmed — {agency} marked your
  representation agreement complete."; Overview reads "Represented by {agency}".
- **Industry reality:** R2 §3.1 step [4] and R2 §3.3 — the contract is the only transition that
  obligates both parties, and for a minor it is signed by the guardian (BFMA). R0 §3 and R2 §1.5:
  representation is a relationship with a **scope** (agency, market, exclusivity, term) and a model
  may be represented in several markets at once with a mother agency. R0 §22: representation is a
  legal fact the platform cannot verify unless both parties attest.
- **Why it fails:** the `detail` string asserts a completed bilateral agreement from a unilateral
  drag. If an agency moves the card prematurely or in error, Pholio tells the model — and its own
  Overview — that they are represented. A model already signed elsewhere in another market has no
  way to express that; the row is a global boolean. `deriveRepresentationStatus` also calls
  `statusConfig(app.status)` **without** `{ purpose }` (`representationStatus.js:47`), so an event
  application sitting in the casting pool reads as `'advancing'` → "In conversation", which is not a
  representation conversation at all.
- **Fix:** rename the agency-set value to **"Representation recorded by {agency}"** until the talent
  confirms; add a talent-side confirm that flips it to "Represented". Store market + exclusivity +
  start date on the representation, and render "Represented by Elite · New York" rather than a bare
  boolean. Pass `{ purpose: app.call_purpose }` in `deriveRepresentationStatus`.

### L4-06 [P1] [CLAIM/CONCEPT] The 21-day nudge tells the talent to chase the agency, and invents a "slot" to free

- **Where:** `client/src/domains/talent/components/ApplicationsView.jsx:629-632,659-663`, reachable
  on any open application older than 21 days.
- **String/state:** `"{n} days without a reply — message {Agency}, or withdraw to free the slot."`
  Preceded by the now-false comment `"No scheduler exists to auto-expire stale applications"` — one
  does (`netlify/functions/cleanup-application-drafts.js:22`).
- **Industry reality:** R1 §3 — chasing is the one thing agencies explicitly forbid: ONE Management,
  *"Please do not email or call us to inquire about the status of your application"*; Bridge,
  *"Please refrain from sending multiple follow-up emails"*; Omaha FW, *"Please do not email … 
  regarding your status."* And there is no slot: a representation submission occupies nothing (R2
  §3.3 — everything before signing obligates nobody). Withdrawing frees only Pholio's own 5/month
  discovery counter.
- **Why it fails:** the product coaches the exact behaviour that gets an applicant deprioritised,
  and manufactures scarcity to justify it.
- **Fix:** `"{n} days, no reply. That is normal — most agencies contact only the people they want to
  see. Pholio will close this on {date}."` Drop the "message them" CTA at this moment (keep the
  thread available, don't prompt it), and drop "free the slot"; if the monthly counter is the real
  reason, say so plainly.

### L4-07 [P1] [CLAIM] Pholio's own 30-day default and a folklore 6-month interval are presented as the agency's policy and as industry fact

- **Where:** `client/src/domains/talent/utils/submissionTracker.js:102-104,132-141`;
  `client/src/domains/talent/components/tracker/TrackerDetail.jsx:135-137`; defaults at
  `src/shared/constants/submission-tracker.js:50,57`; math at `src/shared/lib/submission-lapse.js`.
  Reachable on every off-Pholio tracker row.
- **String/state:** `"Their review window runs to {date}. Nothing is expected of you until then."`;
  `"No reply arrived inside the review window you logged."`; `"Industry convention says treat this
  as a pass. Re-apply window opens {date}."`; `<dt>Review window</dt><dd>30 days</dd>`.
- **Data trace:** the log form (`tracker/LogSubmissionOverlay.jsx:190-244`) collects agency, date,
  channel, link, note — **and nothing else**. `review_window_days` is never set by the talent and
  never read from the agency, so `reviewWindowDays()` always falls back to
  `DEFAULT_TRACKER_WINDOW_DAYS = 30`. `reapplyOpensOn()` adds a hard-coded
  `REAPPLY_CONVENTION_MONTHS = 6`.
- **Industry reality:** R4 §7 is explicit — "I found **no primary agency or organizer page** stating
  a numeric resubmission interval… The commonly repeated 'wait 6 months' figures come only from
  coaching/secondary blogs. Treat as folklore-with-consensus, not as an industry rule. The natural
  re-entry unit is the **season**." Actual published windows vary wildly (Uno 3 business days, ONE
  1–2 weeks, Nemesis 2 weeks, Storm 30 working days, Society 6 months). R0 §24: silence must be
  attributed to the platform's window, never to the agency.
- **Why it fails:** three false attributions for one arbitrary number — "Their" (the agency's),
  "you logged" (the talent's), and "Industry convention" (nobody's). A model who reads "Re-apply
  window opens 14 Mar" will believe an agency is holding a door shut that does not exist.
- **Fix:** own the number. `"No reply in 30 days — Pholio's default window. Treat it as a pass."`
  Where the registry holds the agency's *published* window (Storm's 30 working days, ONE's 1–2
  weeks), use it and say whose it is. Replace the re-apply line with the season framing R4 §7
  supports: `"Worth trying again next season, or whenever your digitals change."` Add the review
  window to the log form as an optional field so "Their review window" can become true.

### L4-08 [P1] [TERM/CONSISTENCY] "Open call" means two different things in one product, producing "Open call invitation"

- **Where:** correct usage at `client/src/domains/talent/pages/OpenCallsPage/index.jsx:122,139`
  (agency walk-in hours). Colliding usage at `ApplyExperience.jsx:2941` (`"Open call invitation ·
  expires {date}"`), `ApplicationsView.jsx:696` (`Source: "Open call — invited"`),
  `SubmissionTerms.jsx:129` ("This is an invited open call submission"),
  `marketDirectory.js:251` (scope filter "Open calls"), and the whole
  `agency_open_call_links` / `agency_open_call_claims` model. All reachable.
- **Industry reality:** R4 §2.2 and R1 §2 — an open call is a *public, scheduled, no-RSVP walk-in
  window* ("open to the public, no RSVP required" — Neal Hamil; "walk-ins Mon–Fri" — Storm). It is
  by definition the thing you do not need an invitation for. R4 §2.3 distinguishes the organizer's
  public **model call** from it again.
- **Why it fails:** "Open call invitation, expires 14 Sep" is self-contradictory to anyone in the
  business, and Pholio ships a page one nav-click away that uses the same phrase correctly for
  walk-in hours. The same link type also carries event castings (`call_kind: event_casting`), which
  is a third meaning.
- **Fix:** the private link is a **direct invitation** or **submission link** — "Invited by {Agency}
  · expires {date}". Keep "Open call" exclusively for the walk-in calendar. Keep "Casting call" /
  "Model call" for `event_casting` links (R4 §2.2–2.3 both attest these).

### L4-09 [P1] [DATA] Exported files are named after the receiving agency, not the model — and the "numbered images" instructions are false

- **Where:** `src/domains/spec-registry/export/export-plan.js:353,398`; instructions at
  `offPholio/PrepareScene.jsx:68` and `offPholio/HandoffScene.jsx:310,322`. Reachable via the
  off-Pholio prepare → handoff flow.
- **String/state:** filename `${organizationId}-${slugify(slot.label)}.jpg` → e.g.
  `muse-model-management-nyc-close-up-hair-up.jpg`; archive `muse-model-management-nyc-digitals.zip`.
  Instructions: *"Numbered in the order they publish"*, *"Attach the numbered images from the
  archive"*, *"Upload the images in the order they are numbered — that order is theirs, not ours."*
- **Industry reality / first principles:** the recipient is an inbox receiving hundreds of
  submissions (R1 §1b). A file named for the recipient carries zero identifying information and
  collides with every other applicant's file of the same name; the convention in any submission
  context is to name the artefact for its subject. R1 §4.2 and §8: the atomic unit is the
  applicant's name + stats + photos.
- **Why it fails:** a booker who saves three attachments gets three files bearing their own agency's
  name and no model's name. Separately, **no ordinal is ever written** — `suffix` is only `-1`/`-2`
  when one slot has multiple images — so three different screens instruct the talent to preserve a
  numbering that does not exist in the filenames.
- **Fix:** name files `lastname-firstname-01-full-length.jpg` with a real ordinal in published slot
  order, and the archive `lastname-firstname-digitals.zip`. Then the instruction copy becomes true.

### L4-10 [P1] [CONCEPT] README.txt itemises the applicant's shortfalls and ships in the same folder the applicant is told to send

- **Where:** `src/domains/spec-registry/export/spec-export-service.js:392-408` (`renderReadme`),
  reachable in every off-Pholio export ZIP.
- **String/state:** `"Still missing from your set, as published by the agency:"` followed by the
  named frames; `"(still above the published size limit — check before uploading)"`; `"Could not be
  read from your library at export time:"`; `"Pholio is not affiliated with {Agency} and does not
  speak for them."`
- **Industry reality / first principles:** every one of those lines is written *to the talent* and
  is correct as talent-facing copy. But the ZIP is the deliverable the flow hands over, and a
  first-time applicant attaching a whole folder to an email is the obvious failure mode — at which
  point the booker's first file is a machine-generated inventory of what the applicant failed to
  provide. R1 §1b/§5.2: agencies read submissions fast and give no feedback; handing them a
  pre-written list of your gaps invites a pass.
- **Why it fails:** the archive mixes a private worksheet with public deliverables and nothing in
  the file says "do not send this".
- **Fix:** put the deliverables in a `send/` subfolder (images + STATS.txt + EMAIL.txt) and leave
  README.txt at the root with a first line reading **"This file is for you. Do not send it — attach
  only the images in send/."** Or move the shortfall/limit sections into the on-screen handoff and
  keep the README to provenance only.

### L4-11 [P1] [CONCEPT] Every representation submission ships the talent's whole book and a comp card

- **Where:** `ApplyExperience.jsx:117-160` (the seven-page `PAGES` array: board, digitals, stats,
  book, compcard, message, review); package composed at `ApplyExperience.jsx:1612-1615` (all set
  images minus explicit exclusions); comp card always included
  (`ApplyExperience.jsx:3820-3826`: *"This is the comp card {name} receives"*). Reachable on every
  apply flow.
- **Industry reality:** R1 §2 flinch table — *"Upload your **portfolio** at intake"*: "A
  portfolio/book is what a *signed* model builds after signing. Premier lists needing one as a
  **scam marker**." Heroes: *"all you need to apply are natural pictures from a phone."*
  Portfolio/book asked by **0 of 24** sampled agencies. Same table on the comp card: "A comp card is
  a *post-signing* marketing artifact… Asking an applicant to attach one inverts the sequence" —
  the only two agencies that mention one describe it as something they *provide* after signing.
  R3 §1: the comp card *is* the representation relationship; an unsigned model's card carries no
  agency block, which is precisely what makes it not a comp card.
- **Why it fails:** the two artefacts an agency never wants at intake are two of the seven pages and
  are both sent by default (the book requires the talent to hold frames *back*, and the comp card
  cannot be excluded at all). To a booker this reads as a submission from someone who has been sold
  a package by a portfolio mill. It also contradicts Pholio's own excellent digitals copy on page 02
  ("the truth check agencies assess first").
- **Fix:** make digitals + stats the submission. Demote book and comp card to **opt-in** ("Some
  agencies and event organizers ask for a book or a comp card — The Bureau does; most fashion boards
  do not"), default **off** for representation calls, and drive them from the spec registry where a
  route actually publishes the requirement (R4 §4 confirms The Bureau asks for a comp card, so the
  event lane keeps them legitimately).

### L4-12 [P1] [TERM] A model agency is called a "house"

- **Where:** `market/MarketBoard.jsx:8,87,112` (*"Search a house, a city, a board"*, *"part of a
  house's name"*), `market/HouseBand.jsx`, `market/HouseBrief.jsx:7`,
  `ApplyExperience.jsx:2907` (*"Choose the house."*, directly above the label *"Open agencies"*),
  `ApplyExperience.jsx:2169` (*"Every house is already in your ledger."*),
  `HandoffScene.jsx:460` (*"the next house"*), `ApplySuccess` (*"a busy {market} house"*). All
  reachable.
- **Industry reality:** across R1 (24 intake surfaces), R2 (agency ops) and R4 (casting), the words
  for the organisation are **agency**, **board**, **management**, **mother agency**, **organizer**.
  "House" in fashion means a *design house* — Chanel, Dior — i.e. the **client** an agency sends
  models to. R2 §1.1: the unit is the board; R2 §1.7: the artefact sent to a house is the package.
- **Why it fails:** it names the agency with the client's word, in a product whose whole job is
  keeping those two roles straight. And it is inconsistent even locally: the heading says "Choose
  the house" and the list label immediately below says "Open agencies".
- **Fix:** "agency" everywhere in the market surfaces; "organizer" for event calls. "House" is
  usable only if it ever means a designer/brand.

### L4-13 [P1] [CLAIM] The book review asserts what a named agency scouts, from a regex over its board names

- **Where:** `ApplyExperience.jsx:391-401` (`buildBookReview` notes), rendered on the Book page
  (`ApplyExperience.jsx:3577-3585`). Reachable on every apply flow.
- **String/state:** `"This house scouts commercial — your book has no commercial or lifestyle frames
  yet."`; `"This house leans editorial — add an editorial or fashion frame."`; `"Only {n} book
  frames — a fuller book (5+) gives agencies more to read."`
- **Data trace:** `boardText` is `selectedBoards.join(' ').toLowerCase()` matched against
  `/commercial|lifestyle|e-?comm/` and `/editorial|fashion|runway/`. The *talent's own board
  selection* — which the same flow describes as "this just tells them where you see yourself"
  (`ApplyExperience.jsx:3140`) — is being turned into an assertion about the agency's scouting
  policy.
- **Industry reality:** R2 §1.1–1.2 — boards are the agency's internal routing, and what an agency
  is "looking for" changes by season and by booker; R4 §1 item 3: "demand for your look shifts
  season to season." R3 §1/§7 item 10: the book is 6–20 images and is **edited down**, not
  accumulated — "an interface that rewards accumulation teaches the wrong behaviour."
- **Why it fails:** it puts words in a named agency's mouth from a string match, and it coaches the
  talent to *add* frames to a submission for which no book was requested at all (see L4-11).
- **Fix:** drop both agency-inference notes, or attribute them ("You selected the Commercial board —
  your book has no commercial frames"). Reframe the count note as an edit prompt, not a fill prompt:
  "A book is edited down, not filled up — send your strongest, not your most."

### L4-14 [P1] [STATE] The talent's own submission receipt renders every real event as "Updated"

- **Where:** `client/src/domains/talent/components/market/SubmissionRecord.jsx:37-47`
  (`TIMELINE_WORDS`), fed by `src/domains/talent/routes/applications.js:3236-3252`. Reachable via
  the ledger → "Since then".
- **String/state:** map keys `submitted / status_change / accepted / declined / booked / note_added`.
- **Data trace:** `application_activities.activity_type` only ever holds **`status_change`**
  (agency writes) and **`auto_closed`** (`src/shared/lib/application-auto-close.js:181`). So four of
  six keys are dead, and the one event that matters most — the auto-close, whose description reads
  *"Closed automatically — the review window lapsed with no decision."* — is bolded as **"Updated"**.
  `booked: 'Booked'` also contradicts the server's own rule that "a confirmed client booking is a
  separate operating lifecycle and must never be stored on an application"
  (`src/shared/constants/application-status.js:7-8`).
- **Industry reality:** R0 §21 — the honest things a platform can report are events with the actor
  named. Naming the actual event ("Closed — no response from {Agency}") is the whole value of the
  auto-close feature; "Updated" throws it away.
- **Fix:** add `auto_closed: 'Closed — no response'`; keep `status_change`; delete `accepted`,
  `declined`, `booked`, `submitted`, `note_added` until something writes them. If the agency's
  package download is ever recorded against the application, surface it as "Opened by {Agency}" —
  that is the one interest signal R0 §21 permits.

### L4-15 [P1] [DATA] EMAIL.txt omits the fields the researched agency actually asks for, and cannot follow its published order

- **Where:** `src/domains/spec-registry/export/email-draft.js:225-243`;
  `src/domains/spec-registry/export/stats-block.js:97-123`. Reachable in the off-Pholio export for
  any `official_email` route (Muse NYC is the live one).
- **String/state:** the whole draft is `To:` / `Subject: Model submission — {name}, {height},
  {city}` / `Hello,` / `Attached are 3 digitals prepared to the requirements {Agency} publishes.` /
  stats block / name.
- **Industry reality / cross-check inside Pholio:** the product's own researched brief for this
  exact agency (`client/src/domains/talent/content/agencyBriefs.js:87-89,109`) says Muse asks for
  *"Name, age, and location, plus four measurements"* and carries the callout *"List your details
  in Muse's own order: name, age, location, then measurements."* The generated draft contains **no
  age and no phone number**, and the stats block emits a fixed canonical order (height → B/W/H →
  shoe → hair → eyes → city → Instagram) that cannot honour the agency's order. R1 §4.2: DOB/age and
  phone are asked by ≥10 of 14 forms; LOOK Model Agency: *"please be sure that your phone number and
  email address are correct."*
- **Why it fails:** Pholio researched the requirement, wrote it into the brief, told the talent to
  follow it, and then generated a draft that breaks it. An email missing age is incomplete against
  the one agency this feature exists for.
- **Fix:** add age (or DOB where the route publishes it) and phone to the stats block, and let the
  route's published field order drive the block order when the registry has one. Also: the phrase
  *"Attached are 3 digitals"* uses post-signing vocabulary — R1 §6.2 found "digitals" in **zero** of
  24 public instruction pages and twice inside agency systems; to an applicant agencies say
  "photos". Use "photos".

### L4-16 [P1] [CLAIM] "Agencies expect a fresh set within 90 days" states a coaching convention as an agency requirement

- **Where:** `client/src/shared/utils/packageIntelligence.js:126`; constant
  `DIGITALS_MAX_AGE_DAYS = 90` at `client/src/shared/constants/packageIntelligence.js:1`; the same
  90 days gates `digitals_recency` as a **send blocker** (`sendReadiness.js:155-161`,
  `ApplyExperience.jsx:1708-1713`). Reachable on the submission terms rail and the preflight banner.
- **String/state:** `"Your digitals are {n} days old. Agencies expect a fresh set within 90 days."`;
  blocker `"Refresh your digitals - your set is out of date for agency review."`
- **Industry reality:** R1 §4.1 ("Recency — weakly specified, a real gap. Only Bridge states it…
  the 'within 3 months' rule circulating in coaching blogs is **secondary**, not agency-published")
  and R3 §4.9 ("No agency page in the primary sample states a numeric re-measure interval. The
  3-month figure is a coaching convention. **Label it as such in any product copy.**").
- **Why it fails:** it asserts a rule no agency published, and then *blocks* a submission on it — a
  model with a 95-day-old set is stopped from applying to an agency that never stated a limit.
- **Fix:** `"Your photos are {n} days old. Pholio flags a set over 90 days; the convention is to
  reshoot every few months, and agencies check that you look like your pictures."` Demote from
  blocker to advisory unless the route's registry entry publishes a recency requirement.

### L4-17 [P1] [TERM/CONSISTENCY] "Market" is both the page name and a field meaning the agency's city

- **Where:** nav `client/src/shared/constants/talentNav.js:24` (`label: 'Market'`, `pageKicker:
  'Market'`); page title `ApplicationsView.jsx:446` (`The Market.`); the *field* at
  `ApplicationsView.jsx:678` (`<dt>Market</dt><dd>{agency_location}</dd>`) and
  `ApplyExperience.jsx:2985` (same). Also `reachName()` returns "3 markets" for territories
  (`marketFormat.js:126`). All reachable.
- **Industry reality:** R2 §1.5 and R4 §4 — "market" in this business is a *territory*: the NY
  market, the Paris market, "placed in other markets". It is never the name of a place where you
  browse agencies.
- **Why it fails:** one screen uses the word in both senses six inches apart, so "Market: New York"
  sits inside a page called "The Market". A booker reads the nav item and expects a territory view.
- **Fix:** name the page **"Submissions"** or **"Agencies"** (the ledger + directory is what it is)
  and keep "Market" strictly for territory, which is how the rest of the code already uses it.

### L4-18 [P1] [CLAIM] "Review focus" presents the agency's first open board as the lens this submission is judged by

- **Where:** `ApplicationsView.jsx:683-687` and `ApplyExperience.jsx:2989-2991`
  (`primaryBoard = openBoards[0] || 'Representation review'`), fed by `firstBoard()`
  (`ApplicationsView.jsx:98-113`) which returns `list[0]`. Reachable on every application detail and
  every apply flow.
- **String/state:** `<dt>Review focus</dt><dd>{first open board}</dd>`.
- **Industry reality:** R2 §1.1 — an agency runs several boards at once and routes a submission to
  whichever fits; nothing about array position encodes what a reviewer focuses on. Pholio's own board
  page says the opposite in the same flow: *"{name} makes the final placement"*
  (`ApplyExperience.jsx:3140`).
- **Why it fails:** it turns an arbitrary array index into an assertion about how the agency will
  read the submission.
- **Fix:** relabel to **"Boards open"** and list them, or drop the row. It is the same data the
  chooser already renders honestly as "Boards now open" (`ApplyExperience.jsx:3072`).

### L4-19 [P2] [TERM] Photographs are called "frames" throughout the submission

- **Where:** `ApplyExperience.jsx:3506,4222,4483` ("{n} frames in this submission", "{n} frames",
  "{n} frames, ready to send again"), `briefModel.js:129-137` ("Six frames", "None of them shot
  yet"), `PrepareScene.jsx:52-54` (section title "Frames"), `HouseBrief.jsx:29-47`,
  `SubmissionRecord.jsx:89`, `HandoffScene.jsx:459`. All reachable.
- **Industry reality:** R1 §4.1/§8 and R3 §4.8 — agencies say **photos**, **images**, **pictures**,
  and name the *framings* (close-up, profile, waist-up, full-length). "Frame" as a countable noun for
  a submitted photo appears nowhere in the R1/R3 primary sample.
- **Why it fails:** it is a coined unit. "Six frames make their set" reads like film vocabulary
  applied to a job it does not do, and the same product correctly says "3 photos · measurements" in
  its own researched briefs (`agencyBriefs.js:72`).
- **Fix:** "photos" for the countable noun; keep "framing"/the frame names for the slots.

### L4-20 [P2] [DATA] STATS.txt ships an unlabelled shoe size, and Pholio's dress-size conversion names the wrong ladder

- **Where:** `src/shared/lib/stats-formatter.js:362` (`push("shoe", "Shoe", shoe_size)` — the raw
  string, no unit); `ApplyExperience.jsx:526-532` (`formatDress`: `EU = US + 32`). Reachable in every
  export ZIP and on the apply Stats page.
- **Industry reality:** R3 §4.5/§7 item 6 — "There is no universal shoe number; a single unlabelled
  shoe field is a localisation bug the moment the profile crosses a border." Models 1 shows the
  correct shape: `Shoe 6 UK / 39 EU`. On dress size, R3 §4.5 records US 2 ≈ UK 6 ≈ **EU 34** ≈ IT 38
  ≈ FR 36 and explicitly flags multi-locale dress display as unevidenced; `US + 32` yields EU 36 for
  a US 4, which is the FR/IT ladder, not EU/DE.
- **Why it fails:** the ZIP is built specifically to cross borders (Muse NY, Elite, Ford's US/FR/ES
  route). An unlabelled `Shoe 8` is meaningless to a European booker, and a mislabelled "EU 36" is
  worse than no conversion.
- **Fix:** store and print the shoe locale (`Shoe 8 US / 39 EU`), matching what `formatShoe` already
  does on screen (`ApplyExperience.jsx:512-524`) but not in the export. Either correct the dress
  offset to the EU ladder or drop the conversion and print the size in its stored locale, per R3's
  own recommendation.

### L4-21 [P2] [CONSISTENCY] Stats are dual-unit on one page of the submission and cm-only on the next

- **Where:** dual on the Stats page (`ApplyExperience.jsx:3402-3421`: `{cm} cm / {ft}′{in}″`,
  `{cm}cm  {in} in`); cm-only on the Review page the talent is told is "the package exactly as the
  agency receives it" (`ApplyExperience.jsx:4141-4152`: `<dd>{stats.height.cm} cm</dd>`,
  `<dd>{v.cm} cm</dd>`).
- **Industry reality:** R3 §4.4/§4.5 — international boards render dual (`Height 177.5 CM/5' 10''`);
  a single-unit rendering is acceptable only where the board declares its market, which a global
  product cannot do. R3 §7 item 6.
- **Fix:** use the dual rendering on the review page too. `buildCanonicalStats` already produces
  `.dual` for the export; the client review page should use the same shape.

### L4-22 [P2] [LEAK] "Discovery submissions", "monthly discovery limit", and an unexplained "3/5"

- **Where:** header `ApplicationsView.jsx:373-375,486-489` (`<dt>This Month</dt><dd>3/5</dd>`);
  error copy `src/domains/talent/routes/applications.js:1160,1876` (*"You have used this month's
  discovery submissions. Submitting through an agency's own open call link is always unlimited."*);
  `SubmissionTerms.jsx:129-131` (*"does not count toward your monthly discovery limit"*). Reachable.
- **Industry reality / first principles:** the *intent* is right and well-evidenced — R1 §8 names
  "Apply to 20 agencies with one click" as exactly what agencies defend against, so a cap is a
  credible anti-spam design. But "discovery submission" is a Pholio-internal category name; nothing
  in R1/R2/R4 uses "discovery" for an application, and a model reading "3/5" in a stat row beside
  "Total / Active / Represented" has no way to know it is a cap rather than a score.
- **Fix:** label the tile **"Sent this month 3 of 5"** and say why once: "Five a month. Mass
  submissions get ignored." Drop "discovery" from user-facing strings.

### L4-23 [P2] [STATE] "Development Offer" is short-labelled "New Face", conflating two different boards

- **Where:** `client/src/domains/talent/utils/applicationStatus.js:114-122`; the agency ladder does
  the same at `client/src/domains/agency/components/status/statusConfig.js:59` (`development: {…
  label: 'New Face' }`). Reachable on any application detail.
- **String/state:** label `'Development Offer'`, short `'New Face'`, `detail:` "The agency has taken
  you on for development before full representation."
- **Industry reality:** R1 §2 and R2 §3.1 step [5] — **New Faces** and **Development** are two
  *distinct boards* an agency places a model on *after signing* (DNA: "main board / development";
  Storm nav: "Women / Curve / Image / Mainboard / New Faces"; ONE: "Women: Image / One.1 /
  Development / Curve / Studio"). Neither is a pre-signing offer type, and they are not synonyms.
- **Why it fails:** one status carries two board names as if interchangeable, and asserts the talent
  has been "taken on" before any contract exists (R2 §3.3: nothing before the signed contract
  obligates anyone).
- **Fix:** one label — "Development offer" — with `detail:` "The agency has offered to develop you.
  Nothing is agreed until you both sign." Drop the "New Face" short form, or make it a separate
  status meaning *placed on the New Faces board after signing*.

### L4-24 [P2] [TERM] "Offer / Moving Forward" and "so agencies can cast you"

- **Where:** `applicationStatus.js:124` (`label: 'Offer / Moving Forward'`);
  `ApplyExperience.jsx:3366` (*"Add your stats in your profile so agencies can cast you."*). Both
  reachable.
- **Industry reality:** R0 §20 and R4 §2.4 — "offer" is real in this business (a representation
  offer, a booking offer), but a slash-compound label is software hedging, not a state. And agencies
  do not **cast** — casting is a client/CD activity for a specific job (R4 §2.2); an agency reviewing
  a submission is screening for representation.
- **Fix:** `'Offer of representation'`. And: "Add your stats so agencies can see whether you fit
  their boards."

### L4-25 [P2] [LEAK] "Snapshot", "archive", "manifest", "type read", "bookers" at intake

- **Where:** `SubmissionThreshold.jsx:21` and `SubmissionTerms.jsx:120` (*"redacts the platform
  snapshot"*); `HandoffScene.jsx:394,457` and `PrepareScene.jsx:124` (*"Archive prepared"*,
  *"Archive manifest"*, *"This archive, on your own machine"*);
  `packageIntelligence.js:203` (*"{n} frames still need a type read."*);
  `frameTaxonomy.js:213` (*"so bookers can verify proportions"*). All reachable.
- **Industry reality:** R0 §F lists "snapshot" among backend concepts that must not surface.
  "Archive"/"manifest" are backup-software words for what a model would call a folder of photos.
  "Type read" is Pholio's own AI vocabulary. And per R1 §3 the reader of a submission is a
  **scouting/applications team**, not a booker — bookers handle client bookings for signed talent
  (R2 §1.6).
- **Fix:** "the copy Pholio holds" instead of "platform snapshot"; "your folder"/"your set" instead
  of archive/manifest; "still need a photo type" instead of "type read"; "so scouts can see your
  proportions" instead of "bookers".

### L4-26 [P2] [TERM] "Researched" as a category of agency, shown to the talent as a filter

- **Where:** `client/src/domains/talent/lib/marketDirectory.js:247-252` (`SCOPE_FILTERS`: All / On
  Pholio / Researched / Open calls), rendered by `MarketBoard.jsx:92-105`. Reachable.
- **Industry reality / first principles:** "researched" describes Pholio's relationship to the
  agency, not anything about the agency. A model filtering a directory is asking "which of these can
  I send through here, and which do I send myself?"
- **Fix:** "Send through Pholio" / "Send yourself" — the distinction the flow already makes
  correctly in the two CTAs ("Compose a submission" vs "Prepare a package").

---

## Coined / internal terms encountered

| Term | Where | Verdict | Translation |
|---|---|---|---|
| **house** (= model agency) | MarketBoard, HouseBand, HouseBrief, ApplyExperience 2907/2169, HandoffScene 460 | **translate** | agency; organizer for events. "House" means a design house/client. |
| **the Market** (page/nav) | talentNav.js:24, ApplicationsView.jsx:446 | **translate** | Submissions / Agencies. Keep "market" for territory only. |
| **dossier** | class names + code comments only (`apply-experience--dossier`, `AgencyDossier`) | **keep (hidden)** | never rendered as text — fine as an internal name |
| **spec registry**, **preflight** | code, routes, class names only — verified absent from visible strings | **keep (hidden)** | good discipline; do not let them surface |
| **frames** (= photos) | ApplyExperience, briefModel, PrepareScene, HouseBrief, SubmissionRecord | **translate** | photos / images |
| **package** | throughout apply + terms + notifications | **keep** | attested: R2 §1.7, R4 §2.1 — a package is what an agency sends a client. Slightly off pointed at the agency, but it reads naturally and nothing better exists. |
| **archive**, **manifest** | HandoffScene, PrepareScene | **translate** | your folder / what's in it |
| **conforming export** / *"conforms to their published requirements"* | export README, PrepareScene | **keep** | honest and specific; it says what it did |
| **handoff** | code + `handoff.css` only; user text says "It's yours" / "Not sent yet" | **keep (hidden)** | the visible copy is excellent |
| **intelligence** (`packageIntelligence`, PITS) | module + comments only | **keep (hidden)** | never surfaces |
| **discovery submission / monthly discovery limit** | applications.js:1160,1876; SubmissionTerms:131; "3/5" tile | **translate** | "5 submissions a month" |
| **researched** (agency category) | SCOPE_FILTERS | **translate** | "Send yourself" |
| **ledger** | SubmissionLedger, "In your ledger", "already in your ledger" | **keep** | not industry, but neutral, consistent, and reads as a record — no false claim |
| **register** (= book genre: editorial/commercial) | Book page, `labelForStyle` | **keep** | printing/editorial usage, plausible in a book context |
| **snapshot** (= stored package) | SubmissionThreshold:21, SubmissionTerms:120 | **hide** | "the copy Pholio holds" |
| **type read** | packageIntelligence.js:203 | **hide** | "photo type" |
| **open call** (= private invite link) | ApplyExperience:2941, ApplicationsView:696, SubmissionTerms:129 | **translate** | "invitation" / "submission link" — see L4-08 |
| **Go-See** (= agency meeting) | applicationStatus.js:105-113 | **translate** | meeting — see L4-04 |
| **Review focus** | ApplicationsView:683, ApplyExperience:2989 | **translate** | "Boards open" — see L4-18 |
| **New Face** (as short form of Development Offer) | applicationStatus.js:117 | **translate** | see L4-23 |

## Consistency variants

| Concept | Variants seen | Locations |
|---|---|---|
| the same `pending` row | **"Under Review"** (talent) vs **"Submitted"** (agency) | `talent/utils/applicationStatus.js:61` vs `agency/components/status/statusConfig.js:53` |
| `meeting_requested` | **"Go-See Requested"** vs **"Meeting requested"** | `applicationStatus.js:106` vs `src/shared/services/notifications.js:334` |
| the agency organisation | **house** / **agency** / **organizer** — "Choose the house." directly above "Open agencies" | `ApplyExperience.jsx:2907` vs `:2913`; `MarketBoard.jsx:87` vs `ApplicationsView.jsx:463` |
| the talent's board selection | **"Boards"** / **"Boards now open"** / **"Division"** / **"Review focus"** | `SubmissionRecord.jsx:107`; `ApplyExperience.jsx:3072`; `ApplyExperience.jsx:4165`; `ApplicationsView.jsx:683` |
| who owns the 30-day window | **"Their review window"** / **"the review window you logged"** / **"its review window"** / Pholio's `DEFAULT_TRACKER_WINDOW_DAYS = 30` | `submissionTracker.js:140` / `:104` / `applicationStatus.js:179` / `src/shared/constants/submission-tracker.js:50` |
| a submitted photo | **frame** / **image** / **digital** / **photo** | `ApplyExperience.jsx:3506` / `HandoffScene.jsx:406` / `email-draft.js:209` / `agencyBriefs.js:72` |
| stats units | **dual (cm + in)** on the Stats page vs **cm only** on the Review page vs **dual** in STATS.txt | `ApplyExperience.jsx:3402` / `:4141` / `stats-formatter.js:342` |
| "open call" | agency **walk-in hours** vs private **invite link** vs **event casting link** | `OpenCallsPage/index.jsx:122` / `ApplyExperience.jsx:2941` / `event-casting.js:14` |
| the message to the agency | **"The message"** (page title) / **"Note"** (review section) / **"Your note"** (detail) | `ApplyExperience.jsx:151` / `:4245` / `ApplicationsView.jsx:713` |

## Working well (preserve)

1. **The off-Pholio honesty stack.** `HandoffScene`'s **"Not sent yet"** receipt (with the comment
   explaining it deliberately does *not* borrow the on-Pholio "Under review"), the `Package` icon
   instead of a checkmark, and `AgencyBriefScene`'s *"Across the industry, silence is the common
   outcome — don't read it as a mistake"* + *"Pholio is not affiliated with {Agency}"* + *"Checked
   {date}"*. This is exactly R1 §3 / R4 §7 / R0 §21 behaviour and should be the model for the rest.
2. **`buildCanonicalStats` order** (`src/shared/lib/stats-formatter.js:342-364`): Height first,
   gendered core (Bust vs Chest), B–W–H contiguous, Inseam/Suit for menswear, Shoe → Hair → Eyes
   last, dual units, no weight, no age. That is R3 §4.4's synthesis implemented exactly.
3. **`closed_no_response` as a distinct status with `user_id: null`.** The auto-close writes silence
   as silence, never as `passed`, and refuses to attribute it to a booker
   (`application-auto-close.js:16-20,173-174`). Copy names the silence and says how to *treat* it.
   Exactly R0 §24 — the only thing wrong is whose window it says it is (L4-07).
4. **The consent and minor architecture.** Per-agency guardian authorisation that explicitly does
   not carry to another agency; minors' contact, socials, portfolio URL, note and raw DOB withheld;
   body digitals withheld until agency-specific consent; retouched digitals blocked; two disclosure
   versions with a recorded fingerprint so the sentence read is the sentence stored
   (`SubmissionTerms.jsx`, `submissionConsentBinding.js`). This is ahead of R1 §4.3/§4.4 and R5.
5. **"Pholio is not a talent agency… Submitting does not create representation, and we do not
   guarantee a reply, a meeting, signing, or income."** (`SubmissionThreshold.jsx:16-17`) — the
   single best sentence in the lane, and precisely R1 §5.2.
6. **Digitals-vs-book separation enforced structurally**, not by advice: `isDigitalSlot` refuses to
   let a styled book frame fill a digitals slot, and the advisories reproduce the real rules
   (unretouched, plain background, natural light, clean headshot + full length). R3 §7 item 1 and
   R3 §4.8.
7. **Event casting modelled as its own system**: `call_kind`, mandatory `compensation_type` with no
   "unspecified", pick lists with `PICK_MARKS` that are explicitly "never a status", designers'
   read-only link, a 90-day event clock, `confirmed`/`declined_by_talent` writable only by the
   talent. That is R4 §2.3, §3.2 and §5 modelled correctly, including the consent-to-share-with-
   designers pattern R4 §6 names as the norm-setting example.
8. **`readStanding` / eligibility phrasing**: *"your profile is inside what they publish"* /
   *"— Pholio can't check this from your profile"* — a gap in Pholio's knowledge is never rendered
   as a verdict on the talent (R0 §21).
9. **`OpenCallsPage`** uses "open call" correctly (agency walk-in windows), publishes a
   verified-on date, and its empty state says *"this is a statement about what has been checked, not
   about every agency everywhere."*
10. **Withdrawal copy**: *"revoke the agency's platform access, redact the submitted package, and
    delete its message thread. Copies already downloaded by the agency cannot be recalled."* — names
    the limit of the platform's power.
11. **Positive-only registry verification** ("NYSDOL-registered · Cert … · expires July 2028", and
    *no* line at all when unknown — never "not verified"), which matches R2 §5.2 without turning a
    young register's gaps into an accusation.

## Dead or unreachable code carrying issues

- `client/src/domains/talent/components/market/MarketCoverage.jsx` (512 lines) + `useMarketCoverage.js`
  — imported by nothing. Carries its own copy ("Their forms", "None of them shot yet") that would
  need auditing if revived.
- Status `reviewing` ("In Review") — present in
  `client/src/domains/talent/utils/applicationStatus.js:78-86`, in `WITHDRAWABLE_STATUSES`, and in
  the agency `STAGE_MAP`, but absent from `WRITABLE_APPLICATION_STATUSES`
  (`src/shared/constants/application-status.js:33`) — no writer exists. This is why L4-01's honest
  label has nowhere to live.
- `TIMELINE_WORDS` keys `submitted`, `accepted`, `declined`, `booked`, `note_added`
  (`SubmissionRecord.jsx:38-43`) — `application_activities` only ever stores `status_change` and
  `auto_closed`. `booked` additionally contradicts the server's stated rule.
- `DEFAULT_REPRESENTATION_INTAKE_SPEC` (`client/src/shared/constants/openCallIntake.js:214-228`) is
  documented as "documentary, not yet wired into rendering" — but its `core_measurements: required`
  matches the live send gate, so it is a spec that will lock in L4-03 if it is ever wired.
- `/dashboard/talent/applications/requirements` is a live redirect to the market
  (`App.jsx:139-142`); the standalone requirements page is gone and the requirements now read inside
  the apply workspace. No orphan strings found.
- Stale comment `"No scheduler exists to auto-expire stale applications"`
  (`ApplicationsView.jsx:629`) — `netlify/functions/cleanup-application-drafts.js` runs
  `runApplicationAutoClose`. The comment is the stated justification for the 21-day nudge in L4-06.

## Coverage

**Read in full:** `client/src/domains/talent/utils/applicationStatus.js`, `submissionTracker.js`,
`representationStatus.js`; `client/src/shared/constants/applicationStatus.js`,
`submissionTracker.js`, `openCallIntake.js`, `packageIntelligence.js`, `eventCasting.js`,
`talentNav.js`; `src/shared/constants/application-status.js`, `submission-tracker.js`,
`event-casting.js`; `client/src/domains/talent/components/ApplicationsView.jsx`;
`market/MarketBoard.jsx`, `HouseBand.jsx`, `HouseBrief.jsx`, `SubmissionRecord.jsx` (partial),
`SubmissionLedger.jsx` (strings); `tracker/LogSubmissionOverlay.jsx`, `TrackerDetail.jsx` (strings);
`client/src/domains/talent/lib/briefModel.js`, `marketFormat.js` (partial), `specRegistry.js`
(strings + label resolver + eligibility);
`client/src/domains/talent/pages/ApplyPage/ApplyExperience.jsx` (structure + every rendering
component: PAGES, buildStats, DIGITAL_SLOTS, buildBookReview, checks/sendBlockers, AgencyChooser,
AgencyEditorialRail, AgencyDossier, BoardPage, StatsPage, BookPage, CompCardPage, MessagePage,
ReviewSendPage, ApplySuccess), `SubmissionTerms.jsx`, `SubmissionThreshold.jsx`,
`offPholio/AgencyBriefScene.jsx`, `PrepareScene.jsx`, `HandoffScene.jsx`, `event/eventIntake.js`,
`event/EventIntakeScene.jsx` (strings); `client/src/domains/talent/pages/OpenCallsPage/index.jsx`;
`client/src/domains/talent/components/RegistryPreflight.jsx`;
`client/src/shared/utils/sendReadiness.js`, `packageIntelligence.js` (messages),
`frameTaxonomy.js` (advisory copy); `src/domains/spec-registry/export/*` (all five),
`src/domains/spec-registry/preflight-service.js` (strings);
`src/shared/lib/application-auto-close.js`, `submission-lapse.js`, `stats-formatter.js`
(`buildCanonicalStats`); `src/shared/services/notifications.js` (status copy);
`src/domains/talent/routes/applications.js` (submit path, quota, record/activity endpoints);
`src/domains/agency/routes/casting-stage-helpers.js`;
`client/src/domains/agency/components/status/statusConfig.js` (cross-check only);
`client/src/domains/talent/content/agencyBriefs.js` (head + Muse entry);
`client/src/App.jsx` (route table). Research: R0–R4 in full or in the sections cited; R5 not read
(minor/legal is another lane's ground — minor findings here rest on R3 §7 and R1 §4.3).

**Skipped, and why:** `.claude/skills/**`, `docs/audits/**`, `tasks/**`, `DESIGN.md` — excluded by
the brief's hard rule 1 (`PRODUCT.md` read once for the declared scope boundary only, per the
exception). `client/src/domains/agency/**` beyond the two cross-check files — Lane 4 is the talent
side; the agency inbox/casting surfaces belong to another lane, and I read only enough to trace who
writes each status. `client/src/domains/opencall/**` (public claim/materials pages) and
`src/domains/opencall/routes/**` — surface-map Group 12, not this lane. `MediaPage`/comp-card
generation internals — Group 6/29. `IntelPage` — Group 8. Email templates — Group 27.
`MarketCoverage.jsx` skimmed only after confirming it is unimported.
