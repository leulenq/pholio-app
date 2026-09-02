# Discover — making the search semantic (architecture decision, September 2026)

**Date:** 2026-09-02
**Builds on:** `tasks/discover-audit-2026-09.md` (the match-first engine and the "Showing …" surface shipped on `claude/discover-surface-audit-qk24qn`).
**Inputs:** three research reports kept under `docs/research/discover-semantic-2026-09/`: `models-and-architecture.md` (embedding models, multimodal encoders, VLM captioning, rerankers, pgvector on Neon, evaluation, fairness), `legal-boundary.md` (biometric statutes, EU AI Act, NYC Local Law 144, US privacy, casting anti-discrimination, industry practice), and `codebase-inventory.md` (Pholio's dormant embedding stack, line by line).
**Owner ask:** "Can you make it semantic? Do research on the best way to do this including expanding the current technical limits of Pholio."

---

## 1. What "semantic" has to mean here

A booker types "editorial women 5'9" and up in New York, clean beauty, strong bone structure, girl-next-door commercial warmth." Two different things are in that sentence.

- **Requirements** (women, 5'9" and up, New York) are facts the talent declared. They are already handled: strict JSON parse, deterministic re-parse of numbers, evaluation against declared fields, exact matches first, partial matches after, every miss named on the card. Nothing semantic belongs here; a vector model has no business deciding whether someone is 5'9".
- **The look** (clean beauty, strong bone structure, girl-next-door, commercial warmth) is where the current engine is weak. It matches those words lexically against the bio and lanes. A talent who wrote "fresh-faced, natural, approachable" and whose book is all soft daylight beauty work does not surface for "girl-next-door commercial warmth" unless the words coincide.

Semantic search means: **the look part of a brief is matched by meaning against what the talent said about themselves and against what their photographs show, and that match orders the results.** It never changes which group a talent lands in. It never invents a fact.

## 2. What the research settled

1. **Text embeddings are a solved commodity at this scale.** OpenAI `text-embedding-3-small` (Pholio's configured model, 512-dim Matryoshka slice, $0.02 per million tokens) is within a few benchmark points of Voyage 4, Cohere Embed v4, and Gemini Embedding. None of those benchmarks contains casting vocabulary, so the model choice is second-order; the corpus we build is first-order. Decision: keep OpenAI as the default, put the provider behind an interface, and let a golden-brief evaluation decide any migration.
2. **Raw image vectors of portraits are the wrong first move.** Three independent reasons agree. (a) Quality: LookBench (Jan 2026) shows generic CLIP and SigLIP 2 underperform on "look" categories; fashion-tuned Marqo-FashionSigLIP wins on garment retrieval, but nobody has measured any image encoder on casting language like "commercial warmth". (b) Fairness: CLIP-family bias on race and gender is well documented and is a property of the pretraining data, so swapping encoders does not fix it. (c) Law and Pholio's own rule: the product plan's design rule is "classify the photo, never the face: no stored face embeddings, no cross-image identity linking." A whole-image vector of a portrait is a stored representation from which a face can be matched. Keeping it out of the system is cheaper than arguing about it. See §7 for the legal detail.
3. **Caption-then-embed is the right bridge from photographs to language.** A vision model writes a short, constrained description of each photograph (shot type, styling register, mood, lighting, wardrobe, setting, expression), the description is embedded as text, and briefs match it in language space, where the abstract vocabulary of casting actually lives. The general RAG literature prefers direct image embeddings for literal retrieval, but that evidence is about documents and screenshots; for abstract style words the language route is at least as plausible and is the only one that is auditable (a caption can be read by the talent) and attribute-neutral by construction. Cost on Groq's vision model is well under a tenth of a cent per image; a full backfill of the current book is pennies.
4. **Postgres is enough.** Neon ships pgvector 0.8: HNSW, `halfvec`, and iterative index scans built for exactly our shape (hard filters plus a similarity order). At hundreds of profiles a brute-force scan is fine; at 50k profiles, roughly 300k vectors with HNSW stays under 50 ms. No external vector database, no search cluster.
5. **Hybrid beats vector-only.** Fusing the vector order with lexical evidence (Reciprocal Rank Fusion) is the standard result, and Pholio already has the lexical side (`talentText` mentions). Keep both and fuse.
6. **A cross-encoder reranker is cheap and optional.** Cohere Rerank 4 Fast at roughly $0.002 per search or Jina reranker v3 at 188 ms would be trivial cost. The 2026-07 council already rejected an LLM listwise rerank as non-deterministic; a cross-encoder is not that. Ship it behind a flag, default off, and let the evaluation decide.
7. **Evaluation must be built, not borrowed.** No public benchmark answers "does this book read as editorial". A golden set of 20 to 50 real briefs with hand-labelled relevant talent, nDCG@10, and a human-validated LLM judge is the only measurement that counts, and it is also the fairness audit: the distribution of top-K results by self-declared heritage and gender for look-only briefs must be reviewed as a standing process.

## 3. Decision

Ship a **language-space semantic layer over talent-authored text and attribute-neutral photo descriptions**, fused with the existing lexical evidence, ordering within the existing match and partial groups, explained on every card with the talent's own words or their book's description, behind consent the talent already understands. Raw image vectors stay out. A reranker is available behind a flag. The dormant scaffolding is either used or removed.

### 3.1 The corpus (what gets embedded)

One table, `discover_chunks`, several small chunks per profile, each a readable sentence or two:

| kind | source | example |
|---|---|---|
| `bio` | `bio_curated` split into sentences, grouped to about 60 words | "Paris-based editorial new face with sharp cheekbones. Strong runway walk, versatile for avant-garde and luxury campaigns." |
| `profile` | the talent's declared facts rendered as prose: lanes, specialties, experience, languages, market | "Editorial and runway boards. New face. Based in Paris. Languages: English, French." |
| `photo` | one per visible image, the VLM description | "Studio beauty portrait, soft frontal light, minimal makeup, hair pulled back, neutral expression, plain grey backdrop, editorial register." |

Rules. Only talent-authored or photo-descriptive text. Never a measurement, never a name, never heritage, skin tone, age, or body judgement, never agency notes. `photo` chunks are written from the processed derivative, only for images the talent has not excluded from agencies (`exclude_from_agency`), only for adults, only under both consents (§6). A profile's chunks are rebuilt whenever bio, specialties, lanes, experience, or images change, and deleted with the image, the consent, or the account.

### 3.2 The models and the provider seam

- Embeddings: `text-embedding-3-small` at 512 dimensions (the existing column width), through a new `src/domains/ai/embedding-provider.js` with `embedTexts(texts, {kind: 'query'|'document'})` and a Voyage adapter (`voyage-4-lite`, 512-dim slice) selectable by `EMBEDDING_PROVIDER`. Query and document calls are kept distinct so a provider with asymmetry can use it.
- Photo descriptions: the configured Groq vision model (`config.groq.visionModel`) with a new constrained prompt (`src/domains/ai/describe-photo.js`). Output is a single paragraph under 60 words from a closed list of aspects. The prompt forbids race, ethnicity, skin tone, age, body measurements, attractiveness, and any comparison to a person; a post-filter drops the caption if a denylisted token appears. Stored on `image_signals.description`, `description_model`, `described_at`.
- Reranker: `src/domains/ai/rerank-provider.js` with a Cohere adapter, `DISCOVER_RERANK=cohere|off` (default off).

### 3.3 The query path

```
brief
  → parse (unchanged): roles[], hard, soft_query
  → evaluate every eligible profile against hard (unchanged) → match | partial, facts, notes
  → SEMANTIC (new, only when soft_query is non-empty and the feature is on):
       q = embed(soft_query, query)          cached by hash in discover_embed_cache
       per candidate profile: sim = max over its chunks of cosine(q, chunk)
         Postgres: one query over discover_chunks WHERE profile_id IN candidates ORDER BY embedding <=> q
         SQLite:   load candidates' chunk vectors, cosine in process
       best chunk per profile is kept for the explanation
  → LEXICAL (existing): mentions from talentText
  → FUSION: rank by RRF(semantic rank, lexical rank) inside each group; ties by recency
  → optional RERANK: top 50 of the match group, document = profile prose + bio + photo descriptions
  → present: facts, notes, mentions (unchanged) + why
```

Group membership is untouched. For a brief with no requirements at all, every eligible profile is a match and the fused order is the whole answer; the results header reads "Closest to your brief".

Latency budget inside the 26-second Netlify function: parse (cached after first run) plus one embedding call (about 150 ms, cached per brief) plus one Postgres query. Warm target under 1.2 s, unchanged from the audit.

### 3.4 Explanation on the card ("why")

Every result gains `why: string | null`. It is the best-matching chunk when its similarity clears a floor (`DISCOVER_SEMANTIC_MIN_SIM`, default 0.32, to be set from the evaluation):

- bio chunk: `From their bio: "Fresh-faced, natural, approachable."` (the talent's own sentence, trimmed to 120 characters)
- photo chunk: `From their book: studio beauty portrait, minimal makeup, soft light` (the description, trimmed)
- profile chunk: `Editorial and runway boards, based in Paris`

The card shows `why` in place of "Mentions …" when present; `mentions` stays as the fallback. No number ever leaves the API. The line is always something a booker can verify by opening the profile.

### 3.5 Indexing

- **Write hooks.** Profile save (`talent/routes/profile.js`) and image create, reorder, exclude, delete (`talent/routes/media.js`) mark the profile stale (`profiles.discover_indexed_at = null`) and enqueue a reindex on the existing PITS queue. Image upload already queues classification; description runs in the same job after classification.
- **Scheduled sweep.** A Netlify scheduled function (`discover-reindex`, hourly) reindexes stale profiles in bounded batches, so a dropped queue job cannot leave a profile unsearchable. The same function sweeps `discover_parse_cache` and `discover_embed_cache` rows older than 30 days, the sweep the 2026-07 migration promised and never got.
- **Backfill.** `npm run backfill:discover-semantic` describes and embeds every eligible profile, resumable, rate-limited, dry-run by default.
- **Purge.** `purgeProfileEmbeddingDerivatives` and `purgeImageEmbeddingDerivatives` also delete `discover_chunks` and `image_signals.description`. Data export lists `discover_chunks`. Account deletion cascades by foreign key.

### 3.6 Flags and rollout

- `PHOLIO_ENABLE_PROFILE_EMBEDDINGS=true` (existing gate on any embedding call), `PHOLIO_ENABLE_IMAGE_ANALYSIS=true` (existing gate on any vision call), `DISCOVER_SEMANTIC=off|shadow|on` (new; `shadow` computes and logs but does not order), `DISCOVER_RERANK=off|cohere`, `EMBEDDING_PROVIDER=openai|voyage`.
- Rollout: backfill → shadow for a week with `discover_query_log.timings.semantic_ms` and per-result similarities logged → evaluation on the golden set → on.

### 3.7 Evaluation and the fairness audit

- `tests/fixtures/discover-semantic-golden/briefs.json`: 20 to 50 look-only and mixed briefs, each with the slugs of relevant seeded talent. `scripts/eval-discover-semantic.js` runs them against a live database and prints nDCG@10, recall@10, and, for each look-only brief, the heritage and gender distribution of the top 10 against the pool's base rate. A skew beyond a stated tolerance fails the run. This is the standing audit, run before every prompt or model change.
- CI: unit tests with an injected deterministic embedder cover chunking, consent gating, purge, fusion math, the SQLite and Postgres query paths, the caption denylist, and the explanation builder. CI never calls a provider.

## 4. What this expands in Pholio

| Limit today | After |
|---|---|
| Text builders emit "Experience: X. Booking lanes: Y" | Full talent-authored corpus: bio sentences, declared profile prose, photo descriptions |
| Photographs contribute nothing to search | Every visible photo contributes a readable, attribute-neutral description |
| No vector query exists; HNSW indexes built and never read | Real similarity queries on Postgres, brute-force in SQLite, HNSW ready for 50k |
| No write path; `reindexDiscoverProfile` has no callers | Save and upload hooks, hourly sweep, resumable backfill |
| `canUseSemanticSearch()` returns false | Fused semantic plus lexical order inside the honest groups, with a why-line |
| OpenAI key read ad hoc | `config.openai` plus a provider seam (OpenAI, Voyage) and a reranker seam (Cohere) |
| Cache tables grow unbounded | Thirty-day sweep |
| No evaluation | Golden set, nDCG@10, fairness distribution check |

## 5. What stays out, and why

- **Raw image vectors** (CLIP, SigLIP, Cohere or Voyage multimodal): quality unproven on casting language, bias inherited from pretraining, and a stored representation from which a face can be matched. Revisit only if the golden set shows recall loss the captions cannot close, and then only with counsel, a separate per-purpose consent, deletion tied to discoverability, and an EU geofence. The `images.embedding` column stays unpopulated.
- **Reference-image search** ("find talent who look like this photo"): requires the above and, as identity-adjacent matching, is the one feature the plan's design rule forbids outright. Not built.
- **LLM listwise reranking**: rejected by the council; nothing changed.
- **Learning from clicks**: the query log captures impressions and invites; with one agency there is no statistical signal yet.

## 6. Consent

Two consents exist and both are needed for photo descriptions: `ai_processing_consent` ("send portfolio images to its image-analysis provider for shot classification and profile insights") and `embedding_processing_consent` ("send a limited profile summary to its embedding provider so vetted agency searches can find relevant talent"). Text chunks need only the second. The embedding disclosure is refreshed to say what actually happens, under a new version so the settings screen re-presents it:

> Allow Pholio to send your bio, your declared profile details, and short descriptions of your portfolio photos (written by the image-analysis provider, describing styling, lighting, mood, and setting, never your face, age, heritage, or body) to its embedding provider, so vetted agency searches can find you by the look they describe. You can withdraw this at any time; the stored descriptions and vectors are deleted when you do.

Grants recorded under the earlier version keep text-only indexing until the talent sees the new text. Minors and profiles without a recorded date of birth stay out of every path, as today.

## 7. Legal posture (from the legal review; counsel to confirm)

The review grades the design's parts. Caption-then-embed with an attribute-neutral vocabulary, text embeddings of self-declared data, a self-declared heritage filter passed through verbatim, and a human making every decision are all in its "clearly fine" tier. Raw portrait vectors are "fine with named safeguards" (standalone written consent, no cross-photo identity capability, purge within 30 days of withdrawal, periodic audits that the space does not cluster by protected attribute), which is why they are deferred rather than banned. Inference of any protected attribute from a photograph, face templates, and opt-out-by-default consent are "do not do".

What this design does about each regime:

- **Illinois BIPA (moderate exposure for image vectors, low for this design).** Illinois district courts are split on whether a representation must be usable to identify someone to count; "we never identify anyone" is not a safe harbour. A photo description is text and identifies nobody, so the question does not arise. If image vectors are ever added, they need the standalone consent and purge schedule above.
- **Texas TRAIGA (2026)** exempts AI processing of biometric data not used to identify individuals, and treats self-published images as consented; Washington's health-data act is the reason the caption prompt bans health and body inference.
- **EU AI Act.** Article 5(1)(g) is about inferring protected traits from biometric data; the design infers none. Whether agency search is an Annex III employment tool is unsettled (talent are not employees; "access to self-employment" is the argument for coverage) and the Commission's guidance is still draft. Posture: log every search, explain every result, keep a person deciding, and treat any EU-facing deployment as if Annex III applied.
- **NYC Local Law 144.** Whether a talent agency is an "employment agency" is unresolved and enforcement is being stepped up in 2026. The fairness distribution check in §3.7 is kept as bias-audit-ready documentation.
- **California.** The CPRA's automated-decision rules trigger when a tool substantially replaces human decision-making; a search ordering with a person choosing does not. Embedding vectors' status as "biometric information" is an open question the design sidesteps by storing none.
- **New York Fashion Workers Act and the 2026 synthetic-performer law** concern digital replicas and generated performers; describing an unaltered photo for indexing creates neither.
- **Anti-discrimination.** Liability for a casting choice sits with the party choosing; the platform's exposure is its own ranking logic, which is why the heritage filter stays self-declared and nothing image-derived feeds it, and why the audit in §3.7 exists.
- **Industry norm.** The ICDA 2026 statement on AI in casting (support only, no unauthorised likeness use, no repurposing) and the 2025 to 2026 CAA and SAG-AFTRA campaign for opt-in AI processing of talent images match this design's opt-in, purpose-limited, human-decided shape.

## 8. Implementation plan

Lanes with disjoint ownership; the lead integrates and commits.

**A. Corpus and providers (`src/domains/ai/**`, migrations)**
1. Migration `discover_chunks` (dual-dialect; `vector(512)` plus HNSW on Postgres, JSON on SQLite), `image_signals.description/description_model/described_at`, `profiles.discover_indexed_at`.
2. `embedding-provider.js` (OpenAI, Voyage adapters; `embedTexts`; injectable for tests), `config.openai`, `config.embedding`.
3. `describe-photo.js` (Groq vision prompt, denylist post-filter, both-consent gate, exclusion respect).
4. `discover-index.js`: `buildChunks(profile, images, signals)`, `reindexProfile(knex, profileId)`, `markProfileStale`, purge extensions, export listing.

**B. Query and presentation (`src/domains/agency/services/**`)**
5. `discover/semantic.js`: `scoreCandidates(knex, queryText, candidateIds)` (PG and SQLite paths, cache), `fuse(semanticRanks, lexicalRanks)`, `buildWhy(chunk)`.
6. `discover-search.js`: wire semantic into `matchSearch` behind `DISCOVER_SEMANTIC`, add `why` to results, timings to the log, "Closest to your brief" header data (`pool.look_only`).
7. `rerank-provider.js` + hook (flagged off).

**C. Hooks, sweep, backfill (`src/domains/talent/routes/**`, `netlify/functions/**`, `scripts/**`)**
8. Save and media hooks, PITS job step, hourly `discover-reindex` function with cache sweep, `scripts/backfill-discover-semantic.js`.

**D. Consent and talent surface (`src/domains/talent/routes/settings.js`, migration, `client/**`)**
9. New disclosure version and text; settings payload; client settings copy.
10. Card `why` line (client) and detail modal.

**E. Evaluation (`tests/**`, `scripts/eval-discover-semantic.js`)**
11. Unit suites with injected embedder; golden set; eval script with nDCG@10 and the fairness distribution check.

Verification: full discover suites, consent boundary suites, migrations suite on SQLite, client suites, lint, build; a local run with `DISCOVER_SEMANTIC=on` and a fake provider that embeds by keyword hash to prove the plumbing end to end; the real providers exercised on staging with keys.
