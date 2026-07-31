# Intel page

**Routes:** `/dashboard/talent/intel`, `/dashboard/talent/analytics`.

The page is a short sequence of questions, in the order a working model asks
them. Each block states its finding as a figure plus one clause, then puts the
chart underneath as the evidence for it. Blocks are deliberately not equally
weighted — the decision stack leads.

| Block | Question | Instrument |
|---|---|---|
| `DecisionStack` | What do I do next? | ranked acts, each with its trigger number |
| `SubmissionsBlock` | Where do my submissions die? | `ConversionLadder`, `StackedShare`, `ReadClock` |
| `MaterialsBlock` | Can I send this package today? | `CurrencyAxis`, `RangeMatrix` |
| `AttentionBlock` | Is anyone with intent looking? | `IntentTrend`, `StackedShare`, `MarketBars`, `RankedBars` |
| `BookBlock` | Am I leading with my strongest frame? | photo grid + open-rate bars |
| `MomentumBlock` | Am I gaining ground? | `WeeklyBars` small multiples |

## Structure

```
index.jsx        page shell, period control, tier/minor gating
Chrome.jsx       Block, Finding, Panel, Stat, Withheld, NotYet
intelTheme.js    validated chart palette + formatters
blocks/          one file per question
charts/          chart components; chartUtils.js holds sizing/cursor/path helpers
```

## Rules that are load-bearing

- **The palette is validated, not chosen.** `RAMP` in `intelTheme.js` is a single
  ordinal hue scale that passes the `dataviz` ordinal checks against the
  `#FAF9F7` canvas (monotone lightness, adjacent ΔL ≥ 0.06, light end 2.96:1).
  Changing a step means re-running `scripts/validate_palette.js --ordinal`.
  Every scale on this page is ordinal or emphasis — there is no categorical
  rainbow, and `ATTENTION` (`#A33B21`) is reserved for "past the line" and is
  always paired with a word.
- **No black text, and no pale grey text.** The ink scale is warm — espresso
  `#2A1F14` (15.3:1), walnut `#55432F` (8.9:1), bark `#7E6A52` (4.9:1) — and
  every step including the smallest mono label clears AA on the canvas. Opacity
  is for rules and tracks, never for type.
- **No chapter numerals.** Sections are separated by rule weight and question
  typography, not by an index in the margin.
- **Charts size themselves in real pixels** via `useMeasure`. Never reintroduce a
  fixed `viewBox` with `preserveAspectRatio="none"` — it stretches strokes and
  text non-uniformly at every viewport width.
- **Mark reveals are tied to mount, not to scroll.** Two observer-based attempts
  (`whileInView` on SVG children, then `useInView` on the wrapper) both left real
  data invisible; see the comment in `chartUtils.js`. A chart that silently
  renders nothing is worse than one that doesn't animate.
- **No "values" table twin.** Talent want the answer, not a dataset. Every mark
  is directly labelled with its own number in the plot instead, so no value is
  hover-only or colour-only.
- **Nine kinds of writing, nine treatments.** There is no "body copy" here. See
  the header comment in `Chrome.jsx` for the full table; the short version:

  | Kind | Treatment |
  |---|---|
  | Question | serif, operative word in italic gold — it is *asked*, not stated |
  | Figure | Inter 200, clamp to 5.4rem — the answer when it is a number |
  | Verdict | serif 400, clamp to 3rem — the answer when it is a word |
  | Tag | mono 500, 0.22em tracking — classifies the answer in two words |
  | Qualifier | Inter 340, with `<Emph>` at 600 on the operands |
  | Rationale | serif italic — the industry voice, a deliberately different mouth |
  | Imperative | mono uppercase in a rule box — the only clickable thing in the row |
  | Datum / label | Inter 200 figure + mono uppercase name |
  | Marginalia | mono 0.6rem uppercase — provenance, sized so it never competes |

  Variation is carried by **size and weight**, not by tint: three families, five
  sizes, four weights. A `Finding` is a lockup (figure → rule → qualifier → tag),
  not a heading followed by a paragraph — the rule is what binds it into one
  object.
- **Nothing is estimated.** Withheld sections are absent, not faked; small
  samples say what they are still waiting for. There is no momentum index and no
  cohort band — both were removed for being unactionable or invented.

## Data contract

- Hook: `client/src/domains/talent/hooks/useIntel.js` → `GET /api/talent/intel`
  (sends the browser's IANA `tz` so timing findings are in the reader's clock).
- Page destructures `{ intel, meta, isLoading, isError, refetch }`.
- Block props match the backend compose keys: `decisions`, `submissions`,
  `materials`, `attention`, `book`, `momentum`, `demand`.
- Backend: `src/domains/talent/services/intel/` — `compose.js` assembles,
  `conversion.js` builds the funnel + read clock, `decisions.js` ranks the acts.

Run `cd client && npx eslint src/domains/talent/pages/IntelPage/` before merge.
