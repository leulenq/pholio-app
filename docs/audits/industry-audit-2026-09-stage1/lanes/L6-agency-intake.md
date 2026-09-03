# Lane 6: the agency intake side — setup, Overview, Submissions inbox, TalentFullView, exports, internal access review · audience: agency

Surface-map groups 14, 15, 16, 17, 25, 26. All paths relative to `/home/user/pholio-app`.

## Verdict

The *vocabulary* of this slice is the best I have seen in a product of this kind: shortlist / pass /
keep on file / offer representation / new faces / development / mother agency / placement / bookout /
"Self-reported · never confirmed" / "They came to us" — a head booker would recognise almost every
verb, and the decline-reason taxonomy is written the way an agency would actually want to be quoted
(it describes the agency's situation, never the person). The 30-day auto-close, the
`closed_no_response`-is-not-`passed` distinction, the guardian-grant access system, and the
mother-agency/placement representation model are genuinely good industry work and should be defended.

The failure is one layer down, and it is consistent: **the desk asserts facts the data does not
contain.** Every row in the inbox is stamped "Editorial" because the endpoint never returns
`archetype` and the client defaults it. The Overview's headline strip is titled "Top matches today"
over an `ORDER BY created_at DESC`. The ledger has a "Match" column header over no cell, shifting
every column label one place. A talent who set themselves "unavailable" is rendered to the booker as
"Available" in success green, because the availability lookup falls back to `STATES.available` for
any key it does not know. Two of three source filters can never match a row. A material request
emails the applicant "**{Agency} shortlisted you**" when the agency did no such thing. And the
agency can flip an application to `represented` on its own, which emails the talent "Representation
confirmed by {Agency}" — a legal fact Pholio cannot verify, unreconciled with the platform's own
`talent_representations` table, with no roster or board on the other side of it.

Underneath that sits a minor-data split: the review room withholds a minor's bust/waist/hips and says
so on screen, while the dossier, the comparison overlay and the CSV export all print them. The same
product, about the same 16-year-old, on four surfaces, disagreeing with its own promise — and BFMA
is categorical that they should not exist at all.

A booker would like the words and stop trusting the numbers by the second screen.

---

## Findings

### L6-01 [P0] [CLAIM/DATA] Every submission in the inbox and review room is labelled "Editorial"

- **Where:** `client/src/domains/agency/pages/ApplicantsPage.jsx:119`, `:141`, `:176`;
  `client/src/domains/agency/components/review/ReviewRoom.jsx:385`;
  `client/src/domains/agency/components/overview/overviewData.js:180`.
  Reachable via `/dashboard/agency/submissions` (both book and ledger views), the review drawer
  (`?review=<id>`), and `/dashboard/agency` (talent strip / TalentPanel).
- **String/state:** `type: p.archetype || 'editorial'` → `const discipline = resolveDivision(a.type || 'editorial').label`
  renders **"Editorial"** as the lead term of the meta line under every name; ReviewRoom's identity
  line renders `enumLabel(profile?.archetype || row?.type || '')` → "Editorial"; the Overview strip
  renders `typeLabel: a.archetype || 'Editorial'`.
- **Trace:** `GET /api/agency/applications` (`src/domains/agency/routes/inbox.js`) never selects
  `archetype` — grep for `archetype` in that file returns nothing. `GET .../details` selects
  `selectColumnsForAudience(AUDIENCE.AGENCY_SUBMISSION)` =
  `AGENCY_SUBMISSION_SELECT` = `SUBMISSION_PROFILE_SOURCE_FIELDS`
  (`src/shared/lib/profile-visibility.js:217`, `src/shared/lib/submission-profile.js:6-43`), which
  also contains no `archetype`. `GET /api/agency/overview/recent-applicants`
  (`inbox.js:4256`) selects nine profile columns, none of them `archetype`. So the fallback is the
  only value that can ever render.
- **Industry reality:** the first thing a booker reads on an inbound submission is board/market fit
  (R1 §1: "market/board fit → age and guardian status → height/measurements gate → the four photos →
  social handles"). Board/segment is the industry's primary organising key — R2 §5.6: "for many
  agencies the public website and the booking system are one system, and 'board' is a first-class
  entity in the data model. Any tool that gives an agency a board-less flat list is not just using
  the wrong word — it is missing the primary key."
- **Why it fails:** the desk prints a market classification with the authority of a fact, on a field
  that is structurally always the same value. A curve applicant, a commercial applicant, a fit model
  and a kids submission all read "Editorial". The same person's dossier (`readingLine`,
  `dossierModel.js:117`, backed by the `discipline` column, which *is* on the discovery allowlist)
  shows their real discipline — so the product contradicts itself between two clicks. The component's
  own comment calls this "a market descriptor"; a booker scanning 400 identical descriptors will
  conclude the tool has no data.
- **Fix:** add `archetype`/`discipline` to `SUBMISSION_PROFILE_SOURCE_FIELDS` and to the
  `/applications` and `/overview/recent-applicants` selects, and render nothing (not a default) when
  the applicant declared nothing. If the intent is board fit rather than look-archetype, show the
  board(s) the person applied to — `submissionPackage.boards` already exists and the ReviewRoom
  already renders it as "General consideration" when empty; that is the honest fallback.

### L6-02 [P0] [CLAIM] A talent who declared themselves unavailable is shown to the booker as "Available"

- **Where:** `client/src/domains/agency/components/status/statusConfig.js:100-113` (`STATES`, `getState`),
  `client/src/domains/agency/components/status/AvailabilityCell.jsx:16`,
  rendered at `client/src/domains/agency/components/dossier/ReadoutBand.jsx:84` and
  `client/src/domains/agency/components/dossier/CalendarLine.jsx:36`.
  Reachable via `/dashboard/agency/talent/:applicationId` (the Readout Band is the second thing on
  the page, above the fold).
- **String/state:** `export const getState = (status) => STATES[norm(status)] || STATES.available;`
  `STATES` has keys `available, onbooking, booking, option, firstoption, secondoption, onhold, hold,
  booked, bookout, released, inactive`. The stored column
  (`src/domains/talent/routes/availability.js:6`) holds **`'available' | 'limited' | 'unavailable'`**.
  `norm('unavailable')` = `'unavailable'`, `norm('limited')` = `'limited'` — neither is a key — so
  both resolve to `{ label: 'Available', c: 'var(--ss-live)' }`.
- **Industry reality:** availability is not a boolean at all (R2 §2.1: "'Available / Unavailable' as
  a talent-set toggle … Availability is a *date-range* concept on a chart (bookout), never a global
  on/off flag"). But whatever it is, showing the *inverse* of the declaration is not defensible.
- **Why it fails:** the booker's four-instrument readout band exists to answer "where does this
  stand without making me read", and one of its four instruments prints the opposite of the truth in
  the success colour. A booker who chases someone who booked out has been actively misled by the
  product.
- **Fix:** map `limited` and `unavailable` explicitly (`STATUS_MAP` in `ui/StatusText.jsx` already
  has a `limited` entry — the two maps have drifted), and make `getState` return an explicit
  "Not declared" rather than falling back to `available`. Better still: drop the global toggle from
  the submission view entirely (see L6-08) and show only dated bookouts.

### L6-03 [P0] [MINOR/CONSISTENCY] Three of four agency surfaces print a minor's bust/waist/hips — including the one the review room promises withholds them

- **Where (withholds):** `client/src/domains/agency/components/review/ReviewRoom.jsx:136-146`
  (`buildConfirmationStats(profile, { hideBody: isMinor })`, `BODY = bust|chest|waist|hips|inseam`)
  and `:792-794`, which tells the reviewer in as many words:
  > **"Minor** — Body measurements withheld · route all correspondence through the guardian on record."
- **Where (prints them anyway):**
  1. `client/src/domains/agency/components/dossier/DossierPlate.jsx:144-150` — `StatLine` renders
     `talent.stats.fields` filtered only for `hair`/`eyes`. No minor gate. The snapshot that feeds it
     (`src/shared/lib/submission-profile.js:88-121`) copies `bust_cm, chest_cm, waist_cm, hips_cm,
     inseam_cm` verbatim and calls `buildCanonicalStats(source)` with no minor branch.
     Reachable via `/dashboard/agency/talent/:applicationId`.
  2. `src/domains/agency/services/comparison.js:52-63, 134-137` — `COMPARISON_FIELDS` includes
     Bust/Chest/Waist/Hips/Inseam and `fields:` is built with no minor gate, three lines above a
     comment claiming the opposite ("Body frames are withheld for a minor … exactly as the dossier
     withholds them" — the *frames* are, the *fields* are not, and the dossier withholds neither).
     Reachable via the bulk bar's Compare action on 2–6 selected rows.
  3. `src/domains/agency/routes/inbox.js:3450-3481` — the CSV export builds
     `measurements = "Bust: 82, Waist: 62, Hips: 89"` and `age: derivedAge` with no minor gate.
     `const minor = isMinorProfile(app)` on line 3464 is used **only** to null `email` and `phone`.
     Reachable via `GET /api/agency/export`, the export action on ApplicantsPage.
- **Industry reality:** BFMA Code of Practice, verbatim: *"We believe it is inappropriate to measure
  any young person under the age 18 except for their height."* (R2 §5.4, R3 §4.7, R5 §4). R3 §4.7's
  product implication is explicit: *"a stats model must be able to structurally omit B/W/H for
  under-18s, not merely leave the fields blank."* Printer guidance for children's cards substitutes
  "height, clothing size, shoe size, hair, eyes, age range" — the triple disappears entirely.
- **Why it fails:** guardian consent does not cure this under BFMA — it is a categorical rule about
  what may be *measured*, not a permission. And regardless of the external rule, the product tells
  the reviewer on one screen that these numbers are withheld and prints them on the next. A UK agency
  running a BFMA compliance check would fail Pholio on the export alone.
- **Fix:** move the gate to the server. Strip `bust_cm/chest_cm/waist_cm/hips_cm/inseam_cm` (and the
  derived canonical `stats.fields` entries) inside `buildSubmissionProfileSnapshot` whenever
  `minor === true`, so no agency surface can render what it never receives. Height stays. Then
  delete the client-side `hideBody` special case as redundant.

### L6-04 [P0] [MINOR] The CSV export applies no minor filter and no minor-permission check; the webhook applies neither the filter nor the contact redaction

- **Where:** `src/domains/agency/routes/inbox.js:3167-3620` (`GET /api/agency/export`);
  `src/domains/agency/services/export-webhook-dispatch.js:78-102` (`buildPayload`), fired from
  `src/domains/talent/routes/applications.js:1980`.
- **State:** `src/domains/agency/services/minor-submission-access.js:41` classifies the export as
  `["GET", "/api/agency/export", "admin_permission_and_filter"]` — i.e. the route is contracted to
  call `applyMinorSubmissionFilter`. It does not: grep `applyMinorSubmissionFilter` in `inbox.js`
  returns hits at lines 358–421 and 1122 only. The export query
  (`inbox.js:~3225`) filters on agency id, `whereNot status 'withdrawn'` and the `bio_curated` gate,
  nothing else. `enforceMinorSubmissionAccess` (`minor-submission-access.js:370-407`) only blocks
  routes whose path carries an application id, so it sets `req.allowMinorSubmissions` and waves this
  one through. Net effect: any OWNER/ADMIN can export live minor submissions **without holding
  `talent.view_minor_submissions`**, complete with age and body measurements.
- **Webhook:** `buildPayload` sends `{name, email, phone, city, heightCm}` with **no minor branch at
  all**, so a minor's email and phone leave Pholio to the agency's own system — the exact contact
  routing the review room promises goes through the guardian. Its docstring claims "The payload
  deliberately mirrors the CSV export's columns"; it mirrors neither the columns nor the redaction.
- **Industry reality:** guardian-as-the-only-channel is the strongest and most consistent minor rule
  in the research. Elite, verbatim: *"your parent/legal guardian contact information will be the only
  ones we will utilise, should we intend to contact you"*; BFMA: *"direct contact with any model
  under 18 can only be done with parental consent"* (R5 §4, R1 §4.3).
- **Why it fails:** the two paths that carry data *out of Pholio's control* are the two that skip the
  controls. Once a minor's phone number is in the agency's CRM, the guardian grant, the expiry sweep
  and the revocation purge (all of which are otherwise excellent) govern nothing.
- **Fix:** call `applyMinorSubmissionFilter(query, { alias: 'applications', allowMinor: req.allowMinorSubmissions })`
  on the export query, and gate the whole route on `talent.view_minor_submissions` when the result
  set would contain a minor. In `buildPayload`, null `email`/`phone` for a minor and add a
  `guardianMediated: true` flag so the receiving system knows why.

### L6-05 [P0] [CLAIM/STATE] The agency alone can record `represented`, and Pholio emails the talent "Representation confirmed by {Agency}"

- **Where:** `src/shared/constants/application-status.js:32-45` (`represented` is in
  `WRITABLE_APPLICATION_STATUSES`); written via `PATCH /api/agency/applications/:id/status` and
  `PATCH /api/agency/applications/bulk-status` (`src/domains/agency/routes/inbox.js:2098-2135`);
  surfaced as the "Represented" lifecycle tab
  (`client/src/domains/agency/constants/applicantLifecycle.js:55`) and the `{represented} represented`
  figure on the board band (`ApplicantsPage.jsx:407`).
  Talent-facing copy: `src/shared/services/notifications.js:338-341`
  ("Representation confirmed" / "{agency} marked your representation agreement complete.") and
  `src/shared/lib/email.js:228-230`, subject **`Representation confirmed by ${agencyName}`**.
  Reachable via the submissions inbox bulk bar and the review room.
- **Industry reality:** representation is a contract. R2 §1.4: *"an agency signs, a model accepts …
  the transition is offer of representation → contract signed → placed on a board."* R2 §3.3 marks
  "contract signed" as the one transition that "obligates **both**". Under NY law the instrument has
  statutory content — ≤20% commission, ≤3-year term, no auto-renewal, registration number in the
  contract (R5 §3.1). Under BFMA, a minor's agreement *must* be signed by the guardian (R2 §5.4).
  R0 §22: *"Representation status is a legal fact the platform cannot verify unless both parties
  attest; it must be labelled 'declared by talent' / 'recorded by agency' accordingly."*
- **Why it fails, specifically:**
  1. **The product already knows better and applied the rule elsewhere.** The same constants file, 25
     lines down, refuses to let an organizer write `confirmed` for an event slot: *"Both are written
     by the applicant only … an organizer must not be able to record a confirmation the talent never
     gave."* A one-week show slot gets two-party confirmation; a multi-year representation agreement
     gets one-party.
  2. **It is unreconciled with Pholio's own representation record.** `talent_representations` is
     talent-owned (`src/domains/talent/services/representations.js`, all queries scoped by
     `profile_id`). Setting the application to `represented` writes nothing there. So the dossier can
     display headline "Unrepresented — No representation on record"
     (`dossierModel.js:127-163`) for the same person the inbox counts as represented.
  3. **The email is unhedged.** The in-app body is carefully hedged ("*marked* your representation
     agreement complete"); the subject line — the part that gets read — asserts it flatly.
  4. **No scope.** `represented` is a global boolean on an application. There is no market, no
     exclusivity, no mother-agency/placement distinction — even though `RecordPanels.jsx` proves the
     product has the right model available (see Working Well).
  5. **Nothing on the other side.** `/dashboard/agency/roster` redirects to
     `/dashboard/agency/submissions` (`client/src/App.jsx:168`). A model the agency has just recorded
     as represented stays a row in the intake inbox forever; there is no board placement, no chart,
     no roster. R2 §3.1 step [5] is precisely where the durable record is supposed to begin.
- **Fix:** make `represented` two-party. The agency records **"Representation offered"** (`accepted`,
  which already exists and is correctly hedged); the talent confirms, which writes a
  `talent_representations` row carrying agency, market, relationship type (mother/placement) and
  exclusivity, and only then flips the application. Until confirmed, label the tab and the counter
  "Offered — awaiting the talent". Change the email subject to "{Agency} confirmed your
  representation on Pholio" or drop it in favour of the offer email.

### L6-06 [P0] [CLAIM] A material request emails the applicant "{Agency} shortlisted you" — an outcome the agency never recorded

- **Where:** `src/domains/agency/routes/materials.js:505`, reachable from the review room's
  "Request digitals · D" (`ReviewRoom.jsx:1166`), the sheet-foot "Request N missing"
  (`ReviewRoom.jsx:748`), and the dossier's "Ask for the missing frames"
  (`DigitalsSet.jsx:117`).
- **String:** `subject: \`${agencyName} shortlisted you — a few more things\``
- **Trace:** the action writes status `requested_more`, not `shortlisted`
  (`applicantLifecycle.js:44`, `client/src/domains/agency/api/agency.js:214`). The profile-backed
  branch of the very same handler (`materials.js:497`) sends
  `sendMaterialsRequestedEmail` → subject `${agencyName || "An agency"} asked for more`
  (`src/shared/lib/email.js`), which is correct. Only the identity-backed branch (an open-call
  applicant with no Pholio account — i.e. the *least* informed recipient) gets the false one.
- **Industry reality:** "shortlisted" is the single outcome word agencies actually publish, and it
  carries a specific meaning to an applicant. Storm, verbatim: *"Due to the volume of applications, we
  will only contact those who have been shortlisted"* (R1 §3, R2 §2 "Shortlisted — the only
  inbound-prospect status agencies publish"). Asserting an agency's interest that the agency did not
  express is the FTC v. Explore Talent fact pattern in miniature — R5 §5.5 lists *"Stating or implying
  that a named client/casting is interested when it is not"* as prohibited, settled at a $500,000
  civil penalty.
- **Why it fails:** the sentence is in the agency's voice, the agency cannot see it, and the agency
  did not say it. An applicant who tells people "Storm shortlisted me" on the strength of a Pholio
  email, and is then passed on, is a reputational incident for the agency and for Pholio.
- **Fix:** use the same subject as the other branch — `${agencyName} asked for more`. If the intent
  is the "heavy asks follow selection" design in `src/shared/constants/open-call-intake.js:123-125`,
  then gate that subject on the application actually being `shortlisted` and send the neutral one
  otherwise.

### L6-07 [P1] [CLAIM] "Top matches today" is `ORDER BY created_at DESC`

- **Where:** `client/src/domains/agency/pages/OverviewPage.jsx:103`
  (`<TalentStrip title="Top matches today" talents={recentTalent} …>`), fed by
  `useRecentApplicants(24)` → `GET /api/agency/overview/recent-applicants`
  (`src/domains/agency/routes/inbox.js:4256`), whose only ordering is
  `.orderBy("applications.created_at", "desc").limit(limit)`. Reachable via `/dashboard/agency` —
  it is the second block on the agency's home page.
- **Industry reality:** R2 §2.1, on "Match / match score": *"Nothing in agency software scores
  talent-to-client fit. Clients express interest as 'Interested / Maybe / Not interested' on a
  human-curated package. An algorithmic match score would read as unserious."* R0 §21: a platform
  cannot know intent, interest, suitability or likelihood.
- **Why it fails:** two independent lies in three words — nothing is a "match" (there is no brief to
  match against on this page), and nothing is "top" (it is reverse-chronological). The product's own
  `ComparisonOverlay.jsx:20-34` writes a long, correct argument for why ranking is forbidden on this
  surface — "A1 forbids ranking … a look no competitor computing match scores can wear" — and the
  Overview then ranks in its heading anyway.
- **Fix:** `title="Latest submissions"`, and link "View all" to the To Review tab. If a ranked strip
  is wanted later it needs a brief to rank against and must name the criterion.

### L6-08 [P1] [CONCEPT] The submission view carries a booking desk an applicant cannot have: options, holds and bookouts on an unsigned person

- **Where:** `client/src/domains/agency/components/dossier/ReadoutBand.jsx:78-92` (the "Availability"
  instrument, one of three above the fold), `client/src/domains/agency/pages/TalentFullView.jsx:246`
  (`<Sheet id="dx-availability" title="Availability">`),
  `client/src/domains/agency/components/dossier/CalendarLine.jsx:28-48`.
  Reachable via `/dashboard/agency/talent/:applicationId`.
- **String/state:** `"No bookouts, options, or holds on record for this window."`; the readout note
  reads `${calendar.next.kindLabel || 'Bookout'} 12 Oct–19 Oct` or `Clear for 30 days`; the value
  renders `AvailabilityCell`, whose vocabulary is `Available / On Booking / 1st Option / 2nd Option /
  On Hold / Booked / Bookout / Released` (`statusConfig.js:100-113`).
- **Industry reality:** options, holds, first/second option, book-or-release and bookouts are the
  booker's own instruments, placed by the agency on a *represented* model's chart (R4 §2.1; R2 §1.6:
  *"Per-talent statuses such as request, option, and confirmed"*). R2 §3.3 is explicit that these
  attach after signing; R2 §8 names the structural error directly: *"most products model the
  pre-signing phase as a rich, persistent, notification-bearing pipeline. Agencies model it as
  near-nothing."*
- **Why it fails:** an unsigned applicant has no chart, so this section is structurally empty on
  every real submission — and the one value it *can* show ("Available", per L6-02) is the one it gets
  wrong. Worse, a booker who reads "1st Option" in a submission review will read it as a claim on
  dates that no one placed. R2 §8 again: a tool that inverts the pre/post-signing weighting "will
  feel, to a booker, like it was built by someone who has never sat on a board."
- **Fix:** remove the availability readout and the calendar sheet from the submission dossier
  entirely, or reduce them to dated bookouts the talent actually entered, headed "Dates the talent
  has blocked" with no option/hold vocabulary. Reserve the option/hold ladder for a represented
  model's chart, if and when one exists.

### L6-09 [P1] [DATA] The ledger's column headers are one column out of register, and the extra one says "Match"

- **Where:** `client/src/domains/agency/pages/ApplicantsPage.jsx:1561-1569` (header row, 7 cells)
  vs `:314-364` (`LedgerRow`, 6 cells). Grid at
  `client/src/domains/agency/pages/ApplicantsPage.css:426` declares 7 columns.
  `.ap-score-cell` survives at `ApplicantsPage.css:557` with no JSX that renders it.
  Reachable via `/dashboard/agency/submissions` → ledger view (persisted in `localStorage`).
- **String/state:** header cells are `[·, ·, "Talent", "Submitted", "Match", "Status", ·]`; row cells
  are `[pick, photo, name+spec, applied, status, actions]`. From the fifth column on, every label sits
  over the wrong cell: **the status text renders under "Match"** and the action buttons render under
  "Status".
- **Industry reality:** R2 §2.1 lists "match / match score" among the terms practitioners would
  flinch at; nothing in Mediaslide, Syngency, AgencyPin or Netwalk scores talent-to-client fit.
- **Why it fails:** it is simultaneously a wrong word and a live rendering defect. A booker reading
  the dense scanning view sees "Shortlisted" printed under a column headed "Match" and either
  concludes Pholio is computing a score, or that the table is broken. Both readings cost trust, and
  the second is correct.
- **Fix:** delete the `<span>Match</span>` header and the dead `.ap-score-cell` rule, and add the
  seventh header cell for the actions column so the header and the row agree.

### L6-10 [P1] [DATA] Two of the three "Source" filters can never match a row, and the "New faces" filter matches on a field that is always the same value

- **Where:** `client/src/domains/agency/pages/ApplicantsPage.jsx:749-757` (source),
  `:740-747` (talent), filter UI at `:1358-1385`. Reachable via the FILTERS popover on
  `/dashboard/agency/submissions`.
- **State:** the filter reads `a.source`, but `mapRow` (`:106-127`) and `mapCandidate`
  (`:130-147`) never set a `source` field — so `(a.source || 'open_call')` is always `'open_call'`.
  Selecting **Scouted** or **Referral** returns zero rows for every agency, always; selecting
  **Open call** returns everything, including rows the review room itself labels "Scouted by your
  agency" (`ReviewRoom.jsx:837`, from `application.invited_by_agency_id`, which is available and
  simply not carried into the row shape). Likewise `filters.talent` "New faces" tests
  `a.type === 'new_face' || a.type === 'development'`, and `a.type` is always `'editorial'` (L6-01),
  so it degenerates to `status === 'development'` and "Existing talent" matches everything else.
- **Industry reality:** scouted vs inbound is a real and load-bearing distinction — Mediaslide sells
  *"Scouting management … track scouted models"*, Netwalk *"track proposed or introduced models"*
  (R2 §2). The review room already draws it correctly ("We invited them" / "They came to us",
  `StandingRail.jsx:129`).
- **Why it fails:** a filter that silently returns nothing is worse than no filter — a head booker
  who filters to "Scouted", sees an empty desk, and concludes their scouts submitted nothing has been
  given a false answer to a real question.
- **Fix:** carry `invited_by_agency_id` (and the open-call link id) into `mapRow`/`mapCandidate` and
  derive `source` from them; push the filter to the server alongside city/height/date. If the
  referral concept does not exist in the data model, remove that option.

### L6-11 [P1] [STATE] Auto-closed submissions still count as "On the desk" and lose their status label entirely; the agency is never told a close happened

- **Where:** `client/src/domains/agency/constants/applicantLifecycle.js:32-34` (`isActiveStatus`
  excludes only decided / `kept_on_file` / `development`, so `closed_no_response` reads as active);
  `client/src/domains/agency/pages/ApplicantsPage.jsx:1259-1262` (the lead hero figure "On the
  desk"); `client/src/domains/agency/components/ui/StatusText.jsx:23-45` (`STATUS_MAP` has no
  `closed_no_response` entry → `getStatusMeta` returns null → `StatusCell` renders **nothing**).
  Server side: `src/shared/lib/application-auto-close.js:163-215` notifies the talent and writes an
  `application_activities` row with `user_id: null`, and notifies the agency of nothing — there is no
  `notifyAgency*` call anywhere in that file.
- **Industry reality:** the auto-close *design* is right and matches the industry (Storm: *"Your
  application data will be kept here for no longer than 30 working days"*; Bridge, Nemesis and ONE
  all convert silence into a published deadline — R1 §3). R0 §24 asks exactly for what this file
  does: attribute the silence to the platform's window, never to the agency.
- **Why it fails on the agency side:** a booker's headline figure counts submissions Pholio has
  already closed and already told the applicant to treat as a pass, and those rows render with a
  blank status cell — indistinguishable from a data error. The agency is thus (a) unaware that
  Pholio spoke in its name, and (b) working a desk figure that is inflated by exactly the rows it
  can no longer act on.
- **Fix:** add `closed_no_response: { label: 'Closed — no reply', … }` to `STATUS_MAP`, exclude it
  from `isActiveStatus`, give it a lifecycle tab (or fold it into "Passed" with the distinct label
  preserved), and post a weekly agency notification: "N submissions closed automatically after your
  30-day window."

### L6-12 [P1] [CONCEPT] "Board" means two different objects at once, and the divisions the agency declared at setup are shown as things that "close" and get "wrapped"

- **Where:** setup declares the distinction —
  `client/src/domains/agency/pages/SetupPage/chapters.js:74`:
  > *"Agency boards route submissions to the right bookers. Casting boards stay separate, opened per brief."*
  The inbox then erases it: `ApplicantsPage.jsx:1201-1207` calls `<BoardSelect boards={boards}>` where
  `boards` comes from `getBoards()` **with no `type` argument**
  (`client/src/domains/agency/api/agency.js:334-338`: *"`type` is optional: 'division' for agency
  boards (Women, Editorial), 'package' for casting boards. Omitted returns both"*). `BoardBand`
  (`ApplicantsPage.jsx:389-420`) then links every selected board — division or brief — to
  `/dashboard/agency/signing/${board.id}` under the label "Open board", and the Overview computes
  `closingBoards` off the same untyped list (`overviewData.js:95-104`), producing
  *"2 boards close this week — finalize submissions"* (`overviewData.js:57-64`) about a division
  called Women or New Faces.
- **Industry reality:** R2 §1.1 — a board is a *desk*: a named subset of talent with its own bookers,
  its own phone line and its own client list (Storm and Milk publish a phone number per board).
  R2 §1.2 — boards are a matrix of segment × career stage. R2 §8 — *"'Signing board' is actively
  harmful. 'Board' is a taken word meaning division. Any kanban-style UI must not be called a board
  in this domain."*
- **Why it fails:** divisions do not close, and they are not "wrapped" (`CastingPage.jsx:240`).
  A booker who declared "Women / Men / New Faces / Curve" in setup and is then told on Monday that
  New Faces closes Thursday will not understand what the product is claiming. The homonym collision
  R2 warned about has happened inside one screen.
- **Fix:** pass `type='division'` to `getBoards()` from `BoardSelect`, `BoardsTable` and
  `closingBoards`, so the submissions desk is scoped by division only; give per-brief boards their
  own noun (the industry word is a **casting** or a **brief**, never a board) and their own picker.

### L6-13 [P1] [CONCEPT] "Offer development" invents a pre-signing tier that does not exist

- **Where:** `client/src/domains/agency/components/review/ReviewRoom.jsx:1131-1142`
  ("Development · New Faces" as an alternative to "Representation", with the preview
  *"Records a development offer — building the book before full representation."*);
  `client/src/domains/agency/components/dossier/DecisionDock.jsx:112`
  ("Offer development (new face)"); status `development` in
  `src/shared/constants/application-status.js:37`; talent copy
  `src/shared/services/notifications.js:334-337` ("Development offer" / *"{agency} wants to develop
  you as a new face before full representation."*). Reachable via the review room's Offer arm and the
  dossier decision dock.
- **Industry reality:** R2 §1.3, verbatim: *"Operationally, 'in development' means: signed, but not
  yet sellable at full rate. The agency is investing — tests, digitals, a book being built … It is
  **not** a pre-signing pipeline stage."* Viviens lists `in-development` as a peer board of signed
  talent alongside Women/Men/Classic/Curve. R2 §3.1 puts board placement (New Faces / Development) at
  step [5], *after* the contract at step [4].
- **Why it fails:** the product offers the agency a way to say "we want you, but not enough to sign
  you", and tells the talent they will be developed "before full representation". No such
  relationship exists. Every model on a Development board is a signed model. The one lever an agency
  actually has at this stage is a meeting.
- **Fix:** collapse it. The offer is representation; the *board* the offer places them on is New
  Faces or Development, which is a routing decision made after signing. Rename the control to
  "Offer representation → to which board?" with the agency's own board list, and drop the
  `development` application status and its talent notification.

### L6-14 [P1] [CLAIM] The internal review page promises credential review and collects no credential

- **Where:** `client/src/domains/internal/pages/AgencyRequestsPage.jsx:169-170`:
  > **"Agency access review"** / *"Review agency credentials, record qualification calls, and provision approved workspaces."*
  The facts panel (`:216-226`) shows: market, agency type, roster size range, team size range,
  contact name/role/email, current system, migration interest, plus a website link. The stored record
  (`src/domains/internal/services/agency-request-review.js:48-80`, table
  `agency_access_requests`, `migrations/20260710120000_…`) carries no registration number, no licence,
  no trade-body membership. Reachable via `/internal/agency-requests` (staff-only).
  The downstream claim is talent-facing: `client/src/domains/talent/pages/SettingsPage/index.jsx:753`
  — *"Let **vetted agencies** surface you in Pholio Discover search"* — and
  `src/domains/talent/routes/settings.js:83`, *"so **vetted agency** searches can find you"*.
- **Industry reality:** R5 §5.4 enumerates what a working model or booker actually checks, in order:
  (1) NY DOL registration number and a matching entry in the public registry
  (`data.ny.gov/resource/hder-iq9y.json`, certificate numbers like `26-675DJ-LSFW`); (2) the
  Certificate of Registration posted on the website; (3) BFMA membership; (4) email-domain discipline;
  (8) CA Labor Commissioner licence. R2 §5.5 notes IMG now publishes its FWA licence at
  `/new-york-state-fashion-workers-act` — *"agencies now display registration credentials as a trust
  signal."* R0 §23: *"'Verified agency' must mean a specific mechanism … and the copy must say which."*
- **Why it fails:** the only thing separating an approved Pholio agency from an unapproved one is a
  staff member's judgement of a website and a self-declared roster size, and the word "vetted" is then
  used to talent as if it named a check. Pholio *has* the right mechanism sitting unused — the
  `agency_verifications` table with `registry: 'ny_dol'` and `registry_status: active|expired|revoked`
  (`src/shared/constants/submission-tracker.js:81-92`) is populated from committed registry snapshots
  and read on the talent side (`src/domains/talent/routes/agencies.js:114`,
  `client/src/domains/talent/lib/specRegistry.js:168` → "NYSDOL-registered"). The internal review page
  neither reads it nor writes it.
- **Fix:** add a `registration` block to the access request (registry, certificate number,
  jurisdiction) and show a live registry match on the review page — the DOL dataset is a public JSON
  endpoint. Replace talent-facing "vetted agencies" with the mechanism ("agencies Pholio has reviewed"
  or, where a match exists, "NYSDOL-registered"). Note also that under FWA §1034 a registered company
  must carry its registration number *"in any advertisement seeking models to represent"* — a Pholio
  open-call link is such an advertisement, and nothing in setup or the open-call brief collects or
  renders one.

### L6-15 [P1] [STATE] "Keep on file" is the one action exempt from the review window, and neither side is told how long "on file" lasts

- **Where:** action at `client/src/domains/agency/components/review/ReviewRoom.jsx:1163` ("Keep on
  file · F"), `client/src/domains/agency/components/dossier/DecisionDock.jsx:113`, toast
  `ApplicantsPage.jsx:669` ("Kept on file"). `kept_on_file` is deliberately absent from
  `AWAITING_AGENCY_APPLICATION_STATUSES` (`src/shared/constants/application-status.js:28-32`), so
  auto-close never touches it. Talent copy: `src/shared/services/notifications.js:361-364`
  (*"{agency} is keeping your profile on file for future openings"*) and
  `src/shared/lib/pholio-email/text.js:180` (*"{agency} kept your book on file. That's not a no."*).
  The only retention anywhere is `SUBMISSION_PACKAGE_RETENTION_MONTHS = 24`
  (`src/shared/lib/submission-retention.js:3`), which is never surfaced to the agency or the talent.
- **Industry reality:** R1 §3, verbatim: *"I searched all 24 captured surfaces for 'on file' / 'keep
  your details' language and found **zero** instances. Instead of a file-keeping promise, serious
  agencies publish a **deletion** promise."* Storm: 30 working days. Society: 6 months, then deleted.
  IMG: photos *"securely deleted from our system"* after evaluation. R2 §3.1: *"In the UK/EU, a
  persistent applicant database is a GDPR liability, not an asset. Agencies deliberately do not keep
  one."*
- **Why it fails:** the product's one soft outcome is the one thing 2026 agencies replaced with a
  retention limit, and it is engineered to be the only status that never expires. An agency using
  Pholio in the UK/EU acquires an indefinite applicant database by clicking a button labelled with a
  kindness. The agency is never shown the 24-month package horizon, so it cannot answer a subject
  access request about it.
- **Fix:** keep the action — it is genuinely useful and the talent copy is warm and honest — but put a
  clock on it. "Keep on file for 6 months" (agency-configurable next to the response window in
  `NotificationsPanel.jsx`), auto-close on lapse with a distinct, non-pass notification, and state the
  period in the talent's email. Surface the retention horizon in the Custody chapter of setup.

### L6-16 [P1] [CONSISTENCY/TERM] One action, four names — two of which say "go-see", which is the wrong word for an agency meeting

- **Where and variants:**
  | Surface | String | Location |
  |---|---|---|
  | Inbox toast | **"Go-see requested"** | `ApplicantsPage.jsx:671` |
  | Keyboard help | **"Invite to a go-see (in review)"** | `client/src/domains/agency/components/ShortcutHelp.jsx:17` |
  | Review room button | **"Invite to meet"** | `ReviewRoom.jsx:1169` |
  | Dossier decision dock | **"Invite to a meeting"** | `DecisionDock.jsx:111` |
  | Status cell (compact / full) | **"Meeting"** / **"Meeting requested"** | `ui/StatusText.jsx:41`, `:82` |
  | Talent notification | **"Meeting requested"** | `src/shared/services/notifications.js:330` |
  All reachable; the toast and the help panel are one keystroke apart on the same screen.
- **Industry reality:** a go-see is a *client-facing* appointment — R4 §2.2: *"Go-see: General meeting
  with a client/CD, not tied to one job; you show your book."* The agency's own first meeting with an
  applicant is a **meeting** or "come in"; R2 §6.1 concludes *"wrong for fashion, acceptable for US
  commercial/kids. Safer neutral word: 'meeting'."* R1 §2 lists "casting"/"audition" for the act of
  applying among the phrasings that make a booker flinch, for the same category reason.
- **Why it fails:** the product tells the booker they requested a go-see and tells the applicant a
  meeting was requested. If an applicant turns up expecting to show a book to a client, the agency
  wears it.
- **Fix:** "Invite to meet" everywhere — button, shortcut help, toast, status label and notification.
  Reserve "go-see" for the client-facing lane, if it ever exists.

### L6-17 [P1] [TERM] "Pipeline" and "stage" run through the agency-facing chrome

- **Where (all reachable):**
  - `ApplicantsPage.jsx:407` — *"{n} in pipeline · {n} awaiting review · {n} represented"* (board band)
  - `ApplicantsPage.jsx:1529` — *"Adjust the search or stage filter to see talent already in the pipeline."*
  - `client/src/domains/agency/components/BoardSelect.jsx:171` — *"{n} in pipeline"*
  - `client/src/domains/agency/components/overview/BoardsTable.jsx:102-103` — *"No submissions in pipeline"*
  - `client/src/domains/agency/pages/settings/NotificationsPanel.jsx:11` — *"**Pipeline movement** — When talent advances a **stage** — shortlisted, offered, represented."*
  - `client/src/domains/agency/components/TeamRolesGuide.jsx:6` — *"runs casting **pipelines**"*
  - `ApplicantsPage.jsx:1271` — rail `aria-label="Submission decision lifecycle"`
- **Industry reality:** R2 §8, verbatim: *"'Pipeline' — alien. Sales-CRM register. Agencies say
  scouting, applications, coming in. Netwalk's own phrasing is 'track proposed or introduced models';
  Mediaslide's is 'track scouted models'."* R4 §2.4: *"Pipeline — Sales/ATS metaphor. Bookers say
  chart, board, options, the pool."*
- **Why it fails:** it is the one register that gives the game away — a booker reading "pipeline
  movement" in their notification settings knows the tool was designed against a CRM, not a desk. The
  product already has better words in the same files: "On the desk", "the room", "the record",
  "standing", "awaiting review".
- **Fix:** "{n} submissions · {n} awaiting review · {n} represented"; "…talent already on the desk";
  "Nothing on this board yet"; "Decisions — when a submission is shortlisted, offered, or
  represented"; "runs castings".

### L6-18 [P1] [DATA] The CSV would not land cleanly in a Mediaslide/Syngency-shaped system

- **Where:** `src/domains/agency/routes/inbox.js:3556-3596` (`csvColumns`), values built at
  `:3450-3520`. Filename `pholio-applications-<date>.csv`.
- **Headers, verbatim, in order:** `Name, Email, Phone, City, Height (cm), Measurements, Age, Bio,
  [Notes], Tags, Application Status, Applied Date, Accepted Date, Declined Date, Email verified,
  Materials` (+ `Designer, Mark, Availability, Walk Video URL, Compensation, Confirmed Date` when
  event-scoped).
- **The problems, in order of severity for an importer:**
  1. **`Measurements` is one mashed text cell** — `"Bust: 82, Waist: 62, Hips: 89"`, built by
     `measurements.join(", ")` at `:3455-3459`. Commas inside a CSV cell, no units, and three facts in
     one column. Every agency system stores bust, waist and hips as discrete numeric fields; nothing
     will map this without hand-parsing.
  2. **Three of the seven canonical stat fields are missing entirely** — no Shoe, no Hair, no Eyes,
     although all three are on the submission snapshot (`SNAPSHOT_FIELDS`,
     `src/shared/lib/submission-profile.js:6-26`) and all three are in the comparison overlay's own
     field list. R3 §4.4 fixes the order as Height → Bust (→Bra/Cup) → Waist → Hips (→Dress) → Shoe →
     Hair → Eyes and notes *"Height is always first. Hair/eyes are always last. B–W–H are always
     contiguous."* R2 §4.1 confirms the same seven-field, invariant-order set on Premier, Storm and Viva.
  3. **No unit discipline.** `Height (cm)` is metric-only; the mashed measurements carry no unit at
     all. R3 §4.5: a US board renders `5' 9''` and `bust 30''`; a UK board renders `177.5 CM/5' 10''`
     and `Shoe 6 UK / 39 EU`. The agency already chose its unit preference in setup
     (`UNIT_OPTIONS`, `SetupPage/chapters.js:47-51`) and the export ignores it.
  4. **`Bio` sits between the stats and the workflow columns**, so a paste into a sheet puts free
     prose in the middle of the numeric block.
  5. **`Application Status` exports the raw enum** (`kept_on_file`, `closed_no_response`,
     `requested_more`, `declined_by_talent`) rather than the labels the desk shows.
  6. **No image URLs, no board applied, no Instagram handle.** A submission without its photos is a
     contact record, not a submission (R1 §8: digitals + stats + a short intro is *"the atomic unit
     of a submission"*).
- **Fix:** split into `Bust (cm)`, `Waist (cm)`, `Hips (cm)`, and add `Shoe`, `Hair`, `Eyes`; put the
  stat block contiguous and in canonical order right after Height; honour the agency's unit setting
  (or emit both, `Height (cm)` and `Height (ft/in)`); move `Bio` and `Notes` to the end; map the
  status enum through `getStatusLabel`; add `Instagram`, `Board(s) applied for` and a `Photos`
  column of public URLs. Then run L6-03's minor gate over all of it.

### L6-19 [P1] [CONCEPT] "Send submissions to your own system" sends a contact record, not a submission

- **Where:** panel copy `client/src/domains/agency/pages/settings/ExportWebhookPanel.jsx:130-137`:
  > *"**Send submissions to your own system** — Every submission is POSTed to a URL you control the
  > moment it arrives, so your desk keeps working where it already works."*
  Payload: `src/domains/agency/services/export-webhook-dispatch.js:78-102` —
  `applicant: { profileId, name, email, phone, city, heightCm }` and an `application` stub of
  `{id, status, submittedAt, callPurpose, openCallLinkId}`.
- **Industry reality:** the artefact an agency receives is photos + stats + basics (R1 §8; R3 §4.8:
  *"Do stats accompany digitals? Yes, always, in the same message"*). Every vendor in R2 §1.7 moves
  images: Syngency *"send HD images and videos"*, Mediaslide *"send beautifully designed model
  portfolios"*, Netwalk *"Packages Tool"*.
- **Why it fails:** the panel's whole argument is "Pholio does not need to be the place you check",
  and the payload guarantees it will be — there are no images, no measurements, no socials, no board
  applied. The docstring's own claim ("mirrors the CSV export's columns") is false in both directions:
  it drops eleven of the CSV's columns and skips the minor redaction the CSV applies (L6-04).
- **Fix:** send the frozen submission package — the same shape the dossier reads
  (`talent_submission_packages.payload`): stats, the digitals slots with signed URLs, boards applied,
  socials, consent record. Or retitle the panel honestly ("Notify your system when a submission
  arrives") and add a documented pull endpoint for the package.

### L6-20 [P2] [TERM] "Dossier" is the product's word for a person's submission, and it reaches the screen

- **Where:** `client/src/domains/agency/pages/TalentFullView.jsx:41` (`aria-label="Loading talent
  dossier"`), `:161` (*"This dossier could not be opened"*), `:98` (*"…before this dossier opens"*).
  Reachable via `/dashboard/agency/talent/:applicationId`.
- **Industry reality:** R2 §2.1 lists the industry's own nouns for this object: a talent has a
  **book** (portfolio), a **card** (comp card), a **chart** (schedule), and internally a **record**.
  "Dossier" is an intelligence/investigation word and appears nowhere in any of the 18 agency sites,
  5 vendors or 3 regulators sampled.
- **Why it fails:** it is the one place the product's otherwise-excellent register slips into
  surveillance. Applied to a 16-year-old's application it reads badly in a way "the record" does not
  — and "the record" is already the name of the page's own second half
  (`TalentFullView.jsx:253`, `ReviewRoom.jsx:883`).
- **Fix:** "the record" or "the submission" in every visible string; keep `dossier*` as internal
  file/variable names if the churn is not worth it.

### L6-21 [P2] [CLAIM] "the trade expects digitals shot within the last three months" is stated as an industry fact

- **Where:** `client/src/domains/agency/components/dossier/DigitalsSet.jsx:33` and `:36`, reachable in
  the dossier's digitals set.
- **Industry reality:** R3 §4.9, verbatim: *"No agency page in the primary sample states a numeric
  re-measure interval. The 3-month figure is a coaching convention. **Label it as such in any product
  copy.**"* R1 §6.4 reaches the same conclusion for photo recency: only Bridge says anything ("your
  most recent photos"), and the three-month rule is coaching-blog material, not agency policy.
- **Why it fails:** the product speaks for "the trade" on a number the trade has not published, and
  then flags a submission against it. The booker reads a manufactured deficiency.
- **Fix:** state the fact and let the booker judge: "Oldest frame in this set: 7 months (shot 14 Feb)"
  / "This set carries no capture date." The `Measurements over 90 days old · not confirmed in person`
  line in `ReviewRoom.jsx:88` is already the right pattern — a measurement plus its provenance, no
  external authority invoked.

### L6-22 [P2] [DATA] "Pass rate" is ambiguous, inverted, and computed over whatever is currently loaded

- **Where:** `client/src/domains/agency/pages/ApplicantsPage.jsx:796-801`, rendered as one of the
  desk's two governing figures at `:1262-1267`.
- **State:** `passRate = passed / (represented + confirmed + passed)`. The counts come from
  `applicants` — the currently loaded set, capped at 2,000 and already narrowed by the server-side
  city / height / date / search params — so the figure moves as the booker types in the search box.
  It excludes `kept_on_file`, `closed_no_response` and everything still in flight.
- **Industry reality:** no agency in R1 §3 publishes an outcome rate, and the research is explicit:
  *"Treat 'vast majority receive no reply' as well-evidenced; treat any specific percentage as
  unevidenced."* R2 §3.3 adds that everything before contract signed "obligates nobody and is
  expected to evaporate" — a ratio over evaporating states is not a measure of anything.
- **Why it fails:** "pass rate" in ordinary English is the rate at which things *pass*; here it is the
  rate at which the agency *passes on people*, so a high number reads as success and means the
  opposite. And because most submissions auto-close rather than being passed, the denominator omits
  the actual majority outcome.
- **Fix:** replace it with a count the booker can act on: "Oldest waiting: 19 days" (the Overview
  already computes `pendingOldestDaysAgo`), or "Decided this week: 24".

### L6-23 [P2] [TERM] Setup's closing beat: "{Agency} is commissioned" and "Enter the command center"

- **Where:** `client/src/domains/agency/pages/SetupPage/index.jsx:322-333`, reachable at the end of
  `/dashboard/agency/setup`.
- **Industry reality:** *commission* has one meaning in this business — the percentage an agency takes
  on a booking, capped at 20% in New York (R2 §5.5, R5 §3.1 §1035(7)). "Your agency is commissioned"
  reads as a statement about money. "Command center" is SaaS/military; the product's own better word
  is on the very next screen — the submissions hero says **"On the desk"** (`ApplicantsPage.jsx:1260`).
- **Fix:** *"{Agency} is open on Pholio. Your boards and inbox are live."* → **"Go to the desk"**.

### L6-24 [P2] [TERM/CONCEPT] Two decline reasons the industry would not give

- **Where:** `src/domains/agency/services/decline-reasons.js:73-83`, shown in
  `DeclineReasonFields.jsx` and the review room's pass arm.
- **Strings:** agency label *"Looking for more experience"*; talent message *"They are looking for
  more experience than this submission showed. **Building a book with smaller clients first is the
  usual route back.**"*
- **Industry reality:** the New Faces board exists precisely to sign people with no experience
  (R2 §1.3: New Faces = *"newly signed, brand-new to the industry"*; R1 §4.2: prior campaigns,
  tearsheets, a portfolio and a résumé are asked for by **0 of 24** fashion intake surfaces). Premier
  names *"Need you to submit a portfolio of modelling work to apply"* as a **scam marker**
  (R2 §5.1, R5 §5.1), and Heroes: *"we encourage aspiring models not to pay for portfolio images, as
  all you need to apply are natural pictures from a phone."*
- **Why it fails:** it hands the agency a sentence a fashion board would never write, and the advice
  attached to it — go build a book with smaller clients — is one step from the paid-portfolio pitch
  the whole sector publishes warnings about. (The other four reasons are excellent and should be kept
  verbatim; see Working Well.)
- **Fix:** delete `experience`, or restrict it to the commercial/talent lane where a résumé is
  genuinely asked for (Wehmann, The Option Agency's actor track) and drop the "build a book" advice.
  If a fifth reason is wanted, R1 §3's own convention is the honest one: *"not right now — you are
  welcome to reapply in six months."*

### L6-25 [P2] [CONSISTENCY] A minor's exact age is shown in the review room and the CSV, and banded everywhere else

- **Where:** banded — `client/src/domains/agency/components/dossier/dossierModel.js:114`
  (`if (t.is_minor) out.push('Under 18')`), `ComparisonOverlay.jsx:48`
  (`ageBandLine`, with a careful comment on why only the minor band earns a line),
  `src/shared/lib/submission-profile.js:102` (`age_band`).
  Exact — `ReviewRoom.jsx:765` (`age != null ? \`Age ${age}\` : null`, unconditional) and
  `src/domains/agency/routes/inbox.js:3481` (`age: derivedAge`, unconditional).
- **Industry reality:** R2 §4.2 — *"Age and date of birth are NOT shown"* on adult boards; R3 §4.7 —
  children's cards carry an **age range**, not a date. Agencies do hold DOB internally for permits,
  so exact age is not indefensible; the problem is that the product decided the band was right on
  three surfaces and the fourth ignores it.
- **Fix:** pick one. Banded on display surfaces, exact only where a work permit or licence is being
  handled — and if the CSV needs the exact age for licensing, label the column so.

### L6-26 [P2] [STATE] Two status labels read as HR, and one is set by nobody

- **Where:** `client/src/domains/agency/components/ui/StatusText.jsx:32-45`.
- **Strings:** `accepted: 'Offer / Moving Forward'` — a slash-pair, half of it generic HR
  ("moving forward" appears nowhere in the research corpus; the industry sentence is *offered
  representation*); `declined: 'Not moving forward'` overridden to `'Passed'` at `:63-66` but still
  the base label reaching `getStatusMeta` callers and both bulk/single decline modals
  (`DeclineReasonModal.jsx:74-76`: *"This will mark **N submissions** as not moving forward"*);
  `development: 'New Face — Development'` collapses two boards R2 §6.5 says not to hard-code as one.
- **Fix:** `accepted: 'Representation offered'`, `declined: 'Passed'` as the single label (the
  override already proves this is the intended word), and let the development label name whichever
  board the agency actually declared.

---

## Coined / internal terms encountered

| Term | Where | Verdict | Translation |
|---|---|---|---|
| **Dossier** | `TalentFullView.jsx:41,98,161`; `dossier/*` | **translate** | "the record" / "the submission" |
| **Season memory** | `dossier/SeasonMemory.jsx:76` (Sheet title) | **translate** | "Since they last applied" |
| **Readout band / readouts** | `ReadoutBand.jsx:70` (`aria-label="Talent readouts"`) | translate | "At a glance" (or drop the label) |
| **The desk / on the desk** | `ApplicantsPage.jsx:1260` | **keep** | native booker speech |
| **The book / ledger view** | `ApplicantsPage.jsx:1237,1247` | **keep** | "book" for the photo grid is a stretch but reads well; "ledger" is honest |
| **Review room / screening room** | `ReviewRoom.jsx:643-648`, `ApplicantsPage.jsx:1650` | keep | plausible house language |
| **House note** | `ReviewRoom.jsx:969,1102` | **keep** | reads exactly like an agency's own word |
| **Standing** | `StandingRail.jsx:105`, `ReadoutBand.jsx:75` | keep | good, unambiguous |
| **Command center** | `SetupPage/index.jsx:332` | **translate** | "the desk" |
| **Commissioned** (of the agency) | `SetupPage/index.jsx:324` | **translate** | "open" / "live" |
| **Qualification call** | `AgencyRequestsPage.jsx:16,148` | translate (staff-only) | "intro call" |
| **Triage** | `AgencyRequestsPage.jsx:15` (filter); code comments throughout | hide (staff-only) | "In review" |
| **Pipeline / stage** | see L6-17 | **translate** | "the desk", "submissions", "decision" |
| **Match** | `ApplicantsPage.jsx:1567`; `OverviewPage.jsx:103` | **remove** | nothing scores fit |
| **Wrapped** (of a board) | `CastingPage.jsx:240` | translate | "Closed" / "Past" |
| **Board rack** | `CastingPage.jsx:228` ("The board rack is empty.") | keep | pleasant, harmless |
| **Grainient** | `pages/Grainient.jsx` (Discover chrome) | hide | visual-only, never a label |

---

## Consistency variants

| Concept | Variants seen | Locations |
|---|---|---|
| The inbound person | "submission" · "applicant" · "talent" · "application" | page title `Submissions` (`ApplicantsPage.jsx:305`), route `/submissions` + redirects from `/inbox` and `/applicants` (`App.jsx:158-160`), file `ApplicantsPage.jsx`, component `ApplicantsZone.jsx`, docket "applicants awaiting review" (`overviewData.js:126`), strip empty state "No new applicants to preview" (`TalentStrip.jsx:92`), BoardSelect "Every open application, across boards" (`BoardSelect.jsx:53`) |
| Invite to a first meeting | "Go-see requested" · "Invite to a go-see" · "Invite to meet" · "Invite to a meeting" · "Meeting" · "Meeting requested" | `ApplicantsPage.jsx:671`; `ShortcutHelp.jsx:17`; `ReviewRoom.jsx:1169`; `DecisionDock.jsx:111`; `StatusText.jsx:41`; `notifications.js:330` |
| Decline | "Pass" · "Passed" · "Not moving forward" · "declined" · "Application closed" | `applicantLifecycle.js:104`; `StatusText.jsx:65`; `StatusText.jsx:45` + `DeclineReasonModal.jsx:74`; `inbox.js:1945`; `notifications.js:342-349` |
| Ask for more material | "Request digitals" · "Request more digitals" · "Requested more digitals" · "More digitals" · "More materials requested" · "Ask for the missing frames" · "asked for more" · "shortlisted you — a few more things" | `ReviewRoom.jsx:1166`; `DecisionDock.jsx:110`; `ApplicantsPage.jsx:670`; `StatusText.jsx:40`; `notifications.js:326`; `DigitalsSet.jsx:117`; `email.js` (`sendMaterialsRequestedEmail`); `materials.js:505` |
| Offer representation | "Offer" · "Offer representation" · "Representation" · "Offer / Moving Forward" · "Representation offer recorded" · "Representation offered (bulk)" | `applicantLifecycle.js:98-103`; `ReviewRoom.jsx:1221`; `ReviewRoom.jsx:1127`; `StatusText.jsx:36`; `inbox.js:1691`; `inbox.js:2077` |
| Age of a minor | "Under 18" (band) · "Age 16" (exact) · `age_band: 'under_18'` · CSV `Age` column | `dossierModel.js:114`, `ComparisonOverlay.jsx:48` · `ReviewRoom.jsx:765` · `submission-profile.js:102` · `inbox.js:3481` |
| A minor's body measurements | withheld · shown · shown · shown | `ReviewRoom.jsx:139-142` · `DossierPlate.jsx:150` · `comparison.js:134` · `inbox.js:3455` |
| Board | agency division (setup, BoardSelect, "File to a board") · per-brief board that closes and wraps (`/signing`) | `chapters.js:74` vs `CastingPage.jsx:203-240`, `overviewData.js:95-104`, `ApplicantsPage.jsx:414` |
| "Pipeline" | 7 user-visible occurrences | see L6-17 table |

---

## Working well (preserve)

1. **The triage verb set.** Shortlist / Pass / Keep on file / Request digitals / Invite to meet /
   Offer representation (`ReviewRoom.jsx:1150-1226`) is the closest thing to a real agency's own
   vocabulary I have seen in software, and "Pass" (not "Reject") matches R4 §2.4 exactly.
2. **The decline-reason taxonomy** (`src/domains/agency/services/decline-reasons.js`). Four of five
   reasons describe the agency's situation and never the person, "No reason" is first and default,
   and the reviewer is shown the verbatim sentence the talent will read before sending. The file's own
   rule — *"'Our board is full' is a fact about the agency. 'Not conventionally attractive enough' is
   a judgement about a human being"* — is the right rule, and nothing in the list says "does not meet
   our standards" or touches body or age.
3. **Auto-close, and its refusal to fake a verdict.** `closed_no_response` with `auto_closed_at`,
   `user_id: null` on the activity row, and the talent copy *"{agency} did not respond within its
   review window. Treat this as a pass"* — this is R0 §24 implemented exactly, and it is more honest
   than anything in the industry sample except Storm and Bridge.
4. **The minor access system.** Guardian grant with expiry, per-agency revocation, an expiry sweep on
   every request, a full disclosure purge on revoke, and a named permission
   (`talent.view_minor_submissions`). Only its coverage gaps are wrong (L6-03, L6-04) — the machinery
   is right.
5. **`RepresentationRecord`** (`dossier/RecordPanels.jsx`) — mother agency vs placement, per-market
   scope, exclusivity, "Exclusive — a placement needs releasing first", and names shown only where the
   talent chose to disclose. This is R2 §1.5 rendered correctly, and it is the model `represented`
   (L6-05) should be reconciled with.
6. **`measurementProvenance`** (`dossierModel.js:190-199`) — *"Self-reported · never confirmed"*, with
   the comment explaining that the verified branch was deleted because the product cannot produce it.
   Exemplary.
7. **The pick list** (`client/src/domains/events/pages/PickListPage.jsx`) — Pick / Maybe / Pass,
   "Send my list", "picked · maybe · passed", compensation stated in the masthead. Matches AgencyPin's
   "Interested / Maybe / Not interested" (R2 §1.7) and R4 §2.3's shortlist→lineup model.
8. **`ComparisonOverlay`'s no-ranking rule** and its stated reasoning; and its correct use of the age
   band and `withheldForMinor`.
9. **Setup's `AGENCY_TYPES`** — Mother agency / Market agency / Management, with hints that describe
   scouting-and-placing vs booking-in-market. R2 §1.5 in a radio group.
10. **The response-window control** (`settings/NotificationsPanel.jsx:107-137`) — plain days, 0 turns
    it off, and the note says exactly what each value does to the talent.
11. **"Route — We invited them / They came to us"** (`StandingRail.jsx:129`) and
    **"Before you decide"** (`ReviewRoom.jsx:180-200`) — flags as a titled group of plain sentences
    rather than badges, which is what an agency actually writes.
12. **`buildConfirmationStats` drops weight entirely** (`ReviewRoom.jsx:136`, *"weight (never
    shown)"*) — R3 §4.6 and R2 §4.1 both confirm weight is absent from every modern fashion board.

---

## Dead or unreachable code carrying issues

- **`under_review` status.** Present client-side in `STATUS_MAP` (`ui/StatusText.jsx:31`), the compact
  override (`:82`), and `IN_FLIGHT_STATES` (`applicantLifecycle.js:29`), and offered as the
  "In progress" filter. **Nothing writes it server-side** — grep `under_review` under `src/` returns
  zero hits, and it is not in `WRITABLE_APPLICATION_STATUSES`. The "In progress" filter therefore
  matches only `requested_more` / `meeting_requested`.
- **`.ap-score-cell`** — `ApplicantsPage.css:557` styles a cell no JSX renders; the paired header
  ("Match") is live. See L6-09.
- **`STATES` option/booking vocabulary** (`statusConfig.js:100-113`): `option`, `firstoption`,
  `secondoption`, `onhold`, `booked`, `bookout`, `released` are unreachable — the only writer of
  `profiles.availability_status` (`src/domains/talent/routes/availability.js:118`) writes
  `available | limited | unavailable`, two of which fall through to the wrong label (L6-02).
- **`LADDER` / `getLadderIndex`** (`statusConfig.js:82-90`, New Faces → Development → Main Board):
  no importer outside the barrel and its own test. The one place the ladder would matter — after
  representation is recorded — has no surface (`/dashboard/agency/roster` redirects away).
- **`STAGE_MAP.archived`** (`statusConfig.js:71`) and the `archived` status generally: writable, and
  `POST /applications/:id/archive` exists (`inbox.js:1990`), but no UI action reaches it and no
  lifecycle tab shows it. An archived submission is invisible on the desk.
- `src/domains/internal/routes/event-funnel.js` is mounted (`src/app.js:895`) with no page.

---

## Coverage

**Read in full:** `client/src/domains/agency/pages/ApplicantsPage.jsx` (+`.css` grid rules),
`components/review/ReviewRoom.jsx`, `components/decline/DeclineReasonModal.jsx`,
`DeclineReasonFields.jsx`, `constants/applicantLifecycle.js`, `components/ui/StatusCell.jsx`,
`ui/StatusText.jsx`, `components/status/statusConfig.js`, `AvailabilityCell.jsx`,
`components/ComparisonOverlay.jsx`, `components/ShortcutHelp.jsx`, `components/BoardSelect.jsx`,
`pages/TalentFullView.jsx`, all of `components/dossier/*`, `pages/OverviewPage.jsx`,
`components/overview/overviewData.js`, `TalentStrip.jsx`, `components/TalentPanel.jsx` (status
stepper), `pages/SetupPage/index.jsx` + `chapters.js`, `pages/settings/NotificationsPanel.jsx`,
`ExportWebhookPanel.jsx`, `settings/openCallBrief.js`, `pages/internal/AgencyRequestsPage.jsx`,
`domains/events/pages/PickListPage.jsx` + `PickCard.jsx`.
Server: `src/domains/agency/routes/inbox.js` (status writes, bulk paths, CSV export, recent-applicants,
compare), `routes/materials.js`, `routes/talent-dossier.js`, `routes/agency-api-guard.js`,
`services/decline-reasons.js`, `services/comparison.js`, `services/talent-dossier.js`,
`services/minor-submission-access.js`, `services/export-webhook-dispatch.js`,
`src/shared/constants/application-status.js`, `open-call-intake.js`, `submission-tracker.js`,
`src/shared/lib/application-auto-close.js`, `talent-age.js`, `submission-profile.js`,
`profile-visibility.js`, `submission-retention.js`, `src/shared/services/notifications.js`,
`src/shared/lib/email.js` (subjects), `src/domains/internal/services/agency-request-review.js`.

**Skipped, with reason:** `/dashboard/agency/signing` (CastingPage / CastingDetailPage / board lanes)
and `/dashboard/agency/discover` — groups 18 and 19, another lane; read only far enough to establish
the board homonym in L6-12 and to confirm the Discover field whitelist is not the webhook's.
`/dashboard/agency/events`, `/team`, `/messages`, `/activity` — groups 20–24, not this lane.
Talent-side surfaces (`applicationStatus.js`, `submissionTracker.js`, the ApplyPage) read only to
verify what the agency's writes cause the talent to see. Per the brief's hard rules I did not read
`.claude/skills/**`, `docs/audits/**`, `tasks/**`, or any `DESIGN.md`/`CLAUDE.md` as a vocabulary
authority; `divisions.js` cites `.claude/skills/industry/reference/standards.md` as its taxonomy
source and I did not open it — the division labels are judged against R2 §2 only.
