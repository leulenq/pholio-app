# Lane 1: talent onboarding, auth, pre-auth / token public pages · audience: talent (+ designer, guardian)

Scope audited: `/onboarding` casting flow (entry, DOB gate, gender, digitals, measurements, profile,
verify-email, acknowledgment beats), `/onboarding/test`, `/login` + forgot/reset + `views/auth/*.ejs` +
`views/errors/*.ejs`, `/opencall/:code` (anonymous apply + arrival), `/opencall/claim|disown|materials/:token`,
`/reply/:token`, `/picks/:token`, `views/guardian-consent.ejs` + its route, `views/portfolio/show.ejs`
(`/portfolio/:slug`), and `/dashboard/moderation`.

## Verdict

The token-gated event surfaces — the anonymous open-call form, its consent screen, the materials page and the
designer pick list — are the best work in this slice and would survive a booker reading them line by line:
two-stage intake (apply → shortlist), compensation restated verbatim from the organizer, a dated 90-day
retention promise, "a submission is a request for review and does not guarantee selection, a booking, or
payment", and an explicit statement of exactly what a designer can and cannot see. A professional would
read those and conclude someone had sat in an agency office. The **account-creation flow in front of them
would undo that in the first eight words.** The first thing a talent reads after their birthdate is
"Let's get you *seen*" — the one register (`get seen` / `get discovered`) that the BFMA names as the
scam pitch and that every legitimate agency has scrubbed from its own intake copy. Around it sit four
structural problems: **no safety block anywhere in the pre-auth flow** (no "there is no fee", no "we never
ask for nude or lingerie photos", no domain/impersonation notice, no retention statement — eleven of
twenty-four sampled agency intake pages carry all four, R1 §5.1); **a digitals step that collects two frames
with no shot instructions on the open-call side** while the industry's own submission spec is three-to-four
named frames with a written no-makeup / no-filter / plain-background / form-fitting rule; **a measurements
step branched on gender identity rather than on the product's own `stats_track`,** which leaves every
non-binary and undisclosed talent with height and nothing else while the review screen prints an empty
"Weight" row that no adult fashion board has published in twenty years; and a **public portfolio page that
prints weight, gender and ethnicity** as stat lines. The minor path is a nominal 18+ launch gate over a
guardian-consent machine that, when it does run, asks a parent to authorize the collection of a child's
bust/waist/hips — the one thing the BFMA says is inappropriate at any age under 18, consent or not — and
bundles account management, public publication and AI photo analysis into a single button.

---

## Findings

### L1-01 [P0] [CLAIM] The first words a talent reads are the scam register

- **Where:** `client/src/domains/onboarding/pages/CastingEntry.jsx:521`. Reachable via `/onboarding`
  (`client/src/App.jsx:79`) — the screen shown immediately after the birthdate gate, above the
  Google/Instagram/Email buttons.
- **String:** `<StepBeat text="Let's get you *seen*" …>`
- **Industry reality:** "Get seen" / "get discovered" is the single phrase the UK industry body uses to
  characterise the online modelling scam: the BFMA's frauds page describes exactly the operator who sells
  "a space on their online website… They claim to have direct contact with any number of professional
  agencies and that they can get you placement. **They can't.**" (R5 §2, §5.2). R5's contrast case
  (`getscouted.co`) leads with "Create your profile and **get discovered** at no cost" and is flagged as
  the pattern a compliance review will scrutinise. No agency in the 24-surface R1 sample uses it; they say
  *apply*, *submit*, *get scouted* (R1 §2). R5 §6 lists "get discovered", "be seen by hundreds of agencies"
  first on the MUST-NOT list.
- **Why it fails:** this is the promise Pholio cannot keep — visibility is not something the product
  controls — stated in the exact idiom regulators and the trade body have taught models to distrust. Every
  honest sentence downstream (and there are many) is read against it.
- **Fix:** say what the screen does. "Create your Pholio account." / "Start your submission." The flow's own
  later beats already show the right voice ("Now — let's *see you*." on the digitals step is about the
  photo, not about exposure, and is fine).

### L1-02 [P0] [CLAIM] No safety block anywhere in the pre-auth flow: no fee statement, no nude/lingerie rule, no impersonation notice, no retention statement

- **Where:** the whole of `client/src/domains/onboarding/pages/` and `client/src/domains/opencall/pages/`.
  Verified by search: `grep -rniE "never ask|no fee|free to apply|never charge|nude|lingerie|scam|imperson"`
  over `client/src/domains/{onboarding,opencall,auth}` and `views/` returns **zero matches**. The only legal
  text in the signup flow is `client/src/shared/components/LegalNoticeLine.jsx:12` ("By continuing, you agree
  to the Terms, Privacy Policy, and AI Notice.").
- **Industry reality:** eleven of twenty-four sampled agency intake surfaces carry a four-part warning, and
  they converge on the same claims — "We never ask for nude or lingerie photos" (7 agencies verbatim), "We
  never charge a fee" (8), "verify our email domain / verified handles" (6), "if you are under 18, tell a
  trusted adult" (5) (R1 §5.1). Storm publishes its retention clock in the consent itself: "Your application
  data will be kept here for no longer than 30 working days" (R1 §4.4). R5 §6 puts "There is no fee to
  apply", "We are not a modeling agency and we do not procure work", the anti-impersonation domain notice and
  a named safety contact on the MUST-say list. IMG's pattern is the model: a blocking safety interstitial
  **before** the age question, then age, then data (R1 §5.4).
- **Why it fails:** Pholio sits between models and agencies, accepts photos, and sells a paid tier — the
  exact profile that the FTC, NY DOL and the BFMA warn about. It says none of the four things that separate
  a legitimate intake from a scam one. The product does have the right sentence — "Pholio is not a talent
  agency and does not guarantee representation, bookings, or income"
  (`client/src/shared/components/SubscriptionCheckoutDisclosure.jsx:46-47`) — but it is buried in the
  **billing** modal, seen only by people who arrived with `?plan=studio`.
- **Fix:** a short safety block on the DOB screen (IMG's order: safety → age → data), and repeat the two
  load-bearing lines on the open-call apply page before the first question: "Pholio never charges you to
  apply or to be considered. Pholio and the agencies on it never ask for nude, lingerie or swimwear photos.
  Pholio email always comes from @pholio.studio." Plus a retention sentence in onboarding matching the one
  the open-call flow already has.

### L1-03 [P0] [MINOR] Guardian consent is asked to authorize collecting a minor's bust/waist/hips — which no consent can make appropriate

- **Where:** `views/guardian-consent.ejs:78` (`mode === 'disclose'`, account scope). Reachable via
  `GET /guardian-consent?token=…`, mounted at `src/app.js:906`; the unlock it grants is read by
  `client/src/shared/utils/talentAge.js:63-75` and gates
  `client/src/domains/onboarding/pages/CastingMeasurements.jsx` (`heightOnly`) and the sensitive-shot block
  at `src/domains/onboarding/routes/casting.js:1168-1176`.
- **String:** "**Account management** — collecting and storing measurements, full-length photos, and
  portfolio details." / `CastingMeasurements.jsx:787` "Body measurements stay locked until a parent or
  guardian consents."
- **Industry reality:** BFMA Code of Practice, verbatim: "**We believe it is inappropriate to measure any
  young person under the age 18 except for their height.**" and "It is unacceptable to take, send or receive
  body, bikini or lingerie digitals of any young person under the age of 18." (R5 §4, R3 §4.7, R2 §5.4).
  Printer guidance for children's cards substitutes "height, clothing size, shoe size, hair, eyes, age range"
  and the B/W/H triple disappears entirely; the one kids board R3 could read (Docherty) displays height only.
  R3 §7 item 4: "a stats model must be able to **structurally omit** B/W/H for under-18s, not merely leave
  the fields blank."
- **Why it fails:** the product models the under-18 body-measurement rule as a **consent gate** — a parent
  can tick a box and the 16-year-old's bust/waist/hips capture UI appears. The industry rule is not a consent
  rule, it is a structural one; an agency director reading this page would conclude Pholio thinks a signature
  cures it. It also makes the guardian the author of the exact record the trade body says should not exist.
- **Fix:** make height-only permanent for under-18 profiles regardless of guardian consent, and delete
  measurements from the consent disclosure. Keep guardian consent for what it legitimately covers: public
  publication, agency disclosure, and communication routing. Restate `CastingMeasurements.jsx:787` as
  "Under 18, Pholio records height only." (a policy, not a lock waiting to open).

### L1-04 [P0] [MINOR] The guardian consent bundles AI photo analysis, publication and account management into one button, with no time limit and no deletion clock

- **Where:** `views/guardian-consent.ejs:77-96, 106-116`.
- **Strings:** the three-item list "Account management … Public publication … **AI processing** — automated
  photo analysis used to organize the portfolio", under one submit button "**I consent as parent or
  guardian**"; and "Retention — Data is retained **while the account is active**."
- **Industry reality:** R5 §5.6 sets out what a legitimate AI consent has to be, from the statutory floor
  (NY FWA §1034/§1035: written, clear and conspicuous, **separate from** the representation agreement,
  specifying scope, purpose, rate of pay, duration) and the industry ceiling (Storm AI Code of Practice:
  "**Prior written consent must be obtained from the Model / Talent prior to any capture, storage &
  manipulation of their data in any AI system/software**", plus an explicit no-training-datasets commitment).
  Elite's minor flow is the template for the clock: guardian approval not granted "within 15 days from our
  request" ⇒ "we will delete all the data supplied by you" (R5 §4, §7.4). Storm: "All application data,
  including photos, is automatically deleted after 30 days" if unsuccessful. R5 §7.14: "the industry default
  should be *not to run [AI] at all* on minors."
- **Why it fails:** three materially different permissions ride one click, so none of them is a real
  consent; the AI item names no system, no purpose limit, no no-training commitment and no withdrawal
  consequence; and "retained while the account is active" means a minor's full-length photos can sit
  indefinitely with **no** guardian approval at all, since nothing deletes on non-approval. Every comparator
  in the research publishes a number.
- **Fix:** split into three affirmative acts, each its own statement. Give the guardian request a hard
  expiry with deletion on lapse (Elite's 15 days is the attested precedent) and state it on the page. State
  a retention period. For minors, do not offer AI analysis at all; if it must exist, it is a separate,
  named-system, no-training, withdrawable consent.

### L1-05 [P0] [DATA] The public portfolio page publishes weight, gender and ethnicity as stat lines

- **Where:** `views/portfolio/show.ejs:50-55` and `:241-243` (Weight), `:57-62` and `:245-247` (Gender),
  `:63-68` and `:248-250` (Age band), `:179-181` (Ethnicity). Reachable via `GET /portfolio/:slug`
  (`src/routes/portfolio.js:354`, mounted `src/app.js:920`) for any profile with `is_public !== false`.
- **Strings:** `<span class="portfolio-pro-stat__label">Weight</span>` … `publicStats.weight.dual`;
  `<span…>Gender</span> <%= profile.gender %>`; `<span…>Age</span> <%= publicAgeBand %>`;
  `<li><span>Ethnicity:</span> <%= profile.ethnicity %></li>`.
- **Industry reality:** **Weight** — absent from every adult fashion board R3 could read (Wilhelmina women,
  Wilhelmina men, Models 1) and from the modern comp-card stat lists at Fairway and compcard.com; it survives
  only in child/actor résumé advice and legacy sources. "Putting it on a fashion stat card in 2026 reads as
  either out-of-date or body-surveillance-y" (R3 §4.6, §7 item 5). **Age** — "Age and date of birth are NOT
  shown. Confirmed absent on Premier, Storm and Viva profiles… A public age field would be a red flag."
  (R2 §4.2). **Gender** — not a field on any sampled board; the *board* carries it (R2 §4.1: seven fields,
  Height/Bust/Waist/Hips/Shoe/Hair/Eyes). **Ethnicity** — ICO: photographs and derived attributes that reveal
  racial or ethnic origin engage Art. 9 special-category processing (R5 §4).
- **Why it fails:** the product's own canonical formatter already gets this right —
  `src/shared/lib/stats-formatter.js:341-364` builds `fields` in the correct order and **deliberately
  excludes weight**, and `src/shared/lib/audience-dto.js:386-397` excludes weight from the designer DTO
  "by construction". The EJS template then re-adds weight by hand (`publicStats.weight`) and bolts
  gender/age/ethnicity on beside it, overriding the one place that was correct. Publishing self-declared
  ethnicity on an open web page is a compliance exposure, not a taste question.
- **Fix:** render only `stats.fields` from `buildCanonicalStats`. Drop the manual weight block, the Gender
  line and the Ethnicity line from the public template entirely. If an age signal is wanted for a public
  page, drop it — boards do not carry one.

### L1-06 [P1] [CLAIM] A nine-second "scan" reticle plays over the talent's face while nothing is analysed — and the analysis that *is* running is never disclosed

- **Where:** `client/src/domains/onboarding/pages/CastingScout.jsx:240-284` (scan stage) and its own
  docstring at `:1-8` ("The chosen headshot is then scanned by the scout AI to read the talent's look").
  Reachable via `/onboarding`, step 2. The call it covers is
  `POST /onboarding/scout/confirm` → `src/domains/onboarding/routes/casting.js:1393-1503`.
- **String/state:** a scan line animating `top: 0%→100%` on loop, four corner brackets, a grid overlay, and
  a progress bar animating to 88% over **9 seconds** — over copy that reads "Saving" /
  "Filing your digitals to your profile". The confirm route runs no analysis: it looks up the primary image,
  transitions state, and sets `updatePayload.analysis_status = "complete"` (`casting.js:1478`) and
  `trackCompletion(profile.id, "scout", null, { ai_success: true })` (`:1491`) unconditionally.
  `analyzePhoto` is commented out at `casting.js:35`. The per-frame "reading" chips
  (`pitsSignalParts(headshot.signals …)`, `CastingScout.jsx:228-230`) can never render because `signals` is
  never assigned by the upload handler (`:161-171` writes only `status/previewUrl/error/imageId`).
- **Industry reality:** R5 §2 flags "'AI-analysed' / 'AI-scored' photos, unqualified" as a term practitioners
  now flinch at, citing Storm's AI Code requirement of prior written consent for "any capture, storage &
  manipulation of their data in any AI system/software"; R5 §5.6 requires AI consent to be separate,
  purpose-specific and system-named. R3 §6 and R5 §5.6 both note this landed on the industry's oldest nerve —
  digitals are the anti-manipulation artefact.
- **Why it fails:** two failures in one frame. The imagery asserts a face-analysis capability the code does
  not run, which a professional will discover the moment they ask what it read. Meanwhile the upload *does*
  run automated image analysis — `analyzeImageBuffer` plus `screenImageForCsam`
  (`casting.js:1191-1206`), which can silently hold or destroy the photo — and the talent is told nothing
  about it at the point of upload. The one place it surfaces is a 422 after the fact: "This photo was blocked
  by automated content moderation and was not saved." (`casting.js:1222-1224`).
- **Fix:** delete the scan chrome; a save is a save. Disclose the screening honestly at the upload step
  ("Every photo is checked automatically for safety before it is stored"), and either wire the reading
  signals or delete `FramePits` and the docstring's "scout AI" claim.

### L1-07 [P1] [DATA] The digitals step collects two frames, with the shot rules missing from the surface where they matter most

- **Where:** onboarding — `client/src/domains/onboarding/pages/CastingScout.jsx:291-312` (Headshot +
  Full length only) with the guidance line at `:324-326`. Open call — the platform default event spec asks
  the same two: `client/src/shared/constants/openCallIntake.js:101-102`
  (`digital_headshot`, `digital_full_length` REQUIRED; `digital_profile` appears only in the representation
  spec, at `:128`, as OPTIONAL). The open-call media screen's only instruction is
  `client/src/domains/opencall/pages/OpenCallApplyPage.jsx:940-943`: "Straight from your camera roll is fine.
  These go to the casting team, not to a public page."
- **Industry reality:** twelve of the fourteen agency forms with upload slots require **exactly three or
  four** named frames, and the profile/side shot is in almost all of them — Storm "Headshot / Mid length /
  Full length", Premier "Head Shot / Side Profile / Full Length", MiLK "1 headshot, 1 side profile picture
  and 1 full length", Society "full-length, close-up, and profile", IMG "head shot / profile / full length"
  (R1 §4.1; R3 §4.8 — "Convergent core: close-up (front) · profile · three-quarter or waist-up · full
  length. Nine of eleven ask for 3–4."). The rules are stated in the imperative and repeated verbatim across
  agencies: no makeup (6 sources), no filters/retouching (5), form-fitting clothes (5), hair off the face
  (4), plain background (2), natural light (2), neutral expression (3), no selfies, phone photos fine
  (R3 §4.8). Viva: "your jawline should be visible in the profile photo."
- **Why it fails:** the submission is a measurement instrument, not a portfolio (R1 §1a) — the profile shot
  is how a booker reads a jaw and a nose line, and Pholio never asks for it. And on the anonymous open-call
  form, which is the one surface where the applicant has no coaching and no second chance, the shot rules are
  absent entirely — while the onboarding flow *does* carry them (`CastingScout.jsx:325`: "Plain background ·
  Natural light · Minimal makeup · No filters"). The applicant most likely to send a filtered selfie is the
  one told the least.
- **Fix:** add `digital_profile` to the default event spec as required, alongside headshot and full length
  (three is the floor, four with ¾/waist-up is better). Put the shot rules on the open-call media screen in
  the agencies' own words, and change "Minimal makeup" to "No makeup" — every sampled agency states the
  absolute, and "minimal" invites a judgement call the applicant will get wrong.

### L1-08 [P1] [CONCEPT] The measurements step branches on gender identity, so non-binary and undisclosed talent get height and nothing else — contradicting the product's own `stats_track` model

- **Where:** `client/src/domains/onboarding/pages/CastingMeasurements.jsx:37-53` (`statFieldsFor(gender)`
  returns `[]` for anything but `Female`/`Male`) and `:36` ("Non-binary / Prefer not to say (and unknown) are
  offered no stats in onboarding — height → review"). Driven by
  `client/src/domains/onboarding/pages/CastingGender.jsx` ("How do you *identify*?" +
  `components/GenderTiles.jsx:19-60`: Female / Male / Non-binary / **Undisclosed**). Reachable via
  `/onboarding`, steps 1 and 3.
- **Industry reality:** the board, not the gender identity, is the routing key: agencies run
  Women / Men / **Non-binary** / Curve / Classic / Talent / Creators boards, and Select and Chadwick both
  publish a live non-binary board (R2 §1.2, §2). Measurements are a **garment-fit** question, which is why
  the sizing sets are womenswear vs menswear, and R3 §4.4 gives both canonical orders. Pholio already knows
  this: `src/shared/lib/stats-formatter.js:11-17` states it in as many words — "`stats_track`
  (womenswear | menswear | ungendered) drives WHICH measurement set … **NOT `gender`**" — and defines a
  neutral `ungendered` set (`:352-361`).
- **Why it fails:** the flow contradicts the platform's own canonical model. A non-binary talent finishes
  onboarding with height only, is then told on the same screen that "agencies need [measurements] before you
  apply", and is given no way to supply them. The men's set is also short of the canonical list — R3 §4.4:
  Height → Chest (→ Suit) → Waist (→ Collar) → Inseam → Shoe → Hair → Eyes; Pholio asks Chest/Waist/Inseam
  and never Suit or Collar.
- **Fix:** ask for the **track** (or the board), not the identity, and seed it from gender only as a default —
  which is exactly what `resolveStatsTrack` already does. Offer the `ungendered` set to non-binary and
  undisclosed talent. Keep the identity question if it is needed for something else, but stop using it as the
  measurement key.

### L1-09 [P1] [DATA] Onboarding's review screen prints a "Weight" row on a fashion stat card

- **Where:** `client/src/domains/onboarding/pages/CastingMeasurements.jsx:746-750`. Reachable via
  `/onboarding` → measurements → review, for every talent.
- **String:** `<div className="csm-rev-label">Weight</div><div className="csm-rev-val">—</div>` — a labelled,
  permanently empty cell sitting beside Height on the "The *Final Look*" review card.
- **Industry reality:** weight is absent from every adult fashion board R3 could read and from the modern
  comp-card stat lists; it appears in child modelling, actor/commercial résumés, and legacy consumer advice.
  R3 §7 ranks "Weight on an adult fashion stat card" fifth in how loudly a booker reacts. The file's own
  header comment (`:4-5`) even says "No weight, no AI prediction".
- **Why it fails:** the step deliberately does not collect weight, then prints the label anyway with an
  em-dash — which reads either as a field the talent failed to fill or as a field Pholio intends to ask for.
  Either reading is worse than the absence.
- **Fix:** delete the cell. Height stands alone at the top of the block, as it does on every board.

### L1-10 [P1] [TERM] The self-measurement step is called "a fitting"

- **Where:** `client/src/domains/onboarding/pages/CastingMeasurements.jsx:695`; the file header calls the
  whole step "the fitting" (`:2`). Reachable via `/onboarding` → measurements, adult path.
- **String:** `<StepBeat text="A quick *fitting*." />`
- **Industry reality:** a fitting is a specific, dated event with a specific owner: "after you're optioned or
  confirmed, the clothes are fitted to you. Fittings can run late into the night before a show"
  (R4 §2.2); in UK agency terms it is billable time — "Any time spent by the model for fittings is charged at
  half the appropriate hourly rate with a minimum charge to the client of £50 per hour" (Tess Management,
  R4 §2.2). It is never a person recording their own tape measurements.
- **Why it fails:** a working model reading "A quick fitting" expects a garment and a stylist. Using it for
  self-reported stats is the kind of term collision that tells a professional the writer learned the word
  from a magazine.
- **Fix:** "Your measurements." The step already has the right words two lines later.

### L1-11 [P1] [CLAIM] "agencies need them before you apply" is false for the top of the market

- **Where:** `client/src/domains/onboarding/pages/CastingMeasurements.jsx:696-698`. Reachable via
  `/onboarding` → measurements → the fitting offer.
- **String:** "Add your measurements now, or whenever you're ready — **agencies need them before you apply**."
- **Industry reality:** R1 §4.2 calls this "the most product-relevant finding in the data": **Storm, Premier,
  Models 1, Society and IMG — the top-tier London and New York fashion boards — do not ask for bust/waist/hips
  at first submission at all.** They ask height, DOB, location, socials and three photos, and re-measure in
  person. Agencies that do ask at intake skew US commercial (Wilhelmina, BMG, Elite, ONE), curve (Bridge,
  where size *is* the board definition) or Asia (Bravo). ONE goes further and refuses even a height gate:
  "We do not have a height requirement to submit."
- **Why it fails:** it asserts a universal that is false for exactly the agencies a new face most wants, and
  it turns an optional step into an implied obligation. Pholio's own send-readiness gate is the real source
  of the requirement — so the sentence is describing Pholio's rule while attributing it to agencies.
- **Fix:** attribute it correctly and scope it: "Some agencies and most event calls ask for these. You can
  add them any time." If Pholio's own submission gate requires them, say that: "Pholio asks for these before
  you send a submission."

### L1-12 [P1] [DATA] `core_measurements` is a free-text box, unit-less, and asks every applicant for bust and hips

- **Where:** `client/src/shared/constants/openCallIntake.js:53-57`
  (`core_measurements: { kind: 'text', label: 'Measurements' }`), REQUIRED at shortlist stage for events
  (`:106`) and at apply stage for representation (`:123`). Rendered by
  `client/src/domains/opencall/pages/OpenCallApplyPage.jsx:766-767` (hint: "Bust, waist, hips. However you
  usually write them.") and by `client/src/domains/opencall/materials/MaterialsPage.jsx:377-384`
  (hint "Bust, waist and hips, as you measure them today", placeholder `Bust 82, Waist 61, Hips 89`).
  Reachable via `/opencall/:code` and `/opencall/materials/:token`.
- **Industry reality:** R3 §7 item 6 ranks unit-less single-field stats sixth in how badly software reads:
  "`Shoe: 8` is meaningless across a border; `Height: 178` without cm is ambiguous. Models 1 shows the correct
  shape: `177.5 CM/5' 10''`." R3 §4.5 documents the actual formatting conventions boards use, and R3 §4.4
  gives the two canonical, ordered sets — women Bust→Waist→Hips, men Chest→Waist→Inseam. R0 §C16: "Software
  that stores stats freeform, single-unit, or undated reads amateur."
- **Why it fails:** three problems in one field. (a) A designer on the pick list receives whatever string the
  applicant typed — "34-24-34" is inches, "82, 61, 89" is centimetres, and the placeholder `Bust 82` states
  no unit at all. (b) The prompt is hard-coded to bust/hips regardless of the applicant's track, so a male
  shortlisted model is asked for his bust and his hips instead of chest and inseam. (c) The product already
  has a structured, ordered, dual-unit, staleness-aware stats model
  (`src/shared/lib/stats-formatter.js`) and this path bypasses it entirely.
- **Fix:** replace the free-text field with three numeric inputs plus a unit toggle, track-aware (bust or
  chest, waist, hips or inseam), and write them through the canonical stats columns. The recency attestation
  that already sits beside it (`MaterialsPage.jsx:269-272`, "These are my current measurements, taken
  recently, and they are accurate for these dates") is exactly right and should stay.

### L1-13 [P1] [DATA] Height is cm-only on the open-call form; shoe size is displayed everywhere with its region stripped

- **Where:** height — `client/src/shared/constants/openCallIntake.js:52` (`label: 'Height (cm)'`),
  `OpenCallApplyPage.jsx:764` (hint "In centimetres."), `client/src/domains/opencall/components/callCopy.js:77,79`
  ("Enter your height as a number, in centimetres." / "Enter a height between 50 and 260 centimetres.").
  Shoe — `client/src/domains/onboarding/pages/CastingMeasurements.jsx:471-478` collects `shoe_region`
  (US/EU/UK) and `src/domains/onboarding/routes/casting.js:1719-1726` stores it, but
  `src/shared/lib/stats-formatter.js:362` renders `push("shoe", "Shoe", shoe_size)` with no region — which is
  what the designer pick card (`/picks/:token`), the public portfolio and the PDF comp card all display.
- **Industry reality:** height is offered as a **dual cm + ft/in dropdown on every European form sampled**
  (Storm "170cm / 5'7\"", Society "170 cm - 5'7''", Heroes with a metric/imperial toggle, Bridge
  "5' 7\" / 170 cm"), and US commercial forms use split feet/inches inputs (R1 §4.2). Shoe: "EU half-sizes
  (Heroes: 35.5–45.5), separate male/female fields (BMG), and **centimetres** (Bravo). A single 'shoe size'
  number without a unit is meaningless." (R1 §4.2); Models 1's board renders `Shoe 6 UK / 39 EU` (R3 §4.4).
- **Why it fails:** the open-call form is the one anonymous, international, one-shot surface in the product,
  and it accepts height in exactly one unit — a US applicant typing `5'9` gets "Enter your height as a number,
  in centimetres." And Pholio *asks* for the shoe region in onboarding and then throws it away at every
  display point, so a designer in Paris reads "Shoe 8" from a US model and books a 39.
- **Fix:** dual-unit height input on the open-call form (store cm, accept both). Carry `shoe_region` into
  `buildCanonicalStats` and render `Shoe 8 US` — or, when a conversion table exists, Models 1's
  `6 UK / 39 EU` shape.

### L1-14 [P1] [SCOPE] The agency's own open-call page tells a stranger about their "monthly Pholio allowance"

- **Where:** `client/src/domains/onboarding/pages/OpenCallArrivalPage.jsx:360-364`. Reachable via
  `/opencall/:code` for any representation call, including for a **signed-out** visitor
  (the `!authenticated` branch renders below it at `:411-416`).
- **String:** "Invited submissions to {agency} don't use your monthly Pholio allowance."
- **Industry reality:** R5 §6 MUST-NOT: "❌ Gating the ability to *apply* behind payment", "❌ 'Boost your
  profile to agencies', 'premium listing', 'featured placement', 'priority review' — anything selling *rank
  in front of agencies*." NY DOL, verbatim: "I responded to an advertisement to provide modeling services and
  was told I need to pay a fee or place a deposit to hold my spot to be considered. Do I have to pay?
  **A: This advertisement could be fraudulent or a scam.**" (R5 §5.1). R4 §6 names paid queue priority as
  "exactly the patterns every established agency's own warning copy tells models to treat as a red flag."
- **Why it fails:** the underlying policy is defensible and honestly documented elsewhere —
  `src/shared/lib/submission-program-content.js:22`: "Every account gets 5 discovery submissions per calendar
  month (UTC). **This is an anti-spam limit, it is the same on every plan, and no payment lifts it.**" None of
  that qualification travels to this page. What a first-time visitor (and any agency director previewing their
  own open-call link) reads is that Pholio meters how many agencies they may reach per month — the paid-rank
  register, on the one page whose whole job is establishing trust on the agency's behalf.
- **Fix:** either drop the sentence from the arrival page entirely (nobody arriving on an invited link needs
  it), or carry the qualifier: "Pholio caps discovery submissions at 5 a month to stop mass-blasting — the
  same on every plan, and no payment lifts it. Invited submissions like this one don't count toward it."

### L1-15 [P1] [CLAIM] The arrival page asserts an invitation and an agency behaviour that Pholio cannot know

- **Where:** `client/src/domains/onboarding/pages/OpenCallArrivalPage.jsx:335` and `:398-401`. Reachable via
  `/opencall/:code` for any representation call.
- **Strings:** "{agency} **invited you to submit**." · step 03: "{agency} **reviews your submission
  directly**." Also `:226-229`: when an agency published a brief with no deadline and `ongoing` false, the
  page renders "**Closes a date the agency has not published.**" (`formatDeadline` returns that phrase for a
  null ISO at `:26`, and it is interpolated into a `Closes …` sentence).
- **Industry reality:** R0 §E21 — a platform can know what was sent, when, to whom, and whether it was
  opened; it cannot know intent or that a review occurred. R1 §3 shows what agencies themselves are willing to
  promise, and it is less than this: LOOK says "we always review them" *about itself*; the majority say only
  "a member of our team will be in touch if we wish to take your application further" (MiLK) or
  "should we deem it interesting to go further" (Elite). Nobody lets a third party promise review on their
  behalf.
- **Why it fails:** an open-call code is a public link — anyone who has it can open the page, and no
  invitation exists. And Pholio has no mechanism that makes "reviews your submission directly" true; the
  agency may never open the inbox. The `Closes a date the agency has not published.` string is a
  straightforward sentence bug reachable whenever a brief carries no deadline.
- **Fix:** "{agency} is accepting submissions through Pholio." for the headline. For step 03, say what the
  platform does and stop: "Your submission is delivered to {agency}." Change the deadline fallback so the
  `Closes …` line is omitted rather than completed with a phrase.

### L1-16 [P1] [CLAIM] Two phone digitals plus a height become "a comp card"

- **Where:** `client/src/domains/opencall/pages/OpenCallApplyPage.jsx:562-564` (the SENT screen),
  `client/src/domains/opencall/pages/ClaimPage.jsx:124-125`,
  `client/src/domains/opencall/materials/MaterialsPage.jsx:311-315`,
  `client/src/domains/onboarding/pages/OpenCallArrivalPage.jsx:392-395`. All reachable pre-auth.
- **Strings:** "A comp card, generated from both." · "your digitals, your stats, and **a comp card built from
  both**." · "Review your package — stats, book, and comp card."
- **Industry reality:** R3 §1 and §4.2-4.3: a comp card is a *derivative of the book*, a post-signing
  leave-behind — one hero image plus name on the front, 3–5 selected images plus a stats block **and an
  agency contact block** on the back. "The stats block + agency block are **constitutive**. A card with
  neither is a photo collage." (R3 §2). R3 §7 item 2 ranks "a comp card with no agency block" second in how
  loudly a booker reacts. R1 §2 flags the sequence inversion directly: a comp card at intake is post-signing
  vocabulary; only two of 24 sampled pages mention one, both as something the agency *provides after signing*.
- **Why it fails:** the flow generates the industry's representation artefact from a headshot, a full-length
  and a height, for a person nobody has met, with no agency and therefore no contact block. Calling it a comp
  card in the moment of highest trust ("this is *yours* to keep") teaches an aspiring model that a comp card
  is something you make from two phone photos. "Review your package — stats, **book**, and comp card" on the
  arrival page compounds it: a book is curated professional work a signed model builds over years, and
  Premier names requesting a portfolio to apply as a **scam marker**.
- **Fix:** for an unrepresented applicant call it what it is — "a one-page card with your digitals and stats,
  ready to send" — and reserve "comp card" for a card that carries a representation contact block. Drop
  "book" from the arrival steps; the applicant does not have one and is not being asked for one.

### L1-17 [P1] [CLAIM] The "application sent" screen says nothing about the outcome, and pivots straight to the product

- **Where:** `client/src/domains/opencall/pages/OpenCallApplyPage.jsx:551-572` (`PHASES.SENT`). Reachable at
  the end of every anonymous open-call application.
- **Strings:** "Your application is with *{organizer}*." → "You just built the start of a Pholio profile
  getting here." → three product bullets → "We emailed you a receipt".
- **Industry reality:** silence is the outcome, and saying so is the convention. R4 §7 counts it: **13 of 14
  event organizers contact only the selected**, and five state it outright — Omaha Fashion Week, verbatim:
  "Selected models will be notified through email by late June. **If you were not selected, you will not
  receive any notification. Please do not email Omaha Fashion Week or Develop Model Management regarding your
  status.**" R1 §3 shows the same shape agency-side, often with a clock ("if you haven't heard back in a week
  then your application has not been successful" — Bridge). R0 §E24: silence must be attributed honestly.
- **Why it fails:** the one thing an applicant wants at that moment — when, or whether, they will hear
  anything — is the one thing the screen omits, and the space is spent on a profile upsell. An applicant who
  is not told the norm reads silence as a bug and chases the organizer, which is precisely what the industry's
  copy is written to prevent.
- **Fix:** lead with the outcome norm before the product: "Most applications don't get a reply. {Organizer}
  contacts the models they want to see." If the call carries a decision date, print it. The consent screen
  already says the truth — "A submission is a request for review and does not guarantee selection, a booking,
  or payment" — so the vocabulary exists.

### L1-18 [P1] [CONCEPT] Onboarding never establishes a board, a division, or a size lane — the industry's primary key

- **Where:** `client/src/domains/onboarding/pages/CastingProfile.jsx:24` (`const LANES = ['Editorial',
  'Commercial', 'Runway']`) and `components/LanePlates.jsx:15-19`; the payload is
  `{ city, modeling_categories }` (`CastingProfile.jsx:67-70`). Reachable via `/onboarding` → profile.
- **String/state:** "What work calls to *you*?" — Editorial / Commercial / Runway / "Not sure yet".
- **Industry reality:** R2 §1.1 and §5.6: the board is a desk, a phone line, a client list and a career
  stage at once, and it is a first-class entity in the systems agencies actually run — Storm publishes a
  phone number per board, Milk publishes six, Select's CMS content type is literally `ModelBoard`. "Any tool
  that gives an agency a board-less flat list is not just using the wrong word — it is missing the primary
  key." Seven of 24 intake forms ask for the board/division inside the form (R1 §4.2), and **Curve** is not a
  taste — it is the board definition (Bridge's entire gate is "Size: 6US / 10UK+", R1 §6). Boards in the
  sample: Women / Men / Non-binary / Curve / Classic / Talent / Kids / Creators × New Faces → Development →
  Main → Image.
- **Why it fails:** editorial/commercial/runway are *work types*, not the segment an agency routes on. A
  curve model, a classic/mature model, a commercial actor and a creator all finish onboarding indistinguishable
  from a new-faces fashion hopeful, and the agency receiving the submission has to infer the board from the
  photos. R1 §4.2 also notes city-first is more common than board-first at intake (Wilhelmina, Ford and IMG
  all open with "Select the city closest to you") — Pholio asks the city last and lets it be skipped.
- **Fix:** ask the segment plainly ("Which board are you submitting to? Women / Men / Non-binary / Curve /
  Classic / Talent / Creator"), keep the work-type lanes as a secondary answer, and move the market question
  earlier since it is the field agencies front-load.

### L1-19 [P1] [CONCEPT] "Bring your agency" from the login page drops an agency into the model's digitals-and-measurements flow

- **Where:** `client/src/domains/auth/pages/LoginPage/LoginPage.jsx:528-532` links to
  `/onboarding?type=agency`. `client/src/App.jsx:79` routes `/onboarding` to `CastingCallPage`, which never
  reads `type` (verified: `grep -rn "type=agency"` across `client/src`, `src` and `views` returns only this
  link). `AgencyOnboardingPage.jsx` exists but is imported nowhere.
- **State:** an agency owner clicking "Bring your agency" is asked for their date of birth, then
  "How do you *identify*?", then to upload a headshot and a full-length digital of themselves, then
  "How tall are *you*?".
- **Industry reality:** first-principles. Agency access on Pholio is a vetted request handled elsewhere —
  `GET /partners` redirects to the landing-site request page (`src/domains/auth/routes/auth.js:1066-1075`)
  and `POST /partners` returns 410 with "Agency access requests are reviewed through the Pholio request
  page." So the correct destination exists; the login page points at the wrong one.
- **Why it fails:** it is the single most credibility-destroying path in this lane, because the person it
  fails is the buyer. A head booker evaluating Pholio clicks the only agency-shaped link on the sign-in
  screen and is put through a model's intake.
- **Fix:** point "Bring your agency" at `/partners` (which already redirects correctly), and delete
  `AgencyOnboardingPage.jsx` or wire it.

### L1-20 [P1] [LEAK] A developer test page ships to production at `/onboarding/test`

- **Where:** `client/src/App.jsx:81` — `<Route path="/onboarding/test" element={<TestPreview />} />`, with
  **no** `import.meta.env.DEV` guard, unlike the two adjacent dev routes at `:89-90` and `:93-94` which are
  guarded. Component: `client/src/domains/onboarding/pages/TestPreview.jsx`.
- **String:** "✓ Routing Works!" / "Test page loaded successfully", full-bleed black with gold serif.
- **Industry reality:** first principles — this is the talent product's own domain, one path segment away
  from the signup flow, and the URL is guessable.
- **Why it fails:** a scaffolding artifact on a production surface whose entire proposition is
  "high-end studio asset". It also imports `CastingScout` without using it, pulling the digitals step into
  that chunk.
- **Fix:** delete the route and the file.

### L1-21 [P1] [LEAK] Onboarding hot-links unlicensed third-party stock imagery, with the TODO still in place

- **Where:** `client/src/domains/onboarding/components/LanePlates.jsx:14-19` —
  `// TODO: replace with owned/licensed lane imagery before ship`, followed by three
  `https://images.unsplash.com/...` URLs used as the Editorial / Commercial / Runway plates. Also
  `client/src/domains/onboarding/pages/CastingCallPage.jsx:158-159, 589, 649` (Unsplash portraits as avatar
  fallbacks on the live greet screens, not only in the DEV branch).
- **Industry reality:** first principles, but sharpened by R5 §5.6 and R3 §6 — image provenance and rights
  are the live issue in this industry in 2026, and Getty's contributor policy and the NY replica statute have
  made "whose picture is that" a first-order question. A product asking models to trust it with their
  likeness is illustrating its own categories with photos of unnamed people it does not have rights to.
- **Why it fails:** it is the first visual a talent sees in the flow; it leaks every visitor's IP to a third
  party mid-signup; and the TODO says the team already knows.
- **Fix:** self-host owned or licensed plates. Drop the Unsplash avatar fallbacks — an initial monogram is
  already implemented for the email path (`CastingCallPage.jsx:700-712`) and is the honest default.

### L1-22 [P1] [CLAIM] A Google display name is presented as "Legal Name"

- **Where:** `client/src/domains/onboarding/pages/CastingCallPage.jsx:615-623`. Reachable via `/onboarding`
  after Google sign-up (the greet beat).
- **String:** `<span className="detail-label">Legal Name</span> <span…>{oauthUserData?.name}</span>`, beside
  `Verified Email`.
- **Industry reality:** first principles, with industry weight. A model's working name and legal name are
  routinely different and diverge deliberately; the legal name is a contract and permit field, collected at
  signing (NY Child Performer Permit, CA work permit — R5 §3.3, §3.2), not something a Google profile
  supplies. Setting it beside "Verified Email", which *is* verified, borrows that word's authority.
- **Why it fails:** it asserts a legal fact from an unverified social profile string. If that value later
  reaches a submission or a permit-adjacent field, the product has recorded a legal name it never checked.
- **Fix:** "Name" (and let the talent edit it). Reserve "legal name" for a field that is actually collected
  as one, at the point where it matters.

### L1-23 [P2] [LEAK] Server-side onboarding state errors reach the talent in developer register

- **Where:** `src/domains/onboarding/routes/casting.js` — `invalidOnboardingSequence` messages at `:722`,
  `:739`, `:754`, `:996`, `:1090`, `:1472`, `:1675`, `:1797`, `:1815`, `:1909`; plus `:1149`
  ("Please upload a headshot photo (**digi**)"). These 403/400 bodies are surfaced verbatim: the client's
  `castingRequest` reads `errorData.message` (`client/src/domains/onboarding/hooks/useCasting.js:38-42`) and
  `CastingScout.jsx:207` renders it as the body of a `TransferFailureNotice` titled "Save failed".
- **Strings:** "Cannot advance onboarding from the current step via entry." · "Confirm your photo after the
  **scout step** when it is the current step." · "Confirm measurements when measurements is the current
  onboarding step." · "Submit your date of birth when the birthdate step is active."
- **Industry reality:** first principles. `scout`, `entry`, `birthdate` are internal step ids; the rail calls
  those steps Identity / Digitals / Stats / Details. `digi` is a multipart field name.
- **Why it fails:** the flow's user-facing voice is careful and human ("That's the one.", "Noted."); its
  failure voice is a state machine describing itself.
- **Fix:** map these to one recoverable sentence in the flow's own vocabulary — "Something went out of order.
  Reload and pick up where you left off." — and keep the state detail in the response code, not the message.

### L1-24 [P2] [CONSISTENCY] The flow says Instagram sign-up is unavailable, then offers an Instagram sign-up button

- **Where:** `client/src/domains/onboarding/pages/CastingEntry.jsx:264-267` sets
  "Instagram sign-up is unavailable during this adults-only launch. Start here, then use Google or email."
  on the login→onboarding handoff rejection path, while `:549-562` renders a working "Sign up with Instagram"
  button and `:313-338` calls `startInstagramAuth({ flow: 'signup' })`.
- **Why it fails:** a user bounced from `/login?continue=…` is told the method does not exist, then shown it
  one screen later. One of the two is wrong.
- **Fix:** decide, and delete the other. If Instagram signup is live, the rejection message should say only
  "Start here with your date of birth."

### L1-25 [P2] [DATA] Height cannot carry a half-inch

- **Where:** `client/src/domains/onboarding/pages/CastingMeasurements.jsx:557-561` (`augment` steps by
  2.54 cm in imperial, 1 cm in metric) and `:474` (`height_cm: Math.round(...)`).
- **Industry reality:** R2 §4.1 finding 6: "Height is the one measurement with fractional precision —
  `5'11'' 1/2` (Storm). Half-inches matter." Models 1 publishes `177.5 CM`; Storm publishes `5'11'' 1/2`.
- **Why it fails:** height is the one number that gates a board, and the half-inch is the part models argue
  about. Rounding it away at capture cannot be recovered later.
- **Fix:** half-inch (and 0.5 cm) increments on the height dial; store the un-rounded cm.

### L1-26 [P2] [LEAK] The public portfolio advertises the model's Pholio subscription tier

- **Where:** `views/portfolio/show.ejs:19` — `<span class="portfolio-pro-badge">Studio+</span>` beside
  `<span class="portfolio-pro-eyebrow">Pholio Portfolio</span>`, in the hero card of every `is_pro` public
  portfolio at `/portfolio/:slug`.
- **Industry reality:** no sampled agency board carries a badge, score or verification mark of any kind
  (R2 §4.2). R5 §5.2 lists "premium membership" signalling among the scam-coded patterns.
- **Why it fails:** a booker opening a model's portfolio link sees the model's *billing tier* on the page.
  It says nothing about the model and everything about the platform, and it reads as paid placement.
- **Fix:** remove the badge from the public template.

### L1-27 [P2] [CONCEPT] A dead "Agency Invitation" modal ships inside the live public portfolio template

- **Where:** `views/portfolio/show.ejs:396-466`, triggered by `?ref=agency&agency_id=…&token=…` on any public
  `/portfolio/:slug`. It POSTs to `/api/talent/redirect-apply`, which
  `src/domains/talent/routes/applications.js:3388-3399` now answers **410**:
  "Agency invite submissions must be reviewed and sent through the standard submission flow."
- **String/state:** "Agency Invitation" → "An agency has invited you to apply directly to their **roster**."
  → "Apply Now" → `alert()` with the 410 message. Its success path claims "Application Sent! The agency has
  received your application." Nothing in the codebase still mints these links
  (`grep -rn "ref=agency"` finds none).
- **Industry reality:** R2 §2.1 — "roster" is the whole agency's talent, spoken about externally; you do not
  *apply to a roster*. R2 §3.1 — an agency *offers representation*; there is no "accepted application" state.
- **Why it fails:** a live public template carries a retired flow that promises something no longer possible,
  in slate-and-blue inline styles from a different design system, ending in a browser `alert()` with an
  internal sentence. The `/apply` fallback it names redirects to `/onboarding` (`App.jsx:80`), which would
  send a signed-in talent back into signup.
- **Fix:** delete the block.

### L1-28 [P2] [STATE] The moderation console's CSAM escalation has no named destination

- **Where:** `client/src/domains/moderation/pages/ModerationQueuePage.jsx:262-311`; server
  `src/domains/moderation/routes/reports.js:390-412`. Reachable at `/dashboard/moderation` for moderators.
- **String/state:** three buttons — "False positive" / "Cleared" / "**Escalate**" — with the note passed as
  the fixed string `'Reviewed in moderation console'` (`:93`). Rows render as
  "Severity: {severity} · Image {imageId}" with no image and no case record.
- **Industry reality:** first principles plus R5 §5.5's COPPA/FTC context (Explore Talent was charged over
  minors' data on a talent platform). "Escalate" is a transition whose owner and destination are unstated —
  the one state in this console where that matters legally.
- **Why it fails:** a moderator cannot tell what "Escalate" does or to whom, and the audit note is a
  constant, so the record cannot say why. Server messages surfaced to this page also leak enum lists
  (`status must be one of: pending, reviewed, actioned, dismissed`, `reports.js:197`).
- **Fix:** name the destination on the button and record a real reviewer note; render the enum lists as
  labels rather than echoing the constant.

---

## Coined / internal terms encountered

| Term | Where | Verdict | Translation |
|---|---|---|---|
| **casting call** (for the signup flow) | `CastingCallPage.jsx`, route file `src/domains/onboarding/routes/casting.js`, API paths `/casting/*`; server messages "Ready to start casting call." (`casting.js:797`), "Casting call completed successfully" (`:1936`) | **Keep internal — never surface.** Currently hidden: the rail says Identity / Digitals / Stats / Details and the URL is `/onboarding`. | A casting is a client-facing selection for a specific job; applying to an agency is a *submission* or *open call*, never a casting (R1 §2). Those two server `message` strings are one refactor away from a toast. |
| **scout** (the digitals step) | `CastingScout.jsx`, `/onboarding/scout*`, `useCastingScout` | **Hide** — mostly hidden (rail label is "Digitals"), but leaks in `"Confirm your photo after the scout step…"` (`casting.js:1472`) | A scout is a person who finds talent (R1 §2, 8 sources). Uploading your own photos is not scouting. |
| **fitting** (the measurement step) | `CastingMeasurements.jsx:695` | **Translate** | "Your measurements." A fitting is garments on a booked model (R4 §2.2). |
| **lane** (Editorial / Commercial / Runway) | `LanePlates.jsx`, `CastingProfile.jsx:24`, `modeling_categories` | **Translate** | Not an industry noun. Say "work" or, better, ask for the board (R2 §1.1). |
| **discovery submission** | `src/shared/lib/submission-program-content.js:22` | **Translate** | Invented compound. "Submissions you send yourself" vs "invited submissions". |
| **monthly Pholio allowance** | `OpenCallArrivalPage.jsx:362` | **Translate or hide** | An anti-spam cap. Never present it as an allowance to a signed-out visitor (L1-14). |
| **stats_track** (`womenswear` / `menswear` / `ungendered`) | `src/shared/lib/stats-formatter.js` | **Keep — and use it.** Internally correct and currently bypassed by onboarding (L1-08). | Surface it as "Sizing" or as the board, never as the raw token. |
| **digitals** | `CastingCallPage.jsx:44`, `CastingScout.jsx`, open-call field labels | **Keep.** Correct, modern, and used correctly here. | — |
| **package** | consent copy, arrival page, pick list | **Keep.** Matches the booker's word for a client-facing selection (R2 §2, R4 §2.1). | — |
| **book** | `LoginPage.jsx:390` "Welcome back to your book." | **Keep** on the talent side (R3 §2). Wrong on the arrival page's "Review your package — stats, book, and comp card" — an applicant has no book. | — |
| **pick / maybe / pass** | `PickCard.jsx:23-27` | **Keep.** Close to AgencyPin's real client-feedback vocabulary (Interested / Maybe / Not interested, R2 §2.1). | — |
| **shortlist** | open-call spec stage, `MaterialsPage.jsx:219` | **Keep.** The correct and attested word (R4 §2.3, R2 §2). | — |

## Consistency variants

| Concept | Variants seen | Locations |
|---|---|---|
| The set of photos asked for | 2 slots (Headshot, Full length) · 2 slots (`digital_headshot`, `digital_full_length` required) · 5 slots (headshot, three_quarter, full_length, profile, back) | `CastingScout.jsx:291-312`; `openCallIntake.js:101-102`; `client/src/shared/utils/profileReadinessImages.js:171-219` |
| Digitals shot rules | full rule line "Plain background · Natural light · Minimal makeup · No filters" · "current, unretouched, head to toe" · nothing at all | `CastingScout.jsx:325`; `OpenCallArrivalPage.jsx:388`; `OpenCallApplyPage.jsx:940-943` (the anonymous form) |
| Which measurement set to ask for | branched on `gender`, empty for non-binary/undisclosed · branched on `stats_track`, neutral set for `ungendered` · hard-coded "Bust, waist, hips" for everyone | `CastingMeasurements.jsx:37-53`; `src/shared/lib/stats-formatter.js:342-361`; `OpenCallApplyPage.jsx:767` and `MaterialsPage.jsx:377` |
| Height units | dial with imperial/metric toggle · `Height (cm)`, cm-only, cm-only validation · dual `180 cm / 5'11"` at display | `CastingMeasurements.jsx`; `openCallIntake.js:52` + `callCopy.js:77,79`; `stats-formatter.js:195-208` |
| Shoe size | region-tagged capture (US/EU/UK) · region dropped at every display | `CastingMeasurements.jsx:471-478` + `casting.js:1719-1726`; `stats-formatter.js:362` |
| Weight | excluded by the canonical formatter · excluded from the designer DTO by allowlist · labelled empty cell in onboarding review · rendered on the public portfolio | `stats-formatter.js:341-364`; `audience-dto.js:386-397`; `CastingMeasurements.jsx:746-750`; `views/portfolio/show.ejs:50-55, 241-243` |
| Whether Instagram signup exists | "unavailable during this adults-only launch" · a working "Sign up with Instagram" button | `CastingEntry.jsx:264-267`; `CastingEntry.jsx:549-562` |
| Where an agency signs up | `/onboarding?type=agency` (unhandled → talent flow) · `/partners` → landing request page · `AgencyOnboardingPage.jsx` (imported nowhere) | `LoginPage.jsx:530`; `src/domains/auth/routes/auth.js:1066-1075`; `client/src/domains/onboarding/pages/AgencyOnboardingPage.jsx` |
| "Not an agency" disclosure | present, verbatim-grade · absent from every pre-auth talent surface | `SubscriptionCheckoutDisclosure.jsx:46-47` and `submission-program-content.js:6`; onboarding + open-call apply |

## Working well (preserve)

1. **The open-call consent screen.** `client/src/domains/opencall/components/consentCopy.js:138-165` is the
   strongest writing in the product: handling, data categories, third-party (designer) access enumerated
   field by field, the compensation sentence restated verbatim from the organizer, a **dated** 90-day
   retention promise, and withdrawal language honest about copies already downloaded. Two attestations are
   exactly right: "Your statistics and digitals are accurate, current, and unretouched." and "**A submission
   is a request for review and does not guarantee selection, a booking, or payment.**" It is pinned to the
   server's hashed snapshot by a parity test — the right engineering for the right reason.
2. **Two-stage intake (apply → shortlist).** `openCallIntake.js:93-107`, surfaced on the first screen as
   "If they shortlist you — They'll ask for {walk video, availability, measurements} then — not now."
   (`OpenCallApplyPage.jsx:687`). This is the real event workflow (R4 §3.2) and it respects the applicant's
   time.
3. **The designer's read-only scope, stated to the applicant before they send.** "Designers see your name,
   digitals, height, measurements, availability and walk video through a read-only link. They cannot see your
   email, phone, socials or date of birth, and they have no Pholio account." Enforced by allowlist in
   `src/shared/lib/audience-dto.js:386-397`, not just asserted.
4. **`src/shared/lib/stats-formatter.js`.** Track-driven rather than gender-driven, canonical field order
   (Height → core → waist → hips/inseam → dress/suit → shoe → hair → eyes, matching R3 §4.4 exactly), both
   units always derived from the stored canonical value, and a 90-day staleness flag. This is the correct
   model; the problem is the surfaces that bypass it.
5. **`SUBMISSION_PROGRAM_CONTENT`** (`src/shared/lib/submission-program-content.js`): "Pholio is not an
   agency and does not represent talent" · "Representation begins only when you and an agency agree to a
   signed contract" · "**Most submissions are declined or archived without a reply.**" That last sentence is
   the industry norm stated honestly, and it should be lifted onto the pre-auth surfaces that currently omit
   it (L1-02, L1-17).
6. **"Pholio is not a talent agency and does not guarantee representation, bookings, or income."**
   `SubscriptionCheckoutDisclosure.jsx:46-47` — the exact sentence R5 §6 says a platform must be able to say,
   in the exact place a paid tier makes it necessary.
7. **The disown page.** `client/src/domains/opencall/pages/DisownPage.jsx` — sober, sells nothing, and its
   done-state is honest about the limit of what Pholio can do: "We've told the organizer the address was
   disputed; what they do with the application is theirs to decide."
8. **Refusing to invent an agency logo.** `OpenCallArrivalPage.jsx:293-296` and `OpenCallApplyPage.jsx:686`:
   "Their real mark, or nothing — a generated monogram is a fake logo at exactly the moment trust is being
   established."
9. **The 18+ gate order.** Date of birth is asked and confirmed *before* any identity provider can be
   invoked (`CastingEntry.jsx:484-511`, enforced server-side at `casting.js:130-186`), which is IMG's
   documented pattern minus the safety interstitial (R1 §5.4). The refusal copy is polite and non-punitive.
10. **The measurements recency attestation** on the materials page (`MaterialsPage.jsx:269-272`) and the
    shoe-region capture with an explicit "scales are not interconvertible" comment
    (`CastingMeasurements.jsx:83-89, 543-549`) — both show a real understanding of the data; they just need
    to survive to display.
11. **`/opencall/materials/:token` requires no account to answer** ("You do not need a Pholio account to send
    these", `MaterialsPage.jsx:223`). Answering a question you were asked should never cost a signup.
12. **Minor exposure is blocked on the public portfolio** without guardian consent
    (`src/routes/portfolio.js:462-468`), and full-length uploads are blocked at *collection* for minors, not
    just at display (`casting.js:1168-1176`).

## Dead or unreachable code carrying issues

- `client/src/domains/onboarding/pages/AgencyOnboardingPage.jsx` (627 lines) — imported nowhere. Carries a
  member-role picker with `SCOUT` / `Scout` options and a full agency setup flow. Its absence is what makes
  L1-19 a live bug.
- `client/src/domains/onboarding/pages/CastingBirthdate.jsx` — referenced only by itself; the DOB question
  now lives inside `CastingEntry`. The server route `POST /onboarding/birthdate` and its state-machine branch
  (`casting.js:1025-1110`, including the user-facing "Submit your date of birth when the birthdate step is
  active.") remain live.
- `client/src/domains/auth/components/TalentSpotlight.jsx` — imported nowhere. Carries an eyebrow
  "The Talent Platform" and the headline "Your portfolio, built with intention."
- `views/auth/partners.ejs` — never rendered (`POST /partners` returns 410 / redirects,
  `src/domains/auth/routes/auth.js:1077-1091`). Carries "Partner with Pholio / Join as an Agency or Scout"
  and a role list Booker / Director / Scout / Other.
- `FramePits` reading chips in `CastingScout.jsx:34-52, 228-230` — permanently empty; `slot.signals` is never
  assigned (see L1-06).
- The `?ref=agency` modal in `views/portfolio/show.ejs:396-466` — shipped in a live public template against a
  410 endpoint (see L1-27).

## Coverage

**Read in full:** `client/src/App.jsx`; `client/src/domains/onboarding/pages/{CastingCallPage, CastingEntry,
CastingGender, CastingScout, CastingMeasurements, CastingProfile, CastingVerifyEmail, AcknowledgmentBeat,
OpenCallArrivalPage, TestPreview}.jsx`; `components/{GenderTiles, LanePlates}.jsx`;
`client/src/domains/auth/pages/{LoginPage, ForgotPasswordPage, ResetPasswordPage, InstagramCallbackPage}`,
`components/{AuthEntrySplash, TalentSpotlight}.jsx`, `shared/layouts/AuthLayout.jsx`;
`client/src/shared/components/{LegalNoticeLine, SubscriptionCheckoutDisclosure, billing/CheckoutHandoff}.jsx`;
`client/src/domains/opencall/**` (apply page, claim, disown, materials, `callCopy.js`, `consentCopy.js`,
`AttestationStatement.jsx`); `client/src/shared/constants/openCallIntake.js`;
`client/src/domains/messaging/pages/ReplyPage.jsx`; `client/src/domains/events/pages/PickListPage.jsx` +
`components/PickCard.jsx`; `client/src/domains/moderation/pages/ModerationQueuePage.jsx`;
`client/src/shared/utils/talentAge.js`; `views/guardian-consent.ejs`, `views/portfolio/show.ejs`,
`views/auth/{login,partners}.ejs`, `views/errors/{403,404,422,500}.ejs`;
`src/domains/onboarding/routes/casting.js` (eligibility, entry, gender, scout, scout/confirm, measurements,
profile, complete); `src/domains/talent/routes/guardian-consent.js`;
`src/domains/auth/routes/auth.js` (login render paths, `/signup`, `/partners`);
`src/domains/events/routes/pick-share.js`; `src/shared/lib/{stats-formatter, audience-dto,
submission-program-content}.js`; `src/routes/portfolio.js`; `src/domains/moderation/routes/reports.js`
(messages + enums); `src/app.js` (mount order); `PRODUCT.md` (scope boundary only, per brief rule 1).

**Read but not audited (other lanes' surfaces, read only to trace a claim to its source):**
`client/src/domains/talent/routes|utils` files reached via `sendReadiness`, `profileReadinessImages`,
`applications.js:redirect-apply`, `submission-disclosure-content.js`.

**Skipped and why:** agency-side surfaces (groups 14-26) — lanes 2/4. Talent dashboard, media/book, apply
workspace, intel, settings, comp-card PDF pipeline (groups 3-11) — lanes 3/5, except where a pre-auth string
depended on them. Email templates and notification writers (groups 27-28) — separate lane. `.claude/skills/**`,
`docs/audits/**`, `docs/*audit*`, `tasks/**`, `DESIGN.md`, `CLAUDE.md` — excluded by brief rule 1;
`PRODUCT.md` read once for scope only. CSS/`.module.css` files read only where a class name was load-bearing
(e.g. `portfolio-pro-badge`).
