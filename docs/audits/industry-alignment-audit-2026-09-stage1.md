# Industry alignment audit, Stage 1 pre-launch

**Date:** 2026-09-03
**Companion:** `industry-audit-2026-09-stage1/STRATEGY-RECONCILIATION.md` reconciles this report with the August strategy documents.
**Scope:** every user-facing surface and state of pholio-app, talent and agency sides, plus
generated artefacts: comp-card PDFs, digitals sheets, the off-Pholio export ZIP, CSV export and
webhook, transactional emails, in-app notifications, the public portfolio page, and the Apple
Wallet pass.
**Question:** would an experienced agent, booker, scout, casting professional or working model
use Pholio and feel at home, or stop and think "why is it called that", "that's not how this
works", or "who built this without understanding the industry"?
**Authority:** none of Pholio's own language files, prior audits, lessons or vocabulary. The
industry model was built fresh from primary sources on the day of the audit (section 2 and
`industry-audit-2026-09-stage1/research/`). The product's existing vocabulary was itself under
audit.

## 0. Method

1. **First principles first.** Before any research, a hypothesis model of how the industry
   operates was written down with confidence tags (`research/R0-first-principles.md`), so the
   research could refute it rather than confirm it.
2. **Primary-source research, five lanes in parallel:** agency intake and submissions (R1, 27 live
   intake surfaces), agency organisation and representation (R2, 18 agencies and 5 software
   vendors), materials and stats (R3, 20 agency pages, 7 printers, 5 industry bodies), casting,
   options and event calls (R4, 37 sources), and law, minors and trust (R5, roughly 50 sources
   including NY Labor Law Art. 36 and CA Labor Code §1700-1704 read from the statutes). Every
   claim is labelled primary or secondary with URL and access date. Where sources disagree or are
   thin, the file says so.
3. **Reconciliation** of the hypotheses against the evidence (`research/R0-reconciliation.md`):
   four priors were wrong and are corrected in section 2.
4. **A surface map** of every route, template, email, notifier, export and constants file
   (`SURFACE-MAP.md`, 34 groups), so no surface was audited from memory.
5. **Eight audit lanes in parallel**, each reading the actual code paths behind every string and
   state, forbidden from consulting Pholio's language skills or prior audits, required to confirm
   reachability and to trace the data behind every claim (`lanes/`). Lenses: terminology, concept,
   state, data, claim, consistency, leak, minors, scope.
6. **Lead verification.** Every P0 in this report was re-checked by hand at the cited lines
   before inclusion; corrections to lane claims are noted inline (for example, the CSV export does
   null a minor's contact, but prints their measurements and exact age).
7. **Integration** into this report: verdict, industry model, P0s, product-model findings, the
   P1/P2 catalogue, the coined-term inventory, the consistency map, what to preserve, and the
   recommended order. Nothing in the product was modified.

Severity: **P0** a professional would distrust the product, or there is legal or compliance
exposure. **P1** a real user would hit it and be confused or misled. **P2** polish. Lane IDs
(L1-01 and so on) point to the full write-ups in `lanes/`; research IDs (R1 §4 and so on) to the
evidence in `research/`.

## 1. Verdict

**Would an experienced agent, booker, scout, casting professional or working model feel at home
in Pholio today? On the vocabulary, mostly yes. On what the product asserts and what it does with
a minor's data, no. Stage 1 should not open to outside testers until the P0 list is closed.**

The surprising result of a fresh, first-principles audit is how much of the trade Pholio already
speaks correctly. The nouns are right: book, digitals, comp card, tearsheet, test, board, new
faces, mother agency, placement, bookout, shortlist, pass, keep on file, package (in the agency
sense), pick list, lineup. The HR register that sinks most talent software is almost absent:
zero user-facing uses of "candidate", "interview", "recruiter", "hire", "gig" or "rejected".
The event-casting surface (pool → designers → lineup, pick/maybe/pass, talent-only confirmation,
18+ enforced, designers never see contact or minors) is a faithful implementation of what
fashion-week organizers describe in their own copy, and is better than the tools those organizers
currently use. The decline-reason taxonomy, the auto-close that records silence as silence, the
per-purpose likeness ledger, the Studio+ line "Nothing an agency sees or receives changes with
it", and the checkout disclosure "Pholio is not a talent agency" are the exact sentences the
statutes and trade bodies say a legitimate platform must be able to say.

The failures are of three kinds, and they sit underneath the words:

1. **The product asserts what it cannot know.** The moment a talent presses send they are told
   "Under Review" and "the agency is reviewing"; the confirmation screen invents a named agency's
   batch process and promises a reply; a request for more photos emails "{Agency} shortlisted
   you"; a readiness score awards an "Agency grade"; every submission a booker sees is labelled
   "Editorial" from a column the API never selects; a talent who books out is shown to bookers as
   "Available"; and a live mock OAuth path writes random follower counts to the profile and calls
   the account "verified". Each of these is the FTC v. Explore Talent fact pattern in miniature:
   implying a third party's interest or a fact about the person that no data supports.
2. **Minors are modelled as adults with a consent flag.** The trade rule (BFMA) is that no one
   under 18 is measured beyond height, full stop. Pholio instead asks a guardian to authorize
   collecting bust, waist and hips, and once collected the numbers travel to the submission
   snapshot, the booker's dossier, the comparison view, the CSV export, the off-Pholio STATS.txt,
   the public portfolio (beside the words "Under 18"), and the JSON embedded in every downloaded
   comp card. The export webhook sends a minor's email and phone with no redaction. A kids comp
   card labelled "Guardian Contact" prints the child's own phone and Instagram. The Profile
   accepts any past date of birth. None of this is a wording problem.
3. **A few core objects are the wrong shape.** Representation is a Kanban column one agency
   member can drag into, producing an email that says "Representation confirmed", while four
   different tables hold four different answers to who represents the person. The comp card is
   composed from every image including digitals, and prints a represented model's personal phone
   under the agency's name. "Board" means a division, a Kanban screen and a client package on the
   same page. The Wallet pass is an identity credential built from self-declared facts. The
   submission gate demands bust, waist and hips for every agency, board and age, when the top of
   the market asks for height and three photos.

The good news is structural: the correct model usually exists somewhere in the codebase
(the composed comp card's kids track, the `talent_representations` table, the `bookouts` table,
the event confirmation that only the talent can write, the canonical stats formatter) and the
failing surface is the one that bypasses it. Most P0 fixes are small diffs that route a surface
through the model Pholio already has.


## 2. The industry model this audit tests against

Built fresh on 2026-09-03 from primary sources (27 live agency intake surfaces, 18 agency
board/profile sites, 5 agency-software vendors, comp-card printers, casting platforms, 14
event-casting organizers, NY Labor Law Art. 36 and NY DOL, CA Labor Code §1700-1704, BFMA,
FTC actions), not from Pholio's own language files. Full evidence with URLs and access dates
is in `appendix/research/R1`-`R5`; my pre-research hypotheses and where they were wrong are in
`R0-first-principles.md` and `R0-reconciliation.md`.

The facts that carry the most weight in the findings:

1. **Intake is a first screening of a look, and silence is the designed outcome.** Agencies
   ask for 3-4 plain phone photos (close-up, profile, waist-up, full-length), height, date of
   birth, city, socials, and a guardian for under-18s. Top fashion boards (Storm, Premier,
   Models 1, Society, IMG) ask for height only; full bust/waist/hips appear on about half of
   forms, skewed to US commercial, curve and Asia. Nobody promises a reply; 13 of 14 event
   organizers and every top agency contact only the selected. "We'll keep you on file" appears
   on zero 2026 forms; the modern promise is deletion on a clock (Storm 30 working days,
   Society 6 months). (R1 §1, §3, §4; R4 §7)
2. **A board is a desk, not a category.** Storm and MiLK publish a separate phone number per
   board; Select's CMS type is literally `ModelBoard`. Boards run on two axes, segment
   (Women / Men / Curve / Classic / Kids / Talent) × career stage (New Faces or Development →
   Main → Image). Assigning a board is a routing, pricing and career-stage decision made by the
   agency. "Board" is therefore a taken word. (R2 §1)
3. **Signing is a discrete contractual act the agency initiates.** Offer of representation →
   contract → placed on a board. New York now defines "Exclusive Representation" and "deal
   memo" in statute. A model is commonly represented by several agencies across markets with a
   mother agency; that split is a ledger primitive in agency software. (R2 §1.4-1.5; R5 §3)
4. **Four materials, four rule sets.** Digitals (unretouched, perishable, never in the book),
   the book (curated, 6-20 images), the comp card (a derivative of the book: hero + name front,
   3-5 images + stats + the agency's contact on the back), and stats (height first, B-W-H
   contiguous, hair/eyes last, no weight, no adult age, shoe localized, dual units on
   international boards). A represented model's card carries the agency's contact, never the
   model's phone. No agency dates digitals on the image; the "3 months" rule is coaching
   convention, not agency policy. (R3 §1, §4)
5. **Minors are a different data object.** BFMA: measuring anyone under 18 beyond height is
   inappropriate; body, bikini or lingerie photos of minors are unacceptable. The guardian is the
   account holder and the only contact channel; agencies time-box guardian verification and
   delete on failure (Elite 15 days). NY and CA add permits, trust accounts and chaperone rules
   to any work. (R5 §7; R3 §4.7)
6. **Two casting systems share one word.** System A is agency ↔ client: package → request →
   casting/go-see → callback → option (1st/2nd) → confirm → fitting → job, with "released" as the
   neutral exit; the model is not a party. System B is the open event call: application →
   in-person model call → pool/roster → shortlist to designers → confirmed. Event organizers
   say "applicant"; agencies say "submission" or "application". Casting Networks hides most of
   its status ladder from talent on purpose. (R4 §1-3)
7. **The legitimacy line is statutory.** No fee to apply or be seen; no selling of rank, reach
   or "priority review"; no naming an agency as interested unless it is; no "get discovered";
   no verified-"unretouched" claim; the guardian word is "parent or guardian". CA §1703 requires
   a capital-letter notice for any paid service that is not a licensed talent agency. (R5 §6)
8. **What a platform can honestly know** is what was sent, when, to whom, whether it was
   opened or downloaded, and what a recipient recorded. Intent, interest, suitability,
   readiness, likelihood and representation status are not observable facts and must be
   labelled as inference or as someone's declaration. (R0 E21-E24; FTC v. Explore Talent, R5 §5)

Where my own priors were corrected by the evidence: "digitals" is insider and post-signing
vocabulary, not what public forms say ("photos"); "kept on file" is folklore in 2026; the
Fashion Workers Act is Article 36 and its payment term is deal-memo defined, not 45 days; and
agencies want a near-empty pre-signing pipeline, not a rich one. Every finding below cites the
research section it rests on, or says "first principles" when the evidence is silent.

## 3. P0: a professional would distrust the product, or there is legal exposure

Ordered by consequence. Each entry gives the surface as a professional meets it, where it lives,
the industry evidence, and the fix. Lane IDs point to the full write-ups in the appendix.

### P0-1. A minor's body measurements are gated by consent instead of structurally absent
- **What a pro sees:** "Body measurements stay locked until a parent or guardian consents." Then a
  guardian consent page that authorizes "collecting and storing measurements", after which a
  16-year-old's bust, waist, hips and weight fields appear and the readiness checklist marks them
  Required.
- **Where:** `src/shared/lib/talent-age.js:95-97`, `src/domains/talent/routes/profile.js:936-955`,
  `client/src/shared/utils/talentAge.js:63-75`, `views/guardian-consent.ejs:78`,
  `client/src/domains/onboarding/pages/CastingMeasurements.jsx:787`,
  `client/src/shared/utils/profileScoring.js:158-179`.
- **Industry:** BFMA Code of Practice: "inappropriate to measure any young person under the age
  18 except for their height"; body, bikini or lingerie photos of under-18s are "unacceptable".
  Kids boards and kids cards carry age range, height, clothing size, shoe, hair, eyes only.
  (R5 §4, §7 item 5; R3 §4.7; R2 §5.4.) The composed comp-card formatter in
  `src/domains/pdf/composition/stats-formatter.js:508-540` already implements this correctly.
- **Fix:** below 18, remove the body fields from every form and reject them server-side on
  `isMinorProfile` alone. Guardian consent keeps its real jobs: publication, per-agency
  disclosure, contact routing. Copy becomes a policy statement: "Under 18, Pholio records height
  only. Agencies take further measurements in person, with a guardian present."
- Sources: L1-03, L2-01, L3-20, L8-01.

### P0-2. Once collected, a minor's measurements and exact age travel everywhere; the only redaction is a CSS flag
- **What a pro sees:** the review room says "Minor: body measurements withheld", and the dossier
  plate, the compare overlay, the CSV export, the exported STATS.txt, the public portfolio (with
  an "Age: Under 18" row) and the JSON inside every downloaded comp card all print them.
- **Where:** `src/shared/lib/submission-profile.js:110` (snapshot, no minor branch);
  `client/src/domains/agency/components/dossier/DossierPlate.jsx:144-150`;
  `src/domains/agency/services/comparison.js:52-63,134-137`;
  `src/domains/agency/routes/inbox.js:3450-3482` (CSV: `Bust: 82`, `age: 15`, contact nulled);
  `src/domains/spec-registry/export/stats-block.js:97-99`; `views/portfolio/show.ejs:44-68`
  with `src/routes/portfolio.js:305-309`; `src/domains/pdf/routes/pdf.js:2328` passes
  `profile.is_minor`, a column that exists only on `talent_records`, so
  `machine-readable.js:107-122` never redacts; `pdf.js:1994-2032` (digitals sheet) and
  `src/shared/lib/stats-formatter.js:306-385` (public page, fallback card) have no kids track.
- **Industry:** as P0-1. Elite and Storm route everything about a minor through the guardian and
  delete on a clock (R5 §3-4). Publishing "Under 18" beside a child's photos on an indexable URL
  is a safeguarding exposure no sampled kids board takes (R2 §4.2).
- **Fix:** one stats formatter. Give `buildCanonicalStats` the kids track the composed formatter
  already has, keyed on `isMinorProfile`, and route snapshot, CSV, STATS.txt, public page,
  digitals sheet and embedded JSON through it. Replace `profile.is_minor` with
  `isMinorProfile(profile)`. Drop the public age row for minors entirely. Delete the client-side
  `hideBody` once the server no longer sends the fields.
- Sources: L3-04, L6-03, L8-02, L1-05.

### P0-3. The two paths that carry data out of Pholio skip the minor controls
- **What a pro sees:** an agency admin without the minor-viewing permission exports a CSV with
  a 15-year-old's measurements and age; the agency's webhook receives the minor's email and phone.
- **Where:** `src/domains/agency/routes/inbox.js:3167-3620` (`GET /api/agency/export`) never
  calls `applyMinorSubmissionFilter`, although `minor-submission-access.js:41` contracts it to;
  `src/domains/agency/services/export-webhook-dispatch.js:78-102` builds
  `{name, email, phone, city, heightCm}` from `profile` with no minor branch (verified).
- **Industry:** guardian-as-the-only-channel is the most consistent minor rule in the research
  (Elite, BFMA; R5 §7 items 2-3). Once a minor's phone is in a third-party CRM, the guardian grant,
  expiry sweep and revocation purge govern nothing.
- **Fix:** apply the minor filter and the `talent.view_minor_submissions` gate to the export
  route; null email and phone for minors in `buildPayload` and send the guardian channel instead.
- Sources: L6-04.

### P0-4. A child's comp card and Wallet pass carry the child's own contact and identity
- **What a pro sees:** a kids card whose block reads "GUARDIAN CONTACT" followed by the child's
  phone and Instagram handle; a Wallet pass with the child's face crop, full name, exact age and
  height, freely shareable.
- **Where:** `src/domains/pdf/composition/composition-director.js:168-181` (label changes,
  source does not; `guardian_email` exists and is never read; no `guardian_phone` column);
  `src/domains/wallet/services/pass-content.js` and `pass-builder.js` (`sharingProhibited: false`).
- **Industry:** compcard.com: "Never a home address or a child's personal phone number." Elite:
  guardian contact "will be the only ones we will utilise". (R3 §4.3; R5 §7.)
- **Fix:** add guardian name/phone/email to the profile; a kids card prints only those, or no
  block and a blocked export. No Wallet pass for minors until it carries guardian contact, no
  exact age, and `sharingProhibited: true`.
- Sources: L3-03, L3-08.

### P0-5. No minimum age, and a guardian consent that bundles three permissions with no clock
- **What a pro sees:** the Profile accepts any past date of birth. The guardian page asks for one
  signature covering account management, public publication and "AI processing", retains data
  "while the account is active", and never expires if the guardian does not answer.
- **Where:** `client/src/schemas/profileSchema.ts:52-57` (only "cannot be in the future");
  `views/guardian-consent.ejs:77-116`; the image-analysis consent at Settings omits
  no-training, retention, provider and revocation terms (L2-06).
- **Industry:** minimum ages are published everywhere (Storm 15, IMG 16 with verifiable guardian
  consent; under-13 triggers COPPA, the charge in FTC v. Explore Talent). Elite deletes a minor's
  data if the guardian does not approve within 15 days. NY FWA requires digital-replica consent to
  be separate, written, and scoped; Storm's AI code requires prior written consent and no training
  use; the industry default for minors is not to run AI at all. (R5 §3, §5.6, §7 items 1, 4, 14.)
- **Fix:** enforce a minimum age on every DOB write; split the guardian consent into separate
  affirmative acts; give the guardian request a hard expiry with deletion on lapse and state it;
  do not offer image AI to minors.
- Sources: L2-05, L1-04, L2-06.

### P0-6. "Under Review" is asserted the instant the talent presses send
- **What a pro sees:** status "Under Review", "The agency is reviewing — we'll notify you the
  moment this changes", a bell item "{Agency} is reviewing your submission", an Overview KPI
  "In review", and a confirmation screen that says "{Agency} reviews new submissions in batches…
  a reply usually takes anywhere from a few days to a few weeks… You'll be notified the moment
  {Agency} responds." The agency's own view of the same row says "Submitted".
- **Where:** `client/src/domains/talent/utils/applicationStatus.js` (`pending`/`submitted` →
  "Under Review"); `src/shared/services/notifications.js:305-312, 404-411`;
  `client/src/domains/talent/pages/ApplyPage/ApplyExperience.jsx:4469`; Overview KPI via
  `applicationStatus.js:58-76`. The status is written by the submit handler; `applications`
  records `viewed_at`, which Intel already reads honestly, but nothing here consults it.
- **Industry:** "Application status: Under review" is the exact string R1 §8 names as implying a
  service level no agency offers; ONE Management forbids status enquiries; 13 of 14 event
  organizers contact only the selected (R4 §7). Naming an agency as engaged when it is not is the
  FTC v. Explore Talent pattern (R5 §5.5). It also contradicts the product's own auto-close: you
  cannot say "they are reviewing" on day 0 and "no response" on day 30 and be believed on either.
- **Fix:** say only what Pholio observed: "Sent 3 Sep. No reply yet." with the honest frame
  ("Most submissions get no reply. If an agency is interested, you'll hear from them."). Add a
  real "Opened by {agency} on {date}" state fed by `viewed_at`, and nothing else. Delete the
  invented process paragraph.
- Sources: L4-01, L4-02, L5-01, L2-02, L8-04.

### P0-7. "Represented" is one agency member's drag, and it emails "Representation confirmed"
- **What a pro sees:** a Kanban column "Represented" with a card action "Mark represented"; the
  talent receives "Representation confirmed by {Agency}" and a status band "Signed"; the offer
  email is headlined "{Agency} wants to sign you" while its own body says nothing is agreed.
  Meanwhile Discover may still show the same person as "Seeking representation".
- **Where:** `src/domains/agency/routes/inbox.js:1698-1760`; `application-status.js:34-46`;
  `client/src/domains/agency/pages/CastingDetailPage.jsx:41-46,331-336`;
  `src/shared/lib/email.js:229`; `src/shared/services/notifications.js:344-347`;
  `src/shared/lib/pholio-email/text.js:183`; `templates-submissions.js:59`. Four stores of the
  same fact: `applications.status`, `talent_representations` (talent-only writes),
  `roster_board_standings`, `profiles.current_agency`.
- **Industry:** representation is a written, scoped, fiduciary contract (agency, market,
  exclusivity, term); the agency offers, the model accepts; NY Art. 36 defines "Exclusive
  Representation" and caps terms (R2 §1.4, §3.3; R5 §1). A platform can only record who attested
  what (R0 E22). The event slot in the same codebase already gets ownership right: `confirmed`
  is talent-writable only.
- **Fix:** the agency records an offer; "Represented" requires the talent's acceptance and writes
  a scoped `talent_representations` row with `attested_by`; every reader (Wallet, public page,
  Overview, Discover, roster) reads that one table. Until then, remove `represented` from the drag
  targets and change the email to "{Agency} recorded an offer of representation".
- Sources: L4-05, L5-05, L6-05, L7-01, L8-05.

### P0-8. A request for more photos emails "{Agency} shortlisted you"
- **Where:** `src/shared/lib/pholio-email/templates-materials.js:70-121` on the identity-backed
  branch of a material request; the account-holder branch of the same click says "asked for
  more". No shortlist precondition exists in the handler.
- **Industry:** "shortlisted" is the one status word agencies actually publish (Storm), and it
  carries meaning to a model (R2 §2, §8). Asserting it on a booker's behalf when they did not
  record it is the same class as P0-6.
- **Fix:** one template for one event: "{Agency} asked for more photos."
- Sources: L5-04, L6-06.

### P0-9. A talent who books out is shown to bookers as "Available"
- **Where:** talent writes `available | limited | unavailable`
  (`AvailabilitySection.jsx:27-31`); the agency readout maps through
  `client/src/domains/agency/components/status/statusConfig.js:88-103`, whose `STATES` has no
  `limited` or `unavailable` key, and `getState` falls back to `STATES.available`, rendered in
  the same green palette as "Booked" and "1st Option".
- **Industry:** availability is date ranges on a chart (bookouts), never a global toggle
  (R2 §2.1); whatever it is, rendering the inverse of the declaration is indefensible. The
  `bookouts` table already exists with the right word.
- **Fix:** render availability from dated bookouts only ("Booked out 12-19 Oct" / "No bookouts
  recorded"); if a coarse flag survives, map all three values and fall back to "Not declared",
  never to a booking-desk state.
- Sources: L6-02, L8-03, L2-14.

### P0-10. Every submission a booker sees is labelled "Editorial"
- **Where:** `client/src/domains/agency/pages/ApplicantsPage.jsx:119,141,176`,
  `ReviewRoom.jsx:385`, `overviewData.js:180`, every signing-board card (L7-05): all default
  `archetype || 'editorial'`, and `/api/agency/applications`, `/details` and
  `/overview/recent-applicants` never select `archetype`.
- **Industry:** board and market fit is the first thing a booker reads on a submission (R1 §1).
  A desk where a curve, a fit, a commercial and a kids submission all read "Editorial" tells the
  booker the tool has no data.
- **Fix:** show the board(s) the person applied to (already in `submissionPackage.boards`), or
  nothing. Never a default.
- Sources: L6-01, L7-05, L8-09.

### P0-11. The product awards agency verdicts and ranks that no data supports
- **What a pro sees:** readiness bands "Agency grade", "ready for agency review", "Your profile
  matches what bookers look for when shortlisting" from field-presence points; "Agency visibility
  pending — complete essentials to appear in search" when discoverability reads only a Settings
  toggle; "Top matches today" over `ORDER BY created_at DESC`; a bell that rewrites repeat
  profile views as "showed repeat interest".
- **Where:** `client/src/shared/utils/profileScoring.js:404-412`,
  `ProfileReadinessSidebar.jsx:258`; `ProfilePage/index.jsx:874` vs
  `src/shared/lib/profile-visibility.js:138-145`; `inbox.js` overview query (L6-07);
  notifications (L2-20).
- **Industry:** "Your profile is 87% complete" and "3 agencies viewed your profile" are on R1's
  list of what makes a booker flinch; predicting suitability or interest is on R5 §6's MUST NOT
  list. Fit is the agency's judgement per board and per season (R4 §1).
- **Fix:** completeness is a checklist ("3 of 5 required items"), never a grade; the visibility
  line states the mechanism ("You are not in agency search. Turn on Discover in Settings.");
  "Top matches" becomes "Newest"; views are counted, never characterized.
- Sources: L2-03, L2-04, L2-20, L6-07.

### P0-12. A live mock OAuth path writes random follower counts and calls the account "verified"
- **Where:** `src/domains/talent/routes/social-oauth.js:19-80`, mounted unconditionally at
  `/api/talent/socials/oauth` (`routes/index.js:82`), no environment gate (verified);
  `Math.floor(Math.random() * 240000) + 10000` written to `social_accounts` and
  `profiles.social_reach`; toast "Instagram account verified!"; agencies can filter on
  `min_social_reach`.
- **Industry:** invented numbers are the one thing a platform may never show (R5 §6); follower
  counts are a real booking input on creator boards (R2 §2).
- **Fix:** remove the route from production builds or make it return an error until a real
  provider is wired; purge any `social_reach` values written by it; never display "verified"
  for an unverified connection.
- Sources: L5-02.

### P0-13. Pholio certifies things it did not verify: "Unretouched", and an AI "casting verdict" on the card
- **Where:** `src/domains/pdf/templates/digitals-sheet.ejs:163` prints "Unretouched · for
  agency review" on every digitals sheet, backed only by an `image_type` tag the talent or the
  classifier sets; `compcard-standard.ejs:388,461` prints an AI archetype verdict in quotation
  marks on the back and an archetype badge on the front of the fallback card.
- **Industry:** no agency or platform uses "unretouched" as a verified claim; the rule is an
  instruction to the model (R3 §6; R5 §6). A comp card carries images, name, stats and the agency
  block; nothing else (R3 §4.2). A machine's opinion of a person's face on a leave-behind is a
  "who built this" tell of the first order.
- **Fix:** "Declared unretouched by the talent" or nothing; strip the verdict and badge from the
  fallback template (or retire the fallback in favour of the composed card).
- Sources: L3-05, L3-06.

### P0-14. The comp card is cut from every image including digitals, and prints a represented model's personal phone
- **Where:** `src/domains/pdf/generator.js:119-134` loads the pool with no `image_type` filter;
  `comp-card-selector.js:90-115` scores a digital headshot as the top hero; three UI strings
  promise "from your book". `composition-director.js:123-135,155-166`: the represented branch
  prints `REPRESENTATION / {Agency} / {city} · @handle · {phone}`; `showContactBlock` is set from
  typographic tone, never from representation; a stale comment in `settings.js:109` asserts the
  PDF never prints contact.
- **Industry:** digitals never appear in the book or on the card; the card is a derivative of the
  book (R3 §1, §3). A represented model's card carries the agency's contact, never the model's
  phone; the agency block is what makes it a comp card rather than a flyer (R3 §4.3, §7.2-7.3).
- **Fix:** restrict the pool to book, tearsheet, campaign and test frames; when empty, block with
  a truthful reason and offer the digitals sheet instead. Three booking-block states: represented
  (agency name + agency contact, city only), freelance (own contact), minor (guardian only), with a
  guardrail that fails export when a represented card carries a personal channel.
- Sources: L3-01, L3-02, L1-16.

### P0-15. The first words a talent reads are the scam register, and the pre-auth flow carries no safety copy
- **Where:** `client/src/domains/onboarding/pages/CastingEntry.jsx:521` "Let's get you *seen*".
  A grep of onboarding, opencall and auth for "no fee", "never charge", "nude", "lingerie",
  "impersonat" returns nothing; the one correct sentence ("Pholio is not a talent agency and does
  not guarantee representation, bookings, or income") lives in the billing modal.
- **Industry:** "get seen / get discovered" is the phrase BFMA and the FTC use to characterize the
  online modelling scam; 11 of 24 agency intake pages carry a four-part safety block (no fee, no
  nude or lingerie photos, our real domain, tell a trusted adult); IMG puts it before the age
  question (R1 §5; R5 §5-6).
- **Fix:** rename the beat to what happens ("Create your account" / "Start your submission");
  add the four-line safety block before the DOB step and at the top of the open-call apply page;
  state retention.
- Sources: L1-01, L1-02, L1-17.

### P0-16. The public portfolio publishes weight, gender, ethnicity, age band and plan tier
- **Where:** `views/portfolio/show.ejs:50-68,169-181,236-250`; `:19` prints "Studio+";
  reachable at `/portfolio/:slug` for any public profile. The canonical formatter
  (`src/shared/lib/stats-formatter.js:341-364`) deliberately excludes weight; the template re-adds
  it by hand.
- **Industry:** weight is absent from every adult board sampled; age and gender are never public
  fields (the board carries gender); ethnicity is GDPR Art. 9 special-category data; a plan tier
  is never a public fact (R3 §4.6; R2 §4.1-4.2; R5 §4).
- **Fix:** render `stats.fields` only; delete the weight, gender, ethnicity, age and tier lines.
- Sources: L1-05, L3-11, L1-26.

### P0-17. The submission gate requires bust, waist and hips from everyone, and hips from men
- **Where:** `client/src/domains/talent/pages/ApplyPage/ApplyExperience.jsx:1683-1688`
  (`hasMeasurements` requires height, bust/chest, waist and hips for every agency); the open-call
  intake (`core_measurements`, free text, unit-less) asks every applicant for bust and hips (L1-12,
  L8-21); menswear never displays hips (L8-08).
- **Industry:** Storm, Premier, Models 1, Society and IMG ask for height only at first
  submission; full sets appear on roughly half of forms (R1 §4.2). A 15-year-old with guardian
  consent cannot submit at all under this gate (P0-1).
- **Fix:** required fields come from the target agency's published requirements, with height and
  photos as the only universal gate; menswear asks chest, waist, inseam; minors are height only.
- Sources: L4-03, L1-12, L8-08, L8-21.

### P0-18. "Signing" and "Signing board" collide with the industry's word for a division, on the primary agency screen
- **Where:** nav `agencyNav.js:26` "Signing"; `CastingPage.jsx:190-234` "Signing boards gather
  the talent you are considering for a client or a season", "The board rack is empty";
  `CastingNewModal.jsx:149-157` offers "Client package" vs "Division board" as board kinds;
  `permission-groups.js:46`.
- **Industry:** a board is a desk with its own bookers and phone line; Select's CMS type is
  `ModelBoard`. R2 §8 calls "signing board" actively harmful: it parses as "the division called
  Signing". Pholio uses all three senses on one screen: division, Kanban screen, client package.
- **Fix:** boards stay divisions. This screen becomes "New Faces" (intake review) and "Packages"
  (client proposals), or one "Casting" screen with those two kinds. Drop "signing" from the nav;
  agencies sign, tools do not.
- Sources: L7-02, L5-19, L8-11.

### P0-19. "Pholio ID" is an identity credential built from self-declared facts
- **Where:** `src/domains/wallet/services/pass-content.js` ("the talent's identity credential in
  Wallet"), fields REPRESENTATION / BOOKINGS / MOTHER AGENCY / PLACEMENT / PORTFOLIO /
  MEASUREMENTS UPDATED; representation comes from free text the talent typed
  (`representations.js:174-188` inserts `status: "active"` immediately); fallback "Seeking
  representation" / "Direct".
- **Industry:** no agency issues a model ID; the only Wallet precedent is a union card, which is
  an eligibility document. A digital comp card as PDF or link is normal; a credential-shaped pass
  reads invented, and "ID" implies verification that does not happen (R3 §5).
- **Fix:** either retire the pass, or rename and reshape it as what it can honestly be: a digital
  comp card (name, agency block if attested, stats, QR to the book), labelled "declared by talent"
  where facts are self-declared, never for minors (P0-4).
- Sources: L3-07, L8-23.

### P0-20. Developer remediation instructions ship as user-facing error copy
- **Where:** `src/domains/talent/routes/media.js:913` ("Set R2_BUCKET and Cloudflare R2
  credentials in Netlify environment variables"), plus "run npm run migrate" and "redeploy"
  variants reaching talent and bookers on the Media and Profile pages, ungated by environment.
- **Why it is P0:** a booker whose upload fails and reads a deployment instruction concludes the
  product is a prototype. It is the fastest "amateurs built this" tell in the audit.
- **Fix:** map infrastructure errors to one user string ("Uploads are unavailable right now.
  Try again in a few minutes.") and log the remediation server-side.
- Sources: L5-03, L1-23.

### P0-21. An OnlyFans field and a nudity "content boundaries" picker sit on the modelling profile
- **Where:** `client/src/domains/talent/pages/ProfilePage/VerifiedAdultSection.jsx:32,385`.
- **Industry:** seven sampled agencies state in their intake copy that they never ask for nude or
  lingerie photos, and define their legitimacy against exactly this register (R1 §5.1; R5 §5.1).
  A booker who sees "Artistic Nudity" and "OnlyFans" on a submission profile stops reading.
- **Fix:** remove the section from the modelling profile. If adult-creator work is a deliberate
  product line, it is a separate profile type never visible on agency surfaces.
- Sources: L2-07.

## 4. Beneath the words: where the product model is not how the industry works

These are the findings that no label change fixes. Each names the concept Pholio built, the
concept the trade runs on, and the shape a credible version would take. P0 items above are
referenced rather than repeated.

### PM-1. Pholio models the pre-signing phase as a rich pipeline; agencies model it as almost nothing
Agencies publish no status, owe no reply, discourage enquiries, and delete unsuccessful
submissions on a clock (Storm 30 working days, Society 6 months). The heavy, persistent data
begins after signing, organized by board and chart (R1 §1, §3; R2 §8). Pholio gives the talent
fourteen statuses, an "In review" KPI, a 21-day nudge to chase, timeline entries, and a
confirmation screen describing the agency's process; it gives the agency a Kanban with lanes and
a "pipeline" nav group. Casting Networks, the industry's leading tool, hides most of its own
ladder from talent on purpose (R4 §2). The credible shape: the talent sees observed events only
(sent, opened by X on date, X asked for more, X recorded an offer, closed with no reply within
Pholio's window); the agency's working states (shortlist, on file, notes, tags) stay private to
the agency, as they do in Mediaslide and Syngency. Pholio's honest differentiator, "we tell you
when silence means no", survives this intact and gets stronger, because it is no longer preceded
by an assertion that someone is reviewing. (P0-6, L4-06, L4-14, L5-09, L5-10, L6-17, L7-07)

### PM-2. Representation is an application outcome; in the industry it is a scoped relationship
Covered at P0-7. The structural point: `talent_representations` (mother vs placement, market,
territory, exclusivity, dates) is the right object and already exists; `applications.status =
represented`, `roster_board_standings.standing`, and `profiles.current_agency` are three
competing shadows of it. One table, two attestations, every reader routed through it.

### PM-3. Six taxonomies answer "what kind of work is this person for", and none is the industry's board
Pholio has a profile division, a booking-lane list (Commercial, E-comm, Editorial, Runway,
Lifestyle, Beauty, Fitness, Fit, Parts, Curve, Petite, Promotional, Creator), a stats track
(womenswear / menswear / ungendered), a frame style register (Editorial, Commercial, Lifestyle,
Beauty, E-commerce, Swimwear, Fitness, Couture), a Kanban "board", and a per-brief "board".
"Editorial" appears in four of them. The industry runs one two-axis model: segment (Women, Men,
Non-binary, Curve, Classic, Kids, Talent, Creators) × career stage (New Faces or Development,
Main, Image), assigned by the agency; the model identifies by board ("I'm on the development
board") (R2 §1.2). Booking types (e-comm, editorial, runway) describe jobs, not people, and a
talent does not self-assign to them. The credible shape: a talent declares segment and the boards
they are applying to; an agency assigns board and stage after signing; job-type vocabulary lives
on frames and briefs only. "Booking lanes" and "stats track" become internal. (L2-12, L2-13,
L8-09, L8-10, L8-20, L3-16)

### PM-4. A booking desk on an unsigned applicant
The agency dossier shows options, holds, bookouts and an availability instrument for someone who
has submitted photos and has no chart with this agency (L6-08). Options and holds are agency ↔
client states on a represented model's calendar (R4 §1 System A). PRODUCT.md says Pholio does not
replace the booking desk. Either remove the booking-state palette from the submission view and
keep only talent-declared bookouts as dates, or scope the desk explicitly to represented talent.
(P0-9, L6-08, L2-14)

### PM-5. The submission over-collects and over-ships
The gate demands bust, waist and hips; the default package ships the whole book plus a comp
card; the README itemizes the applicant's shortfalls inside the folder they are told to send;
export files are named after the receiving agency. The market's top half asks for height and
three or four plain photos, and Premier lists "asks you to submit a portfolio" among scam
markers (R1 §4, §5). The credible shape: the target agency's published requirements define the
package; the default is digitals plus stats plus socials; the book and card are optional
attachments the talent chooses; preflight notes stay in-app. (P0-17, L4-09, L4-10, L4-11, L4-15)

### PM-6. Minors are adults with a flag; the industry treats them as a different object
Covered at P0-1 through P0-5. The structural fix is one place that answers "is this person under
18" and one stats formatter that returns the kids field set from it, consumed by every surface
and export. Guardian consent then governs exposure and contact, not what fields exist.

### PM-7. Development and New Face are offered as pre-signing outcomes
"Development Offer (short: New Face)" and an agency action "Offer development" present a
board placement as an application outcome. In the trade, New Faces and Development are boards a
signed model is placed on, sometimes separate peer boards, and "in development" means signed but
not yet sellable at full rate (R2 §1.3). A development contract is a real offer type, but it is
still a contract, and "New Face" is never the outcome of a form. The credible shape: the agency
records "offered representation" with a contract type (main, development, mother agency,
non-exclusive) and the board is assigned after acceptance. (L4-23, L5-20, L6-13, L7-09)

### PM-8. Silence is Pholio's window, but the copy gives it to the agency
The auto-close is the product's most honest mechanism: `closed_no_response`, written by nobody,
unwritable by an agency. Its copy then says "Their review window" and calls the 6-month re-apply
interval "industry convention" when no primary source states an interval (R4 §7-8); a shortlisted
submission auto-closes identically to one never opened; the close is bell-only with no email; the
agency is never told. The credible shape: "No reply within Pholio's 30-day window" everywhere,
an email for the event the product exists to deliver, a distinct end state for a shortlisted
submission, and an agency-side line "closed after 30 days without a recorded decision".
(L4-07, L5-08, L5-09, L5-10, L6-11, L8-19)

### PM-9. The Wallet pass is a credential; the industry's portable artefact is a comp card
Covered at P0-19. The honest version of this feature is a digital comp card in Wallet, and only
if the agency block is attested.

### PM-10. Intel counts streams nothing writes, and counts the talent's own clicks
The action vocabulary (agency reviews, advances, card pulls, link opens, profile visits) is a
Pholio invention. "Agency reviews" reads `profile_viewed` rows that only a seed script produces;
"card pulls" and "link opens" count the talent's own downloads on the legacy analytics path;
the bell rewrites views as "interest". A booker does not "pull a card". The credible shape: the
Intel page reports the five things Pholio can observe (sent, opened by whom and when, asked for
more, offer recorded, closed), named as actions by named agencies, with small samples labelled
"too early to read". (L5-06, L5-07, L2-20, L2-30)

### PM-11. "Digitals" is talent-side and post-signing vocabulary; the public forms say "photos"
Zero of 24 public agency submission pages use "digitals"; it appears inside agency software and
in models' and bookers' speech (R1 finding 1). Pholio using "digitals" with talent is a fluency
signal and should stay. Two consequences: never gloss or explain the word to an agency, and on
the anonymous open-call form addressed to strangers, lead with "photos" and gloss once
("photos, the plain unedited kind agencies call digitals"). (L1-07, L3-22)

### PM-12. The comp card is presented as a design product the talent art-directs
Nine "editions", a "voice", "directions", "takes", and a "board" the talent picks for their own
card. In the trade the card is made by the agency from the book, and a booker reads a card in a
second for images, stats and the agency block (R3 §3 stage 4). For unrepresented talent the
craft framing is defensible and is Studio+'s honest product; it becomes a tell when the vocabulary
leaks into agency surfaces or when the talent assigns a board. Keep the craft on the talent side,
rename the engine words to plain ones (layout, version, shuffle), and remove the talent-picked
"board" from the card. (L3-15, L3-16, L8-29)

### PM-13. What is modelled correctly and should be the template
Event casting (pool → designers → lineup, talent-only confirmation, 18+, designers see no contact
and no minors, frozen packages, one-time links); the off-Pholio prepare and handoff flow ("Not
sent yet", "silence is the common outcome", "Pholio is not affiliated with {Agency}", dated
verification); the decline-reason taxonomy; the per-purpose likeness ledger; the canonical stats
formatter's order; the frame editor's digitals-stay-raw rule. Every fix above can be described as
"make surface X behave like one of these".

## 5. P1: a real user would hit it and be confused or misled

### A1. Product model and concepts

**Every representation submission ships the talent's whole book and a comp card by default**
- Where: `ApplyExperience.jsx:117-160,1612-1615,3820-3826` (book + comp card pages, always included, no opt-out for comp card)
- Sources: L4-11
- Industry: 0 of 24 sampled agencies ask for a portfolio at intake (Premier lists it as a scam marker); a comp card at intake is post-signing vocabulary and inverts the representation sequence.
- Fix: make digitals + stats the submission; demote book/comp card to opt-in, default off for representation calls, driven by the spec registry.

**Off-Pholio exports are named for the receiving agency, not the model, and the promised numbering doesn't exist**
- Where: `export-plan.js:353,398`; `PrepareScene.jsx:68`; `HandoffScene.jsx:310,322`
- Sources: L4-09
- Industry: submissions are the atomic unit of applicant + stats + photos; naming the file after the recipient (`muse-model-management-nyc-....jpg`) carries no identifying info and collides across every applicant.
- Fix: name files `lastname-firstname-01-full-length.jpg` with a real ordinal in published order.

**Off-Pholio README itemises the applicant's shortfalls and ships in the same folder sent to the agency**
- Where: `spec-export-service.js:392-408` (`renderReadme`)
- Sources: L4-10
- Industry: the copy is correct as talent-facing text, but nothing marks it "do not send" before it lands in the same ZIP handed over.
- Fix: split into `send/` (deliverables) and a root README that opens "This file is for you. Do not send it."

**EMAIL.txt omits fields the researched agency actually asks for and can't follow its published order**
- Where: `email-draft.js:225-243`; `stats-block.js:97-123`
- Sources: L4-15
- Industry: Pholio's own agency brief for Muse says "name, age, location, then measurements"; the generated draft has no age, no phone, and a fixed canonical order.
- Fix: add age/phone to the block; let the registry's published field order drive block order when known.

**Auto-close — the product's headline trust feature — is bell-only; no email is sent**
- Where: `application-auto-close.js:195-214`; `sendApplicationStatusEmail` only called for `accepted`/`declined`
- Sources: L5-10
- Industry: the industry's own honest-silence practice is communicated in writing, precisely because it must reach people not actively checking the app.
- Fix: send the close as email via a dedicated `closed_no_response` branch (none currently exists — without one it would render the `declined` template and print "passed on your submission").

**"Keep on file" is exempt from the review window; neither side is told how long "on file" lasts**
- Where: `ReviewRoom.jsx:1163`; `applicationLifecycle.js`; retention constant `submission-retention.js:3` (24 months) never surfaced
- Sources: L6-15
- Industry: R1 found zero "keep your details on file" precedents among 24 agency surfaces — the 2026 convention is a published deletion promise (Storm 30 days, Society 6 months).
- Fix: put a clock on "keep on file" (agency-configurable), auto-close on lapse with distinct copy, state the period in the talent email.

**The submission dossier carries booking-desk instruments (options, holds, bookouts) an unsigned applicant cannot have**
- Where: `ReadoutBand.jsx:78-92`; `TalentFullView.jsx:246`; `CalendarLine.jsx:28-48`
- Sources: L6-08
- Industry: options/holds/first-second-option are booker instruments placed on a *represented* model's chart after signing; the pre-signing phase should be near-nothing.
- Fix: remove availability readout/calendar sheet from the submission dossier, or reduce to dated bookouts the talent actually entered.

**The agency CSV export wouldn't land cleanly in a real agency system**
- Where: `inbox.js:3556-3596` (`csvColumns`)
- Sources: L6-18
- Industry: Measurements exported as one mashed text cell with no units; Shoe/Hair/Eyes missing entirely; unit discipline ignored; raw status enums exported; no photo URLs — a submission without photos is a contact record, not a submission.
- Fix: split stat fields, add missing fields in canonical order, honour agency unit preference, map status through labels, add photo URLs.

**"Send submissions to your own system" webhook sends a contact record, not a submission**
- Where: `ExportWebhookPanel.jsx:130-137`; `export-webhook-dispatch.js:78-102`
- Sources: L6-19
- Industry: the artefact an agency receives is photos + stats + basics; the webhook payload has none of them (no images, no measurements, no socials, no boards) and also skips the minor redaction the CSV applies.
- Fix: send the frozen submission package (stats, digitals with signed URLs, boards, consent record) or retitle the panel honestly.

**"Bulk accept" — a shipped permission for offering representation to many people at once**
- Where: `permission-groups.js:35,38,82-83`; bulk path `inbox.js:2071-2077`
- Sources: L7-08
- Industry: offering representation is the agency's highest-cost decision, made one person at a time after a meeting — a multi-select bulk action describes volume recruiting, not an agency.
- Fix: remove `applications.bulk_accept` and the bulk "Offer representation" button; keep bulk pass/shortlist/keep-on-file.

**"Not for us" in Discover is a permanent, unreviewable erasure disguised with an Undo**
- Where: `ScoutRoom.jsx:739-758`; effect in `discover-search.js:512-515,591-594`
- Sources: L7-13
- Industry: re-entry in this business is seasonal, not terminal — a strong applicant who misses one season stays in view for the next.
- Fix: make dismissal expire (season/12 months) and add a "Not for us" list with restore, rather than permanent exclusion.

**Unpaid event compensation has no image/usage-rights field**
- Where: `EventCallFields.jsx:18-29,126-166`; `eventCasting.js` (`PAID|STIPEND|UNPAID`)
- Sources: L7-14
- Industry: rights grabs travel with unpaid work; the real unpaid taxonomy is TFP/trade/collaboration, and usage terms are the sharpest System A/B asymmetry — Pholio's consent record is silent on it.
- Fix: add a required "Image and video usage" statement beside compensation, restated in the consent sentence; add TFP/trade and Expenses-only options.

**A talent can move any frame into Digitals in one click with no separation check**
- Where: `MediaWorkspace.jsx:490-496,522-556` (bulk "Move frames" modal)
- Sources: L3-19
- Industry: digitals are the truth document — unretouched, plain wall, no makeup — and mixing book work into digitals is the #1 error a booker reacts to.
- Fix: confirm with the rule when the target is `digital`; warn (don't block) when AI signals read styled/heavy-retouch.

**The public portfolio shows one undifferentiated "Gallery" — digitals and book together**
- Where: `views/portfolio/show.ejs:207-218,288-296`; query at `portfolio.js:385-395` has no `image_type` filter
- Sources: L3-12
- Industry: the book and digitals are opposite objects with opposite rules; a single gallery collapses the entire mental model the Media page correctly builds.
- Fix: render the public page in the same sections as the Media page, or at minimum exclude `image_type='digital'` from the public gallery.

**`STANDINGS` merges three separate lifecycles onto one axis, and ladder boards are peers of roster boards**
- Where: `divisions.js:88-112,370-392`; `roster_board_standings` migration
- Sources: L8-20
- Industry: boards are a matrix of segment × career stage — a model is on *Women/New Faces*, one board, not two; `shortlisted`/`onfile`/`passed` belong to the intake lifecycle, not board standing.
- Fix: model a board as (segment, stage); split `STANDINGS` into a true standing enum and the existing application-status enum.

**"Bring your agency" on login drops an agency owner into the model's onboarding flow**
- Where: `LoginPage.jsx:528-532` → `/onboarding?type=agency` (unread param); correct destination `/partners` exists and is unused here; `AgencyOnboardingPage.jsx` imported nowhere
- Sources: L1-19
- Industry: first principles — a head booker evaluating Pholio is put through a model's DOB/measurements intake.
- Fix: point "Bring your agency" at `/partners`; delete or wire `AgencyOnboardingPage.jsx`.

**Two frames collected at the digitals step; the open-call form has no shot rules where they matter most**
- Where: `CastingScout.jsx:291-312,324-326`; `openCallIntake.js:101-102,128`; `OpenCallApplyPage.jsx:940-943`
- Sources: L1-07
- Industry: 12 of 14 agency forms with upload slots require 3-4 named frames including a profile/side shot, with repeated imperative rules (no makeup, no filters, plain background); the anonymous open-call applicant — who has no coaching — gets none of it.
- Fix: add `digital_profile` as required alongside headshot/full-length; put the shot rules on the open-call media screen in the agencies' own words.

**Unlicensed third-party stock imagery ships on the flow a talent trusts with their likeness, with the TODO still in place**
- Where: `LanePlates.jsx:14-19` (`// TODO: replace with owned/licensed lane imagery before ship`, live Unsplash URLs); `CastingCallPage.jsx:158-159,589,649`
- Sources: L1-21
- Industry: first principles, sharpened by image-provenance being a live 2026 issue (Getty policy, NY replica statute) — a product asking for trust with likeness is illustrating itself with unrights-cleared photos of strangers, leaking every visitor's IP to a third party mid-signup.
- Fix: self-host owned/licensed plates; drop the Unsplash avatar fallbacks (an initial monogram already exists for the email path).

### A2. Status and lifecycle

**"Represented" is duplicated across at least three inconsistent stores, with no scope or counter-signature**
- Where: Overview hero reads stale `current_agency` legacy column, uneditable via the form (`ProfilePage/index.jsx:793-797,863-865`; `formNormalization.js:288`); an agency's unilateral status write with no talent acknowledgement (`applicationStatus.js:132-140`; `notifications.js:338-341`); legacy `current_agency` strings backfilled as a *mother agency* relationship type on migration (`migrations/20260629234500:99-118`)
- Sources: L2-15, L4-05, L8-22
- Industry: representation is a contract with scope (market, exclusivity, dates) and a two-party attestation; a mother agency is a specific relationship, not a synonym for "the agency I'm with."
- Fix: drive the hero from active `talent_representations` rows labelled as declared; require talent confirmation before an application flips to `represented`; backfill legacy strings as `placement` or `unspecified`, not `mother`.

**The representation-status radio contradicts the relationship rows it sits beside**
- Where: `RepresentationSection.jsx:21-40,53-74`; `formNormalization.js:116-124`
- Sources: L2-16
- Industry: a model can be represented in several markets via a mother agency and placements while still seeking representation elsewhere; a tri-state radio flattens this to a boolean that can disagree with the rows.
- Fix: derive standing from the rows; replace the radio with "are you open to offers?" (orthogonal, can be true while represented).

**Three availability models shown on one talent page, including outsider employment vocabulary**
- Where: `AVAILABILITY_OPTIONS` (Full-Time/Part-Time/Freelance/Weekends/By Appointment) rendered twice, plus a global Available/Limited/Unavailable radio, plus (correctly) dated bookouts — `ProfilePage/index.jsx:65-71,1259-1272,1480-1493`; `AvailabilitySection.jsx:27-31`
- Sources: L2-14
- Industry: availability is a date-range concept (bookout), never a global toggle; models aren't employed part-time.
- Fix: delete the global radio and the Full-Time/Part-Time select; keep bookouts as the only model.

**A shortlisted submission auto-closes as "no response," identically to one nobody ever opened**
- Where: `AWAITING_AGENCY_APPLICATION_STATUSES` includes `shortlisted` (`application-status.js:27-31`); copy at `notifications.js:353-356`
- Sources: L5-09
- Industry: shortlisted is a real, published, positive screening outcome (Storm) and the normal next step is a meeting — flattening it into the same terminal "treat as a pass" message discards Pholio's single most valuable positive signal.
- Fix: exclude `shortlisted` from auto-close, or give it distinct terminal copy that says it carries over.

**Auto-closed submissions still count as "On the desk," and the agency is never told a close happened**
- Where: `applicantLifecycle.js:32-34` (`isActiveStatus` doesn't exclude `closed_no_response`); `ApplicantsPage.jsx:1259-1262`; `StatusText.jsx` has no `closed_no_response` entry so the cell renders blank
- Sources: L6-11
- Industry: the auto-close design matches the industry correctly; the agency-side consequence — an inflated headline figure and a blank status cell indistinguishable from a bug — undermines it.
- Fix: add `closed_no_response` to `STATUS_MAP`, exclude from `isActiveStatus`, notify the agency weekly of auto-closed counts.

**Notification settings promise two always-on signals and list one — silencing the go-see/meeting invite**
- Where: `SettingsPage/index.jsx:848-849,832-834` (lede promises "a booker's message and a meeting time" as unmissable; only "Messages from agencies" is actually always-on)
- Sources: L2-27
- Industry: the meeting invitation is the single most consequential event in the intake ladder, yet it's routed through the switchable `applicationUpdates` category.
- Fix: carve `meeting_requested` into an always-on category and list it, or correct the lede.

**"Development Offer" collapses two distinct post-signing boards (New Faces, Development) into one pre-signing tier**
- Where: `applicationStatus.js:114-122` (label/short "New Face"); `CastingDetailPage.jsx:123,281` (button offered from the pre-signing Shortlisted column); `notifications.js:330-333`; `statusConfig.js:59,61`; email `templates-submissions.js:52-57`
- Sources: L4-23, L5-20, L6-13, L7-09
- Industry: New Faces and Development are boards of *signed* talent, and six agencies run them as separate peer boards (Viva, Milk, Chadwick) — "in development" means signed but not yet at full rate, never a pre-signing stage.
- Fix: collapse to one action — "Offer representation → which board?" — after signing; drop the pre-signing "New Face" button and the `development` pre-signing status.

**"Go-See Requested" is used for an agency's own first meeting — the industry's client-facing term applied to the wrong room, and rendered four to five different ways for the same event**
- Where: `applicationStatus.js:105-113` ("Go-See Requested"/"Go-See"); `notifications.js:326-329` ("Meeting requested"); agency side `ApplicantsPage.jsx:671` ("Go-see requested"), `ShortcutHelp.jsx:17`, `ReviewRoom.jsx:1169` ("Invite to meet"), `DecisionDock.jsx:111` ("Invite to a meeting"), `StatusText.jsx:41,82`
- Sources: L4-04, L5-16, L6-16
- Industry: a go-see is a client-facing meeting where a *signed* model shows their book; an agency's own first meeting with a prospective talent is a "meeting"/"interview"/"come in" — conflating them is the single biggest System A/B error a product can make.
- Fix: standardize on "Meeting requested"/"Invite to meet" everywhere; reserve "go-see" for a future client-facing surface.

### A3. Measurements and data

**The shoe-size converter is arithmetically wrong (EU comes out roughly double), and disagrees with the product's own correct formula elsewhere**
- Where: `client/src/shared/utils/measurementConversions.js:31-41` (`EU: (s*2)+31`, correct EU offset is +31/+33); rendered `MeasurementsSection.jsx:211` as `≈ UK 7.0, EU 47.0` for a US 8
- Sources: L2-10, L8-06
- Industry: the standard ladder is EU ≈ US+31 (women)/+33 (men); `stats-formatter.js` already has the correct offsets two files away.
- Fix: delete `getShoeConversions` and call the already-correct `renderShoe`/`shoeDual`.

**Dress/suit size carries no region while shoe size does, and the ladder assumed is unstated (US)**
- Where: `MeasurementsSection.jsx:270-296` (no region control, unlike shoe); `ApplyExperience.jsx:526-532` (`formatDress: EU = US+32`, off by one system); `stats-formatter.js:52-58`
- Sources: L2-11, L4-20, L8-07
- Industry: dress/suit sizing is not globally comparable (US 2 ≈ UK 6 ≈ EU 34 ≈ IT 38 ≈ FR 36); store the locale with the size, as shoe already does.
- Fix: add `dress_region`/`suit_region` with the same toggle pattern shoe uses; default from market, not hard-coded US.

**Three separate stats-formatting implementations disagree on order, units, and kids-track, and rendering varies four ways across the agency surfaces**
- Where: comp-card formatter (`pdf/composition/stats-formatter.js`, correct — has kids track); shared-lib formatter (`shared/lib/stats-formatter.js`, no kids track); digitals-sheet ad hoc (`pdf/routes/pdf.js:2005-2032`, wrong internal order); agency display formats vary imperial-only / imperial+metric stacked / metric+imperial inline / bare unitless `82-62-89` (`DiscoverPage.jsx:41`; `ScoutRoom.jsx:584-591`; `discover/present.js:566-569`; `casting-stage-helpers.js:50-58`); menswear form requires hips (never displayed) and has no collar/cup columns at all (`stats-formatter.js:243-260,322-335`; `profileReadinessItems.js:52-55`)
- Sources: L2-09, L3-18, L7-18, L8-08, L8-26
- Industry: the canonical order is invariant — height first, B-W-H contiguous, hair/eyes last, dual units, shoe always localised (R3 §4.4); "the order is the tell."
- Fix: delete the duplicate formatters and route every consumer through one canonical, track-aware function with a units/case option; add `collar_cm`/`cup_size` columns; make `hasCoreMeasurements` track-aware so menswear stops requiring hips.

**`core_measurements` is collected as unit-less free text, not track-aware, both at open-call intake and general intake**
- Where: `openCallIntake.js:53-57` (`kind:'text'`), required at shortlist and at representation apply; hint hard-codes "Bust, waist, hips" regardless of track; storage bound to 240 chars (`submissions.js:137`)
- Sources: L1-12, L8-21
- Industry: unit-less single-field stats read amateur; the correct shape is structured, ordered, dual-unit fields per track — which the product already has (`stats-formatter.js`) and this path bypasses.
- Fix: replace with three numeric inputs plus a unit toggle, track-aware, writing through the canonical stats columns; make height dual-unit (cm + ft/in) as every European agency form is.

**Height is cm-only on the open call form, and shoe region is captured then dropped at every display point**
- Where: `openCallIntake.js:52` (`Height (cm)`); `CastingMeasurements.jsx:471-478` captures `shoe_region` but `stats-formatter.js:362` renders `Shoe 8` with no region
- Sources: L1-13
- Industry: height is offered dual-unit on every European agency form; shoe is meaningless without its region (Models 1 renders `6 UK / 39 EU`).
- Fix: dual-unit height input on the open-call form; carry `shoe_region` into the canonical stats renderer.

**Heritage/ethnicity and skin tone are collected as a structured agency-search filter with no Art. 9 consent framing**
- Where: `IdentitySection.jsx:10-21,65-89` (multi-select of ten ethnicity values, hint "Optional. Agencies… can filter by this"); `MeasurementsSection.jsx:340-360` (Skin Tone, rationalized as "prevent set-day surprises")
- Sources: L2-21
- Industry: ethnicity is Art. 9 special-category data requiring an explicit, purpose-specific consent — "Optional" is not that, and the product's own embedding disclosure elsewhere correctly promises never to derive heritage.
- Fix: move heritage behind an explicit, separately-recorded consent with stated purpose/retention, or drop it from search entirely; remove Skin Tone as a structured searchable field.

**Gender still drives the stats set at both ends despite `stats_track` existing, and "Ungendered" is silently un-representable on a printed card**
- Where: onboarding `statFieldsFor(gender)` returns `[]` for non-binary/undisclosed (`CastingMeasurements.jsx:36-53`); comp-card/Wallet/export falls through `ungendered` to gender-inferred category, defaulting to the women's set (`stats-formatter.js:389-406,507`), with the mismatch logged only to an internal, never-surfaced warning
- Sources: L1-08, L8-10
- Industry: Non-binary is a live board at mainstream agencies (Select, Chadwick); a non-binary model books on a real ordered stat set, not on neither.
- Fix: make `stats_track` (not gender) drive onboarding's stats question, defaulting to `ungendered`; give the neutral set a real category end-to-end and pass the resolved track everywhere.

**AI-inferred frame signals (retouch, makeup level) render as bare statements of fact, indistinguishable from talent-set values**
- Where: `FrameSignalStack.jsx:28-56`; `frameTaxonomy.js:135-160` flattens a probabilistic `retouch_likelihood` into "Heavy retouch"/"Unretouched"; `FrameReadCaption.jsx:79-88` shows the same chip whether unconfirmed or confirmed
- Sources: L3-13
- Industry: the platform can report events, not inferences-as-facts; the AI output is a guess, not a verdict, and the hedge is dropped between the field name and the rendered label.
- Fix: prefix/style proposed reads distinctly ("Pholio reads: heavy retouch"); never show a `suggest`-band chip in the same visual register as confirmed.

**Image-AI consent says "profile insights"; the actual prompt is a "senior casting director" verdict on bone structure and market suitability**
- Where: `analyzeProfileImage.js:57-79` (`MASTER_VISION_PROMPT` requests `boneStructure`, `symmetryRead`/"market suitability impact", `castingNotes`, `developmentNotes`); consent text `settings.js:76-80`
- Sources: L3-14
- Industry: legitimate AI-photo consent must be specific as to purpose ("preliminary evaluation," not "profile insights") and output must be framed as an internal aid, never a verdict about the person.
- Fix: delete `MASTER_VISION_PROMPT`/`masterVisionAnalysis` (nothing consumes the output) or re-scope strictly to attributes of the photograph, and name the purpose specifically in consent.

### A4. Claims beyond the data

**A fake nine-second "scan" plays over the talent's face while real, undisclosed content-moderation screening runs**
- Where: `CastingScout.jsx:240-284` (scan animation, docstring claims face-reading); confirm route runs no analysis and unconditionally marks `analysis_status: "complete"` (`casting.js:1478,1491`); real screening (`analyzeImageBuffer`/`screenImageForCsam`, `casting.js:1191-1206`) is never disclosed at upload
- Sources: L1-06
- Industry: AI-analysed/AI-scored claims, unqualified, are a term practitioners now flinch at; AI consent must be separate, purpose-specific, and disclosed.
- Fix: delete the scan chrome (a save is a save); disclose the real screening honestly at upload.

**"Agencies need measurements before you apply" is false for the top of the market**
- Where: `CastingMeasurements.jsx:696-698`
- Sources: L1-11
- Industry: Storm, Premier, Models 1, Society and IMG do not ask for bust/waist/hips at first submission at all — they ask height, DOB, location, and three photos.
- Fix: attribute correctly and scope it ("Some agencies and most event calls ask for these"), or state it as Pholio's own send-readiness rule if that's the real source.

**The open-call arrival page asserts an invitation and agency behaviour Pholio cannot know**
- Where: `OpenCallArrivalPage.jsx:335,398-401` ("invited you to submit," "reviews your submission directly"); `:226-229` renders "Closes a date the agency has not published" for a null deadline
- Sources: L1-15
- Industry: an open-call code is a public link, not a personal invitation; nobody in the industry sample lets a third party promise review on their behalf.
- Fix: "{Agency} is accepting submissions through Pholio." / "Your submission is delivered to {agency}."; omit the deadline line entirely rather than completing it with a nonsense phrase.

**A Google OAuth display name is presented as "Legal Name," beside "Verified Email"**
- Where: `CastingCallPage.jsx:615-623`
- Sources: L1-22
- Industry: a model's working and legal names routinely diverge; a legal name is a contract/permit field collected at signing, not a social-profile string, and placing it beside "Verified" borrows that word's authority.
- Fix: label it "Name" (editable); reserve "legal name" for a field actually collected as one.

**Intel's headline "agency reviews" stat counts a stream nothing writes; "card pulls"/"link opens" count the talent's own clicks**
- Where: `AttentionBlock.jsx:25,86,110`; `MomentumBlock.jsx:19-25,412`; `intel/pipeline.js:86-97` (no production writer of `profile_viewed` — always 0 in production, silently reporting *advances* under a "reviews" label); `intel/attention.js:55-80,198-216` reads the legacy analytics stream, which has no self-view exclusion, unlike the v2 stream
- Sources: L5-06, L5-07
- Industry: the platform may report "Opened by Elite NY, 2 Sep" — an observed event with the observer named — never a count it didn't observe or one the talent can inflate by clicking their own button.
- Fix: derive "reviews" from `applications.viewed_at`; exclude self-views from the legacy write or read pull/open counts from the v2 stream.

**Pholio's own default 30-day auto-close window is attributed to the agency**
- Where: `notifications.js:353-356`; `applicationStatus.js:172-180`; default `application-auto-close.js:38` (used whenever `agencies.application_review_window_days` is null)
- Sources: L4-07, L5-08, L8-19
- Industry: silence-as-outcome must be attributed to the platform's window, never the agency's — real published windows vary wildly (1 week to 30 working days) and are the agency's to state.
- Fix: branch the copy — "{Agency} publishes an N-day window and it has passed" when agency-set, "No reply within Pholio's 30-day window" otherwise.

**The 21-day nudge tells the talent to chase the agency, and invents a "slot" to free by withdrawing**
- Where: `ApplicationsView.jsx:629-632,659-663`; stale comment claims no auto-expire scheduler exists (one does)
- Sources: L4-06
- Industry: chasing is the one thing agencies explicitly forbid in their own copy; a representation submission occupies no slot before signing.
- Fix: "{n} days, no reply. That is normal… Pholio will close this on {date}." Drop "message them"/"free the slot."

**The book-review page asserts what a named agency scouts, from a regex over the talent's own board selection**
- Where: `ApplyExperience.jsx:391-401,3577-3585` (matches `selectedBoards` text against `/commercial|lifestyle/` etc. and states it back as "This house scouts commercial…")
- Sources: L4-13
- Industry: what an agency is "looking for" changes by season and booker; the platform cannot know it, and here it's putting words in the agency's mouth from the talent's own guess.
- Fix: drop the agency-inference notes, or attribute them to the talent's own selection.

**"Review focus" presents an agency's first open board (array position) as the lens the submission is judged by**
- Where: `ApplicationsView.jsx:683-687`; `ApplyExperience.jsx:2989-2991` (`primaryBoard = openBoards[0]`)
- Sources: L4-18
- Industry: nothing about array position encodes how a reviewer reads a submission; the platform can't know suitability.
- Fix: relabel "Boards open" and list them, or drop the row.

**The submission timeline renders every real agency event, including the auto-close, as generic "Updated"**
- Where: `SubmissionRecord.jsx:37-47` (`TIMELINE_WORDS`); only `status_change` and `auto_closed` are ever actually written; the auto-close description is bolded "Updated," discarding its own honest message
- Sources: L4-14
- Industry: naming the actual event ("Closed — no response from {Agency}") is the whole value of the auto-close feature.
- Fix: add `auto_closed: 'Closed — no response'`; delete the dead keys (`accepted`, `declined`, `booked`, `submitted`, `note_added`) until something writes them.

**The message-notification email invents a "Booker" persona out of the agency's name alone**
- Where: `templates-submissions.js:175-196` (`role: senderRole || "Booker"`); caller never passes a real sender (`messages.js:344-350`)
- Sources: L5-11
- Industry: "is this contact actually that agency?" is the #1 2026 trust question; synthesising a person and title nobody claimed is the shape of the impersonation pattern agencies warn about.
- Fix: pass the real sender through and render Name · Role · Agency; where unresolvable, show the organisation only with no fabricated avatar/role.

**"Top matches today" is `ORDER BY created_at DESC` — nothing is a match, nothing is top**
- Where: `OverviewPage.jsx:103`; `inbox.js:4256` (only ordering is `created_at desc`)
- Sources: L6-07
- Industry: nothing in agency software scores talent-to-client fit — there is no brief to match against on this page — and the product's own comparison overlay elsewhere argues at length against ranking.
- Fix: retitle "Latest submissions"; link to the To-Review tab.

**Every card on the signing board is labelled "Editorial" by a hard-coded fallback default**
- Where: `CastingDetailPage.jsx:132,214`; `ApplicantsPage.jsx:141` (`archetype || 'editorial'`); the producing endpoint never returns `archetype`
- Sources: L7-05
- Industry: board/segment is the industry's primary organising key; asserting one for a stranger who declared nothing is an assertion about their market position.
- Fix: drop the fallback; render nothing (or the talent's declared boards) when the field is absent.

**"Vetted agencies" is asserted with no defined mechanism, and the internal review page that's supposed to check it collects no credential**
- Where: `SettingsPage/index.jsx:753`; `settings.js:83`; `agencies.js:39`; internal review page `AgencyRequestsPage.jsx:169-170,216-226` collects market/roster-size/contact but no registration number, licence, or trade-body membership — despite the registry infrastructure (`agency_verifications`, NY DOL registry match) existing unused
- Sources: L2-19, L6-14
- Industry: what a working model actually checks is a NY DOL registration number and public registry match, a posted Certificate of Registration, BFMA membership — "vetted" must name the specific mechanism.
- Fix: add a registration block to the access request and show a live registry match; replace talent-facing "vetted" with the actual mechanism or a real registry credential where one exists.

**"Pholio signal" surfaces a dead, unmaintained AI fit score to the talent**
- Where: `BookingLanesControl.jsx:99-105` (`Pholio signal — Editorial 82`); reads `fit_score_*` columns with no live writer anywhere in the codebase
- Sources: L8-17
- Industry: nothing in agency software scores talent-to-client fit; an AI score surfaced to a model is the FTC's exact enforcement lane and a bias-risk claim.
- Fix: remove the panel; if the underlying signal is kept, use it only to silently order options, never to print a number at a person.

### A5. Terminology: wrong, HR/SaaS, invented

**Six to eight parallel taxonomies claim to answer "what kind of work is this person for," with "Editorial" and "Curve" each appearing in four**
- Where: Primary Discipline (`DisciplineSection.jsx`); Stats Track (`statsTrack.js`); Booking Lane / Primary+Secondary Lanes (`booking-lanes.js`, `BookingLanesControl.jsx`); derived profile-division taglines (`profile-division.js`); agency Board/Division, 21 entries (`divisions.js`); agency "Type" (`statusConfig.js`); frame Register (`frame-taxonomy.js`); comp-card "board" select (`CompCard.jsx:72`); plus "Signing board"/"Active Boards" naming the kanban screen (`CastingPage.jsx`, `AgencyLayout.jsx:131`)
- Sources: L1-18, L2-12, L2-13, L3-16, L6-12, L8-09, L8-11, L8-20
- Industry: the industry organises around one object with two axes — segment × career stage; board is the primary organising key and a kanban screen must not itself be called a "board" (name collision named "actively harmful" by the research).
- Fix: collapse to segment×stage (agency-assigned) + one market/job-type vocabulary (talent-declared) + `stats_track` as the measurement-set switch only; rename the kanban screen away from "board" entirely (e.g., New Faces / Packages); stop letting the talent self-assign a board.

**A model agency is called a "house" throughout the talent-facing market and messaging surfaces**
- Where: `MarketBoard.jsx:8,87,112`; `HouseBand.jsx`; `HouseBrief.jsx:7`; `ApplyExperience.jsx:2907,2169`; `HandoffScene.jsx:460`; `ApplySuccess`; `TeamRolesGuide.jsx:4,16`; `MessagesPage.jsx:143,173` ("your house," "your outreach")
- Sources: L4-12, L7-24, L8-12
- Industry: in fashion a "house" is a design house/client (Chanel, Dior) — the agency's client, not the agency itself; using the client's word for the agency inverts the transaction the whole product exists to broker.
- Fix: "agency" everywhere the referent is an agency; "organizer" for event calls; keep "house" only in its correct in-house sense.

**"Market" names both the talent-nav page (the agency directory) and the booking-city field, on the same product**
- Where: `talentNav.js:24` (page "Market"/"The Market"); `ApplicationsView.jsx:678`, `ApplyExperience.jsx:2985` (field `<dt>Market</dt><dd>{agency_location}</dd>`); `talent_representations.market`; `RepresentationSection.jsx:216-221`; `CompCard.jsx:73` `CARD_MARKETS`
- Sources: L2-26, L4-17, L8-13
- Industry: "market" in this business means a booking city ("placed in the Paris market"); there is no industry sense in which it means "the list of agencies you can apply to."
- Fix: rename the nav page "Agencies" or "Submissions"; keep "market" strictly for cities.

**"Package" names the talent's own submission — the reverse of the industry's agency→client direction**
- Where: pervasive across apply flow, preflight, submission threshold, frame-taxonomy advisories, `package-intelligence.js`, `submission_packages`; also "Campaign" mislabels unpublished work
- Sources: L3-25, L8-14
- Industry: a package is what an agent sends a client — talent don't build packages, bookers do; the talent-built inbound object is a submission.
- Fix: call it a "submission" throughout talent-facing surfaces; reserve "package" for the future agency→client artefact.

**"Pipeline"/"stage"/"funnel" run through the agency's persistent chrome and settings**
- Where: sidebar nav group label (`agencyNav.js:7,23`, on every agency screen); `permission-groups.js:32,41,52`; `SettingsPage.jsx:34`; `ActivityPage.jsx:131`; `OpenCallPanel.jsx:178` ("Your applicant funnel"); `TeamRolesGuide.jsx:6`
- Sources: L6-17, L7-07, L8-16
- Industry: pipeline/funnel is sales-CRM register the research names explicitly as one of the words that most badly breaks the frame; native words are scouting, submissions, the desk, the board.
- Fix: rename the nav group ("Intake" or no label); "N Submissions" in the chrome status strip; "Bulk status change" / "Where your submissions come from" throughout.

**Raw backend enum values (and "(bulk)") are shipped verbatim to the Activity feed, the CSV, and the talent's own submission timeline**
- Where: `inbox.js:1745-1752,2161` (`Application moved to ${requestedStatus} (bulk)`), rendered on `ActivityPage.jsx:180`; same `description` served to talent at `applications.js:3236-3253` and rendered at `SubmissionRecord.jsx:56-58`; CSV `application_status` column exports the raw enum
- Sources: L7-04, L8-15
- Industry: internal enum spellings and batch-processing disclosures are engineering artefacts the product already has a complete label map for elsewhere.
- Fix: pass status through `getStatusLabel` (or `statusConfig()`) before writing/serving `description`; never expose "(bulk)."

**"Casting"/"casters" is used for laying out a comp card and for the reader of a submission**
- Where: `CompCard.jsx:987,996,1014,132,153`; `composition/index.js:309,316`; `talent-wallet.js:25`
- Sources: L3-10
- Industry: casting is the client/CD selection event for a specific job; the reader of a submission is a scouting/applications team, and "caster" is not a word anyone in the industry uses.
- Fix: rename the drawer "Frames"/"Front & back"; replace "caster(s)" with "casting directors"/"bookers" everywhere.

**The comp card is presented as a design product with nine named "editions," a "voice," "directions," and gamified "unlocks"**
- Where: `editions.js:78-252`; `CompCard.jsx:894-947,958-985,1057-1080,104-110` (`VOICE_LABELS`, "New direction," "Another take," `EDITION_UNLOCK_COPY`)
- Sources: L3-15, L8-29
- Industry: the card is a plain filing artefact (12-14pt Arial/Times), never a branding exercise, and once represented, the agency makes the card, not the model.
- Fix: keep the engine, retire the publishing vocabulary — one "Layout" control with plain names; drop `VOICE_LABELS` and gamified unlock copy from the UI entirely.

**"Test shoot" is defined as TFP — the two arrangements the industry keeps structurally apart**
- Where: `frameTaxonomy.js:80` (hint: "TFP or test day imagery"); `MediaWorkspace.jsx:62`
- Sources: L3-17
- Industry: a test is agency-arranged and accountable; TFP has no agency involvement at all — the distinction is exactly what matters when an agent asks "who shot this?"
- Fix: split into two values — Test ("arranged by an agency") and TFP ("you arranged it directly, no agency involved").

**"Open call" means three different things in one product, producing "Open call invitation"**
- Where: correct usage for agency walk-in hours (`OpenCallsPage/index.jsx:122,139`); colliding usage for a private invite link (`ApplyExperience.jsx:2941`, `ApplicationsView.jsx:696`), plus event casting links (a third meaning)
- Sources: L4-08
- Industry: an open call is by definition the thing you don't need an invitation for; "Open call invitation, expires 14 Sep" is self-contradictory to anyone in the business.
- Fix: call the private link a "direct invitation"/"submission link"; keep "open call" exclusively for the walk-in calendar.

### A6. Minors

**Under-18 body measurements are gated by guardian consent instead of structurally omitted, and the swimwear/lingerie register has no age gate**
- Where: `talent-age.js:91-95` (`minorSensitiveFieldsUnlocked` returns true once consented, unlocking bust/chest/waist/hips/inseam/weight collection); `frameTaxonomy.js:117` offers "Swimwear — swim, lingerie, body" in the frame Register picker with no age check
- Sources: L3-20
- Industry: BFMA's rule against measuring minors beyond height has no consent exception, and "unacceptable... at any age under 18" applies to body/bikini/lingerie digitals regardless of who agrees.
- Fix: make `canCollectSensitiveProfileFields` return false for any minor, full stop; filter `swimwear` out of the minor's style picker and reject server-side.

**The Team permissions modal has no way to see, grant, or revoke the one permission that gates a minor's submission**
- Where: `permission-groups.js:6-77` has no `talent.view_minor_submissions` entry, though the server correctly implements it as a dangerous, guarded permission (`permissions.js:39,160,200`; `minor-submission-access.js:6-42`)
- Sources: L7-03
- Industry: BFMA requires guardian signature and constrains everything about an under-18; a Principal who must answer "who at this office can see my 16-year-old's submission?" has no way to look or revoke.
- Fix: add a "Minors" permission group in the modal, labelled in guardian-facing language, with current holders visible on the Team page.

**The Requirements builder refuses to let an agency require hair colour or nationality — but not an under-18's bust/waist/hips**
- Where: `authorable-fields.js:63-95,131-134` — `ELIGIBILITY_FIELDS` allowlists bust/chest/waist/hips/clothing/shoe and `applicant.age_years`, and `appliesWhen` can scope by age with no minor restriction; refusal explainer covers only nationality/hair/eye colour
- Sources: L7-10
- Industry: Storm, Premier, Models 1, Society and IMG ask height only at submission; BFMA rules a bust/waist/hips requirement targeting a minor out of bounds regardless of framing.
- Fix: refuse body-measurement eligibility fields whenever the rule's scope includes anyone under 18, and suppress those requirements at render time for a minor applicant.

**The guardian-consent email never says "parent," and asks a guardian to consent to disclosing a minor's measurements**
- Where: `templates-guardian.js:44-73`; text variant `text.js:259-276`; subjects use "Guardian" alone where the consent page correctly says "parent or legal guardian"; disclosure row includes "measurements"
- Sources: L5-13
- Industry: R5's dominant construction across BFMA/Storm/Milk/Elite/Premier/Heroes/NY DOL is "parent or guardian"; measurement disclosure for a minor is asking a parent to consent to something BFMA says shouldn't exist, and no deletion-on-non-response clock is stated (Elite's precedent is 15 days).
- Fix: match the consent page's "parent or legal guardian" wording; drop measurements from the minor disclosure list; add a retention/deletion sentence.

**Open-call intake has no age gate, no guardian fields at all, and makes measurements mandatory on the one anonymous, unauthenticated surface**
- Where: `open-call-intake.js:54-89,138-153` — the closed intake vocabulary has no `guardian_name`/`email`/`phone` key anywhere; `adult_attestation` only applies to event calls, not representation calls; `core_measurements` is REQUIRED at apply
- Sources: L8-18
- Industry: every sampled agency publishes an age floor (14-16) and a guardian mechanism; a public URL accepting any DOB and demanding body measurements with no guardian in the loop is both a BFMA breach and a COPPA exposure.
- Fix: add guardian fields to the vocabulary, required-when-minor on every call kind; add a platform minimum age and gate to representation calls; drop `core_measurements` to optional and force-hide it for detected minors; add a deletion clock on absent guardian approval.

### A7. Backend concepts leaking to users

**Ledger column headers are one column out of register — the extra header says "Match"**
- Where: `ApplicantsPage.jsx:1561-1569` (7 header cells) vs `:314-364` (6 row cells); dead `.ap-score-cell` CSS rule survives with no JSX rendering it
- Sources: L6-09
- Industry: "match/match score" is a term the research names as a flinch item — nothing in agency software scores talent-to-client fit — and here it's compounded by a genuine rendering bug (status text renders under "Match").
- Fix: delete the "Match" header and dead CSS rule; add the missing 7th header cell for actions so header and row agree.

**Two of three "Source" filters can never match a row, and the "New faces" filter degenerates to a single status check**
- Where: `ApplicantsPage.jsx:749-757,740-747` — `mapRow`/`mapCandidate` never set `source`, so it's always `'open_call'`; `filters.talent` tests `a.type` which is always `'editorial'` (see L6-01/L7-05 family)
- Sources: L6-10
- Industry: scouted vs. inbound is a real, load-bearing distinction agencies track; a filter that silently returns nothing is worse than no filter.
- Fix: carry `invited_by_agency_id` into the row shape and derive `source` from it; push filtering server-side.

**A required-looking "Type" select on every new board is silently discarded — the value never leaves the browser**
- Where: `CastingNewModal.jsx:14,62-71,129-136` — `TYPES` select is rendered, but `createBoard`'s payload never sends `type`, and the server/`boards` table has no such column
- Sources: L7-12
- Industry: first principles — the booker believes they've classified the board; the value is unrecoverable.
- Fix: persist the field (add the column, surface it on the board card) or delete the control.

**The bell converts a page load into "interest" and leaks the internal surface name "Scout," and its own empty state promises a signal the team deliberately stopped sending**
- Where: `notifications.js:470-548` ("showed repeat interest," "in Scout"); `TalentSignalPanel.jsx:66,80-84` ("Signals didn't load," empty state promises "when an agency opens your book…" though the sole producer of that event was deliberately removed, per `inbox.js:4616-4633`'s own correct reasoning)
- Sources: L2-20, L5-17, L5-18
- Industry: a platform may report counts and events with the observer named, never infer intent from a page view; internal surface names (Scout vs. the agency-facing "Discover") are engineering artefacts.
- Fix: keep the count, drop the inference ("${name} viewed your profile ${count} times"); remove "in Scout"; correct the empty-state promise to match what actually fires (a message, an invitation, a status move).

**A developer test route ships live in production**
- Where: `client/src/App.jsx:81` — `/onboarding/test` has no `import.meta.env.DEV` guard, unlike its sibling dev routes
- Sources: L1-20
- Industry: first principles — a scaffolding artifact one path segment from signup, on a guessable URL, on a product whose whole proposition is "high-end studio asset."
- Fix: delete the route and the file.

### A8. Consistency across Pholio

**The same submission carries three contradictory verdicts on the same day**
- Where: talent tracker "Under Review" (`applicationStatus.js:60-77`); Intel ReadClock "late"/"cold — treat as closed" computed off a platform-wide p75 quartile that can fire as early as day 13 (`intelTheme.js:291-296`; `conversion.js:100-105`; `pipeline.js:229-259`); auto-close still open until day 30
- Sources: L5-14
- Industry: where agencies publish an assume-no clock, they publish exactly one; multiple simultaneous clocks with different verdicts is worse than none.
- Fix: one clock, one owner — make the auto-close window the single authority and derive all other UI states from it.

**The agency's own settings tell it Pholio issues a decline in its name; the talent is told the opposite**
- Where: agency setting: "the talent is told it was not taken forward" (`NotificationsPanel.jsx:136-138`); talent bell: "did not respond within its review window... Treat this as a pass" (`notifications.js:353-356`), directly contradicting the auto-close module's own non-negotiable
- Sources: L5-15
- Industry: describing a decline the agency did not make and Pholio does not send is both wrong and, if believed by a booker, a reason not to enable the feature.
- Fix: rewrite the agency-side copy to match: "the talent is told Pholio closed it because nobody answered — never that you declined."

**One decision (a decline) carries five names, two of which appear in the same Activity row**
- Where: "Pass" (button) / "Passed" (toast, override) / "Not moving forward" (base label, modal, activity description) / "declined" (enum) — `ActivityPage.jsx:177-186` renders both "Not moving forward" and "Passed" on one line
- Sources: L7-11
- Industry: real organizers say "released"/"not selected," never "rejected"; "Pass" is genuine booker shorthand and the correct pick, but the product hasn't standardized on it.
- Fix: standardise on Pass/Passed everywhere including the confirm modal and the server-written activity description.

**The Profile's own section index is out of sync with the rendered page — four sections are unreachable and one is renamed on arrival**
- Where: `profileNavItems.js:5-15` lists nine sections; the page renders Availability, Casting Preferences, Heritage & Background, and Private context (none in the index); "Stats & Measurements" in the index renders as "Physical Attributes" (and as a third name, "Stats & Measurements," when locked for a minor)
- Sources: L2-23
- Industry: first principles — three names for one section is the kind of drift that makes a product feel assembled rather than designed.
- Fix: generate the index from the rendered section list; settle on one name per section.

**The same field is rendered twice with contradicting privacy copy**
- Where: `work_eligibility`/`passport_ready`/`drivers_license`/`availability_schedule`/`availability_travel` bound in both "Casting Preferences" (no privacy qualifier) and "Private & Compliance" ("stays private and isn't shown publicly") — `ProfilePage/index.jsx`
- Sources: L2-17
- Industry: first principles — a privacy promise attached to a field must hold everywhere the field appears.
- Fix: render each field exactly once; keep compliance-sensitive fields under the privacy statement only.

**The talent's public book/portfolio carries five or more names across the surfaces they use daily**
- Where: "The Book" (nav), "Your Website." (Overview panel), "Public Profile" (account menu), "Public portfolio"/"your public book" (Settings, same paragraph), "Portfolio images" (aria-labels), "Gallery" (public EJS page)
- Sources: L2-25, L8-27
- Industry: "book"/"portfolio" are the talent/agency words; "gallery" is the software word; "website" is neither.
- Fix: "The Book" everywhere in talent chrome; "public link"/"public book" for the shared URL; retire "Website"/"Public Profile"/"Gallery."

**Measurements are framed as "Physical proof"/"Your receipts" — self-entered numbers presented as verified fact**
- Where: `ProfilePage/index.jsx:1037-1043,1062-1068`
- Sources: L2-24
- Industry: every source frames stats as a claim that will be physically verified at the meeting — the industry does the opposite of what this copy implies.
- Fix: "III — Stats / the numbers a booker reads first. They'll be checked with a tape when you come in." "IV — Experience" for the credits movement.

### A9. Scope contradictions

**Agency-facing copy tells a booker that talent have a metered "monthly Pholio limit/allowance," and pitches the agency's own link as the bypass**
- Where: `OpenCallArrivalPage.jsx:360-364` (shown to signed-out visitors); `ApplicationsView.jsx:373-489` ("3/5" tile, "discovery submissions"); `OpenCallPanel.jsx:178-183,91` ("your monthly Pholio allowance," "never count against")
- Sources: L1-14, L4-22, L7-06
- Industry: the sector's uniform trust standard is that being considered is never metered by money — every sampled agency publishes "we never require payment"; the mechanism is in fact a flat, plan-independent anti-spam cap, but no copy says so.
- Fix: delete the qualifier from signed-out surfaces, or state it as a rate rule ("submissions through your link are not rate-limited") rather than an allowance; label the tile "Sent this month 3 of 5" plainly.

**The 3-month/90-day digitals-recency rule is stated as an agency/industry fact across at least six surfaces, with three different numbers**
- Where: onboarding review (56/84/90 days across `profileScoring.js:231,329`, `profileReadinessItems.js:143-146`, `packageIntelligence.js`, `StatsCurrencyPrompt.jsx`); comp-card recency banner (90/180 days, then a separate "6 months" rule, `digitals-freshness.js:214`, `photo-intelligence.js:418,431`, `frameTaxonomy.js:206-208`); Apply flow send-blocker (`sendReadiness.js:155-161`); decision/materials emails ("most agencies want a set from the last three months," `templates-submissions.js:121,164`; `templates-materials.js:98`); agency dossier ("the trade expects... within the last three months," `DigitalsSet.jsx:33,36`)
- Sources: L2-22, L3-09, L4-16, L5-12, L6-21
- Industry: no agency page in the primary research sample states a numeric re-measure interval — it is explicitly a coaching convention, and must be labelled as such, never presented as an agency requirement or a hard send-blocker.
- Fix: one constant, one honest attribution ("A common industry rule of thumb is..."), used everywhere; demote the Apply-flow gate from blocker to advisory.

**Weight is collected from every talent and published on the public portfolio, contradicting the product's own correctly-weight-excluding formatters**
- Where: `MeasurementsSection.jsx:36-40` (`const showWeight = true`); `views/portfolio/show.ejs:50-55,241-243`; correctly excluded by `stats-formatter.js` and the comp-card formatter unless fitness track
- Sources: L1-09, L2-08, L8-25
- Industry: weight is absent from every adult fashion board and modern comp-card stat list sampled; it survives only in child/actor résumé conventions and reads as body-surveillance in 2026.
- Fix: default weight off for every lane except fitness/athletic; remove it from the public template and from Required/Improve scoring; delete the empty labelled cell on the onboarding review screen.

**The public portfolio advertises the talent's paid Studio+ tier and, on some readings, their ethnicity and gender**
- Where: `views/portfolio/show.ejs:19` (`<span class="portfolio-pro-badge">Studio+</span>`); `:178-181` (Ethnicity list item); `:57-62` (Gender)
- Sources: L1-26, L3-11
- Industry: no sampled agency board carries a plan/verification badge of any kind, and "premium listing"/"featured placement" signalling is on the MUST-NOT list; a booker seeing a billing-tier badge on a talent's page reads it as paid placement.
- Fix: delete the Studio+ badge from the public template outright; remove Ethnicity and Gender from the public page.

**"Hidden until you're booked" describes a release path with no caller anywhere in the codebase**
- Where: `ProfilePage/index.jsx:1545-1547` ("On-set Safety... Hidden until you're booked, then shared only with the team coordinating the job"); the `CONFIRMED_JOB` audience it refers to has zero callers in `src/`
- Sources: L2-18
- Industry: Pholio, per its own declared scope, does not run a booking desk — the only "confirmed" state in the model is a one-week event slot, explicitly stated elsewhere not to be that.
- Fix: wire the audience to a real job/booking object, or stop collecting emergency-contact fields against a workflow that doesn't exist; if they stay as a personal record, say so plainly.

---

## 6. P2: realism and polish

- **A dev-error interceptor leaks server implementation register to talent** — "Confirm your photo after the scout step..." style state-machine sentences reach the UI verbatim. Where: `casting.js` (`invalidOnboardingSequence` messages), `useCasting.js:38-42`, `CastingScout.jsx:207`. Lanes: L1-23.
- **The flow says Instagram sign-up is unavailable, then offers a working Instagram sign-up button one screen later.** Where: `CastingEntry.jsx:264-267` vs `:549-562`. Lanes: L1-24.
- **Height cannot carry a half-inch anywhere it's captured or displayed for talent.** Where: onboarding dial (`CastingMeasurements.jsx:557-561,474`); profile display (`measurementConversions.js:5-13`). Lanes: L1-25, L2-35.
- **A dead "Agency Invitation" modal ships inside the live public portfolio template, ending in a browser `alert()` against a 410 endpoint.** Where: `views/portfolio/show.ejs:396-466`. Lanes: L1-27.
- **The moderation console's "Escalate" action has no named destination, and its audit note is a hard-coded constant string.** Where: `ModerationQueuePage.jsx:262-311`; `reports.js:390-412,93`. Lanes: L1-28.
- **"Continue Audit"/"audit" is used for a profile checklist.** Where: `OverviewPage/index.jsx:245-251,478-480`. Lanes: L2-28.
- **"Your defining identity artifact" and "specs" describe a comp card in engineering/credential register.** Where: `OverviewPage/index.jsx:594-597`. Lanes: L2-29.
- **"Your Reach." labels a 30-day profile-view count with creator/social-metric vocabulary.** Where: `OverviewPage/index.jsx:496-541`. Lanes: L2-30.
- **Internal/system-state language reaches talent-facing UI strings** — "Synchronizing...", "The service is disabled in this environment...", "Legacy representation notes"/"your previous profile", "Status updating"/"We're syncing this submission's status." Where: `ProfileReadinessSidebar.jsx:379`; `SettingsPage/index.jsx:1224-1227`; `RepresentationSection.jsx:242-249`; `applicationStatus.js:215-222`. Lanes: L2-31, L8-28.
- **`UNION_OPTIONS` stores the transposed acronym `UAD` for the Union des artistes (UDA).** Where: `ProfilePage/index.jsx:65`. Lanes: L2-32.
- **Settings section names are invented where plain words exist** ("Signals," "Membership," "Standing," "Likeness" as "Movements"), and the URL/button/section-name for the plan tab all disagree. Where: `SettingsPage/index.jsx:66-76,953`; `TalentLayout/index.jsx:132`. Lanes: L2-33.
- **"Emerging / Professional / Established" and "Ungendered" use grant-application/garment-industry register instead of the industry's own New Faces → Development → Main ladder or "Non-binary."** Where: `ProfilePage/index.jsx:1086`; `statsTrack.js:18-22`. Lanes: L2-34.
- **Follower/engagement metric tiles appear on the talent's own profile, where boards publish only a link.** Where: `SocialSection.jsx:220-232`. Lanes: L2-36.
- **AI-related permissions are split across two Settings sections with two different consent vocabularies (toggle vs. ledger).** Where: "Data" section vs. "Likeness" section, `SettingsPage/index.jsx:1245-1270`; `LikenessMovement.jsx:458-560`. Lanes: L2-37.
- **"Unplaced" is a coined status for an untyped frame, colliding with "placement" (representation) used elsewhere in the same product.** Where: `frameTaxonomy.js:28,72,103,127`. Lanes: L3-21.
- **A smiling headshot and a back-of-head frame are presented as standard/common digitals requirements, hard-coding a contested, agency-specific preference.** Where: `frameTaxonomy.js:264-278`; `profileReadinessItems.js:133-137`. Lanes: L3-22.
- **Engine-internal vocabulary and raw UUIDs reach the talent** — "VOICE_LABELS," "Type-safety check," "Crop check," "Library state," guardrail messages naming an image by UUID. Where: `CompCard.jsx:894-900,143-162`; `FrameEditor.jsx:869`; `guardrails.js:89,117,126,142,151`. Lanes: L3-23.
- **The composed comp card puts up to four stat lines on the front, and prints a child's exact age rather than a range.** Where: `composition-director.js:967-974`; `compcard-composed.ejs:523-530`. Lanes: L3-24.
- **Every frame on the digitals sheet is stamped with a per-frame month, and undated frames literally print "Undated" on a document sent to an agency.** Where: `pdf.js:1993-1994`; `digitals-sheet.ejs:140-143`. Lanes: L3-26.
- **"Add to Apple Wallet" is shown to every eligible talent and returns raw JSON with an internal error code when signing is unconfigured.** Where: `CompCard.jsx:829-832`; `talent-wallet.js:44-46`. Lanes: L3-27.
- **"Frames" is used as the countable noun for submitted photographs, a term absent from the entire research sample.** Where: `ApplyExperience.jsx:3506,4222,4483`; `briefModel.js`; `PrepareScene.jsx:52-54`; `HouseBrief.jsx`; `SubmissionRecord.jsx:89`. Lanes: L4-19.
- **Stats are dual-unit on the Stats page but cm-only on the Review page the talent is told is "exactly what the agency receives."** Where: `ApplyExperience.jsx:3402-3421` vs `:4141-4152`. Lanes: L4-21.
- **"Development Offer" is short-labelled "New Face" on the agency toast, corroborating the P1 finding.** Where: `CastingDetailPage.jsx:281`. Lanes: L4-23 (see A2 merge).
- **"Offer / Moving Forward" is a slash-compound HR label; "so agencies can cast you" misuses "cast."** Where: `applicationStatus.js:124`; `ApplyExperience.jsx:3366`. Lanes: L4-24.
- **Backend-operations vocabulary reaches the talent** — "redacts the platform snapshot," "Archive prepared"/"Archive manifest," "still need a type read," "so bookers can verify proportions" (the reader is a scouting team, not a booker). Where: `SubmissionThreshold.jsx:21`; `HandoffScene.jsx:394,457`; `PrepareScene.jsx:124`; `packageIntelligence.js:203`; `frameTaxonomy.js:213`. Lanes: L4-25, L8-28.
- **"Researched" is shown to the talent as a directory filter category, describing Pholio's relationship to the agency rather than anything about the agency.** Where: `marketDirectory.js:247-252`. Lanes: L4-26.
- **"Scout"/"Signals" and a deployment-rollout instruction reach users as live copy**, corroborating the P1 "Scout" leak finding — includes a 503 telling a booker to "Ask a Pholio operator to complete the open-call applicant rollout." Where: `materials.js:381-387`; `message-polish.js:41`. Lanes: L5-17 (see A7 merge).
- **"Signing board" toast corroborates the board/division P0-adjacent collision at the toast-copy level.** Where: `CastingNewModal.jsx:74`. Lanes: L5-19.
- **Pholio writes unattributed career advice into an agency's decline email** ("Building a book with smaller clients first is the usual route back") as if the agency said it. Where: `decline-reasons.js:73,80`; `templates-submissions.js:106-110`. Lanes: L5-21.
- **"A talent" is used as a countable noun on agency notifications — outsider usage; "talent" is a board/desk name, not a per-person noun.** Where: `agency-notifications.js:113,133,156,189`. Lanes: L5-22.
- **A roadmap promise ships as a toast on a primary, live-looking CTA** ("Download Comp Card" → "not available yet"), on a product whose PDF generator already works. Where: `RightSidebar.jsx:62-67`. Lanes: L5-23.
- **"Dossier" is the product's word for a talent's submission and reaches the screen, reading badly especially on a minor's application.** Where: `TalentFullView.jsx:41,98,161`. Lanes: L6-20.
- **"Pass rate" is ambiguous, inverted (a high number reads as success but means the opposite), and computed only over the currently-loaded, filtered set.** Where: `ApplicantsPage.jsx:796-801,1262-1267`. Lanes: L6-22.
- **Setup's closing beat says "{Agency} is commissioned" (implying a fee) and "Enter the command center" (SaaS/military register), when the product's own "On the desk" is one screen away.** Where: `SetupPage/index.jsx:322-333`. Lanes: L6-23.
- **A decline reason ("Looking for more experience") and its accompanying advice contradict how New Faces boards work, and edge toward the "build a portfolio first" pitch the industry flags as a scam marker.** Where: `decline-reasons.js:73-83`. Lanes: L6-24.
- **A minor's exact age is shown unconditionally in the review room and CSV export while banded ("Under 18") everywhere else.** Where: `ReviewRoom.jsx:765`; `inbox.js:3481` vs `dossierModel.js:114`; `ComparisonOverlay.jsx:48`. Lanes: L6-25.
- **Two agency status labels read as HR ("Offer / Moving Forward," base "Not moving forward" overridden inconsistently) and one status ("New Face — Development") welds two boards together.** Where: `StatusText.jsx:32-45,63-66`. Lanes: L6-26.
- **"Export call sheet" exports an applicant contact spreadsheet named for the platform, not a real per-model call sheet with time/location.** Where: `LineupPanel.jsx:105-114`; `inbox.js:3557-3613`. Lanes: L7-15.
- **Discover calls a brief's people "Roles" (acting register, and an internal LLM-schema noun) while the event side correctly calls the same thing "Looks."** Where: `BriefLine.jsx:182-193`; `parse.js:76-78`. Lanes: L7-16.
- **Team seats use consulting/property titles ("Principal," "Managing Agent") with no New Faces seat despite intake being the job this product serves.** Where: `team-presence.js:14-28`. Lanes: L7-17.
- **"Event cast" is used as a countable noun with no attestation in the research sample, and "Who to book" mislabels an unpaid slot's lineup header.** Where: `EventsPage.jsx:58,68,76`; `LineupPanel.jsx:166`. Lanes: L7-19.
- **Boards declared at agency setup cannot later be added, renamed, or retired — there is no Boards panel in Settings, and `/roster` redirects back into the intake inbox.** Where: `SetupPage/chapters.js:71-79`; `SettingsPage.jsx:22-41`; `App.jsx:168`. Lanes: L7-20.
- **"Exclusive elsewhere" is computed and shown without knowing where "elsewhere" is, or who the viewing agency is — including to the agency that itself holds the exclusive.** Where: `audience-dto.js:494-501`; `ScoutRoom.jsx:103,573-580`. Lanes: L7-21.
- **Registry-maintainer field labels (written to describe third-party forms) are shown verbatim to a booker choosing Requirements fields, including duplicate/overlapping options with no basis to choose between them.** Where: `SpecBuilderPanel.jsx:192-196`; `taxonomy.json`. Lanes: L7-22.
- **A Settings heading "Signing secret" sits beside a top-level nav item called "Signing" (representation), reading for a moment like a talent-signing feature.** Where: `ExportWebhookPanel.jsx:158-161`; `agencyNav.js:26`. Lanes: L7-23.
- **The public portfolio publishes a minor's "Under 18" age band on an indexable public URL, beside their photographs.** Where: `portfolio.js:305-309`; `views/portfolio/show.ejs:63-67,248-250`. Lanes: L8-24.
- **"Gallery" is the software word for the public portfolio's photo grid, where "Portfolio" is the industry's own term.** Where: `views/portfolio/show.ejs:207,288`. Lanes: L8-27.
- **British/American spelling is inconsistent on the same fields ("Hair colour" vs "Hair Color"), and "authorise"/"authorize" split inside the same guardian-consent flow, reading as two people writing.** Where: `comp-card-import/proposal.js:63-64`; `SpecBuilderPanel.jsx:524`; `TalentFullView.jsx:102-103` vs surrounding guardian copy. Lanes: L8-30.

---

## 7. Coined and internal terms: keep, translate, hide, retire

| Term | Where it surfaces | Verdict | Industry word / replacement | Lanes | Disputed |
|---|---|---|---|---|---|
| Readiness / "Agency grade" / "Strong package" bands | `profileScoring.js:380-415`, sidebar | **retire/hide** | Plain checklist counts, no evaluative band | L2 | |
| Archetype / "casting verdict" (quoted AI sentence on card back) | `compcard-standard.ejs:388,461`; `pdf.js:543-563` | **retire** | Delete the read path; no verdict on a comp card | L3 | |
| Pholio ID (Wallet pass) | `pass-content.js` throughout, `.pkpass` filename | **retire/translate** | "Pholio card" / "Digital comp card" — never "ID"/"credential" | L3, L8 | |
| Pholio signal (lane fit score) | `BookingLanesControl.jsx:99-105` | **hide** | Remove; if kept, silent ordering only, never a printed number | L2, L8 | |
| Scout (talent-facing surface name, in bell copy) | `notifications.js:479-535` | **hide** | The surface is "Discover"; drop the internal name from talent copy | L2, L5 | |
| Signing board / Active Boards | `CastingPage.jsx`, `CastingNewModal.jsx`, `AgencyLayout.jsx:131` | **retire/translate** | New Faces (intake) / Packages (client); never "board" | L5, L7, L8 | |
| Match (ledger column / Overview heading) | `ApplicantsPage.jsx:1567`; `OverviewPage.jsx:103` | **retire** | Delete; nothing scores fit | L6 | |
| Grid slot / cell | `guardrails.js:61` | **hide** | "Back-page photo" | L3 | |
| PITS signals | `frameTaxonomy.js:280` | **hide** | Never render key names | L3 | |
| Voice (typeface selector) | `CompCard.jsx:894-900` | **hide** | Remove from UI entirely | L3 | |
| Movement (settings/profile section wrapper) | `SettingsPage/primitives.jsx` | **hide** | It's a CSS/DOM metaphor; use plain section names | L2 | |
| Grainient | `pages/Grainient.jsx` | **hide** | Visual-only; never a label | L6 | |
| Triage (staff-only) | `AgencyRequestsPage.jsx:15` | **hide** | "In review" | L6 | |
| Height field / Scoped work authorization / Applicant track | `taxonomy.json` via `SpecBuilderPanel.jsx:194` | **hide** | Height / Right to work / Board | L7 | |
| Discoverable talent (as a noun) | `DiscoverPage.jsx:634,647` | **hide** | "talent open to being found" | L7 | |
| Type read | `packageIntelligence.js:203` | **hide** | "photo type" | L4 | |
| Snapshot (= stored package) | `SubmissionThreshold.jsx:21` | **translate** | "the copy Pholio holds" | L4, L8 | |
| Bulk (leaked "(bulk)" suffix) | Activity feed, CSV, talent timeline | **hide** | Never expose | L8 | |
| Legacy (representation notes / labels) | `RepresentationSection.jsx:252`; `frame-taxonomy.js` legacy picker options | **translate** | "Previous agencies" / drop "legacy" from picker labels | L2, L8 | |
| Preflight / spec registry / package intelligence / handoff / dossier (internal-only class/route names) | code, class names, comments only | **keep (hidden)** | Fine as internal names — do not let them surface | L1, L4, L8 | Dossier surfaces on-screen elsewhere — see next row |
| Dossier (surfaced on screen) | `TalentFullView.jsx:41,98,161` aria-labels and error text | **translate** | "the record" / "the submission" | L6, L8 | L4/L8 note the *class names* are fine hidden; this is the surfaced instance |
| Case: "Standing" (settings section) | `SettingsPage/index.jsx:72` | **translate** | "Legal & safety" | L2 | Distinct referent from "Standing" below |
| Presence (settings section) | `SettingsPage/index.jsx:68` | **translate** | "Visibility" | L2 | |
| Private context (section name) | `VerifiedAdultSection` | **translate** | Name the actual object | L2 | |
| Audit / "Continue Audit" | Overview CTA | **translate** | "Checklist" / "Finish your profile" | L2 | |
| Fitting (self-measurement step) | `CastingMeasurements.jsx:695` | **translate** | "Your measurements" | L1 | |
| Lane (Editorial/Commercial/Runway) | `LanePlates.jsx`, `CastingProfile.jsx:24` | **translate** | "Work" / the board question | L1 | |
| Discovery submission / monthly Pholio allowance | `submission-program-content.js`; `OpenCallArrivalPage.jsx:362` | **translate/hide** | "Submissions" plain, cap explained as anti-spam | L1, L4, L7 | |
| Booking lane / Primary Lane / Secondary Lanes | `bookingLanes.js`, `BookingLanesControl.jsx` | **translate** | "board" (segment) + "work you're seeking" | L1, L2, L8 | |
| Division (Pholio's 4-way profile-division) | `profile-division.js` | **translate/retire** | Duplicates the agency division system; fold into board segments | L2, L8 | |
| Stats Track token | `statsTrack.js` | **keep concept / translate label** | Keep the mechanism; surface as "Sizing"/"Measurement set," never the raw token | L1, L2, L8 | L1 says keep as-is; L2/L8 want the surfaced label renamed — mechanism itself is undisputed |
| Identity artifact (comp card) | Overview copy | **translate** | "leave-behind" / "one-sheet" | L2 | |
| Ungendered | `statsTrack.js:21` | **translate** | "Non-binary" is the live 2026 board word | L2, L8 | |
| Emerging / Established (experience level) | `ProfilePage/index.jsx:1086` | **translate** | Plain experience phrasing, not a grant-application ladder | L2 | |
| Unplaced / Needs placement | `frameTaxonomy.js:28,72,103,127` | **translate** | "Not set" / "Add a type" | L3 | |
| Register (style_type picker) | `FrameEditor.jsx:876` | **translate** | "Look" or "Market" | L3 | |
| Library state | `FrameEditor.jsx:869` | **translate** | "Status" | L3 | |
| Edition (comp card layout) | `editions.js`, `CompCard.jsx:874-947` | **translate** | "Layout" | L3, L8 | |
| Direction / New direction | `CompCard.jsx:958-969` | **translate** | "Shuffle" / "Try another layout" | L3 | |
| Take / Another take / Recent takes | `CompCard.jsx:970-1080` | **translate** | "Version" | L3 | |
| Casting (photo selection on a card) | `CompCard.jsx:987,996,1014` | **translate** | "Frames" / "Front & back" | L3 | |
| Caster | `CompCard.jsx:132,153`; `composition/index.js`; `talent-wallet.js:25` | **translate** | "Casting director" / "booker" | L3 | |
| Board (on a saved comp card select) | `CompCard.jsx:71,1094` | **translate** | "Use" / "Aimed at" | L3 | |
| Bulk reclassify | `MediaWorkspace.jsx:524` | **translate** | "Move frames" | L3 | |
| House (= agency) | `MarketBoard.jsx`, `HouseBand.jsx`, `TeamRolesGuide.jsx`, `MessagesPage.jsx` | **translate** | "agency" | L4, L7, L8 | |
| The Market (page/nav) | `talentNav.js:24` | **translate** | "Agencies" / "Submissions" | L2, L4, L8 | |
| Package (talent's own materials) | throughout apply/preflight/frame advisories | **translate** | "submission" (majority) | L1 (keep), L2, L3, L4 (keep, flagged), L8 (translate) | **Disputed** — L1 and L4 argue "package" reads naturally in context and nothing better exists; L2/L3/L8 hold it inverts the agency→client direction. Majority: translate. |
| Archive / manifest | `HandoffScene.jsx`, `PrepareScene.jsx` | **translate** | "your folder" / "what's in it" | L4 | |
| Researched (agency filter category) | `marketDirectory.js:247-252` | **translate** | "Send yourself" | L4 | |
| Ledger (submission list) | `SubmissionLedger.jsx` | **keep** | Neutral, not a false claim | L4 | |
| Go-See (for an agency's own meeting) | `applicationStatus.js:105-113` | **translate for this usage** | "Meeting requested" | L4, L5, L6, L8 | L8 notes the *term itself* is industry-native and fine when reserved for client-facing meetings — dispute is about scope, not the word |
| Review focus | `ApplicationsView.jsx:683` | **translate** | "Boards open" | L4 | |
| New Face (short label for Development Offer) | `applicationStatus.js:117` | **translate** | See A2 merge — belongs post-signing only | L4, L6, L7 | |
| Intel | talent nav, `/dashboard/talent/intel` | **translate** | "Activity" / "Who's looked" | L2, L5, L8 | |
| Signals (notifications) | `TalentSignalPanel.jsx`, toasts | **translate** | "Notifications" | L2, L5 | |
| Card pull | `AttentionBlock.jsx`, `MomentumBlock.jsx` | **translate** | "Comp card downloads" | L5, L8 | |
| Advanced / Advances (Intel conversion ladder) | `WeeklyBars.jsx:85` | **translate** | Name the real events (shortlisted, asked for more, invited in) | L5 | |
| Settled (Intel step key) | `conversion.js:23` | **translate** | "represented or kept" (already the honest phrase — use it as the label) | L5 | |
| Sendability enum (`ready`/`caveat`/`hold`) | `materials.js:196-198` | **keep (internal)** | Verdict copy fine; never surface the enum words | L5 | |
| Momentum | `MomentumBlock`, block id | **keep (hidden)** | Never rendered to the user | L5 | |
| Standing (representation/dossier rail) | `divisions.js:331-347`; `StandingRail.jsx` | **keep** | Unambiguous, well-modelled | L6, L7, L8 | Distinct referent from "Standing" (settings section), which is translate |
| The desk / on the desk | `ApplicantsPage.jsx:1260` | **keep** | Native booker speech | L6, L7, L8 | |
| The book / ledger view (agency) | `ApplicantsPage.jsx:1237,1247` | **keep** | Reads well | L6 | |
| Review room / screening room | `ReviewRoom.jsx` | **keep** | Plausible house language | L6 | |
| House note (internal note field) | `ReviewRoom.jsx:969,1102` | **keep** | Reads exactly like an agency's own word — distinct from "house" = agency | L6 | |
| Command center | `SetupPage/index.jsx:332` | **translate** | "the desk" | L6 | |
| Commissioned (of the agency) | `SetupPage/index.jsx:324` | **translate** | "open" / "live" | L6 | |
| Qualification call (staff-only) | `AgencyRequestsPage.jsx:16,148` | **translate (staff-only)** | "intro call" | L6 | |
| Pipeline / stage / funnel | agency chrome, ×7+ locations | **translate** | "submissions," "the desk," "the board" | L6, L7, L8 | |
| Wrapped (of a board) | `CastingPage.jsx:240` | **translate** | "Closed" / "Past" | L6 | |
| Board rack | `CastingPage.jsx:228` | **keep** | Evocative, not a false claim | L6, L7 | |
| Applicant funnel | `OpenCallPanel.jsx:25,178` | **translate** | "Where your submissions come from" | L7 | |
| In consideration | `CastingPage.jsx:58,194` | **keep** | — | L7 | |
| Event cast (noun) | `EventsPage.jsx` | **translate** | "Model call" | L7 | |
| Pool / Designers / Lineup / Pick list | `EventCallPage.jsx`, `PickListsPanel`, `LineupPanel` | **keep** | Verbatim organizer vocabulary | L7, L8 | |
| Looks to cast | `PickListsPanel.jsx:313` | **keep** | — | L7 | |
| Slot (event) | `applicantLifecycle.js:114-121` | **keep** | — | L7, L8 | |
| Role (Discover brief) | `BriefLine.jsx:182,193` | **translate** | "Look," matching the event side | L7 | |
| Not for us | `ScoutRoom.jsx:743,756` | **keep** | Exactly what a booker says | L7 | |
| Scouting / Scout room (agency-side) | `ScoutRoom.jsx:431,445`, nav | **keep** | Attested; distinct from "Scout" leaking to talent copy | L7 | |
| Principal / Managing Agent / Scout·Junior / Seat | `team-presence.js:14-28` | **translate** | Director / Managing Director / Scout / Role | L7 | |
| Revision N (published requirements) | `SpecBuilderPanel.jsx:167,553` | **translate** | "Published 3 Sep 2026" | L7 | |
| Discipline (profile field) | `DisciplineSection.jsx:41` | **translate/merge** | Fold into the board question | L8 | |
| Season memory | `SeasonMemory.jsx:76`; `dossier` | **translate** | "Since they last applied" / "Since last time" | L6, L8 | |
| Readout band / readouts | `ReadoutBand.jsx:70` | **translate** | "At a glance" (or drop the label) | L6 | |
| Mints a link | `ShareLinksBlock.jsx:182` | **translate** | "creates a link" | L8 | |
| Recipient | `SubmissionTerms.jsx:110` | **keep** | Generic but honest | L8 | |
| Organizer | event-casting copy | **keep** | Native for System B | L4, L7, L8 | |
| Material request | `materials.js` | **keep** | Plausible translation | L6, L8 | |
| Likeness consent | `LikenessMovement.jsx` | **keep** | Statutory-native ("digital replica") | L2, L8 | |
| Frame (for one image) | throughout Media page | **keep** (borderline) | Photographic, reads professional in the Media page context | L1, L3, L8 | L4 argues "frames" for *submitted photos* (as a countable noun in the apply flow) is an invented unit and should be "photos" — dispute is about context, not the Media-page usage |
| Frame read / "reads" | `FrameEditor.jsx:863` | **keep** | Real industry usage, honestly attributed | L3 | |
| Digitals | throughout | **keep** | Correct, modern, correctly used | L1, L3, L4, L8 | |
| The Book | talent nav, Media page | **keep** | Correct and native | L1, L2, L3, L8 | |
| Book (talent-facing "your book") | `LoginPage.jsx:390` | **keep** | Correct on talent side | L1 | |
| Pick / maybe / pass | `PickCard.jsx:23-27` | **keep** | Close to AgencyPin's real vocabulary | L1, L6, L7 | |
| Shortlist | throughout | **keep** | Correct, attested | L1, L4 | |
| Digital comp card / Comp card | throughout | **keep** | Attested modern deliverable | L1, L2, L3, L8 | |
| Tearsheet / Test shoot / Campaign | `frameTaxonomy.js:79-84` | **keep** (fix hints) | Correct nouns; hint text needs fixing (see A5) | L3, L8 | |
| Bookout | `AvailabilitySection.jsx`, `bookouts` table | **keep** | Correct booker vocabulary | L1, L2, L6, L7, L8 | |
| Studio+ (plan name itself) | plan name, `studioCopy.js` | **keep** | A plan name is allowed to be a brand — distinct from the *public-page badge*, which is retire (see A9) | L1, L2 | |
| Kept on file | status, notifications | **keep** | Industry-native ("onfile") | L1, L4, L8 | |
| New Faces / Development / Main Board (as agency-side board names) | `divisions.js` LADDER | **keep** — but re-model as *stage*, not board | Correct nouns; the data-model shape is the issue (see A1 STANDINGS finding) | L4, L6, L7, L8 | |
| Conforming export | export README copy | **keep** | Honest and specific | L4 | |

---

## 8. Consistency map: one object, many names

Sorted by variant count, descending. Locations abbreviated.

| Concept | Variants seen (verbatim) | Locations (abbrev.) | Count | Lanes |
|---|---|---|---|---|
| **What kind of work/board this person is for** | Board · Division · Booking lane · Primary/Secondary Lane · Stats Track · Primary Discipline · Type · Register · comp-card "board" select · Signing board (kanban) · Active Boards | `divisions.js`; `booking-lanes.js`; `statsTrack.js`; `profile-division.js`; `statusConfig.js`; `frame-taxonomy.js`; `CompCard.jsx:72`; `CastingPage.jsx`; `AgencyLayout.jsx:131` | 11 variant names / ~8 parallel systems | L1, L2, L3, L6, L7, L8 |
| **Representation (who represents this person, and what state it's in)** | `applications.status='represented'` · `talent_representations` rows · `roster_board_standings.standing='represented'` · legacy `profiles.current_agency` · labels: Represented / Represented by / REPRESENTATION / MOTHER AGENCY / PLACEMENT / Seeking representation / Direct / Not yet represented / In conversation | `application-status.js`; `migrations/20260629234500`; `migrations/20260731120000`; `pass-content.js`; `RepresentationSection.jsx`; `formNormalization.js:116` | 4 stores, 9 labels | L2, L4, L6, L7, L8 |
| **Decline of a submission** | Pass · Passed · Not moving forward · declined · Application closed · Released (event) | `applicantLifecycle.js`; `StatusText.jsx`; `DeclineReasonModal.jsx`; `inbox.js`; `notifications.js` | 6 | L4, L6, L7, L8 |
| **The invitation to a first meeting** | Go-See Requested · Go-See · Invite to a go-see · Invite to meet · Invite to a meeting · Meeting · Meeting requested | `applicationStatus.js`; `ShortcutHelp.jsx`; `ReviewRoom.jsx`; `DecisionDock.jsx`; `StatusText.jsx`; `notifications.js` | 7 | L4, L5, L6, L8 |
| **The talent's public book/portfolio** | The Book · Your Website · Public Profile · Public portfolio / your public book · portfolio images · Gallery · Media | `talentNav.js`; `OverviewPage/index.jsx`; `TalentLayout/index.jsx`; `SettingsPage/index.jsx`; `views/portfolio/show.ejs`; `/dashboard/talent/media` | 7 | L2, L3, L8 |
| **New Faces / Development (pre- vs post-signing)** | New Face · New Face — Development · Development offer — New Face · Development Offer | `StatusText.jsx`; `statusConfig.js`; `CastingDetailPage.jsx`; `applicationStatus.js`; `notifications.js`; `templates-submissions.js` | 5 (labels), 2 conflated boards | L4, L5, L6, L7, L8 |
| **The submitted/inbound object itself** | submission · application · package · dossier (internal) · apply · record · frames (talent-facing) | `applications` table; `submission_packages`; `preflight-service.js`; `SubmissionThreshold.jsx`; `ApplyExperience.jsx`; `SubmissionRecord.jsx` | 6-7 | L4, L8 |
| **The agency/organizer itself** | agency · house · organizer · recipient · model management company | `MarketBoard.jsx`; `HouseBand.jsx`; `event-casting.js`; `SubmissionTerms.jsx`; `submission-tracker.js` | 5 | L4, L7, L8 |
| **Digitals-recency "rule"** | 90 days · 180 days ("aging") · 6 months · unnumbered "the window agencies expect" · 8-12 weeks · 3 months / 12 weeks | `digitals-freshness.js`; `photo-intelligence.js`; `CompCard.jsx`; `frameTaxonomy.js`; `profileScoring.js`; `templates-submissions.js`; `DigitalsSet.jsx` | 6 | L2, L3, L4, L5, L6, L8 |
| **Height/measurements rendering format** | 3 stats-formatter implementations (differing order/units/kids-track) · imperial-only · imperial+metric stacked · metric+imperial inline · unlabelled bare `82-62-89` | `pdf/composition/stats-formatter.js`; `shared/lib/stats-formatter.js`; `pdf/routes/pdf.js`; `DiscoverPage.jsx`; `ScoutRoom.jsx`; `present.js`; `casting-stage-helpers.js` | 3 implementations + 4 display formats | L2, L3, L7, L8 |
| **Availability** | talent: available/limited/unavailable (2 unmapped agency-side) · agency: available/onbooking/option/1st-2nd option/onhold/booked/bookout/released/inactive (9 values) · third talent set: Full-Time/Part-Time/Freelance/Weekends/By Appointment · bookouts (correct model) | `AvailabilitySection.jsx`; `statusConfig.js`; `ProfilePage/index.jsx:65-71`; `bookouts` table | 3 incompatible vocabularies | L2, L6, L8 |
| **Auto-close of an unanswered submission (whose window, and what it means)** | "Under Review"/"the agency is reviewing" (talent tracker) · "late"/"cold — treat as closed" (Intel) · "{n} past the read window" (Intel lede) · still open until day 30 (auto-close) · "the talent is told it was not taken forward" (agency settings) · "Closed automatically — the review window lapsed" (activity log) | `applicationStatus.js`; `intelTheme.js`; `DecisionStack.jsx`; `application-auto-close.js`; `NotificationsPanel.jsx` | 6 | L4, L5, L6, L8 |
| **Weight** | excluded (canonical stats formatter) · excluded (designer DTO allowlist) · labelled permanently-empty cell (onboarding review) · rendered (profile, public portfolio, fallback comp card) | `stats-formatter.js`; `audience-dto.js`; `CastingMeasurements.jsx`; `MeasurementsSection.jsx`; `views/portfolio/show.ejs` | shown on 3 surfaces, correctly excluded on 2 | L1, L2, L3, L8 |
| **Parent/guardian phrasing** | "parent or guardian" · "legal guardian" · "Parent or legal guardian" · "Guardian" (alone) · "guardian authorisation"/"authorization" (spelling split) | `MeasurementsSection.jsx:69`; `CastingMeasurements.jsx:787`; `TalentFullView.jsx:102`; `DigitalsSet.jsx:87`; email/materials copy | 5 | L2, L5, L8 |
| **A minor's body measurements, once collected** | withheld (review room UI) · shown (dossier plate) · shown (comparison overlay) · shown (CSV export) · shown (public portfolio) · shown (STATS.txt export) · shown (embedded PDF JSON) | `ReviewRoom.jsx:139-142`; `DossierPlate.jsx:150`; `comparison.js:134`; `inbox.js:3455`; `views/portfolio/show.ejs`; `stats-block.js`; `machine-readable.js` | 6 shown, 1 withheld (client-side only) | L3, L6, L8 |
| **"Board" as a name for the review kanban vs. as division** | agency division ("File to a board," setup) · per-brief kanban that "closes"/"gets wrapped" (`/signing`) | `chapters.js:74` vs `CastingPage.jsx:203-240`; `overviewData.js:95-104` | 2 senses colliding | L5, L6, L7, L8 |
| **"Pipeline" in agency-facing chrome** | nav group label · "in pipeline" (board select) · "in pipeline" (boards table) · "pipeline movement" (notification settings) · "runs casting pipelines" (roles guide) | `agencyNav.js`; `BoardSelect.jsx`; `BoardsTable.jsx`; `NotificationsPanel.jsx`; `TeamRolesGuide.jsx` | 5+ occurrences | L6, L7, L8 |
| **Error/failure register** | careful, human-voiced product copy (e.g. "That's not a no.") vs. raw developer/ops sentences ("Run `npm run migrate`", "Add R2_BUCKET to Netlify") shown unconditionally to talent and bookers | `api-error-message.js`; `error-handler.js`; `MediaWorkspace.jsx:796`; `ProfilePage/index.jsx` | 2 registers, undifferentiated | L5 |

---

## 9. What is working and must be preserved

### Compliance / consent copy
- The open-call consent screen (`consentCopy.js:138-165`): field-by-field data handling, verbatim-restated compensation, a **dated** 90-day retention promise, honest withdrawal language, and "A submission is a request for review and does not guarantee selection, a booking, or payment." (L1)
- "Pholio is not a talent agency and does not guarantee representation, bookings, or income." (`SubscriptionCheckoutDisclosure.jsx:46-47`) and its twin in `submission-program-content.js` / `SubmissionThreshold.jsx:16-17`. (L1, L2, L4)
- "Most submissions are declined or archived without a reply." (`submission-program-content.js`). (L1)
- The `LikenessMovement` per-purpose consent ledger — scope/purpose/compensation/duration, append-only history, refuses to grant against text it can't display; the NY FWA §1034/§1035 shape done properly. (L2, L8)
- The checkout disclosure's ROSCA/CA-ARL trial line and affirmative tick. (L2)
- Per-agency guardian authorization for minor submissions, explicitly non-transferable to another agency. (L4, L6)
- Withdrawal copy naming the limit of the platform's power: "Copies already downloaded by the agency cannot be recalled." (L1, L4)
- Requirements are advisory, and the UI says so plainly; publishing freezes a dated version so applicants keep the version they were measured against. (L7)
- Compensation cannot be left unstated on an event call, and the organizer's own sentence is the sentence the applicant consents to, verbatim. (L7)
- The disown page's honest limit-of-power framing. (L1)

### State model
- `application-status.js` as a whole: `closed_no_response` deliberately excluded from `WRITABLE_APPLICATION_STATUSES` so an agency can't record silence as a decision; `confirmed`/`declined_by_talent` on the event path are talent-writable only. (L2, L4, L7, L8)
- `application-auto-close.js`: silence recorded as silence, never as `passed`, `user_id: null` on the activity row. (L2, L4, L5, L6, L8)
- `kept_on_file` grouped as `advancing`, never `closed`. (L2, L5, L8)
- `resolveStanding` defaults to `unknown`, never inferring a positive representation claim from absence. (L6, L7, L8)
- `STANDING_ALIASES` deliberately excludes availability values from standing — "a talent on a first option is still represented." (L7, L8)
- The pick-list mark taxonomy (Pick/Maybe/Pass) matching real client-feedback vocabulary. (L1, L6, L7)
- Event-slot statuses kept structurally distinct from representation — a confirmed slot is never conflated with a signing. (L2, L4, L5)

### Data model
- `talent_representations` — mother agency vs. placement, market, territory, exclusivity, dates; better-modelled than most agency software exposes to talent. (L2, L4, L6, L8)
- `roster_board_standings` — multi-board membership with provenance. (L8)
- `src/domains/pdf/composition/stats-formatter.js` — the single most industry-accurate module in the repo: canonical order, dual units, a real kids track with structural B/W/H omission, weight suppressed except fitness. (L3, L4, L8)
- `src/domains/talent/services/digitals-freshness.js` — four honest states (current/aging/stale/undated); "undated is never reported as current." (L3)
- The measurements recency attestation and shoe-region capture with an explicit "scales are not interconvertible" comment. (L1)
- The representation *rows* (mother vs. placement, market, territory, division, exclusivity, start date) — this is the best-modelled object in the profile lane. (L2)

### Event casting
- Pool → Designers → Lineup with designer pick lists (pick/maybe/pass), a near-exact implementation of the real open-event system. (L4, L7)
- The confirmation is the model's: `confirmed`/`declined_by_talent` are talent-writable only, and the UI states this plainly. (L7)
- Designers never see contact details or minors — enforced structurally (`applyMinorSubmissionFilter`, force:true), not just promised. (L7)
- `event-casting.js`: mandatory `compensation_type` with no "unspecified" option, `PICK_MARKS` explicitly documented as never an application status. (L4, L8)
- Two-stage intake (apply → shortlist), respecting the applicant's time before asking for more. (L1)

### Emails
- The default decline body: "They don't give a reason, and there isn't one to read into it." — the single best sentence in the product. (L5)
- "That's not a no." on the kept-on-file email. (L5)
- "An invitation isn't an offer... A legitimate agency never asks you to pay to be represented." (L5)
- The billing/trial-ending email — a genuine ROSCA-grade document. (L5)
- The new-device email's refusal to include a clickable button. (L5)
- The open-call receipt's "That wasn't me" disown link, always present. (L1, L5)
- The footer system: per-tier, `NEVER_ASKS` on security mail, a scoped preference link. (L5)

### Agency intake vocabulary
- The triage verb set — Shortlist / Pass / Keep on file / Request digitals / Invite to meet / Offer representation — the closest thing to real agency vocabulary seen in software. (L6, L7)
- The decline-reason taxonomy: describes the agency's situation, never the person; "No reason" is default; the reviewer sees the exact sentence before sending. (L5, L6)
- `measurementProvenance`: "Self-reported · never confirmed," with a comment explaining the verified branch was deleted because the product can't produce it. (L6)
- The Scout room leading with the representation gate ("Exclusive elsewhere · Check before you approach") before anything else. (L7)
- Discover's self-stated boundary about what it does and doesn't expose to a scout, and its refusal to publish a match score or number. (L7)
- "Route — We invited them / They came to us" as plain sentences rather than badges. (L6)
- Setup's `AGENCY_TYPES` (Mother agency / Market agency / Management) with correct scouting-vs-booking hints. (L6)
- The open-call brief fields reading like real agency copy, near-verbatim to the research. (L7)
- Protected characteristics refused with a stated reason, not silently hidden. (L7)
- The response-window control (plain days, 0 = off, states exactly what it does to the talent). (L6)

---


## 10. Recommended order

1. **Minors, before any outside tester touches the product** (P0-1 to P0-5): one minor predicate,
   one stats formatter with a kids track, exports and webhook gated, guardian contact on kids
   cards, no pass for minors, minimum age, split and time-boxed guardian consent. Small diffs;
   the correct model exists in the composed comp-card formatter.
2. **Stop asserting what Pholio cannot know** (P0-6, P0-8, P0-10, P0-11, P0-12, P0-13): "Sent"
   instead of "Under Review"; one template per event; no default "Editorial"; checklists not
   grades; delete the mock OAuth path; "declared" not "verified".
3. **Fix the three wrong-shaped objects** (P0-7, P0-9, P0-14, P0-19): representation through one
   table with two attestations; availability from bookouts; comp card from the book with an
   agency block; the pass becomes a digital comp card or is retired.
4. **Name the agency workspace in the trade's words** (P0-18, L6-17, L7-07, L8-11 to L8-14):
   Signing → New Faces / Packages; Pipeline → Applications or Scouting; house → agency; Market
   nav → Agencies; package reserved for agency → client.
5. **Rewrite the pre-auth register** (P0-15, P0-16, P0-21): first-beat copy, the four-line safety
   block, the public portfolio's stat lines, remove the adult-content section.
6. **Collapse the taxonomies** (PM-3, PM-7): segment × stage boards assigned by agencies; job
   types on frames and briefs; retire "booking lanes", "stats track" and "New Face" as outcomes.
7. **Make silence Pholio's** (PM-8): window attribution, auto-close email, shortlisted end state,
   agency-side notice.
8. **Then the P1 catalogue** in section 5, in the order listed, and the P2 polish.

Two decisions belong to the owner rather than to engineering: whether the agency workspace keeps
a Kanban at all (PM-1: the trade's own tools keep intake near-empty), and whether the Wallet pass
survives as a digital comp card (PM-9). Both are product bets, not industry mirrors, and the copy
must not describe either as "how agencies work".

## 11. Dead or unreachable code carrying issues

- `client/src/domains/onboarding/pages/AgencyOnboardingPage.jsx` (627 lines) — imported nowhere; carries a full agency setup flow, including `SCOUT`/`Scout` role options. Its absence is what makes L1-19 a live bug. (L1)
- `client/src/domains/onboarding/pages/CastingBirthdate.jsx` — orphaned client component; its server route/state-machine branch remains live. (L1)
- `client/src/domains/auth/components/TalentSpotlight.jsx` — imported nowhere; carries a banned eyebrow pattern ("The Talent Platform"). (L1)
- `views/auth/partners.ejs` — never rendered (`/partners` now redirects/410s); carries stale "Join as an Agency or Scout" copy. (L1)
- `FramePits` reading chips (`CastingScout.jsx:34-52,228-230`) — permanently empty; `slot.signals` never assigned. (L1)
- The `?ref=agency` "Agency Invitation" modal in the live public portfolio template, against a 410 endpoint. (L1)
- `client/src/domains/talent/components/RightSidebar/*` — unimported; renders a fabricated "🌟 Trending with agencies" claim over a hard-coded 75% progress ring, and a "Download Comp Card" button that only toasts a not-yet-built message. (L2)
- `bookingLaneSignals.js` / the "Pholio signal" block — inert only because `fit_score_*` columns were dropped by migration and blocklisted; the display code should be removed so it can't be revived. (L2, L8)
- `ProfileReadinessAudit.jsx` — unimported; carries the "audit" framing. (L2)
- `ProfileGateBanner variant="page"` — unreachable (`RESTRICTED_TALENT_ROUTES = []`), but a sibling constant still describes a lock ("Market locked") that no longer exists on that route. (L2)
- `AUDIENCE.CONFIRMED_JOB`/`CONFIRMED_JOB_FIELDS` — no caller; this is what the "On-set Safety" release promise (Theme A9) points at. (L2, L8)
- `notificationHelpers.js` `agency_profile_view: 'Agency interest'` category — reachable only via `NotificationInbox`, itself used only by the agency bell; the same interest-inference issue as the talent side. (L2)
- `notifyTalentAgencyProfileView`/`refreshAgencyViewNotificationTitle` — no callers anywhere; carries the worst individual string in the product ("showed repeat interest... viewed your profile 4 times recently"), naming a real agency. (L5)
- Four email senders with zero callers: `sendWelcomeTalentEmail`, `sendWelcomeAgencyEmail`, `sendNewDeviceSignInEmail`, `sendCardDeclinedEmail` — new talent get no welcome/receipt, no new-device alert ever fires despite the fingerprint being recorded; the parked welcome template hard-codes a fake personalisation. (L5)
- `buildWelcomeAgencyEmailHtml` headline "Your board is ready." — dead, but would surface the board/division homonym at its worst if ever wired live. (L5)
- Four unreachable `DECISIONS` branches in the submission email template (`kept_on_file`, `shortlisted`, `development`, `represented`) — never sent; a future `closed_no_response` send would silently fall through to the `declined` template and print "passed on your submission." (L5)
- `views/errors/{403,404,422,500}.ejs` — effectively dead in the deployed (serverless) runtime; every production error is JSON instead, which is where the actual leaked developer copy lives. (L5)
- `src/domains/pdf/templates/compcard.ejs` (legacy classic template) — carries the *correct* representation/agency-logo model that the live composed engine lacks; worth harvesting before deletion. (L3)
- `onboarding_signals.casting_verdict`/`archetype_label` — no live writer, but the read path and demo profile are live, making the quoted-verdict finding a real bug against a mostly-dead data source. (L3)
- `profiles.image_analysis` — written on every primary-photo upload, read by nothing (the flattener deliberately returns empty string); a live privacy-relevant write with no live consumer. (L3)
- `SHOT_LEGACY_ONLY`/`IMAGE_TYPE_LEGACY_ONLY` picker options — surface the word "legacy" to a talent whenever an old row holds one of these values. (L3, L8)
- `client/src/domains/talent/components/market/MarketCoverage.jsx` (512 lines) + `useMarketCoverage.js` — unimported, carries its own unaudited copy. (L4)
- Status `reviewing` ("In Review") — present client-side (labels, filters, agency stage map) but absent from `WRITABLE_APPLICATION_STATUSES`; no writer exists anywhere, so the honest mid-state this catalogue recommends has nowhere to live yet. (L4, L6, L8)
- `TIMELINE_WORDS` keys `submitted`/`accepted`/`declined`/`booked`/`note_added` — `application_activities` only ever stores `status_change`/`auto_closed`; `booked` additionally contradicts the server's own stated rule that a confirmed booking must never be stored on an application. (L4, L8)
- `DEFAULT_REPRESENTATION_INTAKE_SPEC` — documented as "not yet wired," but is in fact live for the spec-validation path and locks in the mandatory-measurements P1 finding. (L4, L8)
- `formatCastingMeasurements` — returns a bare, unlabelled `"82-62-89"` string; currently invisible because no client maps the field, but must be fixed (units, minor guard) before anything renders it. (L7)
- `STATES` in `statusConfig.js` — `getState` falls back to `STATES.available` for any unknown value, the root mechanism behind the P0 "shown as Available" bug; also has no live callers in the agency client beyond the one path already flagged. (L6, L7, L8)
- `CASTING_PIPELINE_STAGES` — returned by the API, never read; the client builds its own competing `COLUMNS` list. (L6)
- `mapCastingStageToApplicationStatus` accepts a legacy `stage` body param that no client sends. (L6)
- `POST /api/agency/boards/:boardId/duplicate` — no client caller; also drops `board_type`/`client_name`/`closes_at`/`target_slots` on copy, so a duplicated package board would silently become a division board if ever wired. (L6)
- Board "Type" select (`CastingNewModal.jsx`) — reachable and interactive, but the selected value is never transmitted (see A7). (L7)
- `src/routes/upload.js` — not mounted anywhere in `src/app.js`; the only place in the codebase that writes the word `'Polaroid'` to the database. (L8)
- `client/src/domains/talent/utils/representationStatus.js` — imported only by its own test, despite JSDoc claiming it's consumed by `OverviewPage`; name-collides with a different, live `deriveRepresentationStatus` in `formNormalization.js`. (L8)
- `profiles.fit_score_runway|editorial|commercial|lifestyle|swim_fitness` — no writer anywhere; only readers and purgers remain, so the "Pholio signal" panel renders only for legacy rows. (L2, L8)
- Configs for statuses `reviewing`/`rejected` in the talent status map, and `underreview`/`review` in the agency status map — none are valid values in `ALL_APPLICATION_STATUSES`, so the DB constraint can never hold them. (L8)
- `IMAGE_TYPE_LEGACY_ONLY`/`SHOT_LEGACY_ONLY` — see above, cross-referenced. (L3, L8)
- `Screen Test` — CSS/comment token only, not user-facing; flagged only so it isn't promoted to a real label later. (L8)
- `STAGE_MAP.archived` / `POST /applications/:id/archive` — writable server-side, no UI action reaches it and no lifecycle tab shows it; an archived submission is currently invisible on the desk. (L6)
- `src/domains/internal/routes/event-funnel.js` — mounted with no corresponding page. (L6)
- `client/src/App.jsx` `/onboarding/test` — reachable in production with no dev-only guard (also listed under Section A7 as a live leak, not merely dead code). (L1)

---

## 12. Coverage

**Combined scope actually read across all eight lanes:** the full talent onboarding/auth/pre-auth flow and public token-gated pages (L1); the talent dashboard shell, Overview, Profile, and Settings (L2); the talent's media/book, digitals, comp-card + PDF pipeline, public portfolio, and Apple Wallet pass (L3); talent Applications/"Market" and off-Pholio export flows (L4); Intel, Messages, all transactional email templates, notifications, toasts, and server error copy (L5); the agency intake side — setup, Overview, Submissions inbox, TalentFullView dossier, CSV/webhook exports, and internal agency-request review (L6); agency Signing boards, Discover/Scout, Events, Team, Settings, Messages, and Activity (L7); and the cross-cutting vocabulary/data layer — shared constants, migrations, and the services that read them (stats formatters, submission-profile snapshotting, auto-close, talent-age, Wallet pass content, spec-registry exports) (L8). Each lane read its route/component tree in full for user-facing strings and traced server routes/services far enough to verify every CLAIM, DATA, and STATE finding against the actual code path (not assumed from naming).

**Explicit gaps, as lanes themselves declared them:**
- Marketing-site content, legal pages, and any `pholio-landing` surfaces were out of scope for every lane (repo boundary).
- `.claude/skills/**`, `docs/audits/**`, `tasks/**`, `DESIGN.md`, and `CLAUDE.md` were excluded as vocabulary authorities by the shared brief rule across all eight lanes, even where in-repo comments cite them as a taxonomy source (e.g., `divisions.js` and `roster_board_standings` cite `.claude/skills/industry/reference/standards.md`, not opened by any lane); findings rest on the R0–R5 research files only.
- CSS/`.module.css` files were read only where a class name was itself load-bearing to a finding.
- L1 did not audit agency-side surfaces, the talent dashboard proper, comp-card PDF internals, or email templates — deferred to L2–L7 as scoped.
- L2 did not audit The Book/Media, Applications/Market/Apply, Intel, Messages, onboarding, any agency surface, PDF/EJS templates, or the moderation queue.
- L3 did not audit PDF layout/typography internals (geometry/rendering with no user-facing strings beyond what's cited), `__tests__/*`, the spec-registry surface, or agency-side rendering of the same objects (only cross-checked that `DigitalsContactSheet`/`DigitalsSet` share predicates).
- L4 did not read R5 directly (its minor/legal findings rest on R1 §4.3 and R3 §7 as cited within other lanes' research); did not audit agency-side surfaces beyond two cross-check files, the public open-call apply pages, or comp-card generation internals.
- L5 sampled rather than enumerated per-route error-message inventories (surface-map group 32); did not audit agency Signing-board internals, onboarding/open-call copy, comp-card/PDF templates, the Wallet pass, or spec-registry exports beyond the strings that pointed into them.
- L6 did not audit Signing boards/Discover (groups 18-19, owned by L7 — read only far enough to confirm the board homonym and that the Discover field allowlist differs from the webhook's), or Events/Team/Messages/Activity (groups 20-24).
- L7 did not audit the Submissions inbox/ReviewRoom/ComparisonOverlay, TalentFullView/dossier internals, agency Overview, or Setup (owned by L6); read email templates only far enough to confirm one subject line.
- L8's own coined-term and consistency-map work depends on the migrations list and shared constants being exhaustive; individual page-level surfaces beyond the vocabulary/data layer were read only for the specific strings needed, not audited as a full surface.
- No lane read Slack/Discord or other out-of-repo channels; all findings are grounded in code, migrations, and the R0–R5 research corpus as delivered to each lane.
