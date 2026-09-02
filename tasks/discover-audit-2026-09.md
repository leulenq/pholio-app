# Discover (agency "Scout") — audit and rethink, September 2026

**Date:** 2026-09-02
**Scope:** `/dashboard/agency/discover` end to end: the search interaction, parsing, matching and ordering, refinement, ambiguity, empty and partial states, language, trust, and the talent-side data it depends on.
**Supersedes:** the interpretation UI specified in `tasks/discover-search-redesign.md` §8 and the "directory" engine that shipped after the 2026-08-09 removals. The compliance invariants in those documents are kept; the surface and the ranking model are replaced.
**Owner decision recorded here:** Discover is a first-class natural-language talent search for agencies. The 2026-08-15 analysis (§9.3) proposed keeping only an opt-in "invite to apply" and removing search as a talent-surfacing engine. The owner has re-opened that decision and asked for an excellent search. This document designs it inside the invariants that made the earlier caution correct.

---

## 1. What Discover is, from first principles

### 1.1 The user and the moment

Two people use this page and they are in two different tempos.

- **The booker with a brief.** A client or a show needs bodies: "three women, 5'9" and up, size 2 to 4, local to New York, fittings the week of the 9th". They have a document or an email open in another window. They want candidates they can put in a package today. Tempo: fast, precise, scan faces, confirm stats, move on. They already know what "active filters" look like from Models.com, Casting Networks, and their own agency software.
- **The scout in development mode.** No brief. "Show me new faces who could develop for our editorial board." Tempo: slow, photo-first, curious. Text is a lens on a pool, not a query with a right answer.

Both decide off the photograph in about a second and use the stats to confirm. Both stop trusting a tool the first time it hides someone who was obviously right, or shows someone who was obviously wrong without saying why.

### 1.2 What the product must therefore do

1. **Turn a brief into filters the booker already understands**, and show those filters in booker language ("Women · 5'9" and up · New York · Editorial"), each removable in one click, numeric ones editable in place. The filters *are* the interpretation. There is nothing else to surface about how words were parsed.
2. **Never return an empty grid when there are near candidates.** At launch scale (hundreds of profiles) most precise briefs match zero to five people exactly. The honest product shows exact matches first, then the closest, and says per card what is off ("5'8", 1 in under · Hair color not listed"). Hiding the near candidates behind a button is the same as returning zero.
3. **Never let the machine judge the person.** Ordering is by how many of the booker's own stated requirements each talent's own declared facts satisfy. No affinity score, no "potential", no photo-derived identity, no Studio+ preference. When two talent satisfy the brief equally, the tie-break is what they wrote about themselves against the booker's soft words, then recency.
4. **Say what it cannot do, once, in one plain sentence, only when it changes the results.** "Tearsheets aren't listed on profiles yet, so that part of the brief wasn't used." Everything else the system could not place is dropped silently. A booker is not a parser's QA.
5. **Lead to an invitation, never to dossier access.** Unchanged.

### 1.3 What Discover is not

Not a casting board, not a CRM, not an AI opinion about a face, not a debugger for the parser, and never a place where paying changes who is shown or where.

---

## 2. Audit of the shipped experience

Graded P0 (breaks trust or returns wrong results), P1 (a working booker hits it), P2 (polish).

### 2.1 The interpretation UI is a query debugger (P0, the owner's complaint)

`BriefUnderstanding.jsx` renders, after every search: the brief with underlined spans; a chip rack keyed by internal field names ("Board", "Gender"); a "Reading your brief — N terms" disclosure containing an "Aesthetic:" line and set-aside terms annotated "not used for filtering"; "check" flags on chips the deterministic re-parser disagreed with. For the brief "runway black" the booker sees `BOARD Runway` · `black — not used for filtering` · `READING YOUR BRIEF — 1 TERM`. This is the parse tree, not the answer. Every element of it exists to protect the booker from the parser; the correct protection is to show the resulting filters and let them be edited.

### 2.2 "Black women" returns the wrong thing on purpose (P0)

Talent self-declare heritage on their own profile: `profiles.ethnicity`, a jsonb array from a 10-option multi-select labelled "heritage & background" (`client/src/domains/talent/pages/ProfilePage/IdentitySection.jsx:9-20`). Discover then removes it at three layers: it is not in `AGENCY_DISCOVERY_FIELDS` (`src/shared/lib/audience-dto.js:140-181`); the parse prompt forbids it (`parse.js:87`); `PROTECTED_CLASS_TERMS` scrubs 43 terms into `set_aside` (`field-whitelist.js:167-210`, `validate-contract.js:363`). So "black women" searches "women" and annotates "black" as unused. See §3 for the decision.

### 2.3 The ranking model is a strict filter with alphabetical order (P0)

`discover-search.js:311-340` keeps only profiles where **every** constraint evaluates `pass`, then sorts by last name. `unknown` never passes (`constraint-eval.js:9-11`). Consequences with the real pool:

- "No visible tattoos" excludes everyone who left the field blank, and, because `tattoos` is a boolean column read as free text (`constraint-eval.js:145-152`: `String(false)` is non-empty, so `has = true`), it also excludes everyone who explicitly answered *no*. The brief that should widen the pool empties it.
- "Available July 9 to 14" passes only profiles that have bookout rows that do not overlap (`availabilityStatus`); a talent whose `availability_status` is `available` with no bookouts is `unknown` and excluded.
- Any brief naming a field the pool has not filled returns zero, with "No discoverable talent meet every factual requirement in that brief." There is no near-match path: `include_outside_spec` is read by the client but the server never builds an `outside_spec` group, so "Show nearest (outside spec)" does nothing. `honest_zero.removable_chip` is always `null`, so "Loosen X" never renders.
- Survivors are ordered A to Z by surname. Nothing about the brief influences order.

### 2.4 Matching reads the wrong data (P0/P1)

- **Boards.** `profileBoards` reads `modeling_categories || booking_lanes` on the profiles row (`constraint-eval.js:160-172`). The canonical store since `20260624195800` is the `profile_booking_lanes` join table, which `baseDiscoverQuery` never joins. Talent who set lanes in the current UI are `unknown` for every board ask.
- **Shoe.** `shoe_size` is a string like `"8 US"`; the evaluator compares it to `"8"` by equality and fails (`constraint-eval.js:268-273`). `shoe_region` is never consulted.
- **Experience.** Three vocabularies disagree: server free string, Discover enum `new_face|developing|experienced|established`, seeds `New face|Experienced|Established`. Enum comparison is lowercase-exact, so `New face` never equals `new_face`.
- **Explicit filters** (`?hair_color=`) compare case-sensitively against title-case stored values and miss (`discover-search.js:107-112`).

### 2.5 The card says nothing in query mode (P1)

`TalentCard` reserves a facts block for `key_stat`, `age_band`, `why_facts`, and annotations. The directory engine produces none of them; `age_band` is always `18+` because minors are excluded upstream. The block renders empty or with a meaningless "18+".

### 2.6 Instrumentation is dead (P1)

The route writes `discover_query_log` only when `result._launch` is set (`inbox.js:4466`); the directory engine never sets it. No search has ever been logged, so the talent-side searchability nudges (`intel/searchability.js`) have nothing to read.

### 2.7 Language (P1/P2)

"Interpretation — check me", "Reading your brief", "not used for filtering", "outside spec", "honest zero" reasons, "Searching the network…" and em-dashes in UI strings all fail the product language screen (`.claude/skills/pholio-app-language`): they describe the machine, not the booker's situation.

### 2.8 What is right and stays

The dark photo-first surface and card grid; the strict JSON-schema parse with deterministic re-parse of numbers and dates (`extract-values.js`) so no LLM-invented number reaches a filter; the eligibility gate (`is_discoverable`, active, adult, not blocking this agency, moderated images only); multi-role detection; the URL as the source of truth for the query; the invite flow; rate limiting; the parse cache.

---

## 3. Decisions

### 3.1 Heritage is a filter when the talent declared it and the booker asked for it

**Decision.** Self-declared heritage (`profiles.ethnicity`) becomes a searchable requirement, applied only when the brief explicitly asks, matched only against the talent's own selection, displayed as the talent's own words, and never inferred, boosted, or defaulted.

**Reasoning.**
- In casting, appearance is the job, and heritage is part of what clients brief. Every working casting tool (Casting Networks, Backstage, agency boards) offers a self-declared heritage filter. A tool that refuses the most ordinary brief in the industry reads as broken, not principled.
- The earlier "never" was a self-imposed posture, not a statutory reading. The real legal exposure in this area is (a) inferring race or skin tone from photographs (biometric and identity inference), (b) an automated tool that scores or ranks people by a protected trait without being asked (NYC LL144 territory), and (c) payment changing visibility. This design touches none of them: the talent chose the value, the booker typed the ask, the system applies a filter and shows it as a chip.
- The talent stays in control: the field is optional, multi-select, and blank means "not searchable by this". The one honesty obligation this creates is on the talent side: the field's helper text must say that agencies can filter by it.

**Rules.**
1. Vocabulary is the picker's own 10 options plus a synonym map from brief words to those options ("black", "African", "Afro-Caribbean" → `Black/African Descent`; "Latina", "Hispanic" → `Hispanic/Latino`; "Asian" → the three Asian options as an OR-set; "mixed" → `Mixed Heritage`; and so on). The hair/eye context guard stays so "black hair" is hair.
2. `Mixed Heritage` alone matches only a "mixed" ask. A talent who selected both `Black/African Descent` and `Mixed Heritage` matches either.
3. Blank field is `unknown`, which places the talent in the partial group with the note "Heritage not listed". Never `fail`.
4. Skin tone remains outside search. `skin_tone` is a free string with no picker; there is no vocabulary to match honestly. A brief that asks for it gets one note: "Skin tone isn't a profile field, so it wasn't used."
5. Nothing image-derived ever feeds this. `PROTECTED_CLASS_TERMS` is reduced to the skin-tone terms and repurposed as the "unsupported ask" list.
6. The value is exposed to the agency DTO as `heritage` (the talent's selected labels). It renders on a card only as a matched fact when the brief asked for it, and in the detail view.
7. Talent-side: the heritage field gains the helper line "Optional. Agencies searching for talent can filter by this." Counsel should confirm the wording; the mechanism is the standard one.

### 3.2 Ordering: match-first, never a score

Every eligible profile is evaluated against every applied requirement and gets a status per requirement: `pass`, `fail`, or `unknown` (not on the profile).

- **Excluded entirely:** gender presentation `fail` when the brief states one. A booker searching for women is not helped by men in a "close" section. Everything else stays visible.
- **Group 1, exact matches:** every applied requirement `pass`. Ordered by soft-term overlap (see below) descending, then newest profile first.
- **Group 2, partial matches:** at least one `fail` or `unknown`. Ordered by number of `fail` ascending, then number of `unknown` ascending, then soft overlap, then newest. So "not listed" sits above "misses by two inches", which sits above "misses by four".
- **Per-card truth** travels with every result: `facts` (the declared values that satisfied the brief, in stats convention order) and `notes` (each miss or blank, plainly: "5'8", 1 in under", "Hair color not listed", "Based in Miami", "Booked out Jul 10 to 12", "Plays 30 to 38", "Represented elsewhere").
- **No numbers leave the API.** No score, no rank position, no percentage. Group membership and the notes are the whole explanation.
- **Soft terms** (what remains of the brief after requirements are extracted: "clean beauty", "strong bone structure", "commercial warmth") never filter and never demote. They are matched lexically, with a small synonym map, against talent-authored text only: `bio_curated`, `specialties`, booking-lane labels. Matches are shown on the card as "Mentions: runway, editorial". This is the talent's own words against the booker's; no model reads a face. Embeddings stay off (the index is dormant and hollowed to "Experience: … + lanes" by design; there is nothing to gain from re-enabling it at this pool size).

Why this is safe under the 2026-08-09 rule "the machine never judges the person": the order is a function of the booker's requirements and the talent's declarations. Two talent with identical declarations are indistinguishable to the engine.

### 3.3 Missing data is never silently satisfied and never silently fatal

`unknown` is its own state, always labelled on the card, always sorted below confirmed matches, never hidden. If a requirement is `unknown` for the whole eligible pool, the response carries one note: "Union status isn't listed on any profile yet." That is the only time the product talks about the data instead of the talent.

### 3.4 The parser's uncertainty becomes a visible filter, not a flag

When the deterministic re-parse disagrees with the model's number, the constraint is not applied (unchanged) and one note says so: "The height in the brief couldn't be read, so it wasn't used. State it as 5'9" or 175 cm." No "check me" chip. When it agrees, the chip simply shows the value; a wrong value is visible as a wrong chip and fixed by editing it.

### 3.5 Multi-role briefs

Detection stays. The response returns a summary per role ("Women 22 to 30", "Man, 40s") and runs the requested one (`role` query parameter, default 0). The page shows a role switcher only when there is more than one role. No notice sentence.

### 3.6 Refinement is the filter strip

- Each chip: booker-language text, × to remove. Numeric and date chips edit in place (number input with unit; native date inputs). Enter commits, Escape reverts.
- An edit or removal rewrites the brief text (splice on the provenance span when known, otherwise append a normalised phrase) and re-runs the search. The text in the bar and the filters applied can never diverge.
- The brief itself stays in the bar, plain, no underlines.

### 3.7 States

- **Loading:** skeleton chips and skeleton cards; never an empty grid while fetching.
- **Browse (no brief):** unchanged. "Newest talent", pool count, show more.
- **Results:** "N matches" header; group 1 with no heading; group 2 under "Partial matches · N" (repeated heading, not a banner). When group 1 is empty: "No exact matches. Closest first." above group 2.
- **Nothing at all:** "No talent match “{brief}” yet." with the chips still present (remove one) and "Clear search".
- **Notes:** at most two plain sentences under the chips, agency register, no em-dashes.

### 3.8 Bugs fixed in the same pass

Tattoos boolean; boards read from `profile_booking_lanes` (with the legacy column as fallback); shoe size parsed from the stored string with region; experience-level normalisation across the three vocabularies; availability `available` with no bookouts is `pass`; case-insensitive explicit filters; query logging wired for every search.

### 3.9 Explicitly not doing now

Semantic embeddings; image-derived attributes of any kind; skin-tone matching; saved briefs and alerts; side-by-side compare; a redesign of the dark surface.

---

## 4. API contract (`GET /api/agency/discover?q=…&role=0&page=1&limit=30`)

Legacy keys (`profiles`, `pagination`, `meta`) are kept for other consumers. `profiles` is the flat ordered list of what is shown on this page. Query mode adds:

```jsonc
"discover_v2": {
  "engine": "match",
  "query": "black women 5'9 and up in nyc",
  "role": 0,
  "roles": [ { "index": 0, "label": "role 1", "count": 1, "summary": "Women, 5'9\" and up, New York" } ],
  "filters": [
    { "id": "gender_presentation", "field": "gender_presentation", "op": null,
      "value": ["female"], "text": "Women", "span": null,
      "editable": null, "unit": null, "edit_value": null },
    { "id": "height_cm", "field": "height_cm", "op": "min",
      "value": { "a": 175, "b": null }, "text": "5'9\" and up", "span": [12, 23],
      "editable": "number", "unit": "cm", "edit_value": "175" },
    { "id": "location", "field": "location", "op": null,
      "value": "new-york", "text": "New York", "span": [27, 30], "editable": null }
  ],
  "notes": [ "Union status isn't listed on any profile yet." ],
  "groups": [
    { "kind": "match",   "total": 4,  "results": [ /* DTOs */ ] },
    { "kind": "partial", "total": 19, "results": [ /* DTOs */ ] }
  ],
  "pool": { "eligible": 214, "match": 4, "partial": 19, "shown": 23 },
  "query_log_id": "…"
}
```

Result DTO additions (on top of `buildAgencyDiscoveryDTO`): `facts: string[]`, `notes: string[]`, `mentions: string[]`, `heritage: string[] | null` (only when the brief asked), `is_invited`.

Paging is over the concatenation (group 1 then group 2); each group's `results` is the slice that falls on this page; `total` is the full count. `honest_zero`, `understanding`, `include_outside_spec`, and `set_aside` are gone.

Chip text rules (server-built, booker language, no field names): `Women` · `Men` · `Non-binary` · `5'9" and up` · `Under 5'8"` · `5'8" to 5'10"` · `Around 5'9"` · `Plays 22 to 30` · `Waist 61 cm (24 in)` · `Dress US 4` · `Shoe US 9` · `New York` (+ `, local only`) · `Available Jul 9 to 14` · `No visible tattoos` · `Editorial or Runway` · `Blonde or red hair` · `Green eyes` · `Union` · `Non-union` · `Unrepresented` · `New faces` · `Black / African descent`.

---

## 5. Implementation plan

Two parallel lanes with disjoint ownership; the lead integrates, verifies, commits.

**Lane A, backend (`src/**`, `tests/**`, `scripts/seed-agency-demo.js`):**
1. `field-whitelist.js`: add `heritage` hard field (requirement, enum = picker options as slugs) with synonym map; shrink `PROTECTED_CLASS_TERMS` to skin-tone terms renamed `UNSUPPORTED_ASK_TERMS`; experience-level alias map.
2. `contract-schema.js`: `heritage` array node; strict-mode legal.
3. `parse.js`: prompt rules for heritage (from the talent's selection vocabulary), "tall"/"petite" defaults made explicit as height chips, skin tone → `unparsed_remainder`. Fallback contract maps the legacy `Heritage` facet.
4. `validate-contract.js`: enum-validate heritage; unsupported-ask detection produces `notes` data instead of `set_aside`.
5. `constraint-eval.js`: heritage evaluator; tattoos boolean; boards from lanes (caller loads the join table); shoe parse; experience normalisation; availability `available` + no bookouts = pass.
6. `discover-search.js`: match-first engine per §3.2, `role` param, groups, paging, `facts`/`notes`/`mentions`, pool counts, whole-pool unknown notes, `_launch` log payload with engine `match`.
7. `present.js`: `buildFilters` (chip text + edit metadata + spans), `roleSummary`, `buildNotes`.
8. `audience-dto.js`: `heritage` in `AGENCY_DISCOVERY_FIELDS` (mapped from `ethnicity`).
9. Tests: update `tests/matching/discover-*.test.js`, `tests/integration/agency-discover-search.test.js`, golden fixtures (`set-aside-*` become heritage cases), new cases for partial ordering, tattoos boolean, lanes join, shoe parse.
10. Seed: heritage values aligned to the picker; give the discoverable demo pool hair, eyes, lanes, and playing ages so the page is testable.

**Lane B, frontend (`client/**`):**
1. Delete `BriefUnderstanding.*`; add `SearchFilters.jsx/.css` (chips, inline edit, notes, role switcher, skeleton).
2. `discoverMatch.js`: keep amend functions keyed on `filters[]` shape; drop label/value formatting now done server-side; drop `constraintAnnotations`.
3. `DiscoverPage.jsx`: new response shape, groups with headings per §3.7, results header count, remove outside-spec, show more across groups, empty state copy, card `facts`/`notes`/`mentions`.
4. `DiscoverDetail.jsx`: facts and notes carried over; heritage shown when present.
5. Talent `IdentitySection.jsx`: heritage helper text.
6. CSS in `DiscoverPage.css` for headings, facts, notes; tests updated.

**Verification:** `npm test -- tests/matching/discover tests/integration/agency-discover-search.test.js tests/shared/discover-rate-limit.test.js`, client `vitest` for agency, `npm run lint` in client, `npm run client:build`, a screenshot of the page against the seeded demo pool where the environment allows.

---

## 6. What shipped (2026-09-02) and what was verified

**Shipped on `claude/discover-surface-audit-qk24qn`.**

- Backend: match-first engine (`matchSearch` in `discover-search.js`), heritage as a self-declared requirement with a synonym map and the hair/eye guard, boards read from `profile_booking_lanes`, tattoos as a boolean, shoe strings parsed with region, experience-level aliases, availability `available`/`limited` with no overlapping bookout as a pass, gender "Prefer not to say" as unknown, `lanes` and `heritage` on the agency discovery DTO, chips/facts/notes built server-side in `present.js`, every search logged to `discover_query_log`. A bare "tall" resolves to the conventional floor (5'9" women or unspecified, 6'0" men-only) as an editable chip. The regex fallback (used when the model is unavailable) now reads heights deterministically with an `under`/`around` operator, maps board words to lanes, and still surfaces the skin-tone note.
- Frontend: `SearchFilters` replaces `BriefUnderstanding`; grouped results with per-card facts, mentions, and notes; skeleton grid; role switcher; ghost completion only while the field has focus; card division mark from the declared lane; talent heritage picker restored with its disclosure.
- Demo seed: heritage in the picker's vocabulary with Black women present, hair, eyes, playing ages, lanes, market slugs.

**Verified.** Backend: 11 discover/contract suites, 286 tests green; the wider agency/talent/matching/integration run is green except two failures that fail identically on the pre-change baseline commit (`application-drafts`, `account-deletion-spec-snapshot`). Client: 19 agency suites, 159 tests; full client suite 773; lint clean apart from one pre-existing warning; production build green. Screenshots against a freshly migrated and seeded SQLite pool through the auth passthrough (regex fallback path, no model key in this environment):

| Brief | Filters shown | Result |
|---|---|---|
| black women | Women · Black/African Descent | 1 match; partial matches noted "Heritage differs" |
| tall editorial women in new york | Women · 5'9" and up · New York (+ Editorial via fallback) | 2 matches; partials noted "5'2", 7 in under · Based in Paris" |
| women 5'9 and up with blonde hair | Women · 5'9" and up · Blonde hair | no exact match; closest first with "Brown hair" etc. |
| under 5'8" commercial men | Men · Under 5'8" · Commercial | 1 match; partials noted "5'11", 3 in over" |
| dark-skinned women in paris | Women · Paris + one note: "Skin tone isn't a profile field, so it wasn't used." | 1 match |
| runway black | Black/African Descent | 3 matches, "Mentions runway" from the talent's own bio |

**Not verified here.** The model path (`openai/gpt-oss-120b` strict JSON) could not be exercised without a Groq key; its prompt carries the heritage and "tall" rules and its output passes through the same validator and deterministic re-parse that the fallback does. Run a handful of real briefs against staging with the key present before relying on multi-role, measurements, and availability parsing.

**Deferred, with reasons.** Skin-tone matching (no closed vocabulary on the talent side); semantic embeddings (index dormant and hollowed by design; lexical mentions over talent-authored text suffice at this pool size); saved briefs and alerts; side-by-side compare; a spaced display form of the heritage labels ("Black / African Descent") if the owner prefers it over the stored picker value the chips currently echo.
