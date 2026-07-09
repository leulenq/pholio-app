# Comp Card Editions — Implementation Plan (v10)

Date: 2026-07-09 · Status: awaiting owner approval — no implementation started.
Basis: tasks/comp-card-editions-spec.md (v9 design record, Rounds 1–8) as
amended by tasks/comp-card-editions-redteam.md (five-agent independent
review). Where the two disagree, THIS PLAN WINS — every red-team P0 and the
phase-relevant P1s are folded in below.

Design goal (unchanged): a living design system whose outputs read as
intentionally art-directed — beating Canva templates, Photoshop template
packs, and typical agency-made cards — with variety that survives 25
generations, contrast that survives print, and safety that is auditable in
the artifact.

## Ground rules (apply to every phase)

- Photographs are never manipulated (no filters/duotone/retouch).
- Booker's law vetoes never trade against score; forced/pinned options
  REFUSE rather than relax verification (all 1.0/2.0 minRatio carve-outs
  are removed).
- Every on-photo text element carries a verification stamp
  `{ contrast, faceClear, occupancy, forensicsHash, cropWindow }`; the
  renderer refuses unstamped or stale-stamped on-photo type.
- All contrast math in linear luminance; all composited colors (scrims at
  the farthest text line, translucent fills, veils) verified as rendered,
  per-cell at the 48×72 grid, in crop space, on BOTH composer paths.
- Frozen saved cards render byte-identically from frozen plan_json;
  ENGINE_VERSION bumps to composed-v6.0 when phase 2 lands.
- New dependencies (all permissive): `harfbuzzjs` (MIT), `apca-w3` (W3),
  `pixelmatch` or `ssim.js` (MIT) for the perceptual gates; ghostscript
  (AGPL — subprocess use, REQUIRES OWNER SIGN-OFF) or PrinceXML (paid
  fallback) in phase 5; vendored variable TTFs (OFL).

---

## Phase 0 — Shipping bugfixes (independent of Editions; do first)

These are live production defects; they also unblock everything after.

- **0.1 Luminance-space fix.** Linearize forensics gray at the module
  boundary (`srgbLinear`) inside `contrast.js` (`bandStats`,
  `contrastWhiteOver`, `contrastDarkOver`); audit every other consumer of
  `luma.grid` for the same mistake; recalibrate `isDark`/quiet/detail
  thresholds (they were tuned in gamma space); rewrite
  `__tests__/contrast.test.js` + `type-safety.test.js` fixtures with real
  color pairs and known-answer ratios.
- **0.2 Scrim z-order fix.** `templates/compcard-composed.ejs` `fpScrim`:
  explicit z-index between photo (10) and name (40), clipped to the photo
  rect; same check for `scrimForName`. Add the first rasterized pixel
  test: render a fixture via Puppeteer, sample pixels under the scrim
  zone, assert the scrim materially darkens/lightens them.
- **0.3 Measurement layer.** Add `harfbuzzjs`; rewrite
  `perception/text-metrics.js` measureLine on HarfBuzz shaping (same
  engine as Chromium ⇒ parity by construction); keep the calibrated
  estimate fallback. Remove the runtime Google-Fonts fallback from the
  PDF path — vendored fonts authoritative, missing family fails loudly.
  Add the shaping-parity regression test: shaped width vs
  Puppeteer-rendered width for every voice × kern-torture string
  ("TAYA WAVERLY AVAT."), ≤0.5%.
- **0.4 Fit-guard becomes a gate.** Floor the name rescale at 14pt
  effective; hitting the floor fails the take and triggers re-plan
  (generator.js tripwire escalates from console.error to failure).
- **0.5 Micro-type contrast hotfixes.** Kill the hard-coded
  `#C9A55A !important` contact override in the template; route all
  micro-type colors through verified palette roles; `deriveAccent`'s
  brand-gold fallback passes the same contrast gate as derived accents.

**Gate 0:** full Jest suite green (with rewritten fixtures); parity +
pixel tests green; before/after visual spot-check on 6 seeds.

## Phase 1 — Review rig + prerequisites (gallery-first)

- **1.1 Gallery rig** `scripts/comp-card-gallery.js`: fixture profiles —
  editorial woman (strong pool + matte), commercial man (typical pool, no
  matte), teen (kids pool), new face (8 mixed phone photos — the weak-pool
  case) — × editions × 6 seeds through the REAL template with vendored
  fonts, no network. Outputs `gallery/index.html` grid + Puppeteer
  contact-sheet PNGs + plan JSON; CI regenerates and diffs plan JSON.
- **1.2 Perceptual gates on the rig** (the primary quality gates from
  here on): (a) pairwise perceptual distance between edition exemplars at
  thumbnail size (SSIM/pixelmatch on downsampled screenshots) with
  thresholds — replaces the metadata distinctness matrix as the binding
  test (metadata checks stay as cheap pre-filters); (b) rasterized
  contrast gate — sample rendered pixels under every text rect, assert
  the stamped ratio within tolerance.
- **1.3 Matte precompute at upload** for studio-classified frames
  (photo-intelligence hook + cache); `?editions=1` availability reflects
  real coverage. Track matte coverage as a product metric.

**Gate 1:** rig runs in CI; baseline artifacts of the CURRENT engine
committed for comparison; contrast pixel gate green on the current engine
(post-phase-0).

## Phase 2 — Editions core (engine)

- **2.1 Catalog v10** (`composition/editions.js` updated as the first
  commit — prototype/spec drift closed): 9 editions with
  **`the-strip`** replacing fresh-commercial (hero + 3-frame front
  filmstrip, title-case warmth as styling); structurally-dark ink-noir
  (night-field gallery mat, ≤0.5pt desaturated gold keyline, reversed
  footline); masthead labeled "The Masthead"; voice pools per the §7.4
  overlap budget incl. `clean-modern`; kids restricted draw pool
  implemented; suitability gates incl. pairable-support.
- **2.2 Resolver fixes + compositional operators.** Clamp effective
  avoid depth to `suitable − 1`; the fallback ALWAYS excludes the
  immediate predecessor (no consecutive identical editions, pool ≥ 2);
  photo misfit gates (affinity < 0.6 removes, not floors — a bright-warm
  pool never draws noir). Operators crossed with editions:
  (a) **hero re-curation** — per-take draw across the full ±15 clamp with
  per-edition shot-type preference; consecutive takes guarantee a hero
  change unless locked; duet draws the best pair;
  (b) **field program** — paper-white/warm/plane-pulled/dark as a
  cross-cutting axis, gated per edition (dark: notKids + photo affinity;
  plane: palette-pulled verified) so e.g. a dark Monograph exists;
  (c) **scale register** — quiet/standard/display crossed with structure
  where the edition's scale bounds allow.
  Avoid-history is a 3-deep FIFO over the composite tuple
  (edition, heroId, field, register): client keeps the FIFO; the server
  persists the last composite signature per profile IN THIS PHASE
  (nullable columns on comp_card_presets + profile meta), so cycling
  survives reloads.
- **2.3 Design-language threading.** Edition voice pools (resolveVoice
  `pool` option, kids vetoes intact); palette programs with PER-ROLE
  verification before a paper is accepted — primary ink ≥7:1, muted/stats
  ≥4.5:1 and |Lc|≥75, accent-as-text ≥4.5:1, accent-as-ornament ≥3:1,
  information-bearing rules ≥3:1; scale bounds; size-tracking CURVE
  (tracking tightens as size grows) replacing sampled tracking noise;
  stacked-caps negative leading (0.92–0.98); `tabular-nums` on stats.
- **2.4 Front structure builders** (each consuming shared verified
  primitives): `masthead`, `column-grid`, `cover-story` (interlock depth
  0.12–0.4 PLUS per-word readability — no glyph >60% occluded, first and
  last name independently readable), `diptych`, `the-strip`
  (filmstrip-foot with supportPool + cropResolver), deep-mat and
  dark-field-mat parameters for matted; house-classic loses its matted
  mode (hard boundary vs Monograph). Lockup grammar
  (inline/stacked/contrast/spine/initial-line) as first-class; photo
  elements carry imageId + crop; ornament passes (foot-anchored,
  information-bearing; folio acknowledged as the one ornament).
- **2.5 Reversed-type print rules.** Per-voice stroke-class metadata in
  font-library; reversed minimums: weight ≥600 → ≥8pt; 400–500 grotesque
  → ≥10pt; hairline/didone → ≥24pt AND thinnest stroke ≥0.5pt at rendered
  size, else the type moves to paper; gold on ink fields is
  accent/keyline/display only (never ≤9pt text, never knockout fill under
  white — knockout fills run the both-ink comparison); APCA supplement
  via `apca-w3` (|Lc|≥60 display, ≥75 small, ≥90 micro; micro never over
  photo or veil); translucent veils solved per-cell over the band's
  actual cells; scrim alpha solved at the farthest text line (flat-then-
  fade profile); scrim clamp unified (composer max = template max).
- **2.6 Per-edition scoring** replacing the global scorer (objectives per
  spec §7.1 with the occlusion cap added); the vision jury rubric is
  edition-aware. Universal soft objectives (alignment, breathing,
  sloppy-tension) retained.
- **2.7 Back programs.** Per-edition architecture pools + chrome styles
  (statsStyle column/strip/tabular/footline, dividers, indexed cells,
  reversed, airy) PLUS: per-edition BACK objectives (Monograph: margins
  echo front mat ratios + whitespace target; Swiss: cells and stats table
  on the front's module grid, rules on grid lines; Masthead: nameplate
  running head; noir: reversed discipline); a front↔back cohesion
  contract (shared alignment edges, gutter rhythm, keyline continuity)
  scored per take; the **nameplate system** (name designed once per take:
  front masthead scale, back running head); stats block set as a
  typographic object per edition (hanging labels, rule alignment,
  tabular numerals) with canonical order untouched.
- **2.8 Template CardIR extensions.** Per-page backgrounds (dark-aware
  watermark/empty-cell/muted), imageId photos with per-element crops,
  rule/folio/index/statBlock-style rendering, verification-stamp refusal
  path, `opsz`/`wdth` passthrough in font CSS.
- **2.9 API/routes.** `?edition=`, `?avoidEdition=` (repeatable),
  `?editions=1` catalog with availability; `X-CompCard-Edition` header +
  meta; preset `edition` column migration; `COMP_CARD_EDITIONS` env flag
  with `?editions=0/1` QA override; `?front=legacy` escape hatch stays.
- **2.10 Tests.** `editions.test.js`: resolver determinism, gates, kids
  pool, no-consecutive-repeat, voice-pool budget, per-role palette
  contrast (incl. hero-pulled ink-field boundary papers), operator-tuple
  spread; simulated 25-take sequences meet novelty targets — typical
  pool: ≥12 perceptually distinct takes in 25 (measured on rig
  screenshots), immediate-repeat probability 0 for pools ≥2; conditional
  first-draw distribution (share among suitable, not raw); Booker's-law
  invariants on sampled programs; shaping parity re-run per new voice.

**Gate 2:** gallery review sign-off against the phase-1 baseline
(distinctness + contrast pixel gates green across all four fixture
profiles including weak-pool and kids); 25-take novelty targets met;
default flag still OFF.

## Phase 3 — Product surface

- **3.1 Two-gesture UX**: "New direction" (operator-tuple cycling) /
  "Another take of this" (re-seed within pinned edition); header names
  the result ("The Monograph — set in Hairline Fashion"). Edition rail
  with real availability + honest unlock copy; rail thumbnails are STATIC
  exemplars (never live re-compositions — don't pre-spoil the draw);
  kids UI states the honest count ("two directions for this profile").
- **3.2 Minimal control set** (selection within verified bounds; no
  font/color pickers, no drag): back-grid per-cell photo picker (surface
  the existing `lockGridIds` server support; candidates restricted to
  crops that pass the slot's checks), hero lock first-class per edition,
  name-presence S/M/L within the edition clamp, card display-name
  override + optional union/title line, take-history strip (last 8 takes,
  seeds + tuples, revisitable), accent toggle where the edition defines
  one. (Verified crop alternates: backlog, after the above.)
- **3.3 Seed persistence**: first render uses the last-served seed, not a
  static default (returning users don't see "the generator is stuck").
- **3.4 Flag flips ON by default** after a second gallery sign-off.
  Watermark/monetization per owner decision (recommendation stands: no
  new gates).

**Gate 3:** usability pass on the three personas; the "working
commercial model" persona can reproduce an agency-directed card (specific
photos in specific cells) without leaving Pholio.

## Phase 4 — Typography depth

- Vendor variable TTFs (Archivo wdth, Fraunces + Bodoni Moda opsz);
  per-axis measurement via harfbuzz `setVariations`; 1-day spike:
  Chromium PDF export of variable instances (fallback: fonttools
  `varLib.instancer` static-instancing as a build step in
  `scripts/fetch-compcard-fonts.js`).
- Width/optical axes enter edition type programs (condensed masthead,
  extended rail).
- Typeface decision executed (owner input): serif register led by
  Fraunces/Bodoni optical cuts; Cormorant only where ≥20pt; or licensed
  face budget for flagship editions.

**Gate 4:** parity test green at axis instances; print spot-check of
optical cuts.

## Phase 5 — Print & format

- PDF/X + CMYK ghostscript post-pass (BLOCKED on AGPL sign-off;
  PrinceXML $3,800/server is the paid fallback), trim marks, per-edition
  stock guidance; K-rich night-field builds ≤300% TAC documented.
- **Physical proof round is the shipping gate for dark editions**: Night
  Edition + Monograph hairline + Cover Story interlock on coated digital,
  uncoated card stock, and consumer inkjet; reversed fill-in checked at
  8/10/15/22pt per voice; gold-on-dark micro-type; veils over busy
  imagery. No dark edition ships on screen verification alone.
- **A5 format** (pulled forward from "someday"): page-dimension
  parameterization of builders + template; EU default by locale.
- Print-on-demand partner evaluation (owner decision).

**Gate 5:** a print shop accepts the PDF/X output without complaint;
proof-round sign-off.

## Phase 6 — Agency card program (scope pending owner decision)

Stub: house edition pinned roster-wide, agency logo/contact block
replacing the Pholio-mark position, batch generation + export for a
board. Either scheduled or explicitly declared a non-goal.

## Sequencing & rollout

Phases 0–1 are unconditional (bugfixes + rig). 2 → 3 → 4 in order; 5
parallel to 3/4 once sign-offs exist; 6 pending decision. Rollout stays
behind `COMP_CARD_EDITIONS` until Gate 3. Saved cards: untouched by
construction (frozen plan_json); legacy presets keep the legacy path.

## Owner decisions required before/at each phase

1. Approve this plan (unblocks phase 0 — phase 0 is defensible even
   standalone as pure bugfixing).
2. Ghostscript AGPL sign-off or PrinceXML budget (blocks phase 5 print).
3. Agency program: scope or non-goal (blocks phase 6 only).
4. Monetization/watermark stance (blocks nothing; affects 3.4 copy).
5. Licensed-typeface budget yes/no (affects phase 4 decision).
