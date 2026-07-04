# `/media` — Comprehensive Industry Audit

Audience: talent (creation/pride mindset), read by agencies/scouts. Graded P0/P1/P2.
Method: three parallel Booker audits (comp cards+digitals · organization/editing/metadata · gaps), grounded in the industry knowledge base and the real code. De-duplicated and reconciled below.

## Verdict

`/media` is the **most credible surface in Pholio** — it would pass a working booker's first glance. Terminology is exact, the PITS signal model genuinely encodes how a booker reads a digital (and actively flags styled book frames masquerading as digitals), the comp-card stats engine is agency-grade (gendered field order, dual-unit, minor suppression), and a real usage/licensing rights schema exists in the DB.

The headline problems are **structural and compliance**, not cosmetic:
1. The **minor-consent gate has holes** — body/swim imagery and the in-workspace "Digitals read" coaching are not consent-gated, while the parallel readiness path correctly is. The two surfaces disagree. **Production blocker.**
2. **Recency is measured from upload, not shoot date** — old digitals read as "fresh" for 90 days. A recency check that can lie.
3. **The platform is built around one book → one comp card → one market.** Digitals and Book share one flat grid; `image_sets` and `comp_card_presets` infrastructure exist but are **dead-wired**; the rich rights model is ~60% invisible.

---

## What's STRONG (do not regress)

- **Terminology is correct on every primary string** — "Comp card", "The Book", "Digitals read", "Test shoot", "5.5 × 8.5 · Two-sided" (`frameTaxonomy.js:44-60`, `CompCard.jsx:144,221`, `MediaWorkspace.jsx:378`). The fastest real-vs-fake tell, and it passes.
- **Digitals-vs-book distinction enforced in code** — `isDigitalSlot()` separates the objects and `portfolio_as_digital` / `busy_background` advisories flag a styled/retouched frame mis-tagged as a digital (`packageIntelligence.js:71-93`, `frameTaxonomy.js:169-174`). The single best "a model built this" feature.
- **Comp-card stats engine is agency-grade** — gendered field order, dual-unit (`178 cm / 5'10"`), shoe US/EU, missing values skipped (never placeholders), age/weight/address never printed for adults; kids track suppresses bust/waist/hips and shows Age (`stats-formatter.js`).
- **Comp-card minor compliance is correct** — preview/view/download all blocked for an unconsented minor (`CompCard.jsx:59`, `pdf.js:1420,1698`).
- **Book is sequenced** — drag-reorder + explicit cover selection (`MediaWorkspace.jsx:295-315`); the opening frame matters.
- **Recency windows are right per artifact** — digitals ≤90 days, comp-card photos ≤6 months.
- **Rights schema is real licensing** — `image_rights.usage_scope/territory/start_at/expires_at/exclusive/model_release_ref` (`migration 20260326120000`); `rights_status:'cleared'` gated on license + credit both sides.
- **Restore-original after edit** preserves the unretouched source (`media.js:1750-1825`); moderation/CSAM screening fails closed.

---

## P0 — must fix before production (trust / compliance)

1. **Minor consent gate doesn't cover swim/body imagery — only full-length framing.** `SENSITIVE_SHOT_TYPES`/`minorBlocksSensitiveImage` (`media.js:42,86-99`) gate only `shot_type ∈ {full_length, full_body}`. A minor can set `style_type:'swimwear'`, tag `half_body`/`three_quarter`, or leave a swim frame untyped with no guardian gate; the PITS `body_visibility:full_length` signal is never consulted. Fix: add swimwear/fitness style + `body_visibility ∈ {three_quarter,full_length}` to the sensitive set; gate upload/visibility of body imagery, not just the tag.

2. **The `/media` "Digitals read" panel handles minors as adults.** `DigitalsBookPanel → analyzePortfolio → analyzePackageIntelligence({images})` takes no profile/consent state (`packageIntelligence.js:194-223`). So an unconsented 15-year-old is coached in-workspace to "Add a full-length frame so bookers can verify proportions" and "Back view" — exactly what the readiness path withholds behind `minorSensitiveFieldsUnlocked`. Fix: thread profile/minor state in and suppress full-length/back/measurement advisories until guardian consent; reuse the existing gate so the two surfaces agree.

3. **Recency is measured from upload, not shoot date.** On upload `captured_at` defaults to `now()` (`media.js:856`); `getImageAgeDays` uses `captured_at||created_at`. A year-old digital reads "fresh" for 90 days, so the `stale_digitals` advisory + `digitals_recency` readiness lie to talent and agency. Comp-card recency has the same bug (`photo-intelligence.js:413` reads `created_at`). Fix: prompt/require a real shoot date on upload (or read EXIF); don't silently stamp `captured_at = now`.

---

## P1 — real workflow / state gaps

4. **No digitals-vs-book organization in the UI.** Every frame renders in one flat "The Book" grid regardless of `image_type` (`MediaWorkspace.jsx:398-449`). The `image_sets` table + full CRUD exist (`media.js:548-690`, `useMedia.js:55-76`) but are **dead-wired** — `FrameEditor` is mounted with `mediaSets={[]}` (`MediaWorkspace.jsx:349`), so the set picker is permanently empty. Fix: group the grid by type (Digitals / Book / Tests / Campaigns) and wire the existing sets API into a dated, current **Digitals set** beside the book.

5. **Digitals are metadata, not a deliverable.** There's an exportable comp-card PDF and a public Book, but no digitals export/sheet/set. When a booker says "send me your digitals," the talent can't produce the canonical object (raw, dated 5-frame set + measurements). Fix: a Digitals deliverable — dated contact sheet of raw frames only, measurements stamped.

6. **The rich rights/usage model is ~60% invisible.** `FrameEditor` exposes only `license_type/rights_status/copyright_owner/photographer_name` (`FrameEditor.jsx:99-104`); usage scope, territory, expiry, exclusivity, and the **model-release reference** are uncapturable — yet the form advertises "Required for comp card export and agency distribution." Fix: surface the full rights fields + a model-release upload; show expiry state; block expired-rights frames from packages/export.

7. **"Digitals set" definition conflated with book range.** The readiness checklist (`portfolioGapAnalysis.js:15-51`) folds `editorial`/`lifestyle` (resolved only from `image_type:'portfolio'` book frames) into the same "Digitals read" meter, and ¾-length isn't its own slot (absorbed into `fullbody`). Blurs the raw-vs-styled line the rest of the system enforces. Fix: score "Digitals set (5 raw frames: headshot·¾·full·profile·back)" and "Book range" separately.

8. **No board/division awareness in taxonomy or readiness.** Division changes what "good" means (standards §2), but readiness slots are a single generic fashion/commercial blend — a curve/petite/parts/kids/fitness/mature talent gets identical expectations. Fix: scope readiness + advisories to the talent's board(s).

9. **No tearsheet concept.** Tears (published editorial/campaign pages) are distinct career currency; `editorial`/`runway` are deprecated→"Book" and there's no `tearsheet` type with publication/credit. Fix: add `tearsheet` (publication/issue/credit), distinct from unpublished `campaign`.

10. **Measurements aren't bound to the digitals set or dated.** Digitals are "accompanied by accurate measurements," re-confirmed/current; in `/media` they're never surfaced with digitals and have no "confirmed on <date>". (Now partly addressed: apply Stats added `measurements_updated_at`.) Fix: surface + version measurements on the digitals set.

---

## P2 — realism / polish

- **No surfaced comp-card library** despite `comp_card_presets` infra (40 presets, revisions). See "Comp card variants" below. (`pdf.js:42-43,453-518`)
- **Retouch on digitals has no raw-stays-raw guardrail** — `retouched_at` offered on every frame incl. `image_type:'digital'` (`FrameEditor.jsx:630-634`). Hide/deter on digitals; warn on replace.
- **Back-page image count not anchored to "4 standard / 3–5"** — density-driven 2–6 (`back-program/synthesize.js`); bias default to 4, floor at 3.
- **Two dead components**, one with a banned pattern — `ReadinessBar.jsx` + `Recommendations.jsx` imported nowhere; `Recommendations.jsx:49` renders a banned eyebrow chip and pulls the **agency** `useStats` hook on a talent surface. Delete or fix.
- **Cover auto-promotes first uploaded frame** regardless of headshot suitability (`media.js:920-933`).
- **Two recency windows unexplained to talent** (6mo card vs 3mo digitals) — label each to its artifact.
- **Video/showreel has no home** — pipeline is image-only (`ALLOWED_MIME` JPEG/PNG/WebP); only a profile `video_reel_url` link. Add motion asset type.
- **Dress sizing US/EU only** — add IT/FR/UK for international submissions.
- **No e-comp/package builder in `/media`** — `talent_submission_packages` table+API exist but the builder lives only in Apply.

---

## Comp card variants / library — the model already exists

`comp_card_presets` (+ `comp_card_preset_revisions`) is a real persisted variant library: per-profile **named** variants, each storing `seed`, `layout_family`, `style_variant`, `lock_hero_id`, `lock_grid_ids`, `last_used_at`; unique per (profile, name); max 40; revisioned. This is precisely an engine-authored (not template) variant model. It is **unexposed** in `/media` and `/apply`.

Build to open it up:
- **/media:** "Save this take to your library" (name it) + manage variants; "New direction" reseeds, saving pins it.
- **/apply Page 5:** list the talent's saved variants, pick which to send; record the chosen preset on the application so the agency receives that exact rendering; preview the selected variant (with the flip).
- Ties into multi-market reality: a commercial card vs an editorial card vs a per-board co-branded card.

---

## Recommended sequence (most credibility per unit of work)

1. **Wire what already exists** — expose full `image_rights` fields in FrameEditor; activate `image_sets` (`mediaSets={[]}` → real sets); surface `comp_card_presets` as a library. High credibility, near-zero schema work.
2. **Honest dating + true digitals object** — capture real shot date, per-frame age, a dated Digitals set/deliverable split from the Book.
3. **Close the minor gates** (P0 #1, #2) — swim/body + the Digitals-read panel; this should block release.
4. **Rights/consent hardening** — model release as an artifact; per-image minor consent + body-image visibility restriction.
5. **Multi-market comp-card library + in-media package builder**, then tearsheet and motion asset types.

**Production gate:** the minor-coaching gaps (P0 #1, #2) must close before release. Everything else is strong enough to ship and iterate.
