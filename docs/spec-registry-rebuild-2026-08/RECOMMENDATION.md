# Spec Registry Rebuild — Recommendation

**Date:** 2026-08-19. Pending owner review; nothing here is implemented or seeded.

## 1. Recommended launch dataset

**Fashion Week Brooklyn** (event entry) plus ten agencies:

| Entry | Readiness | Notes |
| --- | --- | --- |
| Fashion Week Brooklyn | **Ready** | All reachable forms captured field-by-field; drift log current. Aug 26 casting is time-sensitive content worth shipping first. |
| Muse Management NYC | **Ready** | Email-channel spec complete; open-call address gap must be presented honestly. |
| Elite Model Management (NA) | **Ready** | Highest surprise density in the set; contradiction presentation needs the counsel pass (FINDINGS §4.2) before the entry ships. |
| Ford Models | **Ready, one gap** | Canonical selectroom channel fully spec'd; the Paris/Snapcast channel's accept/caps need one follow-up fetch (FINDINGS §2.6). Ship NYC-facing content now. |
| Wilhelmina | **Ready** | The 18+ hard-block and binary-track facts must lead the brief; falsified marketing copy must not appear anywhere. |
| State Management | **Ready** | Two-channel presentation is the entry's core; per-channel legal-regime difference (Snapcast license) belongs in the brief. |
| Q Management | **Ready** | Must not surface any open call. |
| ONE Management | **Ready** | Age-contradiction warning is the entry's most valuable sentence. |
| JAG Models | **Ready** | Platform-default cap phrased as such; honeypot field noted in tooling, not shown to talent. |
| CURV Management | **Ready** | Include the canonical-URL guidance (three domains; misdirected Contact-page link). |
| Bicoastal Management | **Ready** | Visual-only photo guidance represented as such; guardian email step surfaced. |

**First alternate:** Heroes Model Management (swap candidate for Ford per SELECTION §2).
**Expansion queue (in order):** Heroes, Women Management, Marilyn NY, Next, The Society
(with careful 16–23 presentation), IPM (after apply-channel isolation), TRUE (after the
domain-verifiability question), Soul Artist / Major / APM / NYMM / The Management NYC
(each needs one deep pass), Nomad (registry follow-up first).

## Status — 2026-08-29 (normalization pass, partial)

Six of the eleven recommended entries are now published in the live pack
(`data/spec-registry/v1`), taking step 3 of §2 for the entries that had no
registry series at all: **State** (its own form), **Q Management**, **ONE
Management**, **JAG Models**, **CURV Management** and **Bicoastal Mgmt**. Each
carries `observedOn: 2026-08-19` — this research's date, not the day it was
normalized — with a 90-day review deadline, and each is matched to its NY DOL
certificate in `data/trust-registry/v1/verifications/` against the in-repo
snapshot.

Two deliberate deviations from §2's sequence, both recorded so they are not
mistaken for oversights:

1. **The entries were normalized into the existing v1 schema, not the
   three-layer model in `MODEL.md`.** Step 2 (schema implementation) has not
   happened, and waiting for it would have left the export and preflight
   machinery with six targets through the Fashion Week Brooklyn season. What v1
   cannot hold — video mechanisms, per-channel legal regimes, conditional
   field visibility, honeypots, template defects, ethnicity and website fields
   — is written into each revision's `review.notes` rather than dropped, so the
   facts survive to be re-normalized when the new schema lands. Each entry's
   notes name what its schema could not carry.
2. **State's Snapcast channel is not published.** v1 carries one channel per
   revision, and the authored brief already sets State's two channels side by
   side. A second series would inherit a brief written for the first, which is
   the specific failure mode that entry exists to demonstrate.

Still open from this package:

- **Fashion Week Brooklyn** has no registry series (`fashion-week-brooklyn:event`
  is still prospective); its intake is event casting rather than representation.
- **Muse, Wilhelmina, Elite and Ford** remain on their 2026-08-09 v1 revisions.
  This research supersedes all four, and the Ford correction is the urgent one:
  the published spec's canonical channel is the Snapcast form, while this pass
  found the canonical NYC route is hosted on selectroom.app and that Snapcast
  serves the Paris route. Each needs an r2.
- **IMG Models and The Society** are published but were dropped from this
  package's launch ten (§3 of `SELECTION.md`). Whether they stay published is a
  product decision, not a data one, and nothing has been delisted.

## 2. What I would do next (sequenced)

1. **Owner review of this package** — especially the four MODEL.md §5 questions, the
   Heroes/Ford call, and the contradiction-presentation posture (with counsel).
2. **Schema implementation** of MODEL.md's three layers, porting v1's keepers (immutable
   revisions, unknowns-as-data, evidence hashing, advisory-only) and adding the §3.2 gap
   fields. Validator rules from MODEL.md §4 (dedup, label vocabulary, no research prose in
   presentation fields) are part of this step, not a cleanup afterward.
3. **Normalization pass**: produce registry records from the eleven evidence files. This
   is editorial work against the curated vocabulary — budget real reviewer time; the
   evidence files are deliberately verbatim and must not be auto-ingested.
4. **Talent briefs editorial pass**: each entry has a drafted brief (§11 of each file);
   they need a style-guide edit and the "checked on 2026-08-19" stamps wired to section
   review states.
5. **Platform-cluster checkers** for cDs, Mainboard/Portfoliopad, Snapcast, selectroom —
   four checkers cover eight of eleven entries' re-verification. Schedule: monthly
   automated where robots posture permits; manual quarterly otherwise; always before any
   marketing that names an agency.
6. **Close the two research gaps**: Ford-Paris accept string; a light Wilhelmina re-check
   of the DOB `max` value in ~January (to learn whether it's static or maintained).
7. **FWB partnership follow-ups** (owner's call): form response counts (the standing ask),
   the broken Italy link, the email-less Brooklyn form — all three are things FWB benefits
   from hearing before the Oct 4–10 season, and casting is ramping now (Aug 26 event).
8. **Drift telemetry from day one**: user-reported-breakage flags and export-outcome
   signals are the only way to see server-side reality this methodology cannot observe
   (FINDINGS §2.1).

## 3. What must not happen (guardrails restated as commitments)

- **No v1 records enter the new registry.** v1 remains prior art and an audit subject;
  its two under-researched specs (Elite Global, Ford) are superseded by this research.
- **No folklore, ever.** FINDINGS §1.2's falsification rate is the standing argument:
  claims enter the registry from primary evidence with provenance labels, or not at all.
- **No "agency approved" framing.** Entries are reference entries: "requirements published
  by the agency, checked on DATE"; the CTA is prepare-and-submit-on-their-site. Payment
  never touches any of it (per the standing legal posture).
- **The 18+ launch gate holds** — this research proves the agencies will not backstop an
  underage submission (FINDINGS §1.1); Pholio must be the check.
- **Contradictions are surfaced, never resolved by fiat** — the registry's honesty about
  disagreement is its differentiation; smoothing it over reintroduces the surprises the
  product exists to remove.

## 4. Why this dataset, in one paragraph

This launch set serves the FWB-adjacent cohort where they actually apply (three majors
they'll try regardless, seven boards that genuinely consider them), covers every real
application shape found in the market (native forms across four platforms, provider
forms, email-only, walk-in, event forms, video-adjacent asks, guardian edge cases), and —
because all of it was rebuilt from the live forms with provenance — every entry can make
the product's core promise honestly: what Pholio tells a talent is what the agency's
application will actually do, as of a stamped date, with the unknowns and contradictions
stated instead of papered over.
