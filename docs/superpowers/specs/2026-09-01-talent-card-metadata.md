# Talent card metadata — Submissions and the Signing Board (2026-09-01)

Scope: the small text under a face on the Submissions book/ledger
(`pages/ApplicantsPage.jsx`) and on the Signing Board wall, shelves, and
ledger (`pages/signing/*`). Not the Review Room, not the dossier.

## 1. The finding

Both surfaces print the wrong things for the wrong reasons.

- **Submissions** prints `EDITORIAL · NEW YORK, NY` and `3h ago` under every
  face. `EDITORIAL` is `archetype || 'editorial'`, and the list endpoint never
  returns `archetype`, so every card carries the same word: noise wearing the
  costume of a fact. The card omits the two things that actually gate a first
  look (height, age) and the one thing that decides whether the face can be
  judged at all (are there digitals, and are they current).
- **The Signing Board** prints `16 yrs · 183 cm · Paris`, `Shortlisted · 1w`,
  `Under 18` as four undifferentiated rows of the same small type. The facts
  are right; nothing tells the eye which one to read first. It also lacks the
  decision context a board meeting needs (house memory, digitals currency,
  the board's own tags).

## 2. What an agency needs to know, by stage

| Stage | The question | Gates the answer (prominent) | Informs it (secondary) | Off the card |
|---|---|---|---|---|
| **Submissions, first look** | "Is this face worth a second look?" (3–30 s) | the face; **height**; **age**; **city** (market); the **board applied for** when the talent named one | whether a **digitals set** exists and how current it is; how long the submission has sat (auto-close is 30 days); identity dispute | bust/waist/hips (second-pass, in the room); tags; notes; email-verified as a positive claim; an invented discipline |
| **Signing Board, wall** | "Who do we sign, and what is stopping each one?" (comparative, staged) | the face; **standing + how long** (the board's reason to exist); **height**; **age**; **city** | **digitals currency** (can we decide on what we have); **house memory** (notes count); the board's **tags**; minor / age-unknown notation | measurements; submitted date (the section already says where they stand); identity plumbing |
| **Signing Board, ledger** | operational sort and scan | name, age, height, city, standing, waiting | digitals, notes, tags | measurements |

Height leads the figure line on both surfaces because it is the hard gate in
every fashion division; age is second because it sets the development window
and the guardian path; city is the market question. Nothing else earns the
figure tier.

## 3. One grammar, two contents

A single component, `components/meta/CardMeta.jsx`, renders four slots in a
fixed typographic order. Each surface passes only the slots it earns.

```
name        Inter 600 · 14px · --ag-text-0            (existing per-surface name element stays)
figures     mono tabular · --ag-text-1                178 cm  5′10″  ·  24
context     Inter 12px · --ag-text-2                  New York · Women        (city · board applied for)
stage       Inter 12px · --ag-text-2, since in mono   Digitals requested · 6d  |  Digitals · Aug · Received 3h
notations   Inter 11px · --ag-text-3, toned words     Under 18 · 2 notes · runway · e-comm
```

Rules:

- **Figures never get a container**; `Figure` with `sub` carries the imperial
  conversion in the faint tier on the same baseline (`178 cm 5′10″`). Age is a
  bare figure with the `yrs` unit set as the meta system sets units. Height
  always leads.
- **Context** is city only by default (`Place`). On Submissions, the board the
  talent applied for follows the city when `submission_package.boards` names
  one; nothing is printed when it does not. The word `EDITORIAL` is gone.
- **Stage** is one line. Submissions: the digitals read, then the received
  moment in the faint tier (`Digitals · Aug · Received 3h`; `No digitals ·
  Received 3h`; `Digitals stale · Received 26d`). Signing wall: the standing
  and its `since` exactly as today.
- **Notations** are plain words, never dots or pills, each toned only where
  actionable: `Under 18` (warning tone), `Age not recorded` (warning),
  `Identity disputed` (danger), `No digitals` when it is the stage line's
  subject already it is not repeated here, `{n} notes` (plain), tags (plain,
  at most two, then `+N`). Order: safety first, then house memory, then tags.
- **Ink levels do the hierarchy**, never size jumps beyond the figure line and
  never containers: name full ink, figures ink 1, context and stage ink 2,
  notations ink 3. Spacing: 6px between name and figures, 3px between the
  rest.
- **Absence is silence**: a missing height, age, or city prints nothing.
  A card never prints `Unknown`, `Not recorded`, or a placeholder in the
  figure/context tiers; only the notations tier may name an absence, and only
  the two above.

## 4. Per-surface content

**Submissions book card and ledger row** (`ApplicantsPage.jsx`):
figures (height, age) · context (city, board applied for) · stage (digitals
read + received) · notations (`Identity disputed`, `Email unverified` only
when `identitySource === 'submission'`, `Under 18`). Status text stays where it
is on non-review tabs. The received moment moves into the stage line and the
separate `ap-card-when` element goes.

**Signing wall tile** (`Wall.jsx`): figures (height, age) · context (city) ·
stage (standing · since) · notations (`Under 18` / `Age not recorded`,
`{n} notes`, up to two tags). Tags come from `candidate.tags[].tag`.

**Signing shelves rows** (`Shelves.jsx`): name · figures · stage (settled
date). No notations except `Under 18`.

**Signing ledger** (`Ledger.jsx`): unchanged columns plus a `Tags` column
(plain text, two then `+N`) after Notes.

## 5. Data

- Submissions list rows already carry `height_cm`, `age`, `is_minor`,
  `city`, `submission_package.boards`, `images[]` (`image_type`, `shot_type`),
  identity fields. They gain `digitalsFreshness` (same shape the dossier and
  the board candidates return; null for identity-only rows without images).
  `age` may be null when no DOB is recorded; the card prints nothing for age
  and the notation `Age not recorded` when `ageUnknown` is true (add
  `ageUnknown` alongside, mirroring the board candidates route).
- Board candidates already carry everything the wall needs.

## 6. Verification

Lint, vitest for both pages, jest for the list route, then a browser pass on
the scratch stack: a Submissions card with digitals, one without, one with an
applied board; a wall tile with tags and notes; a minor; the longest seeded
name and city. Probe that no element in a card has a background, border, or
radius, that heights show both units, and that no card prints `Editorial`.

## 7. Restraint revision (owner feedback, 2026-09-01)

The §3/§4 cut was too much. The card is the face; the text under it is the
least a booker needs to route the decision, and nothing that the room already
answers. Final content:

```
Submissions card / ledger row
  name
  184 cm · 20 yrs · New York          one line, mono figures, city in Inter
  No digitals                         only when true (warning tone)
  Identity disputed                   only when true (danger tone)

Signing wall tile
  name
  183 cm · 16 yrs · Paris             one line
  Shortlisted · 1w                    the standing line stays: it is the wall's job
  Under 18 / Age not recorded         only when true (warning tone)

Signing shelf row
  name · 183 cm · 16 yrs · Paris · Passed · 12 Mar   one baseline
```

Cut everywhere on cards: the imperial conversion, the applied board, the
digitals date, the received moment, notes count, tags, email status. The
ledger keeps its columns (Digitals, Notes, Tags): a table earns density, a
card does not. Absence stays silent except for the four notations above.

## 8. Universal application (owner: "apply it universally to the agency dashboard")

Every agency surface that prints a person as a photo with a few lines uses
`CardMeta` and prints only: name · `178 cm · 24 yrs · City` · (standing line
where the surface is a pipeline) · notations only when true. Invented
disciplines (`archetype || 'editorial'`) are removed everywhere; a mark that
cannot be true is worse than no mark.

| Surface | Prints | Removed |
|---|---|---|
| Overview, "Top matches today" strip (`components/overview/TalentStrip.jsx`) | name · facts line | `typeLabel` (`Editorial` fallback), `'available'` status |
| Scout cards (`pages/DiscoverPage.jsx` `TalentCard`) | name · facts line · notations (`Under 18`, constraint annotations such as availability) | `DivisionMark` on a fallback archetype, the `keyStat`/`ageBand` headline, `whyFacts` prose, the hover Height/Gender stat pairs (the detail carries them) |
| Scout detail header (`pages/DiscoverDetail.jsx`) | name · facts line · vitals as `Figure`s, absent values omitted | `DivisionMark` on a fallback archetype, `—` placeholders |
| Talent drawer header (`components/TalentPanel.jsx`) | name · facts line · notations (`Identity disputed`, `Under 18`) | `DivisionMark` on a fallback archetype, `Email verified` |
| Talent drawer vitals band | measured values only, via `Figure`; a missing measurement is omitted, never `—` | placeholders |
| Event pick-list assign rows (`pages/events/PickListsPanel.jsx`) | name · facts line · standing (`Picked by N` or the status via `getStatusLabel`) | raw status strings |
| Event lineup rows (`pages/events/LineupPanel.jsx`) | name · facts line · standing (picks / confirmed / declined / offered, via the status vocabulary) · designer notes as `Notation` | bare city span, hand-built standing strings that duplicate `STATUS_MAP` |
| Board folios, boards table, activity rows | unchanged | these describe boards and events, not a person |

Data: where a payload lacks `height_cm`, `age` (DOB-derived) or `city`, the
serving route adds them the way the board candidates route does; a surface
never prints a placeholder to fill the gap.

## 9. Submissions coherence (owner, 2026-09-02)

Two defects and one decision.

**Defect 1, metadata drift across tabs.** On every tab except To review the
card and the ledger row print a tinted, bordered `StatusCell` under the meta:
a container for a state, which the wall renders as a plain standing line.
Fix: the standing is the `CardMeta` `stage` slot, words and `since` from one
shared standing module (`lib/standing.js`, lifted from the signing
`boardModel`), fed by `statusChangedAt` (the list rows gain it). On To review
nothing is printed (the tab already says it); everywhere else
`Shortlisted · 3d`, `On file · 12 Aug`, `Passed · 2 Sept`. The ledger's
Status column becomes the same plain text. `StatusCell` leaves both surfaces.

**Defect 2, two selection languages.** Submissions selects with a corner
checkbox, triages with hover icons on the photo, and floats a centred pill of
bulk verbs; the wall selects by click and works from a persistent ink bar.
Fix: one language, curated for the inbox.

**The Submissions working surface.**

- Click selects; cmd/ctrl toggles; shift ranges along the visible order;
  `Space` toggles the focused card; `J`/`K`/arrows move focus; `Enter`,
  double-click, or the name opens the Review Room; `Esc` disarms, then clears.
  Selection clears on tab, scope, or view change.
- The corner checkbox, the hover triage icons, the floating bulk pill, the
  bulk offer, and the bulk-decline modal are removed.
- A persistent bar in the wall's ink register rises on selection (same
  component, `components/verdict/VerdictBar`, with a verb set per surface).
  Single selection: `Open` · `Line up` (needs two) · `Shortlist` (S) ·
  `File to board` (B, arms a board strip; confirm files and shortlists) ·
  `Request digitals` (D) · `Invite to meet` (M) · `Keep on file` (F) · `Pass`
  (X, arms the reason strip and house note) · `Offer representation` (A, arms;
  N toggles Development) · `Reopen` on decided rows. Two or more: `Line up`
  (two to six) · `Shortlist` · `Keep on file` · `Pass` (one reason for all) ·
  `Clear`. Actions a status makes illegal are absent, via the shared
  `legalActions`.
- Toasts and Undo exactly as the wall: `Shortlisted {name}`, `{n} shortlisted`,
  `Filed {name} to {board}`, the rest per §4.3 of the signing spec.
- The bar reports `Sitting · N decided` and the Review Room keeps its own
  verdict row; a decision in the room advances the queue as before.

Not reused blindly: the inbox bar has `File to board` and bulk `Shortlist`,
which the wall does not; the wall's `Mark represented` is absent here.
