# Front-Page Intelligence v4 — Proposal

Benchmark: `docs/comp-card-frontpage-ideas/` (studied 2026-06-12).
Status: P1–P4 BUILT (2026-06-13). Synthesis engine default-on behind the
composed engine (`?front=legacy` opts out). P1 perception, P3 mask-dependent
layers, and the P4 jury MODULE are all in; the jury's live render-K-and-rank
wiring is the one remaining opt-in integration (latency/cost gated).

## 1. What the inspiration does that we don't

Across the reference cards (Laura Moore, Morgan Kolakowski, Amelia Jane,
Jacob Richards, EDIT.org cutout card, knockout-band card), six recurring
**compositional motifs** make them read premium and distinct:

| Motif | What it is | Why we can't do it today |
|---|---|---|
| **Spine name** | Name rotated 90° on a rule beside the photo; contact micro-type runs down the spine | We have a vestigial −90 rotation but no spine geometry, no contact-on-spine |
| **Mat frame** | Photo inset on paper with the name set INTO the bottom mat as a designed unit (gallery/polaroid register) | Our "floated" treatment exists but name/mat are not one composed unit; no keyline frames |
| **Edge-crossing layered type** | Script or serif name OVERLAPPING the photo edge; sits half on paper, half on image | Type-safety only knows full bands; no partial-overlap layout primitive |
| **Ghost type layer** | Oversized letterspaced name at ~6–10% opacity behind/under the composition | No layered-type concept at all |
| **Negative-space cutout comp** | Subject segmented from background, placed on a flat color pulled from the photo; type + stats set INTO the silhouette's negative space; inset photos overlap the hero | Requires a real subject mask — our 9×6 grid can't do this |
| **Knockout band** | Solid band over the photo's foot with reversed name | We have scrims, not designed solid bands |
| Mixed type pairs | Script accent + letterspaced caps in one lockup | Voices are single-display only |

Diagnosis of our current front: the design space is *parametric but
structurally thin* — full-bleed vs floated, band top/bottom, one type
treatment. Variety lives in numbers (tracking, margins), not in
**composition**. The inspiration varies *structure*. Additionally our 9×6
forensics grid is too coarse to support any motif that interacts with the
subject's silhouette — which is exactly where the premium feel comes from.

## 2. Recommended intelligence stack

Three layers — perception, design grammar, judgment — all running in our
existing Node/Puppeteer pipeline. No external design SaaS.

### 2.1 Perception (pixel-exact, replaces the 9×6 grid heuristics)
- **Subject mask**: [`@imgly/background-removal-node`](https://www.npmjs.com/package/@imgly/background-removal-node)
  (open-source ISNet/U²-Net-class matting on ONNX, runs in Node, models
  self-hostable) — exact alpha silhouette per image at upload time, stored
  as a downscaled mask (e.g. 96×144 PNG in metadata/R2). Enables: true
  protected-subject regions (replacing the backdrop-deviation guess),
  negative-space discovery (largest type-safe rectangles), and the cutout
  motif itself.
- **Face boxes**: `@vladmandic/human` (maintained TFJS/ONNX face detection
  in Node) or OpenCV-YuNet via onnxruntime — real face rectangles instead
  of the attention-focal proxy. Hard face-exclusion becomes exact.
- **Exact type metrics**: `opentype.js` with our Google-Fonts files —
  measure REAL glyph advances per font/weight/tracking, deleting the
  estimated-advance + 0.95-safety hacks. Names fit by measurement, not
  approximation.
- Existing forensics (palette/luma/quiet) stays for color + contrast math.

### 2.2 Design Program Synthesis (grammar of primitives — motifs are
### EMERGENT, never enumerated)

The references are a TASTE BENCHMARK, not a structural taxonomy. The §1
motif table is therefore used only to derive the primitive vocabulary and
to calibrate judging — the system never selects "a motif."

**The unit of design is a small DESIGN PROGRAM** — a JSON element tree
sampled from a generative grammar:

- **Primitives (orthogonal, composable):**
  - field treatments: photo plane (any rect, any inset per side), flat
    color planes (palette-pulled), split fields (any proportion/axis),
    masked-subject cutout planes;
  - photo operators: hero rect free within crop/face safety (dominance
    ≥ ~70% of photo area — industry hero-led rule), 0–2 small companion
    insets, keyline frames;
  - type elements as free objects: name (single/stacked/vertical), contact
    micro-line, stat line, ghost echo of the name (scale/opacity
    continuous), monogram initial — each PLACED BY SEARCH over the real
    negative-space map (subject mask + face boxes), not band slots;
  - graphic accents: rules (any edge, partial lengths), solid bands,
    color blocks — bounded by the house taste rules;
  - layering relations: over/under/crossing (continuous overlap fraction),
    knockout, behind-subject (mask-aware z-order — type BEHIND the talent).
- **Sampler:** seeded stochastic production rules with continuous
  parameters everywhere; the art-director brief conditions sampling
  DISTRIBUTIONS (energy → layering appetite, formality → restraint,
  density → element count), never structures. The combinatorial space
  (treatments × placements × type ops × accents × z-relations) yields
  hundreds-to-thousands of structurally distinct programs; a structural
  signature hash is logged per shipped card to verify non-repetition in
  production.
- **Hard validators + repair:** industry rules, pixel-exact type safety
  (WCAG on actual backdrop, <N% subject-pixel intersection, 0% face-box
  intersection), print specs. Invalid programs are repaired (nudge/scale/
  relocate) or rejected — sampling continues until K valid candidates
  exist (deterministic mat-frame fallback if exhaustion).
- **Computational aesthetics scorer** (pre-jury): alignment-grid coherence,
  visual-weight balance, whitespace rhythm, hierarchy contrast — the
  classic graphic-design metrics from the layout-optimization literature
  (DesignScape-style energies), tuned once against the reference set.

### 2.3 Judgment (propose → critique; references as calibration)
The reference images participate as a TASTE INSTRUMENT, two ways:
(a) the vision-jury rubric is written from them (confidence, restraint,
layered type, subject respect); (b) optionally, a local CLIP/SigLIP
embedding scores candidates for REGISTER proximity to the reference-set
centroid while PENALIZING similarity to any single reference — close in
spirit, never a copy.
- The Groq art-director brief authors an INTENT vector (register, energy,
  restraint, risk appetite) + voice — conditioning the sampler, never
  selecting structures.
- **Candidate jury**: render K=4–6 valid programs
  as PNGs (existing Puppeteer; cheap at front-only scale) and have
  `meta-llama/llama-4-scout-17b-16e-instruct` (vision, on our Groq account)
  score them against a fixed rubric (legibility, balance, subject respect,
  premium feel) with strict JSON output; deterministic checks veto first,
  the jury ranks survivors, the winner ships. This is the structural
  difference between "generate a layout" and "design like Canva": propose,
  see, judge.
- Academic grounding (not dependencies): poster-layout generation work
  (PosterLLaVA, Microsoft COLE/OpenCOLE, LayoutDM) converges on exactly
  this content-aware-constraints + LLM-planner + critic pattern; we
  implement it narrowly for one artifact instead of adopting research code.

Rejected alternatives: Canva/Adobe Express APIs (template-locked, hosted,
brand mismatch); Polotno SDK (useful later for a talent-facing editor, not
for autonomous generation); diffusion-based layout models (non-deterministic,
unenforceable industry constraints, heavy ops).

## 3. What stays untouchable
Industry constraints (5.5×8.5, hero+name front, stats default back),
type-safety blockers (now pixel-exact), crop safety/healing, print bleed,
gold wordmark rules, deterministic fallback when any model is unavailable
(motifs degrade to mat-frame — always safe on paper).

## 4. Phasing
1. **P1 Perception** — masks + faces at upload (forensics v3), opentype.js
   metrics; type-safety swaps to exact masks. (Foundation; immediately
   fixes residual placement quality.)
2. **P2 Program synthesis core** — primitive vocabulary, sampler,
   validators/repair, negative-space placement search; paper-plane
   programs first (always safe), photo-interacting layers gated on P1
   masks. (The variety payoff: structural space, not parameter tweaks.)
3. **P3 Mask-dependent layers** — cutout planes, behind-subject type,
   edge-crossing/knockout relations.
4. **P4 Judgment** — aesthetics scorer + K-candidate Scout vision jury +
   optional CLIP register calibration; structural-signature logging.
5. **P5 (optional)** — Polotno-based manual-touch editor for Studio+.

Estimated new deps: `@imgly/background-removal-node`, `@vladmandic/human`
(or onnxruntime+YuNet), `opentype.js`. All open-source, all local inference.


## 5. Build status (2026-06-13)

DONE — `composition/front-program/synthesize.js`: grammar of orthogonal
primitives (field structures photo-dominant / matted / split — continuous,
not menu-selected; photo plane; type as free objects with measured boxes;
ghost echo; monogram; rules/frames; contact lockup). Seeded sampler
conditioned by an intent vector (formality/energy/warmth/density/risk →
distributions, never structures). Negative-space placement search avoiding
face zone, subject pixels, and placed siblings. Pixel-exact type safety
reused (no name on a face — 200-seed test). Aesthetics scorer picks best of
K=5. Structural-signature hash. The composed template renders an arbitrary
program element tree; wired via composeCompCard (frontEngine:'program') and
the route (default on). 8-test suite incl. 200 seeds -> >20 distinct
signatures. 288 PDF-domain tests green; verified live.

FOLLOW-UPS: wordmark uses the legacy fixed corner (should consult the
program occupied rects). P1 perception deps (@imgly/background-removal-node,
face boxes, opentype.js) not yet installed — the synthesizer consumes the
existing forensics subject grid through the interface a real matte sharpens.
P3 mask-dependent layers and P4 vision jury pending.


## 6. Update — P1/P3/P4 (2026-06-13, multi-agent + inline)

PERCEPTION (P1, agent): `composition/perception/{text-metrics,matte,faces}.js`.
opentype.js INSTALLED → real glyph metrics (with an estimate fallback when no
font file is bundled — @fontsource is the documented next step). matte.js
(@imgly/background-removal-node) and faces.js (@vladmandic/human) are fully
implemented but their heavy ONNX deps don't install/run in this sandbox, so
they ship as fail-soft stubs (null / []) — the exact designed seam. Wired:
uploader computes matte alongside forensics → image metadata → route
matteById → composeCompCard → synthesizer. Lights up automatically when the
matte dep runs in a real environment.

MASK-DEPENDENT LAYERS (P3, inline): the synthesizer gained a `cutout` field
structure GATED on a real matte (never sampled without one), matte-aware
negative-space name placement (largest empty rectangle that FITS the box —
not max-area, which returns useless tall-narrow columns), and a knockout-band
primitive (solid reversed-name band, energy-gated). Proven end-to-end with a
synthetic matte (name set into the silhouette's negative space above the
head). Tests: cutout gating, negative-space avoidance of subject columns,
knockout band behind reversed type.

JURY (P4, agent): `composition/front-program/jury.js` — llama-4-scout
multi-image vision ranking on a fixed rubric (legibility/balance/
subjectRespect/premiumFeel), strict json_schema, null on every failure,
final = 0.6·vision + 0.4·aesthetics. 18 tests (mocked Groq). REMAINING: the
live render-K-PNGs → rank → final-render wiring (opt-in; adds K front renders
+ one Groq call per card). The module is ready; the pipeline hook is the next
step.

WORDMARK FOLLOW-UP (inline): with a program present, composeCompCard places
the gold mark in the least-crowded of the four corners (min overlap vs
program element rects), gold tone from the plane under it. No more fixed-
corner crowding.

Suite: 324 passed / 2 skipped (matte+faces real-path skips). app.test.js
unchanged (4 pre-existing failures).
