# Lane 8: cross-cutting concepts, the data model beneath the words · audience: both

Scope: the vocabulary system (`src/shared/constants/*`, `client/src/shared/constants/*`, the domain-local
label maps), the schema under it (`migrations/`, `profiles`, `applications`, `talent_representations`,
`roster_board_standings`, `bookouts`), and the shared services that read them
(`stats-formatter.js`, `submission-profile.js`, `application-auto-close.js`, `talent-age.js`,
`pdf/composition/stats-formatter.js`, `wallet/services/pass-content.js`, the CSV/webhook/spec exports).
Surface-map group 31 plus the migrations and shared services those constants feed.

---

## Verdict

The **vocabulary layer is unusually good and the data layer underneath it is not**. Someone has clearly
read the industry: `application-status.js` refuses to let an agency record silence as a decision;
`kept_on_file` is grouped as a soft yes rather than a rejection; `talent_representations` models mother
agency vs placement with market, territory, exclusivity and dates; `roster_board_standings` lets a talent
sit on several boards; `resolveStanding` defaults to `unknown` rather than inventing a representation
claim; the comp-card engine has a real kids track that structurally omits B/W/H. A booker reading those
files would recognise the business.

Then the same product does five things a professional would not forgive. **A guardian's consent is
treated as the switch that unlocks bust/waist/hips collection from a 15-year-old** — the exact
practice BFMA calls inappropriate — and once collected those numbers travel, unredacted, into the agency
submission snapshot, the CSV download, the exported STATS.txt and the public `/p/:slug` page beside an
"Under 18" label; the only place they are hidden is one React component. **A talent who sets themselves
"Unavailable" is displayed to every agency as "Available"**, because the talent-side vocabulary
(`available|limited|unavailable`) and the agency-side vocabulary (`available|onbooking|option|hold|
booked|bookout|released|inactive`) were written by different hands and the lookup falls back to
`STATES.available`. **"Under review" and "The agency is reviewing" are asserted the instant a submission
is created**, before anyone has opened it — the one claim R1's whole §3 says no agency will make.
**Representation is written unilaterally by the agency** into `applications.status`, and now competes
with three other stores of the same fact. And **six overlapping taxonomies** (discipline, stats track,
booking lane, profile division, agency division, frame style) all claim to answer "what kind of work is
this person for", with "Editorial" and "Curve" appearing in four of them at once.

The headline gap: **the product's words were audited against the industry; the columns, defaults and
fallbacks under them were not.** Every P0 below is a place where a correct label is served by a wrong
default, a missing branch, or a lookup that fails open.

---

## Findings

### L8-01 [P0] [MINOR] Guardian consent is modelled as the switch that unlocks a minor's bust/waist/hips
- **Where:** `src/shared/lib/talent-age.js:8-21` (`SENSITIVE_MEASUREMENT_FIELDS`), `:95-97`
  (`minorSensitiveFieldsUnlocked`), `:113-122` (`canCollectSensitiveProfileFields`);
  enforced at `src/domains/talent/routes/profile.js:936-955`. Talent copy at
  `client/src/domains/talent/pages/ProfilePage/MeasurementsSection.jsx:59-73` and
  `client/src/domains/onboarding/pages/CastingMeasurements.jsx:787`.
  Reachable via `/dashboard/talent/profile` (Measurements section) and `/onboarding` (measurements step).
- **String/state:**
  - `"Measurements and weight stay locked until a parent or guardian consents in Personal Details."`
  - `"Body measurements stay locked until a parent or guardian consents."`
  - server 403: `"Date of birth and guardian consent are required before measurements or weight can be saved."` (`code: MINOR_CONSENT_REQUIRED`)
  - `minorSensitiveFieldsUnlocked(profile) { if (!isMinorProfile(profile)) return true; return hasGuardianConsent(profile); }`
- **Industry reality:** BFMA Code of Practice, verbatim: *"We believe it is inappropriate to measure any
  young person under the age 18 except for their height."* (R2 §5.4; R3 §4.7; R5 §4 table, §7 item 5).
  This is a rule about the **child**, not about who consents — a guardian cannot make it appropriate.
  R3 §7 item 4 states the product consequence directly: *"Bust/waist/hip capture offered to an under-18
  account… This must be a structural omission, not a blank field."* Kids' cards carry age, height,
  clothing size, shoe (R3 §4.7).
- **Why it fails:** the gate is built as consent-to-collect rather than don't-collect. The copy actively
  teaches a 15-year-old and their parent that the correct move is to record consent so the body
  measurements can be entered. A UK agency reading this would treat it as a BFMA breach; the comp-card
  engine three modules away already gets it right (`pdf/composition/stats-formatter.js` kids branch), so
  the product disagrees with itself.
- **Fix:** make B/W/H, chest, inseam and weight **structurally unavailable** below 18 regardless of
  guardian consent — remove the fields from the minor form rather than locking them, and reject them
  server-side on `isMinorProfile` alone. Keep guardian consent for what it is actually for: full-length
  imagery, public exposure, contact routing and per-agency disclosure (all already built and correct).
  Replace the copy with a statement of the rule, e.g. *"Under 18, Pholio records height only. Agencies
  take any further measurements in person, with a guardian present."*

### L8-02 [P0] [MINOR] Once collected, a minor's measurements are transmitted everywhere; the only redaction is client-side
- **Where:**
  - `src/shared/lib/submission-profile.js:110` — `snapshot.stats = buildCanonicalStats(source);` (no
    minor branch), while `:117` correctly redacts socials for minors. Snapshot is frozen into the
    submission package retained 24 months.
  - `src/domains/agency/routes/inbox.js:3452-3454` — CSV export builds
    `` `Bust: ${app.bust}` `` / `Waist` / `Hips`, and `:3482` exports `age: derivedAge`, while `:3477-3478`
    null email/phone for minors. Reachable via `GET /api/agency/export` from
    `/dashboard/agency/submissions`.
  - `src/domains/spec-registry/export/stats-block.js:97-99` — the exported `STATS.txt` in the
    off-Pholio ZIP also calls `buildCanonicalStats`, no minor branch.
  - `views/portfolio/show.ejs:50-67,238-250` with `src/routes/portfolio.js:519` — the public
    `/p/:slug` page prints `publicStats.fields` (bust/waist/hips), `Weight`, and an `Age` row whose value
    is literally `"Under 18"` (`src/routes/portfolio.js:305-309`). Mounted at `src/app.js:920`.
  - `src/domains/agency/services/applicant-identity.js:170-178, 469-472` — same string in the webhook /
    identity payload.
  - The **only** redaction: `client/src/domains/agency/components/review/ReviewRoom.jsx:424`
    `buildConfirmationStats(profile, { hideBody: isMinor })` and the flag at `:789-794`
    `"Body measurements withheld · route all correspondence through the guardian on record."`
- **String/state:** `"Body measurements withheld"` is shown to the agency while the same request body
  carries `stats.bust`, `stats.waist`, `stats.hips`, `stats.fields[]` and `age`.
- **Industry reality:** BFMA (R5 §4): under 18 → height only; body/bikini/lingerie digitals of under-18s
  are *"unacceptable"*. R3 §7 item 4: structural omission, not a blank field. R5 §7 items 5-6. Storm's
  and Elite's published minor handling is deletion and guardian-only routing (R5 §3, §4).
- **Why it fails:** a client-side `hideBody` is not data minimisation — it is a stylesheet. The numbers
  are in the JSON any agency member can read in devtools, in a CSV file that leaves the platform, in a
  ZIP the talent emails to a third-party agency, and on a public URL next to the words "Under 18". The
  flag text asserts a withholding that did not happen, which is worse than not claiming it.
- **Fix:** redact at the source. Have `buildCanonicalStats` accept the profile's minor state (it already
  receives the row containing `date_of_birth`) and return the kids field set — age, height, clothing
  size, shoe, hair, eyes — exactly as `pdf/composition/stats-formatter.js` already does. That single
  change fixes snapshot, CSV, STATS.txt, public portfolio and webhook at once. Suppress the public
  portfolio's `Age` row entirely for minors (publishing "Under 18" beside a child's photos on an
  indexable URL is a safeguarding problem in its own right — see L8-24).

### L8-03 [P0] [STATE] A talent who declares "Unavailable" is shown to agencies as "Available"
- **Where:** talent writes `available|limited|unavailable` at
  `client/src/domains/talent/pages/ProfilePage/AvailabilitySection.jsx:27-31` →
  `profiles.availability_status` (`migrations/20260710090400_profile_availability_and_bookouts.js`).
  Agency reads it at `src/domains/agency/services/talent-dossier.js:358` (`status: profile.availability_status`)
  → `client/src/domains/agency/components/dossier/ReadoutBand.jsx:83-84` and `CalendarLine.jsx:36`
  → `AvailabilityCell` → `client/src/domains/agency/components/status/statusConfig.js:88-103`.
  Reachable via `/dashboard/agency/talent/:applicationId`.
- **String/state:** `STATES` has keys `available, onbooking, booking, option, firstoption, secondoption,
  onhold, hold, booked, bookout, released, inactive` — **no `limited`, no `unavailable`** — and
  `export const getState = (status) => STATES[norm(status)] || STATES.available;`
- **Industry reality:** two failures at once. (a) The mechanical one: the lookup fails **open** on the
  two values that mean "do not send me out". (b) The conceptual one, R2 §2.1: *"'Available / Unavailable'
  as a talent-set toggle — Availability is a date-range concept on a chart (bookout), never a global
  on/off flag. A model is not 'unavailable'; they are 'booked out 12–19 Oct'."* The product already has
  the correct object — the `bookouts` table, with the correct industry word.
- **Why it fails:** an agency looking at the dossier sees a green "Available" cell in the same visual
  system used for `Booked` and `1st Option`, presented as a booking-desk fact. It is (i) a talent
  self-declaration, (ii) about an unsigned applicant with no chart, and (iii) wrong in the two cases
  that matter. A booker who acts on it and finds the model unavailable will not use the tool again.
- **Fix:** delete `profiles.availability_status` and its control; keep `bookouts` and render the dossier's
  availability line from date ranges only ("Booked out 12–19 Oct", "No bookouts recorded"). If a coarse
  flag must survive, give `STATES` `limited` and `unavailable` entries, change the fallback to a
  `Standing unknown`-style neutral (as `resolveStanding` already does correctly at `divisions.js:396`),
  and label it as talent-declared, never in the booking-state palette.

### L8-04 [P0] [CLAIM] "Under Review" / "The agency is reviewing" is asserted at submit time, before anyone opens it
- **Where:** `client/src/domains/talent/utils/applicationStatus.js` — `pending` and `submitted` configs
  (`label: 'Under Review'`, `next: "The agency is reviewing — we'll notify you the moment this changes."`).
  Server copy: `src/shared/services/notifications.js:305-312` (`title: "Application under review"`,
  `body: "${agency} is reviewing your submission."`) and `:404-411`
  (`title: "Application submitted"`, `body: "Your application to ${name} is in review."`).
  Reachable via `/dashboard/talent/applications` and the notification bell on every submission.
- **String/state:** the status is set to `pending`/`submitted` by the submit handler itself. No agency
  read event, open, or view feeds it — `applications` has no `first_viewed_at`, and nothing in
  `WRITABLE_APPLICATION_STATUSES` corresponds to "opened".
- **Industry reality:** R1 §2 lists *"Your application is under review by 3 agencies"* in the
  make-a-booker-flinch table: *"Agencies do not disclose pipeline state at all… A status tracker implies
  a service level nobody offers."* R1 §8: *"'Application status: Under review' (implies a service level
  no agency offers)."* R1 §3: ONE Management forbids status enquiries outright. R0 §E21: the platform
  *"cannot know intent, interest, suitability."* R5 §5.5 puts the enforcement lane on it — FTC v. Explore
  Talent, settled at $500,000, was exactly "implying a named party is interested when it is not".
- **Why it fails:** the product asserts a third party's behaviour it has no signal for, to the one
  audience most likely to over-read it. It also undercuts the auto-close design (L8-19), which is
  premised on silence being the norm — you cannot say "they are reviewing" on day 0 and "they never
  responded" on day 30 and be believed on either.
- **Fix:** say only what Pholio observed. `"Sent"` / `"Sent 3 Sep — no reply yet"`, with the honest frame
  the industry uses: *"Most submissions get no reply. If an agency is interested, you'll hear from them."*
  Introduce a real `Viewed` state only if an agency-open event is actually recorded, and name the observer
  (R0 §E21: "Opened by Elite NY, 2 Sep").

### L8-05 [P0] [CONCEPT] Representation is written unilaterally by the agency, and four stores now claim the same fact
- **Where:** `src/domains/agency/routes/inbox.js:1698-1760` — `PATCH /api/agency/applications/:id/status`
  accepts any member of `WRITABLE_APPLICATION_STATUSES`, which includes `represented`
  (`src/shared/constants/application-status.js:34-46`). No talent acknowledgement exists anywhere in the
  path. Downstream: `src/shared/lib/email.js:229` `subject: \`Representation confirmed by ${agencyName}\``;
  `src/shared/services/notifications.js:344-347` `"Representation confirmed" / "${agency} marked your
  representation agreement complete."`; `client/src/domains/talent/utils/applicationStatus.js`
  `represented → label 'Represented'`; `inbox.js:427` `represented_count`.
- **The four stores of "who represents this person":**
  | Store | Written by | Read by |
  |---|---|---|
  | `applications.status = 'represented'` | agency, unilaterally | talent status label, email, notification, agency `represented_count` |
  | `talent_representations` (mother/placement, market, territory, exclusivity, dates) | talent only (`source in ('legacy','profile')`) | Wallet pass (`wallet/services/pass-content.js:137-166`), public portfolio DTO |
  | `roster_board_standings.standing = 'represented'` | agency, per board | agency roster / DivisionMark |
  | `profiles.current_agency` (free-text legacy) | talent | wallet fallback (`pass-content.js:160-165`) |
- **Industry reality:** R2 §1.4: *"an agency signs, a model accepts. There is no mutual-match ceremony…
  The transition is offer of representation → contract signed → placed on a board."* R2 §3.3: contract
  signed is the only transition that *"obligates both."* R0 §E22: *"Representation status is a legal fact
  the platform cannot verify unless both parties attest; it must be labelled as 'declared by talent' /
  'recorded by agency' accordingly."* R5 §1: representation is a **fiduciary** relationship under NY
  Labor Law Art. 36.
- **Why it fails:** one click by one agency member produces an email to the model saying representation is
  *confirmed*, and a dashboard that says *Represented*. Nothing records the model's acceptance, the
  contract, its term, its market, or its exclusivity — all of which the product already has columns for,
  in a different table the agency cannot write to. Meanwhile a talent can be simultaneously
  "Represented by Elite" (from an application row) and "Seeking representation" on their own Wallet pass
  (from `talent_representations`), because the two models never meet.
- **Fix:** (1) rename the agency-writable status to `representation_offered` / keep `accepted` as the
  terminal agency state, and make `represented` reachable **only** when both a `talent_representations`
  row exists and the agency has recorded it — i.e. two attestations. (2) Give `talent_representations` a
  `source` value of `agency` and an `attested_by` pair so the DTO can say *"declared by talent"* vs
  *"recorded by <agency>"* vs *"confirmed by both"*. (3) Make every representation reader (wallet, public
  portfolio, overview, roster) read `talent_representations` — retire representation-by-application-status.

---

### L8-06 [P1] [DATA] The shoe conversion shown on the profile is arithmetically wrong — EU comes out roughly double
- **Where:** `client/src/shared/utils/measurementConversions.js:31-41`, rendered at
  `client/src/domains/talent/pages/ProfilePage/MeasurementsSection.jsx:211`. Reachable via
  `/dashboard/talent/profile` whenever a shoe size is entered.
- **String/state:**
  ```js
  'US': { 'UK': s - 1, 'EU': (s * 2) + 31 },
  'UK': { 'US': s + 1, 'EU': (s * 2) + 33 },
  'EU': { 'US': (s - 31) / 2, 'UK': (s - 33) / 2 }
  ```
  Rendered as `≈ UK 7.0, EU 47.0` for a US 8.
- **Industry reality:** the standard ladder (R3 §4.5; and the product's own correct constants at
  `src/domains/pdf/composition/stats-formatter.js:47` `SHOE_EU_OFFSET = { women: 31, men: 33 }`) is
  **EU ≈ US + 31** for women and **US + 33** for men. US 8 women = UK 6 = EU 39. The `* 2` is a bug:
  the profile prints EU 47 for a foot that is EU 39. The US→UK offset of `−1` is also the men's offset;
  women's is `−2` (Premier's own two panes show `Shoe 6` UK / `39` EU for the same model, R2 §4.1).
  R3 §4.5: *"There is no universal shoe number; a single unlabelled shoe field is a localisation bug the
  moment the profile crosses a border."*
- **Why it fails:** a talent copies "EU 47" onto a European agency form. Two different modules in the same
  repo disagree about the same conversion, and the wrong one is the one the talent reads.
- **Fix:** delete `getShoeConversions` and call the already-correct `renderShoe`/`shoeDual` from
  `src/domains/pdf/composition/stats-formatter.js` (offsets 31/33, UK handling per track). Drive the
  track from `resolveStatsTrack`, not from a single hard-coded offset.

### L8-07 [P1] [DATA] Dress size has no region — the whole product assumes US, and the picker offers a US-only ladder
- **Where:** `client/src/domains/talent/pages/ProfilePage/MeasurementsSection.jsx:283-296` — options
  `['0','2','4','6','8','10','12','14','16','XS','S','M','L','XL']`, no region control (unlike shoe,
  which has one). `migrations/…add_shoe_region.js` added `shoe_region`; there is **no** `dress_region`.
  Consumers assume US: `src/domains/pdf/composition/stats-formatter.js:52-58`
  (`DRESS_EU_OFFSET = 32`, `UK 4`, `FR 34`, `IT 36`) and `:224` `renderDress` → `US 10 / EU 42`.
- **Industry reality:** R3 §4.5: *"Dress/suit sizing is not globally comparable either (US 2 ≈ UK 6 ≈
  EU 34 ≈ IT 38 ≈ FR 36)… Store the locale with the size."* R3 §8: the evidence for a single conversion
  ladder is thin enough that the safe design is to store what the talent meant.
- **Why it fails:** a London talent picks "10" meaning UK 10 (US 6). The comp card prints
  `DRESS US 10 / EU 42`, i.e. two sizes too big in one system and four in the other. Nothing in the UI
  tells them the number is being read as US.
- **Fix:** add `dress_region` (US/UK/EU/IT/FR) with the same toggle pattern the shoe field already uses,
  default it from the profile's market/city rather than to US, and convert from the stored region.
  Suit size (`suit_size`, free string) needs the same treatment — `deriveSuitSize` at
  `pdf/composition/stats-formatter.js:441-450` assumes inches unconditionally.

### L8-08 [P1] [DATA] Menswear profiles are required to supply hips, which are never displayed; collar and cup exist nowhere
- **Where:** `src/shared/lib/stats-formatter.js:243-260` (`hasCoreMeasurements` requires `hasHips` for
  every track) vs `:322-335` (the menswear render pushes height, chest, waist, inseam, suit, shoe, hair,
  eyes — never hips). Readiness copy at
  `client/src/domains/talent/components/profileReadinessItems.js:52-55`:
  `label: 'Measurements (Bust/Waist/Hips)'` for every talent. Form renders Hips unconditionally
  (`MeasurementsSection.jsx:260-274`). No `collar` or `cup`/`bra` column exists in any migration; the
  comp-card importer parses both (`src/domains/talent/services/comp-card-import/parse-card.js:46,358`)
  and has nowhere to put them.
- **Industry reality:** R3 §4.4 (Wilhelmina men's board, verbatim label order):
  `Height · Chest · Waist · Suit · Collar · Inseam · Shoe · Hair · Eyes`. Women's:
  `Height · Bust · Bra · Waist · Hip · Shoe · Hair · Eyes`. R1 §4.2: Wilhelmina and BMG both ask for
  Collar, Suit, Inseam; Wilhelmina, Elite and Bridge ask for Cup/Bra. Hips are not a men's board stat.
- **Why it fails:** a male talent is blocked from send-readiness until he measures his hips, then never
  sees the number again — a requirement that visibly serves nothing. And the product tells talent (via
  `client/src/domains/talent/content/agencyBriefs.js:265`) that Wilhelmina asks for cup and collar while
  offering no field to record either, so the importer silently drops them.
- **Fix:** make `hasCoreMeasurements` track-aware (menswear: height + chest + waist + inseam; womenswear:
  height + bust + waist + hips). Add `collar_cm` and `cup_size` columns and render them in the canonical
  order (collar between waist and inseam for menswear; bra/cup immediately after bust for womenswear).
  Make the readiness label track-aware instead of hard-coding "(Bust/Waist/Hips)".

### L8-09 [P1] [CONCEPT] Six overlapping taxonomies answer "what kind of work is this person for", and four of them contain "Editorial"
- **Where:**
  | # | Name shown to users | Values | File |
  |---|---|---|---|
  | 1 | "Primary Discipline" | model / performer / creator | `migrations/20260701100100_add_profile_discipline.js`; `ProfilePage/DisciplineSection.jsx:15-47` |
  | 2 | "Stats Track" | womenswear / menswear / ungendered | `client/src/shared/constants/statsTrack.js`; `DisciplineSection.jsx:60-66` |
  | 3 | "Primary Lane" / "Secondary Lanes" | 13 slugs incl. editorial, commercial, runway, beauty, curve, petite, fit, parts, creator_ugc | `src/shared/constants/booking-lanes.js`; `BookingLanesControl.jsx:37-92` |
  | 4 | (derived, drives readiness copy) | fashion_editorial / commercial_lifestyle / talent_performance / fit_showroom | `src/shared/constants/profile-division.js` |
  | 5 | Board / Division (agency) | 21 divisions in 4 `kind`s (roster/market/ladder/specialist) | `client/src/domains/agency/components/status/divisions.js:88-112` |
  | 6 | Type (agency) | editorial / commercial / runway / fitness / curve | `statusConfig.js:31-38` |
  | 7 | Register (frame) | editorial / commercial / lifestyle / beauty / ecommerce / swimwear / fitness / couture | `src/shared/constants/frame-taxonomy.js:88-105` |
  | 8 | Comp-card "board" | Commercial / Editorial / Runway / Fitness / Curve / Beauty | `client/src/domains/talent/components/CompCard.jsx:72` |

  "Editorial" appears in 3, 5, 6, 7, 8. "Curve" in 3, 5, 6, 8. "Fitness" in 3, 5, 6, 7, 8.
- **Industry reality:** R2 §1.1-1.2 says the industry organises around **one** object with **two axes**:
  segment (Women / Men / Non-binary / Curve / Classic / Kids / Talent / Creators) × career stage
  (New Faces → Development → Main → Image). R2 §8: *"A roster screen that cannot answer 'show me Women /
  New Faces' is missing the industry's primary organising key."* R2 §6.2: "board" and "division" are a
  register split for the same thing, not two things. Nothing in the sample has a third or fourth parallel
  axis a talent self-selects.
- **Why it fails:** the same word means a different thing depending on which screen you are on. A talent
  picks "Editorial" as a booking lane, is auto-assigned `fashion_editorial` as a division, tags a frame
  "Editorial" as a register, and names a comp card "Editorial · NYC" — and none of those four values talk
  to each other or to the agency's Editorial board. There is no place where a talent's declared work type
  is compared with an agency's actual board.
- **Fix:** collapse to two published axes plus one private one. (a) **Segment × stage** = the agency's
  board (`divisions.js`, already correct — keep `kind` internal, stop presenting `ladder` boards as peers
  of `roster` boards, see L8-20). (b) **Market** = what the talent gets booked for; keep exactly one
  vocabulary for this and use it for booking lanes, agency `Type`, frame register and comp-card purpose —
  they are the same list. (c) Keep `stats_track` as the measurement-set switch only, and retire
  `profile-division.js` (its only output is coaching taglines that can key off the market list).

### L8-10 [P1] [DATA] Gender still drives the stats set at both ends, and "Ungendered" is silently un-representable on a card
- **Where:**
  - Onboarding: `client/src/domains/onboarding/pages/CastingMeasurements.jsx:36-53` —
    `statFieldsFor(gender)` returns `[]` for anything that is not `'Female'` or `'Male'`, with the comment
    *"Non-binary / Prefer not to say (and unknown) are offered no stats in onboarding."*
  - Profile: `stats_track` is a real, editable field (correct), but is **seeded from gender**
    (`client/src/shared/constants/statsTrack.js:38-49`, `migrations/20260701100000_add_stats_track_fields.js`).
  - Comp card + Wallet: `src/domains/pdf/composition/stats-formatter.js:389-406` `resolveStatsCategory`
    honours `womenswear`/`menswear` but **falls through for `ungendered`** to gender, then to
    *"Non-binary / unknown with a torso circumference defaults to the women set."* No caller passes
    `options.category` from a user preference (`pdf/composition/index.js:452`,
    `wallet/services/pass-content.js:236`, `spec-registry/export/spec-export-service.js:258`).
- **String/state:** `warnings.push("Gender missing or non-binary — '${category}' track inferred from
  available measurements.")` (`stats-formatter.js:507`) — an internal warning that is never surfaced, so
  the talent is never told.
- **Industry reality:** R2 §2 records **Non-binary as a live board** at Select Model Management (nav
  label `"Non-binary"`) and Chadwick Sydney (`/divisions/main/non-binary`), and R1 §7 records The Option
  Agency publishing a non-binary height gate (5'7"+). R3 §4.4 gives two ordered stat sets; a
  non-binary model books on one of them, not on neither.
- **Why it fails:** a non-binary talent is offered **no stats at all** during onboarding, then chooses
  "Ungendered" on the profile — and the comp card, the Wallet pass and the exported STATS.txt quietly
  put them on the womenswear or menswear track anyway, chosen by whether a torso circumference happens to
  be present. There is no user-visible control over the printed set, and the one warning that notices is
  swallowed.
- **Fix:** make `stats_track` the single authority end to end. In onboarding, offer the track (not the
  gender) as the stats question, defaulting to `ungendered` where gender is not `Female`/`Male`. Give
  `buildStatsBlock` an `ungendered` category with the neutral ordered set `buildCanonicalStats` already
  defines (`stats-formatter.js:337-345`), and pass the resolved track from every caller. Never infer a
  gendered set from the presence of a measurement.

### L8-11 [P1] [TERM] "Signing board" and "Active Boards" collide head-on with `board` = division
- **Where:** `client/src/domains/agency/pages/CastingPage.jsx:203` `<h1 className="sg-title">Signing</h1>`;
  `:190` `'Signing boards gather the talent you are considering for a client or a season.'`;
  `:230` `'Open your first signing board to start reviewing talent for a client, a season, or a division.'`;
  `:238` `<FolioSection title="Open boards" …>`. Persistent chrome:
  `client/src/shared/layouts/AgencyLayout.jsx:131` `` `${activeBoards} Active Board${…}` ``.
  Routes `/dashboard/agency/signing[/:boardId]` (`client/src/App.jsx:161-162`). Meanwhile
  `divisions.js` and `BoardSelect.jsx` use "board" for the division a talent sits on.
- **Industry reality:** R2 §8, verbatim: *"'Signing board' — **actively harmful**. 'Board' is a taken
  word meaning division. 'Signing board' parses as 'the division called Signing'. Any kanban-style UI
  must not be called a board in this domain."* R2 §1.1: agencies publish a phone number per board — it is
  a desk, a client list and a career stage at once.
- **Why it fails:** the same agency screen uses "board" for two unrelated objects, one of which the
  agency has authored names for. Worse, the description names a **third** thing: "talent you are
  considering for a client" is a **package** (R2 §1.7, R4 §2.1 — agency→client), not signing, and not a
  division.
- **Fix:** rename the kanban object to something that is not "board" and is honest about what it holds.
  If it is a per-client/per-brief selection, call it a **selection** or **package** and describe it as
  "the talent you are putting in front of a client". If it is an intake triage list, call it
  **New Faces** or **Submissions**. Reserve "board" exclusively for divisions, and change the header KPI
  to `${n} Active Selections` (or drop it).

### L8-12 [P1] [TERM] "House" is used for an agency; in this industry a house is the agency's client
- **Where:** `client/src/domains/talent/components/market/MarketBoard.jsx:87-88`
  `"Search a house, a city, a board"` / `"Search the market"`;
  `client/src/domains/talent/components/market/MarketCoverage.jsx:334` `"Reading what the houses publish…"`,
  `:443-446` *"…the house, and the house's own band is where its full brief lives… Each list is the
  house's own"*; `client/src/domains/agency/components/BoardIdentityEditor.jsx:211` `"House color"`;
  component names `HouseBand`, `HouseBrief`. Reachable via `/dashboard/talent/applications`.
- **Industry reality:** in fashion, a **house** is a design house — Chanel, Dior, a brand. That is the
  **client** the agency sells to (R2 §2: *"Client — The brand/publication/production that hires. NOT the
  model"*; NY DOL's statutory `Client`). The agency is an **agency** or, statutorily, a **model
  management company** (R5 §2). R5 §6 "Terminology corrections": *"Use 'agency' / 'model management
  company'."*
- **Why it fails:** "Search a house" on a screen listing modelling agencies inverts the two parties in
  the transaction. A booker reads it as "search brands". It also collides with "House color" on the
  agency's own branding panel, where "house" correctly means "in-house".
- **Fix:** use **agency** everywhere the object is an agency ("Search an agency, a city, a board";
  "Reading what agencies publish"). Keep "house" only in the in-house sense ("House note, kept internal",
  `ReviewRoom.jsx:1102` — that one is fine).

### L8-13 [P1] [TERM] "Market" is the talent nav label for the agency directory, while "market" elsewhere means a booking city
- **Where:** `client/src/shared/constants/talentNav.js:24` `{ label: 'Market', to: '/dashboard/talent/applications' }`.
  The other meaning, in the same product: `talent_representations.market` / `.territory`
  (`migrations/20260629234500_create_talent_representations.js`), `profiles` market
  (`migrations/20260710090300_add_profile_market.js`), the Representation form's
  `label="Market" placeholder="e.g. New York"` (`RepresentationSection.jsx:216-221`), Wallet's
  `PLACEMENT` line joining `[market, territory]` (`pass-content.js:191`), and
  `CompCard.jsx:73 CARD_MARKETS = ['NYC','LA','Miami','London','Paris','Milan','Tokyo']`.
- **Industry reality:** R2 §1.5 — a market is a booking city: *"she's placed with Next in New York and
  Viva in Paris."* Placements, mother-agency splits and territory scope are all defined against it. There
  is no industry sense in which "the Market" means "the list of agencies you can apply to".
- **Why it fails:** a talent reads "Market" in the nav, then fills in "Market: New York" on the same
  product's representation form, meaning something entirely different. The one word the industry uses
  most precisely has been spent on a directory.
- **Fix:** rename the nav item to **Agencies** (or **Submissions**, which is what the page's second half
  actually is) and keep "market" for booking cities only. Also un-hardcode `CARD_MARKETS`: the industry's
  market list includes Seoul, Shanghai, Berlin, Barcelona, Sydney, Hamburg, Cape Town (R2 §1.5).

### L8-14 [P1] [TERM] "Package" names the talent's own submission, reversing the direction of the real object
- **Where:** pervasive and user-facing — `src/domains/spec-registry/preflight-service.js:280-297`
  (*"Your current package has no confirmed match for…"*, *"Matched by a confirmed fact in your current
  package"*), `SubmissionThreshold.jsx:21` (*"Pholio retains the package for up to 24 months"*),
  `ApplyExperience` (*"Your package goes to the agency"*, *"Your package is current. It can go out
  today."*), `frame-taxonomy.js` advisories (*"Add a clean digital full-length shot to your package"*),
  `SubmissionRecord.jsx:89` (*"A package"*), plus `package-intelligence.js`, `packageFingerprint`,
  `submission_packages`.
- **Industry reality:** R2 §1.7: *"When an agency proposes talent to a client, it sends a **package**…
  the direction of travel is **agency → client**. Talent do not build packages; bookers do."* R4 §2.1
  and §3.1 both put PACKAGE on the agency→client leg. The talent-built inbound object is a
  **submission** (R1 §2, 6 sources) or an **application**.
- **Why it fails:** it is the one word in the product that a booker will read as meaning the opposite of
  what it says. It also makes the genuinely correct sentence *"Your package goes to ${name} for
  representation review"* read as though the talent is sending a booker's package to a client.
- **Fix:** call it a **submission** throughout the talent-facing surfaces ("Your submission is current",
  "Pholio retains your submission for up to 24 months"). Keep "package" available for the future
  agency→client artefact, where it will be correct.

### L8-15 [P1] [LEAK] Raw status enum values and "(bulk)" are shipped to talent in the submission timeline
- **Where:** written at `src/domains/agency/routes/inbox.js:1745-1752`
  `` `Application moved to ${requestedStatus}` `` and `` `Application moved to ${requestedStatus} (bulk)` ``
  (also `"Not moving forward (bulk)"`, `"Representation offered (bulk)"`, `"Application archived (bulk)"`).
  Served verbatim to the talent at `src/domains/talent/routes/applications.js:3236-3253`
  (`description: row.description`) and rendered at
  `client/src/domains/talent/components/market/SubmissionRecord.jsx:56-58` (`{event.description}`).
  Reachable via `/dashboard/talent/applications` → open any submission.
- **String/state:** the talent literally reads *"Application moved to kept_on_file"*,
  *"Application moved to closed_no_response"*, *"Application moved to requested_more"*,
  *"Representation offered (bulk)"*.
- **Industry reality:** R0 §F and the brief's LEAK lens — enum values and internal job names are backend
  vocabulary. R1 §8: "Rejected" and raw pipeline states are words no agency writes to a model. Separately,
  "(bulk)" tells the applicant they were processed in a batch, which is true but is the agency's internal
  method, not a fact the agency chose to disclose.
- **Why it fails:** the product already owns a complete, careful talent-facing label map
  (`client/src/domains/talent/utils/applicationStatus.js`) and then bypasses it by shipping the raw
  string. Underscored enum values in a timeline are the single loudest "built by engineers" tell.
- **Fix:** stop sending `description` to the talent. Send `activity_type` plus `old_status`/`new_status`
  from the existing metadata and render through `statusConfig()`. Never expose "(bulk)".

### L8-16 [P1] [TERM] "Pipeline" is in the agency's persistent chrome and in three other places
- **Where:** `client/src/shared/layouts/AgencyLayout.jsx:131` `` `${pipelineTotal} in Pipeline` `` (the
  always-visible status strip); `client/src/domains/agency/components/BoardSelect.jsx:171`
  `` `${b.application_count} in pipeline` ``; `client/src/domains/agency/components/overview/BoardsTable.jsx:102-103`
  `'No submissions in pipeline'`; `client/src/domains/agency/pages/TeamPage`'s
  `TeamRolesGuide.jsx:6` *"Reviews talent, runs casting pipelines"*;
  `client/src/domains/agency/pages/SettingsPage.jsx:34` *"Submission and pipeline alerts"*.
- **Industry reality:** R2 §2.1: *"'Pipeline' — Sales-CRM register. Agencies do track scouted people, but
  the framing is discovery-and-investment, not conversion funnel."* R2 §8: *"alien."* R4 §2.4 ranks
  `pipeline` among the words that most badly break the frame. The native words are **scouting**,
  **submissions**, **the board**, **the chart**.
- **Why it fails:** it is in the chrome, so every agency user sees it on every screen. It also mislabels
  what it counts — the number is inbound submissions, which agencies call submissions.
- **Fix:** `${n} Submissions` in the status strip; "No submissions yet" in BoardsTable;
  "Reviews submissions and runs the board" in the roles guide; "Submission alerts" in settings.

### L8-17 [P1] [CLAIM] "Pholio signal — Editorial 82" shows a machine fit score to talent
- **Where:** `client/src/domains/talent/pages/ProfilePage/BookingLanesControl.jsx:99-105` —
  `aria-label="Pholio lane signal"`, `<span>Pholio signal</span>`,
  `{fitSignals.map((item) => \`${item.lane.label} ${item.score}\`).join(' · ')}`, sourced from
  `bookingLaneSignals.js` reading `profiles.fit_score_runway|editorial|commercial|lifestyle|swim_fitness`
  (AI-derived; `migrations/20260212000003_add_modeling_categories_fit_scores.js`, purged on AI-consent
  revocation by `migrations/20260804090000`). Reachable via `/dashboard/talent/profile` for any profile
  that still holds legacy scores.
- **Industry reality:** R2 §2.1: *"'Match' / 'match score' — Nothing in agency software scores
  talent-to-client fit… An algorithmic match score would read as unserious."* R5 §6 MUST NOT list:
  *"Predicting outcomes ('high chance of signing', 'strong match', 'top 5% of applicants') in
  talent-facing copy."* R5 §5.6 item 9: *"An AI 'score' surfaced to a model reads as an implied-outcome
  claim, which is the FTC's exact enforcement lane, and as bias risk."*
- **Why it fails:** it is an unexplained integer, attributed to Pholio, telling a person how well they
  fit a market — the archetypal thing R5 says a talent platform must never publish. No writer for these
  columns exists in the current code (see dead list), so it is also unmaintained.
- **Fix:** remove the panel. If the underlying signal is worth keeping at all, use it to *order* the lane
  options silently, never to print a number at a person.

### L8-18 [P1] [MINOR/SCOPE] The open-call intake vocabulary has no age gate, no guardian fields, and makes measurements mandatory
- **Where:** `src/shared/constants/open-call-intake.js:54-89` (`INTAKE_FIELDS`, the **closed** vocabulary)
  and `:138-153` (`DEFAULT_REPRESENTATION_INTAKE_SPEC`). `adult_attestation` is enforced **only** for
  event calls (`:245-256`); representation calls have no minimum age and no attestation. There is no
  `guardian_name` / `guardian_email` / `guardian_phone` key in the vocabulary at all.
  `core_measurements` is `REQUIRED` at apply for representation calls. The anonymous path documents the
  gap itself at `src/domains/opencall/services/submissions.js:842-868`: *"Real minor intake is out of
  scope for this branch… it is not a policy, and it must be revisited by the minors workstream."*
  Reachable via `/opencall/:code`.
- **Industry reality:** R1 §4.3 — every sampled agency publishes a floor (14 at IMG and ONE, 15 at
  Storm and Elite, 16 at Society) and a guardian mechanism; Society uses dedicated
  `parentName`/`parentEmail`/`parentPhone` fields and deletes the record if guardian approval does not
  arrive in 15 days; Storm requires guardian **photo ID upload**; IMG records two guardians with
  relationship each. R5 §7 items 1-4: set a minimum age, make the guardian the account holder and the
  only channel, time-bound the verification with deletion on failure. R5 §5.5: under-13 acceptance is a
  COPPA charge (the FTC v. Explore Talent count). On measurements: R1 §4.2 — Storm, Premier, Models 1,
  Society and IMG collect **height only** at first submission; R1 §6.1: *"A product must not treat
  measurements as universally mandatory."*
- **Why it fails:** a public URL with no account accepts a date of birth of any value and demands body
  measurements as a condition of submitting, with no guardian in the loop and no deletion clock. That is
  simultaneously the BFMA breach in L8-01 and a COPPA/parental-consent exposure, on the one surface with
  no authentication in front of it.
- **Fix:** (a) add `guardian_name`, `guardian_email`, `guardian_phone` to the closed vocabulary and make
  them required-when-minor on every call kind; (b) add a platform minimum age and an age gate to
  representation calls, as `adult_attestation` already does for events; (c) drop `core_measurements` from
  `DEFAULT_REPRESENTATION_INTAKE_SPEC` to `OPTIONAL` (height stays required) and force it to `HIDDEN`
  when the DOB indicates a minor; (d) add a retention clock with deletion on absent guardian approval,
  mirroring Elite's 15 days / Storm's 30 days.

### L8-19 [P1] [CLAIM] Auto-close attributes Pholio's default 30-day window to the agency
- **Where:** `src/shared/lib/application-auto-close.js:38` `DEFAULT_REVIEW_WINDOW_DAYS = 30` (used
  whenever `agencies.application_review_window_days` is null). Talent copy:
  `src/shared/services/notifications.js:339-342` *"`${agency}` did not respond within its review window.
  Treat this as a pass and keep going."*; `client/src/domains/talent/utils/applicationStatus.js`
  `closed_no_response.detail: 'The agency did not respond within its review window.'`
- **Industry reality:** R0 §E24: *"Silence-as-outcome must be attributed to the platform's window, not to
  the agency ('no response within Pholio's 30-day window', not 'the agency closed your application')."*
  R1 §3 shows the real windows agencies publish and how much they vary (1 week at Bridge, 2 weeks at
  Nemesis and ONE, 2-3 weeks at The Agency Arizona, 30 working days at Storm) — and eleven of
  twenty-four publish none at all.
- **Why it fails:** the mechanism is right and unusually honest (the module's own header is the best
  writing in the repo), but the sentence hands an agency a policy it may never have set. An agency that
  reviews on a 60-day cycle is told by Pholio, to its own applicants, that it failed to respond.
- **Fix:** branch the copy on whether the window was agency-set. Agency-set: *"`${agency}` publishes a
  `${n}`-day review window and it has passed."* Default: *"No reply within Pholio's 30-day window. Treat
  this as a pass."*

### L8-20 [P1] [CONCEPT] `STANDINGS` merges three separate lifecycles onto one axis, and ladder boards are peers of roster boards
- **Where:** `client/src/domains/agency/components/status/divisions.js:88-112` (`DIVISIONS` with
  `kind: roster | market | ladder | specialist` — `newfaces`, `development`, `mainboard` are entries
  alongside `women`, `men`, `curve`) and `:370-392` (`STANDINGS`:
  `represented, active, developing, shortlisted, onfile, inactive, ended, passed, unknown`).
  Persisted at `migrations/20260731120000_create_roster_board_standings.js:37-48`.
- **Industry reality:** R2 §1.2: boards are *"almost universally a **matrix of two axes**"* — segment ×
  career stage — and the URL evidence is unambiguous: Premier `/women/new-faces/`, Storm
  `/new-faces/women/`, Chadwick `/divisions/development/women`, Milk `/section/curve-new-faces`. A model
  is on *Women / New Faces*, one board, not on "Women" and "New Faces" as two boards. R2 §1.3: stage is a
  promotion ladder the agency drives. Meanwhile `shortlisted`, `onfile` and `passed` belong to the
  **intake** lifecycle (R2 §3.1 states [1]–[3]), not to board standing at all.
- **Why it fails:** an agency that creates "Women" and "New Faces" as separate boards can put a talent on
  both, and neither answers the question a booker actually asks. And a dossier reading
  *"Standing: Shortlisted on Women"* mixes an inbox state into a roster fact — the exact confusion
  `divisions.js:341-360` correctly refuses to make for availability, but makes here.
- **Fix:** model a board as `(segment, stage)` — a talent's roster row carries a segment board and a
  stage on it — and let `DIVISIONS` `kind: ladder` become the stage enum rather than a board. Split
  `STANDINGS` into `standing` (represented / developing / active / inactive / ended) and the existing
  application status (`shortlisted` / `kept_on_file` / `passed`), which already lives on `applications`.

### L8-21 [P1] [DATA] Intake collects measurements as 240 characters of free text, and height as cm only
- **Where:** `src/shared/constants/open-call-intake.js:67-71`
  `core_measurements: { kind: "text", label: "Measurements" }` and
  `height: { kind: "number", label: "Height (cm)" }`. Storage bound at
  `src/domains/opencall/services/submissions.js:137` `core_measurements: 240`. Projected onward at
  `src/domains/agency/services/applicant-identity.js:518` `measurements: measurementsFrom({ raw: answers.core_measurements })`.
  Reachable via `/opencall/:code` and the materials request at `/opencall/materials/:token`.
- **Industry reality:** R0 §C16: *"Software that stores stats freeform, single-unit, or undated reads
  amateur."* R1 §4.2: *"Height is the only measurement that is universal"* and it is *"offered as a
  dropdown showing cm and ft/in together on every European form"*, with US forms using split feet/inches
  (`Height (feet)` / `Height (inch)` at ONE Management). R3 §4.5 gives the canonical formats.
- **Why it fails:** a US applicant on a US organizer's call is asked for "Height (cm)" and will type 68.
  Free-text measurements cannot be filtered, converted, ordered, compared or promoted into the structured
  columns the rest of the product depends on — the whole "your application becomes your profile"
  projection breaks on this one field.
- **Fix:** make `height` a dual-unit input (cm + ft/in, as every European agency form does) and split
  `core_measurements` into the same structured keys the profile already has (`bust_cm`/`chest_cm`,
  `waist_cm`, `hips_cm`), driven by the talent's stats track, with the region carried alongside.

### L8-22 [P1] [DATA] Every legacy `current_agency` string was backfilled as a *mother agency*
- **Where:** `migrations/20260629234500_create_talent_representations.js:99-118` — for every profile with
  a non-empty `profiles.current_agency`, the backfill inserts
  `relationship_type: "mother", scope_key: "|", is_exclusive: false, status: "active"`.
  Read back on the Wallet pass as `label: "MOTHER AGENCY"` (`wallet/services/pass-content.js:186`).
- **Industry reality:** R2 §1.5: a mother agency is a specific role — *"the agency that discovered/
  developed the model and manages their overall career; it keeps a cut of everything, everywhere,
  indefinitely."* It is not a synonym for "the agency I'm with". Most represented models' answer to
  "who is your agency" names a **placement**, not a mother agent.
- **Why it fails:** the migration converts an unqualified free-text answer into a specific commercial
  claim, then prints it on a Wallet pass under the heading MOTHER AGENCY. It also consumes the
  single-active-mother slot (`migrations/20260629234600`), so the talent cannot later record their real
  mother agent without first deleting a relationship they never entered.
- **Fix:** backfill as `relationship_type: 'placement'` (the safer default) or, better, add an
  `unspecified` relationship type and render it as "Agency" until the talent confirms which it is.
  Prompt legacy profiles once to classify.

### L8-23 [P1] [TERM] "Pholio ID" presents a Wallet pass as an identity credential
- **Where:** `src/domains/wallet/services/pass-content.js:3-17` — *"Pholio ID — pass content model…
  **the talent's identity credential in Wallet**"*; user-facing errors at `:227-234`
  (*"Add your name before creating a Pholio ID."*, *"Complete your profile before creating a Pholio ID."*,
  *"Record guardian consent before creating a Pholio ID."*), and `:266`
  `` value: `Pholio ID for ${name.full}. Details are as declared on the Pholio profile at the issue date.` ``
  Entry point: `client/src/domains/talent/components/CompCard.jsx` → `/api/talent/wallet/pass`.
- **Industry reality:** R3 §5, verbatim verdict: *"a Wallet-pass 'model ID' is not a recognised industry
  artefact… A Wallet pass could be defensible as a credential ('represented by X, verified') because
  SAG-AFTRA establishes that shape for performers — but it would be a new category for modelling, should
  never be called a comp card, and **should never be called an 'ID' unless something is actually being
  verified**."* R3 §2 lists "model ID" among the terms practitioners would flinch at: *"No agency in the
  sampled set issues an identity credential to a model."*
- **Why it fails:** nothing on the pass is verified — the module's own back-field text says the details
  are *"as declared"*. Calling a self-declared card an "ID" is the one thing R3 says not to do, and it
  lands next to the scam-adjacent register agencies warn about (R5 §5.2).
- **Fix:** the artefact itself is fine and the design is careful (height in the header, QR to the live
  book, stats in comp-card order, kids track, guardian gate). Rename it. **"Pholio card"** or
  **"Digital comp card"** — R3 §5 item 3 confirms *"PDF/link comp card = universal and expected"*. Drop
  "ID" and "credential" from every string. If a verified thing ever exists (an agency-attested
  representation), that is when an ID-shaped object becomes defensible.

---

### L8-24 [P2] [MINOR] The public portfolio publishes an "Under 18" row on an indexable URL
- **Where:** `src/routes/portfolio.js:305-309` `publicAgeBand` returns the literal string `"Under 18"`;
  rendered at `views/portfolio/show.ejs:63-67` and `:248-250`. Reachable at `/p/:slug` for any minor with
  guardian consent recorded (`minorPublicExposureAllowed`).
- **Industry reality:** R2 §4.2: *"Age and date of birth are NOT shown… A public age field would be a red
  flag."* R5 §4: minors' data is guardian-mediated and minimised.
- **Fix:** omit the age row entirely for minors. An adult "18+" row is defensible; broadcasting minority
  beside a child's photographs is not.

### L8-25 [P2] [DATA] Weight is collected from everyone and published on the public portfolio
- **Where:** `MeasurementsSection.jsx:34-37` (*"Weight renders for every lane"*),
  `views/portfolio/show.ejs:50-55, 241-243`. Correctly suppressed on the comp card unless fitness
  (`pdf/composition/stats-formatter.js:562-570`) and correctly absent from `buildCanonicalStats().fields`.
- **Industry reality:** R3 §4.6 / §7 item 5 — weight is absent from every adult fashion board sampled;
  R1 §4.2 finds it on 1 of 24 intake forms (a commercial agency). *"Reads as 1990s, or as body policing."*
- **Fix:** show weight only on the fitness/athletic track, on the profile and on the public page, matching
  the comp-card rule that is already correct.

### L8-26 [P2] [DATA] The measurements edit form is in the wrong order, and the labels contradict the display
- **Where:** `MeasurementsSection.jsx` order: Height → Weight → **Shoe** → Bust/Chest → Waist → Hips →
  Dress/Suit → Inseam → **Eye Color** → **Hair Color**. Section title is `"Physical Attributes"` when
  unlocked (`:81`) and `"Stats & Measurements"` when locked for a minor (`:62`).
- **Industry reality:** R3 §4.4: *"Height is always first. Hair/eyes are always last. B–W–H are always
  contiguous and in that order."* R3 §7 item 7: *"The order is the tell."* Hair precedes eyes on
  Wilhelmina, Premier, Storm and Viva.
- **Fix:** reorder to Height → Bust/Chest → Waist → Hips → Dress/Suit → Inseam → Shoe → Hair → Eyes
  (`buildCanonicalStats` already emits exactly this — the form should mirror it). Swap Eye/Hair. Use one
  section title.

### L8-27 [P2] [TERM] "Gallery" on the public portfolio is the software word
- **Where:** `views/portfolio/show.ejs:207, 288` `<h2>Gallery</h2>`.
- **Industry reality:** R2 §4.3: *"'book' and 'portfolio' are the talent/agency words; 'gallery' is the
  software word."* Storm's public anchor is `#portfolio`; Premier's tab is "Portfolio".
- **Fix:** "Portfolio".

### L8-28 [P2] [LEAK] "Legacy", "snapshot" and "dashboard sync" surface as user copy
- **Where:** `RepresentationSection.jsx:252-256` `label="Legacy representation notes"` /
  *"Optional historical notes retained from your previous profile"*;
  `SubmissionThreshold.jsx:21` *"…redacts the platform snapshot…"*;
  `ProfilePage/index.jsx:695-699` `'Dashboard sync incomplete'` / `'Profile saved — dashboard sync incomplete'`.
- **Fix:** "Previous agencies"; "removes the copy Pholio holds"; "Profile saved. Some parts of your
  dashboard may take a moment to update."

### L8-29 [P2] [TERM] Gamified "editions" and "unlocks" on the comp card
- **Where:** `client/src/domains/talent/components/CompCard.jsx:104-110` — `EDITION_UNLOCK_COPY`:
  *"Needs four photos for the filmstrip"*, *"Unlocks with a clean studio frame"*,
  *"A dark register set for adult portfolios"*.
- **Industry reality:** R1 §2: gamified completeness/unlock language is a flinch word — *"Nothing in the
  sample rewards completeness."* A comp card has layouts, not editions, and printers call them templates.
- **Fix:** "Layouts". Replace "Unlocks with…" with "Needs a clean studio frame".

### L8-30 [P2] [CONSISTENCY] British spellings in a predominantly American product, on the same fields
- **Counts (live user-facing strings only):** 6 British instances against a consistently American base
  ("Hair Color", "Eye Color", "Gray", "color" throughout).
  - `src/domains/talent/services/comp-card-import/proposal.js:63-64` — `label: "Hair colour"`,
    `label: "Eye colour"` — **the same two fields the profile labels "Hair Color" / "Eye Color"**.
  - `client/src/domains/agency/pages/settings/SpecBuilderPanel.jsx:524` — *"Why can't I require hair
    colour or nationality?"*
  - `client/src/domains/talent/pages/SettingsPage/index.jsx:1085` — *"…anything you don't recognise."*
  - `client/src/shared/components/LegalAcceptanceGate.jsx:161` — *"…summarised in full below."*
  - `client/src/domains/auth/pages/LoginPage/LoginPage.jsx:181` — *"Sign in cancelled."*
  - **authorise/authorize split on the same concept:**
    `client/src/domains/agency/pages/TalentFullView.jsx:102-103` *"Guardian authorisation required"* and
    `client/src/domains/agency/components/dossier/DigitalsSet.jsx:87` /
    `ComparisonOverlay.jsx:293` *"guardian authorisation on file"* vs
    `"Guardian authorization required"` / `"Guardian authorization request sent."` /
    `"Request guardian authorization"` elsewhere in the same flow.
    Also `SubmissionTerms.jsx:244` and `src/shared/lib/submission-disclosure-content.js:75`
    *"authorised to submit my own work"* against `applications.js:991` *"authorised"* — consent copy in
    one spelling, the surrounding UI in the other.
- **Fix:** pick American (the base is already American) and fix these six; the authorise/authorize split
  inside the guardian flow is the one that reads as two people writing.
- **HR/gig/SaaS register audit (visible strings only):** `candidate` **0** (variable names only),
  `interview` **0**, `recruiter` **0**, `hire/hiring` **0**, `gig` **0**, `job posting` **0**,
  `rejected` **0** — genuinely clean, and worth preserving. `pipeline` **5** (L8-16),
  `applicant` ~**12** user-facing (acceptable on the event/open-call surfaces per R4 §2.4;
  `TalentPanel.jsx:290` and `WorkingRecord.jsx:59` *"this applicant can't be messaged directly"* are on
  agency roster surfaces where R2 §8 says "submission" is the word), `dashboard` **4**
  (Breadcrumbs, an auth toast, two ProfilePage toasts).

---

## Coined / internal terms encountered

| Term | Where it surfaces | Native? | Verdict | Industry word |
|---|---|---|---|---|
| **The Book** | talent nav (`talentNav.js:19`), `IMAGE_TYPE_LABELS.portfolio = "Book"` | industry-native (R3 §2) | **keep** | — |
| **Digitals** | `frame-taxonomy.js:59,80`, DigitalsSet, freshness | industry-native (R3 §2) | **keep** | — |
| **Comp card** | throughout | industry-native | **keep** | — |
| **Tearsheet / Test shoot / Campaign** | `IMAGE_TYPE_PICKER_OPTIONS` | industry-native (R3 §2) | **keep** | — |
| **Bookout** | `AvailabilitySection`, `bookouts` table | industry-native (R4 §2.1) | **keep** | — |
| **Kept on file** | status, notification, agency action | industry-native (R2 §3.1 "onfile") | **keep** | — |
| **New Faces / Development / Main Board** | `divisions.js` LADDER | industry-native (R2 §1.2) | **keep**, but re-model as stage not board (L8-20) | — |
| **Go-See** | `meeting_requested → 'Go-See Requested'` | industry-native (R4 §2.2) | **keep** | — |
| **Package** | talent submission, everywhere | native word, **inverted direction** | **translate** | submission |
| **Market** (nav label) | `talentNav.js:24` | homonym collision with booking market | **translate** | Agencies / Submissions |
| **House** | MarketBoard, MarketCoverage, HouseBand | native word, wrong referent | **translate** | agency |
| **Signing board** | `CastingPage.jsx:190,203,230` | invented; collides with `board` | **translate** | selection / new faces |
| **Active Boards** | `AgencyLayout.jsx:131` | same collision | **translate** | active selections |
| **Pipeline** | agency chrome ×5 | CRM register | **translate** | submissions |
| **Intel** | talent nav; `/dashboard/talent/intel` | invented | **translate** | Activity / Who's looked |
| **Booking lane / Primary Lane** | `BookingLanesControl.jsx:37,66` | invented | **translate** | market (or board) |
| **Stats track** | `DisciplineSection.jsx:60` | invented but genuinely useful | **keep** (rename to "Measurement set") | — |
| **Discipline** | `DisciplineSection.jsx:41` | invented | **translate** or merge into board | — |
| **Division** (`profile-division.js`, 4 values) | readiness taglines | duplicates the agency division system | **hide** / retire | — |
| **Season memory** | `SeasonMemory.jsx:77` — panel title, agency dossier | invented ("season" is native; the noun phrase is not) | **translate** | "Since last time" / "Previously applied" |
| **Pholio ID** | Wallet errors + pass description | invented credential | **translate** | digital comp card |
| **Edition** (comp card) | `CompCard.jsx` edition selector | invented | **translate** | layout / template |
| **Card pull** | `IntelPage/blocks/AttentionBlock.jsx:24,35,111`; `MomentumBlock.jsx:38` | invented metric noun | **translate** | comp card downloads |
| **Pholio signal** | `BookingLanesControl.jsx:101-104` | invented score | **hide** (remove; L8-17) | — |
| **Frame** (a photo) | `frame-taxonomy.js`, "Tag a digital headshot", "3 frames sent" | borderline — "framing" is native, "a frame" is photographer-adjacent | **keep** | — |
| **Preflight** | `RegistryPreflight`, `/spec-registry/preflight` | internal only — no user-facing string found | **hide** (already is) | — |
| **Dossier** | class names, file names, query keys only — no user-facing string | internal only | **hide** (already is) | — |
| **Handoff** | class names + `CheckoutHandoff` only | internal only | **hide** (already is) | — |
| **Snapshot** | one user-facing instance, `SubmissionThreshold.jsx:21` | LEAK | **translate** | the copy Pholio holds |
| **Spec registry / spec pack** | 2 comment instances; user-facing copy says "what the agency publishes" | internal only | **hide** (already is) | — |
| **Screen Test** | CSS/comment token names only | internal only | **hide** (already is) | — |
| **Package intelligence** | constant file name; no user string | internal only | **hide** (already is) | — |
| **Recipient** | `SubmissionTerms.jsx:110`, `IntelPage/ShareLinksBlock` | generic but honest | **keep** | — |
| **Organizer** | event-casting copy | native for System B (R4 §2.3) | **keep** | — |
| **Mints a link** | `ShareLinksBlock.jsx:182` | crypto/tech register | **translate** | creates a link |
| **Legacy** | `RepresentationSection.jsx:252` "Legacy representation notes" | LEAK | **translate** | previous agencies |
| **Standing** | `divisions.js` STANDINGS, dossier `Standing` label | plausible; not attested but reads native | **keep** (but split, L8-20) | — |
| **Pool** | `'In the Casting Pool'`, `PickListsPanel` | industry-native for event calls (R4 §2.3) | **keep** | — |
| **Pick list** | `event_pick_lists`, `/picks/:token` | native mechanism (R4 §2.3 "pre-selection / pick list to designers") | **keep** | — |
| **Material request** | `materials.js`, "More materials requested" | plausible translation of "we'd like to see more" | **keep** | — |
| **Likeness consent** | `LikenessMovement.jsx`, `likeness_consents` | industry/statutory-native (R5 §2 "digital replica"/BFMA "digital version") | **keep** | — |
| **Bulk** | leaked into talent timeline | internal | **hide** (L8-15) | — |

---

## Consistency variants

Ranked by variant count × visibility.

| Concept | Variants seen | Locations |
|---|---|---|
| **Board / division / lane / track / discipline / type / register** (7 names, 8 value-sets, ~60 labels) | `Board`, `Division`, `Booking lane`, `Primary Lane`, `Stats Track`, `Primary Discipline`, `Type`, `Register`, `board` (kanban), `Active Boards`, `Signing board`, comp-card `board` | `divisions.js:88-112`; `booking-lanes.js:3-66`; `statsTrack.js:16-20`; `profile-division.js:41-66`; `statusConfig.js:31-38`; `frame-taxonomy.js:88-105`; `CompCard.jsx:72`; `CastingPage.jsx:190-238`; `AgencyLayout.jsx:131`; `DisciplineSection.jsx:30-66`; `BookingLanesControl.jsx:37-92` |
| **The talent's submission** (6 names) | `submission`, `application`, `package`, `dossier` (internal), `apply`, `record` | `applications` table; `submission_packages`; `off_platform_submissions`; `preflight-service.js:280-297`; `SubmissionThreshold.jsx:21`; `ApplyExperience.jsx` (`apply-dossier-*`); `SubmissionRecord.jsx` |
| **Representation** (4 stores, 3 label sets) | `applications.status='represented'`; `talent_representations`; `roster_board_standings.standing='represented'`; `profiles.current_agency`. Labels: `Represented`, `Represented by`, `REPRESENTATION`, `MOTHER AGENCY`, `PLACEMENT`, `Seeking representation`, `Direct`, `Not yet represented`, `In conversation` | `application-status.js:10`; `migrations/20260629234500`; `migrations/20260731120000`; `pass-content.js:137-196`; `RepresentationSection.jsx:12-38`; `representationStatus.js:60-100` (dead); `formNormalization.js:116` (**a second function of the same name**) |
| **The agency / recipient** (5 names) | `agency`, `house`, `organizer`, `recipient`, `model management company` (registry only) | `MarketBoard.jsx:87`; `MarketCoverage.jsx:334,443`; `HouseBand.jsx`; `event-casting.js:ORG_KINDS`; `SubmissionTerms.jsx:110`; `submission-tracker.js:VERIFICATION_REGISTRIES` |
| **The plain-photo set** (4 names) | `Digitals` (dominant, 154 hits), `polaroids` (hint text only, `frame-taxonomy.js:72`), `Polaroid` (dead, `src/routes/upload.js:54`), `snapshot` (unrelated sense) | as listed |
| **The portfolio** (5 names) | `The Book`, `Book`, `your book`, `Portfolio` (142 hits), `Gallery` (public EJS), `Media` (route + page), `frames` | `talentNav.js:19`; `frame-taxonomy.js:59,80`; `views/portfolio/show.ejs:207,288`; `/dashboard/talent/media`; `dossier/TheBook.jsx` |
| **The person** (5 user-facing names) | `talent` (dominant), `applicant`, `model`, `new face`, `user` | `TalentPanel.jsx:290`; `WorkingRecord.jsx:59`; `PickCard.jsx:141,217`; `PickListsPanel.jsx:149`; `SettingsPage.jsx:32`; `OpenCallApplyPage.jsx:796`; `development → short: 'New Face'` |
| **The comp card** (3 names, 1 invented) | `Comp card` (109 hits), `Comp Card`, `Pholio ID`, `card` | `CompCard.jsx`; `pass-content.js:3-17`; `COMP_CARD_SLOT_LABELS` |
| **Outcome states** — same enum, three label sets | `passed`: agency=`Passed`, talent=`Not Selected`, standing=`Passed`. `accepted`: agency=`Offered`, talent=`Offer / Moving Forward`, event=`Offered a Slot`, standing=`Shortlisted`. `shortlisted`: agency=`Shortlisted`, talent=`Shortlisted`, event=`In the Casting Pool` | `statusConfig.js:44-70`; `applicationStatus.js`; `notifications.js:253-380`; `divisions.js:405-419` |
| **The meeting** (2 names, consistent) | `Go-See Requested` (talent), `Meeting requested` (notification) | `applicationStatus.js`; `notifications.js:325-328` — minor drift only |
| **The guardian** (5 forms) | `parent or guardian`, `legal guardian`, `Parent or legal guardian`, `Guardian`, `guardian authorisation`/`authorization` | `MeasurementsSection.jsx:69`; `CastingMeasurements.jsx:787`; `TalentFullView.jsx:102`; `DigitalsSet.jsx:87`; `notifications`/`materials` copy. R5 §6 prescribes **"parent or guardian"** as the dominant construction — the product mostly complies |
| **Availability** (2 incompatible vocabularies) | talent: `available / limited / unavailable`; agency: `Available / On Booking / 1st Option / 2nd Option / On Hold / Booked / Bookout / Released / Inactive` | `AvailabilitySection.jsx:27-31` vs `statusConfig.js:88-101` — see L8-03 |

---

## Working well (preserve)

1. **`src/shared/constants/application-status.js`** — the whole file. `closed_no_response` is deliberately
   absent from `WRITABLE_APPLICATION_STATUSES` so *"an agency that let the review window lapse has not
   decided anything"*; `confirmed`/`declined_by_talent` are talent-only so *"an organizer must not be able
   to record a confirmation the talent never gave"*; `ALL_APPLICATION_STATUSES` is derived from the role
   lists so the CHECK constraint cannot drift. This is exactly R2 §3.3's asymmetry, encoded.
2. **`application-auto-close.js`** — silence is recorded as silence, never as `passed`. R0 §E24's
   requirement, implemented (with the attribution fix in L8-19).
3. **`kept_on_file` grouped as `advancing`, never `closed`** (`applicationStatus.js`) — R2 §3.1 lists
   `onfile` as *"the commonest real outcome of a submission and most software cannot express it."*
4. **`talent_representations`** — mother/placement, market, territory, division, `is_exclusive`,
   `started_on`/`ended_on`, external-vs-internal counterparty, single-active-mother index. This is R2
   §1.5 modelled properly, and it is better than most agency software.
5. **`roster_board_standings`** — multi-board membership with `source_application_id` provenance, and the
   header comment explaining why standing is a roster fact rather than an application fact (scouted faces
   and transfers can be shortlisted). R2 §1.2 and §3.1, correctly separated.
6. **`resolveStanding` defaults to `unknown`, not `active`** (`divisions.js:396-409`), with the reasoning
   spelled out: never infer a positive representation claim from missing data. R0 §E21/§E22.
7. **`STANDING_ALIASES` deliberately excludes availability values** (`divisions.js:341-360`) —
   *"AVAILABILITY IS NOT STANDING… a talent on a first option is still represented on their board."*
   Exactly R2 §1.6 vs §1.3.
8. **The digitals/book separation** in `frame-taxonomy.js` — `image_type` distinguishes `digital` from
   `portfolio`, `qualityHintFromSignals` flags *"Reads as styled book work, not a raw digital"*, and
   `pitsSignalParts` only applies the unretouched rules to digitals. R3 §7 item 1 and item 13.
9. **`pdf/composition/stats-formatter.js`** — canonical women's and men's orders, kids track that
   structurally omits B/W/H and substitutes age + clothing size, weight suppressed unless fitness, age
   never printed for adults, and an explicit `omitted[]` list explaining every suppression. This is the
   single most industry-accurate module in the repo. R3 §4.4, §4.6, §4.7.
10. **`buildCanonicalStats().fields`** — height first, B–W–H contiguous, dress before shoe, hair then eyes.
    R3 §4.4's invariant order, correct.
11. **`measurements_updated_at` + a 90-day stale flag** — R3 §4.9 and §7 item 16: stats are perishable
    and stale stats are a liability. The agency-side flag reads *"Over 90 days old and not confirmed in
    person"*, which is precisely how a booker thinks.
12. **Per-agency guardian authorization for minor submissions** — *"Your guardian must authorize
    disclosure to {name}. This permission will not apply to another agency."* R5 §7 items 2-3, done well.
13. **`divisions.js` tokenised matching** with the documented regression list (`Développement → Men`,
    `Chair Board → Beauty`), non-Latin grapheme fallback, and never returning null for an
    agency-authored board name.
14. **`event-casting.js`** — `compensation_type` is mandatory on an event call *"unpaid is a statement an
    organizer makes, not a field they leave blank"* (R4 §5); `PICK_MARKS` are *"a designer's private
    opinion, never an application status"* (R4 §3.2); `EVENT_PACKAGE_RETENTION_DAYS = 90`.
15. **The HR-register audit comes back nearly clean** — zero user-facing `candidate`, `interview`,
    `recruiter`, `hire`, `gig`, `job posting`, or `rejected`. That is rare and worth defending.

---

## Dead or unreachable code carrying issues

- `src/routes/upload.js` — **not mounted** (no `app.use` in `src/app.js`). Inserts every image with
  `label: 'Polaroid'` (`:54`), the only place that word is written to the database.
- `client/src/domains/talent/utils/representationStatus.js` — `deriveRepresentationStatus(applications)`
  is imported only by its own test. Its JSDoc claims it is *"consumed by OverviewPage"*; it is not.
  Note the name collision with a **different** `deriveRepresentationStatus(profile)` at
  `client/src/shared/utils/formNormalization.js:116`, which *is* live.
- `profiles.fit_score_runway|editorial|commercial|lifestyle|swim_fitness` — **no writer exists** anywhere
  in `src/`. Only readers (`talent-data-inventory.js:84`, `settings.js:225`) and purgers
  (`migrations/20260804090000`, `20260824090000`). The "Pholio signal" panel (L8-17) therefore renders
  only for profiles carrying legacy values.
- `client/src/domains/talent/utils/applicationStatus.js` — configs for `reviewing` and `rejected`.
  Neither is in `ALL_APPLICATION_STATUSES`; the DB CHECK constraint cannot hold either. Similarly
  `statusConfig.js:53-56` maps `underreview`/`review` and `SubmissionRecord.jsx:42` maps a `booked`
  timeline event that `migrations/20260701111000_rename_application_status_booked.js` renamed away.
- `DEFAULT_REPRESENTATION_INTAKE_SPEC` (`open-call-intake.js:138-153`) — its own comment says it is
  *"not yet wired into the representation pipeline"*, yet it is what
  `defaultIntakeSpecForCallKind` returns for representation calls, so it **is** live for the
  spec-validation path. Worth resolving before the mandatory-`core_measurements` fix (L8-18).
- `IMAGE_TYPE_LEGACY_ONLY` / `SHOT_LEGACY_ONLY` (`frame-taxonomy.js:48-51, 82-86`) — surface labels like
  `"Comp card (legacy)"` and `"Profile (legacy left)"` to users holding legacy rows. The word "legacy" in
  a picker is a leak; relabel to just "Comp card" / "Profile".
- `Screen Test` — appears only in CSS token comments (`OpenCallStage.css:2,15`,
  `CastingCinematic.css:12`) and `motion.js:2`. Not user-facing; listed only because it is a coined term
  worth not promoting.

---

## Coverage

**Read in full:** `R0`, `R1`, `R2`, `R3`, `R4`, `R5`, `SURFACE-MAP.md`.

**Read (code):** `src/shared/constants/{application-status,submission-tracker,event-casting,booking-lanes,profile-division,frame-taxonomy,open-call-intake,package-intelligence}.js`;
`client/src/shared/constants/{applicationStatus,statsTrack,profileDivision,talentNav}.js`;
`client/src/domains/talent/utils/{applicationStatus,representationStatus}.js`;
`client/src/domains/agency/components/status/{statusConfig,divisions,AvailabilityCell}.jsx|.js`;
`src/shared/lib/{stats-formatter,talent-age,application-auto-close,submission-profile,validation (measurement schemas)}.js`;
`src/domains/pdf/composition/stats-formatter.js`; `src/domains/spec-registry/{taxonomy-labels,preflight-service,export/stats-block}.js`;
`src/domains/wallet/services/pass-content.js`; `src/shared/services/notifications.js`;
`src/domains/agency/routes/inbox.js` (status PATCH, CSV export); `src/domains/talent/routes/{profile,applications}.js` (relevant handlers);
`src/domains/opencall/{routes/apply.js,services/submissions.js}` (minor/age handling);
`src/domains/agency/services/{talent-dossier,applicant-identity}.js`;
`client/src/domains/talent/pages/ProfilePage/{MeasurementsSection,BookingLanesControl,DisciplineSection,AvailabilitySection}.jsx`;
`client/src/domains/talent/components/{RepresentationSection,CompCard,profileReadinessItems}.jsx|.js`;
`client/src/domains/talent/components/market/*`; `client/src/domains/agency/components/dossier/*`;
`client/src/domains/agency/components/review/ReviewRoom.jsx`; `client/src/domains/agency/pages/CastingPage.jsx`;
`client/src/shared/layouts/AgencyLayout.jsx`; `client/src/shared/utils/measurementConversions.js`;
`views/portfolio/show.ejs`; `src/routes/portfolio.js`.

**Migrations read:** the measurement/stats set (`20260211000000`, `20260701100000`, `20260701110000_add_shoe_region`,
`20260626170000`, `20260525200000`), representation (`20260629234500`, `20260629234600`,
`20260731120000`), availability (`20260710090400`), discipline (`20260701100100`), status vocabulary
(`20260701111000`, `20260622000000`, `20260623000000`, `20260627150000`, `20260629180000`,
`20260815090000`), AI purge (`20260804090000`, `20260824090000`). Full 231-file list enumerated.

**Skipped, and why:** `.claude/skills/**`, `docs/audits/**`, `tasks/**`, `DESIGN.md`, `PRODUCT.md`,
`CLAUDE.md` as vocabulary authorities (brief rule 1 — note that `divisions.js:24-26` and
`roster_board_standings` cite `.claude/skills/industry/reference/standards.md` as their source; that
citation was not followed and the findings above rest on R1–R5 only). Page-level surfaces owned by other
lanes were read only for the strings this lane needed: the Intel page (`findings.js`, charts), the Apply
flow scenes, the onboarding step components beyond `CastingMeasurements`, agency Settings panels,
the email template bodies, and the Discover/scout surfaces. Per-route error-message inventories
(surface-map group 32) were sampled, not enumerated.
