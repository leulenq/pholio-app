# Submission Review redesign — "The Review Room", rebuilt from first principles

Surface: the individual-submission review experience inside `/dashboard/agency/submissions`
(the full-screen room opened from the queue). The TalentFullView dossier is out of scope.

## Research verdicts driving the design

1. **Review is two-tempo.** First pass = 4–30 seconds on digitals + stats (agency scouts, casting
   CDs, photo culling all converge here); deep look = minutes on the record. No product ships both
   modes; the current room is a middling compromise (data-sheet with small images).
2. **Media + stats are consumed together, first.** The screen should lead with a full-height
   digitals stage and an identity/figures column, not a document.
3. **The verdict set must match the industry lifecycle** — pass (with structured reason),
   kept on file (soft yes, the "maybe drawer"), request digitals, invite to meet, development
   offer, offer representation, shortlist. All statuses already exist server-side.
4. **One keystroke per verdict, auto-advance** (Photo Mechanic / Lightroom Caps-Lock; Ashby
   preset-reject). Friction on "pass" is why queues rot; friction on "maybe" is why deferral wins.
5. **Decisions must leave institutional memory** — structured pass reasons, notes that persist
   (today the pass note is silently discarded — bug), tags, activity timeline.
6. **Psychology mitigations:** session tally (fights quota illusion), auto-advance (fights
   deferral), undo (fights mis-key anxiety that causes deferral), standardized slot order
   (fights first-photo anchoring), provenance/freshness at the decision point.
7. **Trust signals at the decision moment:** identity verified/disputed, duplicate hint,
   measurement staleness, digitals freshness, minor handling.

## Anchors (owner-set)

- Keep the persistent bottom decision bar; refine its execution.
- Header adopts the talent /apply workspace header system (`.apply-workspace-top` vocabulary:
  3-col grid, wordmark-exit left, tracked-caps context center, mono ledger right, gold gradient
  hairline). The room already speaks the /apply register (`Noto Serif Display` + `JetBrains Mono`
  + cream/ink/gold) — this formalizes it. Agency bans still apply (no badges/chips/eyebrows).

## The design — a two-tempo screening room

Vertical composition, portal full-screen (kept), now URL-synced (`?review=<id>`):

1. **Top chrome** — /apply workspace header adaptation (~64–84px): PHOLIO wordmark (exit) ·
   center scope ("Reviewing" + Submissions/event name) · right mono queue ledger
   (position/undecided + session decided), pager chevrons, close.
2. **The stage** (fills first viewport): left = five-slot digitals filmstrip at maximum size
   (slot-ordered, missing slots as labeled empty frames, unplaced strip below, freshness line);
   right = identity column (serif name, fact line incl. Minor, figures block with dual-unit
   height + measurements, provenance ledger, quick links, "The record ↓" cue).
3. **The record** (below the fold, scrolls): full frame set incl. extras · full measurements
   ledger · fit & provenance · house record (tags editable, notes read/compose, activity
   timeline) · bio.
4. **The verdict bar** (persistent footer, ink-deep, gold hairline): three states —
   - resting: soft verbs (Keep on file · F, Request digitals · D, Invite to meet · M) +
     primary verbs (Pass · X, Shortlist · S, Offer · A gold);
   - arming (inline, no modal): pass → reason presets (last-used default, localStorage) +
     optional note + Enter confirms / X-X fast-confirm; offer → representation (default) or
     development offer, Enter confirms;
   - decided: outcome + Reopen (U) + "arrows to keep moving".
5. **Note composer** (N): slide-up above the bar; Enter saves via POST notes; Esc closes.
6. **Undo:** every decisive toast carries Undo (PATCH back to prior status). Reopen for
   decided rows revisited later.

Escape unwinds: lightbox → note composer → arming → room.
Instant verbs (no arming): shortlist, keep on file, request digitals, meeting. Board filing
after shortlist stays available in the bar ("File to board" appears once shortlisted).

## Implementation checklist

- [ ] Server: `/api/agency/applications/:id/details` adds `digitalsFreshness`
      (mirror dossier: live image rows when profile exists, identity images otherwise).
- [ ] ApplicantsPage wiring: meeting/development/reopen mutations, decline note persisted via
      `createNote`, session tally, URL sync (`useSearchParams`, back closes), undo toasts,
      `actionLabels` passed through.
- [ ] Rebuild `ReviewRoom.jsx` + rewrite `ReviewRoom.css` (stage/record/verdict architecture,
      /apply header, inline arming, note composer, tags editor, notes, timeline).
- [ ] Retire `DecisionConfirmation` (inline arming replaces it); keep `DeclineReasonFields`
      for the list-side modal.
- [ ] Update `ShortcutHelp` with the new key map.
- [ ] Update review tests; run `npm test -- <review tests>` + client eslint + build.
- [ ] Browser verification (Puppeteer, AUTH_PASSTHROUGH): states = adult default, minor,
      missing digitals, decided, long name, event call; viewports 1440/1180/900/600/390.
      Iterate on what is actually seen.

## Deferred (named, deliberate)

- Board-overlap strip / roster context (real capability; needs board composition UX — separate cycle).
- Sealed second opinions (team parallel review) — capability exists in RBAC but the workflow is a cycle of its own.
- Kept-on-file auto-resurfacing (needs scheduler); video assets in review (no data path in image DTOs yet).

---

# Spec Pack coverage — the six selected agencies that had no series

Closed 2026-08-29. `docs/pholio-strategic-analysis-2026-08.md` §7 wants 40-60
hand-verified agencies; the pack shipped with six routes while the 2026-08-19
rebuild (`docs/spec-registry-rebuild-2026-08/`) had already researched eleven
entries from the live forms. Six of them had no registry series at all, so the
export and preflight machinery had nothing to point at for the agencies the
launch cohort was selected around.

- [x] Author six revisions from the rebuild research, into the live v1 schema:
      `state:online`, `q-management:online`, `one-management:online`,
      `jag:online`, `curv:online`, `bicoastal:online`. Pack is 6 -> 12 series.
- [x] Series ids match the ones `agencyBriefs.js` already predicted
      (`<entry id>:online`), so wiring the authored copy was a one-line change
      per entry rather than a rewrite. Ten of the eleven entries now resolve.
- [x] `shot.frame` gains `three_quarter_length` — Q and State both publish a
      3/4 slot and the vocabulary had no word for it.
- [x] Six NY DOL verifications added, each byte-checked against the in-repo
      registry snapshot by the trust validator. `agencyId` stays null: these are
      reference entries, and hand-inserting `agencies` rows is the operation
      that produced the eight duplicates scoped below.
- [x] Tests: 223 spec-registry, 14 trust-registry, 738 client, lint clean. Two
      tests that pinned the pack's size or its single observation date now
      assert the invariant instead.

What was left out, deliberately:

- **State's Snapcast channel.** A real second channel with different formats, a
  3MB cap, an account step and the platform's own perpetual likeness licence.
  v1 holds one channel per revision, and a second series would inherit a brief
  written for the first. The authored brief already sets the two side by side.
- **Fashion Week Brooklyn.** Event casting, not representation; its series is
  still prospective.
- **Ford's r2 — done 2026-08-29.** `ford-models:selected-city-online@2` moves
  the series off the Snapcast form, which fordmodels.com mounts for Paris only:
  the canonical route for New York, Chicago, LA, Miami and Barcelona is one
  shared selectroom.app form. Two required slots and two not, JPEG and PNG, and
  no published size cap — the 3MB the series carried was Paris's. The authored
  brief had already been written from this research, so the correction closed a
  gap between the copy and the registry rather than opening one; one sentence of
  that copy listed a shoe-size field the form does not have, and is fixed.
  Paris is not published: its accept string was never captured.
  Elite, Wilhelmina and Muse are still on 2026-08-09 revisions and superseded by
  the same research, without a wrong-channel defect. Three r2s remain.
- **Slot labels are what exported files are named after.** State's read
  "UPLOAD CLOSE-UP *" and CURV's was a whole instruction sentence; both now
  carry the shot name, and required-marker asterisks are out of slot labels
  since `modality` states requiredness. Two older entries still have this —
  IMG ("Upload Head Shot") and The Society ("Please submit a close-up").
- **IMG and The Society** stay published though `SELECTION.md` dropped them from
  the launch ten. Delisting is a product call; nothing was removed.
- Facts the v1 schema cannot hold (ONE's video-link fields, per-channel legal
  regimes, conditional visibility, honeypots, Bicoastal's gender-selector
  defect, ethnicity/website fields) are written into each revision's
  `review.notes` so they survive into the `MODEL.md` schema when it lands.

---

# Product language audit — pholio-app (2026-08-29)

Full findings: `docs/audits/product-language-audit-2026-08.md`

## Plan
- [x] Load `.claude/skills/pholio-app-language` as the authority (SKILL + 8 references)
- [x] Map the full user-facing string surface (client SPA, EJS, backend, emails, PDF, export bundle)
- [x] Run 7 disjoint read-only review lanes with an independent lead sweep
- [x] Trace every Level 6 claim into server code before accepting it
- [x] Reject claims that did not survive verification
- [x] Deliver the audit

## Review

Read-only audit. No product code changed; the only files added are the audit
record and this entry.

**Deepest level found:** Level 6 (product truth), in every lane.
**Compliance findings:** 8. Two lead — guardian consent has no refusal control
(`views/guardian-consent.ejs:106-115`), and a paying talent's public portfolio
renders a `Studio+` badge and a different layout, so payment visibly changes
what a booker sees (`src/routes/portfolio.js:473`).

**The owner's standing priority (knows vs infers)** was the most productive
lens. Largest cluster: `Under Review` asserting agency activity that the
product's own constants define as *not yet acted on*; a page view relabelled
`showed repeat interest`; field completeness sold as `"matches what bookers
look for when shortlisting"`; every applicant labelled `Editorial` from a
column that was dropped; `Top matches today` over an unranked list.

**Three system-wide decisions** (no per-instance fix exists): seven error
registers rather than the two on record; six names for the book plus five
further naming families; 396 em-dashes in user-facing strings.

**Verification mattered.** One lane reported the mock social-OAuth route as a
production exposure. It is not: the mount is wrapped in `isDevelopmentRuntime()`,
a fail-closed allowlist. Reported as a correction rather than a finding.

**The skill's own inventory has drifted** and should be updated: §6.9 (event
consent copy is now reachable and parity-tested, defect resolved), §6.4 (two
error registers recorded, seven found), §6.1 (four names recorded, six found).
The `industry` glossary lists "getting scouted" as a correct term while
`banned-language` §2 forbids it; that row needs a compliance pointer.

**Preserved and named** so a cleanup pass does not sand them off:
`decline-reasons.js`, `DigitalsFreshness.jsx`, the off-Pholio `HandoffScene`,
Intel's `Withheld`/`NotYet`, the magic-link family, and the submission-decision
email register.

---

# Industry alignment audit — pholio-app (2026-08-29)

Full findings: `docs/audits/industry-alignment-audit-2026-08.md`

## Plan
- [x] Load `.claude/skills/industry` as the authority; read as the Booker
- [x] Inventory 228 migrations and ~110 tables, then re-check for drops
- [x] Four domain lanes: representation/roster; booking/casting/calendar; materials/stats; minors/rights/money
- [x] Verify every absence against migrations and routers before calling it a gap
- [x] Verify every P0 by hand; record claims that failed verification
- [x] Deliver

## Review

Read-only. No product code changed.

**Verdict:** the industry model is unusually good and much of it is not connected
to anything. Failures are almost all one shape: a correct model with no write
path, or a correct model the surface a user reads never consults.

**Four P0s, all small diffs:**
1. Every comp card prints "Direct Bookings" over the model's phone.
   `partner_agency_id` is never written; `talent_representations` is never read
   by the PDF path.
2. A talent who declares "unavailable" is shown to agencies as "Available"
   (`statusConfig.js:103` falls back to the most optimistic state).
3. Two independent paths print a minor's bust/waist/hips (stale `profiles.age`
   beating DOB; the digitals sheet having no kids branch, on an unauthenticated
   route).
4. The talent-facing shoe converter computes EU as `US x 2 + 31`, so US 9 shows
   as EU 49 while the comp card correctly shows EU 40.

**Structural:** the booking desk's removal is half-done. The product plan
excludes options and calendars by design; August dropped `casting_briefs` and
left `talent_commitments` plus its read path, view model and UI vocabulary. Fix
is to finish the removal, not to build.

**Two corrections to my own findings** (both recorded in the audit): I reported
`commissions` as a vestigial table when it had already been dropped in July (my
table inventory came from `createTable` greps and over-reports), and I first
framed the booking desk as forgotten rather than deliberately removed, which
would have produced exactly the wrong recommendation.

**Four governing-document conflicts** need one owner decision each, including
"Go-See Requested" — the trade word used backwards, which the language skill
records as canon and which only this lens catches.


# Pholio ID — Apple Wallet pass redesign (2026-09-03)

Surface: `GET /api/talent/wallet/pass` and the `.pkpass` it issues. Ground truth:
Apple HIG "Wallet" (rev. June 8 2026), WalletPasses docs, WWDC26 session 209.

## Verdicts that drive the design
1. Two faces in one bundle. iOS 27+ renders `posterGeneric` (full-bleed
   358×448pt artwork, 30pt primary logo, header, title, one footer field, QR);
   iOS 26 and earlier fall back to `generic` (flat field, 160×50 logo, square
   90pt thumbnail, header, primary, ≤4 secondary+auxiliary, QR).
2. The photograph is the pass. Everything else is the minimum a booker needs
   at a glance: name, height (stack-visible header), who books them, the QR
   to the live book. Stats live on the details sheet in dual units.
3. Two themes, one material: Ink (default) and Paper. Both pass WCAG AA on
   labels; the veils baked into the artwork guarantee text contrast whatever
   the photo.
4. Reuse, never reimplement: comp-card stats block (order, units, kids rules),
   photo-intelligence hero ranking, forensics focal crop, short portfolio URL,
   minor/guardian gating.
5. passkit-generator strips unknown keys (`stripUnknown: true`) so it cannot
   emit `posterGeneric`; the bundle (manifest, PKCS#7, zip) is owned in-repo.

## Checklist
- [x] Research Apple constraints (HIG June 2026, WalletPasses, WWDC26)
- [x] `pass-content.js`: pure profile → pass.json content model (both styles, themes, edge cases)
- [x] `pass-artwork.js`: artwork / thumbnail / icon / logo / primaryLogo renderers from brand assets
- [x] `pass-bundle.js`: manifest + detached PKCS#7 + zip
- [x] `pass-builder.js` + `face-locator.js` + route: hero selection, face location, theme param, guardian gating
- [x] Tests: content, artwork, bundle (self-signed round trip), builder, face locator, route
- [x] Preview rig: realistic fixtures × themes × styles → PNG review sheet
- [x] Spec doc rewrite (`docs/wallet/apple-wallet-spec.md`), stale prototype removed
- [x] Review section below

## Review
- Shipped: both Wallet faces (`posterGeneric` for iOS 27+, `generic` for iOS 26
  and earlier) in one signed bundle; Ink and Paper themes; artwork, thumbnail,
  icon, logo and primary logo rendered from the brand lockup and the hero
  photo; details sheet carrying the comp-card stats block.
- Found and fixed on the way: libvips reports attention coordinates in its
  shrink-on-load space for JPEG input, so `computeFocalPoint` (crop engine)
  and the forensics focal clamped to (1, 1) on real photos. Both now probe a
  re-encoded PNG. Existing crop-engine/forensics suites unchanged and green.
- Dependency change: `passkit-generator` removed (strips `posterGeneric`);
  `node-forge` + `do-not-zip` added as direct dependencies.
- Not built (named in the spec): Apple update web service, dashboard preview
  module, share links, on-device verification of the poster strip geometry.
- Validation: 75 tests across wallet + touched pdf suites; 10 preview cases
  (5 fixtures × 2 themes) in `docs/wallet/previews/`.
