# Premium Comp Card System — build plan (2026-07)

Source of truth for current status: `docs/comp-card-audit-2026-07/README.md`.
Product bar: outputs must beat Canva/agency cards on taste, reliability,
curation, and product advantage. Executed in loop iterations on branch
`claude/premium-comp-card-system-67xorl`.

## Iteration 1 — Never-wrong geometry + name-first hierarchy (P0-1, P0-2, P1-5, P2-10) ✅

- [x] Vendor the 10 library font families as static TTFs under `public/fonts/compcard/`
      (OFL; downloaded from Google Fonts) — one source for measurement AND rendering
- [x] `composition/perception/font-files.js`: family+weight → font file resolver,
      measured per-string advance (opentype.js), fail-soft to library estimates
- [x] Wire real metrics: `design-language.js` glyphEm (+ glyphEmLongest for
      stacked lines), `index.js` ctx.nameMetrics, director stacked re-solve
- [x] `composition/crop-space.js`: cover-crop visible-window transform +
      forensics/matte remap; wired into `front-program/synthesize.js` so all
      on-photo verification runs in *visible* image space (P0-2)
- [x] Renderer hard guard in `compcard-composed.ejs`: local @font-face (no CDN),
      fit-to-box name script, ghost complete-word guard, report on
      `body[data-name-fit]`; generator waits on it and logs the report
- [x] Guardrail: `rendered-name-integrity` tripwire in composeCompCard
      (measured name width vs solved rect)
- [x] Hierarchy rebalance in synthesize.js: band-width-solved name sizing with
      proactive editorial stacking, spine treatment for narrow rails,
      ghost-echo plane ownership (complete word, off the photo plane),
      knockout prominence bonus, scorer name-presence term
- [x] `forceStructure` hook in the sampler (engine seam for named directions)
- [x] Also: lazy Groq init in chat/scout/photo-analysis (P2-11 — app now
      boots without GROQ_API_KEY; also unblocks ~30 test suites in key-less
      environments)
- [x] Tests: crop-space unit suite + geometry-integrity seed sweep
      (8 names × 25 seeds, zero violations); all 26 PDF suites green (347)
- [x] Live verification: seeded synthetic talent (hyphenated 26-char name,
      dark-garment heroes = the audit's killer case), 8 seeds rendered via
      Puppeteer — zero overflowing spans, zero fit-guard corrections needed,
      names at 70–77% page width (audit baseline: names drowned in 3/6 takes)

## Iteration 2 — Directions, not reshuffles (P0-3, P1-6, P1-7)

- [ ] Takes endpoint → K structurally-distinct named directions
      (structure × voice × name treatment, dedup by signature)
- [ ] CompCard.jsx: named-direction picker with real previews, hero lock exposure,
      per-direction save; "shuffle" demoted to secondary control
- [ ] Board/market tags condition direction generation
- [ ] Freeze saved cards: persist composed plan JSON + engine version at save;
      render presets from stored plan
- [ ] Honest guardrail copy: map rights/type-safety/crop failures to actionable
      talent-facing messages (kill the generic "Needs photos")

## Iteration 3 — Light the dormant stack + verification harness (P1-4)

- [ ] Subject mattes (@imgly/background-removal-node) at upload or sidecar;
      unlock cutout + negative-space type
- [ ] Vision jury on download/master renders (K=5, cost-bounded)
- [ ] Post-render Puppeteer name-integrity verification loop
- [ ] Seed-sweep exit test: N seeds × name shapes → zero name/photo collisions,
      zero clipped display type

## Iteration 4 — Editorial range: color blocks, straddle, pairing contrast ✅

- [x] Palette-pulled color-block planes (reversed type verified 4.5:1)
- [x] Straddle split variant — type crosses the photo seam into white space
- [x] Grotesque surname pairing (display × body classification contrast)
- [x] Worst-cell fill contrast for on-photo display type (band means hid
      dark-torso glyph sinkage — every covered cell now clears the ratio)
- [x] Live mix at typical energy: ~25% inset split, ~8% straddle, ~9% color
      block, ~58% classic registers — statement motifs, not new templates

## Iteration 5 — Name choreography + dormant stack ✅

- [x] Choreography menu: straddle v2 (edge-to-edge translucent), over
      (on-photo hierarchical lockup), band (translucent strip), inset
- [x] Studio mattes (sharp-only, clean-backdrop, honesty-gated) at render +
      upload; alpha mattes take precedence when installed; cutout alpha-gated
- [x] Jury default-on for downloads with a Groq key
- [x] Downloads carry structure/board/preset/treatment end to end

## Iteration 6 — Treatment control + hygiene ✅

- [x] Talent-facing name-treatment chips (Pholio's choice / Classic /
      Statement); ?treatment= pins persist on presets and ride downloads
- [x] Uploader computes best available matte; width/height already persisted
- [x] @imgly evaluation: not installable here (proxy 403 on sharp rebuild),
      too heavy for serverless — optional dependency stands, studio matte
      covers negative-space placement
- [x] Back page reviewed against the new fronts — no changes needed

## Iteration 7 — Real variety + no dead whitespace ✅

- [x] Take-to-take divergence: "Another take" carries the previous take's
      structure/treatment/voice as avoid-hints; previous voice excluded from
      the cast; repeat structure/treatment penalized in the best-of-K pick
      (measured: zero identical consecutive over a 16-press chain)
- [x] Anchored paper rhythm (head/third/foot), no mid-plane float
- [x] Back-page architecture variety (seeded alternate before feature-column
      fallback; neutral photo count breathes 3/4/5) — six architectures live
- [x] Head-containment crop guarantee (back-grid beheading fix)
- [x] Split orphan fix: on-photo choreography gated to non-split structures
- [x] Photo-dominant bleed-to-bottom when the name is on the photo — no
      orphaned bottom strip

## Iteration 8 — Polish ✅

- [x] Post-render name-integrity tripwire on downloads (large fit-guard
      repair logged loudly)
- [x] Side-by-side direction previews in the dashboard
- [x] Digitals sheet reviewed — intentionally distinct utilitarian artifact,
      no changes

## Remaining queue

- [ ] Optional: alpha-matte dependency if a lighter matting model appears
- [ ] Optional: agency-application vs direct-booking card modes

## Review

(appended per iteration)
