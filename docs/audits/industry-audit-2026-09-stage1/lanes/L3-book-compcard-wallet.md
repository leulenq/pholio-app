# Lane 3: The talent's materials — Media / The Book, digitals, frame taxonomy, AI reads, comp card + PDF, public portfolio, Apple Wallet pass · audience: talent (artefacts are read by agencies)

## Verdict

This lane contains Pholio's most industry-literate code and its most industry-damaging code, sitting
a few files apart. The stats formatter (`src/domains/pdf/composition/stats-formatter.js`), the
digitals freshness engine (`src/domains/talent/services/digitals-freshness.js`), the photo-description
prompt (`src/domains/ai/describe-photo.js`) and the comp-card OCR module (`src/domains/ai/comp-card-vision.js`)
are written by someone who understood R3 §1's four-object model and R3 §4.4's canonical stat order,
and they should be preserved essentially untouched. But the artefacts those modules feed are broken
at the object level: **the comp card is composed from the talent's entire image library with no
`image_type` filter, so digitals land on the card** (R3 §7.1, the single loudest error); **a represented
talent's own mobile number prints on the card next to the agency's name** (R3 §4.3/§7.2, the highest-signal
convention in the whole research corpus, and the code comment two files away asserts the opposite is
true); **a minor's card labels the child's own phone "Guardian Contact"**; **the digitals PDF prints the
words "Unretouched · for agency review" as an unverifiable certification**; **the fallback comp card
prints an AI "casting verdict" in quotation marks on the back**; and the **Apple Wallet artefact is
named "Pholio ID" and shaped as a credential** while every fact on it is self-declared — R3 §5's exact
"should never be called an 'ID' unless something is actually being verified".

The headline gap is that the *engines* know the industry and the *artefacts* do not enforce what the
engines know. Three separate stats implementations disagree (only one has a kids track), three
different photo-recency "industry rules" are asserted (90 days, 180 days, 6 months — none of them
attested per R3 §4.9), and the minor-safety rule is implemented as a consent gate where R3 §4.7 and
BFMA require a *structural omission*. A working booker handed a Pholio comp card would notice the
digital on the front before anything else, and a mother agent would notice their model's personal
number printed under their agency's name and treat that as disqualifying.

---

## Findings

### L3-01 [P0] [CONCEPT] The comp card is composed from every image the talent owns — digitals included

- **Where:** `src/domains/pdf/generator.js:119-134` (`loadProfile` image query — no `image_type`
  predicate); `src/domains/pdf/comp-card-selector.js:90-115` (`deriveCompCardRole` reads only
  `shot_type` / `style_type`); `src/domains/pdf/composition/photo-intelligence.js:27-32,331`
  (`derived role 'headshot' +30` — the top hero score). Reachable via `/dashboard/talent/media` →
  `CompCard.jsx` preview iframe (`/pdf/view/:slug`) and the Download PDF button (`/pdf/compcard/:slug`).
- **String/state:** UI promises the opposite. `CompCard.jsx:721` — *"Designed for you from your
  portfolio — two-sided 5.5 × 8.5, always current."*; `CompCardGate.jsx:54` — *"Pholio composes a
  two-sided 5.5 × 8.5 card **from your book**"*; `MediaWorkspace.jsx:1155` — *"Curate the frames
  agencies see — then compose your comp card from them."* No code path honours "from your book".
- **Industry reality:** R3 §1 — digitals and the book are "four distinct objects with four different
  jobs, and practitioners keep them rigorously separate"; digitals "are explicitly **not** portfolio
  images and never appear in the book". R3 §3 Stage 4 — "the comp card is made by the agency itself,
  and the agency selects the best photos" *from the book*. R3 §7.1 ranks "digitals mixed into the book,
  or one undifferentiated 'photos' bucket" as the #1 thing a booker reacts to.
- **Why it fails:** For a new face — Pholio's core user — the library is *mostly* digitals, because
  digitals are what every agency application asks for (R3 §4.8). `deriveCompCardRole` scores a
  digital headshot +30, the highest hero score available. So the modal Pholio comp card is a plain-wall,
  no-makeup, unretouched digital blown up as the hero, with three more digitals on the back. That is
  not a comp card; it is a contact sheet with a stats block. A booker reads it as "this person does not
  have a book yet and does not know the difference".
- **Fix:** Filter the composition pool to `image_type IN ('portfolio','tearsheet','campaign','test')`
  in `loadProfile` (or pass an eligibility predicate to `selectCompCardImages`). When the pool is
  empty, do not fall back to digitals — block the card with a truthful reason ("A comp card is cut from
  your book. Add book frames, or send your digitals sheet instead — that is what an agency wants from a
  new face anyway"). Add `image_type` to `deriveCompCardRole` as a hard gate, not a score.

### L3-02 [P0] [DATA] A represented talent's personal phone number prints on their comp card, under the agency's name

- **Where:** `src/domains/pdf/composition/composition-director.js:123-135` (`buildContactLine` pushes
  `profile.phone` unconditionally) and `:155-166` — the `represented` branch returns
  `line: buildContactLine(profile)`. Rendered at `src/domains/pdf/templates/compcard-composed.ejs:602`
  (back booking block) and `:515-518` (front, when `front.showContactBlock`). `showContactBlock` is set
  at `composition-director.js:957` from tone alone (`tone.warmth >= 0.45 && tone.formality < 0.72`) —
  it never consults representation. Reachable via the Media page comp-card preview and PDF download.
- **String/state:** the card renders `REPRESENTATION / Icon Management / New York · @ana · +1 212 555 0101`.
  The function's own docstring (`composition-director.js:143-145`) shows the represented example
  *without* a phone — the documented intent and the code disagree.
- **Industry reality:** R3 §4.3 is the highest-signal convention in the corpus: i-models.de **[P-agency]**
  states all enquiries route through the agency and "accordingly the **agency's** contact data is what
  is printed on the sedcard". R3 §7.2–§7.3 ranks this #2 and #3: "A represented model's card showing
  their personal mobile number is worse than wrong — it routes client contact around the agency and
  around the safeguarding chain."
- **Why it fails:** It inverts the business relationship the card exists to express. It also creates a
  concrete safety exposure: comp cards are handed out, photographed, left in drawers (R3 §4.1 —
  A5 is a *filing* size). An agent seeing this on a card carrying their agency name would tell the
  model to stop using Pholio. Separately, `src/domains/talent/routes/settings.js:109-110` asserts
  *"No public surface renders talent contact details at all — not the portfolio views, **not the PDF**"* —
  a stale comment that is now false, so the false belief is load-bearing elsewhere.
- **Fix:** Three states in `buildBookingBlock`, per R3 §4.3: (a) **represented** — agency name + the
  *agency's* phone/email (add `agencies.booking_email` / `booking_phone` to the representation
  lookup at `pdf.js:942-953`), with `buildContactLine` reduced to city only and `showContactBlock`
  forced false; (b) **freelance** — the talent's own contact, as now; (c) **minor** — see L3-03.
  Add a guardrail check that fails the export when `mode === 'represented'` and any personal channel
  is present.

### L3-03 [P0] [MINOR] "Guardian Contact" on a child's comp card prints the child's own phone and Instagram handle

- **Where:** `src/domains/pdf/composition/composition-director.js:168-181`. For a kids card
  (`options.kids`, set at `:896-897` from `statsBlock.category === "kids"`) the label becomes
  `"Guardian Contact"` but `primary` is still `[phone, handle, city].filter(Boolean)[0]` — i.e.
  `profile.phone` and `profile.instagram_handle`, both the minor's own. `profiles.guardian_email`
  exists (`migrations/20260624210000_add_minor_compliance_to_profiles.js`, read all over
  `src/domains/talent/services/guardian-consent.js`) and is never consulted here. There is no
  `guardian_phone` column at all. Reachable for any under-18 profile with guardian consent recorded.
- **String/state:** `GUARDIAN CONTACT / +1 ... / @childhandle · Brooklyn` printed on a distributable PDF.
- **Industry reality:** R3 §4.3, compcard.com **[P-print]**: "**Never a home address or a child's
  personal phone number**." R5 §7.3 (Elite, verbatim): "your parent/legal guardian contact information
  will be the only ones we will utilise"; BFMA: "direct contact with any model under 18 can only be
  done with parental consent."
- **Why it fails:** The label makes it worse than an unlabelled field — it tells the reader "this is
  the adult you should call" while giving them the child's line. Combined with the child's public
  Instagram handle on the same card, this is a direct route to unsupervised contact with a minor.
- **Fix:** Add `guardian_name` / `guardian_phone` / `guardian_email` to the profile and source the kids
  block from them only. If no guardian channel is recorded, print no contact block at all and block
  the export with "A card for a talent under 18 carries the guardian's contact, never their own." Never
  fall through to `profile.phone` / `instagram_handle` on a kids card.

### L3-04 [P0] [MINOR] Three of the four stats paths have no kids track — a minor's bust/waist/hips render on the public portfolio, the fallback comp card, and inside the downloaded PDF's data payload

- **Where:**
  - `src/shared/lib/stats-formatter.js:306-385` (`buildCanonicalStats`) — branches on `stats_track`
    (womenswear / menswear / ungendered) and **has no age branch at all**. Feeds the public portfolio
    (`src/routes/portfolio.js:517`) and the fallback comp card (`src/domains/pdf/routes/pdf.js:1365`).
  - `src/domains/pdf/routes/pdf.js:1994-2032` (`buildDigitalsSheetData`) — hand-rolled stats, pushes
    `Bust`, `Waist`, `Hips` with no age check. Feeds `/pdf/digitals/:slug`, reachable from the
    "Download sheet" button (`MediaWorkspace.jsx:337`).
  - `src/domains/pdf/machine-readable.js:107-122` — suppresses measurements on `minor`, but the caller
    passes `minor: Boolean(profile?.is_minor)` (`src/domains/pdf/routes/pdf.js:2328`) and **`profiles`
    has no `is_minor` column** (grep of `migrations/`: `is_minor` exists only on `talent_records`).
    So `minor` is always `false` and the embedded `comp-card.json` inside every downloaded card carries
    `bustCm`/`waistCm`/`hipsCm` — including for a 15-year-old whose printed card correctly omits them.
  - Only `src/domains/pdf/composition/stats-formatter.js:508-540` (the *composed* comp card) has the
    correct kids track (`Age, Height, Clothing Size, Shoes, Hair, Eyes`) with structural omission.
- **String/state:** public portfolio (`views/portfolio/show.ejs:44-49`, `:236-241`) renders
  `publicStats.fields` verbatim — `Bust 86 cm / 34"`, `Waist`, `Hips`, plus a `Weight` row (`:50-55`)
  and `Age: Under 18` (`:63-68`, from `publicAgeBand`, `src/routes/portfolio.js:305-309`).
- **Industry reality:** R3 §4.7 / R5 §4, BFMA **[P-body]**: "We believe it is inappropriate to measure
  any young person under the age 18 except for their height." R3 §4.7 product implication, verbatim:
  "a stats model must be able to **structurally omit** B/W/H for under-18s, not merely leave the fields
  blank". Docherty's kids board **[P-agency]** displays **height only**. R3 §7.4 ranks this #4.
- **Why it fails:** `machine-readable.js`'s own docstring says a payload "more revealing than the
  artifact it rides on would be a leak wearing a standard's clothes" — that is precisely what ships.
  And the public portfolio is worse than an agency board: it publishes a minor's B/W/H *and* labels the
  page "Under 18", on the open web.
- **Fix:** (1) Give `buildCanonicalStats` the same kids track as the composed formatter and route all
  four consumers through one function — there should be exactly one stats formatter. (2) Replace
  `profile.is_minor` at `pdf.js:2328` with `isMinorProfile(profile)` from `src/shared/lib/talent-age.js`.
  (3) Add the kids branch to `buildDigitalsSheetData`. (4) Drop the `Under 18` age band from the
  public page entirely — a public page that flags its subject as a child is a safety liability, and no
  sampled kids board publishes it.

### L3-05 [P0] [CLAIM] Every digitals PDF prints "Unretouched · for agency review" as a certification nobody verified

- **Where:** `src/domains/pdf/templates/digitals-sheet.ejs:163`. Reachable via
  `MediaWorkspace.jsx:337` "Download sheet" → `/pdf/digitals/:slug?download=1`.
- **String:** `Unretouched · for agency review` — printed in the footer of the sheet a talent sends
  to an agency.
- **Industry reality:** R3 §6: "I found **no 'unretouched' certification claim** used as a portfolio
  label anywhere. Treat 'unretouched badge' as an invented affordance until evidenced." R5 §6 MUST NOT
  say: *"'Unretouched, verified' as a product claim."* The whole industry ban on filters/retouching in
  digitals (5 agencies, R3 §4.8) is an *instruction to the model*, never a claim the intermediary makes.
- **Why it fails:** The only thing behind the word is `image_type === 'digital'` — a tag the vision
  classifier sets automatically (`src/domains/ai/classify-portfolio-image.js`) or the talent sets by
  hand in one click from the bulk-move modal (`MediaWorkspace.jsx:490-496`, "Move frames"). A talent
  can tag a FaceTuned selfie as a digital and Pholio will print "Unretouched" under it. When (not if)
  an agency catches one, the claim is Pholio's, not the talent's — this is the exact trust-fatal
  category R5 §5.1 documents.
- **Fix:** Delete the word. The footer should say what is true and useful: `Digitals · shot <month>`
  or, where the freshness engine reports it, `Digitals · shot Jul 2026 · measured Aug 2026`. If a
  no-retouch statement is wanted, make it the talent's attestation on export ("I confirm these are
  unretouched"), recorded and dated — never an unattributed line of print.

### L3-06 [P0] [CLAIM] The fallback comp card prints an AI "casting verdict" in quotation marks, and an "archetype" badge on the front

- **Where:** `src/domains/pdf/templates/compcard-standard.ejs:40-41,388-389,412-413,461-463`.
  Data from `loadArchetype` (`src/domains/pdf/routes/pdf.js:543-563`) reading
  `onboarding_signals.archetype_label` / `casting_verdict` — described in
  `migrations/20260218000001_add_ai_results_to_onboarding_signals.js:8` as a "1-sentence casting verdict
  from Director" (an AI persona). Reachable as the live resilience path: `renderStandardView` renders
  this template whenever the composed engine throws (`pdf.js:1254-1259`) and on `?engine=standard`; the
  demo card hard-codes `verdict: "Strong editorial presence with versatile commercial appeal."`
  (`pdf.js:545-548`).
- **String/state:** `<div class="front__badge">Editorial</div>` on the front; on the back,
  `<p class="back__verdict">"Strong editorial presence with versatile commercial appeal."</p>` —
  in quotation marks, unattributed.
- **Industry reality:** R3 §4.2 — the front is one image plus the name; the back is images, the stats
  block and the contact block. Nothing else is on a comp card. R0 §E21 — a platform "cannot know intent,
  interest, suitability". R5 §5.6 #9 — AI output must be "framed as an internal aid, never as a verdict
  about the person"; R5 §6 MUST NOT — "Predicting outcomes … in talent-facing copy".
- **Why it fails:** A quoted sentence on a comp card reads as a testimonial from someone with standing —
  an agent, a client, a photographer. It is a language model's sentence, generated during onboarding
  from a phone photo. A booker who realises where it came from stops reading the card. (No live writer
  for `casting_verdict` remains in `src/`, so most rows will be null — but the read path, the demo/marketing
  card, and every legacy row are live.)
- **Fix:** Delete `back__verdict` and `front__badge` from `compcard-standard.ejs`. If a division/board
  label is wanted on the card, it must be the *agency's* board assignment, not a generated archetype.
  Retire the `casting_verdict` read path entirely.

### L3-07 [P0] [CONCEPT] "Pholio ID" is an invented credential: a Wallet pass whose every fact is self-declared, including representation

- **Where:** `src/domains/wallet/services/pass-content.js` throughout — module title *"Pholio ID"*,
  `:13` *"the talent's identity credential in Wallet"*, `:215-224` error strings ("Add your name before
  creating a **Pholio ID**"), `:281` `description: "Pholio ID for <name>"`, `organizationName: "Pholio"`.
  Filename `pholio-id-<slug>.pkpass` (`src/domains/wallet/routes/talent-wallet.js:66`). Reachable via
  the "Add to Apple Wallet" badge on the Media page (`CompCard.jsx:829-832`).
- **String/state:** face fields `HEIGHT`, name, `REPRESENTATION: <agency>` / `REPRESENTATION: Seeking
  representation` / `BOOKINGS: Direct`; back fields `PORTFOLIO`, the full stats block,
  `MOTHER AGENCY` / `PLACEMENT`, `MEASUREMENTS UPDATED`, `ISSUED`, `ABOUT THIS PASS`, `PHOLIO`.
- **Industry reality:** R3 §5 is explicit and is the only place in the corpus that addresses this
  artefact directly: "a Wallet-pass 'model ID' **is not a recognised industry artefact**… An
  agency-issued digital identity for a model does not appear in any source I found." The one precedent
  (SAG-AFTRA, R3 §5.1) is "a **union membership credential** … proving dues-paid status. It is an
  identity/eligibility document." R3's verdict, verbatim: a Wallet pass "should never be called an
  'ID' unless something is actually being verified. A QR that resolves to the model's book/comp card
  is the low-risk, already-attested form."
- **Why it fails:** Nothing on the pass is verified. `resolveRepresentation` (`pass-content.js:137-165`)
  treats `talent_representations` rows as authoritative, and those are inserted with `status: "active"`
  the moment the talent types them (`src/domains/talent/services/representations.js:174-188` —
  `status: "active"`, `source: "profile"`, `external_agency_name` is free text with no agency
  counter-signature); it further falls back to the free-text `profiles.current_agency` string
  (`:151-156`). So a talent types "IMG Models" and Wallet renders `REPRESENTATION · IMG Models` under
  an "issued by Pholio" pass with a QR code. R0 §E22: "Representation status is a legal fact the platform
  cannot verify unless both parties attest; it must be labelled as 'declared by talent' / 'recorded by
  agency'." The `ABOUT THIS PASS` line does say "Details are as declared on the Pholio profile at the
  issue date" — but it is field 8 on the back of a credential-shaped object, and a booker glancing at
  the face never sees it. **What a booker would think, scanning it:** at best, "why does a model have a
  badge?"; at worst, "this is asserting representation Pholio has not confirmed."
- **Fix:** Either (a) rename the artefact to what it is — a shareable link to the book — and strip it
  to name + photo + `PORTFOLIO` QR + height, dropping `REPRESENTATION`, `BOOKINGS`, `ISSUED`, `Pholio ID`
  and the credential framing entirely; or (b) keep representation on it *only* for agency-confirmed rows
  and label the field `REPRESENTATION (confirmed by <agency>)`, with talent-declared rows labelled
  `REPRESENTATION (declared)` or omitted. Never both a credential shape and unverified facts.

### L3-08 [P0] [MINOR] A minor's Wallet pass carries their face, name, exact age and height on the face — and is freely shareable

- **Where:** `src/domains/wallet/services/pass-content.js:91-95` —
  `FRONT_STAT_KEYS.kids = ["age", "clothing_size", "shoes"]`, rendered in the `generic` auxiliary row
  (`:288-295`) alongside `HEIGHT` in the header and the name as the title, over a face crop produced by
  `src/domains/wallet/services/face-locator.js`. `:277` sets `sharingProhibited: false`. Guardian
  consent is required to generate it (`:222-225`) but nothing constrains it afterwards. Reachable from
  `CompCard.jsx:829` — the wallet badge is hidden only when `minorGated` (consent *missing*), so a
  consented minor gets the link.
- **String/state:** a `.pkpass` file containing `<Child's Name>`, `HEIGHT 152 cm / 5'0"`, `AGE 13`,
  `CLOTHING SIZE …`, `SHOES …`, a cropped photo of the child's face, and a QR to their live public
  portfolio.
- **Industry reality:** R5 §7 / BFMA — the guardian is the account holder and the only communication
  channel; R3 §4.3 — never a child's personal contact on a distributable artefact. R5 §4 — the
  adult/minor line is "the sharpest data line in the industry". No industry artefact of this kind exists
  for adults (R3 §5), let alone for children.
- **Why it fails:** A `.pkpass` is a file. It AirDrops, it emails, it sits in a shared folder. This one
  is a portable identity card for a child, complete with a photo and a link to more photos, and it is
  explicitly marked shareable. Guardian consent to *have* a profile is not consent to mint a
  transferable child ID.
- **Fix:** Do not issue the pass for under-18 profiles at all — hide the badge on `isMinorProfile`, not
  just on `minorGated`, and reject in `buildPassContent`. If a minor pass is ever wanted, it must be
  `sharingProhibited: true`, carry no age, no measurements, no face crop, and point at a
  guardian-gated link.

---

### L3-09 [P1] [CLAIM] Three different photo-recency "industry rules" are asserted, and none of them exists

- **Where:**
  - `src/domains/talent/services/digitals-freshness.js:214` — *"Still usable, but agencies expect a set
    from the last 90 days."* (`CURRENT_MAX_DAYS = 90`, `AGING_MAX_DAYS = 180`.) Reachable via
    `DigitalsFreshness.jsx` on the Media page.
  - `src/domains/pdf/composition/photo-intelligence.js:418,431` — *"Industry recency rule: comp card
    photos should be ≤ 6 months old"* → warning `"newest portfolio photo is N months old — comp card
    photos should be under 6 months"`, surfaced to the talent via
    `CompCard.jsx:137` as *"Refresh your photos — **casting directors expect** images under six months old."*
  - `client/src/shared/constants/frameTaxonomy.js:206-208` — *"Your set has aged past **the window
    agencies expect** — reshoot to keep it current."*
- **Industry reality:** R3 §4.9, verbatim: "**No agency page in the primary sample states a numeric
  re-measure interval.** The 3-month figure is a coaching convention. Label it as such in any product
  copy." R3 §8: "Treat 3 months as a soft, labelled convention. **Do not present it as an industry rule.**"
  And R3 §3 Stage 3 — book images and tearsheets are *curated over years*; a tearsheet does not expire
  in six months. The 6-month rule applied to *comp card / portfolio* photos is not attested anywhere and
  is conceptually wrong for the object it is applied to.
- **Why it fails:** A model who has read three agency application pages knows no agency published these
  numbers. Asserting them as agency/casting-director expectation is the kind of confident wrongness that
  makes a professional stop trusting everything else on the page. It also tells a model with a good
  campaign tearsheet from last year that their best image is stale.
- **Fix:** Attribute the convention: *"Bookers generally ask for digitals shot within about three months
  — that's the working convention, not a published rule."* Drop the 6-month comp-card rule entirely;
  book images do not expire. Pick one number for digitals and use it in all three places.

### L3-10 [P1] [TERM] "Casting" is used to mean "choosing which photos go on the card"; "casters" is used for casting directors

- **Where:** `CompCard.jsx:987` drawer titled `Casting`; `:996` *"Lock the frames the card is built
  around, or leave the **the casting** to Pholio."*; `:1014` title *"The engine **casts** your strongest
  frame"*; `:132` and `:153` *"Add contact details or representation so **casters** can reach you."*;
  `src/domains/pdf/composition/index.js:309,316` *"the card cannot be acted on by a **caster**"*;
  `src/domains/wallet/routes/talent-wallet.js:25` *"a Pholio ID is handed to **casters**"*.
  All reachable: the drawer is on the Media page, the two `casters` strings reach the talent through
  `friendlySuggestions()` / `blockingInfo()`.
- **Industry reality:** R4/R0 §D18 — "casting" is the audition/selection event where a client sees
  models; "go-see", "callback", "option", "confirm" live in the same vocabulary. It is never the act of
  laying out a card. And the person is a **casting director**, a **client**, or a **booker** —
  "caster" is not a word anyone in the industry uses (R0 §F, outsider vocabulary).
- **Why it fails:** "Leave the casting to Pholio" reads, to anyone in the business, as "Pholio will
  decide which jobs you go up for" — a claim about procuring work, which R5 §6 says an unlicensed
  platform must never make. It is the one place in the lane where a coined usage collides with a
  regulated one.
- **Fix:** Rename the drawer to `Frames` or `Front & back`; "leave the selection to Pholio"; "Pholio
  picks your strongest frame". Replace `casters` with `casting directors` (or `bookers`) everywhere.

### L3-11 [P1] [CLAIM] The public portfolio publishes ethnicity, weight and a "Studio+" plan badge

- **Where:** `views/portfolio/show.ejs:19` (`<span class="portfolio-pro-badge">Studio+</span>`),
  `:50-55` and `:241-243` (`Weight`), `:178-181` (`<li><span>Ethnicity:</span> …</li>`),
  `:57-62` (`Gender`), `:100-105` (`Experience`), `:88-92` (`Availability … Willing to travel`).
  Reachable at `/portfolio/:slug` (`src/routes/portfolio.js:354`), the public page every comp card QR
  and Wallet pass points at.
- **Industry reality:** **Ethnicity** — R5 §4: under UK/EU law racial or ethnic origin is Art. 9
  special-category data requiring an Art. 9 condition; no sampled agency board publishes it. **Weight** —
  R3 §4.6/§7.5: absent from every adult fashion board read (Wilhelmina W, Wilhelmina M, Models 1) and
  from modern comp-card stat lists; "putting it on a fashion stat card in 2026 reads as either
  out-of-date or body-surveillance-y". **Studio+** — R5 §5.2/§5.3: selling talent visibility or standing
  in front of agencies is the BFMA-flagged scam pattern; R5 §6 MUST NOT: "'Boost your profile to
  agencies', 'premium listing', 'featured placement'".
- **Why it fails:** The Studio+ badge is the worst of the three. It is a paid-tier marker rendered on
  the artefact an agency looks at, which tells a booker that what they are seeing is a function of what
  the model paid. That is the pattern-match R5 documents as trust-fatal, and it is one `<span>`.
- **Fix:** Delete the Studio+ badge from the public page outright (plan tier is never a public fact).
  Remove `Ethnicity` from the public template; if it is collected at all it belongs behind explicit
  Art. 9 consent and agency-only visibility. Move `Weight` behind the same fitness-only gate the comp
  card already applies (`stats-formatter.js:585-590`).

### L3-12 [P1] [CONCEPT] The public portfolio shows one undifferentiated "Gallery" — digitals and book in the same grid

- **Where:** `views/portfolio/show.ejs:207-218` and `:288-296` — `images.forEach(...)` over the full
  query at `src/routes/portfolio.js:385-395` (active + not `exclude_from_public`, no `image_type`
  filter), under the heading `Gallery`, with `alt`/`figcaption` defaulting to `'Portfolio image'`.
- **Industry reality:** R3 §7.1 (the #1 error) and R3 §1 — the book and digitals are opposite objects
  with opposite rules; a single gallery "collapses the entire mental model".
- **Why it fails:** The Media page does the separation beautifully (`MediaWorkspace.jsx:51-65` — Digitals /
  The Book / Tests / Campaigns / Tearsheets / Motion, each with a correct blurb). None of that survives
  into the artefact an agency actually opens, and calling a plain-wall digital a "Portfolio image" in
  the alt text is precisely the category error the taxonomy was built to prevent.
- **Fix:** Render the public page in the same sections as the Media page — `The Book` first, `Digitals`
  as a separate dated block below (or behind a link), tearsheets credited. At minimum, exclude
  `image_type = 'digital'` from the public Gallery and expose digitals only through the dated sheet.

### L3-13 [P1] [CLAIM] AI-inferred frame signals render as bare statements of fact, indistinguishable from talent-set values

- **Where:** `client/src/shared/components/frame/FrameSignalStack.jsx:28-56` renders
  `pitsSignalParts()` chips with no attribution; `client/src/shared/constants/frameTaxonomy.js:135-160`
  maps the model's probabilistic outputs to flat labels — notably
  `retouch_likelihood: { none: 'Unretouched', light: 'Light retouch', heavy: 'Heavy retouch' }` and
  `makeup_level: { none: 'No makeup', … }`. The source values come from the vision prompt at
  `src/domains/ai/classify-portfolio-image.js:56-64`, which explicitly asks for a
  `"retouch_likelihood": "none | light | heavy"` — a *likelihood*. `FrameReadCaption.jsx:79-88` renders
  the identical chip stack whether `state.band` is `suggest` (unconfirmed guess) or `confirmed`.
  Reachable on every frame on the Media page.
- **String/state:** a chip reading `Heavy retouch` or `Styled makeup` sits under the talent's photo.
- **Industry reality:** R0 §E21 — the platform can report events, not inferences-as-facts; R5 §5.6 #9 —
  AI output must be an internal aid, never a verdict. R3 §6 — "no 'unretouched' certification claim"
  is used as a label anywhere in the industry.
- **Why it fails:** The hedge is in the field name and lost in the label. A talent who did not retouch a
  photo sees Pholio state that it is heavily retouched, with no "Pholio read this" framing and no way to
  tell a guess from a confirmed value. Note the contrast: the toast at `MediaWorkspace.jsx:621`
  (*"Pholio read this as X"* with a *"Clear read"* action) gets this exactly right, and the hint
  helper `qualityHintFromSignals` correctly hedges (*"Reads as styled book work, not a raw digital"*).
  The chips are the one place the hedge is dropped.
- **Fix:** Prefix or style proposed reads distinctly (`Pholio reads: heavy retouch`), and hedge the
  labels themselves — `Reads retouched` / `Reads unretouched`, never the bare adjective. Never show a
  `suggest`-band chip in the same visual register as a confirmed one.

### L3-14 [P1] [CLAIM] Consent for image AI says "profile insights"; what is stored is a "senior casting director" verdict on the person's bone structure and market suitability

- **Where:** `src/domains/ai/analyzeProfileImage.js:57-79` — `MASTER_VISION_PROMPT` opens *"You are a
  senior casting director at a premier international modeling agency reviewing a new talent submission"*
  and requests `boneStructure`, `featureContrast`, `lookType`, `symmetryRead`
  (*"assessment of facial symmetry and **market suitability impact**"*), `primaryStrength`
  (*"strongest **castable** visual asset"*), `castingNotes`, `bookingStrengths`
  (*"immediately castable"*), `developmentNotes` (*"what would most strengthen **market position**"*).
  Persisted to `profiles.image_analysis` (`:229`). Reachable: fired on every primary-photo upload via
  `runSensitiveImageAnalysisIfAllowed` (`src/domains/talent/routes/media.js:176-193`), gated on
  `PHOLIO_ENABLE_IMAGE_ANALYSIS` + adult DOB + `ai_processing_consent`. The consent text is
  `src/domains/talent/routes/settings.js:76-80`: *"Allow Pholio to send portfolio images to its
  image-analysis provider for shot classification and **profile insights**."* The stored blob is
  returned to the talent in their data export (`settings.js:219-221`).
- **Industry reality:** R5 §5.6, on what legitimate AI-photo consent must look like: *"**Specific as to
  purpose** — Elite's 'sole scope of a preliminary evaluation of your potential as a model' is the model
  to copy. **Not 'to improve our services.'**"* and #9: *"Output framed as an internal aid, never as a
  verdict about the person — an AI 'score' surfaced to a model reads as an implied-outcome claim, which
  is the FTC's exact enforcement lane, and as bias risk under Storm's clause 5."* Storm's AI Code
  (R5 §5.6): *"AI must not discriminate or introduce bias in casting, representation or client
  deliverables."*
- **Why it fails:** "Profile insights" does not disclose that a language model will assess the talent's
  facial structure and symmetry and write a sentence about their market position. Two files away,
  `src/domains/ai/comp-card-vision.js:36-38` states the product's own invariant: *"plan invariant A1.5
  bars inferring appearance, type, 'potential' or protected traits from imagery, regardless of
  biometrics law"* — `analyzeProfileImage` is a direct violation of it. The one mercy is that nothing
  consumes the output: `flattenImageAnalysis` (`src/domains/ai/embeddings.js:598-606`) deliberately
  returns `""`, and no client component reads `image_analysis`. It is stored, exportable, and pointless.
- **Fix:** Delete `MASTER_VISION_PROMPT` and `masterVisionAnalysis`, and drop the
  `runSensitiveImageAnalysisIfAllowed` call in `media.js`. Nothing reads the output; the only live
  effect is a per-upload provider call producing a stored verdict about a person's face. If any of it is
  needed later, it must be re-scoped to attributes of the *photograph* (the `describe-photo.js` model —
  which does this correctly) and the consent text must name the purpose specifically.

### L3-15 [P1] [TERM/CONCEPT] The comp card is presented as a design product with nine named "editions", a "voice", "directions" and "takes"

- **Where:** `src/domains/pdf/composition/editions.js:78-252` — labels `The Standard`, `The Strip`,
  `The Monograph`, `The Masthead`, `The Grid`, `The Cover Story`, `The Night Edition`, `The Diptych`,
  `The Cutout`; tones such as *"Museum register — deep mats, caption typography, air as material."* and
  *"Dark paper, reversed type, gold that finally sings."* Surfaced on the Media page at
  `CompCard.jsx:912-947` (edition tiles), `:894-900` (`VOICE_LABELS` — `Stark Grotesque`,
  `Romantic Didone`, `Hairline Fashion`…), `:958-985` (`New direction` / `Another take`),
  `:1057-1075` (`Recent takes`, `Name this take`, `Save take`).
- **Industry reality:** R3 §4.1 — the card is A5/half-letter *because that is a filing size*, adopted in
  1972 "for filing purposes". R3 §4.2 — the name typeface guidance is "deliberately plain (Arial/Times,
  12–14 pt) — **the card is not a branding exercise**". R3 §3 Stage 4 — when a model is represented,
  "the comp card is made by the agency itself"; the model does not art-direct it.
- **Why it fails:** No model has ever chosen an "edition" of their comp card, and no agent has seen one.
  The vocabulary (edition / voice / direction / take / register / masthead) belongs to publishing, and it
  makes a filing card look like a coffee-table book. `VOICE_LABELS`'s own comment concedes it: "Voice
  names mirror the engine's typography library" — engine internals surfaced as product language.
  Separately, exposing a *typeface* choice on a comp card invites exactly the branding exercise the
  industry avoids.
- **Fix:** Keep the engine; retire the vocabulary. One control — "Layout" with three or four plain
  options — plus "Shuffle". Drop `VOICE_LABELS` from the UI entirely. If named looks are kept, name them
  after what a card *is* (`Classic`, `Full bleed`, `Split`, `Two-up`), not after magazine departments.

### L3-16 [P1] [TERM] "Board" on a saved comp card is a list of registers, not boards — and the talent, not the agency, picks it

- **Where:** `CompCard.jsx:71-73` —
  `CARD_BOARDS = ['Commercial','Editorial','Runway','Fitness','Curve','Beauty']`, with the comment
  *"the division/lane the card is built for"*; rendered as a `Board` select with `Any board`
  (`:1094-1108`) on every saved card, alongside `CARD_MARKETS`.
- **Industry reality:** R3 §2 / R0 §A2 — a board is an agency's roster grouping: Models 1
  **[P-agency]** publishes `Image / Main / New Faces / Classic / Curve`; IMG **[P-agency]** publishes
  `Model / Development / Talent / Creator`. `Editorial`, `Runway` and `Beauty` are *registers* or *job
  types*, not boards. `Commercial` and `Curve` are genuine board names; `Fitness` is a real commercial
  division. The list mixes three taxonomies.
- **Why it fails:** Board membership is assigned by an agency, not chosen by the talent. A model
  labelling their own card "Runway board" would read to an agent as someone who has not been inside an
  agency. The `Market` field beside it is right and useful (R3 §4.5, R0 §A3 — representation is scoped
  by market).
- **Fix:** Rename the field to `Use` or `Aimed at` and populate it with registers
  (`Commercial`, `Editorial`, `Beauty`, `Fitness`, `Runway`) — which is what these values actually are.
  Reserve the word "board" for agency-assigned divisions and let the agency set it.

### L3-17 [P1] [CONCEPT] "Test shoot" is defined as TFP — the two things the industry keeps apart

- **Where:** `client/src/shared/constants/frameTaxonomy.js:80` —
  `{ value: 'test', label: 'Test shoot', hint: '**TFP or test day imagery**' }`;
  `MediaWorkspace.jsx:62` — `tests: { title: 'Tests', blurb: '**Test-shoot and TFP frames.**' }`.
  Reachable in the frame editor's `Use` picker and as a Media page section header.
- **Industry reality:** R3 §2 — a **test** is "a shoot done to make portfolio images rather than for a
  client … usually arranged through the model's agency"; **TFP** is "photographer and model both work
  unpaid, both keep images; **no** agency involvement". R3 §7.12 names the exact error: "A 'test shoot'
  feature that behaves like TFP … while using the word 'test'."
- **Why it fails:** The distinction is about who arranged the shoot and who is accountable for it, and
  it matters when an agent asks "who shot this?". Collapsing them tells a new model the two are
  interchangeable, which is how models end up in unvetted shoots with no agency in the loop — the
  safeguarding failure mode.
- **Fix:** Two values: `Test` (hint: *"Arranged by an agency to build your book"*) and `TFP`
  (hint: *"You arranged it directly with the photographer — no agency involved"*). Section header
  `Tests & TFP` if they must share a grid.

### L3-18 [P1] [CONSISTENCY] Three stats implementations with three different orders, unit policies and label forms

| | Women order | Shoe | Half-inch | Label form | Kids track |
|---|---|---|---|---|---|
| `src/domains/pdf/composition/stats-formatter.js` (comp card) | Height · Bust · Waist · Hips · Dress · Shoes · Hair · Eyes | `US 9 / EU 40` | `34.5"` | `HEIGHT` (upper) | ✅ |
| `src/shared/lib/stats-formatter.js` (public page, fallback card, wallet-adjacent) | Height · Bust · Waist · Hips · Dress · Shoe · Hair · Eyes | bare string | — | `Height` (title) | ❌ |
| `src/domains/pdf/routes/pdf.js:2005-2032` (digitals sheet) | Height · Bust · Waist · Hips · **Shoe · Dress** · Hair·Eyes | bare string | `34.0″` | `Height` (title) | ❌ |

- **Where:** as above. All three reachable (comp card preview/download; `/portfolio/:slug`;
  `/pdf/digitals/:slug`).
- **Industry reality:** R3 §4.4 — the canonical order is **Height → Bust → Waist → Hips → Dress →
  Shoe → Hair → Eyes**; "Height is *always first*. Hair/eyes are *always last*." R3 §7.7: "Mis-ordered
  stats … **The order is the tell.**" R3 §4.5 on units: Models 1 **[P-agency]** renders
  `Shoe 6 UK / 39 EU`; "There is no universal shoe number; a single unlabelled shoe field is a
  localisation bug the moment the profile crosses a border" (R3 §7.6). R3 §4.5 also notes boards type
  half-inches as `½''`, not `.5`, and inch marks as double apostrophes.
- **Why it fails:** A talent's height reads `178 cm / 5'10"` on the comp card and `178 cm / 5'10"` on
  the sheet but their shoe reads `US 9 / EU 40` on the card and `9` on the sheet and the public page —
  the same person's stats disagree across three artefacts an agency may receive together. The digitals
  sheet also prints Dress after Shoe, and pushes a `Hips` line for male profiles that the comp card's
  men's track correctly omits.
- **Fix:** Delete the ad-hoc block in `buildDigitalsSheetData` and the duplicate ordering in
  `buildCanonicalStats`; call the composed formatter (with a `units`/`case` option) from all three.
  That also fixes L3-04 in one move. Separately: label `Shoe`, not `Shoes` (Wilhelmina and Models 1
  both use the singular), and render `34½"` rather than `34.5"`.

### L3-19 [P1] [DATA] A talent can move any frame into Digitals in one click, with no separation check

- **Where:** `MediaWorkspace.jsx:490-496,522-556` — the bulk `Move frames` modal, titled
  *"Bulk reclassify frames"*, body *"Move the selected frames to a different **portfolio section** or
  dated set."*, target list `The Book / Digitals / Tests / Campaigns / Tearsheets`. No warning when the
  target is Digitals; no server-side guard.
- **Industry reality:** R3 §1 — digitals are "the *truth document*… unretouched, un-styled, no makeup,
  plain wall"; R3 §7.1 — mixing the two is the loudest error.
- **Why it fails:** Everything else in this area gets the rule right — the frame editor refuses
  retouching on a digital and says so beautifully (`FrameEditor.jsx:1018-1021`: *"Digitals must stay
  raw — retouching is disabled on this frame. Replacing it with a retouched version turns it into book
  work, not a digital."*), and the classifier prompt encodes the distinction correctly. The one
  unguarded door is the bulk move, and it is the one that also stamps "Unretouched" on the result
  (L3-05). Calling Digitals a "portfolio section" in the same sentence also verbally collapses the
  distinction the section headers work to establish.
- **Fix:** When the target is `digital`, confirm with the rule (*"Digitals are the raw set — no
  retouching, no makeup, plain background. Move N frames anyway?"*), and warn (do not block) when a
  frame's own AI signals read `styling_register: editorial` or `retouch_likelihood: heavy`. Reword to
  *"Move the selected frames to a different section"*.

### L3-20 [P1] [DATA] Under-18 body measurements are gated behind guardian consent instead of structurally omitted, and the swimwear/lingerie register has no age gate

- **Where:** `src/shared/lib/talent-age.js:91-95` — `minorSensitiveFieldsUnlocked` returns true for a
  minor **with guardian consent**, and `SENSITIVE_MEASUREMENT_FIELDS` (`:8-22`) includes
  `bust/chest/waist/hips/inseam/weight`. So a consented minor's B/W/H are collected and stored.
  `SENSITIVE_IMAGE_SHOT_TYPES` (`:24-27`) is only `full_length` / `full_body`, so nothing gates
  `style_type` — and `frameTaxonomy.js:117` offers
  `{ value: 'swimwear', label: 'Swimwear', hint: '**Swim, lingerie, body**' }` in the frame editor's
  `Register` picker (`FrameEditor.jsx:881-889`) with no age check.
- **Industry reality:** BFMA **[P-body]**, quoted in R3 §4.7 and R5 §4: *"We believe it is inappropriate
  to measure any young person under the age 18 except for their height"* and *"It is unacceptable to
  take, send or receive body, bikini or lingerie digitals of any young person under the age of 18."*
  MiLK **[P-agency]**: *"Don't submit any lingerie, swimwear, or bikini images."* R3 §4.7 product
  implication: the omission must be **structural**, and the product "must never surface a
  bust/waist/hip capture UI to a minor's account".
- **Why it fails:** Guardian consent is consent to participate, not a waiver of a safeguarding norm —
  BFMA's rule has no consent exception, and offering a child's account a "Swimwear — swim, lingerie,
  body" tag is offering a category the code of practice calls unacceptable regardless of who agrees.
  The comp card already gets the *display* right (kids track omits B/W/H); the *collection* and the
  *tagging* do not.
- **Fix:** Make `canCollectSensitiveProfileFields` return false for any minor, full stop — no consent
  override. Filter `swimwear` out of `stylePickerOptions()` for minor profiles, and reject it
  server-side in the media update route.

---

### L3-21 [P2] [TERM] "Unplaced" is a coined status for an untyped frame

- **Where:** `client/src/shared/constants/frameTaxonomy.js:28,72,103,127` — `{ value: '', label:
  'Unplaced' }` on all four pickers; `REVIEW_STATE_LABELS.ask = 'Needs placement'`,
  `pending_timeout = 'Place this frame'`; toast *"Some frames need a manual read. Open details to place
  them."* (`MediaWorkspace.jsx:679`). Reachable in the frame editor and every frame caption.
- **Industry reality:** No industry term. "Placement" in this business means an agency placing a model
  with another agency in a market (R3 §2, and Pholio itself uses `PLACEMENT` that way on the Wallet
  pass, `pass-content.js:181`). Using the same word for "this photo has no type yet" is a collision
  inside one product.
- **Fix:** `Not set` / `Untyped`, and `Add a type` for the action. Reserve `placement` for representation.

### L3-22 [P2] [CLAIM] A smiling headshot and a back view are presented as standard digitals requirements

- **Where:** `frameTaxonomy.js:264-267` — `smile: { label: 'Smile / Commercial', description: 'Warm,
  approachable smile showing teeth.' }`; `:275-278` — `back: { description: 'Shows hair and back of
  head — **common digitals slot**' }`; `client/src/domains/talent/components/profileReadinessItems.js:133-137`
  — *"A full-length back frame **completes the standard digitals set**."*; `DIGITALS_SLOTS`
  (`client/src/shared/utils/profileReadinessImages.js:167-173`) makes `back` one of five canonical slots.
  Reachable via `CurationGuidance.jsx` and the readiness sidebar.
- **Industry reality:** R3 §8, contested points, verbatim: smiling is *"genuinely agency-specific.
  High-fashion boards want neutral; commercial/lifestyle agencies want warmth. **A product must not
  hard-code either** — it should surface the *agency's own* instruction."* Storm, Elite and NOMAD all say
  no smiling; only Heffner says "Remember to smile!". For **back**: R3 §4.8 — only 2 of 11 sampled
  agencies ask for a back or extra full-length variant; the convergent core is close-up · profile ·
  three-quarter/waist-up · full length.
- **Why it fails:** "Common digitals slot" and "completes the standard digitals set" assert a consensus
  the evidence contradicts. A model coached to smile who then submits to Storm has been actively
  misdirected. (`profileReadinessItems.js:131` hedges better — "Commercial boards want at least one
  approachable smile" — which is the right register.)
- **Fix:** Hedge both: *"Some commercial and lifestyle agencies ask for one smiling frame — high-fashion
  boards usually want neutral."* Move `back` out of the canonical five into an optional sixth, or label
  it *"Some agencies (Elite, NOMAD) also ask for a back view."*

### L3-23 [P2] [LEAK] Engine-internal vocabulary and raw identifiers reach the talent

- **Where:** `CompCard.jsx:894-900` — `VOICE_LABELS` (`Stark Grotesque`, `Romantic Didone`,
  `Hairline Fashion`, `Quiet Classic`) shown as the card's "voice"; `:143-147` — *"'**Type-safety**
  check' … We could not verify a safe placement for your name"* and *"'**Crop check**'"* as talent-facing
  status labels; `:160-162` fallback surfaces raw guardrail messages —
  `src/domains/pdf/guardrails.js:89,117,126,142,151` produce strings like
  *"Image 8f3a1c2e-… is missing width/height metadata."* and *"Image … short edge (640px) may be low for
  print."* `FrameEditor.jsx:869` labels the status field `Library state`; `:22-30` exposes nine
  overlapping rights enum values (`Unset / Pending review / Cleared for distribution / Licensed / Owned /
  Approved / Restricted / Blocked / Denied`); `MediaWorkspace.jsx:524` — *"Bulk reclassify frames"*.
- **Industry reality:** R0 §F — SaaS/system vocabulary is one of the categories that makes a
  professional flinch; a UUID in an error message is a database row shown to a person.
- **Fix:** Map every guardrail id to talent copy (the `BLOCKING_COPY` table already does this for four
  of them — extend it and drop the raw fallback, or at minimum replace the UUID with the frame's
  position). Rename `Library state` → `Status`, `Bulk reclassify` → `Move frames`. Collapse the rights
  enum to the four states a talent can actually distinguish: *Not set · I own these · Licensed ·
  Model release on file*. Remove `VOICE_LABELS` from the UI.

### L3-24 [P2] [DATA] The composed comp card puts up to four stat lines on the FRONT, and prints a child's exact age rather than an age range

- **Where:** `src/domains/pdf/composition/composition-director.js:967-974` —
  `statLineText` = the first four stats joined, rendered at
  `src/domains/pdf/templates/compcard-composed.ejs:523-530`. For a kids card the first four are
  `AGE · HEIGHT · CLOTHING SIZE · SHOES`, so a child's exact age prints on the front.
  Age itself: `stats-formatter.js:511-516` pushes `AGE` with `String(age)`.
- **Industry reality:** R3 §4.2 — "**Front:** one image + the model's name"; the stats block lives on
  the back. R3 §4.7, compcard.com **[P-print]** — a children's card substitutes "height, clothing size,
  shoe size, hair, eyes, **age range**" — an age *range*, not an exact age, and R3 records the one kids
  board readable in the sample (Docherty) as showing height only.
- **Fix:** Keep the front to hero + name (a small height line is defensible; four stats is a back
  block on the wrong page). Render kids age as a band (`AGE 12–14`), matching what
  `machine-readable.js:143` already assumes the card does ("Band, never a birth date — the card prints a
  band and so does this" — currently untrue).

### L3-25 [P2] [TERM] "Campaign" is defined as unpublished work; "Package" collides with the agency's own term

- **Where:** `frameTaxonomy.js:82` — `{ value: 'campaign', label: 'Campaign', hint: '**Unpublished**
  brand or advertising work' }`; `MediaWorkspace.jsx:63` — `campaigns: { blurb: 'Unpublished brand and
  advertising work.' }`. And `frameTaxonomy.js:222-224` / `CompCardGate.jsx:54` — *"your **package**"*,
  *"submission **package**"* (also throughout the applications surface — cross-lane).
- **Industry reality:** R3 §2 — a **tearsheet** is published proof; a **campaign** is advertising work
  that ran. "Unpublished brand work" is a *test* or an unreleased shoot, not a campaign. R3 §2 also
  defines **package** as "a curated set of talent (images + stats) **an agent sends a client**" —
  Syngency **[P-vendor]**, "packages help agents quickly respond to client requests". Pholio uses
  "package" for the talent's own materials bundle, which is the same word for the opposite direction.
- **Fix:** Campaign hint → *"Brand or advertising work you shot (add a tearsheet once it runs)."*
  Replace talent-facing "package" with "your materials" or "your submission"; keep "package" for the
  agency-to-client object if that is ever built.

### L3-26 [P2] [DATA] Every frame on the digitals sheet is stamped with a month, and undated frames print "Undated"

- **Where:** `src/domains/pdf/routes/pdf.js:1993-1994` —
  `capturedLabel: fmtMonth(img.captured_at) || "Undated"`, rendered per frame at
  `src/domains/pdf/templates/digitals-sheet.ejs:140-143`.
- **Industry reality:** R3 §4.8, verbatim: *"**No agency page in the sample displays a capture date on
  digitals.**… a product that stamps 'taken 14 Feb' on a digital is *inventing* a convention, whereas a
  product that tracks 'digitals last updated' as metadata on the set is consistent with how bookers
  talk."* R3 §7.15 lists the on-image stamp as a thing that reads wrong.
- **Why it fails:** Per-frame dates fragment what bookers treat as a set. Worse, printing the literal
  word `Undated` under a photograph on a document sent to an agency actively damages the talent — the
  freshness engine's own honesty rule (correctly) refuses to *call* an undated set current, but printing
  the admission on the artefact converts an internal safeguard into a public liability.
- **Fix:** One date for the set in the header — the header already has the right shape
  (`digitals-sheet.ejs:128-131`: `Digitals · <location> · Measured <month>`); add `· Shot <month>` there
  and drop the per-frame stamp. Refuse to export a sheet with undated frames, offering the
  `DigitalsFreshness` date prompt instead (it already exists and works well).

### L3-27 [P2] [CLAIM] "Add to Apple Wallet" is shown to every eligible talent, and returns raw JSON when signing is unconfigured

- **Where:** `CompCard.jsx:829-832` renders the Apple badge as a plain `<a href="/api/talent/wallet/pass">`
  with no fetch/error handling; `src/domains/wallet/routes/talent-wallet.js:44-46` returns
  `503 {"error":"Pholio ID Apple Wallet signing is not configured yet.","code":"WALLET_NOT_CONFIGURED"}`.
- **Why it fails:** In any environment where the five `APPLE_WALLET_*` env keys are absent, a talent
  clicking the official Apple badge gets a JSON blob in a browser tab with an internal error code.
  The message also leaks the deployment state to a user who cannot act on it.
- **Fix:** Only render the badge when a capability probe reports the pass is configured, and handle the
  click via `fetch` so a failure becomes a toast. (If L3-07's recommendation is taken, the badge goes
  away.)

---

## Coined / internal terms encountered

| Term | Where | Verdict | Translation |
|---|---|---|---|
| **The Book** | `talentNav.js:14`, `MediaWorkspace.jsx:59,1153` | **keep** | Correct (R3 §2: models say "my book"). One of the best names in the product. |
| **Digitals** | `frameTaxonomy.js:76`, `MediaWorkspace.jsx:55` | **keep** | Correct and correctly defined. |
| **Tearsheet / Test shoot / Campaign** | `frameTaxonomy.js:79-84` | keep (fix hints) | See L3-17, L3-25. |
| **Frame** (for one image) | throughout Media page | keep | Photographic, reads professional. |
| **Frame read / "reads"** | `FrameEditor.jsx:863`, `MediaWorkspace.jsx:1201` | keep | "Reads" is real industry usage ("she reads younger"); attribution ("Pholio read this as…") is honest. |
| **Unplaced / Needs placement** | `frameTaxonomy.js:28,72,103,127,167-171` | **translate** | "Not set" / "Add a type". Collides with `PLACEMENT` on the Wallet pass. |
| **Register** (for style_type) | `FrameEditor.jsx:876` | translate | "Look" or "Market" — models and agents say "commercial look", not "commercial register". |
| **Library state** | `FrameEditor.jsx:869` | translate | "Status". |
| **Edition** (of a comp card) | `editions.js`, `CompCard.jsx:874-947` | **translate** | "Layout". See L3-15. |
| **Voice** (typeface) | `CompCard.jsx:894-900` | **hide** | Engine internal; remove from UI. |
| **Direction / New direction** | `CompCard.jsx:958-969`, `directions.js` | translate | "Shuffle" / "Try another layout". |
| **Take / Another take / Recent takes** | `CompCard.jsx:970-985,1057-1080` | translate | "Version". A photographic "take" is an exposure, not a design variant. |
| **Casting** (photo selection) | `CompCard.jsx:987,996,1014` | **translate** | "Frames" / "Front & back". Regulated-adjacent collision — see L3-10. |
| **Caster** | `CompCard.jsx:132,153`, `composition/index.js:309,316`, `talent-wallet.js:25` | **translate** | "Casting director" / "booker". Not a word. |
| **Package** (talent's own materials) | `frameTaxonomy.js:222`, `CompCardGate.jsx:54`, applications surface | **translate** | "Your materials". R3 §2 reserves "package" for agent→client. |
| **Board** (on a saved card) | `CompCard.jsx:71,1094` | **translate** | "Use" / "Aimed at". See L3-16. |
| **Pholio ID** | `pass-content.js` throughout, `.pkpass` filename | **translate / retire** | Not an artefact. See L3-07. |
| **Studio+** (on the public page) | `views/portfolio/show.ejs:19` | **hide** | Plan tier is never a public fact. See L3-11. |
| **Archetype / casting verdict** | `compcard-standard.ejs:388,461`, `pdf.js:543-563` | **retire** | See L3-06. |
| **PITS signals** | `frameTaxonomy.js:280` (`PITS_SIGNAL_KEYS`) | hide | Internal acronym; never render the key names. |
| **Bulk reclassify** | `MediaWorkspace.jsx:524` | translate | "Move frames" (the button already says this). |
| **Grid slot / cell** | `guardrails.js:61` | hide | "Back-page photo". |

## Consistency variants

| Concept | Variants seen | Locations |
|---|---|---|
| The media surface's name | `The Book` (nav + H1) · `Portfolio \| Pholio` (browser tab) · `portfolio section` (bulk-move body) · `Gallery` (public page) · `your portfolio` (delete confirm) | `talentNav.js:14`; `MediaWorkspace.jsx:606,528,1153,1091`; `views/portfolio/show.ejs:207` |
| Digitals recency rule | 90 days ("agencies expect") · 180 days ("aging") · 6 months ("industry recency rule", "casting directors expect") · "the window agencies expect" (unnumbered) | `digitals-freshness.js:31-33,214`; `photo-intelligence.js:418,431`; `CompCard.jsx:137`; `frameTaxonomy.js:206-208` |
| Stats order / units / labels | three implementations, three orders, three unit policies — see L3-18 table | `pdf/composition/stats-formatter.js`; `shared/lib/stats-formatter.js`; `pdf/routes/pdf.js:2005-2032` |
| Shoe field | `SHOES` `US 9 / EU 40` · `Shoe` `9` · `Shoe` bare string | same three files |
| Half-inch rendering | `34.5"` · `34.0″` · (industry: `34½''`) | `pdf/composition/stats-formatter.js:395`; `pdf.js:2003` |
| Who represents the talent | comp card reads `profiles.partner_agency_id` → `agencies.name` · Wallet pass reads `talent_representations` + free-text `profiles.current_agency` · public page shows no representation at all | `pdf.js:942-953`; `pass-content.js:137-165`; `views/portfolio/show.ejs` |
| Minor B/W/H | structurally omitted (composed comp card) · rendered (public page, fallback card, digitals sheet, embedded JSON) | `pdf/composition/stats-formatter.js:530-540` vs `shared/lib/stats-formatter.js:306`, `pdf.js:2005`, `machine-readable.js:107` |
| Image-type labels | `Book` (`IMAGE_TYPE_LABELS.portfolio`) · `The Book` (bulk-move + section) · `Portfolio` (browser tab, alt text) | `frameTaxonomy.js:57`; `MediaWorkspace.jsx:491,59`; `views/portfolio/show.ejs:210` |
| Shot label sets | `SHOT_LABELS` (14 values, client) vs `DIGITALS_SHOT_LABELS` (11 values, server) vs `DIGITALS_SLOTS` (5) vs `COMP_CARD_SLOT_LABELS` (4, mixes framing with register) | `frameTaxonomy.js:11-27,286-291`; `pdf.js:1958-1970`; `profileReadinessImages.js:167` |

## Working well (preserve)

1. **`src/domains/pdf/composition/stats-formatter.js`** — canonical women's/men's order matching R3 §4.4
   exactly, height first, hair/eyes last, dual units, shoe and dress localisation, weight suppressed
   except fitness, age suppressed for adults, a real kids track with **structural** B/W/H omission, and
   an `omitted[]` array that explains every suppression. This is the best file in the lane; make it the
   single stats implementation.
2. **`src/domains/talent/services/digitals-freshness.js` + `DigitalsFreshness.jsx`** — four honest states
   (`current / aging / stale / undated`) and the rule *"Undated is never reported as current"*, with the
   component's docstring narrating why a weaker client-side reimplementation was deleted. This is exactly
   R0 §E21 discipline. Guidance strings need the recency number attributed (L3-09) but the model is right.
3. **`src/domains/ai/describe-photo.js`** — adult-only, consent-gated, a prompt that forbids race,
   ethnicity, skin tone, age, body type, attractiveness and gender, plus a post-filter denylist that
   *drops* rather than edits a violating description. Model for how every vision prompt in the product
   should be written.
4. **`src/domains/ai/comp-card-vision.js`** — the BIPA/`Monroy`/`Zellmer` reasoning, "no cross-image
   linking, ever", and `sanitiseLines()` enforcing the no-description rule as a system property rather
   than a request.
5. **`src/domains/ai/classify-portfolio-image.js:37-44`** — the "Industry image_type rules (critical)"
   block encodes R3 §1's digital-vs-book distinction correctly, including "Never label heavy retouching…
   as 'digital'". The classifier understands the separation the comp card ignores.
6. **`FrameEditor.jsx:1018-1021`** — *"Digitals must stay raw — retouching is disabled on this frame.
   Replacing it with a retouched version turns it into book work, not a digital."* Per-object retouch
   policy, exactly as R3 §6 requires, instead of a global flag.
7. **`MediaWorkspace.jsx:51-65`** — six sections (Digitals / The Book / Tests / Campaigns / Tearsheets /
   Motion) with accurate blurbs, and *"Kept distinct from the book"* stated in the digitals blurb.
8. **`MediaWorkspace.jsx:621-643`** — *"Pholio read this as X"* with a one-tap **Clear read**. Inference
   attributed and reversible.
9. **`src/domains/pdf/machine-readable.js`** — the "if it is not on the card, it is not in the payload"
   rule and the reasoning for XMP + attachment. The rule is right; only the `is_minor` wiring is broken
   (L3-04).
10. **Comp card geometry** — 5.5 × 8.5 everywhere (`machine-readable.js:49`, `compcard-composed.ejs:202`,
    `CompCard.jsx:80`), back grid clamped to four (`BACK_GRID_MAX = 4`), matching R3 §4.1–§4.2 (modal 4).
11. **`src/domains/pdf/routes/pdf.js:325`** — *"theme customization is Studio+, **the agency logo is
    free**"*. Correct instinct: the agency block is constitutive of the card and must never be paywalled.
12. **`views/portfolio/show.ejs` age handling** — `publicAgeBand` returns a band, never an exact age,
    and stats default to agency-only visibility (`stats: statsPublic ? … : null`).
13. **Guardian-consent gating** of comp-card preview, export, digitals sheet, public portfolio and the
    Wallet pass, all through one `minorPublicExposureAllowed` that fails closed on a missing DOB
    (`src/shared/lib/talent-age.js:160-165`) — the fail-closed reasoning in that docstring is exemplary.

## Dead or unreachable code carrying issues

- **`src/domains/pdf/templates/compcard.ejs`** (769 lines, `TEMPLATE_LEGACY`, rendered only at
  `pdf.js:1586` from the legacy `/pdf/view` classic path) carries `profile.agency_affiliation` under a
  `Representation` heading and an `agencyLogo` block — the *right* model, in the *dead* template, while
  the live composed engine has neither. Worth harvesting before deletion.
- **`onboarding_signals.casting_verdict` / `archetype_label`** have no remaining writer in `src/`
  (grep finds only the read at `pdf.js:553` and the export/delete inventory at `settings.js:302`). The
  **read** path is live, however, and the demo profile hard-codes a verdict — so L3-06 is a live finding
  against a mostly-dead data source.
- **`profiles.image_analysis`** is written on every primary-photo upload but read by nothing except the
  talent data export: `flattenImageAnalysis` (`embeddings.js:598-606`) deliberately returns `""` and no
  client component references it. A live write with no live consumer — see L3-14.
- **`SHOT_LEGACY_ONLY` / `IMAGE_TYPE_LEGACY_ONLY`** (`frameTaxonomy.js:47-50,88-92`) surface
  `Profile (legacy left)`, `Comp card (legacy)`, `Book (legacy editorial tag)` in the picker — only when
  the current row already holds that value, so mostly unreachable, but the word "legacy" is a schema
  detail shown to a talent when it is.

## Coverage

**Read in full or in the parts that carry strings/logic:**
`client/src/shared/constants/frameTaxonomy.js`, `talentNav.js`, `packageIntelligence.js`;
`client/src/domains/talent/components/` — `MediaWorkspace.jsx`, `CompCard.jsx`, `CompCardGate.jsx`,
`CompCardStatsNudge.jsx` + `compCardStatsNudgeHelpers.js`, `FrameEditor.jsx`,
`DigitalsContactSheet.jsx`, `DigitalsFreshness.jsx`, `ClassificationReviewStrip.jsx`,
`CompCardImport/CompCardImport.jsx`, `profileReadinessItems.js`;
`client/src/shared/components/frame/*`; `client/src/shared/utils/talentAge.js`,
`profileReadinessImages.js` (slots); `client/src/domains/talent/pages/MediaPage/index.jsx`.
`src/domains/pdf/` — `routes/pdf.js` (composed/standard/legacy render paths, digitals sheet, forensics,
archetype), `generator.js` (`loadProfile`, machine-readable wiring), `comp-card-selector.js`,
`composition/stats-formatter.js`, `composition-director.js`, `composition/index.js` (guardrail extras),
`composition/photo-intelligence.js` (role + recency), `composition/editions.js`, `composition/directions.js`,
`guardrails.js`, `machine-readable.js`, `templates/compcard-composed.ejs`, `compcard-standard.ejs`,
`digitals-sheet.ejs`, and `compcard.ejs` (scanned).
`src/domains/ai/` — `describe-photo.js`, `classify-portfolio-image.js`, `comp-card-vision.js`,
`analyzeProfileImage.js`, `embeddings.js` (flatten/index functions).
`src/domains/wallet/` — `services/pass-content.js` (full), `pass-config.js`, `face-locator.js` (header),
`pass-artwork.js` / `pass-builder.js` (string scan), `routes/talent-wallet.js`.
`views/portfolio/show.ejs`, `views/portfolio-pro.ejs`, `src/routes/portfolio.js` (render + age band + image query).
`src/shared/lib/talent-age.js`, `src/shared/lib/stats-formatter.js` (`buildCanonicalStats`),
`src/domains/talent/services/digitals-freshness.js`, `src/domains/talent/services/representations.js`
(status/source model), `src/domains/talent/routes/settings.js:60-110` (AI consent disclosures),
`src/domains/talent/routes/media.js:165-200` (AI trigger).

**Skipped and why:**
- `src/domains/pdf/composition/` layout/typography internals (`layout-solver.js`, `crop-engine.js`,
  `font-library.js`, `type-safety.js`, `grid-catalog.js`, `perception/*`, `art-director.js`,
  `design-language.js`, `back-program/`, `front-program/`) — geometry and rendering, no user-facing
  strings beyond the edition/direction labels already covered.
- `src/domains/pdf/__tests__/*` — tests, not product surface.
- `RegistryPreflight.jsx` / `src/domains/spec-registry/**` — surface-map group 30, another lane.
- `BioWriter/` — bio generation, adjacent to group 5 (Profile), not a materials artefact.
- `client/src/domains/agency/components/dossier/*` (`TheBook.jsx`, `DigitalsSet.jsx`) — agency-side
  rendering of the same objects; surface-map group 17, another lane. Noted only that
  `DigitalsContactSheet` and `DigitalsSet` share `DIGITALS_SLOTS` predicates.
- `.claude/skills/**`, `docs/audits/**`, `tasks/**`, `DESIGN.md`, `CLAUDE.md` — excluded per brief
  Hard Rule 1. (`tasks/comp-card-composition-spec.md` is cited in a code comment; not opened.)
