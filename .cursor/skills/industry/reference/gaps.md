# Command: gaps

**Goal:** Go wide. Find the workflows, states, roles, data, and concepts Pholio is *missing* versus how the industry actually runs — across a whole area (all of talent, all of agency, onboarding, money, casting) rather than one screen. Output a prioritized backlog the team can plan against.

`audit` judges one surface deeply; `gaps` scans an area for absence. Absence is harder to see than error — that's the value here.

## Flow

1. **Frame the area.** Talent-facing, agency-facing, a domain (representation, casting/booking, money, compliance), or "the whole platform." Confirm scope in a line.
2. **Build the industry reference list.** From `standards.md` and `lifecycle.md`, enumerate what *should* exist in that area: the roles, states, artifacts, data fields, and workflow steps a real operation has.
3. **Map Pholio's actual coverage.** Scan the real implementation for that area — `src/domains/`, `client/src/domains/`, `migrations/` (columns/tables), `PRODUCT.md`. Mark each reference item: **present / partial / absent / wrong**.
4. **Extract the gaps.** Everything absent/partial/wrong becomes a finding. For each: what the industry has, why it matters, what a user hits without it, and the rough Pholio shape to add.
5. **Prioritize** by `P0/P1/P2` and by *credibility-per-effort*. Group so the team can sequence.

## Where the big gaps usually hide (checklist to sweep)

- **Representation model** — mother agency, non-exclusive multi-agency, placement/market, commission split, new-face/development, "kept on file." (Often the platform assumes one talent ↔ one agency.)
- **Booking engine** — options (1st/2nd), holds, confirm/release, bookout, fitting, call sheet, voucher, cancellation window. (Often only active/inactive exists.)
- **Money** — usage/buyout separate from day rate; commission + split; net pay; expected pay date; voucher gating; advances; usage renewal.
- **Materials** — digitals vs. book as *distinct objects with opposite rules*; tearsheets; tests/TFP; e-comp/submission package separate from public portfolio; comp-card spec correctness.
- **Data model** — measurements dual-unit, dated/versioned, division/gender-aware; division as first-class; localized sizing; shoe US/EU/UK.
- **Divisions** — support for more than fashion: commercial, curve, petite, fitness, mature, kids, parts, influencer, actors — each with its own fields/standards.
- **Agency operations** — board structure, booker ownership, submission triage ("keep on file"/request-more), casting submissions/packages to clients, scouting pipeline, development tracking, model travel/stays.
- **Compliance** — minor path (guardian consent, permits, Coogan, restricted visibility, chaperone/hours); image rights/releases; data-protection for measurements/photos; cross-border placement.
- **Roles & permissions** — scout vs. booker vs. director vs. accounting vs. talent vs. guardian — who sees and does what.
- **Markets / i18n** — units, sizing systems, currency, multi-market representation.

## Report format

```
INDUSTRY GAP SCAN — <area>
Headline: <the 1–2 structural gaps that most undermine credibility>

P0 — missing, breaks the model or compliance
  • <Missing concept>. Industry: <what it is / why load-bearing>.
    Pholio today: <absent | partial: file/table>.  Add: <shape of the fix>.

P1 — missing, real users will hit this
  • …

P2 — missing, realism/maturity
  • …

Suggested sequence: <2–4 steps, highest credibility-per-effort first>
```

## Rules
- Distinguish **absent** from **wrong** — a missing concept and a mislabeled one are different fixes.
- Tie every gap to a concrete user/agency consequence, not "the industry has it."
- Verify against real Pholio code/tables before declaring something absent — don't claim a gap that exists under a different name (check `migrations/` and domain routers).
- Note regional/division variance where a "gap" is only a gap for some markets/boards.
- Hand off visual/UX execution to `impeccable`; this command defines *what's missing and why*, not how it looks.
