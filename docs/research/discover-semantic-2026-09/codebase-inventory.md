# Semantic (Embedding) Layer — Codebase Inventory for Agency Discover
Repo: pholio-app. Compiled 2026-09-02.

## 0. Headline finding

The embeddings/vision infrastructure is **fully scaffolded but functionally
disconnected from production**:

- `discover-search.js` (`matchSearch`/`browseSearch`) is a 100% deterministic,
  lexical/rule engine. `canUseSemanticSearch()` hardcodes `return false`, and
  every response sets `meta.semantic_search: false`. No embedding is read or
  written anywhere in the request path.
- `embeddings.js`'s text builders (`buildProfileText`, `buildDiscoverIndexText`,
  `buildCastingIndexText`, `buildMarketIndexText`, `buildVisualIndexText`) have
  all been stripped down to emit **only** `Experience: <level>` and
  `Booking lanes: <labels>` — no bio, no name, no free text, no image-derived
  signal. `buildVisualIndexText`, `flattenImageAnalysis`, `buildScoutText`,
  `buildImageSourceText` are hard no-ops (`return ""`) by design ("Compliance
  WS2" comments).
  - `buildLexicalDocument()` composes these into the FTS document
    (`consent_corpus_v1 <prose> booking_lane:<slug> …`), so it is currently the
    same narrow signal.
- `upsertImageEmbedding()` is a **defensive no-op that always returns `false`**
  ("Image-derived vectors are not an allowed launch selection signal").
- `reindexDiscoverProfile` / `reindexDiscoverChannels` are exported but **never
  called from any production code path** (grep confirms zero callers outside
  `embeddings.js` itself and one Jest mock in
  `tests/talent/image-provider-races.test.js`). Nothing populates
  `talent_text_embeddings` / `talent_embedding_cache` / `profiles.search_vector`
  today — profile save (`talent/routes/profile.js`) only imports the *purge*
  functions, never an indexer.
- `images.embedding vector(512)` exists on Postgres but is **never written**
  (migration comment: "Unpopulated at launch").
- `masterVisionAnalysis` (Groq vision → `profiles.image_analysis` /
  `castingAnalysis`) writes real data but the JSON is deliberately restricted to
  photo-composition description (bone structure, look type, market signals for
  comp-card layout) — no identity/appearance-proxy field ships, and it is
  **not** wired into any embedding/index builder.
- `PHOLIO_ENABLE_PROFILE_EMBEDDINGS` and `PHOLIO_ENABLE_IMAGE_ANALYSIS` both
  gate everything and there is no evidence either is set to `"true"` in any
  committed env file — the whole pipeline appears designed to fail closed until
  explicitly turned on.

So a new semantic layer is being built on top of: (a) a consent/compliance
substrate that is real and enforced, (b) pgvector tables/migrations that exist
but are empty, (c) text builders that must be *widened* (they currently throw
away almost everything), and (d) zero existing write-path wiring — reindexing
after profile/image changes has to be built from scratch.

---

## 1. `src/domains/ai/embeddings.js` (981 lines)

Header docblock (lines 1–21) states the contract:
- Provider: OpenAI `text-embedding-3-small` via native `fetch` (no SDK).
- Dimension: 512 (`EMBEDDING_DIMENSIONS`, reduced from 1536).
- Distance: cosine (`<=>` in pgvector).

### Exported functions (module.exports, lines 942–981)

| Export | Signature | Purpose |
|---|---|---|
| `embed` | `embed(text) → Promise<number[]>` (L159) | Raw OpenAI call. Throws if `PHOLIO_ENABLE_PROFILE_EMBEDDINGS!=="true"` or no `OPENAI_API_KEY`. Truncates input to 8000 chars, requests `dimensions: 512`. |
| `cachedEmbed` | `cachedEmbed(knex, text, {embedFn}) → Promise<number[]\|null>` (L219) | Get-or-compute against Postgres/SQLite `discover_embed_cache`, keyed by `hashEmbedText`. Best-effort: swallows table-missing/DB errors. |
| `hashEmbedText` | `(text) → sha256 hex` (L197) | trim → collapse whitespace → lowercase → sha256. |
| `toVectorLiteral` | `(number[]) → "[0.1,0.2,...]"` (L271) | pgvector literal formatting. |
| `isPostgresKnex` | `(knex) → boolean` (L275) | `client === "pg" \|\| "postgresql"`. |
| `cosineDistance` | `(a,b) → number` (L286) | Manual JS cosine distance (mirrors `<=>`). |
| `fusedDistance` | `(queryVec, textVec, imageVec, textWeight=0.6, imageWeight=0.4) → number\|null` (L310) | Weighted fusion, "same weights as discover-search.js" per docstring — **but discover-search.js has no such weights today** (dead reference / aspirational). |
| `loadEmbeddingCacheMap` | `(knex, profileIds) → Map<profileId, {source: vector}>` (L360) | Loads `talent_embedding_cache` joined to `profiles`, re-validates consent per row via `isProfileEmbeddingAllowed`, keyed by logical source (`bio`,`full_profile`,`discover_index`,`casting`,`market`). |
| `upsertImageEmbedding` | `(knex, profileId, sourceText, opts) → Promise<false>` (L425) | **Permanent no-op** — "retired at launch". |
| `upsertTextEmbedding` | `(knex, profileId, source, sourceText, opts) → Promise<boolean>` (L444) | Core writer. Re-derives text from `buildSafeEmbeddingText`, ignores caller-passed `sourceText`. Re-checks consent inside a transaction (`forUpdate` on PG) both before and after the provider call; discards result if consent/DOB/text changed mid-flight. |
| `upsertDiscoverIndexEmbedding` | `(knex, profileId, profile, extras) → Promise<boolean>` (L783) | Thin wrapper: `upsertTextEmbedding(knex, profileId, "discover_index", "", {})`. |
| `upsertLexicalDocument` | `(knex, profileId, profile, extras) → Promise<boolean>` (L738) | Writes `profiles.search_document`; Postgres also sets `search_vector = to_tsvector('english', doc)`; SQLite writes/repoints `profiles_fts`. |
| `reindexDiscoverChannels` | `(knex, profileId, extras) → Promise<boolean>` (L806) | Orchestrator: loads profile + Scout (`onboarding_signals.ai_results.scout`), calls `upsertTextEmbedding` for `visual`/`casting`/`market` (visual is always skipped since text is `""`), then `upsertDiscoverIndexEmbedding`, `upsertLexicalDocument`, and the no-op `upsertImageEmbedding`. **Not called anywhere in `src/` or `netlify/` outside itself.** |
| `reindexDiscoverProfile` | `(knex, profileId, extras) → Promise<boolean>` (L854) | Alias for `reindexDiscoverChannels`. Same "no production caller" status. |
| `buildProfileText` | `(profile) → string` (L511) | `"Experience: X. Booking lanes: Y"` only. |
| `buildDiscoverIndexText` | `(profile, extras) → string` (L616) | Same fields; `extras.scout` intentionally ignored. |
| `buildVisualIndexText` | `(profile, extras) → ""` (L636) | Hard no-op. |
| `buildCastingIndexText` | `(profile) → string` (L649) | Same experience+lanes fields. |
| `buildMarketIndexText` | `(profile, extras) → string` (L665) | Lanes only. |
| `buildLexicalDocument` | `(profile, extras) → string` (L680) | `consent_corpus_v1 <visual+casting+market prose> booking_lane:<slug>…`, lowercased/collapsed. |
| `buildImageSourceText` | `(profile, scout) → ""` (L706) | Hard no-op. |
| `buildVisualTextFromProfile` | `(profile) → ""` (L802) | Alias calling `buildImageSourceText(profile, null)`. |
| `buildScoutText` | `(scout) → ""` (L531) | Hard no-op. |
| `flattenImageAnalysis` | `(imageAnalysis) → ""` (L599) | Hard no-op — vision output never reaches embedding text. |
| `deriveAgeBand` | `(dateOfBirth, referenceDate) → string\|null` (L566) | Coarse bands: "late teens to early twenties" … "fifties plus"; returns `null` under 18. Defined but **not called by any text builder** (age band is not currently emitted). |
| `isProfileEmbeddingAllowed` | `(profile, env) → boolean` (L106) | **The consent gate** — see §3. |
| `profileEmbeddingFeatureEnabled` | `(env) → boolean` (L79) | `env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS === "true"`. |
| `adultDateOfBirthUpperBoundExclusive` | `(referenceDate) → "YYYY-MM-DD"` (L83) | 18-years-ago cutoff, DOB-must-be-before this date. |
| `safeExperienceLevel` | `(profile) → string` (L124) | Maps free-text `experience_level` through an allowlist (`SAFE_EXPERIENCE_LEVELS`) to Title Case; unknown → `""`. |
| `embeddingStorageSource` | `(source) → string\|null` (L131) | Maps logical source name → stored `source` column value via `SAFE_EMBEDDING_STORAGE_SOURCES`. |
| `SAFE_LEXICAL_DOCUMENT_PREFIX` | `"consent_corpus_v1"` (const) | |
| `buildSafeEmbeddingText` | `(source, profile) → string` (L712) | Dispatches to the builder for `bio`/`full_profile`/`discover_index`/`casting`/`market`; `visual` and unknown → `""`. |
| `safeBookingLanes` | `(profile) → string[]` (L135) | Union of `modeling_categories` + `booking_lanes`, normalized, filtered to `SAFE_SELECTION_LANE_SLUGS` (commercial, ecomm, editorial, runway, lifestyle, beauty, promotional, creator_ugc). |
| `purgeProfileEmbeddingDerivatives` | `(knex, profileId) → Promise<void>` (L864) | Deletes rows from `talent_text_embeddings`, `talent_image_embeddings`, `talent_embedding_cache`, `profiles_fts`; nulls `profiles.search_document`/`search_vector` if present. |
| `purgeImageEmbeddingDerivatives` | `(knex, profileId) → Promise<void>` (L916) | Deletes `talent_image_embeddings` rows, `talent_embedding_cache` rows where `source IN ('image','visual')`, and `talent_text_embeddings` rows where `source='visual'`. |
| `DENSE_CHANNEL_SOURCES` | `["casting","market","discover_index"]` (const, L354) | Declares the intended dense-retrieval channel set; not consumed anywhere yet (no reader iterates it). |
| `EMBEDDING_MODEL` | `"text-embedding-3-small"` | |
| `EMBEDDING_DIMENSIONS` | `512` | |

### Storage — Postgres vs SQLite

- **Postgres** (`upsertTextEmbedding`, L475-489): raw `INSERT ... VALUES (?,?,?,?::vector,NOW(),NOW()) ON CONFLICT (profile_id, source) DO UPDATE ...` into `talent_text_embeddings`.
- **SQLite** (same function, L491-497): `upsertEmbeddingCache()` → `talent_embedding_cache` with `embedding_json` = `JSON.stringify(vec)`, upsert on `(profile_id, source)`.
- `discover_embed_cache` (soft-query cache) is dual-dialect JSON (`table.json("embedding")`), no vector type — a plain cache, never similarity-indexed.
- `talent_image_embeddings` table exists (Postgres-only) but has no writer (upsertImageEmbedding is a no-op).
- `brief_embeddings` table exists (Postgres-only), zero writers/readers anywhere in `src/` — pure future scaffolding ("References future briefs table").
- `archetype_embeddings` table exists (Postgres-only) with 4 seed rows (`runway`,`editorial`,`commercial`,`lifestyle`), embeddings NULL; docstring says populated by `ensureArchetypeEmbeddings()` in `src/lib/ai/archetypes.js` — **that path does not exist in this repo** (no `src/lib/` directory found; likely dead/legacy reference).

### Similarity helpers

- `cosineDistance(a,b)` — pure JS, mirrors pgvector `<=>` for app-side scoring (e.g. against `talent_embedding_cache` on SQLite where there's no native vector op).
- `fusedDistance(queryVec, textVec, imageVec, textWeight=0.6, imageWeight=0.4)` — weighted blend; **no caller in the codebase** (grep confirms). It's a ready-made scoring primitive with no HNSW-query counterpart written anywhere (no `<=>` ORDER BY query exists in `src/` outside the raw INSERT in `upsertTextEmbedding`).
- No `SELECT ... ORDER BY embedding <=> ?::vector LIMIT n` query exists anywhere in the repo — the ANN/HNSW indexes are built but never queried.

### HNSW indexes (all Postgres-only, all created, all unused)

- `talent_image_emb_hnsw` on `talent_image_embeddings(embedding vector_cosine_ops)`
- `talent_text_emb_hnsw` on `talent_text_embeddings(embedding vector_cosine_ops)`
- `brief_emb_hnsw` on `brief_embeddings(embedding vector_cosine_ops)`
- `archetype_emb_hnsw` on `archetype_embeddings(embedding vector_cosine_ops)`
- `images.embedding` has **no** index yet (migration comment: deliberately deferred until a population job ships, to avoid write amplification on an all-NULL column).

### Consent gate — `isProfileEmbeddingAllowed` (L106)

```js
function isProfileEmbeddingAllowed(profile, env = process.env) {
  return (
    profileEmbeddingFeatureEnabled(env) &&
    hasExplicitConsent(profile?.embedding_processing_consent) &&
    hasRecordedDateOfBirth(profile) &&
    !isMinorProfile(profile)
  );
}
```
`hasExplicitConsent(v)` treats only `true`/`1` as granted (Postgres boolean vs SQLite 0/1). Every write path (`loadEmbeddingEligibleProfile`, `upsertTextEmbedding`'s pre-provider-call check and its post-provider-call re-check inside a `trx.forUpdate()` transaction, `upsertLexicalDocument`, `loadEmbeddingCacheMap`) re-derives this from a **fresh DB read**, never a request-captured object — explicitly to survive consent withdrawal racing an in-flight embed call.

### Purge functions — production callers today

- `purgeProfileEmbeddingDerivatives` and `purgeImageEmbeddingDerivatives` are called from `talent/routes/settings.js` (withdrawal flow, §3) and imported (but currently unused beyond that) in `talent/routes/profile.js`.
- Both are also invoked directly by migration `20260804090000_add_explicit_ai_processing_consents.js` (`purgeProfileDerivatives`/`purgeImageDerivatives` — migration-local reimplementations, not the module functions, but same intent) to wipe every pre-consent-model derivative in one shot.

### Production callers today — summary

| Function | Called in production code? |
|---|---|
| `embed` | Indirectly via `cachedEmbed`/`upsertTextEmbedding`, but neither of those has a production caller either. **No production code path invokes `embed()` today.** |
| `cachedEmbed` | No caller found outside its own test. |
| `upsertTextEmbedding` / `upsertDiscoverIndexEmbedding` / `upsertLexicalDocument` / `reindexDiscoverChannels` / `reindexDiscoverProfile` | **No production caller.** |
| `purgeProfileEmbeddingDerivatives` / `purgeImageEmbeddingDerivatives` | **Yes** — `talent/routes/settings.js` withdrawal flow. |
| `loadEmbeddingCacheMap` / `fusedDistance` / `cosineDistance` | No caller. |
| `isProfileEmbeddingAllowed` | Used inside `embeddings.js` itself and in `settings.js` (`buildSettingsPayload`, consent read). |

---

## 2. Vision pipeline

### `src/domains/ai/analyzeProfileImage.js` — `masterVisionAnalysis`

- Public API: `masterVisionAnalysis(knex, imageBuffer, profileId) → Promise<castingAnalysis|null>` (L157).
- Provider: `groq-sdk`, model from `config.groq.visionModel` (default `"qwen/qwen3.6-27b"`, env `GROQ_VISION_MODEL`), `reasoning_effort: config.groq.visionReasoningEffort` (default `"none"`), `temperature: 0.2`, `max_completion_tokens: 1500`.
- Prompt (`MASTER_VISION_PROMPT`, L57-80) explicitly instructs: *"Do NOT estimate, describe, or mention skin tone, complexion, ethnicity, heritage, or body measurements anywhere in your output."* Requested JSON shape:
  ```
  { "castingAnalysis": {
      boneStructure, featureContrast, lookType, photoQuality, lightingRead,
      expressionRead, symmetryRead, primaryStrength, castingNotes,
      marketSignals: [2-4], bookingStrengths: [2-4], developmentNotes
  }}
  ```
  No appearance/identity classification field (no skin tone, ethnicity, weight, etc.) remains in the schema.
- Defense-in-depth: `SENSITIVE_VISION_KEYS = ["skinTone","skin_tone","measurementEstimates","measurement_estimates"]` is stripped post-parse by `stripSensitiveVisionFields()` (L282) even though the prompt no longer asks for them — belt-and-suspenders against model drift.
- Consent gate: `imageAiConsentGranted(profile)` (L94) = `ai_processing_consent===true/1 && hasRecordedDateOfBirth && !isMinorProfile`. `imageAiProcessingAllowed(profile, env)` (L103) adds `env.PHOLIO_ENABLE_IMAGE_ANALYSIS === "true"`. Re-checked via `currentImageAiProcessingAllowed(knex, profileId)` **twice**: once before the Groq call, once after (consent-withdrawal-mid-flight race), and again inside `persistProfileImageAiUpdate`'s own transaction.
- Persistence: `profiles.image_analysis` (JSON/JSONB), `profiles.image_analyzed_at` (timestamp), `profiles.image_analysis_model` (string) — created by **`migrations/20260902090000_create_profiles_image_analysis.js`** (dated today; see §6, this closes a previously-standing bug where the write silently threw and was swallowed).
- Where it runs: **on upload**, not scheduled. Called from `talent/routes/media.js` L181 inside the media upload handler (see §5) via a queue (`enqueuePitsJob`), not inline.
- Also imported (not necessarily invoked at runtime) by `talent/routes/comp-card-import.js`.
- Consumers of `image_analysis` downstream (per the new migration's own docstring): `domains/pdf/generator.js` `loadProfile()`, `domains/pdf/composition/index.js` `composeCompCard()` (parses into `castingAnalysis`, feeds `buildStatsBlock` market signals/lookType and `analyzeImagePool`'s hero ranking), `domains/pdf/routes/pdf.js`. **Not currently read by embeddings.js or discover-search.js.**

### `src/domains/ai/classify-portfolio-image.js` — `classifyPortfolioImage`

- Public API: `classifyPortfolioImage(input) → Promise<classification|null>` (L229), plus `persistImageSignals(db, imageId, classification)` (L175).
- Same Groq client/model (`config.groq.visionModel`), but a **different, narrower** prompt (`buildPrompt`, L24-64): classifies `shot_type`, `style_type`, `image_type` plus a `signals` block (`expression`, `pose_yaw`, `body_visibility`, `background`, `styling_register`, `retouch_likelihood`, `makeup_level`), confidence per field, `reasoning`, `uncertainty_factors`. No casting/market/appearance judgment — purely a "what kind of photo is this" classifier for portfolio management (PITS = "Portfolio Image Tagging Service", per `[PITS]` log prefix).
- Merges with a local heuristic (`heuristic-shot-classifier.js`, `classifyShotHeuristic`) and can skip the Groq call entirely when the heuristic is confident (`HEURISTIC_SKIP_THRESHOLD = 0.9`) and `style_type`/`image_type` are already set (`shouldSkipGroqVision`).
- Persists to **`image_signals`** table (one row per image) via `persistImageSignals`, upsert on `image_id`.
- Where it runs: called from `src/domains/talent/services/run-image-classification.js` → `runImageClassification(knex, imageId)`, itself invoked from `talent/routes/media.js` L197 through `enqueuePitsJob(profile.id, () => runImageClassification(knex, imageId))` — i.e. **on upload**, queued (see `pits-queue.js`), not a scheduled Netlify function.
- Consent gate: same shape as vision (`ai_processing_consent` + DOB + not-minor + `PHOLIO_ENABLE_IMAGE_ANALYSIS==="true"`), re-derived via `loadAuthoritativeProfile()` at multiple points (before the job runs, immediately before the Groq call via `beforeProviderCall`, and again inside the final persistence transaction) — same "re-read at the provider boundary" discipline as `embeddings.js`.
- Feedback loop table: `image_classification_feedback` (migration `20260622120000_image_classification_feedback.js`) — not inspected in depth, exists for human corrections.

### `image_signals` table (migration `20260710090100_create_image_signals.js`)

One row per image, `image_id` unique FK → `images.id` CASCADE. Columns:
`shot_type`, `style_type`, `image_type` (top-level), `expression`, `pose_yaw`,
`body_visibility`, `background`, `styling_register`, `retouch_likelihood`,
`makeup_level` (signals block), `analyzed_at`, `model`, `created_at`,
`updated_at`. All open-vocab strings (no CHECK constraint) — "the classifier
prompt is the source of truth."

### `comp-card-vision.js`

Not a per-profile/per-image discovery signal — it's a comp-card **transcription** service (`transcribeCompCard`, `sanitiseLines`) used by `talent/services/comp-card-import/extract.js` to OCR an uploaded external comp card image into structured fields during import. Unrelated to Discover/embeddings; noting it exists but out of scope for the semantic layer.

### Compliance drift history worth knowing

- `20260820120000_drop_ai_look_descriptor.js` and `20260820110000_drop_profiles_archetype.js` removed `look_descriptor`/`archetype` columns — a prior "judging layer" (commit referenced as "Stop the machine judging the person") was deliberately torn out: `scoreFromImageAnalysis`, `generateLookDescriptor`, `profiles.archetype` are gone; `castingAnalysis` was kept because "describing a photograph so it can be laid out well is a different act" from inferring a person.
- `20260824090000_reconcile_profiles_ai_drift.js` dropped 34 legacy inference columns from `profiles` (fit scores, `predicted_*` measurement/appearance guesses, `visual_intel`, `librarian_synthesis`, `market_fit_rankings`, `onboarding_predictions`, `photo_embedding`, `vector_summary`, `vector_summary_text`, geo duplicates, `age`) to match what production had already scrubbed. This is strong signal that **any semantic-layer design must not resurrect appearance/measurement inference as a search feature** — it's an explicitly closed door, not an oversight.

---

## 3. Consent and settings

### Columns on `profiles`

- `ai_processing_consent` boolean NOT NULL DEFAULT false — image analysis / portfolio classification purpose.
- `embedding_processing_consent` boolean NOT NULL DEFAULT false — "agency_search_matching" purpose (embeddings/index).
- Both created (for the *current*, correct semantics) by **`migrations/20260804090000_add_explicit_ai_processing_consents.js`**, which:
  - Adds both columns if missing, `notNullable().defaultTo(false)`, and forces **every existing row to `false`** even if the column pre-existed — a hard reset to default-off.
  - Creates `ai_processing_consent_events` (append-only, DB-trigger-enforced immutability on both dialects) — audit log with `purpose`, `event_type`, `granted`, `disclosure_version`, `disclosure_hash`, `actor_type`, `deletion_state`, `deletion_error`, `occurred_at`.
  - Purges every legacy pre-consent derivative (`purgeImageDerivatives`/`purgeProfileDerivatives` migration-local functions — images metadata `ai.classification`, `image_signals`, `image_classification_feedback`, dozens of `profiles` columns incl. `image_analysis`* at the time, `talent_text_embeddings`, `talent_image_embeddings`, `talent_embedding_cache`, `profiles_fts`, `ai_profile_analysis`).
  - Backfills a `migration_default_off` evidence event per profile per purpose.
  - `DISCLOSURE_VERSION = "2026-08-04"` and the two `DISCLOSURES` strings are the canonical disclosure text, hashed with sha256 and matched against `settings.js`'s `AI_CONSENT_DISCLOSURE_VERSION`/`AI_CONSENT_PURPOSES` (must stay in lockstep — same strings duplicated in both files).
  - `exports.down` is intentionally a no-op ("erase consent evidence... keep the safety baseline").
- **History/drift note**: an *earlier*, differently-scoped `profiles.ai_processing_consent` column was added by `20260712120000_add_ai_processing_consent_to_profiles.js` (deleted from the repo after being applied to prod) and later dropped by `20260728200000_drop_profiles_ai_processing_consent.js` (default `true`, orphaned, unread). The column name was **reused** for the new, correctly-scoped, default-`false` purpose column in `20260804090000`. Don't confuse the two in any historical grep.

### Talent-facing UI toggle

`client/src/domains/talent/pages/SettingsPage/index.jsx` (~L1200-1264): renders two toggles under an "AI processing" section —
- "Image analysis" — bound to `ai.imageProcessing`, `onChange` → `toggleAiProcessing('aiProcessingConsent', ai.imageProcessing)`.
- (unlabeled second row, profile embedding) — bound to `ai.profileEmbedding`, `onChange` → `toggleAiProcessing('embeddingProcessingConsent', ai.profileEmbedding)`.
- Both `disabled` when `!ai.canEnable && !current`, i.e. minors/no-DOB/no-migration can't toggle on but can toggle off.
- Descriptions come from `ai.imageProcessingDisclosure` / `ai.profileEmbeddingDisclosure`, and availability flags `ai.imageProcessingAvailable` / `ai.profileEmbeddingAvailable` mirror the two env flags (§4) — the UI shows the row even when the underlying pipeline is env-disabled, distinguishing "not entitled" from "entitled but off."

### Server-side settings route (`src/domains/talent/routes/settings.js`, 1151 lines)

- `AI_CONSENT_DISCLOSURE_VERSION = "2026-08-04"`, `AI_CONSENT_PURPOSES` maps `image_analysis→ai_processing_consent` / `agency_search_matching→embedding_processing_consent`, each with the disclosure string that must sha256-match the migration's copy.
- `GET /api/talent/settings` → `buildSettingsPayload()` (L~590) returns `settings.ai = { imageProcessing, profileEmbedding, imageProcessingDeletionState, profileEmbeddingDeletionState, disclosureVersion, imageProcessingDisclosure, profileEmbeddingDisclosure, disclosureHashes: {imageProcessing, profileEmbedding}, canEnable, imageProcessingAvailable, profileEmbeddingAvailable }`.
- `PUT /api/talent/settings` (L687+) accepts `aiProcessingConsent`, `embeddingProcessingConsent`, `aiConsentDisclosureVersion` in the body:
  - Rejects non-boolean values (400).
  - Rejects granting (`true`) unless `isExplicitAdultAiEligible(profile)` (403) — adult + recorded DOB.
  - Rejects granting unless `aiConsentDisclosureVersion === AI_CONSENT_DISCLOSURE_VERSION` (409) — client must have shown the current disclosure text.
  - Rejects entirely if the consent columns don't exist yet (503 — pre-migration deploy window).
  - On grant: records an `ai_processing_consent_events` row (`eventType:"granted"`, `deletionState:"not_requested"`) only if not already granted.
  - **On withdrawal (`granted:false`)**: records the withdrawal event with `deletionState:"pending"` in the same transaction as the profile-column update, then — outside the transaction, via `finishWithdrawal()` — runs the purge:
    - `image_analysis` withdrawal → `purgeLocalImageDerivatives(knex, profile.id)` (local helper, images/metadata cleanup) **then** `purgeImageEmbeddingDerivatives(knex, profile.id)` (from `embeddings.js`).
    - `agency_search_matching` withdrawal → `purgeProfileEmbeddingDerivatives(knex, profile.id)` (from `embeddings.js`).
  - This is **the withdrawal purge entry point** the task asked to locate: L844-857.

### Data export / account deletion

- `src/shared/lib/data-export.js`: includes `talent_embedding_cache`, `talent_image_embeddings`, `talent_text_embeddings` in the exportable-table allowlist (L60-62), with per-table shaping functions at L249 (`talent_embedding_cache`), L256 (`talent_image_embeddings`), L262 (`talent_text_embeddings`) — so a talent's data export surfaces their own embedding derivatives. Also explicitly excludes/flags legacy `vector_summary`/`photo_embedding` columns (L130) as already-dead.
- Account deletion (`src/shared/lib/account-deletion.js`) was grepped for embedding-table references and returned none directly — deletion presumably cascades via FK `ON DELETE CASCADE` from `profiles`/`images` rather than explicit embedding-table code (all the embedding tables have `profile_id ... onDelete('CASCADE')` in their migrations, and `images.embedding` lives on the `images` row itself). Worth a closer look before building the semantic layer's own deletion path, but no separate embedding-specific deletion code exists outside the withdrawal purge above.

---

## 4. Config

### `src/config.js`

- **No `openai` block exists.** `embeddings.js` reads `process.env.OPENAI_API_KEY` directly (L163), bypassing `config.js` entirely — inconsistent with every other provider (Groq, Stripe, R2, Hive) which are centralized in `config.js`. A semantic-layer refactor should probably add `config.openai = { apiKey, embeddingModel, embeddingDimensions }` for consistency and testability.
- `config.groq` (L152-186): `apiKey` (`GROQ_API_KEY`), `textModel` (`GROQ_TEXT_MODEL`, default `"openai/gpt-oss-120b"`, with a `DEPRECATED_GROQ_TEXT_MODELS` guard/warning for `"llama-3.3-70b-versatile"`), `textReasoningEffort` (`GROQ_TEXT_REASONING_EFFORT`, default `"low"`), `visionModel` (`GROQ_VISION_MODEL`, default `"qwen/qwen3.6-27b"`), `visionReasoningEffort` (`GROQ_VISION_REASONING_EFFORT`, default `"none"`). Every vision/text call site is required (per comment) to resolve its model from here, never hardcode — this discipline is **not** mirrored for the OpenAI embedding model, which is a bare constant inside `embeddings.js` (`EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`).
- `config.r2` (L203-213): `bucket`, `accountId`, `accessKeyId`, `secretAccessKey`, `publicUrl` (`R2_PUBLIC_URL`, falls back to `https://{bucket}.{accountId}.r2.cloudflarestorage.com`), `endpoint`, `region: "auto"`.

### `PHOLIO_ENABLE_PROFILE_EMBEDDINGS` usage (grep, exhaustive)

Only 5 files reference it: `embeddings.js` (the gate), `talent/routes/settings.js` (`profileEmbeddingAvailable` flag surfaced to UI), and three test files (`discover-embed-cache.test.js`, `embedding-consent-boundaries.test.js`, `ai-launch-fail-closed.test.js`). **No other production code branches on it** — in particular, `discover-search.js` does not check it (because it never touches embeddings at all).

### `PHOLIO_ENABLE_IMAGE_ANALYSIS` usage

`analyzeProfileImage.js`, `run-image-classification.js`, `talent/routes/settings.js` (availability flag), and 4 test files.

### `netlify.toml`

- `[functions."server"]`: `timeout = 26` (seconds), `memory = 3008` (MB) — the entire Express app (including any future semantic-search endpoint) runs inside this one Lambda with a **26-second hard timeout**. An OpenAI embed call + a pgvector ANN query would need to fit comfortably inside that budget alongside everything else the request does (brief parse via Groq, DB round trips, DTO shaping) — worth flagging as a latency budget constraint for query-time embedding.
- `external_node_modules` for `server`: does **not** list an OpenAI SDK (there isn't one — `embed()` uses raw `fetch`), consistent with "no SDK required" in the header doc.
- **Scheduled functions**: only one exists — `[functions."cleanup-application-drafts"]` with `schedule = "@daily"`. Its handler (`netlify/functions/cleanup-application-drafts.js`) runs `runDraftLifecycleCleanup`, `redactExpiredSubmissionPackages`, `runApplicationAutoClose`, `recordReturnedD30Events` — **nothing related to embeddings, discover_embed_cache TTL sweep, or discover_parse_cache TTL sweep**, even though the `20260710090600_create_discover_caches.js` migration's docstring claims "TTL is enforced by a `created_at` sweep in the existing daily scheduled function (WS6.3)". **This sweep does not exist** — see Gaps.
- `netlify/functions/` directory contains exactly 3 files: `cleanup-application-drafts.js`, `package.json`, `server.js`. No reindex/embedding-backfill scheduled function.

### `backfill:discover` npm script

**Does not exist.** `package.json` `scripts` block has `backfill:classification`, `backfill:strip-vision-sensitive`, `backfill:image-signals`, `backfill:profile-market` — no `backfill:discover` and no embedding-specific backfill script anywhere in `scripts/`. A semantic layer will need to author this from scratch (there are four analogous backfill scripts to pattern-match against: `scripts/backfill-image-classification.js`, `backfill-image-signals.js`, `backfill-profile-market.js`, `strip-vision-sensitive-fields.js`).

---

## 5. Write hooks

### Profile save — `src/domains/talent/routes/profile.js`

- Imports `purgeProfileEmbeddingDerivatives`, `purgeImageEmbeddingDerivatives` from `../../ai/embeddings` (L32-35) — **only the purge side**, no indexer import.
- No call to `reindexDiscoverProfile`/`reindexDiscoverChannels`/`upsertTextEmbedding`/`upsertLexicalDocument` anywhere in the file (confirmed by grep). Editing bio, lanes, experience level, etc. today does **not** refresh any embedding or `search_document`/`search_vector` — those only ever get written by the (currently uncalled) `reindexDiscoverChannels`, or nulled by a withdrawal purge. This is the primary wiring gap for the new semantic layer: **the write hook has to be added at profile save**, presumably right where the purge imports already sit.
- A comment at L1131 references "masterVisionAnalysis image inference that contradicted the accepted AI notices" — vestigial context, not a live call site.

### Image create/reorder/delete — `src/domains/talent/routes/media.js`

- Imports `runImageClassification` (L27, from `run-image-classification.js`) and `masterVisionAnalysis` (L44, from `analyzeProfileImage.js`).
- L170-181: comment states *"masterVisionAnalysis trigger was removed from profile.js — analysis runs in [media.js]"* — i.e. vision analysis used to fire from the profile-save path and was deliberately relocated to the media/upload path; `masterVisionAnalysis owns the provider boundary and authoritatively [re-checks consent]`. Called as `return masterVisionAnalysis(knex, buffer, profileId);` inside what appears to be an upload-completion callback.
- L197: `return enqueuePitsJob(profile.id, () => runImageClassification(knex, imageId))` — portfolio classification is **queued** (via `talent/services/pits-queue.js`) per profile, not run inline, and not scheduled — it fires off the back of an upload request but the actual Groq call happens asynchronously in the queue worker.
- No reference to `reindexDiscoverProfile`/embedding upsert in `media.js` at all — image add/reorder/delete does not touch any embedding/index derivative today (consistent with `upsertImageEmbedding` being a no-op).
- `src/routes/upload.js`: grepped for embeddings/vision call sites — **none found**. It appears to be a lower-level multipart/S3 plumbing route; the actual per-profile-image business logic (classification, vision, R2 key assignment) lives in `talent/routes/media.js` and `shared/lib/uploader.js`.

### Sharp derivative sizes — `src/shared/lib/uploader.js`

Main `uploadImage(...)` (defaults around L250-253):
```
maxWidth = 2000, quality = 85,       // processed/full image, webp
thumbWidth = 400, thumbQuality = 80, // thumbnail, webp
```
Pipeline (per image): `sharp(buffer).rotate().resize({width:maxWidth, withoutEnlargement:true}).webp({quality})` for the processed derivative, and a second `.rotate().resize({width:thumbWidth,...}).webp({quality:thumbQuality})` for the thumbnail. A second exported helper (~L458) takes `{agencyId, maxWidth=400, maxHeight=400}` for a different (agency-logo-style) resize path.

### Public URL shape (R2)

`r2PublicUrlForKey(key)` (uploader.js ~L30-34): `` `${config.r2.publicUrl.replace(/\/$/,"")}/${key}` ``, where `config.r2.publicUrl` defaults to the `media.pholio.studio` custom domain (env `R2_PUBLIC_URL`) or falls back to the raw `https://{bucket}.{accountId}.r2.cloudflarestorage.com`. Object key layout: `getR2Prefix(id, type="profiles")` → `{type}/{id}`, then `{prefix}/originals/{uuid}{ext}`, `{prefix}/processed/{uuid}.webp`, `{prefix}/thumbnails/{uuid}_400w.webp`. A future image-embedding pipeline (e.g. CLIP-style) would read from the `processed` or `thumbnails` key, not `originals`.

---

## 6. Database

### pgvector migrations (chronological)

| Migration | Adds |
|---|---|
| `20260218000002_add_pgvector_embeddings.js` | `CREATE EXTENSION IF NOT EXISTS vector`; tables `talent_image_embeddings` (1 row/profile, `vector(512)`, HNSW), `talent_text_embeddings` (1 row/(profile,source), unique on `(profile_id,source)`, HNSW), `brief_embeddings` (1 row/brief, `metadata jsonb`, HNSW). Postgres-only, silent no-op on SQLite. |
| `20260218000003_add_archetype_embeddings.js` | `archetype_embeddings` (PK `name`), HNSW, seeded with 4 archetype rows (embedding NULL). Postgres-only. |
| `20260607194500_create_talent_embedding_cache.js` | `talent_embedding_cache` (dual-dialect JSON fallback for SQLite dev/no-Neon), PK `(profile_id, source)`, FK CASCADE. |
| `20260607200000_discover_hybrid_search.js` | `profiles.search_document` (text, both dialects); Postgres: `profiles.search_vector tsvector` + `profiles_search_vector_gin` GIN index; SQLite: `profiles_fts` FTS5 virtual table (`profile_id UNINDEXED, document`). |
| `20260710090100_create_image_signals.js` | `image_signals` (vision classification signals, not vectors — see §2). |
| `20260710090200_add_images_embedding_vector.js` | `images.embedding vector(512)`, Postgres-only, **no index yet** (deferred to the population-job migration, which does not exist yet). |
| `20260710090600_create_discover_caches.js` | `discover_parse_cache` (`query_hash` PK, `contract json`, `model`) and `discover_embed_cache` (`text_hash` PK, `embedding json`) — dual-dialect, JSON not vector (never similarity-indexed, only exact-match cache reads). |

### Neon extension creation handling

`CREATE EXTENSION IF NOT EXISTS vector` appears in both `20260218000002` and `20260710090200`, each guarded by an `isPostgres` check first — idempotent, safe to run twice, no separate "ensure extension" utility module exists (it's inlined per-migration).

### Postgres vs SQLite detection pattern (repeated throughout)

Every vector-touching migration and every `embeddings.js` function uses the same idiom:
```js
const client = knex.client?.config?.client || "";
const isPostgres = client === "pg" || client === "postgresql";
```
(`isPostgresKnex()` in `embeddings.js` is the canonical helper version.) SQLite braches either silently no-op (vector tables/columns) or take a JSON-cache/FTS5 fallback path. This dual-dialect discipline must be preserved by anything the semantic layer adds.

### `search_document` / `search_vector` / `profiles_fts` lexical infra

- `profiles.search_document` — plain lowercase text, written by `upsertLexicalDocument()`, currently only reachable through the never-called `reindexDiscoverChannels`.
- Postgres `profiles.search_vector tsvector` + GIN index `profiles_search_vector_gin` — set via raw `to_tsvector('english', ?)` in the same function; **no query in `discover-search.js` currently does `@@ to_tsquery` against it** — the whole FTS path is unused by the live search engine, which instead does `whereILike` substring matches on `first_name`/`last_name`/`city` (see §8).
- SQLite `profiles_fts` FTS5 virtual table — same "written but never queried" status.

---

## 7. Tests

### `tests/matching/discover-embed-cache.test.js`

Tests only `cachedEmbed()` against a real temp SQLite file (`../../test-embed-cache.sqlite3`), with an injected `embedFn` stub (no network). Covers: cache-hit dedup on normalized text (mixed case/whitespace → 1 call), empty-text short-circuit, and best-effort tolerance of a missing `discover_embed_cache` table. Sets `process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "true"` at module load.

### `tests/security/embedding-consent-boundaries.test.js`

In-memory SQLite with hand-rolled `profiles`, `talent_embedding_cache`, `discover_embed_cache` tables. Imports `upsertTextEmbedding`, `loadEmbeddingCacheMap`, `cachedEmbed`, `buildProfileText` — exercises the consent-gate boundary (DOB/minor/flag/consent-off combinations) directly against the real functions, no mocking of OpenAI (SQLite path never calls `embed()` for these assertions, or an `embedFn` stub is injected — consistent with the pattern above).

### `tests/security/ai-launch-fail-closed.test.js`

Not opened in depth, but referenced by both `PHOLIO_ENABLE_PROFILE_EMBEDDINGS` and `PHOLIO_ENABLE_IMAGE_ANALYSIS` greps — a cross-cutting "everything fails closed when flags are unset" regression test.

### Mocking pattern for Groq (used by `discover/parse.js`, the brief-parser, and vision tests)

`__setGroqClient(client)` seam (`discover/parse.js`) lets tests inject `{ chat: { completions: { create: jest.fn(...) } } }` without a live `GROQ_API_KEY` — same pattern used by `tests/matching/discover-parse.test.js` and (by inspection) `tests/ai/classify-portfolio-image.test.js`. There is **no equivalent seam for the OpenAI embedding client** — `embed()` in `embeddings.js` always calls real `fetch()`; tests avoid it entirely by injecting `embedFn` at the `cachedEmbed`/`upsertTextEmbedding` call site instead of mocking `fetch`/OpenAI. A semantic-layer PR should keep this "inject the fetcher, don't mock HTTP" convention.

### Golden-brief fixture format — `tests/fixtures/discover-golden/*.json`

~20+ fixture files (`availability-*`, `boards-*`, `credential-*`, `heritage-*`, `dress-size-*`, `empty-pool-*`, etc.). Shape:
```json
{
  "name": "availability-multi-window",
  "category": "mixed",
  "brief": "fittings through June 26, shoot July 9-14",
  "now": "2026-06-01",
  "llm": {
    "roles": [
      { "label": "role 1", "count": 1,
        "hard": { "availability": [ { "kind": "fitting", "from": "2026-06-26", "to": null, "span": "through June 26" }, ... ] },
        "soft_query": "" }
    ],
    "set_aside": [],
    "unparsed_remainder": ""
  },
  "expect": { "roles_length": 1, "needs_confirmation": [] }
}
```
This is the **brief-parse contract** (structured `hard` filters + free-text `soft_query` per role, produced by Groq via `discover/parse.js`), not an embedding golden set — but it is exactly the shape a semantic layer would consume as its query input (`role.soft_query`) if it wants to add a dense-retrieval leg alongside `matchSearch`'s deterministic evaluation.

---

## 8. `src/domains/agency/services/discover-search.js` — plug-in points

Header docstring is explicit about current philosophy: *"no affinity score, no photo-derived signal, no percentage, and no number in the API at all."* This is the design constraint any semantic layer must either work within or explicitly get sign-off to change.

### `matchSearch(knex, context)` (L550-762) — current flow

1. `parseBrief(q, {knex})` → Groq-parsed `contract.roles[]`, each with `hard` (structured filters) and `soft_query` (leftover free text).
2. `applyDiscoverFilters()` — SQL `whereILike`/exact-match filters (city, letter, name substring, height, age via DOB cutoffs, gender, eye/hair color, experience level) — **lexical/exact only, no semantic step**.
3. `evaluateProfile(profile, hard, {bookouts, representationStatus, lanes})` (from `discover/constraint-eval.js`) → per-requirement `pass`/`fail`/`unknown` evaluations.
4. `softTerms(role.soft_query)` → tokenizes the leftover brief text (strips stopwords, applies `SOFT_SYNONYMS`/`SOFT_MULTIWORD`, drops heritage-proxy words via `heritageSlugsFromText`).
5. `talentText(profile, lanes)` (L429) → **talent-authored text only**: `bio_curated`, `specialties`, `specializations`, lane labels — explicitly never agency/booker text, never AI-derived text.
6. `softMentions(terms, haystack)` (L439) → whole-word regex match, capped `MAX_MENTIONS = 4`, returned verbatim as `mentions`.
7. Ordering: `matchCompare` (L472, group="match" = zero fails/unknowns) sorts by `mentions.length desc → newest → name`; `partialCompare` (L481, group="partial") sorts by `fails asc → unknowns asc → mentions.length desc → newest → name`. **This is exactly where a semantic similarity score would need to be spliced in** — both comparators are pure, synchronous, array-based sorts; a semantic layer would add a `similarity` field to each `kept` entry (built at L602-641) and extend these comparators (or insert a new tiebreak tier) rather than replace them, to preserve the "exact matches first, closest next, deterministic tiebreak" contract.
8. Response `dto.facts` (`buildFacts`, from `discover/present.js`), `dto.notes` (`buildResultNotes`), `dto.mentions` (`entry.mentions`) are set at L666-668 — these three fields are the per-result explanation surface; a semantic layer would likely want to add a fourth (e.g. `dto.semantic_note` or extend `mentions`) rather than overload the existing three, since `facts`/`notes` are keyed to the deterministic `evaluations` array and `mentions` is keyed to `softTerms`.
9. Response envelope: `meta.semantic_search` (always `false` today), `meta.natural_language_search`, `discover_v2.engine` (`"match"` literal — despite `discover_query_log.engine` migration comment listing `'launch'|'hybrid'|'browse'` as the intended enum, i.e. even the **existing** engine-name convention has drifted from its own migration comment).
10. `canUseSemanticSearch()` (L824-826) — **hardcoded `return false`**. This is the obvious flag to flip (or replace with a real capability check) when the semantic layer ships, and `hybridSearch()` (L828-832) is dead code today that just re-dispatches to `matchSearch`/`browseSearch` — it's a pre-existing seam name that suggests this was anticipated but never built out.

### Related helpers in the same module worth reusing

- `fetchApplicationMap`, `attachImagesAndInvites`, `loadLanesByProfile`, `loadBookoutsByProfile`, `loadRepresentationStatusMap` — all the DTO-shaping/eligibility helpers a semantic candidate-scoring pass would need to call after an ANN query returns candidate IDs (to reuse image visibility, invitation state, representation status, etc.).
- `isAgencyDiscoverable(profile, {agencyId})` (from `shared/lib/profile-visibility.js`) — the discoverability gate every candidate list is filtered through; a semantic ANN query would need to either pre-filter on this in SQL or post-filter results through it (candidate over-fetch pattern).

### `discover_query_log` / `discover_query_events` (migration `20260710090000`)

Already logs `raw_brief`, `parsed_contract`, `extraction_disagreements`, `engine`, `result_profile_ids`, `group_counts`, `timings` per search, plus per-profile outcome events (`impression|detail_open|invite|shortlist|tag`). `matchSearch`'s `result._launch` object (L747-759) assembles exactly this payload shape (`contract`, `dropped`, `needs_confirmation_fields`, `engine:"match"`, `result_profile_ids`, `group_counts`, `timings: {parse_ms, evaluate_ms, total_ms}`) for the route layer to persist via `discover/query-log.js`. A semantic layer should add its own timing bucket (e.g. `embed_ms`, `ann_ms`) to this `timings` object and log query embeddings' cache-hit rate here rather than inventing a new logging path.

---

## Gaps (things a semantic-layer design must account for, not just build against)

1. **No write-path wiring.** `reindexDiscoverProfile`/`reindexDiscoverChannels` exist but have zero production callers. Profile save (`profile.js`) and media upload/reorder/delete (`media.js`) never call them. This has to be built new — decide whether it's synchronous-in-request, queued (mirroring `enqueuePitsJob`), or scheduled/batch.
2. **Text builders emit almost nothing.** `buildProfileText`/`buildDiscoverIndexText`/`buildCastingIndexText`/`buildMarketIndexText` currently produce only `Experience: X. Booking lanes: Y` — two short fields. Any real semantic search needs these widened (bio? specialties? — but `bio_curated` and `specialties` are exactly the fields `discover-search.js`'s own `talentText()` already treats as safe talent-authored text for the *lexical* mentions feature, which is a strong signal for what's safe to widen into, vs. e.g. images/vision output which is explicitly walled off).
3. **Image/visual embeddings are structurally disabled**, not just unpopulated: `upsertImageEmbedding` always returns `false`, `buildVisualIndexText`/`buildImageSourceText`/`buildScoutText`/`flattenImageAnalysis` are hardcoded to `""`. `images.embedding` column exists with no index and no writer. Any multimodal ambition requires a deliberate, separately-reviewed product decision to re-enable this (per the code's own comments), not a silent addition.
4. **No ANN query exists anywhere.** No `<=>` similarity `SELECT` in the codebase — the HNSW indexes are built and never queried. `fusedDistance`/`cosineDistance` are unused scoring primitives. The semantic layer is starting from zero on the read side despite the storage scaffolding looking complete.
5. **`discover_embed_cache`/`discover_parse_cache` TTL sweep does not exist.** The migration's docstring claims a daily scheduled sweep; the only scheduled function (`cleanup-application-drafts`) does not touch either cache table. These will grow unbounded once query-time embedding goes live unless a sweep is added.
6. **No `backfill:discover` script.** Needs to be authored from scratch, patterned on `scripts/backfill-image-classification.js` / `backfill-image-signals.js` / `backfill-profile-market.js`.
7. **`archetype_embeddings` references a nonexistent module.** Migration comment points to `ensureArchetypeEmbeddings()` in `src/lib/ai/archetypes.js`, which does not exist in this repo (`src/lib/` isn't a directory here — everything is under `src/domains/` and `src/shared/`). Either dead scaffolding from a different branch/era, or a file that needs to be created; don't assume it's wired up.
8. **`brief_embeddings` table is pure scaffolding** — no `briefs` table exists yet to reference (`brief_id` is a bare nullable UUID with a comment "References future briefs table"), no writer, no reader anywhere.
9. **No OpenAI config centralization.** `OPENAI_API_KEY`/model/dimensions live only in `embeddings.js` constants + a bare `process.env` read, unlike every other provider which is centralized in `src/config.js`. Worth fixing as part of the semantic-layer work for testability/consistency (mirroring `config.groq`).
10. **`discover-search.js`'s own `engine` naming has already drifted** from its logging migration's documented enum (`'launch'|'hybrid'|'browse'` expected; code emits literal `"match"`), and `hybridSearch()` is a no-op alias — signals that whatever naming the semantic layer introduces should be reconciled with `discover_query_log.engine` deliberately, not organically.
11. **`deriveAgeBand()` is defined but never called** — if the semantic layer wants an age-band signal in embeddable text (a privacy-safer proxy than raw DOB/age), the function already exists and is unit-testable, just unwired.
12. **26-second Lambda timeout** (`netlify.toml` `[functions."server"]`) is a hard ceiling shared by the whole Express app — a synchronous query-time OpenAI embed call + Groq brief-parse + pgvector ANN + DTO shaping all have to fit inside it together; `discover_embed_cache` exists specifically to keep repeated/soft-query embeds off that budget, but nothing currently populates it in the live request path either.
13. **Consent purge exists; consent-aware *read* filtering for embeddings is centralized in one place** (`loadEmbeddingCacheMap`'s join + `isProfileEmbeddingAllowed` re-check) but that function has no caller — a semantic search's candidate-fetch step needs to either reuse this pattern exactly or reimplement its consent re-check, and should not trust a cached/stale `embedding_processing_consent` value read anywhere except immediately before use (per the module's own stated discipline).
