# Comp Card Generator Progress

## Scope Completed

This session advanced the comp-card generator from basic deterministic selection into a director-driven variation workflow with lockable composition controls.

### 1) Full `pdf-customizer` frontend page

- Replaced placeholder route with real page component and styling.
- Reused live `CompCardPreview` inside a full-page editorial layout.
- Wired through existing media/profile state.

Files:

- `client/src/App.jsx`
- `client/src/domains/talent/pages/PdfCustomizerPage/index.jsx`
- `client/src/domains/talent/pages/PdfCustomizerPage/PdfCustomizerPage.css`

---

### 2) Deterministic style engine (layout families + micro-variants)

- Added server-side style engine with deterministic family/variant selection from seed.
- Added three layout families:
  - `editorial-balanced`
  - `runway-split`
  - `mosaic-horizontal`
- Added token-bounded style patches (overlay, typography scale, rules, spacing, badge radius).
- Added optional query overrides with safe fallback:
  - `layoutFamily`
  - `styleVariant`

Files:

- `src/domains/pdf/style-engine.js` (new)
- `src/domains/pdf/routes/pdf.js`
- `src/domains/pdf/generator.js`
- `src/domains/pdf/templates/compcard-standard.ejs`
- `src/domains/pdf/__tests__/style-engine.test.js` (new)

---

### 3) Metadata exposure + diagnostics

- Added resolved comp-card metadata exposure for reproducibility:
  - seed
  - layout family (+ label)
  - style variant (+ label)
- Added diagnostics mode on PDF view route:
  - `GET /pdf/view/:slug?diagnostics=1`
  - Also accepts `spec=1`, `compose=1`, or `format=json`
- Added response headers for standard view metadata:
  - `X-CompCard-Seed`
  - `X-CompCard-Layout-Family`
  - `X-CompCard-Style-Variant`
  - optional label headers
- Added metadata token sanitization/capping before reflection in headers/body attrs.

Files:

- `src/domains/pdf/routes/pdf.js`
- `src/domains/pdf/templates/compcard-standard.ejs`

---

### 4) Lock-aware selector behavior

- Extended comp-card selector to support slot locks:
  - `locks.heroId`
  - `locks.gridIds` (up to 4 slots)
- Locking enforces chosen IDs first, then deterministic fallback for remaining slots.
- Preserves uniqueness (no duplicate image IDs across chosen slots).

Files:

- `src/domains/pdf/comp-card-selector.js`
- `src/domains/pdf/__tests__/comp-card-selector.test.js`

---

### 5) Lock propagation end-to-end

- Added lock query parsing and normalization in route layer:
  - `lockHeroId`
  - `lockGridIds` (comma-separated)
- Propagated these through:
  - preview render path
  - diagnostics selection
  - download path (`/pdf/:slug`)
  - Puppeteer render handoff (`renderCompCard`)

Files:

- `src/domains/pdf/routes/pdf.js`
- `src/domains/pdf/generator.js`
- `src/domains/pdf/__tests__/pdf-diagnostics-route.test.js` (new)

---

### 6) Director controls in `CompCardPreview`

- Added regenerate seed control.
- Added layout family selector.
- Added lock toggles:
  - Layout
  - Style
  - Hero
  - Grid
- Added active variation metadata block (resolved values from diagnostics).
- Added slot swap controls for grid positions.
- Added per-slot grid image assignment controls (S1-S4).
- Added manual hero slot assignment control.
- Added one-click `Clear Locks` control.

Files:

- `client/src/domains/talent/components/CompCardPreview.jsx`
- `client/src/domains/talent/components/CompCardPreview.css`

---

### 7) Route-level diagnostics coverage

- Added focused diagnostics route tests for lock parsing and lock-aware selection:
  - valid `lockHeroId` + `lockGridIds`
  - malformed lock query normalization
- Added local console suppression in this test file to keep CI output concise.

Files:

- `src/domains/pdf/__tests__/pdf-diagnostics-route.test.js`

## Verification Performed

Targeted verification passed during implementation:

- `npm test -- src/domains/pdf/__tests__/style-engine.test.js`
- `npm test -- src/domains/pdf/__tests__/comp-card-selector.test.js`
- `npm test -- src/domains/pdf/__tests__/pdf-diagnostics-route.test.js`
- `cd client && npx eslint "src/domains/talent/components/CompCardPreview.jsx"`
- `ReadLints` checks on touched files (no introduced linter errors)

Code-review subagent passes were run repeatedly after each substantive slice; high-severity findings were fixed before proceeding.

## Important Quality Fixes Applied During Iteration

- Stabilized ordering in profile image load to avoid tie-order determinism drift:
  - `orderBy("sort").orderBy("id")`
- Removed stale async iframe overwrite race in theme-save flow:
  - preview now updates via React state/query source of truth
- Fixed stale grid lock state after regeneration by syncing lock snapshots properly.
- Ensured metadata panel reflects resolved backend values, not raw query intent.

## Current Capabilities

The comp-card tab now supports:

- deterministic seeded generation
- deterministic style family + variant selection
- lockable art direction controls
- lockable hero and grid slot composition
- explicit grid slot swapping and assignment
- reproducible preview/download parity through query-propagated composition state

## Remaining High-Value Next Steps

1. Add lock/swap metadata to canonical compose-spec contracts if/when contracts module is restored in this branch.
2. Add lightweight UX feedback (toasts/hints) for lock-clear/assign actions.
3. Add persistent saved “director presets” (optional) for repeatable board workflows.
4. Expand guardrails (DPI/rights/legibility) and master export validation for print confidence.

## Backend Progress (Latest)

### 8) Guardrail validator + master export enforcement

- Added backend guardrail evaluator for comp cards:
  - slot completeness checks (hero + grid)
  - image source readiness checks
  - rights metadata checks
  - print-dimension warnings
  - profile legibility checks
- Diagnostics JSON now includes `guardrailReport` and resolved `mode` (`draft`/`master`).
- Master mode download now blocks with `422` and stable code:
  - `COMP_CARD_GUARDRAILS_FAILED`
- Draft/default behavior remains compatible.

Files:

- `src/domains/pdf/guardrails.js` (new)
- `src/domains/pdf/routes/pdf.js`
- `src/domains/pdf/__tests__/guardrails.test.js` (new)
- `src/domains/pdf/__tests__/pdf-diagnostics-route.test.js`

### 9) Persistent director presets API (backend-only)

- Added persistent comp-card presets table:
  - profile-scoped, named snapshots for seed/layout/style/locks
- Added backend presets helper module for input normalization and query mapping.
- Added ownership-protected talent endpoints:
  - `GET /api/pdf/presets/:slug`
  - `POST /api/pdf/presets/:slug`
  - `PUT /api/pdf/presets/:slug/:presetId`
  - `DELETE /api/pdf/presets/:slug/:presetId`
  - `POST /api/pdf/presets/:slug/:presetId/apply`

Files:

- `migrations/20260526010000_create_comp_card_presets.js` (new)
- `src/domains/pdf/presets.js` (new)
- `src/domains/pdf/routes/pdf.js`
- `src/domains/pdf/__tests__/presets.test.js` (new)

### 10) Preset revision history + rollback (backend-only)

- Added immutable revision table for preset snapshots:
  - stores revision number, reason, full snapshot JSON, and timestamp
- Added backend revision helpers for mapping snapshot/revision payloads.
- Added ownership-protected revision endpoints:
  - `GET /api/pdf/presets/:slug/:presetId/revisions`
  - `POST /api/pdf/presets/:slug/:presetId/rollback`
- Preset create/update now append revision entries automatically.
- Rollback restores preset state from a specific revision and records a rollback revision.

Files:

- `migrations/20260526013000_create_comp_card_preset_revisions.js` (new)
- `src/domains/pdf/presets.js`
- `src/domains/pdf/routes/pdf.js`
- `src/domains/pdf/__tests__/presets.test.js`
- `tests/app.test.js`

### 11) Preset capacity + revision retention policy (backend-only)

- Added preset count limit per profile (`MAX_PRESETS_PER_PROFILE = 40`) to prevent unbounded growth.
- Added immutable revision retention policy (`MAX_PRESET_REVISIONS = 50`) with automatic pruning of older revisions.
- Applied pruning after create/update/rollback revision writes.
- Preset create path now enforces capacity inside transaction and returns deterministic conflict code:
  - `PRESET_LIMIT_REACHED`
- Preset/revision writes remain atomic and now include stable error code passthrough on status-based errors.

Files:

- `src/domains/pdf/routes/pdf.js`

### 12) Preset export/import APIs (backend-only)

- Added preset export endpoint:
  - `GET /api/pdf/presets/:slug/:presetId/export`
  - Returns versioned, portable payload for seed/layout/style/locks.
- Added preset import endpoint:
  - `POST /api/pdf/presets/:slug/import`
  - Supports payload import with optional `overwriteExisting` by preset name.
  - Uses transactional writes + revision entries (`import-create` / `import-overwrite`).
- Extended preset response shape with a normalized `payload` object for portability.

Files:

- `src/domains/pdf/routes/pdf.js`
- `src/domains/pdf/presets.js`
- `src/domains/pdf/__tests__/presets.test.js`
- `tests/app.test.js`
