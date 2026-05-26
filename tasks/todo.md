# Agency Dashboard IA Refresh

## Plan

- [x] Audit the current agency dashboard sections against a modeling-agency workflow.
- [ ] Reorganize navigation around the primary workflow: submissions, scouting, castings, and roster management.
- [ ] Demote secondary surfaces so analytics and summary pages do not compete with daily work areas.
- [ ] Collapse redundant or legacy navigation paths where possible.
- [ ] Verify route behavior and document the final IA review.

## IA Audit Notes

- Core workflow surfaces:
  - `Inbox`: primary submissions review workspace for screening applicants.
  - `Discover`: primary scouting surface for finding and inviting new talent.
  - `Casting`: active client-role pipeline for shortlisting and booking talent.
  - `Roster`: signed talent management and availability review.
- Secondary/supporting surfaces:
  - `Overview`: summary and alerts, helpful but not the main place work happens.
  - `Activity`: audit/history layer, supports follow-up rather than primary decision-making.
  - `Analytics`: performance reporting, useful for managers but not first-click workflow.
  - `Messages`: cross-cutting communication utility rather than a top-level workflow anchor.
  - `Settings`: agency administration.
- Redundant/misplaced/mislabeled surfaces:
  - `Boards`: overlaps heavily with `Casting` and reads like an internal product term instead of an agency workflow label.
  - `Inbox`: accurate mechanically, but too generic for agency submissions review.
  - `Discover`: understandable, but `Scout` is more aligned with industry language.
  - `Overview` and `Analytics`: currently over-promoted relative to actual day-to-day agency work.

## Review

- Pending implementation.

---

# Talent Dashboard Editorial Redesign (Phase 1)

## Plan

- [completed] Audit current talent shell + overview against `Brand Reference.html` and imported `pholio-talent-platform`.
- [completed] Redesign `TalentLayout` for stronger editorial hierarchy, contrast, and talent-native navigation language.
- [completed] Recompose talent overview first fold (hero + primary modules) with premium hierarchy and improved panel rhythm.
- [completed] Validate route/data behavior remains intact and run lint checks for changed files.
- [completed] Document implementation review notes and tradeoffs.

## Review

- Shell now uses a stronger editorial frame: branded lockup + identity line in topbar, wider talent-native left rail, and clearer tier/presence treatment.
- Overview composition is tightened: identity + status metadata, refined book taxonomy tags, renamed module language (`Readiness Board`, `Market Signal`), and explicit `Career Assets` preface.
- Data flow/routes were preserved; this pass changes structure and styling only for the overview experience and shell.
- `client` lint remains failing due to broad pre-existing issues across agency/onboarding/shared modules; no new lint errors were introduced in modified overview/shell files.

## Review (Pass 2)

- Rebuilt the overview into a functional surface: `Booking Queue`, `Submission Pulse`, `Profile Composition`, `Portfolio Surface`, `Career Assets`, `Market Board`, and `Activity Ledger`.
- Added richer operational density from existing data sources (`applications`, `agencies`, `auth profile/images/completeness`, and analytics summary/activity), while preserving existing routes and API contracts.
- Shifted focus from shell decoration to talent workflow orchestration: what to do next, where submissions stand, and what profile/composition gaps are blocking conversion.
