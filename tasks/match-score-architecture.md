# Pholio Match System — Intelligent Decision-Support Architecture (v2)

**Status:** Proposed (design + staged build plan). Awaiting sign-off before implementation.
**Direction change (v2):** Weighted scoring is **rejected as the core.** Pholio has many interacting variables, hard+soft constraints, incomplete data, context, and subjective fit signals. The system must be a genuine **decision-support reasoning engine**, not a weighted matrix pretending to be intelligence — and not a black box.
**Explicit product note:** Pholio has **no commission / splits / payments system**. This design contains none. Any earlier reference to commissions is void.
**Grounding:** the `industry` knowledge base, the *actual* code in this repo (§1), current regulation (§7), and the real decision-science / matching literature (Choquet integral & fuzzy measures, outranking, case-based reasoning, preference learning, explainable multi-stakeholder recommenders — sources at end).

---

## 0. TL;DR — the new direction

**Stop producing a score. Produce an *argument*.** For each candidate against a scope, the engine emits a **fit brief**: a recommendation posture, the case *for*, the case *against*, what's missing, how confident it is, and how it compares to others — every claim traceable to a piece of evidence. A number, if shown at all, is a secondary sort handle, never the product.

**Why not a weighted matrix (the thing you're rejecting):** linear "weights sum to 100" assumes criteria are **independent and additive**. They are not. Editorial look + editorial stats *reinforce* each other (synergy); two social-reach metrics *double-count* (redundancy); a fatal availability conflict must **veto**, not be averaged away. Linear weights model none of this, throw away near-misses at cliff edges, and turn missing data into false zeros. The literature's direct answer to "criteria interact" is **non-additive aggregation** (Choquet integral over a fuzzy measure), whose explanation *is* the interaction structure (Shapley importance + interaction indices).

**The engine is a 5-stage reasoning pipeline, not an equation:**

```
 1. SIGNALS → evidence      Every input → a typed Evidence Unit
    {dimension, value, direction, strength, confidence, provenance}
    Missing/stale data = LOW-CONFIDENCE evidence, never a false zero.
                    │
 2. CONSTRAINTS (feasibility, not scoring)   Hard + soft as a (weighted) CSP
    Vetoes: age/minors, gender, hard height, market/travel, availability &
    bookout conflicts, usage/exclusivity conflicts, representation conflicts.
    Soft near-misses surface as "conditionally feasible + reason", not a fail.
                    │
 3. INTERACTION-AWARE AGGREGATION  (the anti-weighted-matrix core)
    Choquet integral over a fuzzy measure → captures synergy & redundancy.
    Explained by Shapley values (importance) + interaction indices (reinforce/cancel).
    Capacities are ELICITED from priors, then LEARNED per agency (Stage 5).
                    │
 4. CONTEXT & SUBJECTIVE FIT   Retrieval + grounded reasoning
    Case-based reasoning: "this resembles talent you advanced on your last 3
    e-comm briefs." + LLM reasoner GROUNDED on evidence units & retrieved
    cases to judge aesthetic fit and write the rationale (no free invention).
                    │
 5. DECISION SUPPORT   A partial order + a fit brief per candidate
    posture (advance/consider/hold/not-for-this), case for/against, missing
    data, confidence, "what would change this", comparability (incl. ties).
                    │
    ── LEARNING LOOP ──  Every booker decision (advanced/shortlisted/rejected/
    booked) is a PREFERENCE LABEL → refines the fuzzy measure + case base
    PER AGENCY. Learns this agency's taste; never a global weighting.
```

**How this satisfies your requirements, point by point:**

| You asked for | How it's delivered |
|---|---|
| Smart, multi-signal | Evidence units fuse stats, look vectors, embeddings, availability, history, brief text |
| Handles complex interactions | **Choquet integral / fuzzy measure** — synergy & redundancy, not additive weights |
| Incomplete data | Evidence carries **explicit confidence**; missing = low confidence; **CBR** fills context by analogy |
| Context & subjective fit | **Case-based retrieval** of the agency's own past decisions + **grounded LLM** aesthetic judgment |
| Explainable | Shapley + interaction indices + cited evidence + analogical cases; every output traces to inputs |
| Decision support, not automation | **Partial-order ranking** + fit brief; human decides; no auto-cutoff |
| Not a rigid score / not "weights=100" | Non-additive aggregation + outranking; capacities elicited then learned |
| Not a black box | Learned components are low-dimensional and inspectable; LLM is grounded & constrained |

---

## 1. What already exists (reused as *evidence sources*, not as the engine)

Pholio is not a blank slate. The new engine **consumes** these as evidence; it does **not** keep any of them as the decision layer.

- **`profiles.fit_score_*`** (`ai/scoring.js`, image-analysis → runway/editorial/commercial/lifestyle/swim vectors) → becomes the **look evidence unit**. Keep as a signal; it's exactly the subjective "look" input a stat matrix can't see.
- **Discover hybrid retrieval** (`discover-retrieval.js`: dense visual/casting/market embeddings + lexical + RRF; `discover-rerank.js`: LLM listwise) → becomes the **candidate retriever + semantic evidence + the CBR similarity backbone**. Reused, re-roled.
- **`match-scoring.js` weighted engine** (board hard filters + weighted average) → **retired as the decision layer.** Its *hard filters* migrate into Stage 2 (constraints); its weighted average is replaced by Stages 3–4. `board_applications.match_score` becomes a stored *fit-brief reference*, not a weighted number.
- **Config layers already in schema** — `agencies.*` (age/height gates, `open_boards`), `board_requirements` + `board_scoring_weights`, `boards.client_name/target_slots/closes_at`. These become the **constraint + prior** definitions in §6 (the `board_scoring_weights` sliders are reinterpreted as *elicitation priors for the fuzzy measure*, not as summed weights).
- **Structural fix (unchanged from v1):** `boards` is overloaded as both a persistent **division** and a transient **casting brief**. Split with `boards.kind ∈ {division, casting}` (§6.1).

---

## 2. How the industry actually decides (why a reasoning engine, not a score)

From `industry/reference/standards.md` and `lifecycle.md`. Selection is **multi-layer** and **judgment-driven**, not screening:

- **Agency-wide** = a coarse *eligibility universe* ("are you the kind of talent we represent?"). A gate, not a ranking.
- **Board / division** = *typing* ("which board — Editorial, Commercial, Curve, New Faces…?"). Standards differ sharply per board; much of it is **look**, not measurable stats. A talent can sit on more than one board.
- **Brief / casting call** = the sharp, transient decision against a specific client job: dates (→ availability), usage/exclusivity (→ conflicts), exact look & measurements (fit/showroom is booked for exact numbers), market, required media (digitals, polaroids, reel). Bookers assemble a **package/submission**; the same talent is right for one brief and wrong for the next.

Cross-cutting realities the engine must honor: **non-exclusive multi-agency representation** (fit is never "one agency owns you"); **options/holds/bookouts** make availability a first-class, time-boxed constraint; **minors** are a separate legal regime; **usage/exclusivity** create conflict vetoes. None of this is money — it's constraints and context.

**Implication:** a booker never wants a number; they want *"who should I look at, why, what's the risk, and what am I missing?"* That is a **decision brief**, which is exactly what Stages 1–5 produce. And the three layers map to three jobs: **agency = feasibility gate, board = typing/routing, brief = ranked decision brief** — one engine, three scopes (§6).

---

## 3. The five stages in detail

### 3.1 Stage 1 — Evidence units (uniform, uncertainty-aware)
Every input is normalized into:
```jsonc
{ "dimension": "height",            // stat | measurement | look | semantic | availability | history | media | market …
  "value": 176,
  "direction": "supports|opposes|neutral",
  "strength": 0.0-1.0,              // how strongly it bears on fit for THIS scope
  "confidence": 0.0-1.0,            // data completeness & recency (digitals ≤3mo, stats freshness…)
  "provenance": "profile.height_cm@2026-05" }
```
- **Incomplete data is handled here, correctly:** a missing measurement is a **low-confidence** unit, not a zero. Confidence, not value, absorbs uncertainty. Stale digitals lower confidence and trigger re-confirmation prompts.
- Look/aesthetic signals come from `fit_score_*` + image-analysis features; semantic signals from embeddings; availability from the options/holds calendar; history from the agency's prior decisions.

### 3.2 Stage 2 — Constraint reasoning (feasibility, not scoring)
Model hard + soft constraints as a **(weighted/partial) constraint-satisfaction** problem, not weights:
- **Hard vetoes** (disqualifying, with reasons; never averaged away): minors/age policy, gender for a gendered brief, hard height gates (runway/fit), market/travel when the brief can't travel, **availability conflicts** against options/holds/bookouts on the brief dates, **usage/exclusivity conflicts** (already committed to a competitor for the requested media/territory/window), representation constraints.
- **Soft constraints** → "conditionally feasible + reason" (measurements 2cm out, digitals stale) — surfaced, not silently failed.
- Output: feasible set + near-miss diagnostics. This is where **compliance vetoes** live (§7).

### 3.3 Stage 3 — Interaction-aware aggregation (the core; replaces weighted sum)
Aggregate the commensurable fit evidence with a **Choquet integral over a fuzzy measure (capacity)**:
- The capacity assigns importance to **subsets** of signals, so it encodes **synergy** (editorial-look ∧ editorial-stats worth more together than apart) and **redundancy** (two social metrics don't double-count) — the exact failure of additive weights.
- **The explanation is built in:** **Shapley values** give each signal's overall importance; **interaction indices** say which signals reinforce or cancel. That is a human-readable account of *why*, not a post-hoc rationalization.
- Capacities start from **elicited priors** (industry defaults + the reinterpreted board sliders) and are **learned per agency** (§3.5). No hand-tuned "weights sum to 100."

### 3.4 Stage 4 — Context & subjective fit (retrieval + grounded reasoning)
- **Case-based reasoning:** retrieve the most similar *past casting decisions for this agency/board* (over the discover embedding space + structured features). Yields cold-start robustness, context, and **analogical explanations** ("resembles 3 talents you advanced for similar e-comm briefs"). CBR is specifically strong under incomplete/knowledge-sparse data.
- **Grounded LLM reasoner:** judges genuinely subjective/aesthetic fit ("does this face read for a raw-denim campaign?") and composes the natural-language rationale — **constrained to cite the evidence units and retrieved cases**, temperature-low, structured output. It is bounded and inspectable (inputs + outputs logged), so it is *not* a black box.

### 3.5 Stage 5 — Decision-support output + the learning loop
**Ranking:** **outranking (PROMETHEE-style)** pairwise comparison with indifference/preference thresholds → a **partial order**. It can legitimately say "A and B are **incomparable** — different strengths" instead of forcing a false total order, and needs no cross-criterion normalization. Great for "here are your top few, and here's the genuine tradeoff."

**Per-candidate fit brief:**
```jsonc
{ "posture": "advance | consider | hold | not-for-this",
  "case_for":   [ {evidence, confidence} ],
  "case_against":[ {evidence/conflict, confidence} ],
  "missing":    [ "availability unconfirmed", "digitals 5mo stale" ],
  "interaction_notes": [ "strong: look ∧ stats reinforce", "social signals discounted (redundant)" ],
  "confidence": 0.0-1.0,
  "what_would_change_this": [ "confirm free on shoot dates → advance", "measurements 2cm off" ],
  "comparability": { "clearly_ahead_of": [...], "tradeoff_with": [...] },
  "fit_index": 0-100  // OPTIONAL secondary sort handle; never shown alone
}
```

**Learning loop (what makes it *intelligent*, per-agency):** every booker action (advanced / shortlisted / rejected / booked / released) is a **preference label**. An offline **preference-learning / learning-to-rank** job refines (a) the agency's Choquet capacities and (b) the CBR case weights — so the system learns *this agency's taste*, not a universal formula. Cold start is covered by priors + CBR. This is the flywheel, and it is *why* this beats any static configuration. **Guardrail:** learning from human decisions can amplify human bias, so the loop is monitored for fairness drift (§7).

---

## 4. Why this specifically answers "many variables, interacting, incomplete, subjective"

- **Many variables & interactions** → Choquet/fuzzy-measure aggregation is the literature-standard non-additive method; Shapley + interaction indices keep it explainable.
- **Interacting constraints** → constraint reasoning (Stage 2) separates *feasibility* (vetoes/near-misses) from *desirability* (Stage 3), so a conflict can't be "scored away."
- **Incomplete data** → per-evidence **confidence** + **CBR** analogical fill; uncertainty propagates to the brief's confidence instead of corrupting a score.
- **Context** → CBR over the agency's own history + brief/board/agency scope resolution (§6).
- **Subjective fit** → look-vectors + grounded LLM reasoning, cited to evidence.
- **Explainable / decision support / not black box** → argument-shaped output, partial orders, low-dimensional learned components, grounded LLM.

---

## 5. Where (a little) weighting still legitimately lives — and why it's not the "weighted matrix" you rejected
Honesty: the Choquet capacity generalizes weights (a capacity with **zero interaction** *is* a weighted average). The difference that matters:
- It is **non-additive** (models synergy/redundancy) — the thing you're rejecting cannot.
- It is **elicited-then-learned**, not hand-set to sum to 100.
- It sits **after** constraint reasoning and **beside** CBR + reasoning, never as the whole intelligence.
So "weights" as a *degenerate special case* remain available for trivial dimensions, but the system is a reasoning pipeline, not a scoring sheet.

---

## 6. Data-collection & inheritance model (constraints + priors, not weights)

### 6.1 Object-model fix
`boards.kind ∈ {division, casting}` (existing casting-flavored boards → `casting`). Brief-only data (dates, usage, exclusivity, media requirements, slots) in a `casting_briefs` extension keyed by the board, referencing a parent division board. (No money fields — no budget/commission.)

### 6.2 One uniform criteria store, three scopes
`match_criteria` (sparse; one row per scope with config):
- `scope_type ∈ {agency, board, brief}`, `scope_id`
- `constraints` (JSON) — hard vetoes + soft near-miss definitions (Stage 2)
- `signal_relevance` (JSON) — which evidence dimensions matter here + **capacity priors** for the Choquet measure (Stage 3), **not** summed weights
- `look_target` (JSON) — target look vector / brief aesthetic
- `version`, timestamps

The existing `board_requirements` / `board_scoring_weights` / `agencies.*` become the **editing surfaces** projected into this store; `board_scoring_weights` sliders are read as **capacity priors**, not weights.

### 6.3 What is configured where

| Concern | Agency (once) | Board (per division) | Brief (per job) |
|---|---|---|---|
| Markets represented | ✅ universe | subset | ✅ market (veto if no-travel) |
| Divisions offered (`open_boards`) | ✅ | — | brief hangs under a board |
| Gender scope | ✅ | ✅ | ✅ veto if gendered |
| Age + **minors policy** | ✅ **locked floor/ceiling + minors rules** | tighten only | ✅ exact, can't loosen minors |
| Height bands (per gender) | ✅ baseline | ✅ board standard | ✅ exact / fit-critical |
| Measurements bands | — | ✅ (curve ≠ editorial) | ✅ exact (fit) |
| Look / aesthetic target | implied by divisions | ✅ target vector | ✅ this job's look |
| Availability / dates | — | — | ✅ **veto** (option/hold/bookout aware) |
| Usage / exclusivity | representation model | — | ✅ **conflict veto** |
| Media required (digitals/polaroids/reel) | house minimums | ✅ | ✅ |
| Capacity priors (signal relevance) | ✅ default | ✅ override | ✅ override |

### 6.4 Inheritance
Resolve at compute time **agency ← board ← brief**:
- **Constraints:** resolved veto set = **union**; a child may **add/tighten**, never **remove** an agency-**locked** compliance constraint (minors, house rules).
- **Signal relevance / capacity priors & look target:** most-specific non-null wins; store only overrides (sparse). Learned capacities are keyed per (agency, scope) and layered over priors.
- **Confidence** rides on the talent's data recency/completeness, independent of scope.

---

## 7. Compliance & guardrails (stronger, because this system learns)

Pholio ranks people for work → an **automated employment/job-matching tool**. A *learning* one raises the stakes.

- **NYC LL144:** annual independent **bias audit**, public summary, ≥10 business days' candidate notice when the tool materially drives selection.
- **EU AI Act — high-risk (in force 2 Aug 2026):** risk management, data governance, technical documentation, **record-keeping**, transparency, **human oversight**, accuracy/robustness. The immutable fit-brief records (below) are the substrate for this.
- **GDPR / CCPA:** measurements + images are sensitive, biometric-adjacent; lawful basis, consent, retention limits, cross-border care.

**Built-in guardrails:**
1. **Human-in-the-loop by construction** — the output is an *argument to a decider*, not a verdict. No auto-reject on the composite. Auto **keep-on-file/surface** is fine; auto-decline only on an explicit, disclosed **hard veto** (e.g. below a stated runway floor), with notice.
2. **Explainability is the product** — Shapley + interaction indices + cited evidence + analogical cases. Already stronger than any weighted number.
3. **Immutable reasoning records** (`match_evaluations`) — evidence snapshot, resolved criteria version, capacity version, ranker version, LLM rationale, timestamp. Enables the LL144 audit and EU AI Act record-keeping, and lets us replay any decision.
4. **No protected attributes as positive signals** — **remove `heritageMatches()` (ethnicity/skin-tone boost) from `discover-retrieval.js`.** A bona-fide, client-stated diversity requirement is modeled as an explicit, consented, logged **brief tag**, never a hidden default boost.
5. **Feedback-loop bias monitoring** — because Stage 5 learns from human choices, track impact ratios of the *learned* ranker over time; alert on drift; keep priors as a fair fallback; support periodic re-audit. Fairness is a first-class metric of the learning job, not an afterthought.
6. **Minors branch** — measurements/full-length/swim gated + guardian-consented; excluded by default from usage/exclusivity/adult briefs; minors veto is agency-locked and non-overridable.
7. **Data recency/consent** — freshness expectations lower confidence and prompt re-confirmation; discoverability/consent gates scored surfacing.

---

## 8. Engineering shape (not constrained to today's stack)

A model-agnostic **`src/domains/matching/` reasoning service** with clean component seams so pieces can run in-process now and move to a dedicated service/worker later:

- `SignalExtractor` → evidence units (wraps stats, `fit_score_*`, embeddings, availability, history).
- `ConstraintSolver` → feasibility + near-misses (absorbs today's hard filters).
- `Aggregator` → Choquet integral over the resolved capacity; emits Shapley + interaction indices.
- `CaseRetriever` → CBR over past decisions (reuses discover retrieval).
- `Reasoner` → grounded LLM aesthetic judgment + rationale.
- `Ranker` → outranking / partial order.
- `ExplanationComposer` → the fit brief.
- `PreferenceLearner` → **offline** job updating per-agency capacities + case weights from decision labels; versioned, monitored for fairness.

**Storage:** `match_evaluations` (immutable reasoning records); `agency_preference_model` (learned capacities + case weights, versioned per agency); `match_criteria` (§6). **Compute cadence:** board-typing precomputed on profile/image change; agency-gate on demand; brief briefs on shortlist/package build, persisted, recomputed on config/profile change with staleness shown.

**Reuse vs. new:** reuse embeddings/retrieval and look-vectors as *evidence*; **retire** the weighted `calculateMatchScore` decision layer; build the constraint/aggregation/CBR/ranker/learning layers new.

---

## 9. Staged build plan (each stage shippable; verified before "done")

- **Stage 0 — reasoning skeleton (non-breaking).** `boards.kind`; `match_criteria` + `match_evaluations` + `agency_preference_model` tables; `src/domains/matching/` with `SignalExtractor`, `ConstraintSolver` (absorb existing hard filters), a **first-cut `Aggregator`** (Choquet with elicited priors + Shapley/interaction output), and `ExplanationComposer`; **compliance fix: remove the ethnicity/skin-tone boost**; `resolveCriteria()` inheritance. Existing board scores keep working via a shim that reads the new brief but exposes a legacy number.
- **Stage 1 — constraints + brief scope.** `casting_briefs`; availability (options/holds/bookouts) + usage/exclusivity conflict vetoes; near-miss diagnostics; brief-level fit briefs persisted to `match_evaluations`.
- **Stage 2 — context & reasoning.** `CaseRetriever` (CBR over decisions) + grounded `Reasoner`; partial-order `Ranker`; full fit-brief UI (case for/against/missing/what-would-change), decision-support framing, candidate-notice copy.
- **Stage 3 — learning loop.** `PreferenceLearner` updating per-agency capacities + case weights from decision labels; fairness/impact-ratio monitoring + bias-audit aggregates; priors as fair fallback.

**Verification per stage:** migrations on SQLite + Postgres; unit tests for `resolveCriteria` inheritance (veto union, most-specific priors, agency-locked rules), Choquet aggregation + Shapley/interaction correctness, and constraint near-miss logic; a scripted end-to-end on one seeded agency/board/brief producing a full fit brief; fairness checks on any learned component before it ships.

---

## Sources (external research)

- **Interaction-aware aggregation (Choquet / fuzzy measures):** [Choquet-integral fuzzy measures for aggregating satisfaction (Wiley, 2021)](https://onlinelibrary.wiley.com/doi/10.1155/2021/2319004); [Choquet-integral intuitionistic fuzzy aggregation operators (Expert Systems w/ Applications)](https://www.sciencedirect.com/science/article/abs/pii/S0957417421015529)
- **Outranking / partial orders under uncertainty:** [PROMETHEE method overview (Iris Publishers)](https://irispublishers.com/ijebm/fulltext/using-promethee-method-for-multi-criteria-decision-making-applications-and-procedures.ID.000502.php); [Outranking + Bayesian networks under uncertainty (Annals of Operations Research, 2024)](https://link.springer.com/article/10.1007/s10479-024-06064-8)
- **Preference learning / explainable talent matching:** [RankPO: Preference Optimization for Job-Talent Matching (arXiv 2503.10723)](https://arxiv.org/html/2503.10723v1); [OKRA: Explainable, multi-stakeholder job recommender (arXiv 2504.07108)](https://arxiv.org/pdf/2504.07108); [Modeling Two-Way Selection Preference for Person-Job Fit (arXiv 2208.08612)](https://arxiv.org/pdf/2208.08612)
- **Case-based reasoning under incomplete data:** [Multiple-retrieval CBR for incomplete datasets (J. Biomedical Informatics)](https://www.sciencedirect.com/science/article/pii/S1532046419300450)
- **Compliance:** [NYC DCWP — AEDT / LL144](https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page); [EU AI Act — staffing / high-risk](https://artificialintelligenceact.eu/what-the-act-means-for-staffing-businesses/)
</content>
