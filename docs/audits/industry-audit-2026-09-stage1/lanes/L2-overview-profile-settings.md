# Lane 2: talent dashboard shell · Overview · Profile · Settings  ·  audience: talent

All paths relative to `/home/user/pholio-app`. Route mounting confirmed in `client/src/App.jsx`
(`/dashboard/talent`, `/dashboard/talent/profile`, `/dashboard/talent/settings[/:section]`, all
inside `DashboardLayoutShell` → `TalentLayout`).

## Verdict

This slice is two products fighting each other. One of them is genuinely excellent and would
survive a booker's scrutiny: the Studio+ lede ("Nothing an agency sees or receives changes with
it"), the flat tier-blind submission quota with its §1701 reasoning written into the code, the
per-purpose likeness consent ledger with scope/purpose/compensation/duration and an append-only
history, the 90-day `StatsCurrencyPrompt` that deliberately refuses the word "confirmed", the
free hand-verified open-calls card, and the enumerated account-deletion consequences. Those are
better than most of the industry.

The other product is a completeness-score engine that tells the talent things nobody knows. It
computes a percentage out of hand-assigned points, bands it into "Build your package / Strong
package / **Agency grade**", and captions the top band "Complete and current — ready for agency
review" and "Your profile matches what bookers look for when shortlisting". No agency has seen
the profile. The same engine drives an "Agency visibility pending — complete essentials to appear
in search" line on the Profile hero, which is simply not how discovery works in this codebase —
`isAgencyDiscoverable()` reads the `is_discoverable` toggle in Settings and nothing else. Around
that sit an "In review" Overview KPI counting an auto-set `pending` status, a self-declared
"booking lane" taxonomy that mixes real boards (Curve, Petite) with job types, a weight tape
rendered second on every adult's stat block, a shoe converter that returns EU 49 for a US 9, and
— the finding that would end the conversation with any UK agency — a guardian-consent switch that
*unlocks* bust/waist/hip capture on a 15-year-old's profile and then lists those measurements as a
Required item. BFMA's line is that measuring an under-18 beyond height is inappropriate full stop;
Pholio has built consent as the key to it.

The headline gap: **Pholio's profile model asserts agency judgement (readiness, grade, visibility,
interest, lane fit) that only agencies can make, and its minor-safety model treats guardian consent
as an unlock rather than a floor.**

---

## Findings

### L2-01 [P0] [MINOR] Guardian consent *unlocks* bust/waist/hips and weight on a minor's profile, and the checklist then requires them
- **Where:** `client/src/shared/utils/talentAge.js:63-66` (`minorSensitiveFieldsUnlocked`);
  `client/src/domains/talent/pages/ProfilePage/MeasurementsSection.jsx:57-73`;
  `client/src/domains/talent/components/profileReadinessItems.js:16-27, 129-136, 186-198`;
  `client/src/shared/utils/profileScoring.js:158-162, 172-179`. Reachable via
  `/dashboard/talent/profile` (`MeasurementsSection` rendered unconditionally at
  `ProfilePage/index.jsx:1046`) and the readiness sidebar at `ProfilePage/index.jsx:906`.
- **String/state:**
  - "Measurements and weight stay locked until a parent or guardian consents in Personal Details."
    (`MeasurementsSection.jsx:69`)
  - "Guardian Consent — A parent or guardian must consent before we collect measurements or
    full-length imagery." (`profileReadinessItems.js:21-24`)
  - Once consent is on file, `activeRequiredItems()` re-adds `measurements`
    ("Measurements (Bust/Waist/Hips)") and `photo_full_body` to the **Required** tier for a minor,
    worth 12 points each, and `weight` returns to the Improve tier.
- **Industry reality:** BFMA Code of Practice, quoted verbatim in R3 §4.7 and R2 §5.4 and R5 §4:
  *"We believe it is inappropriate to measure any young person under the age 18 except for their
  height."* R3 §4.7 and §7.4 are explicit about the product consequence: *"a stats model must be
  able to structurally omit B/W/H for under-18s, not merely leave the fields blank, and must never
  surface a bust/waist/hip capture UI to a minor's account."* Docherty's kids board displays height
  only; printer guidance for children's cards substitutes age range for the B/W/H triple entirely
  (R3 §4.7). R5 §7.5 lists "No body data. Height only. No bust/waist/hips" as an obligation that
  flows from touching minors at all — it is not consent-waivable, because it is a
  child-safeguarding norm, not a data-protection permission.
- **Why it fails:** The product has modelled a safeguarding floor as a data-protection gate. A
  guardian can consent to processing; a guardian cannot make it appropriate to take a 15-year-old's
  hip measurement, and no BFMA member agency would ask for one. Worse, the consented minor is then
  *scored down* for not supplying it — the Required tier is what `isCoreReady` and the whole
  "Agency visibility" gate depend on, so a minor who withholds their hips sits permanently below
  the gate. This is the single finding most likely to make a UK agency close the tab.
- **Fix:** Make the under-18 stat set structurally `{height}` plus clothing/shoe size and age, with
  no bust/waist/hips/weight/inseam fields rendered at all and no readiness item referencing them,
  regardless of guardian consent. Keep guardian consent for what it legitimately governs
  (account operation, communication routing, submission, imagery release). Re-word the lock copy
  from "stay locked until a parent or guardian consents" to a statement of the rule: "Pholio does
  not record measurements other than height for anyone under 18."

### L2-02 [P0] [CLAIM] "In review" on the Overview counts a status the product sets itself the moment the talent hits send
- **Where:** `client/src/domains/talent/pages/OverviewPage/index.jsx:300-306` (KPI);
  `client/src/domains/talent/utils/applicationStatus.js:58-76` (`pending`/`submitted` →
  `label: 'Under Review'`, `group: 'inReview'`); written by
  `src/domains/talent/routes/applications.js:1526, 1572, 1984` (`status: "pending"`);
  bell copy `src/shared/services/notifications.js:311-316, 412-413`. Reachable via
  `/dashboard/talent` and the talent bell (`TalentLayout/index.jsx:166-197`).
- **String/state:** KPI label `"In review"`; status label `"Under Review"`; next-step line
  `"The agency is reviewing — we'll notify you the moment this changes."`; notification
  `"Application under review" / "${agency} is reviewing your submission."`; and
  `"Application submitted" / "Your application to ${name} is in review."`
- **Industry reality:** R2 §3.1 [1]: the inbox is a *"weak, short-lived state… Silence is the norm.
  There is no rejection event. Nothing is sent."* R1 §B7 and R0 §21: a platform can know what was
  sent and whether it was opened; it cannot know that anyone is reading it. R5 §5.5 and R0 §24:
  outcome copy must attribute silence to the platform's own window, not to agency activity.
- **Why it fails:** `pending` is written by Pholio at insert time. Nobody at the agency has opened
  anything. The talent is told four separate times ("In review", "Under Review", "The agency is
  reviewing", "is reviewing your submission") that a human is working on their file, and then —
  weeks later — gets `closed_no_response`. The product's own `closed_no_response` handling is
  scrupulously honest ("The agency did not respond within its review window"); the state that
  precedes it is not, and the contradiction is what a talent will remember.
- **Fix:** Split "received by Pholio / delivered to the agency / opened by the agency". Label the
  auto-set state by what actually happened — `Sent` or `Delivered ${date}` — and reserve any
  "review" language for a state an agency action wrote. Restate the KPI as "Open" or "Awaiting a
  reply", and put the honest expectation in the panel: most submissions never get a reply.

### L2-03 [P0] [CLAIM] "Agency visibility pending — complete essentials to appear in search" is false
- **Where:** `client/src/domains/talent/pages/ProfilePage/index.jsx:867-892`, gated by
  `showReadinessGate = isGateEntry && !isCoreReady` (`:799`). Reachable: `ProfileGateBanner` links
  to `/dashboard/talent/profile?gate=true` from Market
  (`client/src/domains/talent/components/ApplicationsView.jsx:483`), the Apply flow
  (`ApplyPage/ApplyExperience.jsx:2192, 2395`) and the comp-card gate
  (`components/CompCardGate.jsx:103,125,131`).
- **String/state:** "Agency visibility **pending** — complete essentials to appear in search.
  {n} items remaining"
- **Industry reality / code trace:** Agency Discover eligibility is decided entirely by
  `isAgencyDiscoverable()` in `src/shared/lib/profile-visibility.js:135-142`: `is_discoverable ===
  true`, not a minor, not blocking the agency. Semantic search additionally requires
  `embedding_processing_consent` (`src/domains/ai/discover-index.js:311`). Nothing anywhere reads
  profile strength, `isCoreReady`, or the readiness percentage. The actual switch is a toggle three
  screens away in Settings → Presence ("Agency discovery",
  `SettingsPage/index.jsx:753-755`), and its server default is `is_discoverable = false`
  (`src/domains/talent/routes/settings.js:605`).
- **Why it fails:** The talent is told the reason they are invisible is an incomplete checklist,
  when the real reason is an off switch they were never pointed at. They can complete every field,
  reach 100%, and still not appear. R5 §6 lists predicting agency-side outcomes in talent-facing
  copy under MUST NOT; this is worse than a prediction — it is a false causal claim about the
  product's own mechanics.
- **Fix:** Say what is true and what the control is: "You are not currently listed in agency search.
  Turn on Agency discovery in Settings." If the completeness gate is meant to exist, make it real
  in `isAgencyDiscoverable()` — but then it must be stated as Pholio's rule, not as an agency's.

### L2-04 [P0] [CLAIM] The readiness bands award an agency verdict Pholio cannot award
- **Where:** `client/src/shared/utils/profileScoring.js:380-415` (`getStrengthUI`), rendered at
  `client/src/domains/talent/components/ProfileReadinessSidebar.jsx:143, 245, 258`. Server twin at
  `src/domains/talent/services/profile-strength.js:581-615`. Reachable via
  `/dashboard/talent/profile` (`ProfilePage/index.jsx:906`).
- **String/state:**
  - `label: 'Agency grade'` · `message: 'Complete and current — ready for agency review.'`
  - `label: 'Strong package'` · `message: 'Your profile matches what bookers look for when
    shortlisting.'`
  - `"Submission package complete — ready for agency review."` (`ProfileReadinessSidebar.jsx:258`)
  - `"Profile readiness  92%"` (`:201-206`), progress ticks labelled `Core` / `Strong` (`:236-243`)
- **Industry reality:** R0 §21: *"Any UI that says … 'you're a strong fit', 'ready for agencies',
  'match score' is asserting beyond data."* R2 §2.1 on "match / match score": *"Nothing in agency
  software scores talent-to-client fit… An algorithmic match score would read as unserious."*
  R5 §6 MUST NOT: *"Predicting outcomes ('high chance of signing', 'strong match', 'top 5% of
  applicants') in talent-facing copy"* — the FTC's own enforcement lane (FTC 1999 modeling-agency
  action turned on claims of selectivity and suitability, R5 §5.2). R2 §4.2: agency boards carry
  *"No badges, scores, or verification marks anywhere in the sample."*
- **Why it fails:** "Agency grade" and "matches what bookers look for" are assertions about
  external professional judgement, derived from whether nine fields are non-empty and five photo
  types exist. The point weights (name 8, city 4, measurements 12, full-body 12, weight 2) are
  arbitrary and are presented as a percentage, which reads as a measurement. A booker seeing a
  screenshot of "Agency grade — ready for agency review" on a profile they have never seen would
  file the whole product under the paid-listing category R5 §5.2 describes.
- **Fix:** Keep the checklist, drop the grade. Show `n of m essentials complete` and the list.
  Band captions become descriptive, not evaluative: "Essentials complete", "Everything on the
  checklist is filled in". Never use "agency", "booker", "shortlist" or "ready" as the subject of a
  completeness state. If a percentage stays, label it "Checklist complete", not "readiness".

### L2-05 [P0] [MINOR] The Profile accepts any past date of birth — there is no minimum age anywhere in this surface
- **Where:** `client/src/schemas/profileSchema.ts:52-57` (only rule: not in the future);
  server `src/shared/lib/validation.js:197-220` (`dateOfBirthSchema`, same single rule) used by the
  profile PUT at `:675`. Reachable via `/dashboard/talent/profile` → Personal Details → Save.
- **String/state:** the only validation message is `"Date of birth cannot be in the future"`.
  `MINOR_AGE_THRESHOLD = 18` (`client/src/shared/utils/talentAge.js:6`) is the only age constant;
  `computeAge` accepts `age >= 0`.
- **Industry reality:** R5 §7.1: *"Set and enforce a minimum age… **Under-13 acceptance triggers
  COPPA verifiable-parental-consent obligations** — the exact charge in FTC v. Explore Talent"*
  (which was charged for collecting the personal information of 100,000+ children). Storm accepts
  15–18 with the guardian completing the form; IMG's Get Scouted and getscouted.co both permit
  16–18 with verifiable consent and **bar under-16s** (R5 §7.1, §5.2). R1 §4.3 covers the same.
- **Why it fails:** A signed-in talent can set their DOB to make themselves 9 and the profile saves.
  Everything downstream then routes through `isMinorProfile` as if guardian consent were sufficient
  — which for an under-13 it is not, in the sense COPPA means. There is no floor, no message, and
  no refusal.
- **Fix:** Enforce a stated minimum age on both schemas with an explicit message ("Pholio accounts
  are for people aged 16 and over. If you are under 16, an agency's own kids division is the right
  route."), and refuse the save rather than branching on it. Publish the minimum where the DOB is
  collected, as Storm/IMG/Elite all do.

### L2-06 [P0] [CLAIM] The image-analysis consent misses every 2026 requirement except separation
- **Where:** `src/domains/talent/routes/settings.js:74-84` (`AI_CONSENT_PURPOSES.image_analysis`),
  rendered at `client/src/domains/talent/pages/SettingsPage/index.jsx:1251-1257` with the fallback
  copy duplicated at `:1216-1217`. Reachable via `/dashboard/talent/settings/privacy`.
- **String/state:** *"Allow Pholio to send portfolio images to its image-analysis provider for
  shot classification and profile insights."* + *"Turning this off prevents future provider calls
  and clears Pholio's stored image-analysis results."*
- **Industry reality:** R5 §5.6 enumerates what a legitimate "consent for AI analysis of photos"
  has to contain in 2026. Measured against it, this text has (1) separation ✓ and (8) minors
  excluded ✓ and partial (7) withdrawal ✓ — and is missing:
  - (4) **an explicit no-training commitment.** Storm's AI Code of Practice, verbatim: *"Data
    collected from a model or talent through photography or videography must not be used in any AI
    training datasets."* R5 calls this *"the published industry expectation, not a nicety."*
  - (3) **naming the system and stating human oversight** ("pre-disclosed and properly vetted",
    "Human oversight and accountability must always be maintained" — Storm).
  - (2) **a specific purpose.** "profile insights" is the "to improve our services" pattern R5 §5.6
    names as the wrong model; Elite's *"sole scope of a preliminary evaluation of your potential as
    a model"* is the right one.
  - (5) an explicit statement that this creates no digital replica.
  - (7) a **stated retention period** (Storm publishes 30 days for unsuccessful applications).
  - (6) Art. 9 handling — the sibling embedding disclosure does this well ("never your face, age,
    heritage, or body"); this one is silent while the same provider writes the descriptions.
- **Why it fails:** Premier publishes a standalone anti-AI-data-mining agreement; BFMA publishes
  a 10-point model's-rights statement; the EU AI Act Art. 50 has applied since 2 Aug 2026. An
  agency evaluating whether to send its talent here will read this sentence and find no promise
  that the images stay out of a training set. It is the one sentence they are looking for.
- **Fix:** Rewrite to the R5 §5.6 shape and bump `AI_CONSENT_DISCLOSURE_VERSION` (the versioning
  and hashing machinery is already correct): name the provider, state the sole purpose, state that
  images are never used to train any model, state that no digital replica is created under this
  permission, state the retention period and the deletion-on-withdrawal behaviour, and state that
  no attribute inference about face, age, heritage or body is derived or stored.

### L2-07 [P0] [SCOPE] An OnlyFans field and a nudity "content boundaries" picker sit on the modelling profile
- **Where:** `client/src/domains/talent/pages/ProfilePage/VerifiedAdultSection.jsx:28-35, 243-245,
  377-390`; persisted by `src/domains/talent/services/age-verification.js:88-140`. Rendered
  unconditionally at `ProfilePage/index.jsx:1538`.
- **String/state:** Section "Private **context**" — *"A private, Stripe-verified statement that you
  are 18 or older — plus the boundaries and links you only share on purpose."* Options:
  `Swimwear · Lingerie · Implied Nudity · Artistic Nudity · Fitness / Athletic · Body Paint`,
  placeholder *"Select the work you are open to discussing"*; field `OnlyFans`
  (`https://onlyfans.com/username`).
- **Industry reality:** The most repeated sentence in legitimate agency safety copy is the refusal
  of nude/lingerie material. R5 §5.1 quotes six independent sources; R2 §5.1 shows IMG, Premier and
  SMG converging on it verbatim (*"we never request photos in the nude or lingerie"*, *"will never:
  Request nude or lingerie photos"*). R5 §6 MUST NOT: *"Nude / lingerie / swimwear requests to any
  user."* BFMA permits an agency to assess body type via swim/underwear digitals for adults — but
  that is an agency's in-house request at a meeting, not a taxonomy a platform asks a hopeful to
  self-declare into. There is no industry precedent whatsoever for an OnlyFans field on an
  agency-intake record; R2 §4.4 shows agencies publish an Instagram *link* and nothing else.
- **Why it fails:** Whatever the intent (and the privacy boundary line — *"Private to you. Shared
  only if you attach it to a specific submission"* — is well written), this is the exact register
  a scout-scam operator uses to open the conversation, and the field names are the ones every
  legitimate agency prints on its safety page as things they will never ask about. A model who has
  read Premier's staying-safe page and then sees "Artistic Nudity" as a selectable option inside a
  modelling portfolio product has been given a reason to leave.
- **Fix:** If the adult-content market is genuinely in scope, it is a separate product surface with
  its own consent, not a section of the agency-submission profile. If it is not, delete the
  OnlyFans field and the nudity options and keep only what an agency actually needs from an adult:
  a Stripe-verified 18+ attestation and, at most, a plain "comfortable with swimwear / lingerie for
  a booking" flag phrased as a booking condition, released only with a submission the talent
  chooses. Never present the list as "work you are open to discussing".

---

### L2-08 [P1] [DATA] Weight is the second stat on every adult's card
- **Where:** `client/src/domains/talent/pages/ProfilePage/MeasurementsSection.jsx:36-40, 107-155`
  (`const showWeight = true;` with the comment *"Weight renders for every lane… a stat agencies
  still ask for"*); scored at `client/src/shared/utils/profileScoring.js:288-292`;
  listed at `client/src/domains/talent/components/profileReadinessItems.js:85-88`.
- **String/state:** field `Weight` (kg/lbs measuring tape, rendered immediately right of Height);
  readiness item *"Weight — Some markets list weight alongside measurements."*; scoring why-copy
  *"Some markets list weight alongside measurements for fit checks."*; section description names it
  in the first line: *"Precise stats used in casting search (height, weight, sizing)."*
- **Industry reality:** R3 §4.6 and §7.5: weight is *"Absent from every adult fashion board profile
  I could read (Wilhelmina women, Wilhelmina men, Models 1) and absent from the modern comp-card
  stat lists at Fairway and compcard.com"*, and *"putting it on a fashion stat card in 2026 reads
  as either out-of-date or body-surveillance-y."* R2 §4.1 confirms across Premier, Storm and Viva:
  seven fields, *"No weight."* It survives only in child/actor résumé advice and legacy sources.
- **Why it fails:** Position is meaning. Height–then–Weight is the shape of a 1990s casting résumé
  or a fitness card, not a model's stat block, and this is a body-weight number being requested
  from a population with a documented eating-disorder exposure. The in-code justification ("a stat
  agencies still ask for") is asserted, not evidenced, and R3's primary sample contradicts it.
- **Fix:** Default weight off for every lane; surface it only on the fitness/athletic lane where
  R3 §8 allows it may be legitimately needed, and never in the Required or Improve scoring. Remove
  "weight" from the section description.

### L2-09 [P1] [DATA] The stat order breaks the industry's one invariant, and men's card fields are missing
- **Where:** `client/src/domains/talent/pages/ProfilePage/MeasurementsSection.jsx:107-292` —
  rendered order is **Height → Weight → Shoe Size → Bust/Chest → Waist → Hips → Dress/Suit →
  Inseam → Eyes → Hair → …**
- **Industry reality:** R3 §4.4 synthesises the canonical order from Wilhelmina (US) and Models 1
  (UK) board markup: *Women: Height → Bust (→ Bra/Cup) → Waist → Hips (→ Dress) → Shoe → Hair →
  Eyes; Men: Height → Chest (→ Suit) → Waist (→ Collar) → Inseam → Shoe → Hair → Eyes.* *"Height is
  always first. Hair/eyes are always last. B–W–H are always contiguous and in that order."*
  R2 §4.1 finding 2: *"Order is invariant."* R3 §7.7 lists mis-ordered stats as a top-ten software
  tell: *"The order is the tell."*
- **Why it fails:** Shoe size is interposed between height and the B/W/H block on every profile —
  the one place in the sequence nothing ever goes. Additionally, `sizingFieldsFor('menswear')`
  (`client/src/shared/constants/statsTrack.js:76-80`) gives men Suit but no **Collar** (Wilhelmina
  men: `Collar 15½''`), and womenswear has no **Bra/Cup** field (Wilhelmina women: `bra 30A`;
  German sedcards require Cup-Größe — R3 §4.4). The `Inseam` field is shown to womenswear profiles,
  where no sampled board carries it.
- **Fix:** Reorder to the canonical sequence per track, move Shoe to sit after Hips/Dress (or after
  Inseam for menswear), add Collar to the menswear track and an optional Bra/Cup to womenswear, and
  drop Inseam from the womenswear track.

### L2-10 [P1] [DATA] The shoe converter returns sizes that do not exist, and is not gender-aware
- **Where:** `client/src/shared/utils/measurementConversions.js:31-41`, rendered under the shoe
  input at `MeasurementsSection.jsx:200-208`.
- **String/state:** `US → { UK: s - 1, EU: (s * 2) + 31 }`, `EU → { US: (s - 31) / 2, UK: (s - 33) / 2 }`,
  displayed as `≈ UK 8.0, EU 49.0`.
- **Industry reality / arithmetic:** A US 9 renders as **EU 49**. Models 1's own board shows the
  correct shape: `Shoe 6 UK / 39 EU` for one person; R3 §4.5 gives `Shoes 8.5 US / 39 EU`. Real
  men's US 9 ≈ EU 42–43; women's US 9 ≈ EU 40. The EU formula doubles the input. The inverse is
  equally wrong (EU 42 → US 5.5). Separately, R3 §4.5: *"There is no universal shoe number; a
  single unlabelled shoe field is a localisation bug the moment the profile crosses a border"* —
  and US→UK is −1 for men but ≈ −2 for women, so one formula cannot serve both tracks.
- **Why it fails:** Shoe size is one of the seven fields on every board. A card that says EU 49 is
  not a rounding error, it is a wrong number a booker will notice immediately, and it will be
  printed onto the comp card. The talent has no way to know it is wrong.
- **Fix:** Replace the linear formulas with a per-track lookup table (womenswear / menswear ×
  US/UK/EU), store the entered region alongside the value, and render the two locales the board's
  market expects rather than an approximate third. Drop the `≈` and the spurious decimal on EU.

### L2-11 [P1] [DATA/CONSISTENCY] Dress and suit size carry no locale while shoe size does
- **Where:** `MeasurementsSection.jsx:270-296` — `Dress Size` options
  `['0','2','4','6','8','10','12','14','16','XS','S','M','L','XL']` with no region control;
  `Suit Size` free text `"e.g. 40, M, 50"`. Compare the shoe field's US/UK/EU toggle at `:161-181`.
- **Industry reality:** R3 §4.5: *"Dress/suit sizing is not globally comparable either (US 2 ≈ UK 6
  ≈ EU 34 ≈ IT 38 ≈ FR 36)… Store the locale with the size"* (R3 §8). The option list also mixes
  two incompatible systems (numeric US ladder and letter sizing) in one select, and the suit
  placeholder mixes a US number (40), a letter (M) and an EU number (50) as if interchangeable.
- **Why it fails:** A UK talent picking "8" means something two sizes away from a US "8", and a
  US agency reading the card has no way to tell which was meant. The product already knows how to
  do this — it does it for shoes on the adjacent row.
- **Fix:** Add the same region control to dress/suit sizing, store the locale with the value, and
  split the letter ladder out as its own optional field rather than mixing it into the numeric one.

### L2-12 [P1] [CONCEPT] "Booking lanes" is an invented taxonomy that mixes boards with job types, and lets the talent assign themselves to them
- **Where:** `client/src/shared/constants/bookingLanes.js:1-72`;
  `client/src/domains/talent/pages/ProfilePage/BookingLanesControl.jsx:36-110`;
  `DisciplineSection.jsx:70-91`. Reachable via `/dashboard/talent/profile` → Discipline & Focus.
- **String/state:** headings `Primary Lane` ("Choose one") / `Secondary Lanes` (0/3); options
  `Commercial · E-comm · Editorial · Runway · Lifestyle · Beauty · Fitness / Athletic · Fit ·
  Parts · **Curve** · **Petite** · Promotional / Events · **Creator / UGC**`; footnote
  *"Booking lanes are market routes."*; section description *"This shapes which fields you see and
  how agencies filter you."*
- **Industry reality:** R2 §1.1: the industry's organising unit is the **board** — a desk with its
  own bookers and phone line — and R2 §1.2 shows boards are a matrix of *segment* (Women / Men /
  Non-binary / Curve / Classic / Kids / Talent / Creators) × *career stage* (New Faces →
  Development → Main → Image). Curve, Petite and Creators are **boards** (R2 §2 vocabulary table,
  4–5 primary sources each); Editorial, Runway, E-comm and Fit are **kinds of job**. Mixing them in
  one radio group is a category error a booker will see instantly. R2 §1.3: board placement *"is a
  deliberate act by the agency, not a status the talent sets."*
- **Why it fails:** The talent is asked to pick one primary market route and up to three
  secondaries — a routing decision R2 §1.1 describes as simultaneously a pricing, client-list and
  career-stage decision made by a desk. A model who ticks "Curve" and "Runway" has declared a board
  and a job type as peers.
- **Fix:** Split into two fields with honest names: *work you're seeking* (multi-select of job
  types: editorial, runway, commercial, e-comm, beauty, fit, parts, promotional) and *board fit*
  (Women / Men / Non-binary / Curve / Petite / Classic / Talent / Creators) — the latter phrased as
  what the talent believes, never as an assignment. Drop "lane"; use "board" or "division", which
  the rest of the codebase already uses (`representations.division`, agency `divisions.js`).

### L2-13 [P1] [CLAIM] "Bookers on this board scan for…" — the talent is not on a board, and the board was guessed from keywords
- **Where:** `client/src/shared/constants/profileDivision.js:36-58` (`DIVISION_READINESS_CONFIG`),
  `:95-116` (`resolveTalentDivision`), consumed by
  `client/src/domains/talent/components/profileReadinessItems.js:220-247` to reorder the checklist.
- **String/state:** taglines *"Bookers on this board scan for clean digitals, profile angles, and
  editorial range."* / *"…scan for smile energy, relatable lifestyle frames, and social proof."* /
  *"Casting teams on this board scan for story, training, and audience-facing presence."* /
  *"Fit bookers on this board scan for precise measurements and consistent fit stats."*
  The "board" is derived by substring-matching the talent's free-text `specialties` and
  `experience_level` against keyword lists, defaulting to `fashion_editorial`.
- **Industry reality:** R2 §1.1–1.3 (board = desk, agency-assigned, public URL, own phone line);
  R2 §4.2 (no scores or verification marks on any board); R0 §21 (the platform cannot know
  suitability). The four "divisions" here (`Fashion & Editorial`, `Commercial & Lifestyle`,
  `Talent & Performance`, `Fit & Showroom`) match no agency's board list in an 18-agency sample.
- **Why it fails:** The copy speaks in the voice of bookers on a board the talent does not sit on,
  and the board itself was inferred because the word "catalog" appeared somewhere in a free-text
  field. It also silently changes which checklist items are emphasised — so two talents with
  identical profiles get different advice because one typed "e-commerce" in their specialties.
- **Fix:** Either drop the taglines, or attribute them ("What commercial boards typically ask for")
  and drive them from the talent's *declared* board fit (see L2-12), never from keyword inference.
  Never write "Bookers on this board" for someone who is not on one.

### L2-14 [P1] [STATE] Three different availability models on one page, one of which is an outsider term shown to agencies
- **Where:**
  1. `client/src/domains/talent/pages/ProfilePage/index.jsx:65-71` — `AVAILABILITY_OPTIONS`
     `Full-Time · Part-Time · Freelance · Weekends Only · By Appointment`, rendered as
     "Availability" in **Casting Preferences** (`:1259-1272`) **and again** in **Private &
     Compliance** (`:1480-1493`), both bound to `availability_schedule`.
  2. `client/src/domains/talent/pages/ProfilePage/AvailabilitySection.jsx:27-31` — a global status
     radio `Available · Limited availability · Unavailable`, described as *"Your booking status and
     any dates you're booked out — shared with agencies that view your profile."* (`:199`)
  3. The same section's **Bookouts** (date ranges + note) — which is the correct model.
- **Industry reality:** R2 §2.1, verbatim: *"'Available / Unavailable' as a talent-set toggle —
  Availability is a date-range concept on a chart (bookout), never a global on/off flag. A model is
  not 'unavailable'; they are 'booked out 12–19 Oct'."* R2 §4.2: *"No availability, no rates, no
  'status'"* on any public board — those live in the booking system behind the login. R0 §G
  predicts exactly this failure mode. And "Full-Time / Part-Time" is employment vocabulary; models
  are not employed part-time.
- **Why it fails:** A talent-set "Available" broadcast to agencies is a fact only the booking desk
  owns, and it is stale the moment it is set. Meanwhile the same page asks the same question three
  ways in three registers, and the product's own correct answer (bookouts) sits underneath the
  wrong one.
- **Fix:** Delete the global status radio and the Full-Time/Part-Time select. Keep **bookouts** as
  the only availability model, exactly as it is built. If a coarse signal is needed for intake, ask
  the one thing agencies ask on application forms — "can you travel / are you free to attend a
  meeting" — and name it that.

### L2-15 [P1] [DATA] The Profile hero prints "Represented by X" from a legacy column the form can no longer edit
- **Where:** `client/src/domains/talent/pages/ProfilePage/index.jsx:793-797, 863-865`;
  the form strips the column on save at `client/src/shared/utils/formNormalization.js:288`
  (`delete payload.current_agency`); the column is still written by comp-card import
  (`src/domains/talent/services/comp-card-import/proposal.js:52, 245`, field labelled
  "Agency on the card"); the server notes at `src/shared/lib/audience-dto.js:516-520` that
  *"There is no live write-path syncing `current_agency` edits into talent_representations."*
- **String/state:** `Represented by ${values.current_agency}` set as the hero role line under the
  talent's name.
- **Industry reality:** R0 §22 / R2 §5.2: representation is a legal fact the platform cannot verify
  and must be labelled as declared. R2 §1.5: representation has scope (agency, market,
  exclusivity, dates) — the `talent_representations` rows model this correctly.
- **Why it fails:** Two consequences, both bad. (a) A talent who imports an old comp card gets
  "Represented by <old agency>" stamped on their profile header and **cannot remove it** through
  the Profile form, because the save path deletes the field. (b) A talent who correctly records a
  placement in the Representation section sees *nothing* in the hero, because `bookingStatus` never
  reads `representations`. The header therefore states a representation claim that is both stale
  and unfalsifiable by its subject.
- **Fix:** Drive the hero line from the active `representations` rows (mother/placement, market),
  render it as declared ("Represented by X — New York · declared by you"), and either expose or
  retire `current_agency` — a value the talent can neither confirm nor clear must not be displayed.

### L2-16 [P1] [STATE] Representation status and representation rows are two records that can contradict each other
- **Where:** `client/src/domains/talent/components/RepresentationSection.jsx:21-40, 53-74`;
  `client/src/shared/utils/formNormalization.js:116-124` (`deriveRepresentationStatus`).
- **String/state:** radio `Seeking Representation` / `Represented` / `Direct Bookings`
  (values `seeking` / `represented` / `not_seeking`), alongside an "Active Relationships" list.
  Adding a row auto-flips `not_seeking` → `represented`, but selecting `Represented` with zero rows
  is allowed, and selecting `Seeking` while three placement rows exist is allowed.
- **Industry reality:** R2 §1.5: multi-agency representation with a mother agency and placements is
  normal, and *"a model may be represented by several agencies in different markets"* while still
  seeking representation in a market they are not covered in. The relationship rows model this
  correctly (relationship type, market, territory, division, exclusivity, start date — this is the
  best-modelled object in the lane). The tri-state radio flattens it back to the boolean R0 §A3
  warns about.
- **Why it fails:** The radio is a second, lossier answer to a question the rows already answer,
  and the two can disagree. "Direct Bookings" is also a mislabel: the stored value is
  `not_seeking`, which means "not looking for an agency", not "clients book me directly".
- **Fix:** Derive standing from the rows (none = unrepresented; ≥1 active = represented in those
  markets) and replace the radio with the one question the rows cannot answer: *are you open to
  representation offers?* (yes/no), which is orthogonal and can be true while represented.
  Rows also need an **end date / status** control — today `status` is a hidden `'active'` input,
  so a past mother agency can only be recorded in the free-text "Legacy representation notes".

### L2-17 [P1] [CONSISTENCY/DATA] Five fields are rendered twice on the Profile, with contradicting privacy copy
- **Where:** `client/src/domains/talent/pages/ProfilePage/index.jsx` — section `roles`
  "Casting Preferences" (`:1215-1350`) and section `private` "Private & Compliance" (`:1383-1544`)
  both bind `work_eligibility`, `passport_ready`, `drivers_license`, `availability_schedule`,
  `availability_travel`. Both render unconditionally.
- **String/state:** the same field is labelled **"Work Eligibility"** in one section and
  **"Work Authorization"** in the other. The second section is captioned *"Sensitive info agencies
  may require (eligibility, nationality, legal/compliance). **This stays private and isn't shown
  publicly.**"*; the first has no such qualifier and sits under *"details that shape which briefs
  fit."*
- **Industry reality / first principles:** the research files do not cover form architecture, so
  this is a first-principles finding: a privacy promise attached to a field must hold everywhere
  that field appears. Here the same stored value is presented once as a private compliance record
  and once as a casting preference, and editing either silently changes both.
- **Why it fails:** A talent who reads "this stays private" in one section has no reason to think
  the same answer is also filed under a section about matching briefs. Beyond the privacy
  contradiction it is simply confusing — two controls, one value, two labels, no indication they
  are the same thing.
- **Fix:** Render each field exactly once. Keep immigration/eligibility, passport and licence in
  "Private & Compliance" under the privacy statement; keep union, playing age and travel in the
  casting-facing section. Settle on one label for `work_eligibility`.

### L2-18 [P1] [CLAIM] "Hidden until you're booked, then shared only with the team coordinating the job" describes a release path with no caller
- **Where:** `client/src/domains/talent/pages/ProfilePage/index.jsx:1545-1547`; the audience it
  refers to is `CONFIRMED_JOB_FIELDS` / `AUDIENCE.CONFIRMED_JOB` in
  `src/shared/lib/audience-dto.js:342-354` and `src/shared/lib/profile-visibility.js:254` — grep
  across `src/domains` and `src/routes` returns **no caller** that ever selects that audience.
- **String/state:** Section "On-set Safety" — *"Emergency contact & on-set safety details. Hidden
  until you're booked, then shared only with the team coordinating the job."*
- **Industry reality:** R2 §1.6 / R4 §2.1: "booked" is the terminal state of a booking ladder
  (request → option → confirmed → booked) that lives on the agency's chart. Pholio, per its own
  declared scope, is not the booking desk; the only `confirmed` state in the application model is
  an **event slot** and `src/shared/constants/application-status.js:52-63` says explicitly that
  *"a one-week event booking is none of those"*. R5 §7.8 is where chaperone/safety facts belong —
  attached to a job, not a portfolio.
- **Why it fails:** The talent is asked for an emergency contact and a relationship on the promise
  of a downstream release event that does not exist in the product. Collecting next-of-kin data
  against a workflow you do not run is the wrong side of data minimisation.
- **Fix:** Either wire the audience (a job/booking object with a coordinating party) or stop
  collecting the fields until there is one. If they stay as a talent's own record, say so:
  "Kept for your own reference. Pholio does not share this with anyone."

### L2-19 [P1] [CLAIM] "vetted agencies" is asserted three times without ever saying what vetting is
- **Where:** `client/src/domains/talent/pages/SettingsPage/index.jsx:753`;
  `src/domains/talent/routes/settings.js:83` (embedding disclosure);
  `src/domains/talent/routes/agencies.js:39`. The mechanism is a manually approved access request
  (`src/domains/agency/routes/setup.js:139` "The approved access request the agency was vetted on",
  table `agency_access_requests`, migration `20260710120000`).
- **String/state:** *"Let vetted agencies surface you in Pholio Discover search."* / *"…so vetted
  agency searches can find you by the look they describe."*
- **Industry reality:** R5 §6 MUST say: *"Where agencies are listed: **how** they are verified, and
  that verification is ongoing."* R5 §5.4 lists what a working model actually checks — NY DOL
  registration number and its public registry entry, a posted Certificate of Registration, BFMA
  membership, email-domain discipline. R2 §5.2: the number-one 2026 trust question is *"is this
  agency contact actually that agency?"*, and Premier/IMG/Storm all lead with impersonation.
  R5 §5.2 calibrates against getscouted.co, which at least says *"We check their business
  credentials, reputation, and track record… We continuously monitor agencies."*
- **Why it fails:** "Vetted" is doing the entire trust load of the discovery opt-in and carries no
  content. A talent turning on Agency discovery is being asked to accept an unstated standard.
- **Fix:** State the check in the toggle's description and link a page that names it — what is
  verified (legal entity, domain, named contact, NY DOL registration number where applicable),
  who verifies it, and that it is re-checked. Where a NY-registered model management company is on
  the platform, surface its registration number so the talent can check the public registry (R5
  §5.4 #1). Replace "vetted" with the verb you actually perform.

### L2-20 [P1] [CLAIM] The bell converts profile views into "interest", and leaks the internal name "Scout"
- **Where:** written by `src/shared/services/notifications.js:470-546`; classified into the
  `INTEREST` band by `client/src/shared/components/NotificationCenter/talentSignalModel.js:27-31,
  85-87`; rendered by `TalentSignalPanel.jsx:129-131` under the header **"Who's looking"**.
  Reachable via the bell in `client/src/shared/layouts/TalentLayout/index.jsx:166-208`.
- **String/state:**
  - `"${name} viewed your profile"` / body `"An agency opened your portfolio in Scout."`
  - on a repeat view: `"${name} showed repeat interest"` / `"This agency viewed your profile
    ${count} times recently."`
  - band label `"Who's looking"`
- **Industry reality:** R0 §21: a platform can report *"counts and events with the observer named
  ('Opened by Elite NY, 2 Sep')"* — and nothing beyond. *"Any UI that says 'agency is interested'…
  is asserting beyond data."* R2 §1.7: client-side interest in agency software is an explicit human
  response (*"Interested / Maybe / Not interested"* on a package), never inferred from a view.
- **Why it fails:** The first-view copy is exactly right — named observer, plain verb. The
  repeat-view rewrite then editorialises it into intent ("showed repeat interest"), which a
  duplicate tab or a scroll-back through results produces just as easily as interest. Separately,
  "in Scout" names an agency-side surface the talent has never seen; Settings calls the same thing
  "Pholio Discover search" and the server calls it Discover — three names for one surface, all
  shown to talent.
- **Fix:** Keep the count, drop the inference: `"${name} viewed your profile ${count} times"`.
  Rename the band from "Who's looking" to "Views". Remove "in Scout" from talent-facing copy and
  settle on one public name for the agency search surface.

### L2-21 [P1] [DATA] Heritage/ethnicity is collected as an agency search filter with no consent framing
- **Where:** `client/src/domains/talent/pages/ProfilePage/IdentitySection.jsx:10-21, 65-89`;
  consumed by `src/domains/agency/services/discover/constraint-eval.js:292, 467` and
  `field-whitelist.js:111`. Also `Skin Tone` at `MeasurementsSection.jsx:340-360`.
- **String/state:** Section "Heritage & Background", multi-select of ten ethnicity values,
  hint: *"Optional. Agencies searching for talent can filter by this."* Skin Tone options
  `Fair · Light · Medium · Olive · Dark · Deep · Other`, coached in the readiness checklist as
  *"Skin Tone & Markings — Visible tattoos, piercings, and skin tone prevent set-day surprises."*
- **Industry reality:** R5 §4: ethnicity is Art. 9 special-category data; *"The moment you run
  facial processing for identification, or derive/store attributes like ethnicity… you are in Art.
  9 and need an Art. 9 condition (in practice, explicit consent) on top of an Art. 6 basis."*
  Elite's compliant pattern (R5 §4) marks non-essential processing explicitly non-compulsory and
  states the sole purpose. Storm's is *"used only to assess suitability for representation."*
  Pholio's own embedding disclosure gets this right — it promises the photo descriptions describe
  *"never your face, age, heritage, or body"* — which makes the unguarded structured field
  inconsistent with the product's own stated posture.
- **Why it fails:** The word "Optional" is not an Art. 9 explicit consent, and the only stated
  purpose is "agencies can filter by this" — a purpose the talent cannot evaluate. The skin-tone
  rationale ("prevent set-day surprises") is not a real reason: skin tone is not a surprise.
- **Fix:** Move heritage behind an explicit, separately-recorded consent with a stated purpose and
  retention (reuse the `LikenessMovement` consent-ledger pattern already built in this repo), or
  drop it from search entirely and keep it as self-description. Remove Skin Tone as a structured
  searchable field, or fold it into the same consent.

### L2-22 [P1] [CLAIM/CONSISTENCY] Digitals and stats recency is stated as an agency expectation, with three different numbers
- **Where:** `client/src/shared/utils/profileScoring.js:231` (*"Agencies expect digitals refreshed
  within 90 days."*), `:329` (*"Agencies expect stats and digitals updated every 8–12 weeks."*);
  `client/src/domains/talent/components/profileReadinessItems.js:143-146` (*"Agencies expect
  digitals refreshed every 8-12 weeks."*); `client/src/shared/constants/packageIntelligence.js:1-2`
  (90 days); `client/src/domains/talent/components/StatsCurrencyPrompt.jsx:9` (90 days).
- **Industry reality:** R3 §4.9: *"No agency page in the primary sample states a numeric re-measure
  interval. The 3-month figure is a coaching convention. **Label it as such in any product copy.**"*
  R3 §8 repeats it: *"Treat 3 months as a soft, labelled convention. Do not present it as an
  industry rule."*
- **Why it fails:** Three numbers (56 days, 84 days, 90 days) are each attributed to "agencies", who
  publish none of them. The Overview additionally caps the displayed percentage at 98 when digitals
  are stale (`OverviewPage/index.jsx:242-243`) — an invented ceiling that makes the score look like
  a measurement of something.
- **Fix:** One constant, and one attribution: *"A common industry rule of thumb is to reshoot
  digitals every three months."* `StatsCurrencyPrompt` already models the right tone
  ("Stats last updated March — still accurate?") — copy its register everywhere. Drop the 98 cap
  or explain it.

### L2-23 [P1] [CONSISTENCY] The Profile's own section index is out of sync with the page
- **Where:** `client/src/domains/talent/components/profileNavItems.js:5-15` vs the sections
  actually rendered in `ProfilePage/index.jsx`.
- **String/state:** the index lists nine sections; the page renders **Availability** (id
  `availability`, `:1056`), **Casting Preferences** (id `roles`, `:1215`), **Heritage & Background**
  (id `heritage`) and **Private context** (id `verified-adult`, `:1538`) which the index does not
  list. Conversely the index calls `appearance` **"Stats & Measurements"** while the section
  renders the heading **"Physical Attributes"** (`MeasurementsSection.jsx:82`) — and the *locked*
  variant of the same section renders **"Stats & Measurements"** (`:62`). The readiness deep-link
  for Availability points at `?tab=roles`
  (`profileReadinessItems.js:170`, `profileScoring.js:57`), a section the index does not name.
- **Why it fails:** The talent navigates by the index; four sections are unreachable through it,
  and the one they can reach is called something different when they arrive. Three names for one
  section ("Stats & Measurements" / "Physical Attributes" / "III — Measurements") is the kind of
  thing that makes a product feel assembled rather than designed.
- **Fix:** Generate the index from the rendered section list, and settle on one name per section.
  "Stats" is the industry word (R2 §4.1, R3 §4.4) — use it.

### L2-24 [P1] [CLAIM] "Physical proof" and "Your receipts" — measurements are a claim, not proof
- **Where:** `client/src/domains/talent/pages/ProfilePage/index.jsx:1037-1043, 1062-1068`.
- **String/state:** movement headings *"III — Measurements / Physical **proof** / The numbers
  casting filters on — accurate, current stats save time and prevent mismatch on set."* and
  *"IV — Proof / Credits & craft / **Your receipts** — credits, training, and skills that
  communicate readiness at a glance."*
- **Industry reality:** R3 §4.9 and §7.16: *"Every source frames stats as a claim that will be
  physically verified at the meeting."* R2 §3.1 [2]: at the meeting, *"Height and look verified in
  person."* BFMA (R3 §4.9) has agencies measure in person. Nothing on the profile is proof of
  anything, and "receipts" is internet slang, not trade language.
- **Why it fails:** Calling a self-entered number "physical proof" is the exact inversion of how the
  industry treats stats, and it teaches the talent that entering a figure settles it. It also sets
  up a nasty surprise: the number *will* be checked with a tape.
- **Fix:** "III — Stats / The numbers a booker reads first. They'll be checked with a tape when you
  come in, so keep them true." And "IV — Experience" for the credits movement.

### L2-25 [P1] [CONSISTENCY] The talent's public book has five names across this lane
- **Where and strings:**
  - `The Book` — nav (`client/src/shared/constants/talentNav.js:13`)
  - `Your Website.` — Overview panel heading (`OverviewPage/index.jsx:629`)
  - `Public Profile` — account menu link (`TalentLayout/index.jsx:257`)
  - `Public portfolio` — Settings toggle (`SettingsPage/index.jsx:750`), and "your public book" in
    the same movement's lede (`:739`)
  - `Portfolio` / `portfolio images` — Overview aria-labels (`OverviewPage/index.jsx:340-411`)
- **Industry reality:** R2 §4.3: *"'book' and 'portfolio' are the talent/agency words; 'gallery' is
  the software word; 'images' is nobody's word."* R3 §2 and Mediaslide's own FAQ: *"books — the term
  used for portfolios."* "Website" is neither.
- **Why it fails:** Five names for one object across four screens the talent uses daily. "The Book"
  is the right one and is already the nav label; "Your Website" undoes it on the very next screen.
- **Fix:** "The Book" everywhere in talent-facing chrome; "public link"/"public book" for the shared
  URL. Retire "Website", "Public Profile" and "images".

### L2-26 [P1] [TERM] "Intel" and "Market" as top-level nav
- **Where:** `client/src/shared/constants/talentNav.js:14, 22`; rendered by
  `TalentLayout/index.jsx:88-124` and `MobileTabBar.jsx`.
- **String/state:** nav labels `Overview · The Book · Profile · Intel · Market`.
- **Industry reality:** R0 §F flags SaaS register ("dashboard, workflow, lead, deal, funnel") and
  invented nouns as the two ways a talent product gives itself away. "Intel" is intelligence-agency
  /growth-marketing register with no trade equivalent; a model says "who's looked at my book". The
  section holding submissions and agencies is called "Market", which in the trade means a *city*
  ("she's placed in the Paris market", R2 §1.5) — so a nav item named Market that contains
  applications reads as a place-name to anyone in the industry.
- **Why it fails:** "The Book" (correct, native) sits directly beside two invented words, which
  makes the correct one look accidental.
- **Fix:** "Intel" → "Activity" or "Views". "Market" → "Submissions" (the trade word for the
  inbound object, R1 §2 / R2 §2) or "Agencies". Reserve "market" for cities.

### L2-27 [P1] [CLAIM] Notification settings promise two always-on signals and list one
- **Where:** `client/src/domains/talent/pages/SettingsPage/index.jsx:848-849` and
  `ALWAYS_ON_ROWS` at `:832-834`.
- **String/state:** lede *"Two signals you can turn down, and two you can't — a booker's message
  **and a meeting time** are the ones you can't afford to miss."*; the list under it contains a
  single always-on row, "Messages from agencies".
- **Industry reality / first principles:** a meeting request (`meeting_requested`, "Go-See
  Requested") is real and is routed through `applicationUpdates`
  (`src/shared/services/notifications.js:327-329`), which **is** switchable — so turning off
  "Submission updates" silences the go-see invitation the lede promises cannot be silenced.
  R4 §3.4 and R2 §3.1 [2]: the meeting is the single most consequential event in the whole intake
  ladder.
- **Why it fails:** The copy makes a guarantee the switch does not honour, about the one message a
  model genuinely cannot afford to miss.
- **Fix:** Either carve `meeting_requested` out of `applicationUpdates` into an always-on category
  and list it, or correct the lede to "one you can't".

---

### L2-28 [P2] [TERM] "Continue Audit" / "View full checklist" / "audit" for a profile checklist
- **Where:** `client/src/domains/talent/pages/OverviewPage/index.jsx:245-251, 478-480`
  ("Continue Audit"); `ProfileReadinessSidebar.jsx:275-286` ("View full checklist" — correct).
- **Industry reality:** first principles — "audit" is an accounting/compliance word implying an
  external examiner. R0 §F: SaaS/invented register.
- **Fix:** "Finish your profile" / "Continue". The sidebar already says "checklist"; use that.

### L2-29 [P2] [TERM] "Your defining identity artifact" for a comp card
- **Where:** `client/src/domains/talent/pages/OverviewPage/index.jsx:594-597`.
- **String:** *"Your defining identity artifact — professional specs composed from your book and
  current stats, export-ready for agency submission."*
- **Industry reality:** R3 §4.2/§5: the comp card is a **leave-behind** — a filing-size card of
  images and stats. R3 §5 is explicit that framing it as an ID or credential is the invented
  category: *"should never be called an 'ID' unless something is actually being verified."*
  "artifact" and "specs" are engineering words.
- **Fix:** *"The one-sheet you leave behind — your best frames, your current stats, ready to send
  or print."* (The name "Digital Comp Card" itself is correct and attested — R3 §5.3. Keep it.)

### L2-30 [P2] [TERM] "Your Reach." for a profile-view count
- **Where:** `client/src/domains/talent/pages/OverviewPage/index.jsx:496-499, 536-541`
  (panel heading over the single metric "Profile views (30d)").
- **Industry reality:** R0 §F lists social/creator framing — *"get seen", "exposure"* — among the
  words that mark a product as built for creators rather than models. "Reach" is the audience
  metric of that world. R2 §4.4: agencies publish an Instagram link, never a reach number.
- **Fix:** "Views" or "Who's looked at your book (30 days)".

### L2-31 [P2] [LEAK] Internal/system language in user-facing strings
- `"Synchronizing..."` on the profile save button — `ProfileReadinessSidebar.jsx:379`. Say "Saving…".
- `"The service is disabled in this environment, so saving permission will not send an image
  unless it is enabled later."` — `SettingsPage/index.jsx:1224, 1227`. "Environment" is deployment
  language; say "This isn't switched on yet."
- `"Legacy representation notes"` / *"Optional historical notes retained from your previous
  profile"* — `RepresentationSection.jsx:242-249`. "Legacy" and "your previous profile" describe a
  migration, not a thing the talent has. Say "Past agencies".
- `"Status updating"` / *"We're syncing this submission's status."* — `applicationStatus.js:215-222`.

### L2-32 [P2] [DATA] `UNION_OPTIONS` stores `UAD` for the Union des artistes (UDA)
- **Where:** `client/src/domains/talent/pages/ProfilePage/index.jsx:65` —
  `{ value: 'UAD', label: 'Union des artistes (UDA)' }`. The stored value is a transposition of the
  displayed acronym; anything filtering on the stored string will miss it.
- **Fix:** `value: 'UDA'`, with a migration for existing rows.

### L2-33 [P2] [TERM] Settings section names are invented where plain words exist
- **Where:** `client/src/domains/talent/pages/SettingsPage/index.jsx:66-76`.
- **String/state:** `Identity · Presence · **Signals** · **Membership** · Security · **Data** ·
  **Standing** · **Likeness** · Account`, each rendered as a "Movement". The URL for Membership is
  `/dashboard/talent/settings/**studio**`, and the header button elsewhere says "Upgrade"
  (`TalentLayout/index.jsx:132`) while the plan is "Studio+" and the section is "Membership".
- **Industry reality:** first principles — a settings rail is a wayfinding surface; "Standing"
  (terms, minor protection, reporting) and "Presence" (visibility) are not what those pages
  contain, and "Standing" collides with R4's use of the word for booking status. "Movement" is a
  musical metaphor carried into the DOM and the ARIA tree.
- **Fix:** Legal & safety · Visibility · Notifications · Plan & billing · Privacy & data · Likeness
  & AI. Align the URL segment and the button label with whatever the section is called.

### L2-34 [P2] [TERM] "Emerging / Professional / Established" and "Ungendered"
- **Where:** `ProfilePage/index.jsx:1086` (experience level);
  `client/src/shared/constants/statsTrack.js:18-22` (`Womenswear · Menswear · **Ungendered**`).
- **Industry reality:** R2 §1.2–1.3: the industry's own ladder is New Faces → Development → Main →
  Image, and it is *public and agency-assigned*. R2 §2: **"Non-binary"** is a real board at
  mainstream agencies in 2026 (Select, Chadwick) — "Ungendered" is a garment-industry adjective
  applied to a person. The scoring copy already reaches for the real ladder — *"New faces and
  working talent are pitched differently to clients"* (`profileScoring.js:311`) — while the options
  offer a different one.
- **Fix:** Keep a self-declared experience field but word it as experience, not tier: "Just
  starting / Some professional work / Working regularly". Rename the third stats track
  "Non-binary / both", or better, drop the person-word and label it by the stat set
  ("Womenswear stats / Menswear stats / Both").

### L2-35 [P2] [DATA] Height rounds away the half-inch
- **Where:** `client/src/shared/utils/measurementConversions.js:5-13` (`cmToFeetInches`, rounds to
  whole inches) and `MeasurementsSection.jsx:130-134` (imperial formatter `${ft}'${inRemainder}"`).
- **Industry reality:** R2 §4.1 finding 6: *"Height is the one measurement with fractional
  precision — `5'11'' 1/2` (Storm). Half-inches matter."* R3 §4.5: *"Half-inches render as ½'', not
  .5"*, and inch marks are typed as double apostrophes on both Wilhelmina and Models 1.
- **Fix:** Support and display half-inches (`5'11½"`), and use the double-apostrophe convention on
  any rendered card.

### L2-36 [P2] [TERM] Follower and engagement counts on the talent's own profile
- **Where:** `client/src/domains/talent/pages/ProfilePage/SocialSection.jsx:220-232`
  ("Followers", "Engagement" metric labels).
- **Industry reality:** R2 §4.4: *"Follower counts are **not** published as a stat field… Public =
  link; internal = number."* Premier mentions a following only in prose bio copy.
- **Fix:** Keep the connection and the link; drop the metric tiles from the talent-facing profile,
  or move them behind the Creator lane where they are the actual currency.

### L2-37 [P2] [CONSISTENCY] AI permissions are split across two Settings sections with two vocabularies
- **Where:** "Data" holds *Image analysis* and *Searchable by look*
  (`SettingsPage/index.jsx:1245-1270`); "Likeness" holds *Marketing use* and *AI likeness*
  (`LikenessMovement.jsx:458-560`).
- **Why it fails:** Four AI-related permissions, two screens, two consent models (a toggle vs a
  terms ledger), and one of the four ("AI likeness") is a strictly stronger grant than another
  ("Image analysis") sitting elsewhere. A talent asked "what has Pholio got permission to do with
  my images?" cannot answer from one screen.
- **Fix:** One "Likeness & AI" section holding all four, ordered by how much they give away, each
  with the same disclosure shape and the same ledger. The `LikenessMovement` pattern is the better
  of the two — extend it.

---

## Coined / internal terms encountered

| Term | Where | Verdict | Translation |
|---|---|---|---|
| **The Book** | `talentNav.js:13`, Overview panel | **keep** | correct and native (R2 §4.3, R3 §2) |
| **Digital comp card** | Overview, Media | **keep** | attested modern deliverable (R3 §5.3) |
| **Bookout** | `AvailabilitySection.jsx` | **keep** | correct booker vocabulary (R2 §1.6) |
| **Studio+** | plan name, `studioCopy.js` | **keep** | a plan name is allowed to be a brand |
| **Signals** | bell aria-label, Settings section, toasts | translate | "Notifications" / "Activity" |
| **Intel** | nav label | translate | "Activity" / "Views" |
| **Market** | nav label, ApplicationsPage | translate | "Submissions" — "market" means a city in-trade |
| **Booking lane / Primary Lane / Secondary Lanes** | `bookingLanes.js`, `BookingLanesControl` | translate | "board" (segment) + "work you're seeking" (job type) |
| **Division** (Pholio's 4-way) | `profileDivision.js` | translate | not the industry's division; use board segments |
| **Stats Track** | `statsTrack.js` | translate | "Which stat set" — or fold into board segment |
| **Movement** (settings/profile sections) | `SettingsPage/primitives.jsx`, `ProfilePage` | hide | it is a CSS/DOM metaphor in the ARIA tree |
| **Standing** (settings section) | `SettingsPage/index.jsx:72` | translate | "Legal & safety" |
| **Presence** (settings section) | `:68` | translate | "Visibility" |
| **Private context** | `VerifiedAdultSection` | translate | says nothing; name the actual object |
| **Audit / Continue Audit** | Overview CTA, `ProfileReadinessAudit` | translate | "Checklist" |
| **Package** (talent-facing: "Submission package complete", "Build your package") | `profileScoring.js`, sidebar | translate | in-trade a *package* is agency→client (R2 §1.7); for talent say "submission" |
| **Readiness / Agency grade / Strong package** | `profileScoring.js:380-415` | **hide** | asserts a verdict; see L2-04 |
| **Scout** (as a surface name to talent) | `notifications.js:479, 535` | hide | talent never sees a surface called Scout |
| **Pholio signal** (lane fit scores) | `BookingLanesControl.jsx:100-105` | **hide** | match-scoring (R2 §2.1); currently dead, keep it dead |
| **identity artifact** | Overview comp-card copy | translate | "leave-behind" / "one-sheet" |
| **Ungendered** | `statsTrack.js:21` | translate | "Non-binary" is the 2026 board word (R2 §2) |
| **Emerging / Established** | experience level | translate | grant-application register, not trade |

## Consistency variants

| Concept | Variants seen | Locations |
|---|---|---|
| The talent's public book | "The Book" · "Your Website." · "Public Profile" · "Public portfolio" / "your public book" · "portfolio images" | `talentNav.js:13`; `OverviewPage/index.jsx:629`; `TalentLayout/index.jsx:257`; `SettingsPage/index.jsx:739,750`; `OverviewPage/index.jsx:340-411` |
| The measurements section | "Stats & Measurements" · "Physical Attributes" · "III — Measurements" | `profileNavItems.js:8`; `MeasurementsSection.jsx:82`; `ProfilePage/index.jsx:1037` |
| Agency search surface (talent-facing) | "Scout" · "Pholio Discover search" · "Discover" | `notifications.js:479,535`; `SettingsPage/index.jsx:753`; `settings.js:83` |
| Availability | `Full-Time/Part-Time/Freelance/Weekends Only/By Appointment` · `Available/Limited/Unavailable` · Bookout date ranges | `ProfilePage/index.jsx:65-71`; `AvailabilitySection.jsx:27-31`; `AvailabilitySection.jsx:222-247` |
| Immigration status field | "Work Eligibility" · "Work Authorization" (same `work_eligibility` column) | `ProfilePage/index.jsx:1278`, `:1423` |
| Digitals/stats recency | "within 90 days" · "every 8–12 weeks" · 90-day constant · 90-day prompt | `profileScoring.js:231,329`; `profileReadinessItems.js:145`; `packageIntelligence.js:1`; `StatsCurrencyPrompt.jsx:9` |
| Plan surface | section "Membership" · URL `/settings/studio` · button "Upgrade" · pill "Studio+" / "Free" | `SettingsPage/index.jsx:69,953`; `TalentLayout/index.jsx:51,132` |
| Notification categories | bands "Waiting on you / What changed / Who's looking" (talent) vs tabs "All / Applications / Messages / Profile" (`notificationHelpers.js`, agency-only) and category map `agency_profile_view → "Agency interest"` | `talentSignalModel.js:27-31`; `notificationHelpers.js:11-16, 33-35` |
| Representation | tri-state radio (`seeking/represented/not_seeking`, labelled "Direct Bookings") · `talent_representations` rows · legacy `current_agency` free text · "Legacy representation notes" textarea | `RepresentationSection.jsx:21-40, 129-240, 242-249`; `ProfilePage/index.jsx:793` |

## Working well (preserve)

1. **`STUDIO_LEDE`** — *"Premium comp-card themes and 90-day portfolio analytics. **Nothing an
   agency sees or receives changes with it.**"* (`SettingsPage/studioCopy.js:23-24`). This is the
   single most important sentence in the product and it is exactly right against R0 §A4, R5 §5.2
   and R5 §6.
2. **The flat, tier-blind submission quota** with the §1701 reasoning written into the source
   (`src/domains/talent/services/application-quota.js:1-10`), plus the on-page fine print that
   agency-invited submissions never count. Do not let any future plan lift this ceiling.
3. **The checkout disclosure** — *"Studio+ is a software subscription. Pholio is not a talent agency
   and does not guarantee representation, bookings, or income."* + the ROSCA/CA-ARL trial line and
   the affirmative tick (`SubscriptionCheckoutDisclosure.jsx:38-68`). R5 §6 MUST-say, satisfied.
4. **`LikenessMovement`** — per-purpose grants, server-rendered disclosure text with a version and
   hash, scope/purpose/compensation/duration captured for the AI replica, withdrawal always one
   click away, append-only ledger, and the refusal to grant against text it cannot display
   (`LikenessMovement.jsx:12-25, 458-461`). This is the NY FWA §1034/§1035 shape done properly.
5. **`StatsCurrencyPrompt`** (`components/StatsCurrencyPrompt.jsx`) — 90-day nudge, *"Stats last
   updated March — still accurate?"*, and the comment that only an agency's in-person measurement
   earns the word "confirmed". Exactly R3 §4.9.
6. **`OpenCallsCard`** — hand-verified walk-in hours, free to every talent, renders nothing when
   there is nothing (`OverviewPage/OpenCallsCard.jsx:1-11`). The "no paywall on public information"
   reasoning is the right instinct.
7. **The `closed_no_response` state** and its constants comment — silence recorded as silence, not
   as a decision, and unwritable by an agency (`src/shared/constants/application-status.js:12-19`;
   `applicationStatus.js:161-173`). R0 §24 satisfied.
8. **`kept_on_file` grouped as advancing, never closed** (`applicationStatus.js:175-186`) — a
   correct reading of R1 §B8.
9. **The representation *rows*** — mother vs placement, market, territory, division, exclusivity,
   start date (`RepresentationSection.jsx:12-15, 155-235`). This is R2 §1.5 modelled properly and
   is better than most agency software exposes to talent.
10. **Account deletion copy** — the enumerated list and *"Anything an agency already downloaded
    lives outside Pholio and can't be recalled."* (`SettingsPage/index.jsx:1432-1445`).
11. **Minors excluded from generic Discover** with the reasoning stated
    (`src/shared/lib/profile-visibility.js:126-142`), and AI processing restricted to adults with a
    valid DOB (`SettingsPage/index.jsx:1246`). R5 §7.14, satisfied.
12. **The embedding disclosure's Art. 9 carve-out** — *"never your face, age, heritage, or body"* —
    plus deletion on withdrawal (`settings.js:83`). The image-analysis disclosure should be
    rewritten to match it (L2-06).
13. **The "Contact details / Never published" row** (`SettingsPage/index.jsx:764-771`) and the
    removal of the fake `showContact` toggle. Correct against R3 §4.3 and §7.3.
14. **`bookouts`** as a real date-range object with notes.
15. **Event statuses kept distinct from representation** — `confirmed` is a slot, not a signing
    (`src/shared/constants/application-status.js:52-63`). R4 §2.1 respected.

## Dead or unreachable code carrying issues

1. **`client/src/domains/talent/components/RightSidebar/`** — `RightSidebar.jsx`,
   `SidebarProfile.jsx`, `SidebarActions.jsx` are imported by nothing (grep across `client/src`
   returns only a comment reference in `studioCopy.js:20`). `SidebarProfile.jsx:66-69` renders
   **`🌟 Trending with agencies`** against a **hardcoded 75%** progress ring
   (`SidebarProfile.jsx:15`, `const targetProgress = 75`) — a fabricated agency-interest claim (R0 §21) and a fake metric.
   `RightSidebar.jsx:60-72` also ships a "Download Comp Card" button whose only action is a toast
   saying the feature does not exist. **Delete the folder**; the `studioCopy.js` comment that cites
   it as one of three canonical statements of the Studio+ promise should be corrected.
2. **`client/src/domains/talent/pages/ProfilePage/bookingLaneSignals.js`** + the "Pholio signal"
   block at `BookingLanesControl.jsx:100-105` — renders `${lane.label} ${score}` per lane, i.e. a
   match score (R2 §2.1, R5 §6). It is inert only because the `fit_score_*` columns were dropped by
   migration `20260824090000` and are blocklisted at `src/domains/talent/routes/profile.js:92-104`,
   so `getLaneFitSignals()` always returns `[]`. Remove the component code so it cannot be revived.
3. **`client/src/domains/talent/components/ProfileReadinessAudit.jsx`** (+ `.module.css`) — not
   imported anywhere. Carries the "audit" framing flagged in L2-28.
4. **`ProfileGateBanner` with `variant="page"` from `DashboardLayoutShell.jsx:127-134`** is
   unreachable: `RESTRICTED_TALENT_ROUTES = []`
   (`client/src/shared/utils/profileGating.js:75`), so `isRouteGated` is never true. The banner is
   still live from Market/Apply/CompCardGate, so only the shell path is dead — but
   `PROFILE_GATE_FEATURES['/dashboard/talent/applications']` (`:81-87`, *"Market locked"*)
   describes a lock that no longer exists on that route.
5. **`AUDIENCE.CONFIRMED_JOB` / `CONFIRMED_JOB_FIELDS`** (`src/shared/lib/audience-dto.js:342-354`,
   `profile-visibility.js:254`) — no caller. This is what the "On-set Safety" promise in L2-18
   points at.
6. **`notificationHelpers.js:19-24, 33-35`** (`getNotificationCategory`, incl.
   `agency_profile_view: 'Agency interest'`) is reachable only through `NotificationInbox`, which
   is imported solely by the **agency** bell
   (`domains/agency/components/nav/NotificationsDropdown.jsx:8`). The talent bell uses
   `talentSignalModel` instead. Flagged for the agency lane: "Agency interest" as a category for a
   profile view is the same inference as L2-20.

## Coverage

**Read in full:** `client/src/shared/constants/talentNav.js`,
`client/src/shared/layouts/TalentLayout/index.jsx`, `client/src/shared/layouts/DashboardLayoutShell.jsx`,
`client/src/shared/components/NotificationCenter/{NotificationCenter,NotificationInbox,TalentSignalPanel}.jsx`,
`{talentSignalModel,notificationHelpers,useNotificationUnreadCount,talentNotifications}.js`,
`client/src/domains/talent/components/RightSidebar/*`,
`client/src/domains/talent/pages/OverviewPage/{index.jsx,OpenCallsCard.jsx}`,
`client/src/domains/talent/components/StatsCurrencyPrompt.jsx`,
`client/src/domains/talent/components/profileReadinessItems.js`,
`client/src/domains/talent/components/ProfileReadinessSidebar.jsx`,
`client/src/domains/talent/components/profileNavItems.js`,
`client/src/domains/talent/components/RepresentationSection.jsx`,
`client/src/domains/talent/pages/ProfilePage/{index.jsx,IdentitySection,DisciplineSection,MeasurementsSection,AvailabilitySection,BookingLanesControl,bookingLaneSignals,VerifiedAdultSection}`,
`client/src/domains/talent/pages/SettingsPage/{index.jsx,studioCopy.js,LikenessMovement.jsx,primitives.jsx}`,
`client/src/shared/components/SubscriptionCheckoutDisclosure.jsx`,
`client/src/shared/utils/{profileScoring,profileGating,talentAge,measurementConversions,formNormalization}.js`,
`client/src/shared/constants/{statsTrack,profileDivision,bookingLanes,packageIntelligence}.js`,
`client/src/domains/talent/utils/applicationStatus.js`, `client/src/schemas/profileSchema.ts`.

**Read in part (for CLAIM tracing only):** `src/shared/services/notifications.js` (title/body copy
and the profile-view writers), `src/shared/constants/application-status.js`,
`src/shared/lib/profile-visibility.js`, `src/shared/lib/audience-dto.js`,
`src/shared/lib/validation.js` (DOB/weight schemas), `src/domains/talent/routes/settings.js`
(consent disclosures, defaults), `src/domains/talent/routes/profile.js` (API allowlist/blocklist),
`src/domains/talent/services/application-quota.js`, `src/domains/agency/routes/setup.js` (vetting),
`src/domains/agency/services/discover/*` (ethnicity filter), `src/domains/ai/discover-index.js`.

**Skipped, with reason:** Media / The Book, Applications / Market / Apply, Intel, Messages, the
onboarding flow, all agency surfaces, PDF templates and EJS views, and the moderation queue —
other lanes own them. `SocialSection.jsx` read only for its labels and metric tiles (the OAuth /
Phyllo connector flow belongs to whichever lane owns socials). `.claude/skills/**`, `docs/audits/**`,
`tasks/**` and all `DESIGN.md` / `CLAUDE.md` files were not consulted as vocabulary authorities, per
the brief; `PRODUCT.md` was not present in the repo, so the declared scope boundary was taken from
the research files and from the code's own scope statements (e.g. the §1701 comment in
`application-quota.js`).
