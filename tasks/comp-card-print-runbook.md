# Comp Card Print Path — deployment runbook + proof gate (Phase 5)

Status: infra-gated. Ghostscript is not installed in the build/dev
environment, so the PDF/X + CMYK post-pass is documented here as a
deployment task rather than shipped as untestable code. A5 format is a
separate focused geometry refactor (see §4). The physical proof round
(§3) is the required shipping gate for the dark editions and cannot be
automated — it is a human sign-off.

Decisions locked (owner, 2026-07-09): **no paid dependencies or licenses.**
PrinceXML is off the table; ghostscript (free, AGPL, used as an unmodified
subprocess) is the only PDF/X path. No print-partner integration that
carries a license cost without explicit approval.

## 1. What ships today vs. what this adds

- **Today**: Puppeteer renders the composed HTML to an **RGB** PDF at
  5.5×8.5in trim with a 0.125in bleed canvas (the template already offsets
  geometry by the bleed and extends page-edge imagery through it —
  `printBleed` local in compcard-composed.ejs). No trim marks, no CMYK, no
  PDF/X conformance.
- **This phase adds** a post-render pass that converts that RGB PDF into a
  print-ready **PDF/X-3** file with a CMYK output intent and optional trim
  marks, without changing the composition engine or the renderer.

## 2. Ghostscript post-pass (deployment)

### 2.1 Install (deploy target only)

Ghostscript is AGPL. Subprocess use of the **unmodified** distributed
binary is the standard pattern (OCRmyPDF, ChromicPDF both do this) and does
not create a derivative work. Do **not** vendor or modify gs source.

- Netlify/serverless: add ghostscript to the build image or use a layer;
  confirm the binary is on PATH in the function runtime.
- Container/VM: `apt-get install ghostscript` (Debian/Ubuntu) or the
  distro equivalent; pin the version in the image.

### 2.2 The conversion command

RGB PDF → PDF/X-3 with a CMYK working space (US Web Coated SWOP or FOGRA
per market; ship the ICC profile with the app, do not rely on the host):

```
gs -dPDFX -dBATCH -dNOPAUSE -dNOOUTERSAVE \
   -sDEVICE=pdfwrite \
   -dPDFSETTINGS=/prepress \
   -sColorConversionStrategy=CMYK \
   -sProcessColorModel=DeviceCMYK \
   -sOutputICCProfile=/app/assets/icc/USWebCoatedSWOP.icc \
   -dRenderIntent=1 \
   -sOutputFile=out-pdfx.pdf \
   PDFX_def.ps in-rgb.pdf
```

`PDFX_def.ps` is the standard Ghostscript PDF/X definition prologue
(output intent + condition identifier); template it per market and ship it
in the repo under `assets/print/`.

### 2.3 Integration seam (when infra is ready)

- New module `src/domains/pdf/print/pdfx.js`: `toPdfX(rgbBuffer, { market })
  → cmykBuffer`, spawning gs as a subprocess over a temp file pair,
  fail-soft (on any gs error, log and return the original RGB buffer so the
  download never 500s — a working RGB PDF beats a failed print PDF).
- Wire into the download route (`/pdf/:slug?download=1`) behind a
  `?print=1` (or `Accept`-negotiated) branch and a `PRINT_PDFX` env flag,
  exactly mirroring the editions flag pattern. Default off until §3 passes.
- Tests: gate the gs-dependent test behind a `PDFX_GS=1` env var (like the
  browser-gated suites), asserting the output is valid PDF/X (parse the
  output intent). The fail-soft path is unit-testable without gs (mock the
  spawn to error → original buffer returned).

### 2.4 Color caveats (must be surfaced to users)

- Conversion is ICC-based, not ink-controlled: the brand gold `#C9A55A`
  shifts slightly in CMYK. Acceptable for photo-dominant cards; a print
  shop demanding exact ink builds needs a spot color, which this pass does
  not provide.
- Night-field editions (`ink-noir`) build as **K-rich CMYK** (≈50/40/30/100
  or the market's rich-black recipe), total area coverage ≤ 300% (SWOP)
  so knockout type spread-traps cleanly. Encode the recipe in the PDF/X
  definition, not per-card.

## 3. Physical proof round — the shipping gate for dark editions (REQUIRED)

The contrast auditor's rule stands: **no dark edition ships on screen
verification alone.** WCAG/APCA are display models; dot gain, reversed-type
fill-in, and gold-on-dark behavior only show on paper. Before flipping
`ink-noir` (and the hairline/reversed treatments in any edition) to
generally available:

Print the three worst-case editions — **Night Edition**, **Monograph**
(hairline reversed), **Cover Story** (type-behind-figure interlock) — from
the gallery rig fixtures, on:

- (a) coated digital stock,
- (b) uncoated card stock (the worse case — higher gain, more fill-in),
- (c) one consumer inkjet.

Check, at each of 8 / 10 / 15 / 22pt per voice:

- [ ] reversed strokes do not fill in (hairline faces legible at their
      floor; grotesque ≥8pt clean);
- [ ] gold-on-dark micro-type is legible (or confirm gold is only used at
      keyline/display scale, never ≤9pt text);
- [ ] translucent veil bands over busy imagery stay readable;
- [ ] the interlock name reads (first + last independently) at print size;
- [ ] no registration fringing on knockout type over the CMYK night field.

Sign off against the gallery rig's screen renders. File the proofs. Only
then flip the dark editions on for general availability.

## 4. A5 format (148×210mm) — focused geometry refactor (separate pass)

The red team flagged deferring A5 as a quiet EU-market exclusion (metric
agencies expect A5 / 400gsm). It is "constant-threading, not redesign" but
the thread is broad: `PAGE_W`/`PAGE_H` are hardcoded (5.5 / 8.5) across
`front-program/synthesize.js`, `edition-structures.js`,
`back-program/synthesize.js`, `layout-solver.js`, `editions.js`,
`composition-director.js`, the template, and the gallery rig — and every
geometric test assumes US Letter-half.

Scope for its own agent pass (do NOT bundle with other work — it touches
the whole geometry surface and risks the green suite):

- Introduce a page-config object `{ trim: {w,h}, bleed, safe }` sourced
  from `shared/comp-card-dimensions.json` (extend it with an `a5` block)
  and thread it from `composeCompCard` through every solver as an argument
  — remove the module-level `PAGE_W`/`PAGE_H` constants in favor of the
  passed config, defaulting to US so existing behavior is unchanged.
- Parameterize the template `@page` size, bleed math, and all inch rects
  (they already arrive in inches; A5 is 5.83×8.27in — the solvers must
  produce rects in the active page's inches).
- Route: `?format=a5|us` (default us), persisted on presets; the dashboard
  offers a format toggle.
- Tests: every geometric invariant test runs against BOTH formats; the
  gallery rig renders both; hero-area floors, MIN_CELL, and safe-zone
  vetoes hold in A5.
- Per-edition paper-stock guidance copy (400gsm, coated vs uncoated) ships
  with the format choice.

## 5. Sequencing

1. §3 proof round can happen now against the gallery rig output — it needs
   no code, only a printer, and it gates the dark editions regardless of
   §2.
2. §2 (ghostscript) lands when the deploy image includes gs; the fail-soft
   integration is safe to merge before the binary exists (it just returns
   RGB until then).
3. §4 (A5) is an independent focused refactor; schedule it when the US
   format is validated in production.
