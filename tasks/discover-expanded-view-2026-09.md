# Scout — the expanded talent view, rebuilt from first principles (September 2026)

**Date:** 2026-09-03
**Surface:** the full-frame view opened from a card in `/dashboard/agency/discover` (nav label: **Scout**). Currently `client/src/domains/agency/pages/DiscoverDetail.jsx`.
**System context:** the third Pipeline surface, after Submissions (the Review Room, `components/review/ReviewRoom.*`) and Signing (`pages/CastingPage.*`). It joins their system. It is not their template.
**Owner ask:** "Discover has a different job. The agency has not received a submission or begun a signing process. They found someone through search and are deciding whether this person is worth exploring further."

---

## 1. Where this sits, in the industry's own pipeline

The `industry` knowledge base names the representation lifecycle:

```
Prospect / lead
  → Scouted (or self-submitted via open call)
  → Digitals requested
  → Reviewed → [Declined | Kept on file | Meeting]
  → Meeting / go-see → Development offer → Signed
```

Pholio's three Pipeline surfaces map onto it exactly, and this is the whole design:

| Surface | Lifecycle position | Who moved first |
|---|---|---|
| **Scout** | Prospect / lead → **digitals requested** | The agency went looking |
| **Submissions** | Reviewed → declined / kept on file / meeting | The talent submitted |
| **Signing** | Meeting → development offer → signed | Both, already engaged |

Scout sits **before the application lifecycle begins**. Its one outbound action is the industry's "request digitals" — in Pholio, an invitation to apply. Everything the Review Room does (verdicts, keystroke decisions, auto-advance, a session tally) belongs to a stage this surface has not reached.

**The reframe that drives every decision below:** a Scout result is a **lead**, not a candidate. The agency is not adjudicating a person. It is deciding whether to spend an approach.

---

## 2. What actually changes for Scout

| | Submissions (Review Room) | Scout (this surface) |
|---|---|---|
| How they arrived | They applied to you | You searched and found them |
| What you hold | A frozen submission package | Their live published profile |
| Obligation | You owe them an answer | You owe them nothing |
| The question | Yes or no? | Worth approaching? |
| Media | Five slot-ordered digitals, standardised | Their book, in their order |
| Decision set | Six verdicts, one keystroke each, auto-advance | One approach, plus private memory |
| Movement | Through a queue you are clearing | Through a search you constructed |
| Context that must survive | Queue position, session tally | The brief, and why this person matched |
| Cost of a wrong yes | A wasted meeting, a rejected applicant | A wasted invitation |
| Cost of a wrong no | A good applicant lost | Nothing recorded; you scroll on |

Five consequences follow, and they are the design.

### 2.1 There is no verdict, so there is no verdict bar

The Review Room's bar is a decision instrument: pass, keep on file, request digitals, invite to meet, development offer, represent. Every one of those is an outcome recorded **against an application**. There is no application here. A "pass" would be a judgement the talent never asked for and will never see; an "offer" cannot be made to someone whose dossier you have not seen.

Copying that bar would be the exact failure the owner named: the same template with different buttons, and dishonest as well.

Scout's bar carries **one outbound verb** and, beside it, private memory. Nothing on this surface communicates a judgement to the talent except the invitation, which is a request.

### 2.2 The book is the subject, and its order is evidence

Submissions standardises: five named slots, a fixed order, missing slots drawn as labelled empty frames. That is right there, because comparability across a queue is the job and the agency asked for those shots.

Scout must do the opposite. This is the talent's **book**, published in the order they chose, and both the selection and the sequence are part of what a scout is reading. Reordering it would destroy the signal. So: the talent's own `sort` order, no imposed slots, no empty frames for shots nobody requested, and the frame count stated plainly because a nine-frame book and a two-frame book are different propositions.

The current view shows **one photograph**. For a surface whose entire job is judging a look, that is the central failure, and it exists because the modal reuses the grid card's data instead of loading the profile.

### 2.3 Representation status is the gate, and it must be right

In Submissions the load-bearing alert is **Minor**. Here it is **representation**.

A scout who approaches someone exclusive with another mother agency has made a real professional mistake — the mother-agency relationship is the structural fact of the business. Cold outreach to a represented model is at best wasted and at worst a reputational incident.

So representation status is the first thing in the facts column, above the figures, stated as words: *Unrepresented* · *Seeking representation* · *Represented, agency undisclosed* · *Exclusive elsewhere*.

**This is currently broken.** The preview endpoint builds the DTO without the `talent_representations` rows (`inbox.js`, the `/discover/:profileId/preview` handler passes `images`, `social`, `lanes` and nothing else), so `deriveRepresentationStatus` sees only `seeking_representation` and can never return `represented` or `exclusive_elsewhere`. The one fact that decides whether to approach cannot currently say the thing that would stop you.

### 2.4 Losing the search is losing work

A Submissions queue persists; you can always come back to it. A Scout result set is **constructed** — a brief, parsed into filters, fused with meaning, ordered. Dropping it costs the agency real work, and it is the difference between a tool a booker trusts and one they stop opening.

Three requirements follow:
1. **The brief travels into the room.** It sits in the chrome where the Review Room puts "Reviewing · Submissions". You always know which search you are inside.
2. **Position is in the result set, not a queue.** "6 / 23", and which band you are in (exact match or close match), because moving from the last exact match into the close matches is information.
3. **Return is exact.** Escape and the browser's back both return to the grid with the card you were on, and the URL carries the open profile so a booker can send a colleague the person *and* the search that found them.

### 2.5 Why they surfaced belongs on this surface and nowhere else

The semantic layer produces a `why` — the talent's own sentence, or their book's description, that matched the brief. In the grid it is one line on a card. In the expanded view it is the bridge between the search and the person: *this is the thing you were looking for, in their words.*

No other Pipeline surface has this, because no other surface began with a query.

---

## 3. What the scout is trying to learn, in order

Observed order of attention when a scout works a lead:

1. **The face**, in about a second.
2. **More frames** — the bulk of the time, and the real decision.
3. **Height**, decisive and instant.
4. **Are they free?** — representation.
5. **Where are they?** — market, and whether they travel.
6. **How current is this?** — a book last touched fourteen months ago says nothing about today.
7. **Have we touched this person before?** — prior application, prior invitation, a teammate's note. Approaching the same person twice is the embarrassment this prevents.
8. **Their own words** — the bio, last, and only sometimes.

So the composition leads with the book at maximum size, holds items 3 to 7 in a column that never scrolls away, and puts the bio below the fold with the rest of the book.

**And what is deliberately absent, said once:** no exact date of birth (band only), no contact details, no measurements they have not published, no dossier. A dossier comes only with an application. Saying this plainly is a trust feature on a surface where an agency is looking at someone who did not contact them.

---

## 4. The design

### 4.1 Inheritance from the system, and the one deliberate inversion

Inherited from the Review Room, exactly:

- **The type-role system.** Every string belongs to one semantic role with one treatment: `serif` (identity), `title` (region), `chrome` (workspace context), `marker` (wayfinding), `key` (the left term of a value), `read` (system readouts, key hints), `figure` (measured numbers), `value` (descriptive data), `note` (annotation), `prose` (sentences). This is what makes the surfaces one system rather than one template, and it is the part worth copying verbatim.
- **The register:** Noto Serif Display / Inter / JetBrains Mono; cream, ink, one gold; 6px radii; hairline rules; the four ink levels each with a job (findings, context, provenance, absence).
- **The chrome grammar:** wordmark-exit left, context centre, mono ledger right, pager, close.
- **The rule that state is words**, and every agency ban (no pills, chips, eyebrows, glass, side-stripes, badges).
- **Absence is never a positive claim** — an unpublished measurement reads "Not listed", never a blank.

The one inversion, and it carries meaning:

> **The Review Room is a paper page with an ink bar. Scout is an ink stage with a paper rail.**

The Review Room adjudicates a *record*, so it is a document: cream, with photographs set into it. Scout reads a *book*, so photography owns the surface and the facts sit beside it on paper. This is sanctioned by the agency design system, which already allows `onDark` grounds for a drawer hero, and it means opening a card from the dark Scout grid does not flash cream at a booker mid-flip.

### 4.2 Composition

```
┌─ chrome (ink, 64px) ───────────────────────────────────────────────┐
│ PHOLIO            Scouting · "girl next door commercial warmth"    │
│ (exit)                              EXACT MATCH · 6/23  ‹ ›  ✕     │
├──────────────────────────────────┬─────────────────────────────────┤
│                                  │  Aria Larsen            (paper) │
│                                  │  Commercial · Milan · 18+       │
│      THE BOOK (ink)              │  ─────────────────────────────  │
│      one frame, large            │  Unrepresented                  │
│      the talent's own order      │  ─────────────────────────────  │
│                                  │  HEIGHT   5'10" · 178 cm        │
│                                  │  WAIST    Not listed            │
│                                  │  SHOE     US 9                  │
│                                  │  ─────────────────────────────  │
│                                  │  Updated 3 weeks ago            │
│  ● ○ ○ ○ ○ ○ ○   9 frames        │  ─────────────────────────────  │
│                                  │  Matched your brief             │
│                                  │  "…girl-next-door relatability" │
│                                  │  ─────────────────────────────  │
│                                  │  No prior contact               │
├──────────────────────────────────┴─────────────────────────────────┤
│  THE BOOK IN FULL — every frame at grid size                       │
│  IN THEIR WORDS — bio                                              │
│  WHAT AN APPLICATION WOULD ADD — the honest boundary               │
├────────────────────────────────────────────────────────────────────┤
│ (ink)  Invite to apply          Not for us        ← → to browse    │
└────────────────────────────────────────────────────────────────────┘
```

- **Chrome.** Wordmark exits to the grid. Centre carries the brief itself. Right carries the band, the position in the result set, pager chevrons, close.
- **The stage** fills the first viewport: the book left at maximum size with a frame strip beneath it; the facts column right, on paper, never scrolling away while you flip.
- **The facts column** in the scout's order of attention: name, fact line, **representation**, figures with honest absence, freshness, why-they-surfaced, prior contact.
- **The record** below the fold: the whole book at grid size, the bio, and the stated boundary of what is and is not visible without an application.
- **The bar** on ink: one primary verb, one private verb, and the movement hint.

### 4.3 Actions, and what each one honestly is

| Action | What it does | Who learns of it |
|---|---|---|
| **Invite to apply** | Sends an invitation to submit. The industry's "request digitals". Already built (`POST /api/agency/discover/:profileId/invite`), already distinct from an application, already blocked when the talent has blocked this agency. | The talent. It is a request, never dossier access. |
| **Not for us** | Private. Drops this profile out of this agency's future Scout results. | Nobody. Never communicated. |
| Movement | Arrows through the result set; the book has its own frames. | Nobody. |

Once invited, the primary reads **Invited** and is inert — the state is words, and the ledger records when.

There is no "pass", no "shortlist", no "offer" here. Those are Submissions verbs and they require an application to attach to.

**Looking is not an act.** `GET /discover/:profileId/preview` today fires
`notifyTalentAgencyProfileView(...)` as well as its analytics event. Today's
expanded card fetches nothing, so nobody is told. The moment the room loads the
profile properly, every skim through a result set would start telling talent
that an agency viewed them — a behaviour change arriving as a side effect of a
redesign, which is the worst way for a product to acquire one.

Decide it the other way, on the merits. A scout moves through twenty leads to
keep one. Nineteen of those notifications are false signal to the talent, and
they devalue the twentieth. Worse, a scout who knows the talent is told will
look less — the surface would be taxing its own primary behaviour. So: the
preview read is **quiet**. The analytics event stays (it is ours, internal, and
it is how we learn whether Scout works). The talent-facing notification moves to
the one deliberate act — the invitation. That keeps the rule the whole agency
system runs on: *the talent hears about intent, not attention.*

### 4.4 Movement and the search

- `←` `→` move through the result set in its ordering; the ledger updates; the band label changes when you cross from exact into close matches.
- The book has its own navigation (click a frame, or `↑` `↓`), so frame movement and person movement never collide.
- `Esc` closes to the grid, focusing the card you were on.
- The URL carries `?q=<brief>&talent=<id>`; back closes; the link restores both the person and the search.
- No auto-advance and no session tally. Nothing is being cleared here.

### 4.5 Tempo

Submissions is fast: keystroke, verdict, advance. Scout is slow: look, flip, weigh, mostly move on. Motion is a crossfade between frames and a quiet entrance; nothing choreographed. Reduced motion collapses all of it.

---

## 5. What must be built

**Backend**
1. `/discover/:profileId/preview` must pass `representations` into the DTO so representation status can say what it exists to say, and must report whether this agency has already invited or received an application from this person.
2. A freshness fact the surface can state honestly.
3. A private "not for us" so the verb on the bar is real rather than decorative.
4. The preview read made quiet: the analytics event kept, the talent-facing
   view notification gated off the read and left on the invitation, both
   asserted by tests.
5. `slug` carried through the preview. It is in the DTO and dropped by
   `mapTalent`, and it is the key to the comp card (`/pdf/:slug`) and the
   portfolio site — the only two profile-keyed reads besides the preview, and
   both are things a scout wants before deciding.

**Frontend**
6. Fetch the profile on open, rather than reusing the card, so the book exists at all.
7. Rebuild the view to the composition above, on the Review Room's type roles and tokens.
8. URL sync, exact return, result-set movement.
9. Its own token block. Discover declares no tokens at all today and writes
   colour literals inline, which is the single clearest inconsistency in the
   surface.

**Constraints the data imposes, so the design does not promise past them**
- Image freshness is unavailable: `captured_at` is not a public image field, so
  the only honest freshness sources are `measurements_updated_at` and the
  profile's `updated_at`. One quiet sentence, and only when present.
- The Review Room's four load-bearing devices — freshness line, "Before you
  decide" flags, provenance sentence, house record — have no data behind them
  here. Imitating them would render empty regions, which is worse than not
  having them. Inheritance is of type and tone, not of regions.

**Not built here, named deliberately**
- Notes and tags on a non-applicant (institutional memory beyond "not for us") — real, and a cycle of its own, because it needs a profile-scoped note store that today is application-scoped.
- Side-by-side comparison of two leads.
- Any verdict vocabulary. It belongs to Submissions and would be dishonest here.
