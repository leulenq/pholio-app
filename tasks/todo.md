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
