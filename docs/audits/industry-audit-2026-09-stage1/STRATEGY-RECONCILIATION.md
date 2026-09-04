# Reconciling the Stage 1 audit with the August strategy

**Date:** 2026-09-04
**Reviewed against:** `docs/audits/2026-08-08-pholio-strategic-decision.md` (kill criteria, scope),
`docs/pholio-strategic-analysis-2026-08.md` (2026-08-15, with the 2026-08-25 correction), and
`docs/pholio-product-plan-2026-08.md` (invariants A1, compliance fixes A2, removal lists A3/A4,
defects A5, wedge B, legal C, sequencing).
**Subject:** the recommended order and product-model findings in
`docs/audits/industry-alignment-audit-2026-09-stage1.md`.

## 1. Headline

1. **Most of the audit's P0s are the August plan's own lists, not yet executed.** The plan's
   week-1 deletions and A2/A3/A4 removals name the mock social verifier, archetype and vibe
   AI, match scoring, profile-strength theatre, the booking-state apparatus, roster standings
   as a system of record, and the "get discovered" register. Nine of the audit's twenty-one
   P0s are those items still live on 2026-09-03. The audit is, in large part, a compliance
   check on the plan.
2. **Three audit recommendations overreach the plan and should be trimmed for Stage 1.**
   The minors data-model rebuild (plan §8.3, C5: 18+ at launch, minors are a phase-2 product,
   "not a toggle"), the full two-attestation representation model (plan sequencing: "portable
   multi-agency graph: not yet"), and the suggested "Packages" screen (plan §4 and §9.4:
   packages to clients are agency back-office and excluded). The Stage 1 versions are
   deletions and gates, which is what the plan asked for in week 1.
3. **One plan spec is now shown to be wrong by the audit.** A5 told engineering to give
   `represented` the label "Agreement complete" as an agency-writable status. It was
   implemented as specified, and the audit's P0-7 shows that ownership is the defect: a
   contract state cannot be recorded by one party. This is a plan amendment, not a bug.
4. **One 2026-08-25 defect is still live and has a deadline.** Nothing in `src/`, `seeds/` or
   `scripts/` writes `identity_policy = account_optional` (verified 2026-09-04; only reads
   exist in `opencall/routes/apply.js:197` and `opencall/services/submissions.js:283`). The
   anonymous event flow that renders the event consent copy the audit praised is therefore
   unreachable for real applicants, exactly as the correction note said. FWB casting is now.
5. **Effort drifted against the plan in September.** The Wallet pass (§9.6 #9: "zero strategic
   weight; ship someday as polish, not now") received a full redesign cycle on 2026-09-03 and
   is mounted at `/api/talent/wallet`; Discover semantic search (§9.3: remove as a
   talent-surfacing engine, keep at most invite-to-apply; 08-08 "stop building: agency
   discovery search") received a research and implementation cycle in September. Both were
   built honestly, and both are outside the launch cut while week-1 deletions remain undone.

## 2. Plan mandate against audit finding, item by item

| Plan item | Audit finding | Status on 2026-09-03 | Stage 1 action |
|---|---|---|---|
| §9.3 remove "the mock social verifier anywhere near production" | P0-12: live, ungated, writes random follower counts | Not done | Delete the route |
| A3 remove archetype / vibe / market-fit AI; §9.3 kill match scoring | P0-10 "Editorial" default everywhere; P0-13 AI verdict on the fallback card; P0-11 "Match" column, "Top matches today"; L8-17 "Pholio signal 82" | Partly done (`chat.js`/`scout.js` gone; outputs still rendered) | Remove the render paths and the defaults |
| A3 remove profile-strength theatre | P0-11 "Agency grade", "ready for agency review" | Not done | Checklist counts only |
| §9.1 never say "get discovered / get scouted / get signed" | P0-15 "Let's get you seen" | Not done | Rename the beat; add the safety block |
| A4 remove Booking Desk; §9.4 decline the option/hold machine | Files removed; P0-9 and PM-4: booking-state palette (1st Option, On Hold, Booked) still renders on the applicant dossier and inverts "unavailable" | Half done | Remove the palette from the submission view; show dated bookouts only |
| A4 remove roster memberships and board standings as a system of record | `roster_board_standings` table exists (migration 20260731); zero references in `src/` or `client/src/` | Done in code, table orphaned | Drop the table in a migration; the audit's "four stores" is three live stores plus one dead table |
| A2 discovery quota flat and tier-blind; kill `is_pro` gates | Quota is flat (`application-quota.js` has no `is_pro`); discoverability reads only `is_discoverable` | Done | Keep; fix the "monthly allowance" copy shown to agencies and strangers (L1-14, L7-06), which breaks A1 #4 by describing an anti-spam cap as an allowance |
| A2 #9 paid portfolio layout acceptable "only while portfolios are talent-owned artifacts" | P0-16: the public page prints "Studio+", weight, gender, ethnicity, age band; comp-card QR and the Wallet pass link to it | Condition no longer holds | Unify layouts; strip the tier badge and the extra stat lines |
| A5 status machine: `accepted` = "Offer / Moving Forward", `represented` = "Agreement complete" | P0-7: agency-only write emails "Representation confirmed" | Implemented as specified | Amend A5 (see §5) |
| A4 #6 Requests: structured request for more materials | P0-8: the request emails "shortlisted you" on one branch | Done, wrong template | One template per event |
| B3 auto-close; §7 item 4 "the norm Pholio gets to invent" | PM-8: copy says "Their review window" and "industry convention"; bell-only; shortlisted closes as no-response | Built, misattributed | Say "Pholio's window"; send the email; distinct end state for shortlisted |
| §9.2 open tracking, "did Marilyn open my book" | P0-6: "Under Review" at submit time while `viewed_at` exists and is read only by Intel | Inverted | "Sent" plus "Opened by X on date" |
| A3 Intel reports observable facts only | PM-10: "agency reviews" reads a seed-only stream; card pulls count self-downloads; bell says "showed repeat interest" | Vocabulary right, implementation wrong | Fix the counters; delete the inference copy |
| B2 #1 spec registry drives required fields; A3 onboarding "cut to the minimum" | P0-17: bust, waist, hips hard-gate every submission; PM-5 whole book plus card shipped by default | Contradicts the plan | Requirements from the target agency; height and photos as the only universal gate |
| §9.6 #6 machine-readable comp card | P0-2: the embedded JSON carries a minor's measurements because `profile.is_minor` does not exist | Built, leaking | Moot under an 18+ gate; fix anyway (`isMinorProfile`) |
| §9.6 #2 verification rail: show registration number | L2-19, L6-14: "vetted agencies" asserted without a mechanism | Half built | Print the NY DOL certificate number where an agency is registered |
| §6 event mode with compensation disclosure | Built and correct (L7 preserve); L7-14 no usage or image-rights line for unpaid work | Gap the plan did not foresee | Add one brief field: usage terms for unpaid work (R4 §5) |
| §8.3, C5: 18+ at launch; reject minors at intake | P0-1 to P0-5: under-18 accepted with guardian consent on the profile, onboarding, comp card, Wallet pass, exports | Launch posture not enforced | Hard 18+ gate on every DOB write; disable guardian flows; keep the audit's minor findings as the phase-2 spec |
| 2026-08-25 correction: event consent copy unreachable | No writer for `account_optional` anywhere | Still live | Add the write path on event-call creation, or default event calls to `account_optional` |
| §9.6 #9 Wallet pass "not now" | P0-19, P0-4: shipped as "Pholio ID", self-declared representation, minors' faces | Built against the plan | Unmount for launch; revisit as a digital comp card after validation |
| §9.3 Discover: keep at most invite-to-apply | L7: Scout room is honest (no score, representation gate first, "what an application would add" boundary) | Built beyond the plan, well | Freeze; no further investment before the kill criteria are read |

## 3. The revised Stage 1 order (FWB Season 2 is 2026-10-04)

The audit's order put minors first and the full representation model third. Under the plan,
both collapse into deletions. Four weeks of work, in this order:

1. **Enforce 18+ everywhere** (one predicate, every DOB write, onboarding, open-call intake,
   guardian flows disabled). This closes P0-1 through P0-5 for launch and satisfies C5. Keep
   the export and webhook gating anyway as defence in depth.
2. **Week-1 deletions from the plan, finally:** the mock OAuth route; archetype, verdict and
   "Editorial" defaults; "Match" and "Top matches"; readiness bands; the booking-state palette
   on the dossier; the "Client package" board kind; the orphaned standings table.
3. **Stop asserting:** "Sent" and "Opened by X" instead of "Under Review"; delete the invented
   agency-process paragraph; one template per event; "Pholio's window" everywhere; the
   auto-close email.
4. **Representation, launch cut:** remove `represented` from the drag targets; the agency
   action becomes "Record offer of representation" and the email says so; the talent's own
   representation record (already built) is the only reader for the Wallet and public page.
   The two-attestation model waits for the portable graph (plan: "not yet").
5. **Materials:** comp-card pool restricted to book frames; agency block versus personal
   contact; submission gate from the target agency's requirements; digitals sheet says
   "declared unretouched".
6. **Register and naming, all string changes:** first-beat copy and the four-line safety
   block; public portfolio stat lines and tier badge; Signing → New Faces; Pipeline →
   Applications; house → agency; Market nav → Agencies; "monthly allowance" → anti-spam
   wording.
7. **Event consent write path** (item 4 above) before FWB casting closes.
8. **Unmount the Wallet route** for launch.

Deferred until the kill criteria are read: the taxonomy collapse (PM-3), the representation
graph (PM-2), the Wallet pass as a digital comp card (PM-9), Intel's counter rebuild beyond
deleting the false ones (PM-10), the minors data model (PM-6).

## 4. The audit's two owner decisions, answered by the strategy

- **Kanban:** keep it. A4 #5 keeps triage stages, bulk actions, notes and tags; A0 says
  response tracking is a talent concern the agency does not share. The audit's PM-1 fix is
  the plan's own split: agency working states stay private, talent sees observed events. The
  one thing to remove is the "Client package" board kind, which is the excluded back-office
  object wearing intake's clothes.
- **Wallet pass:** the plan already decided "not now". The audit adds that the current
  artefact is an invented credential with a minors exposure. Unmount for launch.

## 5. Plan amendments the audit justifies

1. **A5, representation ownership.** Replace "`represented` (Agreement complete), agency
   set" with: the agency records an offer; only the talent's acceptance creates a
   representation record; every reader consumes that record.
2. **A4 #6, one template per event.** A material request never says "shortlisted".
3. **B3 and §7 item 4, attribution.** The window and the re-apply interval are Pholio's
   conventions and the copy says so. No primary source states a re-apply interval (R4 §8).
4. **§6 event brief.** Add usage and image-rights disclosure for unpaid work alongside
   compensation. Unpaid event terms commonly claim perpetual worldwide usage (R4 §5); the
   disclosure is what separates Pholio from that tier, and it is a brief field, not the
   deferred rights ledger.
5. **A3, comp card.** Two rules the plan did not state: the card is cut from the book, never
   from digitals; a represented model's card carries the agency's contact, never the model's
   phone (R3 §4.3).
6. **A2 #9.** The condition has failed (portfolio links are reachable from agency-facing
   artefacts); unify the layouts and add the public page's stat lines to the invariant-2 sweep.
7. **§9.2, required fields.** State it as a rule: nothing beyond height and photos is required
   universally; everything else comes from the target agency's published requirements. Half
   the top boards ask for height only (R1 §4).
8. **§8.3, minors.** The plan says 18+ at launch; the code accepts under-18 with guardian
   consent on every surface. Either the posture is enforced in code or the plan's phase-2
   build starts now. The audit's minor findings are that build's requirements.

## 6. What the strategy does not cover and the audit adds

Agency-side naming ("Signing", "Pipeline", "house", the board collision), the stats order and
unit conventions, the shoe converter, the digitals-versus-book separation on the card, the
pre-auth safety block, and the public portfolio's stat lines are outside the strategy's
frame and stand on the industry evidence alone. None of them conflict with the plan; all are
cheap; the naming items are one-line string changes and belong in Stage 1.

## 7. What was not reviewed here

The CA geofence and counsel question for Studio+ (§8.1), ROSCA billing (C7), WCAG (C9), and
the privacy notice (C10) are outside the industry audit's scope and were not re-checked.
