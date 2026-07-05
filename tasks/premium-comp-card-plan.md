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

## Review

(appended per iteration)
