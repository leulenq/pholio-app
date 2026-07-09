# Comp Card Editions — living design system spec (v7)

Date: 2026-07-09 · Status: architecture locked after internal debate; implementing
Supersedes: v6 draft (same file, earlier revision) and extends
tasks/comp-card-atelier-spec.md / docs/comp-card-frontpage-intelligence-proposal.md.

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

---

## The catalog (v7 launch set — 8 editions)

| id | label | front structure | image hierarchy | type culture | paper | ornament | back program | needs |
|----|-------|-----------------|-----------------|--------------|-------|----------|--------------|-------|
| `house-classic` | The Standard | photo-dominant / matted | 1 hero | band 20–38pt, inline/contrast | auto whites | none | uniform-grid, feature-column/row, mosaic · stats column/strip | — |
| `gallery-monograph` | The Monograph | matted, deep asymmetric mats (hero ≥42%) | 1 hero | 15–22pt, wide tracking, initial-line/inline | ivory | keyline, folio | restrained-duo, feature-column (airy, centered name) · stats footline | ≥3 imgs |
| `editorial-masthead` | The Cover | masthead band above hero | 1 hero | 40–76pt masthead, stacked/contrast | auto | folio | feature-row, editorial-stagger · stats strip | — |
| `swiss-modernist` | The Grid | column-grid: hero + paper rail | 1 hero | 18–30pt or spine, flush-left | pure white | hairline rules, folio | uniform-grid, filmstrip (ruled, tabular stats) | — |
| `cover-story` | The Cover Story | type-behind-figure interlock | 1 hero + matte layers | 56–110pt stacked behind subject | auto | none | feature-column, mosaic · stats column | alpha matte |
| `ink-noir` | The Night Edition | photo-dominant-dark / dark gallery mat | 1 hero | 22–40pt reversed | ink field (hero-pulled ≥7:1) | none | feature-column, restrained-duo (reversed) · stats column | not kids |
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

## Phases

1. **Core (this pass)** — catalog + resolver + language/front/back/director
   threading + template IR + tests. Editions on by default in the composed
   engine.
2. **Surface** — dashboard edition rail (chips with availability + tone
   lines), edition cycling pass-through, preset persistence UI, seed-sweep
   visual verification (Puppeteer screenshots per edition).
3. **Print/format** — A5 via page-dimension parameterization; PDF/X-CMYK
   post-pass; per-edition paper-stock guidance copy.

## Non-goals

- No photo manipulation (duotone/filters/retouch) — industry rule, ever.
- No AI-generated imagery.
- Digitals sheet unchanged (separate artifact with opposite rules).
