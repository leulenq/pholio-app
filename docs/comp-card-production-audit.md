# Comp Card System — Production Audit (2026-06-12)

Method: industry research refresh; 7-case real-world matrix (men, kids,
long names, 1–2 image pools, missing stats/contact, dimensionless untyped
images) rendered to PDF and visually inspected; code audit of the
composition pipeline; full test suite review. Critical findings were FIXED
in this pass and locked into CI (`__tests__/audit-regression.test.js`).
Suite: 283 tests green.

## 1. Industry-standards lens

| Standard | Status |
|---|---|
| 5.5×8.5in two-sided, front hero+name, back 3–5 photos + stats + booking | ✅ |
| Face-first hierarchy; uncluttered; only essential info | ✅ |
| Stats formats (women B/W/H order, men chest/inseam/suit `40L`, kids age + clothing size, dual units, adult age/weight omitted) | ✅ verified across matrix |
| Kids cards carry guardian contact | ✅ **fixed in audit** (was "Direct Bookings"; now "Guardian Contact") |
| Representation or bookings block | ✅ |
| Print: 0.125" bleed canvas, 12pt/300gsm guidance, CMYK | ✅ **addressed** — `?print=1` exports a 5.75×8.75 bleed canvas (0.125in, page-edge imagery extended through the bleed). RGB retained by design: digital-first, online printers convert; CMYK proofing stays with the shop. |
| Photo recency (≤6 months) | ✅ **addressed** — engine warns when the newest portfolio photo exceeds 6 months; surfaced as a `composed-photos-stale` guardrail and a refinement note in /media. |

## 2. Visual-design lens (issues found → status)

| # | Finding | Severity | Status |
|---|---|---|---|
| V1 | **Long names clipped off the page** — the 17pt floor *guarantees* overflow when even 17pt doesn't fit | CRITICAL | **FIXED**: 3-stage degradation (relax tracking → stack name on two lines → 12pt absolute floor); fit invariant asserted in CI |
| V2 | **Single-image talent → empty white back page** (0 photo cells) | CRITICAL | **FIXED**: hero reuse extended to 0–2 candidate pools; ≥1 back cell guaranteed whenever ≥1 image exists |
| V3 | Stats area carved as dead space when profile has no stats | HIGH | **FIXED**: `stats.skip` — photos take the full region |
| V4 | Front stat line ellipsized (full inline strip too long) | MED | **FIXED**: compact 4-stat form (height + B/W/H), never dress/shoes |
| V5 | Hierarchy/typography/logo/crops/booking on the standard matrix | — | Sound after v3.1/v3.2 passes: gold adaptive wordmark dynamically placed, contrast-managed name bands, subject-presence crop healing, booking parity. Verified again across 7 matrix cases. |

## 3. Technical/product lens

| # | Finding | Severity | Status |
|---|---|---|---|
| T1 | **Production URL safety**: the printed portfolio URL + PDF link annotation derived from the request host — during Puppeteer generation that is the INTERNAL host (`localhost:3000` baked into dev-generated cards; any misconfigured `PDF_BASE_URL` would ship wrong URLs in prod) | CRITICAL | **FIXED**: printed/annotated URL now from `config.appUrl`; request host used only for local image fetches |
| T2 | No edge-case coverage — suite was happy-path (full pools, normal names, complete stats) | HIGH | **FIXED**: audit battery (8 scenario tests, invariants: no-throw, name-fit math, ≥1 back cell, no unsafe crops, layout validation) |
| T3 | Selection logic | — | Curation rules verified (full-length first, register variety, market relevance); crop healing (bench swap → cell trade → matting) verified under hostile pools |
| T4 | Export readiness | — | 2-page 396×612pt, ~4.4MB (<5MB serverless/email limit), metadata + link annotations verified; watermark for non-pro |
| T5 | Groq dependency | — | Hard-gated; deterministic fallback exercised across the whole matrix (this audit ran briefless). **addressed** — briefs persist to `profiles.pdf_design_brief`, fingerprinted against their inputs (images/casting/category/representation); regeneration varies geometry under the same authored direction |
| T6 | `ai-advisor.js` is dead code in the composed path (superseded by art-director) | LOW | **removed** — art-director fully supersedes it |
| T7 | Forensics fetch latency in first render | LOW | **addressed** — dimensions + forensics (incl. focal) now measured at upload time into image metadata; render path is cache-only |

## 4. Confidence statement
Every matrix scenario now renders a professional card with zero unsafe
crops, no overflow, no empty pages, and correct category formatting — and
those scenarios are CI-locked, not one-off checks. All findings, every severity, are now closed (see §5).


## 5. Addendum — full remediation + typography-placement safety (same day)

Every finding above, including LOW, is now closed. Additionally, a
**typography-placement safety system** (`composition/type-safety.js`) was
added as a production blocker:
- On-image text must pass contrast (worst-cell WCAG with solved scrim),
  quiet-zone, AND protected-subject verification — a face zone derived from
  the measured attention focal point plus a backdrop-deviation subject mask.
- Unverifiable imagery (no measurements / no focal) NEVER carries on-image
  type — names go on paper; full bleeds are demoted to floated treatments
  when no band passes. The front stat line and the gold wordmark obey the
  same protections.
- Enforced in the director and double-checked by a `composed-type-safety`
  ERROR guardrail. Covered by a dedicated 10-test suite + updated fixtures;
  280 PDF-domain tests green.
