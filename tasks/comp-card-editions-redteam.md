# Editions v9 — Independent red-team synthesis

Date: 2026-07-09 · Five independent agents (no attachment to the plan), each
with web research and repo access: creative direction vs real references,
variety mathematics (4,000-trial Monte Carlo against the real resolver),
renderer/tooling alternatives (empirical font-shaping tests), contrast &
print readability (code audit + Puppeteer pixel proof), and
Canva/Photoshop/agency replacement analysis. Full reports live in the
session record; this file is the actionable synthesis.

## Consolidated verdict

**The architecture direction survives; the v9 plan as written does not.**
Every agent independently endorsed the core moves — named editions over
parameter jitter, per-edition scoring over a global scorer, hard vetoes,
gallery-first review, keeping the HTML/Puppeteer renderer. And every agent
found the same class of gap: the plan certifies *metadata* where the user
experiences *pixels*. Verbatim verdicts:

- Creative: "conditionally below the bar as written … the honest current
  description is five or six real directions, intelligently governed."
- Variety: "v9's variety does not survive 25 generations as claimed …
  typical users exhaust the catalog's percepts by take ~10–12, kids by ~3."
- Tooling: "keep the renderer, replace the measurement layer" (P0 defect
  already shipping).
- Contrast: "NOT solved for the v9 dark territory — and not fully solved
  for the cards shipping today."
- Product: "out-designs the incumbents but does not replace anyone's
  workflow" (control + print gaps).

## P0 findings (must fix; several are live bugs, not plan issues)

1. **Gamma-as-linear luminance bug (shipping).** `contrast.js:28–34` feeds
   gamma-encoded gray into the WCAG formula; dark-ink verdicts are
   inflated ~2× (judged 5.0:1, true 2.4:1 on mid-gray bands). The test
   suite encodes the same wrong space, so 17/17 pass. Fix at the module
   boundary; recalibrate thresholds; rewrite tests with real color pairs.
2. **Composed-path scrim renders zero pixels (shipping; Puppeteer-proven).**
   `compcard-composed.ejs` emits the front-program scrim with no z-index
   under a z-10 photo — every "scrim" verdict ships with the raw photo
   under the type. Fix z-order; add a rasterized pixel gate to CI.
3. **Measurement layer disagrees with the renderer by up to 9.4%
   (shipping).** opentype.js silently drops class-based GPOS kerning
   (Bodoni/Playfair/Noto return zero kerning; `getAdvanceWidth` throws on
   Inter/Archivo). Chromium shapes with HarfBuzz. All errors are
   overestimates; the fit-guard only shrinks → silently undersized names;
   v9 masthead/interlock objectives would be numerically unenforceable.
   Fix: replace opentype.js with `harfbuzzjs` (same engine as Chromium —
   parity by construction), vendor variable TTFs, remove the runtime
   Google-Fonts fallback from the print path, add a shaping-parity test.
4. **Ink-field palette verifies only the primary ink.** Hero-pulled night
   paper stops darkening at 7:1 for the ink; muted stats (3.8:1), pinned
   gold (3.3:1), knockout white-on-gold (2.33:1), and the hard-coded
   `#C9A55A !important` 7.2pt contact are unverified. Every palette role
   must clear its own threshold before a paper is accepted.
5. **`fresh-commercial` fails the plan's own distinctness law** (creative
   + variety agents independently: honest score ≤2 of 6 axes vs
   house-classic) inside the highest-traffic draw pool. Rebuild as
   **"The Strip"** (hero + 3-frame front filmstrip — the real premium
   commercial format) or demote to a house-classic variant.
6. **The back page is the old engine wearing style flags.** All 8 back
   architectures pre-exist; all nine §7.1 objectives are front-only; no
   front↔back cohesion contract. Required: per-edition back objectives,
   a spread-level cohesion contract (shared alignment edges, mat/grid
   echo, keyline continuity), stats block designed as a typographic
   object per edition, and the **nameplate system** (name designed once,
   masthead front + running head back) as the cheapest identity bridge.
7. **Novelty saturates at ~6–9 takes for typical talent; kids collapse to
   2–3 with a resolver bug that permits consecutive identical editions**
   (avoid-fallback readmits the just-avoided edition; verified against
   the real module). Fixes: clamp avoid depth to `suitable−1` and always
   exclude the immediate predecessor; and adopt **compositional operators**
   instead of more editions — (a) per-take hero re-curation across the
   full ±15 clamp with guaranteed hero change between takes, (b) field
   program (white/warm/plane/dark) as a cross-cutting gated axis,
   (c) scale register (quiet/standard/display) as an operator —
   9 editions × operators ≈ 27+ percepts, avoid-history over the tuple.
8. **Distinctness/spread tests are vacuous or gameable as specced**
   (quintile test passes any sampler at p≈0.9998; matrix counts invisible
   metadata). Replace the primary gate with **perceptual distance on
   rendered gallery screenshots** (SSIM/LPIPS or downsampled histograms);
   keep metadata checks as cheap pre-filters. The same rig hosts the
   rasterized contrast gate (finding 2).
9. **Control gap blocks replacement for working talent.** The single most
   common real edit — put *this* photo in *that* back cell — is
   impossible in the UI while the server already supports it
   (`lockGridIds` parsed and threaded in `routes/pdf.js`). Adopt the
   minimal control set: back-grid photo picker (verified candidates
   only), first-class hero lock, name-presence S/M/L, display-name
   override (+ optional union line), take-history strip (~8), accent
   toggle, verified crop alternates. Explicitly no font/color pickers or
   drag-positioning.

## P1 (required before the affected phase ships)

- **Reversed-type print rules**: hairline/didone faces (Italiana 400,
  thin Bodoni/Cormorant) reversed only ≥24pt AND thinnest stroke ≥0.5pt;
  weight ≥600 → ≥8pt; 400–500 grotesque → ≥10pt. Gold on ink fields is
  accent/keyline/display only — never ≤9pt text, never a knockout fill
  under white. APCA gates supplement WCAG floors (≥Lc 60 display, ≥Lc 75
  small, ≥Lc 90 micro); verify colors **as composited** (veils, scrims at
  the farthest text line, translucent fills); per-cell verification in
  crop space on BOTH composer paths; fit-guard floor 14pt → re-plan, not
  log; forced treatments refuse rather than relax (kill the 1.0/2.0
  minRatio carve-outs); physical proof round (coated/uncoated/inkjet)
  before any dark edition ships.
- **Cycling contract**: client keeps a 3-deep FIFO; server persists the
  last composite signature in phase 1 (one column), not phase 2; effective
  depth clamped to pool size; photo-misfit (affinity <0.6) gates rather
  than floors (a bright-warm talent must not be force-served noir —
  83.5% currently see ≥1 in 25 takes).
- **Print-ready output moves from phase 4 to phase 2** (PDF/X via
  ghostscript post-pass — AGPL sign-off needed, PrinceXML as paid escape
  hatch — trim marks, stock guidance), and evaluate one print-on-demand
  partner. **A5 moves earlier** (EU market's literal format).
- **Palette courage**: one color-confident direction (full-strength
  verified accent plane, Swiss lineage) or an explicit argued decision
  not to have one; 7/9 white editions currently restates the original
  complaint.
- **Cover Story occlusion cap**: interlock ≤0.4 unchecked for legibility;
  add per-word readability (no glyph >60% occluded; first and last name
  independently readable).
- **Masthead vs Cover Story perceptual A/B** at thumbnail size in the
  gallery rig; house-classic loses its matted mode or gains a hard
  mat-depth boundary against the Monograph.
- **Typeface decision**: Cormorant swap trades one Canva-saturated face
  for another (and is anemic <20pt in print); prefer Fraunces/Bodoni
  optical axes for the serif register or budget a licensed face for
  flagship editions.
- **Agency persona**: declare board-uniform agency cards a non-goal
  explicitly, or plan an agency card program (house edition pinned
  roster-wide, agency logo/contact block, batch export). Free-tier
  watermark contradiction (booker's own warning) needs an owner decision.

## P2 (adopt during implementation)

APCA lib (`apca-w3`) + `harfbuzzjs` + variable TTFs as the dependency
set; forensics hash + crop window in the CardIR verify stamp; 48×72-grid
(not 9×6 mean) worst-cell checks; scrim solve at farthest text line;
first-render seed persistence (stable `profile:preview` seed reads as
"stuck" on return visits); rail thumbnails as static exemplars (don't
pre-spoil "New direction"); folio honesty (it is ornament); noir keyline
guardrails (≤0.5pt, desaturated gold, never doubled); prototype/spec
drift fixed as the first phase-1 commit.

## What stands unchanged

Editions as the top-level unit (continuous style space re-rejected with
reasons); killing the proof-sheet front; Booker's law; per-edition
scoring replacing the global scorer; gallery-first build order; matte
precompute prerequisite; two-gesture UX; HTML/Puppeteer renderer (now
with the harfbuzz metrics seam); no photo manipulation, ever.

## Owner decisions

1. Approve the v10 revision incorporating the above (spec update next).
2. Monetization: watermark contradiction + catalog gating.
3. Agency card program: scope it or declare non-goal.
4. Ghostscript AGPL sign-off (or PrinceXML budget) for print-ready phase.
5. The three shipping bugs (gamma luminance, scrim z-order, font
   measurement) exist in production TODAY independent of Editions — fix
   now as standalone bugfixes, or fold into phase 1?
