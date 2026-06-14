# Comp Card Atelier Spec (composition engine v2)

Supersedes the *selection* layer of `tasks/comp-card-composition-spec.md`.
Module contracts there remain valid for stats-formatter, photo-intelligence,
crop-engine, ai-advisor. This spec replaces the enumerated design system
(layout families → grid catalog → tone enums → variant lists) with a
**parametric composition engine**: every visual parameter is derived from the
talent's actual data — image pixels, image geometry, category, archetype,
vision analysis — inside hard taste bounds. No reusable template skeletons.

## Why (user direction, binding)

- "Each comp card uniquely designed from the talent's actual data … increase
  the range of compositional outcomes substantially and stop relying on
  anything that reads like a reusable template family."
- Front page: usually cleaner and image-led; stats typically on the back
  unless the layout strongly justifies bringing them forward.
- A subtle Pholio wordmark-linked mechanism opens the talent's portfolio —
  more premium than a standard QR; NFC for print; any visible fallback must
  be minimally disruptive. New dependencies allowed (pdf-lib is installed).

## Research conclusions (validated)

1. **Stats placement.** Two-sided comp cards overwhelmingly keep the front to
   hero + name; stats live on the back with contact. The exception pattern is
   the show-package/single-card format (models.com style) where one tiny
   stat line sits under the photos. RULE: stats on back by default. A front
   stat line is allowed ONLY as a single hairline line (≤7pt, letterspaced)
   when ALL hold: high-formality register (high-fashion), the hero image has
   a strongly quiet bottom band, and the seeded draw selects it (P ≈ 0.15) —
   or an explicit override. Decision must be logged with justification.
2. **Digital link.** Headless Chromium emits NO link annotations in PDFs
   (verified empirically, Puppeteer 24.39 / tagged or not). pdf-lib 1.17.1
   post-processing works (verified: URI annotation persists reload; metadata
   set). So: the Pholio wordmark on the card becomes a clickable link via a
   pdf-lib pass after Puppeteer — zero visual addition — plus document
   metadata (Title "First Last — Comp Card", Author "Pholio", Subject
   portfolio URL).
3. **Print link.** Primary: NFC product workflow (NTAG213-class ultra-thin
   inlays carry an NDEF URL; iPhone XS+/modern Android read natively without
   an app) — physical add-on, nothing visible in the PDF. Visible fallback
   (opt-in `?print=1` only): a small dot-module QR in the back contact strip,
   INK-DARK ONLY (#1A1815 — light/gold codes fail scan contrast), version ≤2
   via short URL, ≥0.45in print size, 4-module quiet zone, ECC M.
4. **Short link.** `GET /p/:slug` → 302 `/portfolio/:slug` keeps QR small and
   gives a clean human-readable URL for OCR/Lens too.

## Existing modules you must reuse (do not modify unless your workstream owns them)

- `composition/stats-formatter.js` — buildStatsBlock (unchanged)
- `composition/photo-intelligence.js` — analyzeImagePool (unchanged)
- `composition/crop-engine.js` — resolveCrop / assignImagesToSlots /
  computeFocalPoint (unchanged; the solver calls resolveCrop for safety)
- `composition/ai-advisor.js` — getCompositionAdvice (unchanged)
- `composition/grid-catalog.js` + current director behavior — retained as the
  degraded fallback path only (forensics/solver unavailable ⇒ never fail).

## Page geometry

Page 5.5in × 8.5in. Inches are the canonical unit in every contract below;
the template renders absolute-positioned elements with CSS `in` units inside
`.comp-card-page`. Text safe zone 0.25in (images may bleed to the edge).
1in = 72 PDF points; PDF coordinate origin is bottom-left (pdf-lib pass must
convert from top-left CSS space).

---

## Module contracts

### A. `composition/image-forensics.js` (WS-F)

Measures actual image pixels. Sharp is lazy-required; every function is
fail-soft (null on any failure, never throws).

```js
async measureImage(input /* Buffer */) → Forensics|null
Forensics = {
  width, height, aspect,
  luma: { rows: 9, cols: 6, grid: number[9][6] /* 0..1, row-major, top→bottom */,
          mean, isDark /* mean < 0.42 */ },
  detail: { grid: number[9][6] /* local variance 0..1 normalized */ },
  quiet: { top: { score, bandRows }, bottom: {...}, left: { score, bandCols },
           right: {...} },   // quietness 0..1: low detail + uniform luma band
  palette: [{ hex, population /*0..1*/, sat /*0..1*/, luma /*0..1*/ }], // ≤5, population desc
  warmth: number /* -1 cool .. +1 warm, from mean channel balance */,
  saturation: number /*0..1*/, contrast: number /*0..1*/,
  version: 1,
}

async forensicsForImages(images, { fetchBuffer, timeoutMs = 2500, concurrency = 3 })
  → Map<imageId, Forensics|null>
// fetchBuffer(image) → Promise<Buffer|null> is supplied by the caller; this
// module never does IO routing itself. Respect per-image timeout via
// Promise.race; a slow/failed image yields null without delaying others.
```

Implementation guidance: one sharp pipeline per image — resize to 48×72
(fit fill), raw grayscale for luma+detail grids (downsample to 6×9 by block
averaging; detail = normalized block variance); 16×16 raw RGB for palette
(simple quantization: 3-bit/channel buckets, merge near colors) plus
`sharp.stats()` dominant as a candidate; warmth from mean R−B normalized.
Quiet bands: scan 2-row (or 2-col) bands from each edge; score = 1 −
(w₁·meanDetail + w₂·lumaSpread); report best contiguous band depth.
Tests generate fixture images WITH sharp (gradients, flat fields, noise,
half-dark/half-light splits) and assert grid orientation (top band of a
top-dark image reads dark), quiet detection, palette dominance, fail-soft on
garbage buffers; skip gracefully if sharp unavailable.

### B. `composition/layout-solver.js` (WS-G)

Generative geometry. Pure + deterministic (mulberry32 seed pattern from
crop-engine, copied locally with attribution). No DB, no sharp.

```js
solveFrontGeometry({
  pageW = 5.5, pageH = 8.5,
  heroAspect /* number|null */, heroForensics /* Forensics|null */,
  pacing /* 0.8..1.6 */, tone /* toneVector, see WS-H */, seed, salt,
}) → FrontGeometry = {
  hero: { x, y, w, h, bleedEdges: ['top','right',...] },  // inches, top-left origin
  nameBand: { x, y, w, h, onImage: bool, inkOn: 'light'|'dark' },
  contactBand: { x, y, w, h } | null,
  statLine: { x, y, w, h } | null,        // geometry slot only; director decides use
  wordmark: { x, y, w, h },               // small, bottom region, always present
  margins: { top, right, bottom, left },
  decisions: [{ aspect, choice, because }],
}
```
Front variation axes (all seeded, tone-biased, CONTINUOUS — no named modes):
hero coverage 0.78–1.0 of page (1.0 = full bleed; <1.0 floats the hero with
asymmetric margins); hero offset bias; name band chosen from the hero's
quiet bands when onImage (quiet score ≥ 0.55) else on paper above/below;
inkOn from band luma. Margins asymmetric: base 0.32–0.6in scaled by pacing,
with seeded left/right imbalance up to 1.6×.

```js
solveBackPartition({
  region /* {x,y,w,h} after margins */, images: [{ id, aspect, role, rawShotType }],
  stats: { side: 'auto'|'right'|'left'|'bottom', measureIn /* col 1.15–1.55 or band 0.9–1.3 */ },
  pacing, tone, seed, salt, cropEngine /* injected for safety scoring */,
}) → BackLayout = {
  cells: [{ x, y, w, h, imageId, crop /* from cropEngine.resolveCrop */, bleedEdges: [] }],
  statsBlock: { x, y, w, h, orientation: 'column'|'strip' },
  nameBlock: { x, y, w, h },
  contactBlock: { x, y, w, h },
  wordmark: { x, y, w, h },
  gutter, coverageRatio, decisions, warnings,
}
```
Algorithm (binding): seeded constrained recursive partition of the photo
region — split ratios sampled from {0.5, 0.382, 0.618, 0.4, 0.6} with ±0.03
jitter; split orientation chosen to fit remaining images' aspects; stop at
image count (3–5 photos; never more than 5); min cell short edge 1.05in;
gutters = pacing-scaled 0.06–0.16in. The stats block is carved as a real
partition member (right/left column or bottom band — seeded + tone-biased),
NOT a fixed chrome strip. Image→cell assignment minimizes aspect mismatch +
crop-unsafety (use cropEngine.resolveCrop; an 'unsafe' full-body assignment
is forbidden while alternatives exist; the true full-length image — raw
shot_type full_length/full_body — must receive the tallest cell). 0–2 cells
may bleed to page edges (seeded; denser tones bleed more). Photo coverage of
region ≥ 0.62. Hard validation in module: no cell overlap, all inside
region, determinism (same seed ⇒ deep-equal).

Both solvers export `toCssRect(rect)` helper → `{ left:'0.42in', top:.., width:.., height:.. }`.

Tests: determinism; image-count range 3/4/5; full-length → tallest cell;
overlap/bounds invariants across 50 seeded runs (property-style loop);
min-cell and coverage bounds; stats column vs band both reachable across
seeds; bleed edges only on page-adjacent cells.

### C. `composition/design-language.js` + director v2 + template v2 (WS-H)

```js
synthesizeDesignLanguage({ profile, archetype, castingAnalysis, statsBlock,
  poolAnalysis, forensicsById /* Map */, seed, advice }) → DesignLanguage = {
  toneVector: { formality, energy, warmth, density },  // each 0..1, CONTINUOUS
  typeScale: { ratio /* one of 1.2,1.25,1.333,1.414,1.5,1.618 */, basePt,
               name: pt, statValue: pt, statLabel: pt, contact: pt },
  name: { text, case: 'upper'|'title', weightClass: 300|400|500|600|700,
          trackingEm /* 0.02..0.42, inversely related to size */,
          targetSpan /* 0.52..0.92 of usable width */,
          rotation: 0 | -90 /* vertical spine, rare: P≤0.08, formality≥0.6 only */ },
  fonts: { display: 'Inter'|'Playfair Display'|'Noto Serif Display', body: 'Inter' },
  palette: { paper, ink, accent, rule },
  pacing: 0.8..1.6,
  statsPlacement: { page: 'back', frontLine: bool, justification },
  decisions, warnings,
}
```
- toneVector computed from archetype scores (runway/editorial → formality;
  commercial/lifestyle → warmth; fitness/athletic signals → energy; kids
  clamps formality ≤ 0.45 and warmth ≥ 0.6), castingAnalysis lookType text,
  and statsBlock.category. Continuous — never an enum lookup.
- palette: paper from {#FFFFFF, #FFFEFA, #FAF8F5} by hero warmth; ink fixed
  near-black range (#111111–#1A1815 by formality); accent derived from hero
  forensics palette: pick the most populous color, clamp saturation ≤ 0.38,
  darken until WCAG contrast vs paper ≥ 4.5:1; if no forensics or result
  reads muddy (sat < 0.06), fall back to brand gold #B8956A/#C9A55A by
  warmth. Accent usage stays restrained (rules, stat labels) — banned
  patterns still apply (no badges/chips/pills/eyebrows/glass).
- type scale ratio biased by formality (higher formality → larger ratio,
  fewer levels); name size computed so the set name at trackingEm spans
  targetSpan of the name band width (estimate glyph width ≈ 0.58em·size for
  Inter caps, 0.52em for serif title case — document constants); clamp
  17–34pt.
- statsPlacement: back default. frontLine=true ONLY under the researched
  rule (formality ≥ 0.7 AND hero bottom quiet ≥ 0.55 AND seeded draw < 0.15)
  or overrides.frontStats === true. When true the front renders ONE
  letterspaced line (height/bust/waist/hips/shoes compact inline form from
  statsBlock.inline), ≤ 7pt.
- advice (ai-advisor, may be null) can nudge toneVector axes by at most
  ±0.15 with a decision-log entry; everything else about advice handling
  stays as the director already does (hero clamp, etc.).

`composition-director.js` v2 — same export designComposition(input), extended
plan shape (downstream additive, never breaking):
```js
plan = {
  engine: 'composed', seedUsed, language: DesignLanguage,
  front: { imageId, crop, geometry: FrontGeometry, name: {...} },
  back: { layout: BackLayout, statsPlacement },
  wordmark: { href /* short URL filled by route */, frontRect, backRect /* inches */ },
  palette, typography /* kept, derived from language for template back-compat */,
  toneProfile /* kept: nearest label for telemetry only — MUST NOT drive design */,
  decisions, warnings,
}
```
Pipeline: forensics → language → solveFrontGeometry → solveBackPartition →
crops. Fallback chain (never fail a render): no forensics ⇒ heuristic quiet
bands by role; solver throw ⇒ legacy grid-catalog path (current code) with a
'fallback' decision logged.

Template `compcard-composed.ejs` v2: absolute-position rendering from
geometry (CSS `in` units), per-element styles from language (no fixed class
variants); wordmark lockup rendered at plan.wordmark rects on BOTH pages
(small, letterspaced "PHOLIO", accent or muted ink); optional ?print=1 QR
slot in the back contact region (WS-I supplies the SVG; template just
in-lines it when provided). Keep `.comp-card-page`, @page 5.5in 8.5in,
break-after, font loading, watermark-for-non-pro behaviors.

`composition/index.js`: accepts `forensicsById` (route supplies, may be
empty Map), passes through; composed route (renderComposedView) gains:
fetchBuffer wiring for forensics (local uploads via fs, http(s) via fetch
with 2.5s timeout, total budget ≤ 4s, cache result into images.metadata
best-effort UPDATE — failures ignored), response headers
`X-CompCard-Wordmark-Front`, `X-CompCard-Wordmark-Back` (`x,y,w,h` inches,
top-left origin) and `X-CompCard-Portfolio-Url`.

Update existing composition-director/integration tests for the extended
shape (WS-H owns those test updates); add design-language tests: toneVector
table, palette derivation incl. contrast clamp + muddy fallback, name size
math, front-stat-line rule (force with seeds/fixtures), determinism, range
breadth (≥ 8 distinct (typeRatio, paper, name placement, statsSide) tuples
across 12 seeds — proves the space isn't collapsing).

### D. `composition/portfolio-link.js` + wiring (WS-I)

```js
shortPortfolioUrl(profile, baseUrl) → `${baseUrl}/p/${profile.slug}`

async embedPortfolioLink(pdfBuffer, {
  url, title, author = 'Pholio', subject,
  wordmarks: [{ pageIndex, xIn, yIn, wIn, hIn }],  // top-left-origin inches
}) → Buffer
// pdf-lib: URI link annotation per wordmark (convert to PDF bottom-left
// coords: rectY = pageHpt − (yIn+hIn)*72), Border [0,0,0]; set Title/Author/
// Subject. Fail-soft: any error → return ORIGINAL buffer unchanged.

async buildSubtleQrSvg({ url, sizeIn = 0.5, ink = '#1A1815' }) → string|null
// `qrcode` lib (installed) → SVG path output, ECC 'M'; enforce dark ink
// (reject luminance > 0.45 → use default ink); 4-module quiet zone; round
// the module path joins if cheap (stroke-linejoin), else square is fine.
```
Wiring (owned by WS-I):
- `routes/pdf.js`: append at END of file only: `GET /p/:slug` → look up
  profile slug (knex, select id/slug only) → 302 to `/portfolio/:slug`
  (404 → redirect to marketing root). Best-effort analytics insert into the
  existing analytics table (event_type 'compcard_link_open') in try/catch.
  DO NOT touch renderComposedView or any other existing function — WS-H owns
  that region (it emits the wordmark/portfolio headers).
- `generator.js`: after the page.pdf() buffer is normalized, read the
  navigation response headers (keep the `page.goto` response object) — when
  `X-CompCard-Wordmark-Front`/`-Back` + `X-CompCard-Portfolio-Url` are
  present, run embedPortfolioLink (front rect → pageIndex 0, back → 1) with
  title `${first} ${last} — Comp Card` if name headers available else from
  slug. Fail-soft (log + continue with raw buffer).
- Tests: coordinate conversion (known rect → expected PDF Rect), annotation
  count via pdf-lib reload, metadata set, fail-soft on garbage buffer, QR
  SVG generated + ink enforcement, shortPortfolioUrl; route test for /p/:slug
  redirect (supertest pattern from existing route tests).

NFC (product workflow — document, do not build hardware features): the
short URL `/p/:slug` is what gets encoded on NTAG213-class inlays; no PDF
changes needed. WS-I adds a short "NFC & link" section to the spec'd
README-style comment at the top of portfolio-link.js.

## Cross-cutting rules

- CommonJS; JSDoc style of the existing composition modules.
- Determinism from (profile, images, forensics, seed); AI advice remains the
  only non-deterministic input and is clamped.
- Banned patterns (CLAUDE.md) hold everywhere.
- Never fail a render: every new layer degrades to the previous behavior.
- Run your own tests; full `npx jest src/domains/pdf/__tests__/` must stay
  green (update only tests your workstream owns).
- Do not edit files owned by another workstream (ownership lists above).

---

# v3 addendum — Authored Intelligence Layer (2026-06-12)

User direction: real font library + pairing logic, dynamic text-over-image
contrast control, and a fast Groq planning layer making structured design
decisions (typography, layout tone, image treatment, stat placement,
composition direction). Deterministic engine keeps crop safety, print specs,
validation.

Research (verified live against this account's Groq API):
- Strict schema-constrained decoding (`response_format: json_schema`,
  `strict: true`) is supported ONLY on openai/gpt-oss-120b and gpt-oss-20b.
  Measured: gpt-oss-120b returns a schema-valid design brief in ~1.7s
  (~1000 total tokens). Schema numbers MUST carry documented 0–100 scales
  (unbounded numbers come back on arbitrary scales).
- llama-3.1-8b-instant is the speed fallback (json_object + validation);
  deterministic synthesis remains the final fallback. Vision planning later:
  meta-llama/llama-4-scout-17b-16e-instruct.

## E. composition/font-library.js
Curated manifest (~10 Google Fonts families) with per-family metadata:
classification, available weights, capAdvanceEm / titleAdvanceEm (name-size
math), tracking bounds. Six pairing VOICES (stark-grotesque, editorial-serif,
romantic-didone, quiet-classic, modern-warm, bold-grotesque), each = display
family + body family + case/tracking/weight policy + tone-affinity vector
for deterministic selection. Exports: VOICES, FAMILIES, resolveVoice(toneVector,
seed, override), fontsCssUrl(families) builder, isVoice(id).

## F. composition/contrast.js
Dynamic text-over-image contrast: given the forensics luma grid cells under a
candidate band + paper color → { ink ('light'|'dark'), estContrast,
scrim: null | { direction, strength 0.2–0.62 }, verdict: 'safe'|'scrim'|
'relocate' }. WCAG-derived: band mean luma → approximate contrast vs white
and vs ink; < 4.5 target ⇒ scrim sized to the deficit; mid-gray/busy bands
where max scrim still fails ⇒ 'relocate' (director falls back to paper
placement). Wordmark ink uses the same logic on its corner cells.

## G. composition/art-director.js (supersedes ai-advisor in the composed path)
getDesignBrief({ profile, castingAnalysis, archetype, poolSummary, statsBlock,
forensicsSummary, timeoutMs }) → Brief | null. Groq gpt-oss-120b, strict
json_schema: { typographyVoice enum, formality/warmth/energy/density int
0–100, frontTreatment enum (full-bleed|floated|floated-asymmetric),
statsSide enum (right|left|bottom), frontStatLine bool, bleedAppetite enum
(none|restrained|expressive), heroImageId string, rationale ≤ 400 chars }.
Hard validation anyway (never trust transport); never throws; null on any
failure. The brief is AUTHORITATIVE for taste axes (tone numbers adopted
directly after 0–1 normalization, voice adopted if valid, statsSide/
frontTreatment/bleedAppetite forwarded to the solver) but the deterministic
engine retains vetoes: hero clamp (±15 heroScore), frontStatLine requires a
quiet hero bottom band (legibility veto), crop safety / print specs /
validation unchanged. All adoptions and vetoes logged in decisions[].

## Rewiring
- design-language.js: accepts brief; brief tone replaces computed tone (kids
  clamps still apply); voice from font-library; name metrics per family.
- layout-solver: statsSide + frontTreatment + bleedAppetite biases from the
  brief (bounded); contrast.js drives nameBand ink/scrim/relocation.
- index.js: art-director replaces ai-advisor for the composed path (same
  env gating); template renders variable scrim strength + voice fonts/weights.
