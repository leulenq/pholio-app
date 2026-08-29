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
