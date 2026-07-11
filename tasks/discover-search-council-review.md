# Discover Redesign — Adversarial Council Review

**Date:** 2026-07-10
**Subject:** `tasks/discover-search-redesign.md` (v1)
**Method:** Four independent adversarial reviewers, none exposed to the reasoning that produced v1: (A) search-architecture red team, (B) image/vision systems, (C) agency head-booker realism (grounded in `.claude/skills/industry/reference/`), (D) UX/trust interaction. All verified claims against real code and, where empirical, against primary sources.
**Launch context supplied to all reviewers:** 1 agency, ~100–200 new talent/week → searchable corpus of a few hundred profiles at launch. Owner constraint: the existing Discover frontend design stays; only the search bar and informational content may change.

## Verdict

**v1 is NOT launch-ready.** The diagnosis of the current system was confirmed accurate (constraints-as-boosts, rerank math, the `profiles.age` prefilter bug, missing rate limit all verified in code), and the direction — real hard constraints, no hot-path LLM rerank, honest empty states, editable understanding — survives. But the plan fails in three structural ways and carries a set of independent launch-blockers, several of which are live bugs shipping today. The council's required changes are folded into spec v2 (`tasks/discover-search-redesign.md`).

---

## Launch-blockers (consolidated, deduplicated)

**LB-1 — The parse model doesn't support the feature and dies Aug 16, 2026.** (Reviewer A)
Groq strict structured outputs do NOT support `llama-3.3-70b-versatile` (only `openai/gpt-oss-20b`/`gpt-oss-120b` support `strict:true`), and that model is scheduled for decommission **2026-08-16** — it is the app-wide default (`config.js:125`) powering Discover parse/rerank, bios, and chat. App-level blocker independent of this redesign. The proven fix already exists in-repo: `src/domains/pdf/composition/art-director.js` runs `gpt-oss-120b` with `json_schema, strict:true` with passing tests. Additionally, the v1 §4 contract schema is illegal under strict mode (optional keys, sparse `confidence` map) — must be rewritten all-keys-required / `additionalProperties:false` / nullable unions / fixed-key confidence, with CI schema-compile validation.

**LB-2 — The architecture is mis-sized for the launch corpus; hard-filter-first makes the fallback the product.** (A + C independently)
At ~300 profiles, the plan's own flagship query funnels to ~0 rows; the relaxation ladder fires on the majority of real briefs. Real bookers work a thin new-faces pool by browsing/scouting, not precision queries. Required inversion below an explicit corpus threshold (~2–3k eligible): **score everything, exclude almost nothing** — rank by (hard constraints satisfied, then soft similarity), present "matches 5 of 6 — misses: availability" inline. Browse-first default landing state (a capped version already exists in code — label it, show total pool count, add load-more). RRF fusion over 300 profiles is near-flat ordering; prefer single dense similarity + constraint-satisfaction score at launch scale; run the channel ablation before launch, not during Phase 1.

**LB-3 — Auto-relaxation is unsafe as designed.** (A + C independently)
Parser confidence is orthogonal to booker intent: the ladder can relax the one constraint that is a hard client gate (height on a runway brief; a fixed shoot date). Playing-age and legal-adjacent constraints must never auto-relax. Required: **never auto-relax silently.** Static per-field policy: *client gates* (height, exact measurements, playing age, board) → honest zero + explicit opt-in "show nearest (outside spec)"; *operational constraints* (locality, dates flexibility, union) → may relax but always segregated in a separately-headed "Near matches — relaxed on X" section with a per-card plain-text annotation (a single top banner will be scrolled past — banner blindness). Confidence informs chip editability, not relaxation order.

**LB-4 — Wrong-but-schema-valid parse reaching a hard filter is the real killer, and v1 has no defense.** (A + D independently)
"5'9"" extracted as 165, "July 9–14" truncated to July 9 — confident, plausible, wrong, and invisible: the whitelist passes it, Layer-1 eval passes it (results obey the *parsed* constraint), the booker acts on it and the damage lands hours later in scheduling. Required: **no LLM-produced number or date reaches a SQL filter without deterministic re-parse of the original text span** (real unit-parsing + `chrono-node`-class date parsing; LLM proposes the span and semantics, deterministic code extracts the value; disagreement → flagged editable chip, not a silent filter). UI: **provenance highlighting** — keep the raw brief visible and underline the exact substrings that produced each constraint, so a truncated range is visible as a literal gap in the underline rather than a mental diff. Add adversarial wrong-value cases to the golden set.

**LB-5 — Representation/conflict status is invisible to search.** (C)
`talent_representations` (mother/placement, `is_exclusive`, market) already exists in the schema and never reaches discovery; `AGENCY_DISCOVERY_FIELDS` exposes only the coarse `seeking_representation` boolean. The launch agency cannot distinguish "unrepresented, ours to develop" from "exclusive with another mother agent" — a real-world conflict/reputation mistake, and the KB's #1 credibility rule (one-talent-one-agency software "has already failed"). Required: derived `representation_status` (`unrepresented / seeking / represented — <named or undisclosed> / exclusive elsewhere`) in the discovery DTO and the hard-filter contract.

**LB-6 — Credential asks get confidently-wrong answers.** (C)
"Has tearsheets", "fit model, exact measurements", "shows walked" have no falsifiable fields; the semantic layer will surface editorial-*looking* newcomers for briefs the entire pool structurally cannot satisfy. Required: the parser must recognize credential/experience language as constraints and return an **honest zero with the reason** ("no talent currently list published editorial work") instead of semantic hand-waving. A minimal self-reported `published_work` signal can follow.

**LB-7 — Image pipeline: three live defects.** (B)
1. **EXIF orientation is destroyed**: the Sharp pipeline never calls `.rotate()` before `.resize().webp()` (`uploader.js:216-254`), so a fraction of phone uploads render sideways — in the agency grid, comp cards, and into the vision model. One-line fix, ship immediately.
2. **The live pipeline violates the plan's own compliance rule**: `MASTER_VISION_PROMPT` extracts AI-estimated skin tone and body measurements, and `flattenImageAnalysis()` embeds skin-tone text into the search index (`embeddings.js:350,384`) — exactly what v1 §"correct posture" forbids. Strip `skinTone` and `measurementEstimates` from all search-facing/embedded output.
3. **Moderation is a skin-pixel heuristic with no real provider wired** (`MODERATION_PROVIDER=heuristic`) — inadequate for open signup at 100–200 uploads/week. Wire a real NSFW/CSAM provider or gate signup behind manual review at launch volume.

**LB-8 — The browse-mode match score is fabricated, today.** (D)
`mapTalent` falls back to `baseScore(p.id)` — a hash of the profile UUID mapped into 78–97 — rendered with the same authority as a real score whenever no query has run (`DiscoverPage.jsx:44-53`). Bookers comparing browse-mode "91" vs "84" are reading random noise. One-line deletion (the JSX already null-guards); ship regardless of everything else.

**LB-9 — Chip editing, the plan's central trust mechanism, has no interaction spec.** (D)
Numeric ranges, units, and date ranges need a defined edit interaction before build: inline click-to-edit (value becomes inline input with unit suffix; Enter commits, Escape reverts; × removes), no popovers; chip edits are **authoritative** and must patch the visible query text so text and filters can never diverge; the pre-submit chip preview must never be sourced from the client `intentParser.js` lexicon (a different, dumber classifier with no hard/soft distinction) — show a loading skeleton until the server parse returns.

---

## High-priority (ride along with Phase 1, not independently blocking)

- **Multi-role briefs** ("2 women + 1 man"): contract becomes `roles: [{label, count, hard, soft}]`, or v1 explicitly detects multi-role and splits/asks — never silently merges. (A + C)
- **Serverless caching is fiction as designed**: per-process `Map`s are empty on every cold Netlify invocation; move parse/embedding caches to Postgres keyed by normalized query hash, or delete the claim. Re-baseline latency honestly: warm p50 ~1s AND cold p95 (realistically 5–9s first-search-of-day: Netlify cold start + Neon wake + cold API calls); raise Neon auto-suspend at launch volume. (A)
- **`discover_query_log` + click/invite capture in Phase 1, not Phase 3** — with one agency, logged queries and which results got invited are the only relevance signal that will exist. (A)
- **Contract gaps**: `exact|min|approx` qualifiers; region-tagged dress/shoe sizes (US 6 ≠ UK 6 ≠ EU 6); OR-sets for enums ("blonde or red"); playing-age as range-overlap; multi-window availability ("fittings through June 26, shooting July 9"). (A)
- **Per-image analysis at launch, not Phase 3**: the per-image classifier already runs on every upload and its `signals` (body_visibility, expression, styling_register, makeup_level) are discarded; persisting + aggregating them costs ~nothing and unlocks the body/range queries the agency will type. Deferral saved nothing. (B)
- **Second deprecated-`age` read**: `embeddings.js:388` embeds `profile.age` into the index text — fix alongside `discover-retrieval.js:57-61`. (A)
- **Copy honesty**: "stats confirmed" overclaims — self-reported recency is "last updated"; only an agency-set "measured in person" flag may say confirmed. (C)
- **Result-card content** (within frozen design): key stat is board-derived (curve → dress size; fit → waist/hips; runway → height), age band shown, digitals-tagged image preferred over retouched book shots, why-line on the always-visible face with reserved height (not hover-gated, no layout shift), split two-tier: factual template line (matched fields, no LLM) always; interpretive read optional and explicitly labeled ("Pholio's read: …"), never blended into one sentence. (C + D)
- **MatchScore ring feeding**: post-rerank-removal the number is a within-batch rank artifact; feed the ring coarse tier-band values, not precise-looking 0–100 integers. (D)
- **Cheap workflow wins now**: query state in the URL (back/refresh restore), recent real searches in the existing `dc-intel` panel via localStorage, zero-state offers one-click removal of the most-narrowing chip instead of "Clear search". (D)
- **Chips scale**: always-visible rack = hard constraints only, one line; soft/set-aside behind a "Reading your brief — N terms" disclosure. (D)

## Corrections to v1's own text
- Weight **is** collected (`weight_kg/lbs`, onboarding + profile) — it is intentionally excluded from the discovery DTO; v1 said "never collected." (C)
- §8's Editorial Ledger rebuild is void — owner decision: the existing Discover frontend design is intentional and stays; scope is the search bar + informational content only. (Owner + D)
- Minors: state explicitly that minors are denied from Discover pre-DTO (`isAgencyDiscoverable`, `audience-dto.js:405`) — verified true, but v1 was silent on it for the search surface. (A + C)

## Image question — council answer (B, one dissent noted)
1. **Storage:** keep R2 + Sharp derivatives; add `.rotate()` (blocker); wire real moderation.
2. **Extract:** per-**image** categorical signals (shot type, body visibility, expression, styling genre, makeup level, editorial/commercial read) — already computed, currently discarded. Delete AI skin-tone and AI measurement estimates from anything search-facing.
3. **Embed:** v1 text-only (structured fields + curated bios + per-image metadata rendered to text). Owner's assumption that per-image *vector* embeddings are needed for launch is **wrong**: queries are text, and untuned CLIP-class encoders are demonstrably weak on abstract vibe language ("girl next door") and compositional binding.
4. **But** v1's "text already captures it" was overstated (vision-prose → text embedding is a lossy double bottleneck for fine aesthetic similarity). Multimodal is a *known* upgrade, not a maybe: pre-provision a nullable per-image `vector(512)` column, standardize the canonical derivative as encoder input, and log underperforming look-queries now. Trigger: golden-set look-recall failing, or a reverse-image "looks like this" feature request. Model when triggered: Cohere embed-v4 @512d (shared text+image space, Matryoshka-compatible with the existing 512-d index).

## What survives v1 unchanged
Hard/soft register separation; killing hot-path LLM listwise rerank; ethnicity/protected-class exclusion + `set_aside` visibility (called "unambiguously correct" by the booker reviewer); no external vector DB / search cluster / new service; DOB never in search, playing-age instead; golden-set + two-layer eval (extended with wrong-value adversarial cases); bookouts/availability as talent-declared industry vocabulary; the diagnosis of the current system (verified accurate in code).
