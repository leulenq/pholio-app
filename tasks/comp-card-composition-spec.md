# Comp Card Composition Engine — Architecture Spec

Owner: orchestrator session. This spec is the single source of truth for module
contracts. Specialist workstreams implement against these contracts exactly.
All code is CommonJS (backend convention). All new modules live in
`src/domains/pdf/composition/`. Tests live in `src/domains/pdf/__tests__/`.

## Mission

Evolve the existing comp card generator (template + seeded selector) into an
**intelligent composition engine**: every card is uniquely designed for the
individual talent while meeting real industry standards. Front + back page,
professionally formatted stats, photo hierarchy + safe crops decided from image
data, tone/typography/layout decided from the talent's look and category. An AI
model (Groq) participates as an *advisor* in the decision layer but is never
trusted blindly — the deterministic engine validates, clamps, and can override
every suggestion.

## Industry standards baked in (from research)

- Card: 5.5in × 8.5in portrait, 2 pages. Existing pipeline already does this
  (`@page { size: 5.5in 8.5in }`, `preferCSSPageSize: true`, `break-after: page`).
- Front: ONE dominant hero image (full-bleed or bordered), talent name as the
  only large type, optional small agency/contact block. Nothing else.
- Back: 3–5 photo grid that must include a full-body shot when available, plus
  a stats block (bottom strip or side column) and contact line. Name repeats
  smaller.
- Stats formats (exact):
  - Women order: Height, Bust, Waist, Hips, Dress, Shoes, Hair, Eyes.
  - Men order: Height, Chest, Waist, Inseam, Suit, Shoes, Hair, Eyes.
    Suit = chest-in-inches + length letter: S (height < 173cm), R (173–183cm),
    L (> 183cm) → e.g. `40R`.
  - Kids (< 18 yrs): Age, Height, Clothing Size, Shoes, Hair, Eyes.
    No bust/waist/hips. Age IS shown (only for kids).
  - Dual units are the agency-grade default: `178 cm / 5'10"`,
    `Bust 86 cm / 34"`. Inches rounded to nearest half (render ½ as `.5` → `34.5"`).
  - Height imperial: `5'10"` (no space between feet and inches).
  - Shoe: dual `US 9 / EU 40`. Women EU ≈ US + 31; Men EU ≈ US + 33.
  - Dress: dual `US 4 / EU 36` (EU ≈ US + 32).
  - NEVER print: age/DOB for adults, weight (except fitness category where
    weight may appear), home address.
- Crop rules: never crop at joints (knees/elbows/wrists/ankles); headshot
  eye-line in upper third with modest headroom; full-body shots must keep the
  full figure (or be flagged unsafe).
- Tone norms: high-fashion = stark white/near-mono, caps name with wide
  tracking, tiny stats; commercial = warmer ivory + gold accent, serif display;
  fitness = bolder grotesque; kids = brighter but still clean. Minimalism
  everywhere. models.com show-package cards are the high-fashion reference.
- Banned (CLAUDE.md): no badges/pills/chips on photos or corners, no eyebrow
  kickers, no backdrop-filter glass. Stats are plain text.

## Existing code you must know (read these)

- `src/domains/pdf/comp-card-selector.js` — seeded role-based selector
  (`deriveCompCardRole`, mulberry32 seeding pattern). Reuse its role
  derivation + seeding utilities (import, do not duplicate, unless noted).
- `src/domains/pdf/style-engine.js` — current layout families. The composition
  director SUPERSEDES it for the composed engine but follows the same
  deterministic seed→choice pattern (`pickDeterministic` style).
- `src/domains/pdf/guardrails.js` — `evaluateCompCardGuardrails`; the composed
  engine adds its own checks via the orchestrator.
- `src/domains/pdf/routes/pdf.js` — `renderStandardView` (~line 563) shows how
  template data is assembled; `loadArchetype` (~line 540).
- `src/domains/pdf/generator.js` — Puppeteer wrapper; passes query params
  (theme, seed, layoutFamily, styleVariant, lockHeroId, lockGridIds) to
  `/pdf/view/:slug`.
- `src/domains/pdf/templates/compcard-standard.ejs` — current 2-page template
  (markup + print CSS + font loading reference).
- `src/domains/pdf/fonts.js`, `themes.js`, `presets.js`.
- `src/domains/ai/analyzeProfileImage.js` — castingAnalysis JSON stored on
  `profiles.image_analysis` (fields: skinTone, boneStructure, lookType,
  photoQuality, marketSignals[], bookingStrengths[], expressionRead, …).
- `src/domains/ai/groq-casting.js` — Groq client pattern, archetype scores
  ({runway, editorial, commercial, lifestyle}); `onboarding_signals` has
  `archetype_label`, `casting_verdict`.

## Data shapes (DB reality)

`profiles` (relevant columns): `first_name`, `last_name`, `city`, `slug`,
`gender` ("Male"|"Female"|"Non-binary"|"Other"|null), `date_of_birth`, `age`,
`height_cm` (int), `bust_cm`, `waist_cm`, `hips_cm`, `inseam_cm` (int, cm),
`measurements` (legacy string like "32-25-35", inches), `shoe_size` (string),
`dress_size` (string, US), `hair_color`, `hair_length`, `eye_color`,
`skin_tone`, `weight_kg`, `weight_lbs`, `phone`, `instagram_handle`, `is_pro`,
`pdf_theme`, `pdf_customizations`, `image_analysis` (JSON string or object —
castingAnalysis), `look_descriptor`.

`images`: `id`, `profile_id`, `path`, `public_url`, `label`, `sort`,
`status` ('active'|'archived'|'retired'|null), `is_primary`,
`shot_type` ('headshot'|'three_quarter'|'full_length'|'full_body'|null),
`style_type` ('editorial'|'lifestyle'|null), `width`, `height` (may be null —
fall back to `metadata.width/height`), `metadata` (JSON string or object; may
contain `role` legacy, `focal` {x,y} in 0–1 if precomputed), `created_at`.

Always parse `metadata`/`image_analysis` defensively (string or object).

---

## Module contracts

### 1. `composition/stats-formatter.js` (WS-A)

```js
/**
 * buildStatsBlock(profile, options?) → StatsBlock
 * options: { units: 'dual'|'imperial'|'metric' (default 'dual'),
 *            category: explicit override | undefined (auto-resolve) }
 */
StatsBlock = {
  category: 'women'|'men'|'kids',       // presentation track
  isFitness: boolean,                    // weight allowed when true
  units: 'dual'|'imperial'|'metric',
  lines: [{ key, label, value }],        // ordered, ready to render. label UPPERCASE.
  inline: 'HEIGHT 178 CM / 5\'10"  ·  BUST 86 CM / 34"  ·  …',  // single-line strip
  omitted: [{ key, reason }],            // explainability (e.g. age, weight)
  warnings: [string],                    // missing/suspect data
}
// also export: resolveStatsCategory(profile), cmToFeetInches(cm) → `5'10"`,
// cmToInchesHalf(cm) → 34 | 34.5, shoeDual(raw, category), dressDual(raw)
```

Rules:
- Category: explicit option wins → gender Male → 'men', Female → 'women';
  if `age < 18` (or computed from date_of_birth) → 'kids'. Non-binary/unknown:
  choose by available measurements (bust_cm present → women track, else men
  track) and add a warning. `isFitness` true when castingAnalysis
  marketSignals/lookType or archetype label contains fitness/athletic
  (pass these in via `options.signals` — keep formatter pure, no DB).
- Field sourcing: prefer `*_cm` columns; if absent, parse legacy
  `measurements` "B-W-H" (values ≤ 50 are inches → convert to cm). Men's chest
  = `bust_cm`.
- Missing values: skip the line and add a warning. Never render placeholders
  like "—".
- Skip-list enforcement: adults never get age/DOB; weight only when
  `isFitness` (use weight_kg/lbs, dual: `64 kg / 141 lbs`); kids never get
  bust/waist/hips; kids use dress_size as `Clothing Size`.
- Hair/eyes Title Case ("Dark Brown").
- Pure module: no DB, no requires outside node stdlib. Exhaustive JSDoc.
- Tests: `__tests__/stats-formatter.test.js` — women/men/kids/fitness tracks,
  dual/imperial/metric, legacy measurements fallback, missing data, suit-size
  derivation incl. S/R/L boundaries, shoe/dress conversion, omission reasons.

### 2. `composition/photo-intelligence.js` + `composition/crop-engine.js` (WS-B)

```js
// photo-intelligence.js
/**
 * analyzeImagePool({ images, profile, castingAnalysis }) → PoolAnalysis
 */
PoolAnalysis = {
  pool: [{
    id, src,                     // src = public_url || path
    role,                        // via selector's deriveCompCardRole (import it)
    aspect,                      // width/height or null
    width, height, shortEdge,
    isPrimary, sort,
    qualityScore,                // 0–100 deterministic (resolution, aspect sanity)
    heroScore,                   // 0–100 (role fit for front, primary flag, quality, order)
    reasons: [string],           // why it scored what it scored
  }],                            // sorted by heroScore desc
  coverage: { headshot: n, full_body: n, editorial: n, lifestyle: n, untyped: n },
  heroRanking: [imageId, …],
  warnings: [string],            // e.g. 'no full-body image available'
}
```
- Eligibility: drop archived/retired (same semantics as selector's
  `filterEligibleByStatus`); drop rights-denied (same token set as
  guardrails.js).
- heroScore (deterministic, documented weights): headshot/three_quarter role
  bonus; `is_primary` bonus (the profile-level castingAnalysis describes this
  image — it is the analyzed face); resolution tiers (shortEdge ≥1200, ≥1800);
  portrait aspect proximity to 0.647 (5.5/8.5); earlier `sort` mild bonus.

```js
// crop-engine.js
/**
 * resolveCrop(poolImage, slot) → Crop
 * slot: { aspect: number (w/h), role: string|null, kind: 'hero'|'cell' }
 */
Crop = {
  fit: 'cover'|'contain',
  objectPosition: '50% 18%',     // CSS value, focal-aware
  safety: { level: 'safe'|'caution'|'unsafe', notes: [string] },
  coverageLoss: 0.12,            // fraction of image area lost to the crop
}
// also export:
// assignImagesToSlots(poolAnalysis, slots, { seed, locks }) → [{ slotIndex, imageId, crop }]
//   — greedy/seeded assignment minimizing unsafe crops (full_body → tallest cell,
//     headshot → squarer cells), honoring locks { heroId, gridIds } like the selector.
// computeFocalPoint(sharpInputBuffer) → { x, y } | null   (sharp attention crop;
//   best-effort, used offline/lazily — NOT in the hot render path)
```
- Focal source order: `metadata.focal` → role heuristic (headshot y≈18%,
  three_quarter y≈25%, full_body y≈50% with full-figure guard, editorial/
  lifestyle 50/35) → center.
- Full-body guard: if covering a slot would cut > ~18% of image height for a
  full_body/full_length image, degrade safety to 'caution' and bias position
  to keep head + feet; > ~30% → 'unsafe' (assignment should avoid; if forced,
  note it so guardrails can warn).
- No DB access. `sharp` may be required lazily inside computeFocalPoint only.
- Tests for both modules: scoring determinism, eligibility, focal fallbacks,
  full-body guard thresholds, assignment respects locks and avoids unsafe.

### 3. `composition/composition-director.js` + `composition/grid-catalog.js` (WS-C)

```js
// grid-catalog.js — back-page grid definitions (3–5 photos)
GRIDS = {
  'trio-feature':  { count: 3, cells: [{aspect:0.66, span:'tall'}, …], css: {...} },
  'quad-grid':     { count: 4, cells: [...] },   // 2×2
  'quad-feature':  { count: 4, cells: [...] },   // 1 large + 3 small
  'quint-mosaic':  { count: 5, cells: [...] },
}
// each cell: { aspect, area: 'a'|'b'|… } + a gridTemplate the EJS can consume:
// { columns, rows, areas } as CSS grid strings.

// composition-director.js
/**
 * designComposition({ profile, archetype, castingAnalysis, statsBlock,
 *                     poolAnalysis, seed, advice?, overrides? }) → CompositionPlan
 */
CompositionPlan = {
  engine: 'composed', seedUsed,
  toneProfile: 'high-fashion'|'editorial-classic'|'commercial-warm'|'fitness-bold'|'kids-bright',
  palette: { background, text, muted, accent, rule },      // hex strings
  typography: { display, body, nameSize, nameTracking, nameCase,
                statSize, statLabelSize },                  // fonts from fonts.js families
  front: {
    imageId, crop,                       // Crop from crop-engine
    treatment: 'full-bleed'|'bordered',  // bordered = inset white frame (editorial-classic)
    name: { placement: 'bottom'|'top', align: 'left'|'center' },
    showContactBlock: boolean,
  },
  back: {
    gridId, slots: [{ imageId, crop, aspect, area }],
    statsPlacement: 'bottom-strip'|'side-column',
    contact: { line: string },           // assembled from city/instagram/phone (no address)
  },
  decisions: [{ aspect, choice, because }],   // full explainability trail
  warnings: [string],
}
```
- Tone resolution (deterministic, documented): kids if statsBlock.category
  'kids' → 'kids-bright'; fitness signals → 'fitness-bold'; archetype label /
  castingAnalysis.lookType containing runway|editorial|high fashion →
  'high-fashion'; commercial|lifestyle → 'commercial-warm'; default
  'editorial-classic'.
- Within a tone, seeded micro-variation (selector's mulberry32 pattern with
  salts) over: name placement/alignment, nameSize ±, tracking, grid choice
  among grids whose count ≤ usable image count, statsPlacement, treatment.
  Same seed + same inputs ⇒ identical plan.
- Grid choice respects poolAnalysis.coverage (must place a full_body in the
  largest/tallest cell when one exists; if none, use three_quarter and add a
  warning).
- Hero: heroRanking[0] unless `advice.heroImageId` is valid (exists, eligible,
  heroScore within 15 points of top) or `overrides/locks` force it.
- `advice` (from ai-advisor, may be null): each field validated against enums
  and pool; invalid fields ignored with a decision-log entry. Advice may bias
  tone/grid/hero but NEVER: violate stats rules, place unsafe crops, exceed
  palette bounds (e.g. background must stay in the white/ivory/near-black set
  defined per tone).
- Palettes/typography per tone (use brand fonts: Playfair Display,
  Noto Serif Display, Inter; gold #C9A55A / #B8956A family for accents where
  the tone allows). No glass, no badges.
- Tests: tone resolution table, determinism (same seed ⇒ deep-equal plan;
  different talent ⇒ different plan), advice clamping, grid/coverage rules,
  full decision log presence.

### 4. `composition/ai-advisor.js` (WS-E)

```js
/**
 * async getCompositionAdvice({ profile, castingAnalysis, archetype,
 *                              poolSummary, timeoutMs = 4000 }) → Advice|null
 */
Advice = {
  tone?: <tone enum>, heroImageId?: string,
  gridPreference?: <gridId enum>, nameAlign?: 'left'|'center',
  rationale: string,
}
```
- Uses the Groq client pattern from `src/domains/ai/groq-casting.js`
  (`getGroq()`-style lazy init; respect missing GROQ_API_KEY → return null).
- Model: text model (no vision) — it reasons over castingAnalysis text +
  poolSummary (id, role, qualityScore, heroScore, label per image — no pixel
  data). JSON response_format, temperature ≤ 0.3, max ~500 tokens.
- Hard validation: parse → whitelist every field; heroImageId must be in
  poolSummary; unknown/invalid fields dropped. Any throw/timeout/parse error →
  `null` (callers must work perfectly with null). Wrap with Promise.race
  timeout. Never throws.
- Log one line on success/failure (`[ai-advisor]` prefix, no PII beyond ids).
- Tests with a mocked groq module: valid advice passes, junk fields stripped,
  malformed JSON → null, timeout → null, missing key → null.

### 5. `composition/index.js` + template + wiring (WS-D, after 1–4 merge)

```js
/**
 * async composeCompCard({ profile, images, options }) → {
 *   plan, statsBlock, poolAnalysis, guardrailReport, advice }
 * options: { seed, locks, aiAdvice: boolean (default true, auto-false in tests),
 *            unitsPreference, engineOverrides }
 */
```
- Orchestrates: parse castingAnalysis from profile.image_analysis → archetype
  via existing loadArchetype pattern (passed in by route — index.js stays
  DB-free; route supplies archetype) → statsBlock → poolAnalysis → advice
  (best-effort) → plan → extended guardrails (base `evaluateCompCardGuardrails`
  + new checks: unsafe crops in plan, stats warnings, missing full-body).
- `templates/compcard-composed.ejs`: renders CompositionPlan + StatsBlock.
  Print CSS: `@page { size: 5.5in 8.5in; margin: 0 }`, `.comp-card-page` class
  (generator.js checks for it), `break-after: page`, 0.25in safe zone for text,
  fonts loaded the same way compcard-standard.ejs loads them. Front page and
  back page per plan. Plain-text stats. Watermark for non-pro (same as
  standard). NO badges/chips/glass.
- `routes/pdf.js`: `renderStandardView` gains engine switch — query
  `engine=composed|classic`; default **composed**; classic path unchanged.
  Pass headers `X-CompCard-Engine`, keep existing metadata headers working in
  both branches. `generator.js` forwards `engine` + `units` query params.
- Update `presets.js` only if it hard-codes engine assumptions.
- Integration test: composeCompCard end-to-end with fixture profile+images
  (no DB, no Groq), asserting plan validity, stats correctness, guardrail
  report shape; route-level test that `/pdf/view/:slug?engine=composed`
  renders (follow existing pdf-diagnostics-route.test.js patterns/mocks).
- Existing tests must keep passing; if a default-engine change breaks one,
  update that test intentionally and note it.

## Cross-cutting rules

- CommonJS, match existing code style (JSDoc headers like selector/guardrails).
- Determinism first: AI is advisory only; everything renderable must be
  reproducible from (profile, images, seed).
- Defensive parsing everywhere (metadata/image_analysis string|object).
- No new dependencies. sharp, groq-sdk, ejs, puppeteer already exist.
- Run your own tests: `npx jest src/domains/pdf/__tests__/<your file> `.
- Do not modify files owned by other workstreams (see file lists above).
