# PITS Product Test Matrix

**Date:** 2026-06-24  
**Scope:** Classification (PITS) → readiness → media/book display → apply → comp-card gating  
**Method:** Product simulation harness (`tests/talent/pits-product-harness.js`) + 13 user-conflict scenarios (`tests/talent/pits-product-matrix.test.js`) + existing unit tests

Run the matrix:

```bash
npx jest tests/talent/pits-product-matrix.test.js
```

---

## Executive summary

| Verdict | Count | Meaning |
|---------|-------|---------|
| **PASS** | 6 | Surfaces agree; guidance is clear |
| **CONFUSING** | 5 | Logic is internally consistent but average users would feel blocked or misled |
| **DRIFT** | 2 | Different surfaces disagree on the same requirement |
| **FAIL** | 0 | Hard breakage (none after book-vs-digital guidance shipped) |

**Bottom line:** The Mia-class problem (book full-length visible, readiness blocked) is now **explained** in readiness, gating, and book intelligence. Several **cross-surface drifts** remain — especially Apply dossier vs Send checks, `primary_photo_id` bypass, untyped pre-PITS windows, and recency semantics.

---

## Test matrix by category

### A. Classification → readiness

| ID | Scenario | Pass? | User experience | Notes |
|----|----------|-------|-----------------|-------|
| A1 | PITS auto-tags runway as `portfolio` + `full_length` | ✅ PASS | Media shows "Full length · Book"; readiness asks for digital | Post-classify behavior correct |
| A2 | Suggest band — columns empty, metadata has suggestion | ⚠️ CONFUSING | Frame looks untyped in UI; may count as digital by default | Pre-confirm window |
| A3 | Pending band on upload | ✅ PASS | "N frames still need a type read" info advisory | OK |
| A4 | Untyped `shot_type` + empty `image_type` before PITS | ⚠️ CONFUSING | Two untyped frames can unlock readiness before portfolio tag lands | **High-risk race** |
| A5 | `image_type=digital` + editorial/heavy retouch signals | ⚠️ CONFUSING | Slot counts as met; advisory warns "styled book work" | Correct industry logic, mixed signal |

### B. Book vs digitals (user-conflict core)

| ID | Scenario | Pass? | User experience | Notes |
|----|----------|-------|-----------------|-------|
| B1 | **Mia:** portfolio headshot + portfolio full-length | ✅ PASS* | Sees 2 full frames; blocked with "agencies still need one clean digital full-length shot" | *Was FAIL before guidance |
| B2 | Five portfolio frames, zero digitals | ✅ PASS + ⚠️ | Rich book looks complete; dual advisories for headshot + full-length | High frustration risk without copy |
| B3 | Clean digitals (digital headshot + digital full-length) | ✅ PASS | Unblocked end-to-end | Golden path |
| B4 | Three-quarter digital satisfies full-length slot | ✅ PASS + ⚠️ | Readiness: "Full-Length Digital"; caption: "Three-quarter · Digitals" | Taxonomy label mismatch |

### C. Readiness & gating

| ID | Scenario | Pass? | User experience | Notes |
|----|----------|-------|-----------------|-------|
| C1 | Comp card gate with book full-length only | ✅ PASS | Gate shows contextual `why` under photo task | Fixed via `resolveReadinessGuidance` |
| C2 | `primary_photo_id` = portfolio headshot | 🔀 DRIFT | Profile readiness: headshot ✅; Apply Send: headshot ❌ | Bypass only in strength |
| C3 | Stale digitals (100 days) | ✅ PASS + 🔀 | Market/profile unlock; Apply blocks "Current digitals" | `isCoreReady` ignores recency |
| C4 | Server `getStrengthUI` 85–99 vs client | 🔀 DRIFT | Server: "Strong package"; client: "Submission ready" | Mirror copy drift |

### D. Apply flow

| ID | Scenario | Pass? | User experience | Notes |
|----|----------|-------|-----------------|-------|
| D1 | Send-scene checks with core digitals only | ✅ PASS | Can submit when headshot, full-body, recency, stats, contact met | OK |
| D2 | `buildFitSignals` "Recent digitals" | 🔀 DRIFT | Shows **not met** when optional gaps exist (side profile, smile) even if recency fresh | **Bug:** conflates optional coverage with freshness |
| D3 | `auditSubmissionPackage.canSend` vs Apply | 🔀 DRIFT | `canSend=true` with stale digitals; Apply blocks | Internal API inconsistency |
| D4 | No server-side apply validation | ⚠️ CONFUSING | API accepts POST without digitals re-check | Client-only gate |

### E. Media / book display

| ID | Scenario | Pass? | User experience | Notes |
|----|----------|-------|-----------------|-------|
| E1 | Caption format `Framing · Use` | ✅ PASS | "Full length · Book" matches user mental model | OK |
| E2 | Book intelligence suppresses generic gap when contextual advisory exists | ✅ PASS | "Add a digital full-length" not "Add a full-length frame" | Fixed |
| E3 | `portfolioGapAnalysis` checklist label "Full Body Shot" | ⚠️ CONFUSING | Checklist still says "Full Body Shot" not "Full-Length Digital" | Minor copy drift vs readiness |
| E4 | `BOOK_MIN_FRAME_COUNT` constant vs hardcoded `5` | 🔀 DRIFT | Constants file says 5; gap analysis duplicates literal | Maintenance drift |

---

## Cross-surface drift registry

These are **documented mismatches** detected by `detectDrift()` in the product harness. They are the highest-priority product fixes.

| Code | Surfaces | What disagrees | Severity |
|------|----------|----------------|----------|
| `headshot_gate_mismatch` | Readiness vs Apply | `primary_photo_id` / `hero_image_path` bypass in strength only | **High** — user unlocks profile but can't send |
| `fit_recent_digitals_vs_optional_gaps` | Apply dossier vs Send checks | "Recent digitals" uses optional `digitalsGaps`, not `recency.isStale` | **High** — misleading agency fit signal |
| `audit_can_send_vs_apply` | `auditSubmissionPackage` vs Apply | `canSend` ignores staleness; Apply blocks on "Current digitals" | **Medium** — dev confusion, possible future bug |
| `fit_recent_digitals_vs_recency` | Apply dossier vs package intel | Opposite direction if recency stale but optional gaps filled | **Medium** |
| Strength UI copy | Server vs client mirror | "Strong package" vs "Submission ready" at 85–99 | **Low** — cosmetic |
| Recency copy vs constant | Readiness vs package intel | "8–12 weeks" in strength; 90 days in stale advisory | **Low** — ~13 weeks |

---

## Taxonomy & naming problems

| Area | Problem | Recommendation |
|------|---------|----------------|
| Readiness label | "Full-Length Digital" vs gap checklist "Full Body Shot" | Align checklist labels to digitals vocabulary |
| Three-quarter | Counts for full-length requirement; caption says "Three-quarter" | Add readiness hint: "Three-quarter counts for full-length" or unify label |
| `image_type` display | "Book" for `portfolio` — correct internally, some talent say "portfolio" | Keep "Book" in product UI; avoid "portfolio" in user copy |
| `buildFitSignals` | "Recent digitals" ≠ recency | Rename to "Complete digitals set" or drive from `!recency.isStale` |
| Apply checks | "Full-body" vs readiness "Full-Length Digital" | Harmonize to "Full-length digital" |
| Gate features | Market locked copy still says "full-body photo" | Update to "full-length digital" |
| `auditSubmissionPackage.canSend` | Name implies full audit; only checks 2 slots | Rename or include recency |
| Untyped default | Empty `image_type` → digital slot | Show "Use: unset" state; don't count untyped toward required until confirmed |

---

## What passes (confidence areas)

1. **Portfolio vs digital counting** — consistent across readiness, apply checks, package intelligence, and comp-card gate (when using same helpers).
2. **Book-vs-digital contextual guidance** — Mia scenario now surfaces in readiness `why`, gating tasks, and book intelligence advisories.
3. **PITS classification → column write → display** — auto band correctly writes `portfolio` and media captions reflect it.
4. **Stale digitals detection** — 90-day window consistent in package intel, apply "Current digitals", and gap analysis recency check.
5. **Classification quality advisories** — `portfolio_as_digital`, `stale_digitals`, `busy_background` surface in apply audit and book panel.

---

## What fails

**None** in the current matrix after book-vs-digital guidance. Prior FAIL (Mia with no explanation) is now PASS.

---

## What is confusing even when "correct"

1. **Untyped pre-PITS window** — images without `image_type` default to digitals slot; user can briefly pass readiness with mis-tagged uploads.
2. **Rich book, zero digitals** — five styled frames look submission-ready; only guidance prevents rage-quit.
3. **Styled `image_type=digital`** — requirement met + warning advisory simultaneously.
4. **Three-quarter as full-length** — industry-correct, label-confusing.
5. **Profile unlocked, Apply blocked** — when `primary_photo_id` bypasses headshot in readiness but not apply.
6. **Market/Intel unlocked with stale digitals** — core gate ignores recency; apply does not.
7. **Agency dossier "Recent digitals"** — false negative when optional slots missing despite fresh core digitals.

---

## Recommended fix priority (product, not infra)

| P | Fix | Impact |
|---|-----|--------|
| P0 | Fix `buildFitSignals` — "Recent digitals" should use `!packageAudit.recency.isStale` | Stops lying on agency dossier |
| P0 | Align `primary_photo_id` bypass — either remove or mirror in Apply | Stops unlock/send mismatch |
| P1 | Don't count untyped images toward required digitals until PITS confirm or user sets Use | Closes pre-classification loophole |
| P1 | Align `auditSubmissionPackage.canSend` with `isSubmissionReady` | Single source of truth |
| P2 | Harmonize labels: Full-Length Digital everywhere user-facing | Reduces taxonomy confusion |
| P2 | Server/client `getStrengthUI` parity | Polish |
| P3 | Server-side apply validation | Defense in depth |

---

## Test coverage map

| Layer | File | Status |
|-------|------|--------|
| Heuristic classifier | `tests/ai/heuristic-shot-classifier.test.js` | ✅ |
| Groq merge | `tests/ai/classify-portfolio-image.test.js` | ✅ |
| Classification policy | `tests/ai/image-classification-policy.test.js` | ✅ |
| Package intelligence | `tests/talent/package-intelligence.test.js` | ✅ |
| Profile strength | `tests/dashboard/profile-strength.test.js` | ✅ |
| **Product matrix** | `tests/talent/pits-product-matrix.test.js` | ✅ **NEW** |
| Product harness | `tests/talent/pits-product-harness.js` | ✅ **NEW** |
| `runImageClassification` E2E | — | ❌ Gap |
| Media upload → classify integration | — | ❌ Gap |
| Client mirror parity (automated) | — | ❌ Gap |
| `portfolioGapAnalysis` / `bookIntelligence` | — | ❌ Gap (partially via harness) |

---

## Scenario reference (automated)

| Scenario ID | Verdict |
|-------------|---------|
| `mia-styled-book` | PASS |
| `complete-digitals` | PASS |
| `untyped-full-length-defaults-digital` | CONFUSING |
| `primary-photo-bypass` | DRIFT |
| `stale-digitals` | DRIFT |
| `styled-digital-slot` | CONFUSING |
| `apply-fit-recent-digitals-optional-gaps` | DRIFT |
| `three-quarter-counts-full-body` | CONFUSING |
| `pits-classifies-portfolio-runway` | PASS |
| `book-only-no-digitals` | CONFUSING |
| `comp-card-gate-copy` | PASS |
| `pending-classification` | CONFUSING |
| `suggest-band-no-columns` | CONFUSING |

---

## How to extend

Add scenarios to `SCENARIOS` in `tests/talent/pits-product-matrix.test.js`. Each scenario should include:

- Realistic `images` array (the user’s book state)
- `rules[]` with `severity`: `PASS`, `CONFUSING`, `DRIFT`, or `FAIL`
- `expectedDrifts[]` when documenting known cross-surface bugs

The harness exports `simulateProduct()` for ad-hoc debugging:

```javascript
const { simulateProduct, BASE_PROFILE, daysAgo } = require('./tests/talent/pits-product-harness');
console.log(simulateProduct({ images: [/* ... */] }));
```
