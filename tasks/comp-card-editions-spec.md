# Comp Card Editions — living design system spec (v8)

Date: 2026-07-09 · Status: PLAN ONLY — implementation deliberately not started;
architecture revised after the v8 panel review (Round 6 below).
Supersedes: v6/v7 drafts (same file, earlier revisions) and extends
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

---

## The catalog (v8 launch set — 9 editions)

| id | label | front structure | image hierarchy | type culture | paper | ornament | back program | needs |
|----|-------|-----------------|-----------------|--------------|-------|----------|--------------|-------|
| `house-classic` | The Standard | photo-dominant / matted | 1 hero | band 20–38pt, inline/contrast | auto whites | none | uniform-grid, feature-column/row, mosaic · stats column/strip | — |
| `fresh-commercial` | The Commercial | photo-dominant (smile-forward hero) | 1 hero | 20–32pt title case | warm | none | uniform-grid, feature-row (bright, strip stats) | — |
| `gallery-monograph` | The Monograph | matted, deep asymmetric mats (hero ≥42%) | 1 hero | 15–22pt, wide tracking, initial-line/inline | ivory | keyline, folio | restrained-duo, feature-column (airy, centered name) · stats footline | ≥3 imgs |
| `editorial-masthead` | The Cover | masthead band above hero | 1 hero | 40–76pt masthead, stacked/contrast | auto | folio | feature-row, editorial-stagger · stats strip | — |
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
