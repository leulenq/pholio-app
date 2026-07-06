# Pholio Match Score System — Architecture & Design

**Status:** Proposed (design + staged build plan). Awaiting sign-off before schema/engine work lands.
**Scope:** Backend match-score system — agency ↔ talent and board/casting ↔ talent fit.
**Author context:** Grounded in (a) the `industry` knowledge base, (b) the *actual* code already in this repo, (c) current regulation (NYC LL144, EU AI Act, GDPR/CCPA).

---

## 0. TL;DR — the decisions

**Q1 — Which score(s)? → All three, because they are three *different jobs*, not two flavors of one.**

| Score | Scope | Question it answers | Primary jobs |
|---|---|---|---|
| **Agency gate** | Agency-wide | "Is this talent even in our universe?" | Talent-side guidance ("agencies you meet the bar for"), inbound triage / keep-on-file, discovery prefilter |
| **Board fit** | Board / division | "Which of our boards would this talent sit on?" | Routing inbound to the right board director, roster organization, talent development guidance, broad discovery |
| **Brief fit** | Casting call / brief | "For *this* client job, rank my shortlist." | Shortlist ranking, package/submission building, application review against a live brief |

The mistake to avoid is collapsing these into one "match %". Selection in the real industry happens at **all three layers with different intent** (§2). Agency = *gate*, board = *typing/routing*, brief = *ranking*. Build them as **one engine with three configuration scopes and inheritance**, not three separate code paths (which is roughly what exists today — see §1).

**Q2 — Which engine? → A layered explainable hybrid. NOT pure weighted scoring, and NOT a black-box model.**

```
  ┌─ 1. HARD GATES (deterministic, disqualifying, auditable) ─────────────┐
  │    age/minors, gender-for-gendered-brief, hard height gates,          │
  │    market/travel, availability & bookout conflicts, usage/exclusivity │
  │    conflicts, representation conflicts, house compliance rules        │
  └───────────────────────────────────────────────────────────────────────┘
             │ (fail → ineligible, with reason. never "weighted away")
             ▼
  ┌─ 2. WEIGHTED STRUCTURED FIT (graded, tunable, defensible) ────────────┐
  │    measurements/stats closeness, experience, location proximity,      │
  │    social reach — GRADED distance funcs, not binary in/out            │
  └───────────────────────────────────────────────────────────────────────┘
             │
             ▼
  ┌─ 3. ALGORITHMIC / INFERENCE LAYER (the part weights can't do) ────────┐
  │    look-fit from image-analysis vectors (fit_score_*),                │
  │    semantic fit via embeddings + optional LLM rerank (free-text brief)│
  └───────────────────────────────────────────────────────────────────────┘
             │
             ▼
  ┌─ 4. EXPLANATION + CALIBRATION ────────────────────────────────────────┐
  │    per-signal reasons, data-completeness confidence, coarse BAND      │
  │    (not false-precision 87 vs 84), full audit record                  │
  └───────────────────────────────────────────────────────────────────────┘
```

Weighted scoring **stays**, but it is *contained* to layer 2 where it is genuinely good. The "intelligence" the brief wants comes from the **look/semantic layer + graded distances + calibration**, not from cranking weight sliders (§5). This also keeps us on the right side of the law: a single opaque 0–100 that drives auto-decisions is exactly what LL144 / the EU AI Act regulate (§7).

**The compliance headline:** Pholio is, functionally, an *employment agency / job-matching tool*. That puts the match score squarely inside NYC LL144 (bias-audit + notice) and the EU AI Act's **high-risk** category (in force **2 Aug 2026**). The system must be **human-in-the-loop, explainable, auditable, and must not use protected attributes as positive scoring inputs.** One concrete existing landmine to fix: `discover-retrieval.js` boosts on **ethnicity / skin tone** (`heritageMatches`) — see §7.4.

---

## 1. What already exists (honest inventory)

Pholio does **not** have a blank slate. It already ships *three* scoring mechanisms and *three* config layers — but they are fragmented and partly overlapping. Any new design must reconcile these, not ignore them.

**Three scoring mechanisms already in the codebase:**

1. **Board weighted-rules engine** — `src/domains/agency/services/match-scoring.js`.
   Hard filters (age/height/gender/critical-comfort) → weighted average over age, height, measurements, body type, comfort, experience, skills, location, social reach. Produces `board_applications.match_score` (0–100) + `match_details`. Driven by `recalculate-board-scores.js`. **This is already a hard-rules + weighted hybrid** — it just lives only at the board layer and uses mostly binary (0/100) sub-scores.

2. **Profile AI "fit scores" (look typing)** — `src/domains/ai/scoring.js` → `scoreFromImageAnalysis()`.
   Maps Groq Vision reads (bone structure, contrast, expression, market signals…) to category propensities: `runway / editorial / commercial / lifestyle / swimFitness`. Persisted on `profiles.fit_score_*` (migration `20260212000003`). **This is a talent-intrinsic typing vector — the raw material for board fit — and it is exactly the kind of "look" judgment weighted stat-scoring cannot make.**

3. **Discover hybrid search + rerank** — `discover-retrieval.js` (dense embeddings across *visual/casting/market* channels + lexical BM25/tsvector + a structured boost) → RRF fusion → `discover-rerank.js` (Groq listwise rerank, final = `0.7·rerank + 0.3·rrf`). **This is the query-relative / semantic engine** for free-text agency search ("tall editorial blonde in Paris").

**Three configuration layers already in the schema:**

- **Agency-level:** `agencies.min_age/max_age`, `min/max_height_female`, `min/max_height_male` (migration `20260701110000`), plus `open_boards` (JSON list of divisions currently scouting, migration `20260624000000`). This is a thin agency *gate*.
- **Board-level:** `board_requirements` (age/height/measurements ranges, `genders`, `body_types`, `comfort_levels`, `experience_levels`, `skills`, `locations`, `min_social_reach`, `social_reach_importance`) + `board_scoring_weights` (nine 0–5 sliders) + `board_applications`.
- **"Casting" fields bolted onto boards:** `boards.client_name`, `boards.target_slots` (migration `20260321021000`), `boards.closes_at`. i.e. **casting briefs are currently modeled as a *flavor of board*.**

**The core structural smell:** `boards` is overloaded. It is simultaneously (a) a **persistent division** (Women, Men, New Faces, Curve — the roster grouping) and (b) a **transient casting brief** (a client job with a deadline and slots). In the industry these are different objects with different lifecycles (§2, §6). This overload is the single biggest thing to resolve for Q1.

---

## 2. How the industry actually selects talent (the layered reality)

From `industry/reference/standards.md` (§1, §2, §5) and `lifecycle.md`. Selection is **not** single-layer, and it is **not** generic HR screening.

- **Agency-wide** is a coarse *eligibility universe*, not a ranking. An agency "does" certain markets, certain divisions, certain physical bands. Most inbound is rejected or **kept on file**. The agency-level question is binary-ish: *are you even the kind of talent we represent?* Height floors, age windows, and market are the classic agency gates. This is a **gate, not a score.**

- **Board / division** is where *typing* happens. There is **no single "model"** — Fashion/Editorial, Commercial, Runway, Fit, Parts, Curve, Petite, Fitness, Mature, Kids, Influencer, Talent each have their own standards, stats, and gatekeeping. A booker's first real judgment is *which board does this person belong on* — and a talent can sit on more than one. Standards differ **sharply** by board (editorial height gates vs. curve measurement bands vs. commercial "relatability"). This is a **typing/routing problem**, and much of it is *look*, not measurable stats.

- **Brief / casting call** is where the **sharp, transient** selection happens. A client brief specifies dates (→ availability), usage/buyout + exclusivity (→ conflicts), an exact look/wardrobe, specific measurements (esp. **fit/showroom**, booked for exact numbers), budget, market, and required media (digitals, polaroids, reel). Bookers build a **package/submission** of selected talent against this brief. This is the most decision-relevant fit and it is **inherently relative to the brief** — the same talent is a 95 for one job and a 20 for the next.

- **Cross-cutting realities the engine must respect:** a talent is represented **non-exclusively across several agencies** with a **mother agency** and commission **splits** — so "fit" is never one-agency-owns-you. **Options/holds/bookouts** mean availability is a first-class, time-boxed gate, not a static flag. **Minors** are a different legal regime. **Usage/exclusivity** creates conflict gates (a talent under a brand buyout can't be submitted to a competitor).

**Conclusion for Q1:** real selection is genuinely **multi-layer**, and each layer has a *different* job. So the recommendation is **all three scopes**, mapped precisely to the jobs in §0. Not "agency-only" (too coarse to rank a shortlist), not "brief-only" (you still need typing to route inbound and to organize a roster before any brief exists).

---

## 3. Q1 in detail — three scores, three jobs, one engine

### 3.1 Agency gate (agency-wide)
- **Not a precise %.** Output is `eligible: bool` + a coarse readiness band + reasons. Precision here is false and legally risky (auto-reject).
- **Jobs:** (a) *talent-side guidance* — "you currently meet the submission bar for N agencies; you're 4cm short for these 3." (b) *inbound triage* — auto **keep-on-file** / surface, never silent auto-decline except on an explicit, disclosed hard rule (e.g. below an agency's absolute runway height floor). (c) *discovery prefilter* — the `is_discoverable/active/height/age` prefilter already in `loadEligibleProfileIds`.
- **Mostly hard rules** + a completeness/readiness signal.

### 3.2 Board fit (division)
- **Talent-intrinsic typing vector.** This already exists as `profiles.fit_score_{editorial,runway,commercial,lifestyle,swim_fitness,overall}`. Board fit = project that vector (plus board hard gates + stat closeness) onto a specific board's standard.
- **Jobs:** route inbound to the right board director; organize/segment the roster; talent development guidance ("your look reads editorial, your stats sit commercial — here's the gap"); broad discovery ("show me New Faces candidates").
- **Precompute** on profile/image change (it's intrinsic), store on the profile; project onto a board cheaply on read.

### 3.3 Brief fit (casting call)
- **Brief-relative ranking.** The sharpest score. Computed against a resolved brief spec (dates, usage, look, exact measurements, market, media, budget, slots).
- **Jobs:** shortlist ranking, package building, reviewing applications *against a live brief*, and the agency-side sort in the casting Kanban.
- **Compute on demand** at shortlist/package time; **persist each evaluation** to an audit table (`match_evaluations`) with the engine version and a config snapshot (needed for LL144/EU AI Act record-keeping and for showing staleness).

### 3.4 Talent-side vs agency-side are the *same* scores, different framing
- Agency-side: "sort/rank talent for me."
- Talent-side: "which agencies/boards should I apply to, and what's my gap?" — this is the **same** gate/board/brief computation, surfaced as guidance. Reuse the engine; never build a parallel talent scorer.

---

## 4. Q2 in detail — the layered explainable hybrid

### 4.1 Why not *pure* weighted scoring
Weighted scoring is attractive because it's transparent and cheap. But as the *whole* intelligence layer it fails in ways that matter here (industry + literature, §5, sources at end):
- **Rigid & non-probabilistic** — hand-tuned weights can't capture nonlinear "it just works" look fit, and small stakeholders' biases get baked into the numbers.
- **False precision** — averaging binary sub-scores into an `87` implies a resolution the inputs don't have. Bookers don't trust a spuriously exact number; regulators distrust it *more*.
- **Can't judge "the look"** — the single most important editorial signal (does this face read for the brief?) is precisely what a stat-weighted average cannot see. The current `match-scoring.js` has **no look term at all** — it scores measurements and skills but not whether the person reads editorial. That's the gap.
- **Invites illegal automation** — one opaque number begs to be thresholded into an auto-decision, the exact behavior LL144 / EU AI Act constrain.

### 4.2 Why not a *pure* model (LTR / black box) — yet
- **Cold start:** no labeled outcome data yet (which submissions got booked?). LTR needs labels.
- **Explainability mandate:** EU AI Act high-risk + LL144 require human-oversight and explanation; an opaque ranker is a compliance problem, not just an ML choice.
- **Sparsity & subjectivity:** casting is low-volume, per-market, and taste-driven; a model trained on thin data overfits one booker's taste.

### 4.3 The recommended pipeline (layers, from §0)
1. **Hard gates** — deterministic pass/fail with reasons. This is where BFOQs and compliance live. A gate is *never* traded off against a high look score.
2. **Weighted structured fit** — keep weighted scoring here, but upgrade the sub-scores from **binary → graded distance** (a 173cm talent for a 175–182 board should not score 0 on height the way `scoreMeasurements` currently does; it should be a near-miss). Weights are sane defaults, tunable per scope.
3. **Algorithmic inference** — two sub-signals: (a) **look-fit** = cosine/aligned match of the talent's `fit_score_*` vector (and image-analysis features) to the brief/board's target look; (b) **semantic fit** = the existing embedding retrieval + optional LLM rerank, used when the brief is free-text or aesthetic. This is the "algorithm" the brief is reaching for — bounded, and layered *on top of* gates, not replacing them.
4. **Explanation + calibration** — decompose every score into `{gates, structured contributions, look, semantic}`, attach a **confidence** from data completeness/recency (stale stats/digitals → lower confidence, per the ≤3-month digitals rule), and present a **coarse band** (`strong / possible / stretch / ineligible`) as the primary UI signal, with the number secondary.

### 4.4 The upgrade path to learning-to-rank (deferred, designed-for-now)
Because the engine **emits structured features + an outcome-linked audit record**, once real labels accumulate (shortlisted → booked / released), a learned reranker can be trained and slotted in **behind layer 3** under a flag — while gates (layer 1) and explanations (layer 4) remain untouched. This gives explainability today and a data flywheel for tomorrow. Do **not** build the model now; build the feature/label plumbing now.

---

## 5. Is weighted scoring "enough"? — the explicit test the brief asked for

**Verdict: weighted scoring is *necessary but not sufficient*. Keep it, contain it to layer 2.**

**Where weighted scoring is genuinely good (keep it):**
- Structured, measurable, defensible signals: height/measurement closeness, experience level, location proximity, social reach vs. a floor.
- Transparency and tunability — a booker can see and adjust why a stat mattered.
- Cheap, deterministic, reproducible — ideal for the auditable middle band.

**Where it fails (do not let it be the whole system):**
- Cannot judge *look* (the dominant editorial signal) — needs the inference layer.
- Binary in/out sub-scores (as coded today in `scoreMeasurements`/`scoreBodyType`) throw away near-misses and produce cliff-edge scores → fix with graded distance.
- Averaging hides disqualifiers — a fatal availability conflict must be a **gate**, not a low weight. (Today `match-scoring.js` has *some* hard filters but no availability/usage/exclusivity gates at all.)
- False precision + auto-decision risk (§4.1, §7).

So: the brief's instinct ("I'm thinking more of an algorithm") is **right about the look/semantic layer** and **wrong if it means replacing gates and structured fit wholesale.** The elegant answer is the layered hybrid, where the *algorithmic* intelligence sits in layers 1-in-spirit (rules) + 3 (inference), and weighted scoring does the honest structured-closeness work in the middle.

---

## 6. Data-collection & inheritance model (agency / board / brief)

### 6.1 The object-model fix (prerequisite)
Stop overloading `boards`. Introduce a discriminator and separate brief-only data:
- `boards.kind` ∈ `{ 'division', 'casting' }` (default `'division'`; existing casting-flavored boards migrate to `'casting'` when they have `client_name`/`closes_at`/`target_slots`).
- Brief-only fields (dates, usage, exclusivity, media requirements, budget) live in a `casting_briefs` extension keyed by `board_id` where `kind='casting'` — *or*, cleaner long-term, a first-class `casting_briefs` table that references a parent division `board_id`. v1 uses the discriminator + extension to avoid a disruptive rewrite of the casting Kanban.

### 6.2 One uniform criteria store for all three scopes
Replace the per-layer bespoke tables' *scoring role* with a single sparse-override store, resolved on read:

`match_criteria` (one row per scope that has any config):
- `scope_type` ∈ `{ 'agency', 'board', 'brief' }`, `scope_id`
- `hard_rules` (JSON) — gates: age window (+ minors policy), genders, height gates, markets/travel, availability window, usage/exclusivity constraints, representation constraints, house rules
- `soft_prefs` (JSON) — graded targets: measurement bands, experience, body type, look target vector, media-completeness expectations
- `weights` (JSON) — the tunable weights for layer 2 (+ look/semantic mix for layer 3)
- `version`, timestamps

`board_requirements` / `board_scoring_weights` / `agencies.*` stay as the **editing surface** and are projected into `match_criteria` (or read directly by the resolver during migration). The point is *one resolver, one engine* — not three.

### 6.3 What is configured where (and why)

| Concern | Agency (once) | Board (per division) | Brief (per job) |
|---|---|---|---|
| Markets / cities represented | ✅ default universe | override subset | ✅ this job's market (gate if no-travel) |
| Divisions offered (`open_boards`) | ✅ | — | brief hangs under one board |
| Gender scope | ✅ default | ✅ per board | ✅ gate for gendered brief |
| Age window + **minors policy** | ✅ **house floor/ceiling, minors rules** | tighten only | ✅ exact, cannot loosen minors rule |
| Height bands (per gender) | ✅ baseline | ✅ board standard | ✅ exact / fit-critical |
| Measurements / stats bands | — | ✅ board standard (curve ≠ editorial) | ✅ exact (fit/showroom) |
| Look / category target | implied by divisions | ✅ target look vector | ✅ this job's look |
| Body type / comfort / skills | house rules (e.g. no nudity) | ✅ | ✅ |
| Social reach | default importance | ✅ | ✅ (influencer briefs) |
| Availability / dates | — | — | ✅ **gate** (option/hold/bookout aware) |
| Usage / buyout / exclusivity | representation model | — | ✅ **conflict gate** |
| Media requirements (digitals/polaroids/reel) | house minimums | ✅ | ✅ |
| Weights template | ✅ default template | ✅ override | ✅ override |

### 6.4 Inheritance / default logic
Resolve at compute time as **agency defaults ← board ← brief**:
- **Soft prefs & weights:** most-specific non-null wins (brief > board > agency template). Store only overrides at each level (sparse); resolve on read. This kills today's duplication where a board re-declares everything.
- **Hard rules:** the resolved gate set is the **union** of all levels. A child may **add** gates and **tighten** an inherited one; a child may **not remove** an agency-level compliance gate (e.g. minors handling, house "no nudity"). Encode this as: agency gates are `locked: true` unless explicitly overridable.
- **Look target:** brief look overrides board look; if neither set, fall back to the board's canonical look vector.
- **Confidence** rides on the *talent's* data recency/completeness, independent of scope.

---

## 7. Compliance & guardrails (non-negotiable)

Pholio ranks people for work → it is an **automated employment decision / job-matching tool**.

### 7.1 Regimes that apply
- **NYC Local Law 144:** annual independent **bias audit**, public summary, and **≥10 business days' candidate notice** before an AEDT is used, if the score materially drives selection. Penalties $500–$1,500/day. → We must (a) keep a human in the loop so the score is *decision-support*, (b) log selection/scoring rates by category to produce impact ratios, (c) be ready to publish an audit summary.
- **EU AI Act (high-risk, in force 2 Aug 2026):** job-matching/ranking that scores/shortlists candidates is **high-risk** → risk management, data governance, technical documentation, **record-keeping**, transparency to affected individuals, **human oversight**, accuracy/robustness. Fines up to €30–35M / 6–7% turnover.
- **GDPR / CCPA:** measurements + photos are sensitive, biometric-adjacent personal data; need lawful basis, consent, retention limits, and special care cross-border (placement abroad).

### 7.2 Human-in-the-loop (hard requirement)
- The score **suggests**, a person **decides**. No silent auto-reject on a composite score.
- Auto **keep-on-file / surface** is fine. Auto **hard-decline** is permitted only on an **explicit, disclosed hard rule** (e.g. "we only represent 175cm+ for runway"), with notice — never on the weighted/inference composite.

### 7.3 Explainability & audit (build it in, not on)
- Every evaluation decomposes into `{gates (pass/fail + reason), structured contributions (raw, weight, distance, reason), look (rationale + source), semantic (rationale)}`. Partial support already exists (`match_details`, `discover-rerank` `match_rationale`) — standardize it.
- Persist an immutable `match_evaluations` record: inputs snapshot ref, resolved criteria version, weights, gate results, engine version, timestamp. This is the substrate for the LL144 audit and EU AI Act record-keeping.
- Store aggregate **selection/scoring rates by category** to compute impact ratios on demand.

### 7.4 Protected attributes — remove from positive scoring
- **Landmine:** `discover-retrieval.js` `heritageMatches()` / `structuredBoostForProfile()` currently **boosts on ethnicity / skin tone** as a generic structured signal. This is a legal and ethical hazard.
  - Fix: **remove ethnicity/skin-tone from the generic structured boost.** If a brief has a *bona fide, client-stated* diversity/heritage requirement, model it as an **explicit, consented, brief-level tag** that the agency knowingly sets and that is logged — never a hidden default boost.
- Do not use race, ethnicity, or skin tone as positive default inputs anywhere in the composite.

### 7.5 Minors (separate regime)
- Age is a legitimate BFOQ in modeling, but under-18 talent get a **branch**: measurements/full-length/swim images and contact gated + guardian-consented; excluded by default from usage/exclusivity/adult briefs; heightened privacy on any exposed stat. The minors gate is an **agency-locked hard rule** (§6.4) that a brief cannot loosen.

### 7.6 Data recency & consent
- Digitals/stats have a freshness expectation (≤3 months for digitals). Stale data → **lower confidence**, surfaced, and eligible for re-confirmation prompts. Discoverability/consent flags already gate retrieval (`is_discoverable`) — extend to scored surfacing.

---

## 8. Unified engine — interfaces & storage

### 8.1 Module shape (`src/domains/matching/`)
- `resolveCriteria({ scopeType, scopeId, knex })` → resolved `{ hardRules, softPrefs, weights, lookTarget, version }` after inheritance (§6.4).
- `evaluate({ profile, criteria, scopeType })` → the output below. Wraps/absorbs today's `calculateMatchScore`; adds gates, graded distances, look-fit, confidence, bands.
- `evaluateBrief`, `evaluateBoard`, `evaluateAgencyGate` — thin wrappers over `evaluate` with scope-appropriate gate sets.
- Look-fit consumes `profiles.fit_score_*`; semantic reuses `discover-*`. **One engine, three entry points.**

### 8.2 Output contract
```jsonc
{
  "engine_version": "1.0.0",
  "scope": { "type": "brief", "id": "…" },
  "eligible": true,
  "band": "strong",              // strong | possible | stretch | ineligible
  "gates": [ { "key": "availability", "passed": true, "reason": "free on shoot dates" } ],
  "structured": {
    "total": 78,
    "contributions": [
      { "key": "height", "raw": 176, "target": "175-182", "distance": 0.0, "weight": 3, "reason": "in band" }
    ]
  },
  "look": { "vector": { "editorial": 82, "runway": 74 }, "briefFit": 80, "rationale": "…", "source": "fit_score_*" },
  "semantic": { "score": 71, "rationale": "…" },   // null unless free-text/aesthetic brief
  "confidence": 0.72,             // data completeness/recency
  "composite": 79,                // secondary to band; null where a number would be false precision
  "computed_at": "…",
  "inputs_snapshot_ref": "…"
}
```

### 8.3 When computed / where stored
- **Board fit (typing):** intrinsic → precompute on profile/image change; store on `profiles.fit_score_*` (exists). Project onto a board on read.
- **Agency gate:** cheap → compute on demand (inbound, talent guidance); optional cache per `(agency, profile)`.
- **Brief fit:** compute at shortlist/package time; persist to `match_evaluations` (audit + staleness). Recompute when brief config or profile changes; show "recompute" when stale.

---

## 9. Staged build plan (each stage shippable)

- **Stage 0 — foundation (non-breaking).** This doc + `boards.kind` discriminator + `match_criteria` (sparse overrides) + `match_evaluations` (audit) + `src/domains/matching/` facade wrapping `calculateMatchScore` + `resolveCriteria()` inheritance + graded-distance upgrade to structured sub-scores + **compliance fix: drop ethnicity/skin-tone from the generic structured boost** + minors gate. No UI change; existing board scoring keeps working through the facade.
- **Stage 1 — brief scope.** `casting_briefs` extension (dates/usage/exclusivity/media/budget/slots) + availability/conflict gates + brief-fit using look vectors + persist `match_evaluations`.
- **Stage 2 — calibration & audit surfacing.** Confidence + bands in agency + talent UI; audit logging; bias-audit aggregates (selection/scoring rates by category); candidate-notice copy.
- **Stage 3 — learning-to-rank (deferred).** Once labels (shortlisted→booked/released) accumulate, add a learned reranker behind a flag at layer 3; keep gates + explanations intact.

**Verification per stage:** migrations run on SQLite + Postgres paths; unit tests for `resolveCriteria` inheritance (union of gates, most-specific-wins, agency-locked rules) and graded distances; regression that existing `board_applications.match_score` values are stable through the facade; a scripted end-to-end on one seeded agency/board/brief.

---

## Sources (external research)

- NYC LL144 / AEDT — [NYC DCWP](https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page), [NYC Rules (updated)](https://rules.cityofnewyork.us/rule/automated-employment-decision-tools-updated/), [Epstein Becker Green](https://www.workforcebulletin.com/taking-stock-of-new-york-citys-automated-employment-decision-tools-law)
- EU AI Act & recruitment (high-risk, 2 Aug 2026) — [artificialintelligenceact.eu — staffing](https://artificialintelligenceact.eu/what-the-act-means-for-staffing-businesses/), [McCann FitzGerald — high-risk guidance](https://www.mccannfitzgerald.com/knowledge/technology/employment-spotlight-eu-ai-act-draft-guidelines-on-high-risk-ai-classification), [Ogletree](https://ogletree.com/insights-resources/blog-posts/cybersecurity-awareness-month-in-focus-part-iii-the-eu-ai-act-is-here-what-it-means-for-u-s-employers/)
- Weighted scoring strengths/limits — [ProductPlan](https://www.productplan.com/glossary/weighted-scoring), [Fibery](https://fibery.com/blog/product-management/weighted-scoring/), [Univ. of Portsmouth](https://www.port.ac.uk/news-events-and-blogs/blogs/developing-enhanced-technologies/how-to-make-better-decisions-using-scoring-systems)
</content>
</invoke>
