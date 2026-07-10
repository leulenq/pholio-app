# Discover Search — Final Implementation Plan

**Basis:** spec v2 (`tasks/discover-search-redesign.md`) + council review (`tasks/discover-search-council-review.md`).
**Owner decisions locked:** Discover moves to `openai/gpt-oss-120b` starting now. Existing Discover frontend design stays; UI work is limited to the search bar and informational content. Launch scale: 1 agency, ~100–200 talent/week.
**Proposed defaults for the remaining open decisions** (overridable, stated inline): corpus threshold 2,500; multi-role v1 = detect-and-split messaging; represented-agency naming = opt-in (default "undisclosed"); moderation = manual review queue at launch while a vendor is evaluated; cold-start = raise Neon auto-suspend + one scheduled warm-ping.

Sizing legend: **S** ≤ ½ day · **M** 1–2 days · **L** 3–5 days.

---

## PR sequence overview

| # | PR | Size | Depends on |
|---|---|---|---|
| 0 | Hotfixes: fabricated score, EXIF rotate, age reads, rate limit | S | — |
| 1 | Model migration → gpt-oss-120b (app-wide default) | M | — |
| 2 | Vision compliance: strip skin-tone/measurement estimates + reindex | M | — |
| 3 | Migrations bundle 1: query log, per-image signals, market, availability, per-image vector column | M | — |
| 4 | Parse v2: roles contract, strict schema, deterministic extraction, whitelist | L | 1 |
| 5 | Launch-mode engine: score-everything, constraint tiers, grouped results API | L | 3, 4 |
| 6 | DTO + data: representation_status, tattoos, stats-recency states | M | 3 |
| 7 | Observability: query/outcome logging wired end-to-end, Postgres caches | M | 3, 5 |
| 8 | Eval: golden set, Layer-1 CI gate, channel ablation | M | 4, 5 |
| 9 | Frontend A: server-only chips + provenance highlighting + inline editing | L | 4, 5 |
| 10 | Frontend B: grouped sections, card content, why-lines, browse landing, URL state | L | 5, 6, 9 |
| 11 | Talent-side: bookouts UI, stats prompt, Intel nudges | L | 3 |
| 12 | Moderation provider wiring | M | decision |

Parallelization: PRs 0–3 are independent and can land immediately in any order. PR 4 and PR 3 can proceed in parallel. Frontend PRs 9–10 can start against a mocked API contract (§WS5) once PR 5's response shape is agreed. PR 11 is independent of the search engine entirely.

Launch gate = PRs 0–10 merged + §WS8 exit criteria green. PR 11 ships within the launch window (availability data needs lead time to populate); PR 12 before open public signup.

---

## WS0 — Hotfixes (PR 0)

1. **Fabricated browse score** — `client/src/domains/agency/pages/DiscoverPage.jsx:44-53`: delete the `?? baseScore(p.id)` fallback in `mapTalent` and the `baseScore` helper. JSX already null-guards (`talent.resonance != null`). No other change.
2. **EXIF auto-orient** — `src/shared/lib/uploader.js`: insert `.rotate()` as the first Sharp op in both derivative chains (~lines 216-219, 251-254). Verify with a test fixture image carrying EXIF orientation 6.
3. **Deprecated `age` reads** — `src/domains/agency/services/discover-retrieval.js:57-61`: replace the `profiles.age` filter with the DOB-cutoff logic already exported from `discover-search.js` (`ageFilterDobCutoffs`). `src/domains/ai/embeddings.js:388`: derive age band from `date_of_birth` (or omit) instead of `profile.age`.
4. **Rate limit** — new limiter on `GET /api/agency/discover` + invite endpoint (`src/domains/agency/routes/inbox.js:3369+`), cloned from `src/shared/middleware/ai-writer-rate-limit.js` (keyed user/session/IP; 20 req/min default, env-tunable).

**Verify:** browse mode shows no numeral; sideways-upload fixture renders upright; grep confirms zero remaining `profiles.age` references outside migrations; limiter returns 429 under burst.

---

## WS1 — Model migration (PR 1) — *starting now, hard deadline 2026-08-16*

1. `src/config.js:125`: default `textModel` → `"openai/gpt-oss-120b"` (env override `GROQ_TEXT_MODEL` already exists for rollback). Vision model (`llama-4-scout`) is unaffected by this deprecation — leave it.
2. `src/domains/agency/services/query-understanding.js:44,53`: adopt the proven pattern from `src/domains/pdf/composition/art-director.js:14,40,271` — `response_format: { type: "json_schema", json_schema: { …, strict: true } }`. (The full v2 contract lands in WS3; this PR keeps the *current* parse shape but strict-encoded, so the migration is decoupled from the redesign.)
3. Sweep all other `config.groq.textModel` consumers (rerank, bio writer, chat, matching reasoner — grep `textModel`) and smoke-test each output for tone/format regressions; per-feature env overrides only if a regression demands it.
4. Add a startup warning if the configured text model matches a known-deprecated list.

**Verify:** existing query-understanding unit tests pass on the new model; one manual bio-writer and chat generation reviewed; `DISCOVER_HYBRID=true` end-to-end search still returns results.

---

## WS2 — Vision compliance (PR 2)

1. `src/domains/ai/analyzeProfileImage.js` (`MASTER_VISION_PROMPT`, lines 47-79): remove `skinTone` and `measurementEstimates` from the prompt/output schema, or retain measurement estimates **only** as prefill suggestions written to a non-indexed staging field the talent confirms. Nothing AI-estimated persists to canonical measurement columns.
2. `src/domains/ai/embeddings.js` (`flattenImageAnalysis` ~350, `buildDiscoverIndexText` ~384, and the channel builders): stop emitting skin-tone (and heritage, already excluded — assert it) into any index/lexical text.
3. **Backfill:** script to strip the fields from existing `profiles.image_analysis` JSONB and re-run `reindexDiscoverProfile()` for all discoverable profiles (reuse `npm run backfill:discover` machinery).
4. Regression test: index text builders must never contain a denylisted token set (`skin`, `ethnicity`, `heritage`) for a fixture profile that has those fields populated.

---

## WS3 — Migrations bundle 1 (PR 3)

All dual-dialect (PG + SQLite) per house style:

1. `discover_query_log` — `id, agency_user_id, raw_brief, parsed_contract (json), extraction_disagreements (json), engine ('launch'|'hybrid'), result_profile_ids (json), group_counts (json), timings (json), created_at`.
2. `discover_query_events` — `id, query_log_id (fk), profile_id, event ('impression'|'detail_open'|'invite'|'shortlist'|'tag'), created_at`.
3. `image_signals` — per-image row keyed `image_id`: `shot_type, body_visibility, expression, styling_register, makeup_level, commercial_editorial_read, analyzed_at, model`. (Promotes the `signals` block `classify-portfolio-image.js` already computes and discards.) Plus profile-level aggregate columns or a view: `body_visibility_max, expression_set (json), style_genres (json)`.
4. `images.embedding vector(512) NULL` (PG only; SQLite no-op) — multimodal pre-provisioning, unpopulated at launch.
5. `profiles.market` (nullable slug) + backfill script deriving from `city` via `shared/lib/geolocation.js`; write-path hook on city change.
6. `profiles.availability_status` enum-ish text (`available|limited|unavailable`, default `available`) + `bookouts` table (`id, profile_id, starts_on, ends_on, note, created_at`).
7. `profiles.measured_in_person_at` + `measured_by_agency_id` (nullable) — the only state allowed to render "confirmed".
8. `discover_parse_cache` (`query_hash pk, contract json, model, created_at`) and `discover_embed_cache` (`text_hash pk, embedding, created_at`) — Postgres-backed caches replacing per-process Maps (WS6.3).

Wire `classify-portfolio-image.js` to persist into `image_signals` on every analysis; one-off backfill over existing images (they're already classified — re-run only where `signals` weren't stored, which is all of them).

---

## WS4 — Parse v2 (PR 4)

New module layout under `src/domains/agency/services/discover/`:

1. **`contract-schema.js`** — the §4 roles contract as a strict-legal JSON schema (all keys required, `additionalProperties:false`, nullable unions, fixed-key confidence per constraint, `op: exact|min|max|between|approx`, region-tagged sizes, enum-set ORs, multi-window availability, `representation_status`, `credentials`). **CI check:** a Jest test compiles the schema against Groq strict-mode rules (no optional keys, no dynamic maps) and validates all few-shot fixtures against it.
2. **`parse.js`** — replaces the guts of `query-understanding.js`: gpt-oss-120b strict call, few-shot set covering units/relative dates/negation/multi-role/regions/"18 to play younger"; cache read/write via `discover_parse_cache`; fallback to the existing regex/lexicon decomposition (`intent-parser.js`) on model failure. Multi-role: parser emits `roles[]`; v1 execution searches `roles[0]` and returns a `multi_role_notice` for the UI.
3. **`extract-values.js`** — deterministic layer. Every numeric/date constraint in the LLM output carries `span`; this module re-parses spans:
   - Heights/lengths: purpose-built parser handling `5'9"`, `5 ft 9`, `five nine`, `175cm`, `175 cm`, `1.75m` (extend `intent-parser.js:parseHeightToCm`, which currently misses spaced/metric-decimal forms). Property-based tests over generated notations.
   - Dates: add **`chrono-node`** (new dep, root `package.json`) for "next week", "through June 26", "July 9–14"; multi-window kinds preserved.
   - Disagreement (LLM value vs deterministic value, or unparseable span) ⇒ constraint marked `needs_confirmation: true`; it is **not applied** to filtering and surfaces as an "interpretation — check me" chip.
4. **`validate-contract.js`** — field/enum whitelist derived from one source of truth shared with the SQL layer; unknown fields/values dropped and logged to `discover_query_log.extraction_disagreements`.
5. **Credential honesty gate** — if `credentials` constraints are present and the pool has no falsifiable data (no `published_work` yet), short-circuit to the honest-zero response with reason; never pass credential language into `soft_query`.

---

## WS5 — Launch-mode engine (PR 5)

1. **`engine.js`** — entry point selected by `DISCOVER_ENGINE=launch|hybrid|browse` (new; `DISCOVER_HYBRID` kept as legacy alias). Launch mode activates when engine=launch **and** eligible-pool count < `DISCOVER_CORPUS_THRESHOLD` (default 2500); above threshold it logs and falls through to hybrid.
2. **`constraint-eval.js`** — loads the eligible pool (existing gate: `is_discoverable`, `profile_status='active'`, adult, `bio_curated` present) with the fields the contract can touch; evaluates each profile against each hard constraint → satisfaction vector `{constraint, pass|fail|unknown}`. `unknown` (e.g. no availability data) is distinct from `fail` and rank-penalized + labeled, never treated as satisfied. Playing-age = range overlap. Only gender/stats-track (when explicit) applied as SQL exclusion; everything else scored.
3. **Soft scoring** — single-channel: cosine of `soft_query` embedding (cache via `discover_embed_cache`) against the `discover_index` text embedding; FTS kept only if the WS8 ablation earns it. Multi-channel legs and RRF remain in the hybrid engine for post-threshold scale; not called in launch mode.
4. **Ordering** — group 1: all client-gate constraints pass → sort by (# operational constraints passed, soft score). Group 2 per §6 tiers: operational-miss groups keyed by the missed constraint. Client-gate misses excluded from the payload unless `include_outside_spec=true` (explicit UI action).
5. **Rerank removal** — `discover-rerank.js` not called in launch mode; `MIN_RERANK_SCORE` dropping gone. Tier bands: server maps final ordering to the small fixed band set consumed by the MatchScore ring; raw scores never leave the API.
6. **Response contract** (agreed with frontend before PR 9 starts):
   ```jsonc
   {
     "engine": "launch",
     "understanding": {
       "roles": [...], "applied": [ {field, op, value, span:[start,end], confidence,
                                     needs_confirmation, tier} ],
       "set_aside": [...], "multi_role_notice": null|{...}
     },
     "groups": [
       { "kind": "exact", "heading": null, "results": [...] },
       { "kind": "near",  "missed": "availability", "heading": "Near matches — availability unconfirmed",
         "results": [...] }
     ],
     "pool": { "eligible": 214, "shown": 30 },
     "honest_zero": null | { "reason": "...", "removable_chip": "credentials" }
   }
   ```
   Result item: DTO fields + `key_stat` (board-derived server-side), `age_band`, `tier_band`, `constraint_truth` (per-card pass/fail/unknown annotations), `why_facts` (template string, no LLM), image chosen digitals-first.
7. **Why-lines** — `why_facts` composed server-side from matched fields (zero LLM). Interpretive Tier-2 line: separate streamed endpoint `GET /api/agency/discover/why/:queryLogId/:profileId` (gpt-oss/haiku-class, grounded in matched fields only), requested lazily by the client after render.
8. **Empty-result honesty** — `honest_zero` names the most-narrowing constraint (computed from satisfaction vectors: the constraint whose removal grows group 1 the most).

---

## WS6 — DTO, data exposure, caches (PRs 6–7)

1. **`representation_status`** — derived in the DTO layer (`src/shared/lib/audience-dto.js`): join `talent_representations` (+ `seeking_representation`) → `unrepresented | seeking | represented — <name|undisclosed> | exclusive elsewhere`. Naming an agency requires talent opt-in flag (new boolean on the representation row; default undisclosed). Added to `AGENCY_DISCOVERY_FIELDS` and the contract whitelist.
2. **Tattoos/piercings** into `AGENCY_DISCOVERY_FIELDS` (adults only), talent-side copy reframed to "visible when dressed".
3. **Caches** — `parse.js` and embedding calls read/write the WS3 cache tables; TTL enforced by `created_at` sweep in the existing daily scheduled function. In-process Maps removed.
4. **Stats recency** — DTO exposes `measurements_updated_at` (renders "last updated") and `measured_in_person_at` (renders "measured in person <date>"). Agency-side action to set it lives on the roster/detail surface (small endpoint + button in `DiscoverDetail`/roster).
5. **Query/outcome logging** — route handler writes `discover_query_log` per search; impression logging extends the existing `recordDiscoveryImpressions` call site (`inbox.js:3388`) to also write `discover_query_events`; invite/tag/shortlist endpoints write events when a `query_log_id` is passed by the client.

---

## WS7 — Frontend (PRs 9–10; search bar + informational content only)

**PR 9 — understanding & chips** (`client/src/domains/agency/`):
1. `intentParser.js` demoted to typing aid: ghost-text/autocomplete stays; `facetsFromMeta` fallback to client lexicon deleted — chip rack shows a skeleton until server `understanding` arrives.
2. **Provenance highlighting** — new component rendering the raw brief with underline spans from `understanding.applied[].span`; hover/tap tooltip shows extracted value + op. Brief stays visible after submit (search bar becomes the anchored brief view in results state).
3. **Editable chips** — hard-tier chips in a single-line rack (soft/set-aside behind "Reading your brief — N terms" disclosure). Inline edit per spec: numeric → inline number input + unit suffix; date → native date inputs; Enter commits, Esc reverts, × removes. `needs_confirmation` chips get the "check me" treatment. Edits are authoritative: PATCH re-runs search with the edited contract and splices the value into the displayed brief text marked "(edited)". Multi-role notice banner from `multi_role_notice`.

**PR 10 — results & landing:**
4. Grouped sections from `groups[]` — repeated headings (existing `dc-curated-head` treatment), per-card plain-text `constraint_truth` annotation in the always-visible stats row and carried into `DiscoverDetail`. "Show nearest (outside spec)" action re-queries with `include_outside_spec=true`.
5. Card content: board-derived `key_stat`, `age_band`, `why_facts` on the always-visible face with fixed reserved height (skeleton shimmer; no masonry reflow); Tier-2 "Pholio's read:" fetched lazily, visually labeled, never merged with facts. MatchScore ring consumes `tier_band` only.
6. Browse landing: pool line ("30 of 214 discoverable"), load-more, "Newest talent" labeling. Honest-zero state renders the reason + one-click removal of `honest_zero.removable_chip`.
7. Workflow: `submitted` query → URL search params (restore on load/back); last 10 searches in localStorage surfaced in the existing `dc-intel` focus panel above canned suggestions.

---

## WS8 — Eval & ablation (PR 8)

1. Golden set at `tests/fixtures/discover-golden/*.json` — 40–60 briefs: hard-only, soft-only, mixed, negation, unit variants (`5'9"`/`five nine`/`1.75m`), truncated-range adversarials, multi-role, credential asks, set-aside terms, region sizes, empty-pool cases. Each: brief, expected contract (canonical), expected constraint outcomes against seeded fixtures.
2. **Layer-1 CI gate** (extends `scripts/eval-discover-quality.js`, runs in Jest): (a) parse+extract produces the expected canonical contract — asserting *intended vs parsed*, not just internal consistency; (b) no result in any group violates its group's constraint truth; (c) strict-schema compile check. Target 100%; failures block merge.
3. **Layer-2** relevance: LLM-as-judge binary per result on the golden set, human-spot-validated once before trusting; precision@10 recorded per run in a checked-in trendfile.
4. **Pre-launch ablation** (script, run once, decision recorded in this doc): single-channel vs multi-channel embeddings; FTS on/off — over the golden set on staged real data. Channels/FTS are removed from launch mode unless they win.

**Launch exit criteria:** Layer-1 100% · Layer-2 precision@10 ≥ 0.8 on judged set · warm p50 ≤ 1.2s · cold p95 ≤ 4s (after Neon auto-suspend raise + warm-ping) · zero denylisted tokens in index text · rate limiter verified.

---

## WS9 — Talent side (PR 11)

1. **Bookouts UI** — Profile/Settings section ("Availability", industry copy: status select + bookout date ranges list, add/remove). API under `domains/talent/routes/settings.js` pattern; minors inherit consent gating (measurements-locked profiles get no public availability exposure).
2. **Stats-currency prompt** — dashboard nudge when `measurements_updated_at` > 90 days: one-tap "still accurate" (touches timestamp) or link to MeasurementsSection.
3. **Intel nudges** — extend the existing `profile_events` demand pipeline: aggregate which parsed constraint fields appeared in agency searches; surface "N searches this week filtered by <field> — yours is blank" on IntelPage. Uses `discover_query_log`, no new capture needed.
4. Booking-lane vocabulary extension (e-comm, fit, curve, petite, parts, athletic) in `BookingLanesControl` options + whitelist sync.

## WS10 — Moderation (PR 12, before open signup)
Decision required (Hive vs Rekognition). Interim shipping posture: new uploads with heuristic score above threshold → manual review queue (admin surface or flagged list) rather than silent pass. Provider adapter drops into the existing pluggable `content-moderation.js` seam.

---

## Rollout

1. **Flags:** `DISCOVER_ENGINE` (default `hybrid` until exit criteria green, then `launch`), `DISCOVER_CORPUS_THRESHOLD=2500`, `GROQ_TEXT_MODEL` as rollback lever for WS1.
2. **Dark launch:** run launch-mode engine in shadow for a week of real agency queries (log both engines' outputs to `discover_query_log`, serve hybrid) → compare before flipping.
3. **Cold start:** raise Neon auto-suspend (dashboard config) + a 10-min scheduled warm-ping function hitting a no-op DB query (netlify.toml scheduled function, pattern exists at `cleanup-application-drafts`).
4. **Rollback:** every PR independently revertable; engine flag flips back to `hybrid` without deploy.

## Risks

| Risk | Mitigation |
|---|---|
| gpt-oss-120b regresses bio/chat tone after WS1 sweep | per-feature `GROQ_*_MODEL` overrides; manual review in PR 1 |
| Deterministic extractors disagree with LLM too often → chip-confirmation fatigue | log disagreement rate in shadow week; tune few-shots before flip |
| Availability data empty at launch → "unknown" labels everywhere | expected + honest by design; talent-side PR 11 ships early in the window; onboarding prompt for status |
| Shadow week shows launch-mode ordering worse than hybrid | ablation + Layer-2 arbitrate; cross-encoder rerank is the pre-approved escalation, not LLM rerank |
| Aug 16 model shutdown before PR 1 lands | PR 1 is first in queue and independent of everything else |
