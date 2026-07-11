# Comp Card Editions — living design system spec (v9 design record)

Date: 2026-07-09 · Status: design record. Superseded for execution by
tasks/comp-card-editions-implementation-plan.md (v10), which folds in the
independent five-agent red team (tasks/comp-card-editions-redteam.md).
Where this document and the implementation plan disagree, the plan wins.
Architecture revised after the v8 panel review (Round 6) and the v9 working
session + red team (Round 7).
Supersedes: v6/v7 drafts (same file, earlier revisions) and extends
tasks/comp-card-atelier-spec.md / docs/comp-card-frontpage-intelligence-proposal.md.

## Approval summary (what signing off on this plan means)

1. **Editions** become the top-level creative unit: 9 named art directions
   (catalog below), each owning composition, image hierarchy, typography,
   palette, ornament, back program, and suitability. Talent data *ranks*,
   the seed *draws*, avoid-history (depth 2–3) guarantees cycling.
2. **Variety is contract-tested**: pairwise distinctness matrix (≥3 of 6
   axes), within-edition quintile spread, minimum consecutive-take
   distance, first-draw distribution bounds (no edition >30% / <4%).
3. **The global aesthetics scorer is replaced** by per-edition objectives
   (§7.1) with non-tradable Booker's-law vetoes; the vision jury uses the
   same rubric.
4. **Per-edition hero preference** draws among the top 3 ranked images
   within the existing clamp; the Diptych picks a pair.
5. **Typography is edition property**: voice pools under an overlap budget
   (§7.4, incl. new clean-modern voice; Cormorant replaces Playfair in
   editorial-serif), variable width/optical axes, size-tracking curves,
   tabular numerals, stacked-caps leading rules.
6. **CardIR v1** (§7.5) with verification-stamped on-photo type; renderer
   stays HTML/Puppeteer (alternatives evaluated and rejected, Round 5).
7. **Gallery-first build order** (§7.6) and matte precompute at upload are
   phase-0 prerequisites.
8. **Product surface** (Round 8): two-gesture UX (New direction / Another
   take of this), edition rail with real availability, no new monetization
   gates at launch (flagged as an open business decision).
9. **Rollout**: staged behind an env flag with the existing legacy
   escape hatch; frozen saved cards render from their frozen plan_json
   (already guaranteed by the freeze migration); presets gain a nullable
   `edition` column; ENGINE_VERSION → composed-v6.0.
10. **Never**: photo manipulation, AI imagery, fake small caps, ornament
    that isn't information-bearing, stats over imagery, shuffled stat
    order, or relaxation of face/contrast/crop verification.

Open decisions for the owner: (a) monetization of the catalog (recommend:
no new gates at launch, revisit with telemetry); (b) sign-off to begin
phase 0.

## Problem

The composed engine (v5) is sophisticated but converges. For one talent,
every "take" lands at nearly the same design point:

1. **The tone vector is talent-derived and deterministic** (±0.05 jitter).
   Same talent ⇒ same formality/energy/warmth ⇒ same voice neighborhood,
   same type register, same structure probabilities — forever.
2. **The palette is hard-locked**: three whites, near-black ink, one muted
   accent (sat ≤ 0.38). Every card is a white card.
3. **The front is one idea** — hero photo + name — expressed as four nearby
   structures (photo-dominant / matted / split / cutout). All five name
   "treatments" are choreography of the same band. Classic name size is
   clamped 17–34pt, so type never carries a card.
4. **The aesthetics scorer rewards the same qualities every draw**, so the
   K-candidate pick converges.

Net effect (user report): "generating another card mostly changes text
positioning."

## Thesis

Variety cannot come from jittering parameters inside one aesthetic. It has
to come from **changing the creative program itself**. We introduce
**Editions** — a catalog of complete, named art directions. Talent data
stops *determining* the design point and instead *ranks* edition weights;
the seed draws among suitable editions; "another take" cycles to a
different edition by contract.

Two-layer variety model:

- **Edition (macro)** — the creative program: composition logic, image
  hierarchy, typography behavior, palette program, negative-space strategy,
  ornament grammar, editorial tone, back-page program, suitability.
- **Take (micro)** — a seeded instance inside an edition's parametric
  ranges (mat depths, ratios, lockups, scale, alignment). An edition is a
  design language; a take is an utterance in it.

---

## The debate (assumptions challenged before locking)

### Round 1 — The Booker's audit (industry credibility)

The comp card is a **working tool**: a casting director flips a stack of
fifty and each card gets two seconds — face → name → stats → agency. Art
direction that taxes that scan costs bookings. Findings against the v6
draft catalog:

- **`contact-sheet` front: KILLED.** A front styled as a proof sheet with
  index numerals blurs the comp card with **digitals** — two artifacts with
  opposite rules (standards §3). A card that reads "unfinished work" is a
  credibility tell, and Pholio already ships a digitals sheet. The indexed,
  high-density language survives only as a **back style** (Z-card
  tradition: dense back grids are real).
- **`poster-type` (type owns the page, photo inset): REDESIGNED.** A front
  where type displaces the face is a portfolio cover, not a comp card —
  bookers buy the face. Replaced by **`cover-story`**: name at display
  scale **interlocked with the figure** (type layered behind the subject
  via the alpha matte, magazine-cover style). The face stays dominant; the
  type is spectacular. **Matte-gated** — the engine refuses to fake the
  layering, exactly like `studio-cutout`.
- **`ink-noir`: KEPT, weighted low, never default.** Dark cards are real
  (edgy editorial boards, fitness) but bookers write on cards and white
  space is functional; noir must be an intentional pick or a rare draw,
  vetoed for kids, and boosted only when the hero's measured pixels are
  dark/studio (photo affinity, Round 4).
- **Universal front invariants — "the Booker's law" — added** (enforced by
  validators for every edition, no exceptions):
  1. The face is unobstructed (existing face-zone machinery).
  2. The name is contrast-verified and never renders below 14pt effective.
  3. The hero occupies ≥ 50% of the page (≥ 42% for deep-mat monograph;
     for cutout/cover-story the matte figure substitutes).
  4. Stats appear on the front only under the existing researched rule.
  5. Representation/booking block always ships on the back.
- **Dual-unit stats confirmed already correct** (stats-formatter: dual
  cm/imperial, US/EU shoe & dress, suit-length letters). No change.
- **Division affinity**: a board-conditioned card (Runway/Commercial/…)
  already nudges tone; editions additionally carry board affinities in
  their weights (kids → warm editions; runway → monograph/masthead/noir).

### Round 2 — Are the layout families *truly* distinct?

Test: any two editions must differ on **≥ 3 of 6 axes** — field structure,
image count/hierarchy, type scale culture, palette, ornament grammar, back
chrome. The v6 draft failed this in one pair (house-classic vs ink-noir
differed only by palette + weights). Fix: noir's matted variant sets the
hero **on a dark field with a gallery mat** (structure parameter change),
its back is reversed with a different stats style, and its voice pool
skews hairline/didone — now 4 axes apart from house-classic. The
distinctness matrix lives in the test suite (`editions.test.js`) as a
computed assertion over the catalog, so **adding a lazy edition fails CI**.
That is the anti-collapse mechanism the current system lacks.

### Round 3 — Is the typography logic sophisticated enough?

Current logic solves size-to-fit and samples tracking. That is fitting,
not typography. Additions:

- **Lockup grammar** — a small vocabulary of name lockups, each a real
  art-direction pattern with its own solving rules; editions carry a
  lockup pool, takes draw within it:
  - `inline` — one line, solved span (today's behavior).
  - `stacked` — word-per-line, ragged or flush; poster/masthead scale.
  - `contrast` — first name display / surname grotesque caps (exists as
    split lockup; promoted to a first-class lockup usable on paper too).
  - `spine` — vertical rail (exists; owned by swiss-modernist).
  - `initial-line` — surname preceded by a hairline rule + tracked-out
    first name (monograph caption culture).
- **Numerals**: stats set in **tabular numerals** (`font-variant-numeric:
  tabular-nums`) everywhere; monograph may use oldstyle in captions.
- **Optical sizes**: Fraunces and Bodoni Moda are variable optical-size
  fonts on Google Fonts — request `opsz` axis and set display cuts at
  display sizes so masthead/cover-story type is genuinely display-cut,
  not scaled text.
- **Tracking as culture, not noise**: each edition sets a tracking bias
  applied inside the voice's bounds (monograph tracks wide at small sizes;
  cover-story tracks tight at display sizes — optically correct in both).
- Existing measured-glyph solving, stacking degrade, and fit-guard stay —
  they are the reason nothing clips.

### Round 4 — Can the architecture scale without collapsing?

- **Edition = declarative sheet + shared verified builders.** New editions
  are catalog entries choosing among structure builders, lockups, palette
  programs, ornament passes, and back styles — they add no new safety
  code. The verification layer (face, contrast, crop, occupancy, fit) is
  shared and non-optional, so catalog growth cannot erode safety.
- **Photo affinity**: edition weights multiply by a `photoAffinity(ctx)`
  reading the hero's forensics (luma key, palette saturation, studio vs
  location, headroom) and pool shape (pairable portrait for duet, alpha
  matte for cutout/cover-story). The system picks editions the
  *photographs can carry* — this is what "intelligently art directed"
  means operationally.
- **Cycling contract**: `avoidEditions` (previous take) is honored unless
  it empties the suitable set. Client passes the last edition id back the
  same way it passes avoidVoice today. Saved cards persist edition id;
  ENGINE_VERSION bumps to `composed-v6.0`.
- **CardIR**: the composition output is formalized as a documented
  intermediate representation — per-page `{ background, elements[] }` with
  typed elements (`photo{imageId,crop}`, `name{lockup,…}`, `band`, `rule`,
  `folio`, `index`, `contact`, `statStrip`) — one renderer consumes it.
  Editions never touch HTML.

### Round 5 — Rendering engine (alternatives honestly weighed)

Considered: **Typst** (fast native typesetting; rejected — loses
browser-preview/print parity, redoes glyph-metric infra, new toolchain),
**Satori/vercel-og** (rejected — flexbox subset, no vertical writing mode,
no `document.fonts` fidelity), **@react-pdf/renderer** (rejected — weaker
font features/optical sizes, duplicate layout math), **LaTeX** (rejected —
toolchain weight, poor image-crop control). **Decision: keep HTML/CSS +
Puppeteer** — it is the only option where the dashboard preview and the
printed PDF are the same rendering, `document.fonts.ready` + the fit
guard give measured self-healing, and the crop/scrim/contrast infra is
already proven. The upgrade is the **IR above the renderer**, not the
renderer itself. (Future, phase 3: PDF/X + CMYK via ghostscript post-pass;
**A5 format** via page-dimension parameterization of the builders — the IR
already carries inches, so this is a constant-threading job, not a
redesign.)

### Round 6 — The panel review (v8 deltas)

A five-seat review (creative director / booker / engineer / typographer /
product) interrogated v7 before implementation. Verdicts, each a binding
change to this spec:

1. **Editions confirmed over a continuous style space.** The steelman
   alternative (style embedding + repulsion sampling) was rejected —
   interpolated styles are compromises, not directions; unnameable styles
   can't be pinned, saved, or QA'd. But the repulsion idea is adopted
   inside the resolver: **avoid-history depth 2–3** (edition + voice +
   structure of the previous takes), not just the last edition — otherwise
   takes ping-pong A→B→A→B.
2. **Catalog: add `fresh-commercial` (9 editions).** The v7 catalog skewed
   editorial while commercial talent is most of the market. Title-case
   name culture (modern-warm / editorial-serif voices), warm paper,
   brighter verified accent, smile-forward hero, clean bright back with
   strip stats. **Kids is a gating profile, not an edition**: restricted
   draw pool (house-classic, fresh-commercial, duet, studio-cutout) plus
   the existing guardian-contact and tone clamps.
3. **Matte precompute is a launch prerequisite.** Two editions are
   matte-gated; if mattes are computed lazily most users never see them.
   Mattes are computed at upload for eligible (studio-classified) frames;
   `?editions=1` reports real availability.
4. **`ink-noir` must be structurally dark, not a palette swap**: gallery
   mat on a night field, hairline gold keyline, reversed footline — it must
   pass the 3-of-6 distinctness matrix against house-classic on structure
   and ornament, not just palette.
5. **The global aesthetics scorer is a centralizing force and is replaced
   by per-edition scoring objectives.** The current scorer (name near
   bottom-center, hero-led coverage) is a root cause of today's
   convergence; if editions share it, editions converge too. Each edition
   scores its candidates against its own objectives (mat proportion and
   caption discipline for the Monograph; type presence for the Poster;
   grid adherence for Swiss; interlock quality for Cover Story).
6. **Micro-variety becomes a tested invariant.** Every edition documents
   its internal variation axes (mat depth, hero scale, lockup, alignment,
   accent presence …) and the suite asserts (a) signature spread across
   seeds *within* each edition and (b) a minimum composite-signature
   distance between *consecutive* takes (edition, structure, lockup,
   voice, palette, stats style).
7. **Typography is promoted to a first-class edition property.** Per
   edition: case, variable **width axis** (Archivo wdth 62–125 —
   condensed masthead vs extended rail), **optical size axes** (Fraunces,
   Bodoni Moda opsz for true display cuts), weight, stacked-caps negative
   leading (0.92–0.98), `tabular-nums` stats, no synthesized small caps,
   and a **size-tracking curve** (tracking tightens as size grows) instead
   of sampled tracking noise. **Cormorant Garamond replaces Playfair
   Display in the editorial-serif voice** (Canva-ubiquity risk); Playfair
   remains only as a fallback family. Glyph-metric infra must measure or
   calibrate per-axis instances before width axes ship.
8. **Back chrome variants are edition identity; hierarchy is inviolable.**
   Stats scannable at a glance, dual-unit, never over an image; roles
   (name/stats/booking/wordmark) mandatory. Chrome varies per edition
   (centered name + stats footline; ruled tabular stats; reversed noir;
   indexed cells on dense backs). Ornament must be information-bearing and
   foot-anchored — a folio above the name is the banned eyebrow pattern.
9. **Gallery-first build order.** Before any edition ships, build the
   review rig: N seeds × editions rendered to a screenshot grid (HTML
   plan-render first, Puppeteer screenshots second). Every subsequent
   design decision is reviewed against artifacts, not imagination. The
   back renderer is extended (style flags), not rebuilt, in phase 1.
10. **Persistence contract.** Frozen saved cards pin `edition` +
    `ENGINE_VERSION composed-v6.0` and never re-resolve; legacy presets
    (no edition) render byte-identically on the old path.

### Round 7 — Working session: the concrete machinery (v9)

Panel verdicts 5–6 named per-edition scoring and tested micro-variety but
did not define them. This round defines them, specifies the CardIR and the
gallery rig, and closes with a red-team pass.

#### 7.1 Scoring framework

`score(candidate) = Σ editionObjectives + Σ universalSoft`, after hard
vetoes. Vetoes are never traded against score:

- **Hard vetoes (Booker's law + print)**: face obstruction; unverified
  on-photo type; name below 14pt effective; hero below the edition's area
  floor; text inside the 0.25in safe zone (non-bleeding); missing stats/
  booking roles on the back.
- **Universal soft (small weights, shared)**: edge alignment among text
  elements; breathing (minimum gaps); *sloppy-tension penalty* — two
  elements almost aligned (within 0.05in but not equal) score worse than
  clearly aligned or clearly free.

**Per-edition objectives** (each measurable from the program + forensics):

| edition | objectives (targets) |
|---|---|
| house-classic | hero coverage 0.78–0.92 · name band height 8–12% of page · name aligned to hero edge or centered · element count ≤ 6 |
| fresh-commercial | hero coverage 0.75–0.9 · title-case name discipline · accent restricted to micro-elements · brightness: paper + strip stats, no dark bands |
| gallery-monograph | photo area 0.42–0.6 · bottom mat ≥ 1.4× top mat · left/right mat asymmetry ratio 1.2–2.2 · name ≤ 22pt with tracking ≥ 0.2em · one text cluster + folio only · whitespace fraction 0.35–0.5 |
| editorial-masthead | name spans ≥ 0.86 page width · masthead band 12–20% of page height · seam tension: gap masthead↔hero ≤ 0.12in · hero coverage ≥ 0.6 |
| swiss-modernist | grid adherence: every element edge within 0.02in of the module grid · rail utilization: spine/name spans ≥ 0.6 of rail height · 1–3 rules, all on grid lines |
| cover-story | interlock depth: 0.12–0.4 of name glyph area behind the subject matte · name area ≥ 0.18 of page · face fully clear (veto) |
| ink-noir | all type ≥ 7:1 on the field (veto below 4.5) · element count ≤ 5 · field tone within ΔL 0.15 of the hero's shadow tone · keyline present |
| duet | cell area ratio 0.85–1.18 · shared top/baseline within 0.02in · aspect complementarity (one tight portrait, one full-length) |
| studio-cutout | matte bbox inset ≥ 0.25in from plane edges (except intentional bleed) · name-rect subject overlap ≤ 0.05 · plane-tone contrast verified |

The vision jury (Puppeteer rasterize + rank) receives the same per-edition
objectives in its rubric — an edition-blind jury would re-centralize taste
exactly like the old scorer.

#### 7.2 Internal variation axes (tested spread)

Per edition, the axes a take samples; the suite asserts that 12 seeds hit
≥ 3 distinct quintiles on every axis (no silent clustering):

- **house-classic** — hero treatment (full-bleed/bordered) · band position ·
  align · choreography (classic/straddle/over/band/inset) · back
  architecture (4) · stats side.
- **fresh-commercial** — full-bleed vs bordered · accent micro-usage on/off ·
  name weight · back (uniform/feature-row) · stats strip position.
- **gallery-monograph** — bottom-mat depth 1.4–2.2in · asymmetry direction ·
  keyline on/off · folio corner · lockup (initial-line/inline) · back
  (duo/feature-column).
- **editorial-masthead** — stacked vs single-line masthead · span 0.86–1.0 ·
  hero crop tightness · folio on/off · back (feature-row/stagger/uniform).
- **swiss-modernist** — rail side · rail width 1.1–1.6in · spine vs
  horizontal name · module count (6/8/12) · rule count 1–3 · back
  (uniform/filmstrip).
- **cover-story** — interlock depth (shallow/deep) · stacked vs single ·
  size within 56–110pt · baseline position vs figure · back pool (3).
- **ink-noir** — field tone (house/hero-pulled) · mat vs full-bleed ·
  keyline treatment · voice (3) · stats (column/reversed footline).
- **duet** — hinge orientation (vertical 85% / horizontal 15%) · gutter
  width · name across hinge vs beneath · cell ratio · back pool (3).
- **studio-cutout** — plane tone (paper/palette-pulled) · figure scale ·
  type anchor zone (4) · stacked vs inline.

#### 7.3 Per-edition hero preference (red-team fix R1)

Hero selection today is one deterministic ranking → every edition fronts
the same photograph, which flattens perceived variety more than any layout
choice. Change: the edition may draw its hero **among the top 3 images
within the existing ±15-point clamp**, biased by an edition shot-type
preference (monograph → editorial three-quarter/full; fresh-commercial →
approachable headshot; duet → the best *pair*; cover-story/cutout → the
best *matted* frame). Locks and overrides still win; the clamp never
relaxes.

#### 7.4 Voice-pool overlap budget (red-team fix R2)

If one voice appears in most pools, editions sound alike. Budget: **a
voice may appear in at most 3 edition pools; every edition keeps ≥ 2
voices.** Assignment (with `clean-modern` added: Manrope display, Inter
body, title case — the commercial register):

| voice | editions |
|---|---|
| stark-grotesque | swiss, ink-noir, cover-story |
| bold-grotesque | swiss, studio-cutout, cover-story |
| editorial-serif (Cormorant) | house-classic, masthead, duet |
| quiet-classic | house-classic, monograph, duet |
| romantic-didone | monograph, masthead, ink-noir |
| hairline-fashion | monograph, ink-noir |
| modern-warm | duet, studio-cutout, fresh-commercial |
| clean-modern (new) | fresh-commercial |

Budget is a catalog test, so future editions can't silently re-crowd a
favorite voice.

#### 7.5 CardIR v1 (renderer contract)

```
CardIR := { pageW, pageH, bleed, pages: [Page, Page] }
Page    := { role: 'front'|'back', background: hex, elements: Element[] }
Element := common { rect(in), z, bleedEdges? } +
  photo     { imageId, crop { fit, objectPosition }, isCutout?, matteSrc? }
  plane     { fill }
  band      { fill, opacity? }
  rule      { axis: 'h'|'v'|'frame', weight, color }
  text      { role: 'name'|'name-part'|'contact'|'stat'|'folio'|'index'
              |'wordmark', content, font { family, weight, wdth?, opsz? },
              sizePt, trackingEm, leading, case, color, align, orientation,
              opacity?, numeric?: 'tabular' }
  statBlock { style: 'column'|'strip'|'tabular'|'footline', lines[] }
  scrim     { edge, direction, strength }
```

Rules: photos are never filtered; any element over a photo carries a
**verification stamp** (`verify: { contrast, faceClear, occupancy }`)
written by the composer — the renderer refuses unstamped on-photo type, so
safety is auditable in the IR itself. Phase 1 keeps the back's role-based
layout (cells + statBlock + chrome flags); full back-IR is phase 2.

#### 7.6 Gallery rig (phase 0)

`scripts/comp-card-gallery.js`: three synthetic fixture profiles
(editorial woman / commercial man / teen for the kids pool), seeded
forensics + seed-data images, `composeCompCard` across editions × 6 seeds,
rendered through the real EJS template with vendored fonts (no network),
emitted as `gallery/index.html` (grid of iframes at card aspect) plus an
optional Puppeteer contact-sheet PNG. Committed as a repo artifact per
review round; CI job regenerates and diffs plan JSON so unreviewed drift
fails loudly.

#### 7.7 Red team — remaining convergence paths and their answers

- **R1 same hero every take** → per-edition hero preference (7.3).
- **R2 voice-pool crowding** → overlap budget (7.4).
- **R3 identical stats block on every back** → statsStyle variants change
  the *setting*; the canonical stat ORDER never shuffles (booker:
  scannability beats novelty). Accepted as intentionally stable.
- **R4 avoid-history lost on reload** → the dashboard passes history, but
  the server also persists the last take's composite signature per profile
  (lightweight column on comp_card_presets or profile meta) so cycling
  survives sessions. Phase 2.
- **R5 crop feel identical (face-centered everywhere)** → inherent to
  safety; variety must come from hero scale/mat/structure, not crop risk.
  Accepted.
- **R6 catalog favorite dominates first impressions** → distribution test:
  over ~200 synthetic (talent, seed) pairs, no edition takes > 30% or
  < 4% share of first draws.
- **R7 edition-blind vision jury re-centralizes taste** → jury rubric is
  edition-aware (7.1).
- **R8 within-edition clustering** → quintile spread tests (7.2).

### Round 8 — Product surface, gating, rollout (final planning round)

**Two-gesture UX.** The dashboard's single "Another take" gesture conflates
two intents. It splits:

- **"New direction"** (primary) — cycles to a different edition via the
  resolver with avoid-history; the header line names what you got: *"The
  Monograph — set in Hairline Fashion."* Editions are the unit of surprise.
- **"Another take of this"** (secondary, appears once a direction exists) —
  re-seeds *within* the pinned edition; internal axes (§7.2) carry the
  variation. Editions are also the unit of refinement.

The PM/CD dispute on the rail (nine chips = choice paralysis vs. the
catalog as a browsable asset) resolved: the default flow never requires a
choice (Pholio resolves an edition and says which); the **edition rail**
is a horizontally scrollable row for the opinionated, with real
availability states and honest unlock copy ("The Cutout needs a clean
studio frame" / "The Cover Story unlocks with a studio frame" /
"The Night Edition isn't offered for kids' cards"). Treatment chips
render only for `treatmentsOpen` editions. Legacy direction chips map:
full-bleed → house-classic pin, gallery-mat → gallery-monograph,
studio-cutout → studio-cutout; split-field retires from the UI (the split
structure remains internal to house-classic sampling; legacy presets
naming it keep rendering on their frozen path).

**Naming collision fixed** (CD): `editorial-masthead` is talent-labeled
**"The Masthead"** (was "The Cover" — too close to "The Cover Story").

**Gating.** Engineering and product agreed the variety itself is the
acquisition hook; the booker warned against paywalling credibility (a
talent whose only affordable card looks "free-tier" is worse for the
brand than no gate). **Recommendation: no new monetization gates at
launch** — the full catalog previews for everyone under the existing
non-pro watermark rules; revisit with usage telemetry. Flagged as an open
business decision for the owner, not locked by this spec.

**Rollout/migration.**
- `comp_card_presets` gains nullable `edition` (string 32); frozen cards
  already render from frozen `plan_json` + `engine_version` (the
  2026-07-05 freeze migration), so historical cards are untouched by
  construction.
- Staged rollout behind `COMP_CARD_EDITIONS` env flag with per-request
  `?editions=0/1` override for QA; the existing `?front=legacy` escape
  hatch stays. Default flips on after the phase-0 gallery review.
- Server persists the last take's composite signature per profile (R4) in
  phase 2; until then the client-supplied avoid-history governs cycling.

---

## The catalog (v9 launch set — 9 editions)

(Voice pools follow the overlap budget in §7.4; the prototype catalog in
`src/domains/pdf/composition/editions.js` predates Rounds 6–7 and is
updated during phase 1, not authoritative.)

| id | label | front structure | image hierarchy | type culture | paper | ornament | back program | needs |
|----|-------|-----------------|-----------------|--------------|-------|----------|--------------|-------|
| `house-classic` | The Standard | photo-dominant / matted | 1 hero | band 20–38pt, inline/contrast | auto whites | none | uniform-grid, feature-column/row, mosaic · stats column/strip | — |
| `fresh-commercial` | The Commercial | photo-dominant (smile-forward hero) | 1 hero | 20–32pt title case | warm | none | uniform-grid, feature-row (bright, strip stats) | — |
| `gallery-monograph` | The Monograph | matted, deep asymmetric mats (hero ≥42%) | 1 hero | 15–22pt, wide tracking, initial-line/inline | ivory | keyline, folio | restrained-duo, feature-column (airy, centered name) · stats footline | ≥3 imgs |
| `editorial-masthead` | The Masthead | masthead band above hero | 1 hero | 40–76pt masthead, stacked/contrast | auto | folio | feature-row, editorial-stagger · stats strip | — |
| `swiss-modernist` | The Grid | column-grid: hero + paper rail | 1 hero | 18–30pt or spine, flush-left | pure white | hairline rules, folio | uniform-grid, filmstrip (ruled, tabular stats) | — |
| `cover-story` | The Cover Story | type-behind-figure interlock | 1 hero + matte layers | 56–110pt stacked behind subject | auto | none | feature-column, mosaic · stats column | alpha matte |
| `ink-noir` | The Night Edition | dark gallery mat / photo-dominant-dark | 1 hero on night field | 22–40pt reversed | ink field (hero-pulled ≥7:1) | hairline gold keyline, reversed footline | feature-column, restrained-duo (reversed) · stats column | not kids |
| `duet` | The Diptych | diptych hinge (headshot + full-length) | 2 paired frames | 18–30pt across hinge | auto | hinge rule | restrained-duo, feature-row · stats strip | pairable support |
| `studio-cutout` | The Cutout | cutout on palette plane | 1 matted figure | 24–44pt in negative space | plane-pulled | none | uniform-grid, feature-column · stats column | alpha matte |

Voice pools per edition as in the catalog module (each drawn from the
existing font library; voice cast stays tone+seed **within the pool**,
avoiding the previous take's voice).

Suitability gates are honest capabilities (pool size, alpha matte,
pairable aspects, kids), never taste; taste enters only as weights
(tone × board × photo affinity, floored at 0.35 so nothing suitable is
ever eliminated).

## Integration map

- `composition/editions.js` — catalog, resolver (`resolveEdition`),
  palette programs (`resolveEditionPalette`), photo-affinity hooks.
- `design-language.js` — accepts `edition`: palette program, voice pool,
  scale bounds, tracking bias. Kids clamps + verification unchanged.
- `front-program/synthesize.js` — new structure builders (`masthead`,
  `column-grid`, `cover-story`, `diptych`, deep-mat parameter,
  dark-field mat), lockup grammar, ornament pass, `supportPool` +
  `cropResolver` in ctx, photo elements carry `imageId`+`crop`.
- `back-program/synthesize.js` — `input.edition` restricts/weights the
  architecture pool; emits `style` (nameAlign, statsStyle:
  column|strip|tabular|footline, dividers, cellIndexes, airy, reversed).
- `composition-director.js` / `composition/index.js` — resolve edition
  once (seed + avoid + force + affinity), thread everywhere; plan gains
  `plan.edition = { id, label, tone }`; ENGINE_VERSION `composed-v6.0`.
- `routes/pdf.js` — `?edition=`, `?avoidEdition=`; `?editions=1` catalog
  extended with editions + availability; meta/headers carry edition;
  presets persist edition.
- `templates/compcard-composed.ejs` — CardIR rendering: per-page
  backgrounds, imageId photos, `rule`/`folio`/`index`/`statStrip`,
  dark-paper-aware watermark/empty-cell, back style rendering,
  `font-variant-numeric: tabular-nums` on stats, `opsz` in font URLs.
- Tests — `editions.test.js`: catalog integrity, **distinctness matrix
  (≥3 of 6 axes per pair)**, palette contrast (incl. ink-field ≥7:1),
  determinism, cycling guarantee, suitability gates, kids vetoes,
  cross-seed variety (24 seeds ⇒ ≥5 editions, ≥4 front structures),
  Booker's-law invariants on sampled programs. Existing suites stay
  green; tests pinning old constants are updated to the new contract.

## Phases (gallery-first order — panel verdict 9)

0. **Review rig + prerequisites** — the fixture gallery (N seeds ×
   editions → rendered grid, plan-level HTML first, Puppeteer screenshots
   second) and matte precompute at upload. No edition ships unreviewed.
1. **Core** — catalog + resolver (avoid-history depth 2–3) +
   language/front/back/director threading + per-edition scoring
   objectives + template IR extensions + test suite (distinctness matrix,
   within-edition spread, consecutive-take distance, Booker's-law
   invariants, palette contrast, determinism, kids pool gating).
   Editions on by default in the composed engine.
2. **Surface** — dashboard edition rail (chips with availability + tone
   lines), the two-gesture UX ("New direction" cycles editions; "Refine
   this direction" re-seeds within the pinned edition), preset
   persistence, seed-sweep visual verification.
3. **Type depth** — variable width/optical axes + per-axis glyph metrics,
   size-tracking curves, Cormorant swap.
4. **Print/format** — A5 via page-dimension parameterization; PDF/X-CMYK
   post-pass; per-edition paper-stock guidance copy.

## Non-goals

- No photo manipulation (duotone/filters/retouch) — industry rule, ever.
- No AI-generated imagery.
- Digitals sheet unchanged (separate artifact with opposite rules).
