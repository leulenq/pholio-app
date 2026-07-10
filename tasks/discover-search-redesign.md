# Discover Redesign — Natural-Language Talent Search

**Status:** Design (no implementation yet)
**Scope:** Agency dashboard Discover ("Scout") tab, search backend, and the talent-side data changes required to make search precise.
**Inputs:** Industry knowledge base (`.claude/skills/industry/reference/`), external research on casting-brief language and search architecture (July 2026), and a full audit of the current implementation.

---

## 1. Diagnosis — why the current Discover doesn't feel right

The audit's most important finding: **Pholio is not greenfield here.** Behind `DISCOVER_HYBRID=true` there is already a real pipeline — Groq query decomposition (`src/domains/agency/services/query-understanding.js`), five-leg retrieval with pgvector channel embeddings + Postgres FTS fused by RRF (`discover-retrieval.js`), and a Groq listwise rerank (`discover-rerank.js`). The problem is not that search is dumb keyword matching. The problem is four specific design flaws:

1. **Hard constraints are treated as soft boosts.** Parsed constraints flow into `structuredBoostForProfile()` (`discover-retrieval.js:227-289`) as *ranking boosts*, not SQL `WHERE` clauses. A 5'6" profile can still surface for "must be 5'9"+" — it just ranks a bit lower. For a booker, one impossible result destroys trust in all of them. This is the single biggest fix.
2. **Final ordering is 70% LLM listwise rerank** (`0.7*rerank + 0.3*rrf`, `discover-rerank.js:185`). Current evidence is decisive that LLM listwise reranking *degrades* strong first-stage retrieval, is non-deterministic (same brief, different order on refresh — reads as "random"), and adds a full Groq round trip of latency. It also silently drops candidates below score 40, which can starve results.
3. **Query understanding has no typed contract.** The parse shape (`{residual_query, attributes[], constraints[], channel_queries}`) has no numeric ranges, no unit normalization (5'9" vs 175cm vs 1.75m), no negation fields ("no visible tattoos"), no confidence, and no whitelist validation — the documented LLM failure modes (negation ~28% degradation, ranges ~19%) are exactly the ones bookers rely on.
4. **The data model can't answer real booker questions.** No availability state (industry runs on options/holds/bookouts — we have only `availability_schedule` strings), city is a raw string ("Brooklyn" won't match "local to NYC"), tattoos/piercings exist on owner fields but aren't in the agency discovery DTO despite "no visible tattoos" being one of the most common hard gates, and photo analysis runs once per profile (hero image only), not per image.

Secondary issues: a latent bug where hybrid eligibility still filters on the deprecated `profiles.age` column (`discover-retrieval.js:57-61`) instead of DOB-derived cutoffs; no empty-result handling (blank grid); no rate limit on `/api/agency/discover` even though each query fans out to ~7 external calls; facet chips are read-only; and the current dark cinematic UI + `MatchScore` resonance ring contradicts the agency "Editorial Ledger" design system and skirts the banned corner-chip/badge patterns.

---

## 2. How agencies actually describe talent (research findings)

Casting language splits cleanly into two registers, and the whole system design follows from keeping them architecturally separate:

### Hard constraints (deterministic, exclusionary)
| Canonical field | Real phrasings |
|---|---|
| Playable age range | "aged 22–30", "18 to play younger", "mid-30s to 50s" — searched against **playable range, never actual DOB** (Casting Networks hides adult DOB entirely) |
| Height | "must be 5'9"+", "6'0"–6'3"", "175cm minimum" — hard cutoffs, mixed units |
| Measurements / sample size | "size 6 fit model, exact measurements", "chest 38–40, suit 40R" — fit/showroom work is booked on *exact* stats |
| Location / locality | "local to NYC", "must work as a local" (= no travel/lodging cost), "based in Paris or willing to travel" |
| Availability window | "fittings through June 26, shooting July 9", "available next two weeks" |
| Body modifications | "no visible tattoos", "must cover tattoos", "visible tattoos required" |
| Union / experience | "SAG-eligible", "non-union", "e-comm experience", "no experience necessary / real people" |
| Board / division | "editorial", "commercial print", "curve, size 14–18", "petite 5'2"–5'5"", "fit model", "runway" |
| Gender / stats track | "female", "male", "non-binary or androgynous talent" |

### Soft aesthetic language (semantic, boosting — never excluding)
- **Style genre:** editorial/high-fashion ("striking, unconventional") vs commercial ("relatable, warm, everyday"); e-comm, catalog, swim, athletic.
- **Face:** "fresh face", "clean-cut", "classic beauty", "character face", "strong bone structure", "quirky — gap tooth or freckles a plus".
- **Body:** "athletic build", "toned", "curvy", "editorial-thin".
- **Vibe:** "girl/boy next door", "edgy", "androgynous", "moody", "warm and approachable", "high-energy".

### Sensitive attributes (compliance rules baked into design)
- **Ethnicity is never a hard filter and never a ranking boost.** The current exclusion in `discover-retrieval.js:244-249` is correct — keep it. NYC/NY human-rights law bars limiting by protected class without a bona-fide occupational reason. When a brief contains ethnicity/appearance terms, the parser must *recognize and set them aside visibly* (a chip that says "not used for filtering") rather than silently ignoring them — silence reads as a broken parser.
- **Actual age/DOB never reaches search.** Filter on `playing_age_min/max` and the coarse `age_band`; both already exist.
- **No inference of identity from photos.** "Ethnically ambiguous" etc. are valid free-text signals in talent-authored bios, not classifications the system should generate.
- **Measurements are job-fit data, not body judgment** — hard gates apply per-brief, never as a general profile score.

Fifteen realistic test queries collected in research (from "Female, 22–30, editorial, 5'9"+, NYC local, available for a fitting next week" to multi-sentence "real people" briefs) become the seed of the golden eval set (§7).

---

## 3. Target architecture

**Verdict from the architecture research, applied to our stack:** at Pholio's corpus size (thousands, maybe low tens of thousands of discoverable profiles) there is no retrieval-scaling problem — a full-corpus exact vector scan is single-digit milliseconds. No external vector DB, no Meilisearch/Typesense, no new language or service. Everything stays in Neon Postgres + Groq + the existing OpenAI embeddings, which we already run. The engineering problem collapses to (a) parsing hard constraints correctly and (b) semantic quality on the soft residual.

### Pipeline (target state)

```
brief text
  │
  ▼
1. PARSE — Groq (llama-3.3-70b) with strict:true structured outputs, cached 5 min
   → { hard: {…typed filters…}, soft_query: "…", set_aside: […], confidence }
   → regex/lexicon fallback (existing intent-parser.js) when Groq is down
  │
  ▼
2. VALIDATE + NORMALIZE (deterministic post-processor, no LLM)
   → whitelist every field/enum against schema; drop + log unknowns
   → units → cm (regex backstop for 5'9" / 175cm / 1.75m), shoe + region, dates
  │
  ▼
3. HARD FILTER — SQL WHERE on the eligibility set
   (is_discoverable, profile_status='active', + parsed hard constraints)
   → if 0 rows: relax least-confident/softest constraint, annotate the relaxation
  │
  ▼
4. SOFT RETRIEVAL over the filtered pool
   → pgvector cosine on soft_query (channel embeddings, existing tables)
   → Postgres FTS leg (existing search_vector)
   → structured soft boosts (existing structuredBoostForProfile, minus anything
     that graduated to a hard filter)
   → RRF fusion (existing)
  │
  ▼
5. ORDER by fused score — no LLM rerank in the hot path
  │
  ▼
6. EXPLAIN (async, after results render) — grounded match rationale generated
   from the profile's actual matched fields + parsed brief, streamed per card
```

### What changes vs today, and why

| Component | Today | Target | Rationale |
|---|---|---|---|
| Parse output | untyped attributes/constraints | strict JSON schema: numeric ranges (`height_cm: {gte,lte}`), booleans for negations (`visible_tattoos: false`), ISO dates, enums, per-constraint `confidence`, `soft_query` residual | negation + range extraction are the LLM's weak spots; typed fields + few-shot unit examples + `strict:true` constrained decoding (Groq supports it) close the gap |
| Parse validation | none | deterministic whitelist + unit normalizer | LLMs hallucinate filter fields/values; a 20-line post-processor is the cheapest reliability win in the system |
| Hard constraints | soft boosts | SQL `WHERE` | the precision guarantee — an impossible result must be *impossible* |
| Rerank | Groq listwise, 70% of final score, drops <40 | removed from hot path; RRF-fused ordering; optionally add a cross-encoder (Cohere Rerank 3.5, ~600ms, ~$2/1k queries) later, gated on eval evidence | LLM listwise rerank measurably degrades strong retrieval, is non-deterministic, and is the current latency long pole |
| Explanation | rerank's one-line rationale | separate async grounded generation, streamed after render | keeps hot path <1s; grounding in matched fields prevents hallucinated justifications |
| Empty results | blank grid | progressive relaxation ladder with explicit annotation ("No exact matches at 5'11"+; showing 5'10"+") | briefs over-constrain constantly; blank = dead end, relaxed + honest = premium |
| Age eligibility | `profiles.age` column (bug) | DOB-derived cutoffs everywhere (`ageFilterDobCutoffs` already exists); search filters use `playing_age_min/max` | correctness + compliance |
| Rate limiting | none on discover | per-agency limiter (reuse `ai-writer-rate-limit.js` pattern) | each query fans out to multiple paid API calls |
| Caching | 5-min parse cache | keep; add query-embedding cache keyed by `soft_query`; profile embeddings already persisted | warm repeat searches make zero external calls — matters on Netlify cold starts (26s function ceiling) |

**Latency/cost budget:** parse 200–400ms (Groq) + filter/retrieve 50–150ms (Postgres) ≈ **0.6–1.0s to results**, explanations streaming after. Sub-1¢ per search. Well inside the 26s Netlify ceiling with headroom removed from the pipeline rather than added.

### Channel simplification (eval-gated)
Today the parse generates four channel queries (visual/casting/market/lexical) and retrieval runs up to 5 legs. At this corpus size the channels may be ceremony. Keep them through Phase 1 (they're built and paid for), but add an eval ablation: if a single composite `soft_query` embedding + FTS matches multi-channel quality on the golden set, collapse to two legs and cut per-query embedding calls.

### Deliberately deferred (with triggers to revisit)
- **Image/multimodal embeddings ("looks like this reference photo")** — our photo-analysis metadata already converts most visual signal to text that the text embeddings capture. Add CLIP/SigLIP or Cohere embed-v4 multimodal only for an explicit reverse-image feature, and only if the golden set shows text recall failing on look-language. (embed-v4 is the clean path since it shares text+image space.)
- **Cross-encoder reranker** — add only if eval shows top-10 ordering problems.
- **Dedicated search engine** (Meilisearch/Typesense) — only for instant search-as-you-type UX or >~50k profiles.
- **HNSW tuning** — exact scan is 100% recall and fast at this size; the existing HNSW indexes are fine to keep but not a bottleneck either way.

---

## 4. Query-understanding contract (the core new artifact)

```jsonc
{
  "hard": {
    "gender_presentation": ["female"],            // enum, maps to gender/stats_track
    "height_cm": { "gte": 175, "lte": null },     // always cm after normalization
    "playing_age": { "gte": 22, "lte": 30 },      // NEVER actual age/DOB
    "measurements": { "waist_cm": {...}, "dress_size": "6", "exact": true },
    "shoe": { "size": 9, "region": "US" },
    "location": { "market": "nyc", "local_only": true, "travel_ok": null },
    "available": { "from": "2026-07-14", "to": "2026-07-18" },
    "visible_tattoos": false,                     // typed negation
    "boards": ["editorial"],                      // division/category enum
    "union": "non_union",
    "experience": { "min_level": null, "keywords": ["e-comm"] }
  },
  "soft_query": "fresh-faced, warm approachable girl-next-door energy, clean commercial look",
  "set_aside": [                                   // recognized but not filtered
    { "text": "open ethnicity", "reason": "not_used_for_filtering" }
  ],
  "confidence": { "height_cm": 0.98, "location": 0.7 },
  "unparsed_remainder": ""
}
```

Rules:
- Every `hard` key must exist in the field whitelist; every enum value must be a known value. Violations are dropped and logged (these logs become parser training examples).
- Constraints with confidence below threshold are applied but rendered as **editable chips** the booker can correct in one click — expose, don't obscure.
- Structured negations → SQL `NOT`; aesthetic negations ("not too editorial") → score down-weights, never exclusion.
- Few-shot examples must cover: `5'9"`, `five nine`, `175cm`, `1.75m`, "at least/under/between", "18 to play younger", shoe regions, "local to X", relative dates ("next week").

---

## 5. Data model changes

New/changed fields (all Knex migrations, dual SQLite/PG path as usual):

1. **`profiles.market`** (enum/slug: `nyc`, `la`, `miami`, `london`, `paris`, `milan`, `tokyo`, …, `other`) — derived from `city` via the existing `shared/lib/geolocation.js` at write time, backfilled. "Local to NYC" must match Brooklyn/Hoboken. Keep `city` for display.
2. **Availability v1** — `profiles.availability_status` (enum using real industry states: `available`, `limited`, `unavailable`) + a `bookouts` table (`profile_id, starts_on, ends_on, note`) so "available July 9–14" is answerable. This is talent-declared (the industry term is **bookout**). Full options/holds calendaring is out of scope for search v1 but the enum names must not paint us into a corner (see lifecycle reference).
3. **Expose `tattoos`/`piercings` to agency discovery** — add to `AGENCY_DISCOVERY_FIELDS` in `audience-dto.js` (adult profiles only), with the talent-side field reframed as structured "visible when dressed?" rather than freeform, since the brief language is "no *visible* tattoos".
4. **`profiles.measurements_updated_at`** already exists — start *using* it: search boosts stats confirmed ≤90 days, results can state "stats confirmed June 2026" (digitals/stats currency is a real industry norm).
5. **Per-image analysis** (Phase 3) — move `image_analysis` from one-per-profile to per-image rows so range ("shows both commercial smile and editorial neutral") becomes searchable; `images.shot_type` classification already exists to build on.
6. **Fix**: remove the `profiles.age` read in `discover-retrieval.js:57-61`; the column is deprecated.
7. **`saved_briefs`** (Phase 3) — the unused `brief_embeddings` table was built for exactly this; add the parent table (`agency_id, title, brief_text, parsed_json, created_by`) for saved searches + new-match alerts.

Nothing about ethnicity/heritage/skin-tone changes: excluded from discovery DTO and ranking, present only in talent-authored `bio_curated` prose. That posture is correct.

---

## 6. What changes in the talent dashboard

Search quality is capped by profile data quality, so the talent side gets four targeted changes — all framed in industry terms, all fitting the existing "Portfolio Stage" design system:

1. **Availability control ("Bookouts")** — a small, honest surface in Profile/Settings: current status (`Available` / `Limited` / `Unavailable`) + date-range bookouts. This is the vocabulary talent already knows from agencies. Without it, "available next week" is unanswerable and Discover quietly loses its most operational filter.
2. **Stats currency loop** — measurements older than ~90 days trigger a gentle "confirm your stats" prompt (one-tap "still accurate" or edit). Recency then feeds search ranking and result display. Industry expectation is current stats; this also keeps `measurements_updated_at` truthful.
3. **Searchability-driven completeness nudges** — hair/eye color and shoe size are skippable at onboarding, weight is never collected, tattoos/piercings live in a rarely-visited section. Instead of generic "profile 80% complete", use the demand signal we already capture (`recordDiscoveryImpressions` → `profile_events` → Intel page): *"Agencies ran 14 searches this week filtering by eye color — yours is blank."* This closes the two-sided loop with data we already log, and it's the difference between nagging and intelligence.
4. **Structured look/board self-declaration stays talent-authored** — booking lanes (`BookingLanesControl`) and `specialties` already exist; extend option vocabulary with the researched taxonomy (e-comm, fit, curve, petite, parts, athletic…) rather than inventing new freeform fields. Identity-adjacent attributes remain ask-don't-infer.

Minor-safety posture is already right (height-only until guardian consent, `age_band` coarsening, measurement locks) — the redesign changes none of it, and availability/bookouts must respect the same consent gating.

---

## 7. Evaluation (before any pipeline swap)

There's already an eval script (`scripts/eval-discover-quality.js`) and backfill tooling — extend rather than replace:

- **Golden set: 40–60 real briefs**, seeded from the research queries + real agency usage, stratified across: hard-only, soft-only, mixed, negation, unit variants, empty-result, and set-aside (ethnicity-term) cases.
- **Layer 1 — constraint correctness (deterministic, target 100%):** assert no returned profile violates any hard constraint. This is the regression safety net for the parse and runs in CI.
- **Layer 2 — soft relevance:** LLM-as-judge, *binary* relevant/not-relevant per result (binary beats 1–5 scales), spot-validated against human labels before trusting. Track precision@10 on every parse-prompt or embedding change.
- **Ablations to run:** multi-channel vs single-embedding retrieval; with/without FTS leg; with/without cross-encoder rerank. Each deferred component has a number that decides it.

---

## 8. Discover tab experience

Direction: **the brief is the interface.** One surface where a booker types (or pastes) anything from three words to a full client brief, watches Pholio read it correctly, and can correct it in one click. Precision is the aesthetic.

Reconcile with the Editorial Ledger system (`client/src/domains/agency/DESIGN.md`) — the current dark cinematic hero, Grainient background, and animated `MatchScore` resonance ring all depart from it and the ring flirts with banned pattern #7 (score chip on cards):

1. **Search surface** — a calm, paper-white command bar on the cream canvas. Keep the cycling example prompts (good teaching device) and ghost-text completion. Add an expandable **brief mode** (multi-line paste for full casting briefs) — textarea with `resize: none`.
2. **"Reading your brief" becomes editable** — parsed constraints render as flat, rectangular, *editable* chips grouped hard vs soft: hard chips show the normalized value ("Height ≥ 5'9" / 175cm") and can be adjusted or removed; low-confidence chips are visually marked as interpretations; set-aside terms render with a quiet "not used for filtering" note. This turns query understanding from a black box into a contract the booker co-signs.
3. **Results** — photography-first grid per the ledger system: flat cards, plain-text metadata (name, board, market, height), no rings, no badges, no corner chips. Match strength as a plain-text word ("Strong match") if at all; the *grounded why-line* ("5'10", NYC-based, editorial book; bio and photo read align with 'clean androgynous'") is the premium element, streamed in after results land. Hover reveals actions.
4. **Actions in place** — today Discover only offers Invite/View; surface the machinery that already exists: **shortlist to a casting board**, tag, schedule, message — so Discover feeds the pipeline instead of dead-ending at an invite.
5. **Empty/relaxed states** — never a blank grid. "No exact matches at 5'11"+ available July 9–14 — showing 5'10"+ (2) and matches with unconfirmed availability (6)", each relaxation shown as a struck-through or amended chip.
6. **Saved briefs (Phase 3)** — a brief becomes a first-class object: named, re-runnable, alerting when new talent matches. This is what makes Discover a workflow, not a toy, and `brief_embeddings` was already built for it.
7. **Motion** — per agency CLAUDE.md: motion supports state and scanning (chip settle, staggered result entrance, streamed why-lines), not cinema.

---

## 9. Phased roadmap

**Phase 1 — Correctness core (backend, invisible)**
New parse contract + strict structured outputs + validation/normalization layer; hard constraints → SQL WHERE; empty-result relaxation ladder; remove LLM rerank from hot path; fix `profiles.age` bug; rate-limit the endpoint; golden set + layer-1 eval in CI. *Exit criteria: 100% constraint correctness on golden set; p50 < 1.2s.*

**Phase 2 — Experience + data**
Discover UI rebuild on the Editorial Ledger system (editable chips, grounded streamed explanations, in-place pipeline actions, relaxed-state messaging); `market` normalization + backfill; tattoos/piercings in discovery DTO; availability v1 (status + bookouts) on both dashboards; stats-currency loop; searchability nudges via Intel.

**Phase 3 — Depth (each gated on eval or usage evidence)**
Saved briefs + new-match alerts; cross-encoder rerank if ordering metrics demand it; per-image analysis; reverse-image "looks like" via multimodal embeddings; channel consolidation per ablation results.

**Explicitly not doing:** external vector DB / search cluster / new service or language (no benefit at this scale, real ops cost); LLM listwise rerank in the hot path; ethnicity or actual-age filtering in any form; photo-inferred identity attributes.

---

## 10. Open decisions for review

1. **Availability v1 scope** — status + bookouts (proposed) vs. waiting for full options/holds calendaring. Proposal: ship the small version; the enum names are forward-compatible with the lifecycle model.
2. **Embedding provider** — stay on OpenAI `text-embedding-3-small` @512d (cheapest change: none) vs. move to Cohere embed-v4 now to pre-position for multimodal Phase 3. Proposal: stay, re-decide at Phase 3 with eval data.
3. **Match-strength display** — plain-text tier ("Strong / Good match") vs. no score at all, why-line only. Needs a design pass; the ring is out either way.
4. **Legacy surfaces** — confirm the EJS discover path (`public/scripts/dashboard/discover.js`) and `src/routes/scout.js` uploader are dead, and schedule their removal with this work.
