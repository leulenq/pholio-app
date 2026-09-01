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
