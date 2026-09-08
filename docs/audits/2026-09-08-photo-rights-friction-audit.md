# Photo rights / usage rights — first-principles audit

**Date:** 2026-09-08
**Trigger:** Talent hitting hard blocks on comp-card export and agency application submission
("Rights check — Resolve the note above to unlock — Confirm usage rights on your photos") that
felt disproportionate to what the action actually is.

**Scope:** Understand what exists and why, independently establish the actual legal/industry
line, and recommend the least-friction system that still gives Pholio and its users appropriate
protection. This document is the audit. It does not change any code.

---

## 1. Two unrelated systems share the word "rights"

- **System A — `image_rights`** (per-image, manual form): license type, copyright owner,
  photographer, territory, exclusivity, dates, model-release reference. **This is the one
  causing the friction.** It gates comp-card export and agency-application submission.
- **System B — `talent_likeness_consents`** (per-profile, append-only ledger): a talent's
  separate opt-in/withdraw for two *Pholio-initiated* uses — marketing use and AI-replica use.
  It never blocks anything. It is well-scoped and should be left alone (see §7).

Everything below is about System A unless stated otherwise.

## 2. Where rights state lives and how it's set

- `image_rights` (`migrations/20260326120000_image_system_phase1_foundation.js`): one row per
  image, free-text columns, no DB-level enum. Enum lives in
  `src/shared/lib/image-rights.js:3-24` — cleared = `{cleared, licensed, owned, approved}`,
  denied = `{denied, blocked, forbidden, unlicensed, restricted}`. The UI also offers a
  `pending` value that is in **neither set**.
- Every newly uploaded image gets an `image_rights` row seeded entirely `null`
  (`src/domains/talent/routes/media.js:1263-1279`) — **every photo starts unresolved.**
- There is no upload-time prompt, no bulk action, no default that treats "a photo of yourself"
  as presumptively fine. The only way to clear it is opening each photo one at a time in Frame
  Editor and filling a stock-photo-licensing-style form: license type, rights status, copyright
  owner, photographer name, usage scope, territory, start/expiry dates, exclusivity — then,
  separately, a model-release sub-form (release URL, signer name, signer role, signed date).
- The only bulk tool is a dev script (`scripts/clear-image-rights.js`) that force-fills an
  account for seed/demo purposes — not a real product path.

## 3. Every place it gates or influences the product

| Gate | Check | Effect |
|---|---|---|
| Comp-card export button | `src/domains/pdf/guardrails.js` `checkRightsMetadata` — loose: fails only if status is *denied* or the field is *empty* | **Hard block** on download |
| Apply-flow Submit button (client) | `ApplyExperience.jsx` recomputes the strict check | **Hard block**, button disabled |
| `POST /api/talent/applications` (server, both preflight and post-normalize) | `send-readiness.js` → strict `imageHasDistributionRights`: cleared status **and** recognized license basis **and** an ownership credit **and** active (non-expired) dates, guardian-signed release for minors | **Hard block**, HTTP 400, unconditional — no opt-out |
| Market/Applications dashboard "Clear this before you send" panel | `profileGating.js` calls send-readiness with `includeDistributionRights: false` | **Explicitly hidden** — talent sees no warning here even though they'll be blocked one click later in Apply |
| Photo-intelligence hero/grid candidate pool | `photo-intelligence.js` | Silently drops rights-*denied* images from consideration (denied only, not unresolved) |
| Portfolio public page, share link, agency-side viewing, dashboard readiness score | — | **Not gated at all.** Confirmed no reference to rights logic anywhere in these paths. |

Two real product bugs fell out of this trace, worth fixing regardless of the redesign:
- The comp-card download button's tooltip when blocked reads *"Add photos to generate your
  card"* even when the true cause is rights, not photo count.
- The dashboard preflight banner hides the rights blocker (`includeDistributionRights: false`)
  while Apply enforces it unconditionally — a talent is told they're "ready to send" and then
  blocked on the next screen.
- `'pending'` is treated inconsistently: it passes the loose comp-card check but fails the
  strict application check, and it's in neither the cleared nor denied enum.

## 4. Why the system was built (original intent)

**System A** traces to `c37b8c09` (2026-06-26, "Complete legal audit: moderation, consent,
billing, and compliance gates"), landed as one file among ~60 in a broad compliance sweep, with
only an inline comment for rationale: *"Image is missing distribution rights. Add a license
type and rights status before distribution."* The best documentation of the actual threat model
is `docs/talent-launch-legal-security-production-plan.md:266`'s tabletop scenario: *"photographer
submits a DMCA notice and uploader submits a counter-notice."* The field set itself
(copyright_owner, photographer_name, license_type, territory, exclusivity) is a stock-photo /
commercial-licensing data model — the system was designed as if every talent photo were licensed
stock imagery that needs a paper trail before any "distribution," where "distribution" turned
out to mean *the talent downloading their own comp card or applying to an agency with their own
photos.*

That's the category error: it modeled the wrong transaction. There is no third party buying a
license here. The talent is the subject of the photo, using her own image, for her own career
purposes.

**System B**, by contrast, has an explicit, well-reasoned spec (`docs/pholio-product-plan-2026-08.md`
§C6, "Right of publicity and likeness," citing NY Civil Rights Law §§50-51, Cal. Civil Code
§3344, and the NY Fashion Workers Act's AI-replica consent requirement) and was scoped correctly
from the start: separate opt-in consent specifically for *Pholio's own* marketing use and for
AI-generated/enhanced likeness — the two cases where a third party (Pholio) is the one doing the
commercial exploiting. It was deliberately built to never block core product use.

## 5. What the actual legal/industry line is (independent research)

*(Not legal advice; directional, sourced where possible — see full source list in the research
agent's report, retained in this session.)*

- **Copyright in a photo defaults to the photographer**, not the subject — but that's not the
  relevant question. What governs whether a model can *use* her own test/comp-card photos is
  **implied license from custom and conduct**: in a test/TFP/TFCD shoot, the photographer
  handing over selects *for the model to use in her portfolio and comp card* is exactly the
  transaction, and courts recognize implied licenses arising from that conduct without a signed
  document. This is standard, well-documented industry custom, not a gray area.
- **Model releases** exist to protect whoever wants to *commercially exploit* the image to a
  third party — an ad, a stock sale, a brand campaign. They are not what governs a model
  displaying her own portfolio or applying to an agency. No agency FAQ, photography-law guide,
  or platform ToS reviewed treats portfolio display or agency submission as release-triggering.
- **Real agencies do not check rights at scouting/submission.** IMG, Ford, and Elite's public
  submission guidance explicitly asks for *unedited, unprofessional* snapshots/digitals —
  the opposite of "prove this photo is licensed." Rights become operationally relevant only when
  an agency later books the talent on a *paid, third-party job* — governed by that job's own
  contract, not anything about the comp-card photos.
- **Right of publicity** is the model's own right over her own likeness — it's a right she holds,
  not a liability she needs to clear before using her own image. It only comes into tension with
  a photographer's copyright when a *third party* wants to commercially exploit the photo, which
  isn't what comp-card export, portfolio display, or agency submission are.
- **DMCA safe harbor (17 U.S.C. §512)** — the actual protection a hosting platform needs —
  requires a registered agent, a working notice-and-takedown process, and a repeat-infringer
  policy. §512(m) explicitly says safe harbor is **not conditioned on monitoring or pre-screening
  uploads.** Comparable platforms (Format, Behance, Model Mayhem) all rely on a one-time ToS/
  upload warranty ("you have the right to use this"), not a per-item gate.
- **Minors** need guardian consent because minors generally lack contract capacity — that's a
  separate legal question from who owns a photo's copyright, and it's already handled reasonably
  in the strict check (`requireGuardianRelease` for minors) and in System B (`actor_type`
  distinguishing guardian acts). It shouldn't be bundled into a per-photo licensing form.
- **Risk ranking**, highest to lowest: **Pholio's own marketing use of a talent's photo** ranks
  highest (third-party commercial exploitation of someone's likeness — exactly System B's
  scenario) → an agency handing a comp card to an external paid client → **agency application
  submission** → **comp-card generation/download** → public portfolio display → private upload.
  The two actions Pholio currently hard-blocks (comp-card export, agency application) sit at the
  **low-risk end** of that spectrum — arguably the safest possible uses of a photo a talent
  already lawfully possesses. Meanwhile the genuinely highest-risk action (Pholio's own marketing
  use) is correctly gated by consent (System B) already.
- Separately, `docs/talent-launch-legal-security-production-plan.md:166` (item **G-06, P0**) flags
  that Pholio's actual DMCA registered-agent status needs verification — i.e. the real,
  load-bearing legal infrastructure this whole system exists to protect may not even be
  confirmed live yet, while the product simultaneously hard-blocks low-risk user actions with a
  per-photo licensing form. The friction is misplaced twice over: on the wrong actions, and
  possibly in front of infrastructure that isn't the actual safeguard.

## 6. Conclusion

System A was built on the wrong mental model — treating every talent photo like acquired stock
imagery requiring a licensing paper trail before any use, when the actual legal position of a
talent using her own photos for her own portfolio, comp card, and agency applications is close to
risk-free under ordinary implied-license and right-of-publicity principles, and is exactly the
behavior real agencies expect and real comparable platforms permit without a gate. The system
correctly identifies that *some* uses need real, specific consent — it already built that
correctly once, in System B, for the one case that actually needs it (Pholio's own commercial use
of a talent's likeness).

## 7. Recommended shape of the fix (not yet implemented)

1. **Remove the per-photo rights gate from comp-card export and agency-application submission.**
   Neither action should reference `image_rights` at all. Delete/neuter `checkRightsMetadata` in
   `guardrails.js` and the `distribution_rights` blocker in `send-readiness.js` /
   `validate-submission-package.js` / `ApplyExperience.jsx`.
2. **Replace it with one warranty, given once, not per photo.** Extend the existing legal
   acceptance step (`LegalAcceptanceGate.jsx` / `legal-versions.js`) — or a single upload-time
   line — with an explicit attestation: *"You confirm you have the right to use the photos you
   upload (your own photos, a test/TFP shoot, or the photographer's permission)."* This mirrors
   Format/Behance and is the actual mechanism DMCA safe harbor is built around.
3. **Keep `image_rights` as optional, non-blocking metadata** for the cases it's genuinely useful:
   an agency later needs a photographer credit for a tear sheet, or Pholio wants to track a paid
   usage license with a real expiry. Nothing in the low-risk paths should read it.
4. **Verify/close G-06** (DMCA registered-agent status, notice-and-takedown, repeat-infringer
   policy) — that's the real protection, it's cheap, and it's invisible to users.
5. **Leave System B exactly as-is.** It's the correctly-scoped control: specific, separate,
   opt-in consent only for the one case that's actually higher-risk (Pholio's own marketing/AI
   use of a talent's likeness) — the model this whole audit argues for.
6. **Keep minors' guardian-consent requirement**, but as an identity/account-capacity control
   (already how System B models it via `actor_type`), not folded into a photo-licensing form.
7. Fix the two copy/logic bugs found in passing regardless of the above (misleading "Add photos"
   tooltip; preflight banner silently hiding a blocker that Apply then enforces).

This is the audit; no code has been changed. Next step, if agreed, is a short implementation plan
(this qualifies as a real architectural/legal-surface change per `CLAUDE.md` workflow rules, so
it should go through plan mode before any edits).

## Implemented — 2026-09-08

Shipped as denial-only, not full removal of `image_rights` from the gates. Concretely:
`checkRightsMetadata` (guardrails.js), `imageHasDistributionRights`/`validateImagesForDistribution`
(server `image-rights.js` and its client mirror `imageRights.js`), and `send-readiness.js` now
block only when `rights_status` is one of the five explicit-denial tokens
(`denied|blocked|forbidden|unlicensed|restricted`) — never on missing/absent metadata, which was
the default state of every upload and the actual source of the friction. `pending` and every
other non-denial value (including no rights row at all) pass both gates.

Why denial-only rather than deleting the gate outright (recommendation §7.1's stronger framing):
a real reactive hold — after a dispute, a DMCA counter-notice, a photographer revoking a test-shoot
license — is a legitimate, low-frequency, actionable state that should still stop a photo from
going out the door. Deleting the check entirely would remove that lever along with the
false-positive noise. Denial-only keeps the lever and removes every case that was blocking normal
use: the default unresolved state (every photo, forever, until the audit) no longer counts as a
blocker anywhere.

The one-time upload warranty (§7.2) shipped as a permanent, non-blocking microcopy line in
`MediaWorkspace.jsx` next to the uploader rather than a new step in `LegalAcceptanceGate.jsx` —
same substance (a stated warranty that the uploader has the right to use the photos: their own, a
test/TFP shoot, or the photographer's permission), lower friction than a second consent screen,
and consistent with the audit's core finding that the actual DMCA safe-harbor mechanism doesn't
require per-upload gating (§512(m)).

`image_rights` remains exactly what §7.3 recommended: optional, non-blocking metadata in Frame
Editor, useful for a later photographer credit or tracking a real paid usage license, with no
false "required for export/distribution" claim and no false "expired rights block export" claim
left in the UI.

Not addressed by this change (deliberately out of scope, named so they aren't silently dropped):
G-06 (DMCA registered-agent/notice-and-takedown verification, §7.4) and any changes to System B
(`talent_likeness_consents`, §7.5) — both untouched, as the audit recommended.
