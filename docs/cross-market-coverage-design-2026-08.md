# Cross-Market Coverage — Design Decision Document
`docs/cross-market-coverage-design-2026-08.md` · August 2026

**Feature name (internal):** Cross-market coverage. **On the surface it is never called "coverage"** — that is an analytics word. The surface calls it what it is: *the market's shot lists, read as one.*

Grounding: this design was written against the live code — `client/src/domains/talent/components/market/{MarketBoard,HouseBand,HouseBrief,useHouseBrief}.{jsx,js}`, `client/src/domains/talent/lib/{briefModel,marketFormat,marketDirectory,specRegistry}.js`, `src/domains/talent/routes/spec-registry.js`, `src/domains/spec-registry/preflight-service.js`, `docs/pholio-strategic-analysis-2026-08.md`, and the deleted prior art recovered from `git show 39dac647` (`buildMarketView`, `ShotCoverage.jsx`, and the old `RequirementsPage/index.jsx` data flow).

---

## 1. The user's real question

A talent planning a submission season is not asking "how am I doing across agencies." They are asking, before they book a shoot or ask a friend with a camera:

> **"What is the complete list of pictures these houses ask for — and which of them do I already have?"**

The industry fact that makes this answerable is that agencies' published digitals asks overlap almost completely. Every house asks for a full length; most ask for a waist-up, a close-up, a profile; a few add a distinctive ask (hair pulled back, smiling, back view). Ten published lists reduce to roughly ten distinct frames, and one afternoon with a phone and a plain wall produces most of them. A working booker knows this; the registry lets Pholio *demonstrate* it from the agencies' own published lists instead of asserting it. That empirical grounding — this is their list, deduplicated, not our advice — is both the credibility and the legal safety of the feature.

**What is genuinely valuable:**
- The **union list**: every distinct frame any house in the researched market publishes, once, merged only where lists genuinely ask for the same picture (`matchKey`), kept separate where they don't (Elite's "close-up, hair pulled back" vs Muse's "close-up, hair up" — different pictures).
- **Which frame in the talent's set answers each ask** — shown as the photograph itself, per the deleted prior art's ruling: "the answer to 'am I done' is a photograph rather than a tick."
- **How many lists each frame is on** — the factual weight that makes ordering informative without any advice-voice.
- The **completes fact** (kept, see §6): for an unshot frame, which houses' shot lists it is the *only* remaining gap on. Two truths said separately, per the prior engineer's honesty bug: which lists this one frame would finish, and how many more merely include it.

**What we decided NOT to build, and why:**

1. **Any coverage number in the market index** (`app-market-index` dl in `ApplicationsView.jsx`) — a "Coverage: 68%" stat is the analytics dashboard arriving in one cell, and a percentage across agencies is a meaningless sum (34 published asks ≠ 34 things to do).
2. **Per-house readiness scores or ranking houses by fewest-missing** ("Ford is one shot away!") — ranking agencies by your gaps is a pursuit-order recommendation: advice-voice (NY FWA prong (c) hygiene even though free) and a countdown-gamification mechanic.
3. **An imperative recommendation** ("Shoot this next"). The recovered engine had a `recommendation` field. We drop it. The list, sorted uncovered-first and most-asked-first, carries the identical information as fact. The verbs stay indicative, never imperative.
4. **A "34 asks → 11 frames" dedup statistic.** True and impressive, and exactly the kind of number that turns a reading surface into a dashboard. The house-count and frame-count in one sentence say enough.
5. **Cross-links inside each HouseBrief** ("this frame is also on 5 other lists") — one cross-market statement lives in one place; sprinkling comparison into every band makes ten comparison widgets.
6. **Any server-side work.** No new endpoint, no migration, no persistence. `POST /api/talent/spec-registry/preflight` already accepts `seriesIds` (array, `MAX_SERIES = 25`, `src/domains/talent/routes/spec-registry.js:76-83`) and returns `{ results: [...] }` (`preflight-service.js:689`); the old RequirementsPage already called it exactly this way. This feature is a pure client derivation.
7. **Export of the union list** — deferred. The per-house `/export` exists and is free; a union export is a later, separate decision.
8. **Notifications, nudges, streaks, or any re-engagement mechanic.** Obviously.
9. **Recomputing coverage against search/filter subsets** — see §4.
10. **Any Studio+ interaction, ever.** See §2 and the legal notes threaded through.

**Industry caution honored, not re-litigated:** digitals go stale (≤3 months). A photograph "in your set" from last year is weak coverage — but freshness is already policed by the send-readiness rail (`sendBlockers`, "Refresh your digitals — agencies expect a current set", `ApplicationsView.jsx:305-311`) which renders directly above the board. Coverage does not duplicate that judgment; the preflight evaluation is the single authority on what counts as satisfied.

## 2. The honest proposition

> **These houses each publish a shot list, and the lists largely ask for the same pictures. Read as one list, they come to a handful of distinct frames — and one photograph answers every list that asks for that frame.**

That is the entire claim. It is about *lists and photographs*, never about *access, chances, or outcomes*. Nothing here is advice, nothing is scored, nothing is paid. Per `docs/pholio-strategic-analysis-2026-08.md` §8 ("kill every mechanic where payment increases reach"; "anything that reads as advice is free or removed") and the precedent comment on `/export` in `src/domains/talent/routes/spec-registry.js` (charging so that more agencies receive your submission is the statutory tripwire): **this surface is free on every plan, permanently, and must never become a paid-tier lever or a paid-tier advertisement.** No `Lock` icon, no upsell adjacency, no mention of Studio+ within the component.

## 3. Placement

**Decision: a single band-like strip inside `MarketBoard`, rendered between the search header row (`.mb-top`) and the first house band — closed by default.**

Rejected in one line each:
- *Above the board / in the Market hero* — crowns the page with derived intelligence before the reader has met a single house; that is the analytics-dashboard move.
- *A third sibling between `MarketBoard` and `SubmissionLedger`* — ten poster-scale bands deep; the reader who needs it (deciding what to shoot before opening houses) never scrolls there, and it would read as a second dashboard section.
- *Inside each HouseBrief* — cross-market facts repeated per-house are clutter and comparison creep (not-built #5).
- *A new page* — the deleted RequirementsPage is the cautionary tale; Market is the one place a talent reads the market.

Why the board's top edge is right: the strip is derived from exactly the registry the board reads; it is the market's preface — one sentence about all the lists before the individual lists. It participates in the board's material (hairline top border, `--mb-gutter` padding, full-bleed like `.hbnd`) but is set in the *reading* register (serif line), never the poster register (`.hbnd__name` caps), so it cannot be mistaken for a house named "THE MARKET'S SHOT LISTS."

**Render condition:** the strip renders only when (a) at least **2** houses carry a `seriesId` (from `buildHouses` output — Pholio-delivered houses enriched with a route count too, per `marketDirectory.js:180-194`), and (b) the full market is showing: empty search query and `scope === SCOPE.ALL`. One fact, stated once, about the whole researched market — restating it per filtered subset is where the dashboard begins, and a sentence that says "9 houses" above a board showing 3 would be false on its face. With a query or a non-ALL scope active, the strip unmounts (and its open state resets).

## 4. The interaction

**Default (closed):** one line of serif text and one mono control. No fetch has happened. Cost of reading the market is unchanged: still the one routes request + one agencies request the page already makes.

**Opening:** the control toggles open (same `AnimatePresence` height expansion as a house band, 0.42s, ease `[0.22, 1, 0.36, 1]`). Opening is what fetches — **exactly one** `POST /preflight` with `{ seriesIds, imageIds }`, cached by React Query (`staleTime` 5 min, keyed on sorted seriesIds + sorted imageIds, mirroring `useHouseBrief.js`). This *extends* the MarketBoard rule rather than breaking it: "a market of any size costs one request to read and one more to open a house" — and one more to read all the lists at once. Reopening is free. If the registry ever exceeds 25 routes, the hook chunks seriesIds into pages of 25 and merges `results` — ceil(n/25) requests, still O(1) for any market Pholio will hold this year (today: ~10 routes).

**States, exhaustively:**

| Situation | Behavior |
|---|---|
| < 2 houses with `seriesId`, or search/scope active | Strip does not render. Absence, not an empty state — consistent with "a market without the registry is a shorter market" (`ApplicationsView.jsx:179-181`). |
| Open, loading | Spinner + "Reading what the houses publish…" (`role="status"`), matching `HouseBrief`'s waiting voice. |
| Open, request failed / registry 503 | "The market's lists couldn't be read." + **Try again** (`role="alert"`), matching `HouseBrief`'s error. The board itself is untouched. |
| Open, 0 houses returned a shot list | One line: "None of these houses publish a shot list. Open a house to see what it does ask for." No list. |
| Open, exactly 1 house has a shot list | One line: "One house here publishes a shot list — {name}. Its own band reads it in full." No list — a one-list union is that house's brief, and duplicating it is clutter. |
| Open, >= 2 lists, talent has no images | Full list renders with every frame empty; verdict's em reads "None of them shot yet." Not a scold, not a gate — the union list is *most* valuable before the first shoot. |
| Open, >= 2 lists, partial | The standard state (§5). Uncovered frames first (most-asked first), then covered frames showing their photographs. |
| Open, everything covered | Same list, all photographs; verdict's em reads "All {F} in your set." No celebration animation, no confetti — the photographs are the moment. |

Images changing (upload/delete) naturally re-keys the query via `imageIds`, same as `useHouseBrief`.

## 5. The exact copy

Every user-visible string, final. Vocabulary is the board's: **houses** (not "agencies" on this surface), **frames**, **your set**, **shot list**.

**Closed strip**
- Line (the `<h2>`): `The market's shot lists, read as one.`
- Control, closed: `Read` · open: `Close` (mono caps, `aria-expanded`)

**Loading:** `Reading what the houses publish…`

**Error:** `The market's lists couldn't be read.` · button `Try again`

**Verdict (open, >=2 lists)** — one serif sentence in the `hb-verdict` pattern, numerals throughout:
- `{H} houses publish a shot list; together the lists come to {F} frames.` followed by the em-styled clause:
  - some covered: `{have} of {F} already in your set.`
  - none: `None of them shot yet.`
  - all: `All {F} in your set.`

**Row** (one per distinct frame):
- Frame label: the canonical shot label from `canonicalShotLabel` (e.g. `Full length`, `Close-up, hair pulled back`)
- Count line, every row: `On {n} of {H} lists.`
- Covered row: the photograph, plus visually-hidden `In your set.`
- Uncovered row, only when `completes` is non-empty:
  - one house: `The only frame on {Ford}'s shot list not in your set.`
  - several: `The only frame on the shot lists of {Ford} and {Muse} not in your set.` (via `joinPhrases`)

**Special one-liners:** `One house here publishes a shot list — {name}. Its own band reads it in full.` · `None of these houses publish a shot list. Open a house to see what it does ask for.`

**Footnote** (small, always under the list):
`Each list is the house's own, read from what it publishes, with repeated asks shown once — one photograph answers every list that asks for that frame. A matching set is a fact about your photographs, not standing with any house: each house also publishes measurements, forms and terms of its own, and reads submissions on its own judgment. Open a house for its full brief.`

### The five riskiest strings — rejected alternatives and why

1. **The title.** Rejected: *"Shot coverage"* (analytics noun; "coverage" is our internal word, not the reader's), *"What to shoot next"* (advice-voice, imperative — the exact FWA prong-(c) register), *"Complete the set, reach more agencies"* (transactional gate; "reach" implies distribution Pholio doesn't control). Chosen: **"The market's shot lists, read as one."** — it names only published documents and one editorial act (reading them together). No self, no outcome, no verb aimed at the talent.

2. **The dedup fact.** Rejected: *"One photo unlocks 9 agencies"* (unlock = access gate — the owner's own named failure case), *"One shot covers 9 agencies"* (you cover a *list*, not an agency; "covering an agency" drifts toward satisfying the institution), the prior art's *"the same frame satisfies every agency that asks for it"* (same drift — "satisfying an agency" reads as pleasing a gatekeeper). Chosen: **"one photograph answers every list that asks for that frame"** — the object of the verb is the *list*, a document, and "answers" is a librarian's verb, not a gatekeeper's.

3. **The completes line.** Rejected: *"Finishes your set for Ford"* ("for Ford" attaches the set to the agency — reads as standing or preparation-with-effect), *"Ford is one shot away"* (countdown gamification; also literally false — Ford may publish measurements, form fields, and eligibility beyond shots), *"Completes your Ford application"* (flatly implies application state Pholio doesn't hold). Chosen: **"The only frame on Ford's shot list not in your set."** — a set-membership fact between two things the talent can verify (their photographs; Ford's published list), scoped explicitly to *shot list*, never to Ford's requirements at large. The word "only" states magnitude without sequencing ("last" implies a progress track). Ruling on whether even this is safe: yes — it asserts a relation between the talent's property and a public document, claims nothing about Ford's response, and the footnote immediately re-scopes ("each house also publishes measurements, forms and terms of its own"). It is exactly as safe as `HouseBrief`'s existing "2 of 6 already in your set."

4. **The all-covered state.** Rejected: *"You're ready for every agency"* (readiness = fitness-for-outcome claim), *"Full coverage"* / *"100%"* (score), *"Nothing left to shoot"* (advice-shaped, and false — lists change and digitals go stale). Chosen: **"All {F} in your set."** — the same em-clause grammar as the partial state, which is the point: completion is not a different, louder register; it is the same sentence with a different number.

5. **The per-row count.** Rejected: *"Wanted by 6 agencies"* (agencies wanting — implies demand for *you*), *"Required by 6 agencies"* (overclaims; several lists are "preferred/encouraged" modality, see `briefModel.js` WANT_MODALITIES), *"6 agencies need this from you"* (transactional). Chosen: **"On 6 of 9 lists."** — pure document membership; the denominator keeps it honest and self-scoping.

### Words never used on this surface
unlock · boost · chance(s) · odds · improve · increase · ready/readiness · qualify · eligible (in the access sense) · opportunity · opens doors · get noticed · stand out · maximize · reach (as a verb about agencies) · match(ed) (about talent-agency fit) · score · progress · complete (as a progress verb) · level · earn · guarantee · approved · recommended · should · next (as instruction) · Studio+ / upgrade / plan (the feature never mentions tiers)

Also banned: any % sign; any progress meter; any imperative sentence addressed to the talent.

## 6. The data model

All client-side. Two new files plus one restored dependency-set; nothing invented at presentation time, per the `briefModel.js` contract ("It normalises, deduplicates and drops — it never invents").

**`client/src/domains/talent/lib/coverageModel.js`** (new — the engine; the recovered `buildMarketView` adapted to houses):

```
coverageSeriesIds(houses) -> string[]          // uniq seriesIds across house.routes; the fetch key
buildCoverage({ houses, evaluationFor, labels }) -> {
  houses: [{ houseKey, name, seriesIds, hasShotList,
             frames: Set<frameKey>, covered: number, missing: number }],
  frames: [{ key,            // matchKey, falling back to slotKey — never null,
                             // so no published shot can fall out unnoticed (prior-art invariant)
             label,          // canonicalShotLabel(finding, labels)
             inSet, imageId, // first satisfying assignment's imageId, else null
             houseKeys: [],  // houses whose lists carry it — HOUSES, not routes:
                             // Elite Paris + Elite Tokyo asking for "full length" is 1
             listCount,      // houseKeys.length
             completes: [] }],  // names of houses for which this is the sole
                                // uncovered frame (house.missing === 1)
  totals: { housesWithLists, frames, inSet }
}
```

Key rulings:
- **Rows merge on `matchKey`, fall back to `slotKey`** — kept verbatim from the recovered engine. Genuinely different pictures stay separate rows; that asymmetry is an honesty property, not a bug.
- **House-level aggregation** (the one real change from the recovered route-level engine): a house's frames are the union of its routes' shot findings deduped by frame key; a frame is covered for a house if any of its routes' findings is `OUTCOME.SATISFIED`. `missing` counts distinct uncovered frames — **shot findings only**, which is why every completes string says *"shot list"*, never *"requirements."*
- **`completes` vs `alsoAsked`: kept, restructured.** The recovered distinction is the feature's central honesty insight and survives — but `alsoAsked` as a separate number is redundant once every row carries `listCount`; the UI shows `listCount` + the completes sentence, and the double-count trap ("6 agencies unlocked") is structurally impossible because completes derives only from `missing === 1`.
- **`recommendation` dropped** (see §1, not-built #3). The sort *is* the information: `(inSet asc) -> (completes.length desc) -> (listCount desc) -> (label asc)`.

**`client/src/domains/talent/components/market/useMarketCoverage.js`** (new — the hook, mirroring `useHouseBrief.js`): computes `seriesIds` from houses; `useQuery({ queryKey: ['market-coverage', seriesIds, imageIds], enabled })`; queryFn chunks seriesIds by 25, calls `talentApi.preflightSpecRegistry({ seriesIds: chunk, imageIds })` per chunk (one call today), merges `results` arrays; exposes `evaluationFor(seriesId)` via `readEvaluationFor` over the merged envelope and `labels` via `readLabels`; memoizes `buildCoverage`. Existing imports all come from `client/src/domains/talent/lib/specRegistry.js` (`readFindings`, `readEvaluationFor`, `readLabels`, `canonicalShotLabel`, `OUTCOME`) — nothing new server-side, nothing new in `talentApi`.

**`client/src/domains/talent/components/market/MarketCoverage.jsx`** (new — the strip). Receives `houses`, `images` (full objects, for thumbnails via the 3-line `frameSrc` pattern in `ApplyPage/offPholio/PrepareScene.jsx:11` — lift it to a tiny shared helper in `lib/` rather than a third copy).

**`MarketBoard.jsx`** change: pass `images` (full array, not just ids) down; render `<MarketCoverage houses={houses} images={images} />` between `</header>` and `.mb-board` when `houses with seriesIds >= 2 && !deferredQuery && scope === SCOPE.ALL`.

## 7. Visual and motion spec

Material: the board's own (`market-board.css` custom properties). New classes prefixed `mcov-`, in a new `market-coverage.css` imported by the component.

- **Strip (closed):** full-bleed like a band — `border-top: 1px solid var(--mb-hair)`, `padding: clamp(18px, 2vw, 24px) var(--mb-gutter)`. Grid: line left, control right.
  - Line (`<h2 class="mcov-line">`): Noto Serif Display, italic, `font-weight: 300`, ~17px, `color: var(--mb-soft)`. The reading register — deliberately *not* `.hbnd__name`'s poster caps, and smaller than `hb-verdict`, so it reads as a preface, not a headline.
  - Control (`.mcov-toggle`): the `.mb-scope` register exactly — JetBrains Mono 9.5–10px, 0.2em tracking, uppercase, `color: var(--mb-faint)`, hover `var(--mb-text)`, `focus-visible` outline `2px solid var(--mb-gold)` offset 4px.
- **Open panel:** stays on the **cream**, not ink — the solid-ink open panel is the signature of *a house* (`.hbnd--open`), and coverage must not impersonate one. Panel background `color-mix(in srgb, var(--mb-warm) 45%, transparent)`, hairline bottom border, `max-width: 96ch` inner column like `.hb`.
- **Verdict:** `hb-verdict`'s type on cream — Noto Serif Display 300, `clamp(1.15rem, 1.8vw, 1.45rem)`, `color: var(--mb-text)`; the em-clause `color: var(--mb-soft)` (the cream-ground equivalent of `hb-verdict em`).
- **Rows (`.mcov-row`):** grid `44px minmax(0,1fr) auto`, gap 14px, aligned center; row height ~64px; hairline separators (`--mb-hair`).
  - Thumbnail (`.mcov-frame`): 44px wide, `aspect-ratio: 3/4`, `border-radius: 2px`, `border: 1px solid var(--mb-hair)`, `object-fit: cover`. Empty: `background: var(--mb-warm)`, no icon, no dashed border — an unfilled slot the way the digitals sheet leaves one (prior-art ruling).
  - Label: Inter 14px, `color: var(--mb-text)`; uncovered rows `var(--mb-soft)` — presence reads as presence; absence needs no extra label (the `HouseBrief` "Still needed ink" ruling).
  - Count line: Inter 12.5px, `color: var(--mb-faint)`, right-aligned.
  - Completes sub-line: full-width second line under the label, Inter 12.5px, `color: var(--mb-gold-text)` (`#75501b` — the deep gold already verified at 6.73:1 on this cream, per tasks/todo.md contrast audit). This is the only gold ink in the component: one accent, one meaning, matching "gold is punctuation, not surface."
  - Footnote: Inter 12px, `var(--mb-faint)`, `max-width: 68ch`.
- **Motion:** panel expand/collapse identical to `HouseBand` (`height: 0->auto`, `opacity`, `0.42s`, ease `[0.22,1,0.36,1]`, `AnimatePresence initial={false}`). Row entrances: spring `stiffness: 55, damping: 16`, `y: 8->0`, stagger `Math.min(index, 6) * 0.03` — lifted directly from the deleted `ShotCoverage.jsx`. Every animated element gets the `useReducedMotion` fallback (`initial={reduce ? false : …}`, `transition={{ duration: 0 }}`), and the CSS transitions join the existing `prefers-reduced-motion` block.
- **Narrow (<=760px):** count line drops under the label (grid becomes `44px minmax(0,1fr)`); nothing hides.

## 8. Accessibility

- The strip is a `<section aria-labelledby="mcov-title">`; the serif line is the real `<h2 id="mcov-title">`.
- The toggle is a `<button aria-expanded aria-controls="mcov-panel">`; the panel carries the id.
- **State in words, not marks** (the codebase's precedent: `SLOT_STATE_WORD`, `.hb-sr`): every row's information is present as text — the label, the literal count sentence "On 6 of 9 lists.", and for covered rows a visually-hidden `In your set.` span (reusing the `.hb-sr` clip pattern). The photograph is `alt=""` `aria-hidden` — decorative confirmation of a fact the text already states; the empty frame likewise, since absence is stated by the absence of the sr text and by the completes/count lines.
- Loading is `role="status"`; the error is `role="alert"` with a real `<button>` retry.
- Focus: all interactive elements use the board's `focus-visible` gold outline; the toggle keeps focus across open/close (content changes, element doesn't).
- Counts never conveyed by imagery, color, or position alone; gold sub-line text passes 6.73:1; `--mb-faint` is used only where the same fact also exists at higher contrast (the count is the row's only home for its fact, so if contrast review flags `--mb-faint` at 12.5px, promote to `--mb-soft` — same call the todo.md audit made for label ink).

## 9. Test plan

New test files: `client/src/domains/talent/lib/__tests__/coverageModel.test.js`, `components/market/__tests__/MarketCoverage.test.jsx`, `components/market/__tests__/useMarketCoverage.test.js`.

**Honesty properties (the point of the suite):**
1. A frame appears in `completes` for house H **iff** H's distinct uncovered shot-frame count is exactly 1 and that frame is it. A frame that completes nobody renders **no** completes sentence — assert the string "The only frame" is absent.
2. Regression of the original ledger bug: 6 houses each missing this frame *plus others* -> `completes` is empty, `listCount` is 6; the row must never say anything stronger than "On 6 of 9 lists."
3. No row loss: every shot finding lands in exactly one row (matchKey else slotKey); distinct matchKeys never merge; identical matchKeys across houses merge to one row.
4. House-not-route counting: two routes of one house asking the same frame -> `listCount` contribution 1.
5. Covered rows carry an `imageId` from a satisfying assignment; zero-image input -> all rows uncovered, verdict em is "None of them shot yet."
6. All-covered -> "All {F} in your set."; one-list -> the single-house line and **no** list; zero-list -> the zero line.
7. **Copy denylist** (precedent: PrepareScene's "never says submitted/confirmed/sent" assertions): render every state and assert the output never contains, case-insensitively: `unlock`, `boost`, `chance`, `odds`, `improve`, `qualify`, `opportunit`, `score`, `%`, `ready`, `recommend`, `should`, `upgrade`, `Studio+`.
8. **One request:** open fires exactly one preflight POST with sorted, deduped seriesIds; reopen within staleTime fires none; 26+ series -> 2 chunked calls, merged results, identical output.
9. Render condition: hidden under active query, non-ALL scope, or <2 seriesIds; closed state issues no fetch.
10. Verdict grammar: counts agree ("1 house publishes" never occurs — the >=2 gate; "On 1 of 9 lists" singular/plural via `countOf` conventions).
11. Sort order: uncovered before covered; completes-bearing frames before merely-asked; ties by listCount then label.
12. A11y: `aria-expanded` toggles; sr-only "In your set." present on covered rows only; images `alt=""`.

## 10. Implementation slices

Ordered; each is one engineer; file ownership disjoint so 1–3 can run in parallel after the shape in §6 is agreed (the shape in this document is the contract).

| # | Slice | Files owned | Depends on |
|---|---|---|---|
| 1 | **Engine**: `coverageModel.js` (`coverageSeriesIds`, `buildCoverage`) + full property tests (§9 items 1–6, 11) | `client/src/domains/talent/lib/coverageModel.js`, `lib/__tests__/coverageModel.test.js` | — |
| 2 | **Hook**: `useMarketCoverage.js` (chunking, merge, evaluationFor, labels) + fetch-count tests (§9 item 8) | `client/src/domains/talent/components/market/useMarketCoverage.js`, `components/market/__tests__/useMarketCoverage.test.js` | contract only |
| 3 | **Component + copy + CSS**: `MarketCoverage.jsx`, `market-coverage.css`, the shared `frameSrc` lift (`lib/frameSrc.js`, then point `PrepareScene.jsx` at it) | those files | contract only |
| 4 | **Integration**: `MarketBoard.jsx` render condition + `images` prop pass-through; `ApplicationsView.jsx` untouched unless prop plumbing requires | `components/market/MarketBoard.jsx` | 1–3 |
| 5 | **Sweep**: copy-denylist test, a11y assertions, reduced-motion check, desktop/mobile screenshot pass per talent CLAUDE.md verification rule | `components/market/__tests__/MarketCoverage.test.jsx` | 4 |

Lead integrates and commits; no worker commits (repo operating rule).

---

# Amendment 1 — widening past the shot list (2026-08-19)

The owner challenged the scope: shots are the richest part, but agencies publish
other requirements that also overlap. Measured against the ten real specs in
`data/spec-registry/v1/specs/`, the challenge is right, and one dismissal was
made for the wrong reason.

## What the data says (10 published specs)

| Category | Measured overlap | Ruling |
|---|---|---|
| Application fields | email 9/10 · name, date of birth 8/10 · phone, Instagram 7/10 · height, city 6/10 · TikTok 5/10 · guardian details 4/10 | **In.** Highest overlap of any category |
| Shot count | 9/10 publish one; minimums cluster at 3, maximums 3–6 | **In.** One line beside the verdict |
| Set-wide conditions | High semantic overlap, zero textual overlap; no match keys published | **Held** — re-entry condition below |
| Eligibility | Every entry unique but machine-comparable (`age_years >= 15`, `height >= 173cm`) | **Held** — re-entry condition below |
| Files | 8 sparse entries | Out |

## Corrected reasoning on form fields

The per-house code treats `applicationFields` as noise, and per house it is: 33
undifferentiated rows each saying "Pholio cannot verify this" (`briefModel`'s
collapse ruling). Cross-market the overlap **is** the information: the forms ask
for the same few facts, and knowing that list once is the same "prepare once"
proposition as the union shot list.

**No personal verdict, deliberately.** A form field is something the talent
*supplies*, not something they are measured against, so the block never says
"you have 6 of 9" — a match would add tone risk for zero information. Document
facts only.

## The two holds, with re-entry conditions

- **Set-wide conditions** return when the registry publishes match keys for
  them, the way shot slots carry `matchKey`. Until then, merging "Do not wear
  makeup" / "do not wear any makeup" / "Have a clean face with absolutely no
  makeup" is Pholio deciding three houses' sentences are one sentence — the
  "never invents" line. An unmerged list of near-duplicates is worse than
  nothing. This is an authoring-lane task, not a UI task.
- **Eligibility** returns only with its own wording pass at the same depth as
  §5. It aggregates honestly as *published-threshold ranges* (a fact about
  documents), but it is the one category that can tell a reader they sit
  outside every list, and that sentence must be designed, not bolted on. The
  guardian/consent cluster already arrives safely via the form-facts block.

## Amended copy (deltas to §5 only; everything else stands)

- **Title:** `What these houses publish, read as one.` — the scope outgrew
  "shot lists"; the sentence still names documents and one act of reading.
  (Rejected: "What these houses ask for" — "ask of you" flavor; "The market's
  shot lists and forms, read as one" — inventory, not a sentence.)
- **Count line**, directly under the verdict, only when ≥2 houses publish a
  structured count: `The published counts run {min} to {max} images.` — and
  when every published count is the same number: `Every published count is
  {n} images.` Derived from structured `minimum`/`maximum` values only; prose
  counts are never parsed. (Rejected: "Most houses want 3–6 images" — "want"
  is demand-for-you voice; "You need 3–6 photos" — imperative, and false as a
  universal.)
- **Form-facts block**, after the frames list, before the footnote. Small
  heading `Their forms`, then one data-driven sentence: `The application
  forms ask for the same few facts: an email address (9 of 10), name and date
  of birth (8), a phone number and Instagram (7), height and city (6), TikTok
  (5), and for minors, a parent or guardian's details (4).` — grouped by
  count, descending; labels from the taxonomy pack, counts computed, nothing
  hardcoded. Fields asked by fewer than half the forms collapse into the
  closing clause: `along with each form's own remaining fields — open a house
  for its list.` (Rejected: a per-field row grid — the analytics dashboard
  arriving as a table; "9 agencies require your email" — "require of you"
  voice; any checkmark against the profile — see the no-verdict ruling.)
- **Footnote** gains nothing: its existing sentence "each house also publishes
  measurements, forms and terms of its own" already carries the scoping.

The §5 denylist applies to the new strings verbatim.

## Amended data model (deltas to §6)

`buildCoverage` additionally returns:

```
shotCountSpan: { min, max, houses } | null   // structured counts only; null
                                             // when fewer than 2 houses publish one
formFacts: {
  fields: [{ field, label, houses }],        // per-house deduped by field key,
                                             // sorted (houses desc, label asc)
  formsPublished,                            // houses with any applicationFields
  shownThreshold,                            // the >= half cutoff actually applied
} | null
```

Both derive from the same single preflight response — `CATEGORY.SHOT_COUNT`
and `CATEGORY.APPLICATION_FIELDS` findings are already in every evaluation.
No new fetch, no server change. Houses, not routes, remain the counting unit.

## Amended tests (additions to §9)

13. Count-span honesty: the rendered span is exactly the min-of-minimums to
    max-of-maximums across structured published counts; a prose-only count
    contributes nothing; one publishing house → no line.
14. Form facts: counts match fixtures; per-house dedupe (two routes of one
    house asking `contact.email` count once); the block never contains "you",
    "your set", or any satisfied/missing state.
15. The equal-counts sentence renders iff all published counts collapse to
    one number.
