# Intel — Factual Analytics Spec (v3, 2026-08-09)

This revision supersedes any v2 language below that infers intent, audience
identity, quality, demand, causality, or career momentum from behavioral events.
Intel reports observable first-party activity and submission outcomes only.

The talent-facing intelligence hub, designed from a blank slate. The old
analytics page is not a reference, and neither is its data plumbing: this spec
designs the ideal instrument first, then defines the capture pipeline that
feeds it. Premium data visualization is a requirement of the product, not a
skin — every zone below is a named, bespoke visual instrument with a defined
rendering and a defined meaning.

---

## 1. The frame (the Booker's reframe)

A working model never asks their booker for pageviews. They ask:

1. **"What happened around my profile?"** — visits, shared-link opens and card pulls.
2. **"What happened after I submitted?"** — recorded reads and status changes.
3. **"Are my materials current?"** — capture dates and package readiness.
4. **"Which frames were opened?"** — impressions and opens, without a quality claim.

Generic SaaS metrics (sessions, bounce, retention cohorts, invented
"engagement scores") answer none of these and instantly read as fake to
anyone from the industry. Every number on this page must pass one test:
**would a booker mention it to their talent across the desk?**

### Recorded event types
Event types are shown separately. Their order or color never implies viewer
quality, purchasing intent, or likelihood of an outcome:

| Tier | Signal |
|---|---|
| 1 | A booker reviewed your submission |
| 2 | A submission advanced (shortlisted / requested more / meeting) |
| 3 | Your comp card was pulled or your shared link was opened |
| 4 | A public or shared-link profile visit |
| 5 | An image impression or open |

---

## 2. The ideal signal model (design target — capture follows)

This is the data the page is designed around. Some of it exists, most of it
must be captured; §6 sequences that. The design does not bend to today's
tables.

- **Request context.** Every portfolio/profile view resolved to a known context:
  class: `agency` (authenticated agency user, or arrival via a submission),
  `shared` (arrival via a shared package link; recipient identity unknown),
  `public` (social, search, direct), `self` (excluded). A shared token never
  proves the visitor is the named recipient, a client, or casting.
- **Image-level activity.** Per-image impressions and lightbox opens. Dwell is
  not used as a proxy for interest or quality.
- **Market resolution.** Attention resolved to industry markets (NYC, LA,
  Paris, Milan, London, Tokyo, home region) — the industry thinks in markets
  and stays, not in "countries."
- **Pipeline timing.** The full submission status machine with per-stage
  timestamps: conversion per stage, latency per stage, outcome mix, and the
  talent's own response time to `requested_more`.
- **Card & link lifecycle.** Card generations and pulls by version/theme;
  per-recipient share tokens: opened, re-opened days later (re-opens are
  filing behavior — a strong tell), forwarded.
- **Discovery activity.** Authenticated agency profile opens may be counted in
  aggregate. Search-result impressions are not presented as demand.
- **Materials currency.** Dated digitals, dated (versioned) measurements, comp
  card version vs latest photo/stat change — judged against real industry
  windows (digitals ≤ 3 months; stats reconfirmed ≤ 90 days).
- **Cohort benchmarks.** Anonymized percentile bands by division × market ×
  experience tier, so a trend line can answer "is this good?" honestly.
- **Self events.** The talent's own actions (new digitals, card regenerated,
  submitted to X) as annotations — trend changes must have visible causes.

---

## 3. The instruments (page architecture)

Seven zones, ordered by the signal hierarchy. Each instrument is bespoke —
drawn, not dropped in from a chart library. Visual language in §5.

### Zone 1 — The Pulse
The one-glance answer, composed as an editorial statement, not a KPI row.
- **Headline sentence**, generated from data: "Two agencies reviewed your
  materials this week, and your card was pulled four times — most of it from
  Paris." Animated count-up numerals inside serif copy.
- **Signal Spectrum** — the signature instrument. A single horizontal band
  showing the *composition* of this period's attention across the five tiers,
  segments animating in by weight. It replaces every fake "score": instead of
  one invented number, the talent sees the quality mix of their attention and
  watches it shift toward Tier 1–3 as their materials improve.
- **In Motion ticker** — open submissions in advancing states, the most urgent
  named: "Wilhelmina requested more digitals — 3 days ago. Respond today."
- **Materials verdict** — one word, *Current / Aging / Stale*, linked to Zone 6.
- Period control: 30 / 90 days (free tier: 7).

### Zone 2 — The Seismograph (attention over time)
A tall, layered, scrubbable time-field — the page's centerpiece chart.
- **Base layer:** qualified visits as a soft area (ink wash).
- **Strike layer:** card pulls and link opens as vertical ticks — discrete
  strikes, because they are discrete intent events, not a smoothed line.
- **Event layer:** agency reviews and submission advances as marked glyphs
  sitting above the field.
- **Ghost layer:** prior period as a faint offset line.
- **Annotation layer:** the talent's own actions as baseline markers, so a
  spike traces visibly to "new digitals uploaded."
- Scrubbing collapses the day under the cursor into a micro-ledger (who
  classes, what actions). Draw-on entrance tied to scroll.

Beneath it, the **Rhythm Field**: a 7×24 heat grid of *when* attention
arrives (day × hour). Genuinely actionable — it tells talent when to share,
post, and follow up.

### Zone 3 — The Market Board (where attention comes from)
Geography rendered the way the industry thinks: **markets**, not countries.
- A ranked market ledger — NYC, Paris, Milan, home region — each row with a
  sparkline, share of attention, delta arrow, and viewer-class mix.
- Above it, a minimal **arc map**: a dark, elegant world projection with
  glowing market nodes sized by attention and arcs converging on the talent's
  base. Premium, quiet, no cartoon choropleth.
- Industry framing in the copy: sustained attention from a market is a
  placement signal ("Paris agencies keep returning — talk to your mother
  agent about a Paris stay").
- Source narrative (Instagram, direct link, search, agency inbound) folds in
  here as a ranked list with one sentence of meaning per source — never a
  donut chart.

### Zone 4 — The Pipeline (submissions intelligence)
The funnel the model actually lives, drawn as a **flow instrument**
(sankey-style): submissions enter left, streams split through *reviewed →
shortlisted / requested more / meeting* and settle into outcomes —
*development, signed/booked, kept on file, passed, withdrawn*. Stream
thickness = count; period and lifetime toggles.
- **Automatic diagnosis** written under the flow: opened-but-never-advanced →
  materials problem (routes to Zone 6); never-opened → targeting/volume
  problem; advancing-but-stalling → follow-through.
- **Stage Clock** — a dot-plot of time-in-stage: your median review latency
  drawn against the platform-typical band, setting honest expectations
  (agencies are slow; silence ≠ rejection).
- **Kept on file framed correctly** — the most common real outcome and a soft
  yes: "On file at 4 agencies. Boards reopen; files get pulled."
- Rows link into the existing applications ledger; Intel summarizes the
  pattern, it doesn't duplicate the ledger.

### Zone 5 — The Book, Ranked (image intelligence)
The most talent-native visualization possible: **the photography is the
chart.** The talent's actual book laid out as a grid, each frame carrying a
quiet data layer:
- Attention rank and dwell bar per image.
- Attribution flags: "your most-opened frame," "on screen when cards were
  pulled," "most-skipped."
- **Lead Image Test:** which frame, when first, holds visitors longest —
  evidence for choosing the card front and portfolio opener.
- Feeds the comp card composition engine — the strongest frames should be on
  the card, and now there's data to say so.

### Zone 6 — The Agency Lens (materials desk)
Your profile read through a booker's eyes — the improvement engine.
- **Currency Rings:** each material rendered as a depleting ring timed to its
  real industry window — digitals on a 12-week ring, measurements on a
  90-day ring, card version pegged to the latest photo/stat change. A ring
  running low *is* the insight; motion makes it felt.
- **Range read:** does the book contain what a booker scans for — clean
  headshot, full-length, profile, range — flagged with the industry reason.
- **Next Moves:** maximum three ranked actions, each = observation + industry
  reason + one act: "Your digitals are 14 weeks old. Agencies expect ≤ 3
  months — reshoot before your next submission." Ranked by expected effect on
  Tier 1–3 signal. This replaces completeness bars and horoscope tips.

### Zone 7 — Trajectory (am I trending?)
- **Momentum line** over 90 days — a composite drawn from Tier 1–4 events
  (composition always inspectable; never a hidden formula) — rendered against
  an **anonymized percentile band** of comparable talent (division × market ×
  experience tier): "you're in the upper band for new faces in your market."
- Annotated with self events, so the story reads causally: new digitals →
  attention shift → first shortlist.
- Benchmarks ship only when population size makes them honest — the band
  renders as "calibrating" until then (§4). Never faked.

### Low-data & calibrating states (first-class design)
Most new faces have thin data. Every instrument defines a designed
"calibrating" state — the same ink, the same craft, explicit about what it's
listening for ("The Seismograph is live. It marks its first strike when your
card is pulled.") — so a sparse page still feels premium and coaching, never
shaming.
- Below ~20 views or 2 submissions per period: suppress percentages (a +100%
  on n=2 is a lie), show raw counts, let Zones 4 and 6 carry the page.
- Trend deltas render only when the prior period has ≥ 10 events.

---

## 4. Privacy & ethics rules (non-negotiable)

- **No named read-receipts.** Never "Agency X viewed you 3× yesterday." A view
  ≠ interest; per-booker view logs create stalker dynamics and poison agency
  browsing. Agency attention appears **only in aggregate**. A named agency
  appears only on an explicit talent-facing action (status change, request,
  message) — which the status machine already communicates.
- **Minors:** no geo/viewer detail at all for under-18 profiles; Intel renders
  materials readiness + submission states only. Respects existing
  `profile_field_visibility` gating. An intel page must never become a reason
  a minor broadcasts harder.
- **Viewer counting integrity:** agency-authenticated sessions are excluded
  from "public reach" and counted in the agency aggregate — double-counting a
  booker as audience growth is fiction. Self-views excluded everywhere.
- **Benchmarks:** cohort bands only above a minimum population; no
  individually-identifying comparisons, ever.

---

## 5. Visual language

- **Talent design system** (`client/src/domains/talent/DESIGN.md`) — this is
  a talent surface; do not import agency-side idioms.
- **Bespoke instruments, generative from real data** — no chart-library look,
  no enumerated "template" variants (per house rule: parametric systems, not
  posters). D3 for scales/shapes where useful; rendering is hand-crafted
  SVG/canvas in the page's own ink.
- **Motion-first:** house spring physics (`stiffness: 55, damping: 16`),
  draw-on chart entrances, scroll-tied reveals, count-up numerals, scrub
  interactions. The page should feel like a living instrument panel, not a
  report.
- **Editorial typography:** serif headline statements composed from data
  (Zone 1) set the register; numerals and axes stay quiet.
- Visual execution runs through `impeccable` at build time.

## 6. Data & capture plan (serves the design)

The pipeline exists to feed the instruments above — not the other way around.

### Capture v2 — enriched event stream (build first)
A `profile_events` write path (superseding the thin `analytics` table)
recording per event: `viewer_class` (agency/client/public/self — resolved
from auth, submission linkage, and share token), `session_id`, `market`
(resolved server-side at write from IP via `shared/lib/geolocation.js`; store
market only, never raw precision), `image_id` + `dwell_ms` (from a lightweight
client beacon), `share_token`, `source/referrer`, `action`. Plus:
- **Share tokens** on portfolio/card links (per-recipient, open + re-open).
- **Discovery impressions** logged from agency-side search/scout.
- **Nightly aggregates** job: market rollups, image ranks, cohort benchmark
  bands, momentum composites — the page reads aggregates, not raw events.

### Already flowing (feeds instruments from day one)
Submission status machine + per-stage activity (`applications`,
`application_activities` incl. `profile_viewed` — aggregate only), card pulls
(`analytics` downloads), sessions/referrers, dated measurements, image dates
and labels, self-activity stream. Enough to light up the Pulse, Seismograph
(base+strike+annotation layers), Pipeline, Stage Clock, Agency Lens, and
Rhythm Field immediately while capture v2 accrues data for the Market Board,
The Book Ranked, and benchmark bands — whose calibrating states are designed,
not apologized for.

### Explicit kills from the old backend
`/analytics/insights` (fabricated multipliers), `/analytics/cohorts`
(website-operator metric), the `engagement.score` arithmetic
(`src/domains/talent/routes/analytics.js:430`). None of it migrates.

### Backend shape
New `src/domains/talent/routes/intel.js` — one composed `GET
/api/talent/intel` payload (pulse, seismograph, markets, pipeline, book,
lens, trajectory) + `GET /api/talent/intel/day/:date` for scrub detail.
Aggregation lives in `src/domains/talent/services/intel/`. Frontend:
`IntelPage/` at `client/src/domains/talent/pages/IntelPage/` — **flat intel2
zone components** (`PulseZone`, `PipelineFlow`, `AgencyLens`, …) per
`IntelPage/README.md`. **Not** the discarded `instruments/` rewrite.
`useIntel` React Query hook.

### Tier gating (existing 7d/90d pattern)
- **Free:** Pulse, Seismograph (7-day), Pipeline counts, Lens with 1 action.
- **Studio+:** 90-day windows, Market Board, The Book Ranked, Rhythm Field,
  full Lens, Trajectory + benchmarks, scrub detail, CSV export.

## 7. Terminology (label-ready)

Use: *comp card* (never "PDF"), *digitals*, *book*, *submission* (never "job
application"), *reviewed* (never "opened/read"), *shortlisted*, *kept on
file*, *requested more*, *meeting*, *booker/agency*, *market*.
Avoid: impressions, engagement score, bounce, sessions, retention, "boost."

## 8. Build order

1. **Capture v2** — `profile_events` write path with viewer_class + market +
   share tokens + image beacon; discovery-impression logging; aggregates job.
   Ship early so data accrues while the UI is built.
2. **Intel backend** — `intel.js` composed endpoint over aggregates + the
   already-flowing pipeline/materials data; kill legacy endpoints.
3. **Instruments** — Pulse + Signal Spectrum, Seismograph + Rhythm Field,
   Pipeline + Stage Clock, Agency Lens (all fully live day one); Market
   Board, The Book Ranked, Trajectory band mounted with designed calibrating
   states that come alive as capture v2 accrues.
4. **Benchmarks** — cohort aggregation last, gated on honest population size.

### Get right in v1 vs safe to defer
- **Must be real:** signal-hierarchy ordering; Signal Spectrum instead of any
  score; viewer-class integrity (self/agency exclusion from reach); pipeline
  with kept-on-file framing; Currency Rings on real dated materials; small-n
  honesty; minors branch; designed calibrating states.
- **Safe to defer:** arc-map rendering (ledger first), forwarding detection on
  share links, benchmark bands until population supports them. Never fake any
  of these in the interim.
