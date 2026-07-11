# Discover Redesign — Natural-Language Talent Search (v2)

**Status:** Design, revised after adversarial council review (no implementation yet)
**Council record:** `tasks/discover-search-council-review.md` — v1 was judged **not launch-ready**; v2 incorporates every required change.
**Launch reality (governs all sizing):** 1 agency, ~100–200 new talent/week → a few hundred searchable profiles at launch, low thousands in year one.
**Owner constraint:** the existing Discover frontend design (dark cinematic surface, card grid, MatchScore ring, detail modal) is intentional and **stays**. Scope for UI change: the search bar and the informational content layered on the existing surfaces.

---

## 0. Phase 0 — pre-launch blockers (independent of the redesign)

These are live defects that must ship before or with anything else:

1. **Model migration (app-wide).** `llama-3.3-70b-versatile` — the default for Discover parse/rerank, bios, and chat (`config.js:125`) — is decommissioned by Groq on **2026-08-16**, and it does not support strict structured outputs at all. Migrate to `openai/gpt-oss-120b` with `json_schema, strict:true`; the working pattern + passing tests already exist in `src/domains/pdf/composition/art-director.js`.
2. **EXIF auto-orient.** Add `.rotate()` as the first Sharp op in every derivative (`src/shared/lib/uploader.js:216-254`). Without it, phone portrait uploads render sideways in the grid, in comp cards, and into the vision model.
3. **Strip AI skin-tone and AI measurement estimates from everything search-facing.** `MASTER_VISION_PROMPT` extracts them and `flattenImageAnalysis()` embeds skin-tone into the discover index (`embeddings.js:350,384`) — a live violation of our own compliance posture. Estimated measurements may only prefill talent-editable fields; never a discovery signal.
4. **Remove the fabricated browse score.** `mapTalent`'s `?? baseScore(p.id)` fallback (`DiscoverPage.jsx:44-53`) renders a UUID-hash as a 78–97 "match" number in browse mode. Delete the fallback; the JSX already null-guards.
5. **Real image moderation.** `MODERATION_PROVIDER=heuristic` (skin-pixel ratio) is inadequate for open signup; wire a real NSFW/CSAM provider or gate signup behind manual review at launch volume.
6. **Fix both deprecated `profiles.age` reads:** the hybrid prefilter (`discover-retrieval.js:57-61`) and the index text builder (`embeddings.js:388`).

---

## 1. Diagnosis (v1, confirmed accurate by council)

Behind `DISCOVER_HYBRID=true` there is already a real pipeline — Groq query decomposition, five-leg pgvector + FTS retrieval fused by RRF, Groq listwise rerank. Its confirmed flaws:

1. **Hard constraints are soft boosts** (`structuredBoostForProfile`, `discover-retrieval.js:227-289`) — a 5'6" profile can surface for "must be 5'9"+".
2. **Final ordering is 70% LLM listwise rerank** (`discover-rerank.js:185`) — non-deterministic, latency-heavy, degrades strong retrieval, silently drops candidates scoring <40.
3. **No typed parse contract** — no ranges, units, negations, confidence, or validation.
4. **The data model can't answer real booker questions** — no availability state, raw city strings, tattoos hidden from discovery, representation status invisible, credentials unfalsifiable.

And from the council: the browse score is fabricated (§0.4), the vision pipeline leaks skin-tone into the index (§0.3), photos can render sideways (§0.2), and the platform-wide LLM is scheduled to die (§0.1).

---

## 2. How agencies describe talent (unchanged from v1, plus council additions)

Hard constraints: playable age (never actual DOB), height gates, exact fit measurements, locality ("work as a local"), availability windows, tattoo visibility, union status, board/division, gender/stats track — **plus, per council: representation status** ("freelance / unrepresented only") **and credential asks** ("has tearsheets", "shows walked", "fit experience").

Soft aesthetic language: editorial vs commercial registers, face/body/vibe descriptors ("character face", "girl next door", "athletic build", "edgy").

Compliance posture (unchanged, council-endorsed): ethnicity is never a filter or boost; recognized terms are visibly **set aside** ("not used for filtering"), never silently dropped; actual age/DOB never reaches search — playing-age ranges only; no identity inference from photos; measurements are per-brief job-fit data, never a general body score. Minors are denied from Discover entirely pre-DTO (`isAgencyDiscoverable`, `audience-dto.js:405`) — now stated explicitly: nothing in this redesign changes that gate, and bookouts/availability inherit the same consent rules.

---

## 3. Architecture (revised: sized for hundreds, not tens of thousands)

Stack verdict stands: **no external vector DB, no search cluster, no new service** — Neon Postgres + Groq + existing OpenAI embeddings. But the retrieval shape inverts at launch scale.

### The corpus-threshold rule
Below an explicit threshold (eligible pool < ~2,500), run **launch mode: score everything, exclude almost nothing.** Above it, graduate to the filter-first design. The threshold is a config value checked at query time, not a rewrite.

### Launch-mode pipeline

```
brief text
  │
  ▼
1. PARSE — Groq gpt-oss-120b, json_schema strict:true, few-shot on units/dates/negation
   → roles[] contract (§4); regex/lexicon fallback when Groq is down
  │
  ▼
2. DETERMINISTIC VALUE EXTRACTION (no LLM numbers reach filters)
   → the LLM proposes each constraint's SOURCE SPAN + semantics; a deterministic
     layer (unit parser for heights/measurements, chrono-node-class date parser)
     re-parses the span and produces the value that actually filters
   → LLM/deterministic disagreement ⇒ constraint flagged as low-confidence,
     rendered as an editable chip, NOT applied silently
   → whitelist validation: unknown fields/enum values dropped + logged
  │
  ▼
3. ELIGIBILITY ONLY — is_discoverable, active, adult, minimal binary gates
   (gender/stats-track when explicit). Everything else stays scoreable.
  │
  ▼
4. SCORE THE WHOLE POOL (hundreds of rows — trivial)
   → per-profile constraint-satisfaction vector (which hard constraints pass/fail)
   → dense similarity of soft_query vs discover embedding (single channel at
     launch; multi-channel only if the pre-launch ablation earns it)
   → rank: exact-match group first (all client gates satisfied), then by
     (# constraints satisfied, soft similarity)
  │
  ▼
5. PRESENT with constraint truth attached
   → exact matches; then segregated "Near matches — misses: <constraint>" sections
   → client-gate misses (§6 tiers) appear ONLY behind explicit
     "show nearest (outside spec)" action — never auto-shown
  │
  ▼
6. EXPLAIN — factual template line from matched fields (no LLM), always;
   optional labeled interpretive line ("Pholio's read: …"), streamed after render
```

### What this fixes vs v1
- **The relaxation ladder is gone as control flow.** At 300 profiles most briefs match 0–5 exactly; "matches 5 of 6 — misses availability" is a *ranking presentation*, not a filter mutation. Nothing auto-relaxes (§6).
- **RRF ceremony removed at launch scale** — over a tiny corpus RRF ordering is near-flat; single dense score + constraint satisfaction discriminates better. The multi-channel ablation runs **before launch**; channels return only if the golden set proves them.
- **LLM listwise rerank stays dead** in the hot path (unchanged from v1). If eval later shows ordering problems at scale, the option is a cross-encoder (Cohere Rerank), still not an LLM.
- **MatchScore ring feeding:** post-rerank the raw number is a rank artifact; the API returns coarse tier-band values (the small fixed set the ring already tiers into), never precise-looking integers.

### Serverless reality (replaces v1's caching claims)
Per-process `Map` caches are empty on every cold Netlify invocation — at one agency's sparse usage, most searches are cold. So: parse results and query embeddings cache to **Postgres** (normalized-query-hash keyed); profile embeddings are already persisted. Latency is stated honestly: **warm p50 ≤ 1.2s; cold p95 target ≤ 4s** (Netlify cold start + Neon wake + cold API calls realistically 5–9s unmitigated — mitigate by raising Neon auto-suspend at launch volume and trimming the fan-out to parse + 1 embed call). Both numbers are exit criteria; neither is hidden behind the other.

### Observability + feedback (moved from Phase 3 to Phase 1)
- **`discover_query_log`**: every search stores raw brief, parsed contract, deterministic-extraction disagreements, result set, and timings.
- **Outcome capture**: clicks, detail-opens, invites, shortlists joined back to the query. With one agency, this is the only relevance signal that will ever exist for tuning — it starts on day one.

---

## 4. Query-understanding contract (revised: strict-legal, role-aware, operator-complete)

Top level is **roles**, because real briefs bundle them ("2 women 22–30 and 1 man 40s"):

```jsonc
{
  "roles": [
    {
      "label": "string",
      "count": 1,                       // integer ≥ 1
      "hard": { /* all keys always present; unused = null */ },
      "soft_query": "string"
    }
  ],
  "set_aside": [ { "text": "...", "reason": "not_used_for_filtering" } ],
  "unparsed_remainder": "string"
}
```

Single-role briefs are `roles.length === 1`. Multi-role briefs render one result group per role; if v1 implementation punts on multi-role execution, the parser still **detects** them and tells the booker "this brief describes 2 roles — searching the first; run the second separately," never a silent merge.

`hard` (every key present, nullable; `additionalProperties:false`; strict-mode legal — schema compile is a CI check):

```jsonc
{
  "gender_presentation": ["female"] | null,          // enum set = OR semantics
  "height_cm":   { "op": "min|max|between|approx", "a": 175, "b": null,
                   "span": "5'9\" and up", "confidence": 0.97 },
  "playing_age": { "a": 22, "b": 30, "span": "...", "confidence": ... },
                                                     // matched by RANGE OVERLAP
                                                     // vs playing_age_min/max
  "measurements": { "waist_cm": {...}, "dress_size": {"value":"6","region":"US"},
                    "exact": true } | null,          // sizes always region-tagged
  "shoe": { "size": 9, "region": "US" } | null,
  "location": { "market": "nyc", "local_only": true, "travel_ok": null } | null,
  "availability": [ { "kind": "fitting|shoot|window", "from": "...", "to": "..." } ] | null,
                                                     // multi-window: "fittings
                                                     // through Jun 26, shoot Jul 9"
  "visible_tattoos": false | null,
  "boards": ["editorial"] | null,                    // enum set = OR
  "hair_color": ["blonde","red"] | null,             // enum set = OR
  "eye_color": [...] | null,
  "union": "union|non_union|either" | null,
  "representation_status": ["unrepresented","seeking"] | null,   // NEW — LB-5
  "credentials": { "tearsheets": true, "runway_shows": null,
                   "fit_experience": null, "span": "...", ... } | null   // NEW — LB-6
}
```

Rules:
- **Numbers and dates that filter must come from deterministic re-parse of `span`** (§3 step 2). Confidence is a fixed field per constraint object, never a sparse map.
- Every constraint carries an `op` qualifier where precision matters: "5'9" or taller" (`min`) ≠ "around 5'9"" (`approx`, ±3cm, made explicit) ≠ "exactly" (`between` tight).
- Structured negations → typed booleans; aesthetic negations → soft down-weights.
- **Credential constraints are honesty gates:** when the pool has no falsifiable data for a credential ask, the answer is an honest zero with the reason ("no talent currently list published editorial work"), never a semantic look-alike ranked as a match.
- Few-shot set covers: `5'9"`, `five nine`, `175cm`, `1.75m`, "at least/under/around/between", "18 to play younger", region-tagged sizes, "local to X", relative and multi-window dates, multi-role detection.

---

## 5. Data model changes (revised)

1. **`representation_status`** (LB-5) — derived from `talent_representations` (already migrated: mother/placement, `is_exclusive`, market) + `seeking_representation`, exposed in `AGENCY_DISCOVERY_FIELDS` as `unrepresented / seeking / represented — <named or undisclosed> / exclusive elsewhere`, and hard-filterable. **Phase 1.**
2. **Per-image analysis at launch, not Phase 3** — `classify-portfolio-image.js` already computes per-image `signals` (body_visibility, expression, styling_register, makeup_level, editorial/commercial read) on every upload and discards them. Persist per `image_id`, aggregate to the profile (max body visibility, expression set, style genres present), include in the index text. Cost ≈ zero (calls already happen); unlocks body/range/digitals queries.
3. **Multimodal-ready, not multimodal** — nullable per-image `embedding vector(512)` column + the standardized `processed.webp` derivative as canonical encoder input, provisioned now so the upgrade (Cohere embed-v4 @512d, shared text+image space) is an add, not a rebuild. Trigger: golden-set look-recall failure or a reverse-image feature request.
4. **`profiles.market`** — canonical market slug derived from city (existing `geolocation.js`), so "local to NYC" matches Brooklyn. Keep `city` for display.
5. **Availability v1** — `availability_status` (`available/limited/unavailable`) + `bookouts` table (industry term), talent-declared, minor-consent-gated. Search treats missing availability as *unknown, rank-down + labeled* — never as unavailable and never silently satisfied.
6. **Tattoos/piercings** into the discovery DTO (adults), reframed as "visible when dressed".
7. **Stats recency honesty** — `measurements_updated_at` surfaces as **"last updated <month>"** (self-reported), plus a new agency-side **"measured in person"** flag settable after a go-see — the only state allowed to render as "confirmed".
8. **`published_work` minimal credential signal** (self-reported, labeled as such) to make credential asks falsifiable over time. Fast-follow, not launch-gating (the honesty gate in §4 covers launch).
9. **`discover_query_log` + outcome capture tables** (§3). **Phase 1.**
10. **`saved_briefs`** parent table for the existing unused `brief_embeddings` — Phase 3, unchanged.
11. Correction from v1: weight **is** collected (`weight_kg/lbs`) and intentionally excluded from the discovery DTO; that exclusion stands.

Ethnicity/heritage/skin-tone posture unchanged — excluded from DTO, filters, boosts, and (per Phase 0.3) now genuinely excluded from the embedded index too.

---

## 6. Constraint tiers and honesty rules (replaces v1's relaxation ladder)

Every hard-constraint field carries a static policy — set in schema, not decided per-query by model confidence:

| Tier | Fields | Behavior on miss |
|---|---|---|
| **Client gates** | height, exact measurements/sample size, playing age, board, gender/stats-track, visible tattoos (when stated), representation status, credentials | Never auto-shown as matches. Honest zero ("0 exact matches — 3 talent are within 2cm") + explicit **"show nearest (outside spec)"** action; outside-spec cards carry a permanent plain-text annotation. |
| **Operational** | locality, availability, union, travel | May appear below exact matches, always in a segregated section with its own repeated heading ("Near matches — availability unconfirmed") **and** a per-card annotation that travels into the detail modal. |

Model confidence never decides what relaxes — it decides which chips render as "interpretation, please check". Playing-age and any legal-adjacent gate are `never` at the policy level. This is both safer (booker's client gate can't be quietly dropped) and more premium (the system visibly respects the brief) than auto-relaxation.

---

## 7. Evaluation (revised)

- Golden set 40–60 briefs, now also stratified for: **wrong-value adversarial cases** (unit misparses, truncated ranges — Layer-1 must assert the filter matches the *intended* constraint, not just that results obey the *parsed* one), multi-role briefs, credential asks against a pool with no credentials, set-aside terms, region-tagged sizes.
- Layer 1 (deterministic, CI, target 100%): no result violates any applied constraint AND deterministic re-parse agrees with applied values.
- Layer 2: LLM-as-judge binary relevance, human-spot-validated; precision@10 tracked per prompt/embedding change.
- Pre-launch ablations: multi-channel vs single embedding; FTS leg on/off. Channels must earn their per-query calls before launch, not after.
- Post-launch: `discover_query_log` mining + invite-outcome joins are the standing eval feed.

---

## 8. Search-bar & informational experience (rewritten under the frontend freeze)

The existing Discover visual design — dark cinematic surface, masonry grid, MatchScore ring, detail modal — is intentional and stays. Everything below is search-bar behavior and informational content on the existing surfaces.

1. **Search bar + brief mode.** Keep the bar, cycling example prompts, and ghost-text as a *typing aid only*. Add an expandable multi-line brief mode (`resize: none`). The client lexicon (`intentParser.js`) never renders constraint chips — pre-parse, the chip rack shows a loading skeleton; chips appear only from the server contract. (The client lexicon has no hard/soft distinction; showing its guesses as constraints is the black box we're removing.)
2. **Provenance highlighting — the honesty mechanism.** The raw brief stays visible after parse; the exact substrings that produced each constraint are underlined, with the extracted value on hover/tap. A truncated parse ("July 9" underlined, "–14" not) is visible as a literal gap — no proofreading of paraphrases required.
3. **Editable chips — specified interaction.** Hard constraints only in the always-visible rack (one line); soft + set-aside terms behind a "Reading your brief — N terms" disclosure. Inline click-to-edit: numeric chip → inline number input with unit suffix (Enter commits, Esc reverts); date chip → inline native date inputs; × removes. No popovers. **Chip edits are authoritative**: an edit patches both the applied contract and the visible brief text (spliced via the provenance span, marked "(edited)"), so the text a booker copies to Slack always matches what actually ran. Low-confidence and deterministic-disagreement chips render in an "interpretation — check me" state.
4. **Result cards (content only).** Always-visible face gains: board-derived key stat (curve → dress size; fit → waist/hips; runway/fashion → height), age band, and the why-line with reserved fixed height (skeleton shimmer until streamed; no masonry reflow). Why-line is two-tier and never blended: **Tier 1 always** — factual template from matched fields, zero LLM ("5'10" · NYC · editorial · stats updated Jun"); **Tier 2 optional, labeled** — "Pholio's read: clean, androgynous energy". Card image prefers a digitals-tagged shot over retouched book shots. Representation status appears as plain text where set ("Seeking representation"). MatchScore ring receives tier-band values only (§3).
5. **Sectioned truth instead of banners.** Exact matches first; near-match groups under repeated section headings + per-card annotations (§6). Genuine zero: name the most-narrowing chip and offer one-click removal of *that chip* — not "Clear search".
6. **Browse-first landing.** The no-query state is the scouting surface: labeled ("Newest talent", by board), shows the true pool size ("30 of 214 discoverable"), and has load-more. The brief bar refines the pool; it is not the only door.
7. **Cheap workflow wins now (not Phase 3):** query state in the URL (back/refresh restore); the existing `dc-intel` focus panel shows the booker's last 5–10 real searches (localStorage) ahead of canned suggestions. Saved briefs with alerts remain Phase 3 (needs backend); side-by-side compare is an **explicit deferral** (keyboard modal nav is the interim).
8. **Actions in place** (unchanged): shortlist to casting board, tag, schedule, message from results — feeding the existing pipeline machinery.

---

## 9. Roadmap (revised)

**Phase 0 — blockers (§0):** gpt-oss-120b migration (before 2026-08-16), EXIF `.rotate()`, skin-tone/measurement-estimate strip, fabricated-score removal, moderation provider, both `age` reads. *Several are one-liners; none are optional.*

**Phase 1 — correctness core:** roles contract + strict schema (CI-validated) + deterministic value extraction; launch-mode score-everything pipeline with constraint tiers (§6); representation_status in DTO + contract; credential honesty gate; per-image signals persisted + indexed; `discover_query_log` + outcome capture; Postgres-backed caches; rate limit on the endpoint; golden set incl. adversarial cases. *Exit: Layer-1 100% (incl. intended-vs-parsed); warm p50 ≤1.2s; cold p95 ≤4s; pre-launch channel ablation decided.*

**Phase 2 — experience + data:** provenance highlighting + editable chips per §8 spec; two-tier why-lines; sectioned near-matches; browse-first landing polish (counts, load-more); URL state + recent searches; board-derived card stats; market normalization + backfill; availability v1 (status + bookouts) both dashboards; tattoos in DTO; "last updated"/"measured in person" stats states; talent-side searchability nudges via Intel; `published_work` signal.

**Phase 3 — depth (eval- or usage-gated):** saved briefs + new-match alerts; multi-role *execution* (grouped result panels); cross-encoder rerank if ordering metrics demand; multimodal image embeddings per §5.3 trigger; graduate to filter-first architecture past the corpus threshold; side-by-side compare.

**Explicitly not doing:** external vector DB / search cluster / new service; LLM listwise rerank in the hot path; auto-relaxation of any constraint; ethnicity or actual-age filtering; photo-inferred identity attributes; CLIP-class image embeddings at launch; precise-integer match scores over rank-fusion output.

---

## 10. Open decisions

1. **Corpus threshold value** for launch-mode vs filter-first (proposed: 2,500 eligible profiles).
2. **Cold-start mitigation depth**: raise Neon auto-suspend only, or also add a scheduled function warm-ping (cheap at one agency, mild cost at scale).
3. **Multi-role v1 execution**: detect-and-split messaging only (proposed) vs grouped result panels at launch.
4. **Moderation provider** selection (Hive vs Rekognition vs manual-review queue at launch volume).
5. **Representation disclosure granularity**: does "represented — <named agency>" require talent opt-in to name the agency, or default to "undisclosed"? (Privacy lean: opt-in naming.)
