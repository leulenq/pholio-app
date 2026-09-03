# The Signing Board, rebuilt — expanded board design (2026-09-01)

Scope: the expanded board at `/dashboard/agency/signing/:boardId`. Replaces
`client/src/domains/agency/pages/CastingDetailPage.jsx` and the `.rr-*` layer of
`CastingPage.css`. The board rack (`CastingPage.jsx`, `.sg-*`) is untouched.

## 1. The job (first principles)

Pholio's agency side has two decision surfaces with different tempos:

| Surface | Question | Tempo | Unit |
|---|---|---|---|
| Submissions → Review Room | "Is this face worth a second look?" | 3–30 s each, one at a time | one submission |
| **Signing board** | "Of the people we kept moving on this division, who do we actually sign this season, and what is stopping each one?" | minutes to weeks, comparative, team | the set |

The board's real-world analogue is the wall in a new-faces office: polaroids pinned
up, the strongest at eye level, walked every week by the head of the division with
the bookers arguing beside it. Signing is never decided one face at a time. It is
decided **against the set** (the other candidates and who is already on the board),
and it is **staged in time**: digitals are requested and take days to come back, a
meeting has to happen (with a guardian if under 18), an offer goes out and sits
while the talent and family decide. Most inbound ends as "kept on file"; a signing
is rare, consequential, and notifies the talent.

Seven jobs the environment has to do well, in priority order:

1. **See the whole set as faces**, at a size where a face can be judged.
2. **Compare** two to six candidates side by side on digitals and measurements, and
   compare a candidate against someone already represented on this board.
3. **Know what is waiting on whom, and for how long** (digitals requested six days
   ago, meeting requested, offer out twelve days) — the follow-through ledger.
4. **Decide explicitly**, with the industry's full outcome vocabulary, keyboard,
   inline arming, and undo — the idiom the Review Room already established.
5. **Read the record** of one person without leaving the set (notes, tags, frames,
   provenance, timeline).
6. **Roster context**: the represented set on this board, against a slot target for
   client packages.
7. **Stay one board**: identity plate, brief, closing date.

## 2. The product decision

**Not a Kanban.** Three reasons, each sufficient:

- On this surface a stage change is a **decision that notifies the talent**
  (offer, development offer, pass, kept on file). Drag-and-drop makes a
  consequential decision feel like tidying, skips the pass reason, and has no
  arming step. Every decision here goes through the same armed, undoable verdict
  idiom as the Review Room.
- Columns force 220px cards. Faces cannot be judged at that size, and the two
  right-hand columns (offered, represented) are near-empty most of the year, so the
  viewport is spent on emptiness.
- The ladder is short and linear. What a booker actually needs from the layout is
  **what is blocking each person and for how long**, which a column cannot encode.

**The structure: a wall of standings, a ledger, a lineup, and a verdict bar.**

```
Masthead      identity plate · board name · brief · docket (typographic)
The Wall      faces, grouped into full-width ruled sections in decision order:
              Needs a decision → Waiting on talent → Offer out → Represented
              (shelves below: On file · Passed · Closed)
Ledger        the same set as a dense sortable table (toggle, V)
Lineup        2–6 selected faces side by side (existing ComparisonOverlay)
Verdict bar   ink bar that rises when ≥1 face is selected; inline arming; undo
Record        one face opened in the Review Room, queue = the wall's order
```

Sections are stacked vertically and ruled, never columns, so a board meeting can
walk the wall top to bottom in one scroll. Empty sections are omitted except
"Needs a decision", which states "Nothing needs a decision."

### 2.1 Standing model (`boardModel.js`)

Derived from `applications.status` (canonical list in
`src/shared/constants/application-status.js`):

| Section key | Title | Statuses | Standing line (structure: `{ text, since }`) |
|---|---|---|---|
| `decide` | Needs a decision | `shortlisted`, `submitted`, `pending` | "Shortlisted", "Filed" |
| `waiting` | Waiting on talent | `requested_more`, `meeting_requested` | "Digitals requested", "Meeting requested" |
| `offer` | Offer out | `accepted`, `development` | "Offer out", "Development offer" |
| `represented` | Represented / Confirmed (per `BOARD_VOCAB`) | `represented` | "Represented" + date |
| `file` (shelf) | On file | `kept_on_file` | "On file" + month |
| `passed` (shelf) | Passed | `passed`, `declined`, `archived` | "Passed" + month |
| `closed` (shelf) | Closed | `withdrawn`, `closed_no_response`, `declined_by_talent` | "Withdrawn", "No response", "Declined by talent" + month |

`since` is computed from `statusChangedAt` (fallback `submittedAt`): `4d`, `3w`,
`2mo`. Within `decide`, `waiting`, `offer` the sort is **longest waiting first**;
`represented` sorts newest first. Package boards (`resolveBoardType === 'package'`)
use `BOARD_VOCAB.package` for the represented section and the represent action.

### 2.2 Selection and the verdict bar

- **Click selects** (a wall, not a list): plain click selects only that face,
  cmd/ctrl-click toggles, shift-click ranges within the wall order. Space toggles
  the focused tile. Esc clears. Selection is shared between Wall and Ledger.
- **Enter, double-click, or the tile's "Open" affordance opens the record** in the
  Review Room with `queue` = the in-play wall order (decide → waiting → offer →
  represented), `scopeName` = the board name.
- The **verdict bar** rises from the bottom when ≥1 face is selected. It shows the
  selected faces (thumbs, max six, then "+N") and the actions legal for the
  selection. One selected: Open · Line up (disabled, needs two) · Shortlist ·
  Request digitals · Invite to meet · Offer representation (arm → confirm; N toggles
  the Development variant) · Mark represented (only when the status is `accepted`
  or `development`) · Keep on file · Pass (arm → reason → confirm) · Reopen (only
  on shelved statuses). Two or more: Line up · Keep on file · Pass (one reason for
  all) · Clear. **No bulk offers.** Actions a status makes illegal are not rendered.
- **Inline arming, never a modal**: A arms the offer, A or Enter confirms; X arms
  pass, X or Enter confirms; Esc disarms. Mirror the Review Room's verdict row.
- **Undo** on every decision toast, matching the mechanism exactly: it PATCHes the
  prior status back. The toast never claims the talent notification is recalled.
- A session tally "Sitting · N decided" is shown in the bar (Review Room parity).

Keyboard map (agency parity; suppressed while an input, the Review Room, the
lineup, or a modal has focus): `J`/`K`/arrows move focus across the wall or ledger
rows · `Space` select · `Enter` open · `S` shortlist · `D` request digitals · `M`
invite to meet · `A` arm/confirm offer · `N` development variant · `R` mark
represented · `F` keep on file · `X` arm/confirm pass · `L` line up · `V` toggle
Wall/Ledger · `Esc` disarm, then clear · `?` shortcut help (`ShortcutHelp`).

### 2.3 URL as state

`?view=ledger` (absent = wall) · `?review=<applicationId>` (open record; back
closes; shareable) · `?lineup=<id,id,...>` (open comparison). Selection is not in
the URL.

### 2.4 The lineup

Reuse `components/ComparisonOverlay.jsx` unchanged (max six, frozen snapshots,
subgrid, never ranks). Because represented talent are also applications with
snapshots, "compare against the board" needs no new code: select a represented
tile alongside candidates and line them up.

### 2.5 Minors

Tiles never print body measurements. The ledger prints height only. Any candidate
with `isMinor: true` carries the plain notation "Under 18" on the tile and ledger
row, and the server omits `measurements` for them (see §3).

## 3. Data contract — `GET /api/agency/boards/:boardId/candidates`

Keep every existing key. Add, per candidate:

```
submittedAt        ISO  (alias of created_at)
statusChangedAt    ISO | null   (applications.status_changed_at)
age                int | null   (DOB-derived; null for identity-only rows without DOB)
isMinor            bool
city               string | null   (same value as location; explicit key)
headshot           string | null   (best digital headshot path: images with
                                   image_type='digital' and shot_type='headshot',
                                   else primary image, else first image)
digitalsFreshness  same shape the dossier returns (talent-dossier.js
                   buildDigitalsFreshness) | null for identity-only rows
notesCount         int  (non-deleted application_notes)
tags               [{ id, tag, color }]
declineReason      string | null
```

Rules: `measurements` is `null` when `isMinor`. Withdrawn / closed rows stay in
the payload (they render on the Closed shelf). Board counts add `waiting_count`,
`offer_count`, `on_file_count`.

## 4. Pholio translation

### 4.1 Visual (agency system, `client/src/domains/agency/DESIGN.md`)

- **Editorial ledger, not cards.** Tiles are bare images on the cream canvas with
  type beneath; no borders, no card shadows, 2px radius. Sections are separated by
  full-width hairline rules with an Inter 11px tracked label and a plain count
  ("Needs a decision · 7"). This label is a section key, never an eyebrow above a
  heading.
- **Masthead** keeps the board identity plate system (`resolveBoardIdentity`,
  `boardIdentityStyle`, `[data-letterform]`, `[data-treatment]`, `BoardIdentityEditor`)
  ported to `.sb-*`. Board name in Playfair; brief in Inter; docket as a ruled
  `<dl>` (In play · Waiting on talent · Offers out · Represented n of m · Closes).
- **Tile anatomy**: 3:4 portrait (headshot), then name (Inter 600, 14px, ink 0),
  then a `MetaLine` of `ageFigure` · `heightFigure` · `Place` (city only), then the
  standing line in Inter 12px ink 2 with `since` as tabular mono ("Digitals
  requested · 6d"). "Under 18" as a `Notation`. Nothing in the corners. Selected:
  a 2px gold ring outside the image (the one gold); focused: gold focus ring.
  Hover: the image lifts one tone (`--ag-surface-2` underlay) in 150ms; no scale
  beyond 1.01.
- **Ledger**: 44px rows, hairline rules, face 32px, `Figure` for age and height,
  `StatusText`-free plain standing text with mono `since`, digitals freshness via
  `Freshness`, notes count as a plain figure. Sortable by name, age, height, city,
  standing, waiting time. Selected row: `--ag-surface-4` ground, gold hairline left
  edge no wider than 1px.
- **Verdict bar**: fixed bottom, ink ground (`--ag-black`), full width of the main
  column, 56px, the Review Room's `.rv-verdict` register (read `ReviewRoom.css`
  before styling). Gold only on the armed primary.
- **Wall grid**: `repeat(auto-fill, minmax(168px, 1fr))` with 20px column gap and
  28px row gap; at ≥1600px tiles cap at 220px. Represented section uses the same
  grid so the signed set reads as the standard the shortlist is measured against.
- **Shelves**: collapsed rows with a face stack and a count; expand to a ledger of
  rows with the standing date. Reopen is available from the bar.
- **Gold ≤10% of the screen.** No badges, chips, pills, dots, gradient text, glass,
  side stripes, or ornament (root `CLAUDE.md` banned list).

### 4.2 Motion (`--ag-duration-fast` 150ms, `--ag-duration` 200ms, `--ag-ease`)

- Tiles enter with a 12ms stagger opacity/4px rise on first load only.
- After a decision a tile moves to its new section with Framer `layout` (200ms)
  — the one choreographed moment, because it shows state.
- Verdict bar rises 200ms; arming swaps the button label in place, no bounce.
- Everything collapses under `prefers-reduced-motion` (`useReducedMotion`).

### 4.3 Language (`.claude/skills/pholio-app-language`, agency register:
dense, institutional, unglossed; signals, never verdicts)

Exact strings. Do not invent others without checking the skill's screen.

- Sections: `Needs a decision` · `Waiting on talent` · `Offer out` ·
  `Represented` (division) / `Confirmed` (package) · shelves `On file` ·
  `Passed` · `Closed`.
- Standing text: `Filed` · `Shortlisted` · `Digitals requested` ·
  `Meeting requested` · `Offer out` · `Development offer` · `Represented` ·
  `Confirmed` · `On file` · `Passed` · `Withdrawn` · `No response` ·
  `Declined by talent`. The `since` value is `{n}d`, `{n}w`, `{n}mo`, or a
  `calendarDate` for settled outcomes.
- Docket keys: `In play` · `Waiting on talent` · `Offers out` · `Represented`
  (`n of m` when `target_slots`) · `Closes` / `Closed` / `Wrapped`.
- Bar actions: `Open` · `Line up` · `Shortlist` · `Request digitals` ·
  `Invite to meet` · `Offer representation` → armed `Confirm offer` ·
  `Development offer` → armed `Confirm development offer` · `Mark represented`
  (package: `Confirm for package`) · `Keep on file` · `Pass` → armed `Confirm pass`
  · `Reopen` · `Clear`.
- Toasts (with `Undo`): `Shortlisted {name}` · `Digitals requested from {name}` ·
  `Meeting requested with {name}` · `Offer sent to {name}` ·
  `Development offer sent to {name}` · `{name} marked represented` ·
  `{name} kept on file` · `Passed on {name}` · `{n} kept on file` ·
  `Passed on {n}` · `Reopened {name}`. Undo copy: `Undo` only; the undone toast
  reads `Restored {name} to {prior standing}`.
- Empty states (four scripts):
  - first-use (no candidates): `Talent you file to this board from Submissions
    appear here.` with the link `Open Submissions` → `/dashboard/agency/submissions`.
  - user-cleared (decide section empty, others not): `Nothing needs a decision.`
  - error: `This board could not be loaded.` + `Try again`.
  - permission: handled by the shell.
- Loading: skeleton tiles in the wall grid, never an empty section while loading.
- Zero em-dashes, exclamation marks, emoji, or urgency shapes anywhere.

Known document conflict, recorded not resolved: the talent-side label
`Go-See Requested` for `meeting_requested`. This surface uses `Meeting requested`
(agency-facing, industry-correct; the Review Room already says `Invite to meet`).

## 5. Files and ownership

```
client/src/domains/agency/pages/SigningBoardPage.jsx          Lane W (page: URL state, query, mounts)
client/src/domains/agency/pages/signing/boardModel.js          Lane W
client/src/domains/agency/pages/signing/BoardMasthead.jsx      Lane W
client/src/domains/agency/pages/signing/Wall.jsx               Lane W
client/src/domains/agency/pages/signing/Ledger.jsx             Lane W
client/src/domains/agency/pages/signing/Shelves.jsx            Lane W
client/src/domains/agency/pages/signing/SigningBoard.css       Lane W  (.sb-* only)
client/src/App.jsx                                              Lane W  (route swap)
client/src/domains/agency/pages/signing/useBoardSelection.js   Lane V
client/src/domains/agency/pages/signing/useBoardDecisions.js   Lane V
client/src/domains/agency/pages/signing/BoardVerdictBar.jsx    Lane V
client/src/domains/agency/pages/signing/verdict.css            Lane V  (.sbv-* only)
client/src/domains/agency/pages/signing/__tests__/*            each lane its own files
src/domains/agency/routes/casting.js                            Lane B
src/domains/agency/routes/casting-stage-helpers.js              Lane B
tests/agency/board-candidates.test.js                           Lane B
```

Deleted by the integrator after both frontend lanes land: `CastingDetailPage.jsx`
and the `.rr-*` block of `CastingPage.css`.

### 5.1 Interfaces (pin these; both lanes code to them)

```js
// boardModel.js (Lane W) — pure, no JSX
export const SECTIONS  // [{ key, title(vocab), shelf: bool }] in order
export function sectionOf(status) // -> 'decide'|'waiting'|'offer'|'represented'|'file'|'passed'|'closed'
export function standingOf(candidate, vocab, now = Date.now()) // -> { text, since, settled: bool }
export function groupCandidates(candidates, vocab) // -> { decide:[], waiting:[], offer:[], represented:[], file:[], passed:[], closed:[] } sorted per §2.1
export function inPlayOrder(groups) // -> flat array decide→waiting→offer→represented (the queue and the range-select order)
export function legalActions(statuses /* array */) // -> Set of action keys legal for ALL given statuses (see below)

// action keys (shared vocabulary between lanes)
'open' | 'lineup' | 'shortlist' | 'request_digitals' | 'invite_meeting' |
'offer' | 'development' | 'represent' | 'keep_on_file' | 'pass' | 'reopen'
```

```js
// useBoardSelection.js (Lane V)
useBoardSelection(orderedIds /* string[] */) -> {
  selectedIds: Set<string>, focusedId: string|null, anchorId,
  isSelected(id), select(id, { additive, range }), toggle(id), selectOnly(id),
  clear(), setFocused(id), moveFocus(+1|-1), selectedInOrder(): string[]
}

// useBoardDecisions.js (Lane V)
useBoardDecisions({ boardId, vocab, byId /* Map<applicationId, candidate> */ }) -> {
  decide(action, ids /* string[] */, { declineReason, note, variant } = {}),
  busyIds: Set<string>, sessionDecided: number
}
// Optimistic write to ['board-candidates', boardId]; toast with Undo per §4.3;
// invalidates ['board-candidates', boardId], ['agency-boards'], ['application', id].
// api: shortlistApplication, requestMoreApplication, requestMeetingApplication,
// acceptApplication, offerDevelopmentApplication, confirmRepresentationApplication,
// keepOnFileApplication, declineApplication({declineReason}), updateCastingApplicationStage
// (reopen -> status 'shortlisted'), bulkUpdateCastingApplicationStage, bulkDeclineApplications.

// BoardVerdictBar.jsx (Lane V)
<BoardVerdictBar
  selected={candidate[]}            // in wall order
  vocab={BOARD_VOCAB.division | .package}
  legal={Set<action>}               // from boardModel.legalActions
  busy={bool}
  active={bool}                     // false while review/lineup/modal/input owns keys
  sessionDecided={number}
  onAction={(action, { declineReason, note, variant }) => void}
  onOpen={() => void}
  onLineUp={() => void}
  onClear={() => void}
/>
// Owns arming state and the S/D/M/A/N/R/F/X/L/Esc keys while `active`.
// Pass reason: inline radio strip from useDeclineReasons() (see ReviewRoom's
// reason strip), plus an optional one-line note saved via createNote.
```

Lane W consumes the Lane V hooks/bar by import path only; until Lane V lands,
Lane W may stub them locally in a file it owns and delete the stub at integration.

## 6. Verification

- `cd client && npm run lint && npm run build`; `npx vitest run src/domains/agency`.
- `npm test -- tests/agency/board-candidates.test.js`.
- Browser pass on a scratch SQLite (never the Neon `.env` database; see
  `tasks/lessons.md` and the review-room verification memory): seed a board with
  candidates in every standing including a minor and an identity-only applicant,
  then screenshot at 1280 and 1680 widths: wall, ledger, selection + bar, armed
  pass, lineup, review open from the board. Probe: no `border-radius` > 4px on
  tiles, no `backdrop-filter`, gold coverage visually under 10%, longest seeded
  name and city do not overflow a 168px tile.
