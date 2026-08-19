# Spec Registry Rebuild — Methodology

**Date:** 2026-08-19
**Scope:** Ground-up rebuild of the agency application-requirements dataset ("Spec Registry")
as a research deliverable: agency selection, per-agency requirements research, a proposed data
model, and a recommended launch dataset. No implementation, no seeding, no migrations — docs only.

## 1. The standard this research is held to

A talent should be able to use Pholio to understand and prepare for an agency's real
application process **with no avoidable surprises when they reach the agency itself** — including
the package they download to submit to an off-Pholio agency. Every methodological choice below
serves that standard.

The target pipeline the research models:

> **agency's real application → complete evidence model → clean normalized Spec Registry →
> clear talent-facing brief**

Accuracy and completeness of the evidence model outrank preserving existing architecture,
schema convenience, and speed.

## 2. Posture toward prior work

All existing agency research — `data/spec-registry/v1/` (schemas, ten specs, evidence),
`src/domains/spec-registry/`, and prior strategy docs — was treated as **untrusted input**:
prior art and a hypothesis to test, never ground truth and never a starting point.

Concretely:

- The rebuild is **from scratch, from primary evidence**. Per-agency research lanes were
  explicitly prohibited from reading the v1 dataset, so no v1 normalization, label, or claim
  could leak into new evidence capture.
- The v1 dataset was separately **audited** (live re-verification of its evidence URLs,
  internal-quality review, schema-gap analysis). That audit informs *what to avoid* — the
  documented failure modes were not only factual: duplicated/near-duplicated requirements,
  bad canonical labels and capitalization, raw research language leaking into the frontend,
  and awkward representations of what agencies actually ask for. These become explicit design
  requirements on the normalization layer (see `MODEL.md`), not reasons to reuse v1 records.
- v1 appears in the deliverables only as the *mapping target* in `MODEL.md` (what of reality
  the current schema can and cannot represent), as the mission requires.

## 3. Research process

### Phase 1 — Selection research (three parallel lanes, 2026-08-19)

1. **Landscape lane:** candidate pool of 32 agencies. Per candidate: divisions, application
   channel(s), live URL verification (HTTP status, redirects), NY DOL model-management registry
   cross-reference (in-repo Socrata snapshot dated 2026-08-15), reputation/scam signals,
   persona fit for the launch cohort, and inspectability (public form vs login-gated vs
   robots-hostile, per-host robots.txt capture).
2. **Dataset-audit lane:** critical audit of all ten v1 specs with live re-verification of
   every recorded evidence URL (including re-hashing a captured JS bundle), plus first-principles
   assessment of the v1 schema and taxonomy.
3. **FWB lane:** verification of Fashion Week Brooklyn's actual current registration
   infrastructure, parsing each Google Form's complete field structure (labels, types, required
   flags, options) from the form's publicly served `FB_PUBLIC_LOAD_DATA_` payload, read-only.

### Phase 2 — Deep per-agency research (ten parallel lanes, one per selected agency)

Each lane followed a shared written brief (reproduced in essence below) and produced one
evidence file per agency with a fixed 12-section structure: identity & channels; flow map;
field inventory; uploads; photo/shot instructions; eligibility; minors & guardians; consent &
legal; process facts; contradictions & uncertainties; a draft talent-facing brief; and a
numbered evidence log that every claim cites.

**Form-level observation was mandatory, not optional.** Lanes inspected the actual application
forms with a real browser (headless Chromium via Playwright): full control inventory (labels,
types, required semantics, placeholder text, option lists verbatim, `maxlength`/`pattern`/
`min`/`max`), `accept` strings and size caps on file inputs, conditional field visibility
(observed by changing selects/radios and re-dumping the DOM), multi-step structure, CAPTCHA
presence, and client-side validation behavior observed by typing into fields — with a
network-request watch to abort if any input triggered a transmission.

### Phase 3 — Integration and adjudication (lead)

The lead (this document's author) integrated lane outputs, spot-checked load-bearing claims,
adjudicated contradictions (rules in §5), designed the proposed model, and wrote the
deliverables. Lanes reported; only the lead committed.

## 4. Hard rules the research operated under

1. **Never submit a form. Never create an account. Never send an email. Never transmit
   applicant data to any agency.** Observation stops at the gate; a flow that cannot be
   observed without submitting is recorded as gated/unobserved — never guessed.
2. Typing into a field client-side to observe validation is acceptable **only** when it does
   not transmit (verified by watching network requests); submission is never acceptable.
3. **Respect robots.txt.** Only pages needed for verification were fetched; no crawling.
   Hosts with genuinely hostile postures (e.g., Storm's site-wide `Disallow: /`) were excluded
   from automated verification and are recommended for manual review only.
4. **Minors and guardian handling get elevated care.** Guardian/consent requirements are among
   the most consequential facts to get right; every lane had an explicit minors section, and
   "nothing published about minors" is recorded as a finding, not skipped.
5. **Never label public-source research "agency approved."** These are requirements *published
   by* agencies, checked on a recorded date — Pholio holds no agency authorization, and
   seeded real agencies are reference entries (per the standing legal posture: Pholio never
   implies procurement or placement).

## 5. Claim labeling and adjudication

Every claim in the per-agency files carries exactly one label:

| Label | Meaning |
| --- | --- |
| **FACT** | Published verbatim by the agency (quote + URL + retrieval timestamp). |
| **PREFERENCE** | Published soft ask ("we prefer", "ideally"). |
| **OBSERVED** | Structure/behavior seen in the live form or DOM (with excerpt/attribute). |
| **INFERENCE** | Researcher reasoning, explicitly marked, with its basis. |
| **UNCERTAIN** | Could not be verified; the attempt is described. |
| **CONTRADICTION** | Sources disagree; both sides recorded verbatim. Never silently resolved. |

Normalization conservatism (rules the registry model in `MODEL.md` enforces):

- Verbatim means verbatim: the agency's exact words, spelling, and capitalization are
  preserved alongside any canonical form; canonical labels are a separate, curated layer.
- A visible field without required-markers is *present, requiredness unknown* — never
  normalized to optional.
- Absence of a published rule is an **unknown**, not permission ("no size limit found" ≠
  "unlimited").
- Scoping is preserved exactly (a rule published for women is not generalized).
- Third-party aggregator claims (Backstage-style listings, directory sites) are never treated
  as agency facts; where used at all they are labeled as third-party.

Adjudication precedence when sources disagree: **live first-party form DOM > live first-party
page text > first-party statements elsewhere (official social, PDFs) > registry/government
records for legal identity > third-party sources.** Recency wins within a tier; both sides are
retained as CONTRADICTION whenever the loser is also first-party.

## 6. Environment and tooling notes (for reproducibility)

- All retrievals dated 2026-08-19 (UTC) unless noted.
- Browser: Playwright driving the full Chromium binary. Environment-specific: this session's
  egress proxy resets Chromium's default TLS ClientHello (post-quantum key-agreement size);
  the fix was an enterprise policy disabling post-quantum key agreement and ECH — TLS
  verification remained enabled throughout.
- Google Forms structure was parsed from the public `FB_PUBLIC_LOAD_DATA_` bootstrap variable
  in each form's viewform HTML (no interaction, nothing entered or submitted).
- NY DOL registry facts cite the in-repo snapshot (`docs/evidence-nydol-registry-2026-08-15.json`,
  captured 2026-08-15); "registered" claims are as-of that date.

## 7. Known limits

- **Gated flows.** Anything behind an actual submission (post-submit confirmation screens,
  emails, multi-step flows past a transmit boundary) is unobservable under the hard rules and
  is recorded as such. Server-side validation can differ from client-side; only the latter is
  observable without submitting.
- **Drift.** Requirements change silently. Every fact carries a retrieval date; the registry
  model treats freshness as first-class (review deadlines, not inferred policy end dates).
  The FWB record drifted measurably in the four days before this research — treat all
  captured facts as snapshots, not permanent truths.
- **Email-only channels** have no DOM to observe; their specs rest on published prose and are
  inherently less precise. This is recorded per-agency rather than papered over.
- **Open-call schedules** are the most volatile fact class (day/time changes, pauses); they are
  captured verbatim with dates and flagged as high-drift.
