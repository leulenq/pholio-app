# Intel — Placement (2026-10-04)

Supersedes `tasks/intel-page-spec.md` (traffic and attention analytics). The privacy rules in that spec's §4 still hold.

## Premise

Intel is what a mother agent tells an unrepresented talent, which most never get told. A mother agent files you on the right boards, builds your book toward them, places you with the right agencies at the right time, and reads what comes back. v1 serves talent seeking representation, Pholio's core flow. Represented talent (options, bookings, market placement) is a later surface.

Intel is not view counts, "agency X looked at you", scores, percentiles or odds. Those are vanity or fiction, and paid advice to models is regulated (NY Fashion Workers Act, FTC), so Intel is free on every tier.

## What it shows

1. **Filing, on the measuring wall.** Height against the typical range of each board that casts to height (fashion/editorial, runway, petite), from `data/industry/v1/boards.json`. Boards with no height convention (commercial, lifestyle, curve…) are listed only when the talent declares them. A declared board whose range the stats sit outside is said plainly, with numbers. Ranges are context, never a gate.
2. **What agencies ask to see.** The shots agencies publish in the spec registry, counted across agencies and read against the talent's book through the same preflight as the apply flow. Each shot is in the book, likely in the book (frame exists, shot type not user-confirmed), or missing. Plus digitals currency.
3. **Where to go.** Every Pholio agency and registry agency, grouped: represents you · waiting to hear · approach now · try again later · not your route right now. Conflicts and preferences are quoted in the agency's own published words. Each agency shows how to approach (through Pholio, or on its own site) and any verified walk-in open-call window. Try-again dates come from the decline reason (`services/placement/agencies.js` `AGAIN`). They are Pholio's guide, not the agency's rule. Tracked links for sending a book off-platform sit here as well.
4. **The next six months.** Dated facts only: verified open calls, try-again dates, review-window closing dates, and the date digitals go stale.

Under-18 profiles get no placement plan (adults-only launch).

## Form (2026-10-04, second pass: designed from scratch)

The page is a planning desk with two columns:

- **Left (still):** the talent as filed. A big height figure, the measuring wall stood upright (a cm ruler and a feet ruler, each height-cast board as a column at its range, the talent as a red line), boards notes, book against agency shot lists, and digitals.
- **Right (moving):**
  - "This week" (dated items in 7 days, plus anything waiting on the talent).
  - One timeline from a month back to six months out: waiting submissions as bars to their close dates, try-again points, weekly open-call ticks, the digitals' current/overdue span, and a "Now" marker that jumps to the agency index.
  - The agency index as tabs (Now, Waiting, Later, Not now).
  - Tracked links.

The hero is the answer itself: the boards, set huge ("Petite. Commercial."). The visual language is deliberately outside the house system: paper grey, near-black ink, a single signal red for "you" and "now", Instrument Serif (Google Fonts) for display, and mono for dates.

## Code

- Backend: `src/domains/talent/services/placement/{filing,agencies,calendar,index}.js`, `GET /api/talent/intel` (`routes/intel.js`), data `data/industry/v1/boards.json`.
- Frontend: `client/src/domains/talent/pages/IntelPage/`: `index.jsx`, `YouColumn.jsx`, `Timeline.jsx`, `ThisWeek.jsx`, `AgencyIndex.jsx`, `SentLinks.jsx`, `Desk.css`. All copy is in `placementModel.js` and the axis math is in `timelineModel.js`.
- Tests: `tests/talent/intel.test.js`; vitest `placementModel.test.js`, `timelineModel.test.js`, `SentLinks.test.jsx`, `IntelPage.test.jsx`.

## Known limits

- Board ranges are New York typical practice, with no per-market variants yet.
- Registry agencies mostly publish no divisions, so board fit for them comes from the talent's filing, not from the agency.
- Open-call windows match agencies by display name only when the registry links them.
