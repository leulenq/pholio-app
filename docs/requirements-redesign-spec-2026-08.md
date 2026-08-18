# Requirements experience redesign — spec (owner quality pass, 2026-08-15)

**Status:** APPROVED lead design. Supersedes the b2e4cd6 matrix-first ledger.
**Authority:** owner directive (2026-08-15 quality pass) + `docs/spec-correct-export-brief.md`
(the per-agency lede-first target shape) + strategic analysis §7. Audit evidence: the
requirements-UX audit agent report (facts restated here where load-bearing).

## The product sentence
A talent looks at this surface and immediately knows: **which agencies their current set
already satisfies, what one more shot or fact would unlock, and — per agency — exactly
what is missing and how to submit.** Spec facts, never judgment. No raw registry strings.

## R-A. Placement (IA ruling)
- Route stays `/dashboard/talent/applications/requirements` (continuity, gate-exempt).
- The Market nav item stays profile-gated (it is the application workspace).
- New ungated entrances: the Overview open-calls card link (shipped) **plus** a quiet
  link on the Overview "Submission Readiness" card — "What agencies ask for →". The
  talent who most needs this page (incomplete profile, deciding what to shoot) reaches
  it before the gate. ApplicationsView's existing link stays for the post-gate path.

## R-B. Page structure (replaces matrix-first)

1. **Masthead** (keep serif title + provenance) + one talent-level summary line computed
   from real counts: "Your set covers ⟨X⟩ of ⟨Y⟩ published shots across ⟨Z⟩ agencies."
   (readSummary/shotCoverage are currently dead code — use them.)
2. **The recommendation, with honest semantics.** The current "unlocks" counts every
   agency missing that shot; a talent who shoots it finds zero agencies flipped. New
   copy separates the two truths: "One ⟨Headshot⟩ would complete your set for ⟨Muse⟩
   and ⟨Q Management⟩ — and ⟨3⟩ more agencies ask for it." (completes = agencies where
   it is the only missing shot; asked-for = the rest.)
3. **Market list, two-pane** (Settings movements idiom; kills the horizontal-scroll
   table entirely — no `<table>` anywhere; Intel's README forbids the values-table twin
   and RangeMatrix is the house pattern):
   - Left rail: one row per agency — name (Inter, NOT serif-in-button; full row width so
     names never wrap mid-word), market label, compact coverage figure ("4 of 6"), and
     inline plain text "Applies on their site" / "Accepts Pholio submissions".
     Agencies publishing no shot list (Wilhelmina, Elite Japan) say "No shot list
     published — form details only", never a fake 0-of-0.
   - Right pane: the agency detail (R-C). Mobile: stacked accordion.
   - Selection marker: background well + straight 2px gold underline (radius already
     reset). No half-measures, no chips.
4. **Shot coverage strip** (the matrix inverted, bounded, image-first): one row per
   canonical shot across the market — thumbnail of the talent's own covering image when
   `finding.assignments` names one (DigitalsContactSheet feel), else an empty frame —
   with "in your set / still needed" + "asked for by N agencies". Shots are ~8 rows;
   agencies are counts, not 25 columns. This is the only cross-agency comparison view.
5. **This-week strip + verification + call windows**: keep Lane B's content, restyled
   into the new layout.

## R-C. Per-agency detail (replaces the four confidence buckets)

Header: agency name (serif — it's a heading now, not a button), market, verification
line, call-window line, "Verified on ⟨date⟩" provenance.

Lede (the direction-doc shape, verbatim pattern):
> Your current set covers **4 of 6**.
> Missing: Close-up profile · Personality shot

Then sections **by category, not by confidence** (`categoryKey` is shipped and currently
discarded):
- **Shots** — the agency's slot list with per-slot state and thumbnails via
  `assignments`. Canonical label primary; the agency's own wording as Marginalia
  (mono, small — Intel idiom) only when it meaningfully differs.
- **Set rules** — the setWide shoot instructions (no makeup, no filters, plain
  backdrop…), elevated from collapsed "Guidance": these are the instructions a talent
  acts on at the shoot. Plain list, modality spoken honestly ("required" vs "they
  prefer").
- **Files** — caps and formats as one useful sentence: "Their form takes JPEG or PNG up
  to 5MB — we convert and resize on export." (uses actual/minimum/maximum).
- **Eligibility** — the mirror, gently, with the talent's own numbers:
  "Their published height range starts at 173 cm — you're within it." Never judgment.
- **Their form asks for** — application fields as ONE compact prose list ("Name, email,
  Instagram, height, …"), never 22 rows. Unverifiable fields get ONE group sentence:
  "Pholio can't check these from your profile — have them ready." (Kills the 33
  repeated "Pholio cannot verify this" rows; per-row guidance is a rendering choice,
  not a server obligation.)
- **Not published** — one sentence: "⟨Agency⟩ doesn't publish file limits or shot
  dimensions." (from `unknownFacts`, grouped)

Every finding's `target` action renders (Open the book / Open profile) — the page whose
purpose is "what do I do next" currently drops them.

Footer: Export conforming set (PholioButton primary) · outbound link + registry-verified
qualifier · tracker prompt (shipped) · the non-affiliation line (keep verbatim).

## R-D. One vocabulary
Three states, everywhere, from spec-marks' words: **"In your set" / "Still needed" /
"Not asked for"**. Kill "Attention/Confirm/Guidance/Included", "Covered", "matched",
"Still needed by N". RegistryPreflight (apply workspace) adopts the same copy map and
canonical labels through the shared lib — same marks, same words, well shape unchanged.

## R-E. Presentation-layer label discipline (owner rule: backend vocabulary never leaks)
- Server: the routes/preflight response gains a `labels` map resolved from
  `data/spec-registry/v1/taxonomy.json` (field/value → label + description). Additive.
- Client: one resolver — `labelFor(field, matchValue)` → taxonomy label →
  `frameTaxonomy.labelForShot` fallback → Title Case as last resort. `preferredLabel`
  (shortest-raw-string-wins) is deleted. `sourceLabel` is Marginalia only.

## R-F. Server correctness fixes (Lane Q1, before the client lane)
1. **Compound-slot key**: `matcher.js` gives `match:{all:[…]}` results a stable
   identity (slot id as the key; expose `matchValues[]`), so Elite's 6 shots all reach
   the client and the grid/plate never contradict each other. Additive to the DTO;
   snapshot compatibility preserved (frozen snapshots keep their recorded shape).
2. **Taxonomy labels** in the DTO (R-E).
3. Honest-recommendation inputs are client-computable from findings; no server change.

## R-G. Design-language bindings (from the reference surfaces)
- Coverage figures use the Intel Finding lockup (figure → hairline rule → qualifier),
  Inter 200 for numerals; serif only for agency names/headings; never serif in a control.
- Motion: one spring (55/16) on pane change; no AnimatePresence mode="wait" double-fade.
- Keyboard/touch: rail rows are real buttons in a listbox pattern (roving tabindex);
  no hover-only information anywhere (Intel rule).
- No badges, chips, dots, eyebrows, tables, gradient text, glass. Status is words.
- Warm ink scale + one gold accent; `#B08D45` for gold-on-white text.

## Lanes (after Q1: Q2 ∥ Q3 ∥ Q4; workers never commit, never stash)
- **Q1 · server**: matcher compound keys + taxonomy labels DTO + tests. Owns
  src/domains/spec-registry/{matcher.js,preflight-service.js}, taxonomy route bits,
  server tests.
- **Q2 · requirements client**: this spec. Owns RequirementsPage/**, specRegistry.js,
  RegistryPreflight.*, spec-marks.*, requirements tests. Keeps Lane B's data content
  (verification/windows/tracker prompt) in the new layout.
- **Q3 · readiness restoration**: per the restoration-map agent report (numeral stays,
  origin/main design back, keep isCurrent fix + unrelated Overview work, define
  .statusGold, #B08D45 numeral, 4 test files rewritten/deleted). Owns
  ProfileReadinessSidebar.*, profileScoring.js, profile-strength.js (getStrengthUI
  restore), useProfileStrength hook, OverviewPage readiness card, their tests.
- **Q4 · age-verification FE pass**: state-differentiated panel (Danger-Zone-calibre
  treatment, not louder), typographic "Powered by Stripe" lockup with real visual
  weight (no hand-drawn logo — official SVG only if fetched from Stripe's own brand
  page, else typographic), section description prop, DATA_STORY presented scannably.
  Owns VerifiedAdultSection.*, ageVerificationState.js, their tests.
- **Lead verification**: run the app + Playwright screenshots of every touched surface
  (incl. the import overlay live-repro) against origin/main references before reporting.

## Flag to owner (root causes, per the directive)
- `client/src/styles/global.css:153-164` (button reset: 999px radius + padding) is the
  malformed-border root cause; :192-213 (8px-radius form inputs) is a latent foreign
  style for talent editorial fields; the generic gold focus ring invites inconsistent
  rings. Proposal: scope the button reset to marketing-era `.button` classes only (or
  add the lint rule "border:0 + border-side ⇒ set border-radius"), and decide whether
  talent surfaces should opt out of the canonical-input rule wholesale.
