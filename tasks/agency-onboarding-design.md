# Agency Onboarding — What Pholio Should Actually Collect

**Date:** 2026-07-07
**Status:** Design / consult (no code). Defines the data model and step flow for the
first-login agency onboarding, grounded in how agencies operate and in what the
existing Pholio dashboard already consumes.
**Audience:** agency side only. Agencies do **not** self-sign up — they are vetted
and provisioned by Pholio, then log in for the first time. Onboarding is a *smart
setup for a real operating environment*, not account creation.

---

## 0. Industry framing (read this first)

The correct frame for "agency first-login setup" is **opening a new market/office
in booking software** — the moment a head booker configures the boards they run,
the markets they cover, the physical specs their clients cast to, and who on the
team sits on which board. It is an **operational configuration**, not a profile
form. A booker judges this screen in seconds: if it asks for "agency description"
and a brand color and nothing about **boards, markets, or specs**, it reads as a
generic SaaS CRM and they lose trust immediately.

Two things the onboarding must respect that generic account forms get wrong:

- **There is no single "model."** Agencies run **boards / divisions** (Women,
  Men, New Faces, Curve, Kids, Commercial, Talent…), and each board has *different*
  physical standards and gatekeeping. Onboarding must be board-aware from the first
  question. (`reference/standards.md` §2.)
- **An agency is a node in a network, not a silo.** It works specific **markets**,
  develops **new faces**, and (for smaller/mother agencies) **places** talent into
  bigger markets. "One agency, one roster, one location" is the tell of software
  built by people who've never worked a board. (`reference/standards.md` §1.)

**Reframe of the ask:** we are not "collecting agency info to finish signup." We
are **priming the roster, the discovery filters, the applicant-review gates, and
the match engine** so the dashboard is configured for this agency's real workflow
on day one.

---

## 1. Current state — what onboarding collects vs. what the dashboard consumes

### 1.1 What onboarding asks today (the "generic form" problem)

`client/src/domains/onboarding/pages/AgencyOnboardingPage.jsx` +
`OnboardingSteps.jsx` — 5 steps:

| Step | Collects | Lands in |
|---|---|---|
| Profile | `first_name`, `last_name`, `agency_name`, `agency_location` (freeform), `agency_website`, `agency_description` | `agencies` |
| Brand | logo, `agency_brand_color` | `agencies` |
| Team | invite provisioned logins, role (MEMBER/ADMIN) | `agency_memberships` (RBAC) |
| Preferences | `notify_new_applications`, `notify_status_changes`, `default_view` | `agencies` |
| Review | — | — |

Every field here is **account cosmetics**. Nothing collected changes what the
matching engine sees, what discovery filters on, what the applicant inbox gates,
or what boards exist. A brand-new agency lands on an **empty, unconfigured**
command center.

### 1.2 What the dashboard *already consumes* — and onboarding never fills

These sinks exist in code today and sit **empty** for a new agency:

- **Agency submission requirements** — `agencies.min_height_female/male`,
  `max_height_female/male`, `min_age`, `max_age`
  (`migrations/20260701110000_add_agency_requirements_fields.js`). Consumed by:
  - the **talent-facing agency directory** (`src/domains/talent/routes/agencies.js`
    selects these to show talent who an agency is looking for),
  - **discovery search / scoring** (`src/domains/agency/services/discover-search.js`,
    `match-scoring.js` `passesHardFilters` gates on age/height/gender).
  These were only ever **backfilled for seeded agencies** — the migration hardcodes
  Wilhelmina/IMG/Elite/etc. A real new agency has them all `NULL`.
- **Open boards** — `agencies.open_boards` (JSON array)
  (`migrations/20260624000000_add_agency_open_boards.js`): the agency-authored,
  talent-facing signal of which divisions are open for submissions. Read by the
  talent directory and apply flow. Never set in onboarding.
- **Internal boards + their criteria** — `boards`, `board_requirements`,
  `board_scoring_weights` (`migrations/20250119…`, `20260206000000_update_boards_system_complete.js`).
  `board_requirements` carries age/height/measurement ranges, `genders`,
  `body_types`, `comfort_levels`, `experience_levels`, `skills`, `locations`,
  `min_social_reach`; `board_scoring_weights` carries the 0–5 importance sliders
  per dimension. These are the **exact inputs the roster/casting Kanban and match
  score run on** — and a new agency has **zero boards**, so the roster, casting,
  and Discover surfaces open blank.
- **Agency-scope match criteria** — `match_criteria` with
  `scope_type='agency'`. `src/domains/matching/resolve-criteria.js` resolves every
  board/brief by **inheriting agency → board → brief**. The agency level is the
  house baseline (compliance constraints, default importance). With no agency-scope
  row, boards and briefs inherit **nothing**; the match engine starts cold and only
  learns after the booker manually labels decisions
  (`preference-learner.js`).
- **Social presence** — `agencies.instagram_handle`, `tiktok_handle`,
  `twitter_handle`, `youtube_handle`, `video_reel_url`
  (`migrations/20260608140000_add_agency_social_fields.js`). Never collected.
- **Open call links** — the agency's own inbound funnel
  (`tasks/agency-open-call-design.md`, `src/domains/agency/routes/open-call.js`).
  The single highest-value agency action ("put your Apply link on your site") is
  never surfaced at setup.

**The gap in one sentence:** onboarding populates the *chrome* (`name`, logo,
color) and leaves every *operational* table the dashboard actually reads
(`board_requirements`, `board_scoring_weights`, `match_criteria` agency scope,
agency requirement columns, `open_boards`) empty.

---

## 2. How agencies actually work day-to-day (the research)

Grounded in `reference/standards.md` (§1, §2, §5) and `reference/lifecycle.md`.

A booker's daily reality, in the order it drives data needs:

1. **They sit on a board.** Work is organized by **division** (Women's Fashion,
   Men's, New Faces/Development, Curve, Commercial/Lifestyle, Kids & Teens,
   Talent/actors…). A booker owns one or more boards; the roster *is* the boards.
   → Pholio needs the agency's **boards** up front, because everything else
   (requirements, weights, applicant routing, roster columns) hangs off a board.

2. **They work specific markets.** A NYC agency covers NYC; it may **place** talent
   on a "Paris stay" or a "Tokyo stay." Market is a first-class attribute of
   castings and commitments (`casting_briefs.market`,
   `talent_commitments.market`). → Onboarding should learn the agency's **home
   market(s)**.

3. **They cast to physical specs.** Each board has hard gates (runway height,
   sample size for fit) and soft preferences (look, comfort levels for
   swim/lingerie, experience). These specs are **board-specific and
   division-specific** — a Curve board's height range is not the fashion range;
   a Kids board is age-banded and legally gated. → Onboarding should capture the
   **specs per open board**, not one global spec.

4. **Most inbound is triaged, not accepted.** The pipeline is leads → open call /
   digitals request → meeting → develop or sign, and the dominant outcomes are
   "pass" and **"keep on file"** — not a binary accept/reject
   (`reference/lifecycle.md`, application/inbound lifecycle). → Onboarding should
   set whether the agency is **currently accepting inbound**, on **which boards**,
   and what a submission must include (digitals? measurements? reel?).

5. **New faces are developed, not just booked.** A development booker tracks tests,
   polish, measurement updates, and placement before talent is bookable. → Whether
   the agency runs a **New Faces / development** pipeline is a real configuration
   signal (affects board setup + expectations).

6. **They live in options/holds/availability, and money is net-of-commission.**
   Bookings run on 1st/2nd option → confirm → booked → release, with commission
   (~20% from talent) and **splits** with mother agencies
   (`reference/standards.md` §6). *Pholio has no payments system*
   (`casting_briefs` explicitly omits budget), so onboarding should **not** ask for
   rate cards or banking — but it **can** capture the **standard commission rate**
   as a display/record default if we want commission tracking to read as real.
   (Flagged as defer-able; see §6.)

7. **Minors are a different regime.** Kids/Teens boards trigger work permits,
   guardian consent, chaperones, heightened privacy
   (`reference/standards.md` §7; `migrations/20260628120000_add_minor_agency_consents.js`
   already exists). → If an agency turns on a Kids/Teens board, onboarding must
   branch into a consent/handling acknowledgment.

---

## 3. Recommended onboarding — the credible shape

Design goals: (a) every question **writes to a real sink** the dashboard reads;
(b) board-aware from the start; (c) fast — a booker can complete a believable v1 in
minutes and refine later; (d) respects the agency design system (dense, editorial,
no badges/chips — `client/src/domains/agency/CLAUDE.md`).

Proposed step flow (replaces the current Profile→Brand→Team→Preferences→Review with
an operations-first spine):

```
1. Agency identity & markets      → agencies (+ social)
2. Boards & divisions             → boards (division boards) + open_boards
3. Casting standards per board    → board_requirements + board_scoring_weights
                                     + agencies.min/max height & age + match_criteria(agency)
4. Inbound & submissions          → open_boards, accepting-state, required materials,
                                     open call link, minors branch
5. Team & who sits on which board → agency_memberships (+ board ownership)
6. Brand & workspace defaults     → agencies (logo, color, notifications, default_view)
7. Review / launch
```

Brand + preferences move to the **end** — they're the least load-bearing and should
never be the first impression of a working tool.

### Step 1 — Agency identity & markets

| Field | Type | Sink | Notes |
|---|---|---|---|
| Agency legal / display name | string (req) | `agencies.name` | already collected |
| Agency type | enum: `mother` · `boutique` · `full_service` · `management` · `scouting` | new col `agencies.agency_type` | drives copy + whether "placement/splits" language appears; see `reference/standards.md` §1 |
| Home market(s) | multi-select of markets (city/region), 1+ required | new col `agencies.markets` (JSON) | replaces freeform `agency_location`; feeds market defaults for briefs/commitments |
| Also places talent into other markets? | bool + optional market list | `agencies.places_into` (JSON) | mother/boutique reality; if false, hide placement UI |
| Website | url | `agencies.website` | already collected |
| Instagram / TikTok / other | handles | `agencies.instagram_handle` etc. | fields already exist, never collected |
| Short profile | text | `agencies.description` | keep, but reframe as "what talent sees" |

Terminology: label it **"Markets"** (not "location"), **"Agency type"** with the
real options. Never "category."

### Step 2 — Boards & divisions

Ask **which boards the agency runs**. This is the spine — it creates the actual
`boards` rows (division boards, `kind = 'division'`) the roster and Discover render,
and seeds `open_boards` for the talent-facing signal.

- Present the real division vocabulary as selectable presets (multi-select):
  **Women / Women's Fashion**, **Men / Men's**, **New Faces / Development**,
  **Runway/Show**, **Curve / Plus**, **Petite**, **Commercial / Lifestyle**,
  **Fitness**, **Mature / Classic**, **Kids & Teens**, **Parts**,
  **Influencer / Digital**, **Talent (actors/dancers/hosts)**. Allow a custom board
  name.
- For each selected board: **is it open to submissions right now?** (drives
  `open_boards`) and **is it a development board?** (New Faces flag).
- Selecting **Kids & Teens** (or any board with a minor age band in Step 3) flags
  the minors branch in Step 4.

Sink: one `boards` row per selection (`agency_id`, `name`, `kind='division'`,
`is_active`, `sort_order`); `agencies.open_boards` = the subset marked open.

Terminology: **"Boards"** / **"Divisions"**, **"New Faces"**, **"open to
submissions."** Never "categories" or "tags."

### Step 3 — Casting standards, per board (the credibility core)

For **each division board** created in Step 2, capture the specs. This is where
Pholio stops looking generic. Per board:

| Field | Type | Sink |
|---|---|---|
| Genders on this board | multi-select | `board_requirements.genders` |
| Age range | int–int (dual: years) | `board_requirements.min_age/max_age` |
| Height range | int–int, **cm + in shown** | `board_requirements.min_height_cm/max_height_cm` |
| Bust/chest · waist · hips ranges | decimal ranges, **cm + in** | `board_requirements.min/max_bust/waist/hips` |
| Body types accepted | multi-select | `board_requirements.body_types` |
| Comfort levels required | multi-select (swim, lingerie, nude, etc.) | `board_requirements.comfort_levels` |
| Experience level | multi-select (new face → established) | `board_requirements.experience_levels` |
| Skills | multi-select | `board_requirements.skills` |
| Markets/locations for this board | multi-select | `board_requirements.locations` |
| Min social reach + how much it matters | int + enum(low/med/high/critical) | `board_requirements.min_social_reach`, `social_reach_importance` |
| **What matters most** (importance sliders) | 0–5 per dimension | `board_scoring_weights.*` |

Critically:

- **Pre-fill each board with credible division defaults, then let the booker
  adjust.** A Women's Fashion board pre-fills ~173–183cm; Curve pre-fills its own
  (wider, higher) range; Kids pre-fills an age band and *suppresses* body
  measurements. Defaults must be **contextual, never hard validation**
  (`reference/standards.md` §4: "Do not hardcode these as validation"). The point
  is to save typing, not to reject.
- **Dual units everywhere** (cm + in, and shoe US/EU/UK where relevant).
  International agencies require cm; `reference/standards.md` §4.
- **Roll the house baseline up to the agency scope.** In addition to per-board
  `board_requirements`, write:
  - `agencies.min_height_female/male`, `max_height_female/male`, `min_age`,
    `max_age` — the coarse agency-level gate the talent directory + discovery read
    (derive from the union/most-common of the boards, or ask once at agency level).
  - a `match_criteria` row at `scope_type='agency'` carrying the agency's default
    `signal_relevance.importance` and any **locked compliance constraints** (e.g.
    minors handling) so every board/brief inherits a sane baseline via
    `resolve-criteria.js` instead of starting cold.

Terminology: **"Casting standards,"** **"digitals,"** **"comp card,"** **"boards."**
Show ranges as gates *with* falloff, not pass/fail badges (banned UI —
`AGENTS.md` / agency `CLAUDE.md`).

### Step 4 — Inbound & submissions

How the agency receives talent — maps directly to the open-call system and the
applicant inbox gates.

| Field | Type | Sink |
|---|---|---|
| Accepting inbound submissions now? | bool | drives `open_boards` visibility + apply availability |
| Open boards (which divisions accept apps) | derived from Step 2 | `agencies.open_boards` |
| Required submission materials | multi-select: **digitals** (req), **measurements** (req), **comp card**, **book/portfolio**, **reel** (for talent boards), **social handles** | new col `agencies.submission_requirements` (JSON) — or per-board |
| Generate an **open call link** for the agency site/email? | action → creates link | `agency_open_call_links` (`open-call.js`) |
| **Minors branch** (if a Kids/Teens board or a sub-18 age band exists) | acknowledgment + handling | ties to `minor_agency_consents`; see §5 |

The open-call link is the single most useful thing a real agency can leave with —
it routes their existing "Become a model / Apply" funnel through Pholio and is
quota-exempt for talent (`tasks/agency-open-call-design.md`). Surfacing it at setup
is high-leverage.

Terminology: **"Open call"** / **"invited submission"** (never "referral code" or
"promo link" — see open-call design doc §0). **"Digitals,"** not "casual photos."

### Step 5 — Team & board ownership

Keep the existing provisioned-login invite (agencies don't self-serve seats;
`agency_memberships` RBAC — `migrations/20260607120000_agency_rbac.js`), but add the
industry-real dimension: **which board(s) each member sits on.**

| Field | Type | Sink |
|---|---|---|
| Invite provisioned login | email | `agency_memberships` |
| Membership role | OWNER/ADMIN/MEMBER | existing |
| Booker role (optional) | enum: scout · booker · head booker · development · accounting | new col on membership or profile |
| Boards this person owns | multi-select of Step 2 boards | board ownership join (new) or existing board assignment |

Board ownership makes the roster/casting surfaces route work to the right booker on
day one instead of everyone seeing everything.

### Step 6 — Brand & workspace defaults

Unchanged from today, moved last: logo, `agency_brand_color`,
`notify_new_applications`, `notify_status_changes`, `default_view`. These are
genuine niceties — just not the first impression of an operating tool.

### Step 7 — Review / launch

Replace the vanity checklist with an **operational readiness** summary:
boards created, open boards, specs set per board, inbound state, open-call link,
team + board coverage. "Suggested next moves" should point at real work (create
your first casting brief, import current roster), not "upload a logo."

---

## 4. Field → sink summary (what to add vs. reuse)

**Reuse (exists, wire onboarding to write it):** `agencies.name/website/description/
logo_path/brand_color`, social handles, `min/max_height_*`, `min/max_age`,
`open_boards`, `notify_*`, `default_view`; `boards`, `board_requirements`,
`board_scoring_weights`; `match_criteria` (agency scope); `agency_memberships`;
`agency_open_call_links`; `minor_agency_consents`.

**New columns/tables to add (small):**
- `agencies.agency_type` (enum), `agencies.markets` (JSON), `agencies.places_into`
  (JSON), `agencies.submission_requirements` (JSON), optional
  `agencies.default_commission_rate` (int, display-only).
- board ownership link + optional `booker_role` on membership.
- `agencies.onboarding_state` JSON if we want resumable multi-step progress (talent
  onboarding already has `onboarding_state_json` precedent —
  `migrations/20260201000000_add_onboarding_state_json.js`).

---

## 5. Edge cases that make or break credibility

- **Minors (P0).** Any board with a sub-18 band, or an explicit Kids/Teens board,
  must branch: guardian-consent handling acknowledgment, heightened privacy on
  measurements/full-length images, and *suppress* adult measurement prompts for
  age-banded kids. Do not treat a Kids board like a smaller adult board
  (`reference/standards.md` §7). Wire to existing `minor_agency_consents`.
- **Division divergence.** Curve, Petite, Kids, Mature, Commercial, Talent each need
  *different* required fields and different default ranges. A single global spec form
  is wrong. Drive required fields off board type (Step 3 pre-fill logic).
- **Units & market localization.** Store/display cm **and** in; shoe US/EU/UK;
  garment sizing localized. International agencies gate on cm.
- **Mother-agency / placement / splits.** If `agency_type = mother/boutique`, expose
  markets-placed-into and (deferred) split defaults. Don't model the agency as a silo
  owning talent exclusively (`reference/standards.md` §1).
- **"Kept on file" is real.** Nothing in onboarding should imply inbound is binary
  accept/reject; the inbox already supports soft outcomes — onboarding copy should
  match (`reference/lifecycle.md`).
- **No payments.** Pholio has no billing/rate system (`casting_briefs` omits budget
  on purpose). Do **not** ask for banking, rate cards, or invoicing. A single
  optional **commission rate** as a display default is the only money field that's
  safe, and even that is defer-able.
- **Empty first state.** After onboarding the roster is still empty of talent.
  End with an explicit next move: create a casting brief and/or import/scout roster
  — don't drop them onto a blank Discover with no context.

---

## 6. Get-right-now vs. safe-to-defer

**Must be real in v1 (or the setup is generic):**
- Boards/divisions selection → real `boards` rows (Step 2).
- Per-board casting standards with division-aware pre-fills + dual units, written to
  `board_requirements` + `board_scoring_weights`, rolled up to agency requirement
  columns + a `match_criteria` agency-scope baseline (Step 3).
- Home market(s) and agency type (Step 1).
- Inbound state + open-call link + required materials, with the **minors branch**
  (Step 4).
- Board ownership per team member (Step 5).

**Safe to simplify / defer:**
- Interaction weights / full importance matrix (start with the 0–5 sliders only;
  interactions can learn via `preference-learner.js`).
- Commission rate / any money field (only add if commission tracking ships).
- Placement/split configuration UI (capture the boolean now, detailed splits later).
- Resumable multi-step state (`onboarding_state` JSON) if it adds scope; a linear
  save-per-step (as today) is acceptable for v1.
- Per-board (vs. per-agency) submission requirements — agency-level list is fine to
  start.

---

## 7. What NOT to ask (anti-patterns)

- No "agency category/tag," no "cover letter," no "job application" framing — use
  **boards**, **open call**, **submission**.
- No status-badge / chip UI for accepting-state or board state (banned UI —
  `AGENTS.md`, agency `CLAUDE.md`); use plain text / tints.
- No banking, tax, or rate-card collection (no payments system).
- No single global height/age spec presented as universal — it silently excludes
  Curve/Petite/Kids/Commercial, i.e. most of the market.
- No hard validation that rejects out-of-range specs; ranges contextualize, they
  don't gate the agency's own configuration.
```
