# Implementation state — strategic plan execution (session handoff doc)

**Branch:** `claude/pholio-strategic-analysis-dyducf` (all work lands here)
**Plan of record:** `docs/pholio-strategic-analysis-2026-08.md` (this branch) + user corrections below.
**Updated:** 2026-08-15

## User corrections to the plan (binding)
1. **Agency Discover page STAYS.** Talent discoverability toggle becomes FREE for all
   (opt-in, default off) — remove `is_pro` from `pool-status.js` gate. (If user objects,
   revert to pro-gated; they were told.)
2. **AI bio writer: improve + make FREE.** Do not remove. (Other writers: also un-gate
   from Studio+ for legal consistency — paid guidance is the NY FWA prong-(c) risk.)
3. **No agency back-office** (bookings/calendars/finance/invoicing/contracts/commissions/
   client mgmt/deal tracking). Event-casting ops for event tier OK. CSV/webhook export OK.
4. **Profile Readiness component:** unmerged branch work removed the numeric score — DO NOT
   keep that replacement. Redesign fresh, in Pholio's design language (numeric score's
   removal was the objection; overall component concept was decent).
5. **Spec Registry talent-side UI (Market + Apply Workspace):** rebuild the frontend fresh;
   do not build on top of the branch's implementation.
6. Talent frontend design references: the .md design docs PLUS live surfaces /media,
   /profile, Apply Workspace, Settings (strongest pages). New work must feel native.
7. Session continuity: if session/rate limit hits, continue after reset without nudging.
   Fresh session permitted when context becomes a liability — this file is the handoff.

## Branch audit (2026-08-15)
- `claude/pholio-product-plan-2026-gfl2y0` — **the big one.** = plan branch e6sees + 21 impl
  commits (through 2026-08-15): A2 compliance fixes ("what an agency sees independent of
  what talent pays"), A4 removals (booking desk, commissions, minor records, match scoring,
  interviews/reminders, agency market analytics, archetype AI), auto-close, agency
  requirements rebuild, spec-correct export, comp-card import (text/layout only),
  digitals freshness, Market grid. STATUS: under review (untrusted agent work).
- `claude/pholio-backend-audit-u4ar6t` — 3 commits: docs + adult-launch migration hook
  timeout. Review → likely cherry-pick.
- `claude/repo-contents-check-ifwjo8` — 5 commits: the two missing audit docs (+ BIPA
  feature revisions doc). Merge the docs into docs/audits/.
- `cursor/fix-settings-identity-name-da01` — 6 commits: settings danger-zone styling +
  contract test migrations fix. Review → decide (styling may violate design language).
- All other branches: ahead:0 (fully merged), ignore.

## Phase status
- [x] Phase 0a: branch inventory (above)
- [ ] Phase 0b: review gfl2y0 (backend correctness + tests; frontend inventory) — IN PROGRESS
- [ ] Phase 0c: review small branches
- [ ] Phase 1: merge gfl2y0 (+ cherry-picks) into this branch; fix review findings
- [ ] Phase 2: corrections wave — Discover free opt-in; bio writer free+improved (all
      writers un-gated); Profile Readiness redesign; Spec Registry UI rebuild (Market +
      Apply Workspace)
- [ ] Phase 3: remaining compliance/trust — flat anti-spam application limit (no tier
      lifts; verify gfl2y0 did it), full directory for free, seeded real agencies →
      reference entries w/ "prepare conforming application" CTA, event-casting consent
      fork, A5 defects (status machine, snapshot leak, blocked-agencies, safety report,
      deletion honesty) — verify which gfl2y0 already fixed
- [ ] Phase 4: conforming export completion (HEIC→JPEG transcode, resize-under-cap, ZIP +
      email draft, stats block) — check what "spec-correct export" on gfl2y0 covers
- [ ] Phase 5: FWB event mode (event open-call link type, event consent, intake spec w/
      walk video, organizer pool → designer pick lists via share links, confirmations,
      CSV per designer, export-back-to-model moment)
- [ ] Phase 6: tracker + auto-lapse (off-platform), verification rail (NY DOL registry
      overlay), open-call calendar
- [ ] Phase 7: Studio+ restructure (craft-only tier; free: unlimited apps, full directory,
      discoverability, watermark-free standard card, QR/logo/socials, preflight/export/
      tracker, writers)
- [ ] Phase 8: tests green, lint, final review pass

## Decisions log
- 2026-08-15: Base implementation on gfl2y0 after review (contains most Phase-3 work
  already) rather than re-implementing from main.
