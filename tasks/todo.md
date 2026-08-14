# Comp card import — plan

Plan reference: `docs/pholio-product-plan-2026-08.md` A3 "Add", "On uploading an
existing comp card", C3 "Biometric privacy".

Ship **import source** only: upload an existing agency card, extract text, propose a
pre-fill, let the talent confirm each field. Attachment ("existing agency card",
dated, secondary) is explicitly out of scope.

## Architecture decisions

- **Text and layout only.** No face detection, no face-geometry template, no stored
  embedding, no cross-image identity linking — not even transiently. C3 design rule.
- **Text layer first.** A comp card exported from InDesign/Canva carries a real text
  layer; `pdfjs-dist` reads it deterministically with per-item coordinates and font
  size. No model in that path, so it is exactly reproducible and unit-testable.
  Vision OCR is the fallback for flattened/scanned cards and image cards only.
- **Proposal, never a silent write.** Extraction produces a reviewable proposal
  persisted in `comp_card_imports`; nothing touches `profiles` until confirm, and
  confirm only applies fields the talent explicitly accepted.
- **No capture date, ever.** An imported card cannot date a photograph, so import
  writes no `captured_at` and creates no image rows. `digitals-freshness.js` stays
  untouched.
- **Measurements are declared-on-import, never measured.** New
  `profiles.measurements_source` records provenance so an agency-visible "last
  updated" cannot read as a fresh tape measurement.
- **Never dead-ends.** Every failure mode (no text layer, no Groq key, model error,
  junk output, low confidence) returns a usable empty proposal that falls through to
  manual entry. No human queue anywhere in this flow (lessons.md 2026-07-29).
- **No Studio+ gate** on upload, extraction, or pre-fill. A1 invariants 2/3.

## Tasks

- [x] Confirm branch base, install both trees
- [x] Read plan A3/C3, talent CLAUDE.md + DESIGN.md, lessons.md skin-ratio entry
- [x] Verify `pdfjs-dist` text+layout extraction works in CJS with no native canvas
- [ ] `src/shared/lib/pdf-text.js` — text layer + coordinates, line grouping
- [ ] `src/domains/talent/services/comp-card-import/units.js` — unit inference
- [ ] `.../parse-card.js` — name, agency, measurements, shot types from lines
- [ ] `src/domains/ai/comp-card-vision.js` — Groq vision OCR, transcription only
- [ ] `.../extract.js` + `.../index.js` — orchestration and proposal build
- [ ] migration: `comp_card_imports` + `profiles.measurements_source`
- [ ] `src/domains/talent/routes/comp-card-import.js` + mount
- [ ] `docs/comp-card-import-architecture.md` — the compliance position
- [ ] Backend tests (`npm test`)
- [ ] Client: upload → review → confirm UI, talent design vocabulary
- [ ] Client tests, lint, production build
- [ ] Migration down/up verification
- [ ] Run the app, screenshot the flow

## Review

(filled in at the end)
