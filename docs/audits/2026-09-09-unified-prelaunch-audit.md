# Pholio unified prelaunch audit — all findings and supporting evidence

Prepared: 2026-09-09. Findings and verification baseline: 2026-09-08, as recorded below.

This is the **standalone, unified audit document**. It includes the complete lead report, all 23 prioritized findings, supplemental issues/candidates, and the full supporting auth/privacy/inventory analyses. You do not need to open the lane documents to discover an issue. Executable proof files remain separate only so the tests can be run.

**Remediation status:** Implementation was authorized on 2026-09-09 and is in progress. Findings below preserve the pre-fix evidence; none should be read as closed merely because a patch is being prepared. The launch decision remains NO-GO until verification and external release gates are satisfied. The user delegated the minors decision: adults-only launch; preserve existing minor data and access to withdrawal/deletion, restrict sharing, and do not equate mailbox confirmation with verified guardianship.

### Current remediation checkpoint — 2026-09-09

This table records the current dirty-tree work; it does not rewrite the historical findings or certify production. “Locally fixed” means focused isolated tests passed. **Launch remains NO-GO** because external gates, incomplete work, and a clean full post-fix run remain outstanding.

| ID | Current status | Remaining gate |
| --- | --- | --- |
| F01 | Partial: tracked `.env.migration` removed | Rotate/revoke the credential and review authorized access logs/history |
| F02 | Locally fixed | Full post-fix regression and deployed role-path proof |
| F03 | Locally fixed | Full post-fix regression and old-session deployed proof |
| F04 | Locally fixed | Full post-fix regression |
| F05 | Locally fixed | Browser/deployed origin-flow proof |
| F06 | Locally fixed | Full post-fix regression across bearer lifecycle aliases |
| F07 | Partial: replacement bytes re-enter moderation | Queue/review decisions remain keyed only by image ID, not content version, so a stale human review may approve later replacement bytes; source-confirmed, concurrent exploit not yet tested. Media focused run still has 2 failures |
| F08 | Open/external | Prove private CDN delivery and clean historical originals/known URLs |
| F09 | In progress | Finish media cleanup failures and prove provider retry/deletion in deployment |
| F10 | Partial: new external uploads disabled | Close the legacy stored-URL edge and verify historical artifact deletion |
| F11 | Locally fixed: PDF jury dispatch removed | Full PDF regression and deployed configuration proof |
| F12 | Locally fixed: webhook reads only the frozen, non-minor package | Deployed adults-only enforcement and receiver proof |
| F13 | Locally fixed: hourly bounded recovery entrypoint shipped | Deploy and prove all provider lanes finish within Netlify's non-configurable 30-second scheduled-function limit ([Netlify docs](https://docs.netlify.com/build/functions/scheduled-functions/)) |
| F14 | Locally fixed | PostgreSQL concurrency and real Stripe retry/reconciliation proof |
| F15 | Locally fixed | PostgreSQL concurrency and provider-order reconciliation proof |
| F16 | Locally fixed | Provider reconciliation for existing/duplicate subscriptions |
| F17 | Partial: version/event/current-transaction binding fixed | Bind mutable image bytes and comp-card preset content, then regress |
| F18 | Locally fixed | Full post-fix regression and production job observation |
| F19 | Partial: adults-only server policy selected and focused policy tests pass | Finish full regressions and frontend copy; preserve minor withdrawal/deletion |
| F20 | Partial: root/site upgraded; Sharp 0.35.4 with libheif 1.23.2 observed | Upgrade/audit client dependencies and verify deployed native runtime |
| F21 | Locally fixed | Observe a real CI run failing correctly on a failing backend test |
| F22 | Partial: webhook responses are not buffered | Global cost/concurrency/deadline bounds remain unimplemented |
| F23 | Locally fixed: reference-only durable outbox, leases, retry and dedupe | Deployed scheduler/runtime proof; an already in-flight request cannot be recalled by a later withdrawal |
| O01 | Locally fixed | Full post-fix Spec Registry regression |
| O02 | Locally fixed | Full post-fix Spec Registry/agency-read regression |
| O03 | Locally patched | Complete full moderation/CSAM producer-consumer regression |
| O04 | Locally fixed: checked IP is pinned to the TLS connection; reserved IPv6 denied | Deployed egress/DNS proof |
| O05 | Open candidate | Safely trace and constrain legacy PDF logo fetches |
| O06 | Open | Browser-test and enforce a compatible CSP; report-only is not a release control |

Focused evidence currently available: auth 6 suites/32 tests passed; the latest Spec/agency-read group 6 suites/31 tests passed; Stripe 10 suites/63 tests passed; Spec Registry plus auto-close 3 suites/51 tests passed; webhook/outbox 2 suites/52 tests passed; consent/adults-only root checks 56/56 passed (including application-drafts 15/15 when run alone); frontend age/event-hook checks 8/8 passed. These groups overlap and must not be summed. The media group is not green (5 suites, 30 passed and 2 failed). The latest broad run was against an evolving tree: 29 failed/258 passed suites and 119 failed/3,684 passed/10 skipped tests. It is a diagnostic snapshot, **not** current full certification; no clean complete post-fix run exists yet.

## Contents

- [Complete audit and launch decision](#complete-audit-and-launch-decision)
- [Supplemental issue register](#supplemental-issue-register)
- [Finding-to-evidence cross-reference](#finding-to-evidence-cross-reference)
- [Appendix A: complete authentication and tenant analysis](#appendix-a-complete-authentication-and-tenant-analysis)
- [Appendix B: complete privacy and media analysis](#appendix-b-complete-privacy-and-media-analysis)
- [Appendix C: verification inventory](#appendix-c-verification-inventory)
- [Appendix D: executable evidence and interpretation](#appendix-d-executable-evidence-and-interpretation)

## Complete audit and launch decision


Date: 2026-09-08. Decision: **NO-GO for launch with real talent, agencies, personal information and payments.**

This is an implementation-based, risk-oriented audit, not a compliance certification or a claim to have exhaustively proved every line safe. It contains verified defects, explicitly conditional exposures, and deployment questions that could not be answered from the repositories. No real-person data, malicious imagery, live payment, email delivery, production database mutation or deployment was used for testing. No product fixes were made by this audit.

## Executive decision

I would not launch this build. The reasons are specific:

1. Agency viewers/removed members can use legacy mutations; demoted administrators keep old powers; restricted administrators can undo their own restrictions.
2. Approved photos can be replaced without moderation. External comp cards bypass the media pipeline entirely. Image/account deletion leaves objects behind or lacks a running retry consumer.
3. A public PDF request can send a talent's photos to an AI provider independently of their AI consent. Agency webhooks can receive a minor's direct contact despite the application package deliberately suppressing it.
4. Failed Stripe events are permanently treated as duplicates on retry; concurrent events can restore canceled entitlements; multiple checkouts can create subscriptions that local storage collapses into one.
5. A full database credential is committed. Its validity was not tested: rotation or proof of revocation is required, not an assumption that it is old.
6. The image-processing dependency is affected by a current native-decoder security advisory, and attacker-supplied bytes reach that decoder. The marketing site's Next.js lock also needs a security update.

These are not all equally severe, and none establishes that a breach has already occurred. They are sufficient to withhold launch approval even if every existing test were green.

An adults-only, free, invitation-only pilot would reduce some risk but **would not** resolve agency authorization, photos, deletion, exposed credentials, native decoding, or unwanted AI processing. Disabling payments/minors/webhooks is a valid scope reduction only if enforced on every server entry point, including old sessions, direct URLs and existing records—not just hidden in navigation.

## Baseline, independence and evidence

The review began at app commit `dc30c46fbea5ef66aeb92da71cb97b63c18efe10`. Concurrent user work changed the tree during the audit. The final app source/proof recheck was against `cafa0e2ed4fdd873f58c68c68612d11740465787`; unrelated edits were preserved. This is not an assertion that a live deployment has either SHA. Earlier lane notes accurately describe the dirty tree at the time of their reads.

Repository instructions initially identified `pholio-landing`; the current repository boundary identifies the distinct sibling `pholio-site`. Both were inspected, but final marketing dependency/configuration conclusions use `/Users/lenquanhone/Projects/pholio-site`, last observed at `c6d0f19699d5e9423ce09fc270aca321353610bd`. Verify which artifact is actually deployed before release.

The strategic analysis (`docs/pholio-strategic-analysis-2026-08.md`, including its dated corrections) was read as intent. Internal industry material supplied questions about agency authority, parental authority, casting purpose and distribution—not proof of security, business facts or law. Historical claims about missing ZIP exports, undisplayed consent and paid application limits were checked rather than copied. Parallel high-risk reviewers handled auth/tenants, privacy/media and payments/operations; a lower-cost `gpt-5.6-luna` worker handled bounded inventory/client verification. The lead reviewed cross-cutting paths, reproduced findings and consolidated the verdict.

Evidence files:

- [Auth/tenant/messaging analysis](2026-09-08-evidence/auth-tenants.md) and [offline proof](2026-09-08-evidence/auth-tenants-proof.cjs).
- [Privacy/media analysis](2026-09-08-evidence/privacy-media.md) and [offline proof](2026-09-08-evidence/privacy-media-proof.cjs).
- [Payment and lifecycle proofs](2026-09-08-evidence/payments-infra-proof.cjs).
- [Consent-binding proof](2026-09-08-evidence/submission-binding-proof.cjs).
- [Harmless image-decoder reachability proof](2026-09-08-evidence/image-decoder-proof.cjs).
- [Inventory and client verification](2026-09-08-evidence/verification-inventory.md).

The proofs execute actual functions/handlers with explicit inert provider/storage/DB substitutes, or isolated SQLite `:memory:`. They do not load the application environment. They prove local logic; they are not authenticated deployed HTTP exploits, PostgreSQL load tests or native-memory exploits. Route mounting/outer guards were separately traced. All five proof scripts passed in the final recheck. Source locations below refer to the reviewed tree and may move in subsequent commits.

## System and threat model reconstructed from code

### Runtime and data flows

The actual backend dependency is **Express 4.22.2**, not the Express 5 claimed in older architecture instructions. The product is a React 19/Vite SPA and Express/EJS API/public-rendering application. Netlify packages the API into a server function; two other executable functions perform daily application cleanup and hourly Discover reindexing. Knex targets PostgreSQL/Neon in production and SQLite for guarded tests. This inventory found 381 backend non-test JS files, 570 client JS/TS source files and 231 migrations; these are scope counts, not a claim that each file received equal scrutiny.

| Boundary | Actual flow and sensitive assets | Security invariant that matters |
| --- | --- | --- |
| Public/marketing → app | Next site links to app and proxies `/api/*`; shared parent-domain session configuration | Marketing compromise can affect the app's trust boundary; it is not an unrelated brochure |
| Browser → Firebase → Express | Verified Firebase ID token exchanged for a DB-backed Express session; agency context/role in session | Identity verification, session regeneration, current account status and current membership authority are separate checks |
| Talent → database | Profile, DOB, phone, body measurements, consent, images, applications, immutable submission packages | Owning a profile does not authorize every downstream audience or processing purpose |
| Talent → storage → public/agency viewers | Multipart upload → Sharp → original/processed/thumbnail objects → R2/CDN URLs; external-card alternate path | Approval attaches to bytes, not image ID; private/review/deleted data must remain inaccessible by known URL |
| Talent → agency/open call | Package selection, consent fingerprint, submission transaction, agency review, event offers/shortlists, messages | Tenant scope, membership permission, reviewed purpose/terms and withdrawal must survive every alias/export |
| Email link → app | Guardian, invitation, claim, designer-share and message-reply bearers | Possession proves possession, not guardian identity; current lifecycle must still permit the action |
| App → agency receiver | CSV/export packages and HTTPS submission webhook | Only explicitly disclosed fields may leave; retries must not require resubmitting talent consent |
| App → AI/moderation | Groq image/PDF jury and text/semantic processing; moderation provider/heuristics | Purpose-specific consent and age rules at the actual dispatch boundary, bounded vendor spend |
| App ↔ Stripe | Checkout/customer/portal APIs, signed raw-body events, subscription/entitlement state, age-verification events | At-least-once, out-of-order input; no duplicate billing; recoverable, idempotent effects |
| Registry → export/browser | Versioned requirement records, matcher, re-encode/ZIP generation, public reference-agency projection | Publishing authority and immutable revisions; selected artifacts conform without implying affiliation |
| Jobs/providers → deletion/recovery | Retention redaction, application auto-close, provider deletions, failure rows | Durable ownership of cleanup work; no stale worker overwrites a new user decision |

Attacker classes considered: anonymous scrapers and resource abusers; malicious talent using their own account; a real agency with abusive intent; a viewer, restricted admin or removed colleague; a compromised mailbox/bearer; a teen claiming parental permission; a webhook receiver; anyone with repository/CI-artifact access. Provider outage, duplicate delivery, concurrent legitimate actions and operational mistakes are also threats. The highest-value assets are minors' identity/location/contact, identifiable photos and originals, application authority, financial state, consent evidence and the ability to revoke access.

### Product implications of the strategy

Pholio's strategic value is talent-owned preparation and portable artifacts, verified agency intake, an honest record of submission/review, and event casting—not a replacement agency booking/finance suite. Therefore:

- Exported files and hosted attachments are core security boundaries, not secondary conveniences. A polished in-app privacy gate is ineffective if a second delivery channel sends the omitted data.
- “Official agency” trust must survive a staff member's removal and malicious agency behavior, not just prevent arbitrary UUID substitution.
- Compensation, event purpose and the selected package are material consent inputs. Recording whatever the organizer's current record says at submit time is not proof the applicant saw it.
- Auto-close and external delivery affect the promise of a truthful submission history. They need correctness under ordinary races/outages.
- A tools subscription should not silently become payment for reach. Current tier-blind quota logic and actual Spec Registry ZIP exports were observed; the historical strategy's contrary findings are not repeated here. This is a technical observation, not a legal classification of the business.

## Findings and launch disposition

“Block” means fix and verify, or disable the entire affected surface before launching it. “Conditional block” means an important exploit prerequisite remains deployment-dependent; resolve that prerequisite rather than treating uncertainty as safety. Severity describes likely impact, not a claimed CVSS calculation.

| ID | Finding | Severity / evidence | Launch disposition |
| --- | --- | --- | --- |
| F01 | Committed database credential | High; tracked non-placeholder secret, validity unknown | Block pending revocation/rotation evidence |
| F02 | Legacy agency mutation permission/revocation bypass | High; real-handler proof | Block agency use |
| F03 | Role demotion leaves old session privileges | High; resolver proof + route trace | Block agency use |
| F04 | Restricted admin can remove own DENY | High; real-handler proof | Block agency use |
| F05 | Legacy login alias allows login CSRF | Medium; middleware proof, browser not exercised | Fix before public authentication |
| F06 | Reply bearers bypass bans, withdrawal and message limits | High; handler proof | Block messaging unless alternate path disabled |
| F07 | Image replacement inherits approval without moderation | High; handler proof | Block real-photo publication |
| F08 | Raw originals/known private URLs lack app storage authorization | High, conditional on CDN ACL; byte/key proof | Verify private delivery or block |
| F09 | Image deletion forgets objects and ignores purge failures | High; replace/delete proof | Block real-photo storage |
| F10 | External comp cards bypass safety and object deletion | High; handler proof | Disable or fix attachments |
| F11 | Public PDF AI jury bypasses owner consent/age policy | High, conditional on configured Groq; dispatch proof | Disable jury or fix before PDFs |
| F12 | Minor direct contact escapes through export webhook | High; serializer proof + caller trace | Block minors/webhooks combination |
| F13 | Provider-erasure retry queue has no shipped consumer | High; complete callsite search | Block real accounts pending working recovery |
| F14 | Stripe claim-before-effect permanently loses failed work | High; real handler + SQLite proof | Block payments/affected identity events |
| F15 | Concurrent Stripe events corrupt final entitlement | High; controlled interleaving | Block payments |
| F16 | Duplicate checkouts collapse distinct paid subscriptions | High; source + local state proof | Block payments |
| F17 | Consent fingerprint omits artifact/event terms | High; pure-function proof + UI/server trace | Block affected submissions |
| F18 | Auto-close overwrites concurrent agency acceptance | High integrity; controlled interleaving | Disable job's transition or fix before intake |
| F19 | Guardian confirmation establishes mailbox access only | High safety limitation; source trace | Block minors pending explicit assurance decision |
| F20 | Affected native image decoder and Next.js dependency | High / potential critical impact; advisory + harmless reachability proof | Patch and verify runtime before launch |
| F21 | Backend test failures cannot fail their CI step | Medium; workflow source | Require release gate before launch |
| F22 | Expensive paths lack effective global bounds | Medium; source, no load test | Demonstrate limits before enabling public costly paths |
| F23 | Agency webhook deliveries have no durable replay | Medium; source | Block reliance on webhook as authoritative intake feed |

### F01 — A real-looking database credential is committed

**Where:** `.env.migration:2`, tracked by Git. The value is a full PostgreSQL connection URI to a Neon host with nonempty username/password, not a placeholder. The inspection printed only structural booleans; the credential is deliberately not reproduced here.

**Who/impact:** Anyone able to read the repository, a historical clone or an artifact containing that file obtains the credential. If still valid and reachable, the database role's grants determine access to personal data and ability to alter/delete records. Repository visibility, current credential validity and DB privileges were not tested. No compromise is established.

**Required:** Rotate or independently establish revocation; identify affected role/project and inspect access logs through authorized operations. Remove the secret from tracked content, review copies/history and enable secret scanning. Removing the file alone is not revocation. Do not rewrite shared Git history without coordination.

### F02–F04 — Agency authorization is not authoritative across requests and aliases

**F02:** `POST /dashboard/agency/applications/:applicationId/:action` in `src/domains/agency/routes/roster.js:31` requires only the coarse AGENCY role. Its nominal guard applies only to `/api/agency` (`agency-api-guard.js:28`). The outer `requireActiveAccount` (`src/app.js:910`) checks the human, not current workspace membership. The handler queries application ID plus agency ID, then directly writes accepted/declined/archived at `roster.js:88`. A current VIEWER or removed member with an existing cookie and known application ID can make an unauthorized decision. The legacy invite at `roster.js:147` has the same boundary gap. This is **not cross-agency IDOR**; it is missing within-agency authority and transition enforcement. The actual VIEWER handler proof writes `accepted`.

**F03:** Demotion updates `agency_memberships.membership_role` (`inbox.js:2978`), but `resolveEffectivePermissionsFromSession` (`services/permissions.js:35`) uses `session.agencyMembershipRole`. The canonical active-membership/legal check (`services/legal-acceptance.js:168`) does not refresh the role. A demoted ADMIN's old cookie retains export/team powers; the resolver proof confirms ADMIN export remains allowed. Canonical membership **deactivation** is checked; active-member **demotion** is the separate defect.

**F04:** `DELETE /api/agency/team/:membershipId/permissions/:permission?effect=DENY` (`team-rbac.js:236`) allows a restricted ADMIN with `team.revoke_permission` to delete a DENY on their own `org.export_data`. DELETE lacks PUT's self-edit prohibition. The real handler proof shows export denied, self-DENY removed, then export restored. Same-tenant validation does not prevent this escalation.

**Required:** One current-member/effective-permission/transition service for every alias; invalidate or refresh old roles; treat removing DENY as a grant with self/delegation protections. Acceptance tests must use cookies minted **before** demotion/removal and cover legacy paths. Merely hiding buttons or patching `/api/agency` is insufficient. Full route/evidence detail: auth lane A1–A3.

### F05 — `/login` bypasses the origin protection on `/api/login`

`src/shared/middleware/same-origin-mutation.js:28`/`:109` omit `/login`; `auth/routes/auth.js:361` mounts both aliases on the same form-capable handler (`:394`), which establishes the provided Firebase identity's session (`:854`). An attacker can induce a top-level form POST containing their own valid Firebase token. The victim can then enter photos/PII in the attacker's account if they do not notice the identity swap.

The actual guard accepts the foreign-origin `/login` request and rejects `/api/login`. CORS does not block ordinary HTML form submission, and this attack does not need the victim's existing cookie. This is login CSRF/session swapping, **not theft of the victim's existing account**. Browser behavior was not reproduced. Remove or identically protect all session-lifecycle aliases and test with a real cross-origin form; review `/logout` too. Auth lane A4 contains details.

### F06 — Existing reply tokens outlive moderation and withdrawal

`/api/reply/:token/messages` is mounted before the active-account guard (`src/app.js:885`). `message-reply-tokens.js:168` checks token hash, expiry and identity, but its context query (`:58`) omits account/application/block status. The handler inserts and notifies (`messaging/routes/message-reply.js:90`, `:111`, `:139`). The message limiter in `app.js:729` matches only the canonical talent/agency application paths.

A banned talent holding a still-valid three-day reply link can keep sending messages/notifications. Withdrawal deletes/redacts the old thread but does not revoke this bearer, so it can recreate messages after withdrawal. A script can supply ordinary Origin/custom headers; those are not authorization against the token holder. The proof produces 25 inserts for a banned-user/withdrawn-application fixture. No throughput claim is made. Deleted-account joins fail, and guardian revocation has a separate token purge; those are not the demonstrated cases.

Require current lifecycle authorization at every message ingress, revoke/reject old tokens on the relevant transitions, and rate-limit by stable actor/application identity. Test existing links after ban, withdrawal and agency closure. Auth lane A5 has exact paths.

### F07 — Replacing approved pixels preserves their old approval

`POST /api/talent/media/:id/replace` (`media.js:2481`) checks ownership and calls `processImage` at `:2523`, but invokes neither normal moderation nor CSAM screening. Its update preserves old moderation/audience fields. An abusive talent can first obtain approval for a benign photo, then replace it with different decodable pixels that retain `approved` and public visibility. Public/agency viewers trust those old flags.

The real-handler proof changes the URL, preserves approval/public state, and records zero moderation calls. This does not depend on bypassing a particular vendor classifier. Attach approval to the new content/version, reset visibility and run the same moderation pipeline for every replacement. Test review/escalation verdicts through public, agency and PDF paths. Privacy lane PM-01.

### F08 — Processed-image privacy does not cover raw originals or known object URLs

`src/shared/lib/uploader.js:246` derives the original and processed key from one UUID. The R2 path writes raw `file.buffer` to the original (`:328–357`) and emits public URLs from the same bucket/prefix family. An observer knowing `processed/UUID.webp` can derive `originals/UUID.<original extension>`. Real Sharp testing confirms synthetic EXIF survives the raw original while disappearing from the displayed WebP.

**Conditional external exposure:** If the configured CDN serves the original prefix, someone who sees a published photo can recover embedded metadata, potentially GPS/time/device information. Known URLs to private/review media similarly bypass DB listing flags unless an independent storage access layer exists. No live CDN ACL was inspected, no GPS-bearing real image was used, and UUID enumeration is not alleged. Original filenames are client-provided; relying on extensions being hard to guess is not an access policy.

Put originals behind separate authorization or strip/discard unnecessary metadata. Verify anonymous requests to known original/private/review keys fail and revocation affects previously issued access. Show the actual Worker/bucket rules if they already enforce this. Privacy lane PM-02.

### F09 — “Image deleted” can mean the row is gone but the files remain

`DELETE /api/talent/media/:id` (`media.js:2266`) does not inventory the `original_*` fields preserved by replacement (`:2583`), omits original WebP in its derived extension list, ignores `Promise.allSettled` purge failures (`:2337`), then drops the row (`:2379`). The proof confirms pre-edit artifacts and an original WebP are never deleted. Later account deletion scans existing image rows (`account-deletion.js:230`) and cannot discover forgotten keys.

Someone retaining an earlier URL may retain access after deletion where the CDN serves the object. Orphaned retention exists even without public access. Persist a complete artifact inventory and durable purge work before dropping ownership rows; retry failures and distinguish pending erasure from completed erasure. Test edit→replace→delete plus provider failure/recovery. Privacy lane PM-03.

### F10 — External comp-card upload is an ungoverned second media path

`external-comp-cards.js:41–62` accepts PDF/JPEG/PNG/WebP, checks only initial magic bytes (`:26`), writes raw bytes and returns a public URL. It selects only profile ID, not age/guardian/audience, and does no moderation, image metadata stripping or full document validation. DELETE (`:65–68`) only sets `deleted_at`. Account erasure inventories `images`, not these objects; the metadata FK cascade does not delete R2 files.

An authenticated talent can host/share content through this route that the main upload path would review, and recipients with the URL may retain access after image/account deletion. The harmless proof accepts `%PDF-`-prefixed non-document bytes and confirms zero object deletions. This is **not a PDF code-execution demonstration**. Storage limits bound one file, not aggregate account storage.

Disable this surface until it has an explicit attachment policy, private access until intended sharing, moderation/validation appropriate to format, and lifecycle-complete object deletion. Privacy lane PM-04.

### F11 — A visitor can initiate AI analysis of an opted-out talent's PDF

Unauthenticated `GET /pdf/:slug` (`pdf/routes/pdf.js:2104`) defaults `jury` to true unless the visitor supplies `?jury=0` (`:2346`). The current generator (`pdf/generator.js:339–370`) checks that flag, `GROQ_API_KEY` and non-test runtime, renders candidate card fronts, then `front-program/jury.js:115–130`, `:225–236` sends screenshots to Groq. It does not check the owner's AI consent or age.

With Groq configured, a visitor's ordinary download can transmit photos/printed identity details for an opted-out adult; a shareable guardian-consented minor can also reach the provider despite the central image-AI age policy. The proof intercepts actual jury-provider request construction with synthetic screenshots; route/default/template reachability was source-traced, not browser-rendered. No actual talent data was sent externally.

Disable the jury on public downloads or enforce owner purpose-specific consent/age at dispatch. A visitor URL parameter cannot authorize use of someone else's photos. Bound public rendering/provider spend. This finding is independent of concurrent changes to PDF visibility/rights guards. Privacy lane PM-05.

### F12 — A minor-safe snapshot is bypassed by the webhook serializer

The submission route explicitly sets `contact: null` for minors (`applications.js:1771`), then calls `dispatchSubmission` with raw `profile` (`:1980`). `export-webhook-dispatch.js:78–107` sends `contact.phone` and `contact.email` without age checks. An agency OWNER/ADMIN configuring a receiver can obtain a guardian-consented applicant's direct contact outside the platform.

Direct phone leakage is established; email depends on whether profile-level email is populated, since canonical account email normally lives in `users`. The actual payload proof includes both from the supplied synthetic profile. This contradicts the disclosure that direct contact is omitted (`submission-disclosure-content.js:67`) and bypasses the in-product minimized package.

Serialize the immutable, consented minor-safe package through one shared DTO. Test complete webhook delivery with a minor's direct phone present and assert it never leaves the process. Disabling only the UI contact display does nothing here. Privacy lane PM-06.

### F13 — Account-erasure retry machinery is not scheduled

`account-deletion.js:275–294` records provider failures and later removes application account rows. Its exported `processPendingDeletions` (`:337`, `:443`) has no caller in `src`, `netlify` or `scripts`; only tests invoke it. The deployed daily/hourly functions do other work. A normal transient R2/Firebase outage can therefore leave pending erasure indefinitely without manual intervention.

The response correctly acknowledges pending erasure; this is not a false synchronous-success finding. An external operator could have an independent/manual consumer, but none was verified. Wire and demonstrate bounded retries with ownership, backoff, completion status and oldest-pending alerts. Include the orphan cases in F09/F10; running the current retry function alone cannot recover keys that were never recorded. Privacy lane PM-07.

### F14 — Stripe events are marked processed before their work succeeds

`stripe-events.js:111–150` claims an event and inserts outcome `processed` (`:129`) before the webhook handler runs its business effect (`stripe-webhook.js:43` onward). `alreadySeen` (`stripe-events.js:64`) treats row existence as completion. On a later error, the handler returns 400 (`stripe-webhook.js:175`) without releasing or marking the claim retryable. The next delivery is acknowledged as a duplicate.

The actual handler proof makes a trial-notice sender fail once. Delivery one returns 400; a healthy retry returns 200/duplicate; the sender is called only once. A DB/provider failure after claim in subscription or identity handling has the same loss boundary. This is not hypothetical provider delivery semantics: Stripe documents retries, duplicates and unordered events. [Stripe webhook guidance](https://docs.stripe.com/webhooks).

Use a durable processing state with recoverable claims/leases and transactional local effects, plus an outbox/idempotency strategy for external effects. A unique event row by itself is not successful processing. Acceptance: fail after claim at each effect boundary, retry, then verify the intended effect completes once rather than disappearing.

### F15 — Stripe event timestamps do not serialize the subscription update

`isStale` reads state before work (`stripe-events.js:78`); `markApplied` updates the event high-water mark afterward (`:157`). Neither wraps the business update and ordering decision in a shared serialized transaction. Two different events can both pass the initial read.

The controlled SQLite interleaving claims an older active event and a newer cancellation, applies cancellation first, then finishes the older active handler. The subscription becomes active and `profiles.is_pro` becomes true while `last_stripe_event_at` still records the newer cancellation. No forged signature is involved; normal overlapping provider invocations suffice. A malicious customer might benefit from timing, but accidental state corruption alone is the finding.

Serialize by subscription/customer and atomically couple ordering with local mutation, or reconcile against authoritative current provider state with equivalent locking. Test both completion orders on PostgreSQL, equal-timestamp events, retries and process death. The proof establishes the logical interleaving, not production race frequency.

### F16 — Multiple checkouts can create paid subscriptions the local model cannot represent

`stripe.js:72` checks an existing subscription, then creates a customer/checkout at `:84`/`:110` without a durable pending-checkout reservation. `shared/lib/stripe.js:28`, `:100` create provider objects without idempotency options. Two tabs before either checkout completes can therefore create separate sessions. Completion writes through `subscriptions.js:304–306`, which matches by subscription ID **or customer ID or user ID** and updates the matched row.

The proof supplies two distinct active provider subscriptions for one customer/user: only one local row remains, holding the second ID. Canceling the second removes Pro while the first remains active in the fixture's upstream state. Completing both real sessions can result in duplicate subscriptions/trial conversions/charges; no real charge was attempted or observed.

Persist/reuse a bounded pending checkout, use provider idempotency correctly, retain distinct provider subscriptions, prevent/reconcile duplicate entitlement-bearing subscriptions, and make portal/cancellation behavior cover every billable object. Test concurrent creation and completion rather than only repeated webhook IDs.

### F17 — Recorded consent is not bound to all the material being sent

`canonicalSubmissionPackage` (`talent/services/submission-disclosure-consent.js:95`) and its client mirror omit `externalCompCardId`, event compensation/date/brief revision and the reviewed disclosure version. The UI supplies an external card while computing its binding, but the canonical function drops it. The submit route resolves/saves that card (`applications.js:1197`, `:1759`) independently of the compared fingerprint (`:1308–1330`). Switching cards can leave confirmation bound to the same key.

An organizer can also edit event/compensation fields (`agency/routes/open-call.js:349–394`) between applicant review and submission. The server reloads current event data and records a current disclosure (`applications.js:1348`) without comparing the event terms the applicant reviewed. A paid→unpaid change or changed event date can therefore be recorded under an unchanged package fingerprint. This does not give an outsider another person's card; card ownership checks exist.

The pure-function proof shows changed external-card ID, event end, compensation and disclosure version leave the hash identical while the disclosure builder produces different records. UI/server behavior is source-traced, not a two-browser timing demonstration. Include the selected artifact/content version and reviewed disclosure/brief revision in the server-validated consent binding; on material changes return a re-review requirement. Test card swap and concurrent organizer term changes.

### F18 — Scheduled auto-close can erase a fresh acceptance

`shared/lib/application-auto-close.js:166` selects stale candidates earlier, then updates by application ID alone. If an agency accepts after selection and before update, the cleanup writes `closed_no_response` over that acceptance. The isolated proof injects exactly that legitimate acceptance and observes it overwritten.

This corrupts the submission record and can produce a false closure notification; no malicious actor is needed. Use a conditional status/version/age update and only notify after a successful transition, or lock and re-evaluate inside a transaction. Test concurrent accept/shortlist/withdraw against cleanup and assert the winning state remains consistent with the activity/notification record.

### F19 — Guardian links do not establish guardian authority

The minor supplies `guardian_email` (`talent/routes/guardian-consent.js:107`). `talent/services/guardian-consent.js:137` emails it, and confirmation at `:329`/`:398` sets account/agency consent based on possession of that bearer. It can be the minor's own email. A minor can request and confirm their own link; requiring a different address alone would still not establish an adult relationship.

This is a verified assurance limitation, not an assertion that a specific statute always requires ID collection. Tokens are random/hashed and confirmation is affirmative/atomic; those are useful but answer a different question. Before a minors launch, define the age/authority assurance needed for each jurisdiction and purpose, independently assess the flow, and test revocation at every export/provider boundary. Collecting more identity data also creates risk and is not automatically the correct solution.

New York's regulator distinguishes strictly necessary processing from other processing of known users aged 13–17; a broad mailbox checkbox is not evidence every downstream purpose meets the rule. Legal applicability and consent design need qualified review. [NY Attorney General guidance](https://ag.ny.gov/child-data-protection-act-guidance). The audit did not establish a new-under-18-signup bypass; these findings apply where minors are admitted/existing and the corresponding flows are enabled.

### F20 — A current native-decoder advisory has a reachable untrusted-input path

Final lock inspection: app Sharp **0.35.3**; locally loaded libheif **1.23.1**. `uploader.js:121–133` checks client-declared MIME, not actual format, then `processImage` gives the bytes to Sharp (`:269` onward). The replace route uses this path (`media.js:2485`, `:2523`). The harmless proof generates an 8×8 AVIF, labels it JPEG, passes the real upload filter and successfully decodes it with the installed Sharp. No malformed image was constructed.

The maintainer identifies affected untrusted-input processing before Sharp **0.35.4**, with possible code execution on glibc Linux under specified conditions; patched prebuilt binaries use libheif **1.23.2**. Local macOS execution is **not** proof of Linux exploitation, and the exact deployed Node/native binary hardening was not inspected. Nevertheless, an exposed affected native parser is a launch blocker until patched or disabled at the decoder boundary. MIME/extension allowlists do not mitigate content-based decoding. [Sharp maintainer advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c).

Current `pholio-site` locks **Next 16.3.0 / Sharp 0.35.3** and leaves image optimization enabled with remote sources including app/pholio subdomains (`next.config.ts:33`). Next's AVIF optimization advisory is patched in **16.3.3**. Confirm whether the deployed host executes this optimizer and can receive attacker-controlled AVIF from an allowed source; that complete chain was not demonstrated. Its separate Windows-filesystem RCE advisory is not evidence of an exploit on the intended Linux/serverless deployment. [Next AVIF advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), [Windows-specific advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36).

Update both lockfiles/native artifacts, rebuild in the supported target runtime and confirm the deployed versions—not just the package manifest range. If an immediate mitigation disables the decoder, verify every Sharp entry point and format-sniffing path, not only the main upload form.

### F21 — Security-relevant backend test failures are informational in CI

`.github/workflows/ci.yml:55–77` names the job “Server tests (informational)” and sets `continue-on-error: true` on `npm test`. A regression in auth/payment/privacy tests therefore does not fail that step as a release barrier. Branch protection was not inspected; even requiring this job would not make its ignored test failure authoritative.

The workflow also uses Node 20 (`:62–65`), while locked Puppeteer 25.3 requires Node ≥22.12 and Chromium 149 requires ^22.17 or ≥24. Netlify's build config uses 22, but the live function runtime was not verified. Root/client manifests lack an engines declaration. This mismatch weakens confidence in CI as production validation; it is not proof PDFs currently fail in production.

Make backend checks release-blocking, resolve the suite-level failure described below, align supported runtime/native binaries, and run production-like PostgreSQL/browser smoke tests. Netlify's client build uses `npm install` rather than a frozen `npm ci` (`netlify.toml:4`); freeze the release dependency graph and verify required migration/registry publication steps explicitly. Manual release scripts exist, so absence from the build command is not proof production migrations are missing.

### F22 — Several expensive paths are not bounded at the relevant boundary

The public PDF path in F11 starts browser/render work and potentially provider analysis without a matching PDF-specific limiter in `app.js:620–740`. External comp-card upload has a per-file cap but no route/account aggregate object quota (`external-comp-cards.js:20`, `:41`). Spec export can perform multiple quality-rung encodes and buffer an entire ZIP (`spec-export-service.js`) without a matching export-specific limiter. General in-process rate-limit instances do not become a global account/provider budget across serverless instances.

Separately, a malicious agency webhook receiver can return a large error body: `agency/services/export-webhook.js:242` does `(await response.text()).slice(0, MAX_RESPONSE_BYTES)`. It buffers the whole body before retaining 2,048 characters. An inert 4 MiB response proof confirmed this; the five-second timeout limits time, not bytes. No actual OOM was induced.

Potential gains are storage/compute spend, worker memory pressure and submission latency. Actual throughput and provider costs were not measured, so no numeric attack-cost estimate is claimed. Add streaming byte caps, bounded render concurrency/cancellation, stable-identity quotas and distributed spend/abuse limits; load-test the configured deployment. An edge WAF could help, but its policies were unavailable.

### F23 — A failed export webhook cannot be reliably replayed

`agency/services/export-webhook-dispatch.js:59–69` records only endpoint-level last result/failure count, auto-disabling after repeated failures. `:115–134` sends directly, returns failure and catches errors; no durable per-submission delivery/outbox record schedules a retry. The application can succeed while the agency's receiver misses it. A later idempotent submission is not a reliable delivery replay operation.

A brief receiver outage, timeout or process death can thus leave an agency relying on external intake unaware of a successfully submitted applicant. The in-app application remains, so this is not loss of the authoritative DB row. It undermines the strategy's “no second inbox” exit path if the webhook is sold/used as a reliable feed.

Persist versioned, privacy-minimized events transactionally with submission; deliver asynchronously with bounded retries, deduplication keys, dead-letter visibility and authorized replay. Until then label the integration best-effort and require a reconciliation workflow rather than relying on it as the agency's sole intake source.

## Further observations, rejected claims and unresolved candidates

These are deliberately separate from proven high-severity findings.

### Spec Registry and conforming exports

Actual ZIP creation/re-encoding exists; the strategic analysis's historical “no artifact” conclusion is obsolete. Reviewed registry routes scope talent operations to their own profile; IDs/list sizes are validated; publisher payloads/revisions are hashed; agency-origin publishing checks the same agency; public projections use an allowlist rather than raw talent records. No arbitrary cross-profile export or registry write bypass was established.

Two narrower problems deserve regression coverage: `spec-export-service.js:149` converts explicit empty image selection to `null` (all eligible images), despite the matcher distinguishing “nothing selected”; and `matcher-input.js:22` does not apply moderation status when choosing eligible images. These are own-library selection/consistency defects, not demonstrated cross-user data theft. Check returned ZIP contents against exact selection, review status, modality/prohibited-shot constraints and revision. Memory/resource behavior is included in F22. No every-agency-spec conformance certification was performed.

### Moderation escalation, transport and browser defenses

- The heuristic moderation producer emits camel-case flags and comma-joined reasons (`content-moderation.js:288–320`), while special escalation reads snake-case flags and exact `high_skin_ratio` (`csam-moderation.js:44–50`). Combined flags can remain ordinary review rather than receive special escalation. This is a prioritization-contract defect; the image still goes to review. Skin/aspect heuristics are not proof of CSAM detection capability.
- Export-webhook DNS validation discards resolved addresses before normal `fetch` resolves again; no address pinning binds validation to the connection, and IPv6 handling needs canonical review. HTTPS certificate requirements and live egress policy materially affect exploitability. No internal endpoint, metadata service or DNS-rebinding exploit was demonstrated. Retain redirect prohibition and use a validated, pinned transport.
- The stored agency-logo URL path (`pdf.js:3488`) and legacy PDF `<img>` source (`templates/compcard.ejs:757`) warrant browser-network tracing. URL parsing alone is not SSRF prevention, but current engine/theme reachability and internal-network access were not proved. Do not label this a proven critical SSRF.
- CSP is report-only in app/site configuration, not an enforced script policy. No exploitable stored-XSS sink was established in the reviewed paths. Treat enforcement as defense in depth with browser compatibility testing, not as a substitute for an actual XSS finding.

### Controls independently observed

Firebase verification and verified-email identity matching exist; login regenerates sessions. Stripe signatures are checked against the raw request body before JSON parsing. Most canonical agency queries reviewed carry agency scope, canonical inactive-membership checks exist, and moderator access uses explicit configured IDs. Bearers are high-entropy/hashed with expiry; designer shares have constrained snapshots/revocation checks. Normal uploads invoke moderation and processed images strip metadata. Submission transactions, package snapshots, quota serialization and retention/redaction callsites are real. These controls are evidence against generic claims of universal IDOR, unsigned webhooks or no consent implementation—but do not cover the concrete alternate paths above.

## Verification results and supply-chain triage

### Tests actually run

| Check | Result | Interpretation |
| --- | --- | --- |
| Guarded full backend `npm test -- --silent` | 283/284 suites passed; 3,787 passed, 1 failed, 10 skipped (3,798 total); exit 1 | Not a clean full-suite run |
| Focused `tests/talent/oauth-account-avatar.test.js` rerun | 1 suite/1 test passed; exit 0 | Full-run failure did not reproduce in isolation; cause unresolved |
| Client `npm run --prefix client test` | 89 files, 932 tests passed; exit 0 | jsdom unit/integration coverage, not real-browser safety/accessibility validation |
| Five offline adversarial proof scripts | All passed | They confirm the defects/reachability described here, not remediation |
| Three final `npm audit --json --registry=https://registry.npmjs.org` checks | Findings below | Dependency advisories, not counts of exploitable product bugs |

The full-run backend failure was `tests/talent/oauth-account-avatar.test.js:97`: GET `/api/talent/profile` returned 404 where 200 was expected after successful account entry. Its isolated rerun passed. Do not claim either a consistently broken endpoint or that the full suite passed. Investigate suite isolation/order and rerun the full gate after remediation. The test runner was inspected first: it forces isolated SQLite and strips production DB configuration. No direct Jest invocation against developer/production DB settings was used.

### Final dependency snapshot

The final registry query on this date supersedes earlier lane snapshots; it returned more advisories. Counts include development/transitive packages and can change as the advisory database changes.

| Lockfile area | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| App root | 1 | 14 | 15 | 2 | 32 |
| Client | 1 | 10 | 5 | 2 | 18 |
| Current `pholio-site` | 1 | 3 | 0 | 0 | 4 |

Priority is the reachable native image boundary in F20, not the loudest scanner count. Other important triage examples:

- `websocket-driver` 0.7.4 has protocol-length corruption and compression-limit advisories, patched in 0.7.5. It is transitive through Firebase-related packages; no attacker-controlled Pholio WebSocket server using it was established. The compression advisory alone is moderate; the critical package count also includes the separate length-corruption advisory. [Maintainer length advisory](https://github.com/faye/websocket-driver-node/security/advisories/GHSA-xv26-6w52-cph6), [compression advisory](https://github.com/faye/websocket-driver-node/security/advisories/GHSA-mp7j-qc5w-4988).
- React Router's reported CSRF advisory concerns unstable RSC mode. This client uses an ordinary SPA, so that advisory was not established as applicable to this runtime. Patch as routine hygiene without presenting it as an exploitable app CSRF. [Maintainer advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-qwww-vcr4-c8h2).
- Nodemailer has multiple flagged inputs/features. In particular the raw-option file/URL-access advisory requires attacker influence over that message option; ordinary user text in a template does not establish it. No such full message-options control was established in reviewed callers. A major-version fix was suggested by the scanner and needs compatibility testing, not blind `audit fix --force`. [Raw-option advisory](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-p6gq-j5cr-w38f).

No dependency install/update, lockfile rewrite or build/publish was performed. The actual deployment artifact/SBOM must be checked after updates, including optional native packages, not assumed from local macOS `node_modules`.

## Coverage and limits

| Area | Work completed | Remaining assurance |
| --- | --- | --- |
| Auth/sessions/RBAC | Actual mounts, identity exchange, origin guard, membership/permission mutation, token flows, focused proofs | Real browser cookie/subdomain behavior, live Firebase settings, full session revocation matrix |
| Talent/agency/open calls | Ownership/tenant paths, submissions, event consent, review aliases, messages, claim/share samples, lifecycle race | Every event/legacy roster/commission workflow was not fully exercised end to end; agency vetting operations unverified |
| Storage/public profiles/PDF/AI | Upload/replace/delete, external attachments, public rendering/provider dispatch, metadata proof | Live CDN ACL/cache invalidation, deployed browser networking/native decoder, vendor processing/retention |
| Minors/privacy/moderation | Guardian/account/agency grants, minimized snapshot versus export, moderation paths, erasure/retry/retention | Jurisdictional legal sign-off, guardian assurance, staffing/reporting/removal operations, backup erasure |
| Payments/recovery | Raw signature mount, checkout/customer/subscription/events, notice failure/reordering/duplicate proofs | Stripe test-mode full journey, endpoint API version, real reconciliation, refunds/cancel edge cases, PostgreSQL parallel tests |
| Spec Registry/exports | Publication scope/revisions/projection, matching and actual ZIP/re-encode route | Every spec/format constraint, consumer interoperability, peak memory/load |
| Infrastructure/supply chain | Netlify/CI/runtime/package inspection, secret structural scan, guarded suites, current primary advisories | Live IAM/DB grants/network/WAF, branch protection, deploy artifact/configuration, restore drill, production load |
| Frontend safety/accessibility | Consent binding, role/lifecycle API effects, client suite; selected safety-critical flows read | No comprehensive keyboard/screen-reader, mobile/browser, consent-dialog focus or emergency-reporting usability pass |

No production data was queried to count exposure, validate the leaked credential, test a provider outage or examine customer subscription duplication. No live pentest, full browser E2E run, deployment build, load benchmark, backup restore, access-log/incident review or exhaustive Git-history secret scan was performed. Therefore this report cannot certify production configuration, prove absence of other vulnerabilities, or quantify affected users. The proof harnesses intentionally replace I/O and do not validate database planner behavior or deployment middleware outside the traced code.

## Production evidence required before a go decision

In addition to the concrete fixes, obtain evidence—not another architecture assertion—for:

1. **Deployed surface and identity:** exact app/site SHAs and lock/native versions, actual function Node runtime, domains/proxies/cookies, all public routes/aliases and launch feature flags; successful old-cookie revocation tests.
2. **Data protection and recovery:** private original/review object access tests, known-URL erasure tests including external cards/edit history, deletion retry recovery and age-of-backlog alert; actual DB least-privilege roles, isolated testing, backup restore and deletion/backup policy.
3. **Money:** isolated Stripe test-mode duplicate/reordered/failure replay, one-customer/multiple-session handling, complete subscription reconciliation and cancellation, verified live webhook API version and alert delivery. Signed events alone are insufficient.
4. **Safety operations:** real report intake→review→remove→known-copy handling, moderator access/revocation, user blocking across all message paths, accountable response coverage and guardian/age policy. The FTC now describes enforcement of covered platforms' 48-hour removal requirement and reasonable efforts on known identical copies; legal pages alone do not demonstrate that workflow. Applicability needs legal review. [FTC enforcement notice](https://www.ftc.gov/news-events/news/press-releases/2026/05/ftc-begins-enforcing-take-it-down-act).
5. **Third parties:** actual provider keys/features enabled, recipient/purpose-specific consent, data processing and retention terms, webhook transport restrictions, external agency-data handling and end-user disclosure consistent with actual payloads.
6. **Release/operability:** required green backend/client gates, supported runtime, migration/registry release check, bounded resource tests, observable failed jobs/events/deletions, verified paging and an exercised rollback/restore process. A dashboard/log statement in code is not evidence somebody will receive an alert.
7. **Safety-critical UI:** keyboard/screen-reader completion of reporting, consent, withdrawal, cancellation and deletion; truthful pending/success states after network failure, refresh and double submit. No blanket accessibility pass is claimed here.

These are unverified deployment/operational facts, not allegations that no such controls exist. Independent review of applicable privacy, child safety, talent-services and subscription requirements remains necessary; internal research and “tools-only” positioning cannot decide their legal application.

## Release sequence and final answer

First contain credentials and patch the native decoder/site dependency. Then consolidate authorization/messaging and disable unsafe alternate upload/AI/export paths while fixing artifact ownership/deletion. Repair Stripe processing and concurrency before charging anyone. Bind event/package consent and make lifecycle transitions atomic before accepting consequential applications. Close the minors-specific gates before enabling minors. Finally run the acceptance cases above against an isolated production-like environment and obtain the live configuration/operations evidence.

Do not fix only the main route: the recurring root cause is duplicated entry points and serializers with different security/lifecycle rules. Put authority, moderation-by-content, consented serialization, state transitions and durable effects at shared service boundaries, then prove all routes use them.

**Would I launch today with real talent, agencies, personal information and payments? No.** The evidence establishes concrete authorization, photo safety/erasure, consent/export and payment-integrity failures, plus an exposed credential and affected native decoder. A launch decision can change after those findings are closed or their complete surfaces are removed, and the remaining deployment/safety assurances are demonstrated. A high test-pass count or another written assurance is not a substitute.


## Supplemental issue register

These supplement F01–F23; they are not additional proven critical exploits. Their full analysis is included above and in the appendices.

| ID | Issue | Evidence status | Disposition |
| --- | --- | --- | --- |
| O01 | Explicit empty Spec Registry image selection becomes all eligible images | Source-confirmed own-library selection mismatch | Preserve empty selection; test ZIP contents |
| O02 | Spec matcher eligibility does not filter moderation status | Source-confirmed policy inconsistency | Apply canonical visibility/review policy; test reviewed/rejected assets |
| O03 | Moderation producer/CSAM escalation consumer disagree on flag names and combined reasons | Source-confirmed escalation-priority defect; ordinary review still applies | Normalize contract and test combined flags; do not equate heuristic screening with reliable detection |
| O04 | Export-webhook DNS validation is not pinned to the actual connection; IPv6 normalization needs review | Missing transport control verified; internal-service exploit not established | Pin validated addresses with correct TLS and canonical IP checks |
| O05 | Stored logo URL may enter a network-capable legacy PDF renderer | Candidate only; current engine/route reachability and deployed egress unproved | Trace browser requests safely; constrain outbound resources |
| O06 | App/site CSP is report-only | Configuration observation, not proof of an XSS vulnerability | Enforce a compatible policy after browser testing |

F22 separately includes the confirmed webhook error-response buffering issue; it must not be lost under the broader resource-limit heading. F21 includes supported runtime mismatch and non-frozen build dependencies. The main report also records all unresolved production, legal, safety-operations and accessibility assurance gaps without asserting those controls are absent.

## Finding-to-evidence cross-reference

| Unified finding | Supporting lane / proof |
| --- | --- |
| F01 | Lead structural secret inspection; no credential values included |
| F02 / F03 / F04 / F05 / F06 | Appendix A: A1 / A2 / A3 / A4 / A5; auth proof |
| F07 / F08 / F09 / F10 / F11 / F12 / F13 | Appendix B: PM-01 / PM-02 / PM-03 / PM-04 / PM-05 / PM-06 / PM-07; privacy proof plus caller search |
| F14 / F15 / F16 / F18 | Payment/lifecycle proof; complete lead analysis above |
| F17 | Consent-binding proof; complete lead UI/server trace above |
| F19 | Appendix A guardian-assurance limitation |
| F20 | Harmless decoder proof, lock versions and primary maintainer advisories above |
| F21 | Workflow source and complete test results above |
| F22 | Resource-path trace above; Appendix A A6 response-buffering proof |
| F23 | Complete delivery/outbox trace above |
| O01 / O02 | Lead Spec Registry analysis above |
| O03 / O05 | Appendix B additional observations |
| O04 | Appendix A transport follow-up |
| O06 | Lead configuration analysis above |

The appendices preserve detail that would otherwise require opening separate files. Their earlier working-tree/date notes remain historical evidence, not a newer deployment assertion. The final dependency table and recheck baseline in the lead report supersede earlier inventory snapshots.


## Appendix A: complete authentication and tenant analysis

### Authentication, tenant boundaries, messaging, and minor-consent audit

Date: 2026-09-08. Audited the current working tree, including existing uncommitted changes. Findings were rechecked after the lead reported concurrent auth/CSRF edits. This lane makes no product changes.

#### Method and evidence limits

Read actual Express mounts and middleware, auth/login and identity matching, agency membership/permission resolution and mutation routes, legacy agency form routes, team invitation tokens, public message-reply tokens and session bootstrap, guardian consent request/confirm/revoke, minor-submission access, open-call claim/intake, designer share tokens and routes. Read `docs/pholio-strategic-analysis-2026-08.md` as product context, not evidence of implementation or law. Its old inventory/consent conclusions were not adopted.

Executable evidence: `node docs/audits/2026-09-08-evidence/auth-tenants-proof.cjs` passed after the latest recheck. It loads the current source in a VM with explicit in-memory database substitutes, executes real route handlers and real permission/CSRF/token functions, and asserts results. No `.env`, app startup, real database, live server, or network access occurs. It proves handler and middleware logic; it is **not** a live deployment exploit or a PostgreSQL concurrency test. Actual mounting and missing outer controls were separately traced in `src/app.js`. No existing integration-suite result is presented as independent evidence.

#### A1 — High: legacy agency actions bypass permission and membership revocation

**Attacker:** An agency VIEWER, another role denied the action, or a removed agency member retaining an existing signed session. The human user account itself must still be active. The attacker needs an application UUID in their own agency, which a current viewer can obtain from the inbox; a removed member can retain one.

**Request:** `POST /dashboard/agency/applications/APPLICATION_ID/accept` with the existing session. `decline` and `archive` are alternatives.

**Actual path:** `src/app.js:910` mounts the agency router after `requireActiveAccount()`. `src/domains/agency/routes/index.js:6` includes `roster.js`. Its handler at `src/domains/agency/routes/roster.js:31` requires only the coarse `AGENCY` role. The nominal guard installed at line 26 is scoped to `/api/agency` by `src/domains/agency/routes/agency-api-guard.js:28`; it does not execute on `/dashboard/agency/...`. Therefore the current membership, legal acceptance, setup completion, RBAC, and custom grants are not checked. `requireActiveAccount()` checks the human user's account status, not the membership (`src/domains/auth/middleware/require-auth.js:295`). Removal only updates membership status (`src/domains/agency/routes/inbox.js:3057`) and does not destroy this session.

The handler loads the application by `id` and `agency_id`, then directly writes accepted/declined/archived status (`roster.js:61`, `:88`). A parallel legacy invite route (`roster.js:147`) has the same permission/membership gap and can send a talent invitation.

**Impact:** Unauthorized talent decisions and outbound agency communications, including after a workspace owner removes a colleague. The actor acts under the agency's authority. These paths additionally omit the API's state-machine protections: the status handler accepts any existing application without checking its prior status or event purpose. This merits separate regression coverage when consolidating the handlers.

**Proof:** Real `requireRole()` plus the real legacy accept handler accepted a VIEWER session and produced an `applications` update with `status: "accepted"`. The proof stubs the database, email delivery, and the adult access decision; it does not disable any handler-local permission check. Source tracing establishes why the API-only guard cannot intercept the route.

**Ruled out:** This is not a cross-agency IDOR: the application query does include the session's agency ID. Minor application access is checked, but with OWNER/ADMIN session-role shortcuts rather than effective permissions. A banned human is blocked by the outer account guard; a deactivated membership is not.

**Launch action:** Remove the legacy mutations or route them through the exact same current-member, permission, legal, minor-access, and transition service as the canonical API. Prove both VIEWER denial and immediate removed-member denial on every surviving alias.

#### A2 — High: demotion leaves existing agency sessions with their old privileges

**Attacker:** A previously authorized ADMIN who retains a session after the owner demotes them to VIEWER/SCOUT/AGENT.

`PATCH /api/agency/team/:membershipId` changes `agency_memberships.membership_role` only (`src/domains/agency/routes/inbox.js:2978`). `resolveEffectivePermissionsFromSession()` still takes the role from `session.agencyMembershipRole` (`src/domains/agency/services/permissions.js:35`, especially `:41`). It reloads custom permission rows, but never loads the actual membership role. The active legal/membership check selects only `membership.id` and checks ACTIVE status and identity (`src/domains/agency/services/legal-acceptance.js:168`); it does not refresh the session role. `/api/session` also computes permissions using that stale session (`src/domains/auth/routes/auth.js:1195`).

**Impact:** The demoted member can keep exporting applicant information, reading minor submissions where grants permit it, sending messages, managing invitations/roles, or altering workspace settings until the session is invalidated or reauthenticated. Setting the DB role to VIEWER does not remove the old ADMIN permission set.

**Proof:** Executed the actual permission resolver with an ADMIN session and a database substitute whose logged calls show only the permission-grants table. It retained `org.export_data`; the real VIEWER preset lacks that permission. Independently inspected the role-update handler for session invalidation and the active/legal check for role refresh: neither exists.

**Ruled out:** Full membership deactivation *does* block canonical `/api/agency` endpoints through the production legal guard; that does not fix active-member demotion and does not cover A1's legacy endpoints. Custom DENY changes are loaded per request; this defect specifically concerns the preset role.

**Launch action:** Resolve current membership status and preset role from authoritative DB state on authenticated agency requests, or atomically invalidate all member sessions on role changes. Test requests made with the pre-demotion cookie.

#### A3 — High: restricted administrators can delete their own DENY permissions

**Attacker:** An ADMIN whose principal denied a sensitive permission, while leaving the normal `team.revoke_permission` permission intact. Example: prevent export of talent data with a DENY on `org.export_data`.

**Request:** `DELETE /api/agency/team/OWN_MEMBERSHIP_ID/permissions/org.export_data?effect=DENY` with valid first-party headers and the actor's own cookie.

The route map requires `team.revoke_permission` (`src/domains/agency/lib/route-permissions.js:131`). That permission is included in the ADMIN preset (`src/domains/agency/lib/permissions.js:153`). The DELETE handler validates that the target membership belongs to the same agency, but does not reject targeting oneself or check whether removing a DENY grants a right the actor is forbidden from holding (`src/domains/agency/routes/team-rbac.js:236`, `:249`, `:257`). It deletes the DENY row. The permission engine recomputes the ADMIN preset without that denial and restores the restricted permission.

**Impact:** Principal-imposed restrictions on exports, minor-submission access, or other ADMIN powers can be undone by the restricted administrator. The UI's permission customization is not an enforceable security boundary for these users.

**Proof:** Actual permission computation showed export denied and `team.revoke_permission` allowed; actual DELETE handler returned success against the actor's own membership; recomputation restored `org.export_data`.

**Ruled out:** The PUT handler has a self-edit prohibition (`team-rbac.js:121`), but DELETE does not. Tenant scoping does not prevent within-tenant privilege escalation. A plain VIEWER without delegated revoke permission cannot execute this directly.

**Launch action:** Apply the same self-modification protection to DELETE. Treat removal of a DENY as a grant operation, with authority checks against both the resulting privilege set and protected administrative permissions.

#### A4 — Medium: the legacy `/login` alias permits login CSRF

**Attacker:** A person with their own valid Firebase token who can induce a victim to submit a top-level form. A hidden auto-submitted form can POST `firebase_token=ATTACKER_TOKEN` and `next=/dashboard/talent/profile` to `https://app.pholio.studio/login`.

The same-origin middleware protects `/api/login` but not `/login` (`src/shared/middleware/same-origin-mutation.js:28`, `:109`). Both paths execute the same authentication handler (`src/domains/auth/routes/auth.js:361`), which explicitly accepts URL-encoded `firebase_token` (`:394`); it then regenerates and establishes the supplied identity's session (`:854`). CORS uses an origin allowlist (`src/app.js:75`) and does not reject ordinary cross-origin form submissions; it merely controls CORS response visibility. SameSite=Lax does not stop setting a new cookie from a top-level login response, so this attack does not require sending the victim's existing session cookie.

**Impact:** The victim can be placed in the attacker's account. If they then upload photos, edit personal information, or work on an application without noticing the substituted identity, those actions affect an account the attacker controls. This is session swapping, **not** direct takeover of the victim's existing account. The frontend may display a different identity and the user may notice; that limits exploitation and is why this is rated Medium.

**Proof:** The actual same-origin middleware passes a headerless POST from `https://attacker.invalid` to `/login`, while rejecting the equivalent `/api/login` request. The shared form-capable route and session establishment were inspected. No browser-level end-to-end exploit was executed.

**Launch action:** Remove unused session-lifecycle aliases or apply the same origin/header protections to every alias. `/logout` is also absent from that guard; do not fix only the API spelling.

#### A5 — High: emailed reply tokens bypass bans and message limits

**Attacker:** Talent with a still-valid emailed reply bearer, including a talent subsequently suspended or banned. The bearer is normally valid for three days (`src/domains/messaging/services/message-reply-tokens.js:6`). No account takeover or token guessing is necessary.

**Request:** Repeated `POST /api/reply/TOKEN/messages` with a <=4,000-character message, the standard custom header, and app Origin. A script can supply both headers; the same-origin control is not authorization against the token holder.

The route is mounted before `requireActiveAccount()` (`src/app.js:885` versus `:910`). `validateReplyToken()` checks hash, expiry, and matching talent identity only (`src/domains/messaging/services/message-reply-tokens.js:168`). Its context query does not select or check account status, application status, blocked relationships, or agency status (`:58`). The reply handler immediately inserts the message and triggers agency activity/notification (`src/domains/messaging/routes/message-reply.js:90`, `:111`, `:139`). The global message limiter only matches `/api/agency/applications/.../messages` and `/api/talent/applications/.../messages` (`src/app.js:729`); the public reply router defines no limiter. Suspension/ban handlers simply update the user's status (`src/domains/moderation/routes/reports.js:458`, `:492`).

**Impact:** Platform moderation does not stop this communication path. A banned talent can keep sending messages/notifications with no application-level message quota until the token expires/rotates, filling storage and the agency's inbox. This is especially relevant to harassment response immediately before launch.

A related lifecycle defect: withdrawal deletes existing messages and revokes/redacts the package but does not revoke reply tokens (`src/domains/talent/routes/applications.js:2828`; `src/shared/lib/submission-retention.js:41`). An old reply link can insert new messages on the withdrawn application, while the canonical agency route says that thread is closed (`src/domains/agency/routes/messages.js:163`).

**Proof:** Ran the actual token validator plus actual reply-route handlers 25 times against an in-memory fixture identifying a banned user and withdrawn application. All 25 produced message inserts. No account-state lookup occurred. Source tracing establishes the missing outer account guard and rate limiter. The fake database is explicitly permissive storage; this is logic evidence, not a measured production throughput test.

**Ruled out:** The bearer is cryptographically random and hashed at rest; this is not token brute force. Guardian grant revocation has its own purge path which deletes message-reply tokens; do not claim that path is broken. Deleted accounts lose the joined identity row and fail token validation. The exposed case is suspended/banned accounts and ordinary application withdrawal.

**Launch action:** Make every message entry point use a single authorization/lifecycle service, check the actor's current status, and rate-limit by stable talent/application identity. Revoke or reject reply bearers after withdrawal and moderation action. Test preexisting tokens after each transition.

#### Additional minor-safety limitation requiring a launch decision

Guardian confirmation proves access to a supplied mailbox; it does not establish that its controller is a guardian. The authenticated minor supplies arbitrary `guardian_email` (`src/domains/talent/routes/guardian-consent.js:107`). Only email syntax is checked; it can be the minor's own address. `createConsentRequest()` normalizes and emails it without matching it against the talent email (`src/domains/talent/services/guardian-consent.js:137`), and confirmation sets `guardian_consent_at` or the agency grant solely from the bearer (`:329`, `:398`). Thus a minor can self-approve by requesting and confirming the link in their own inbox. Even a distinct-address restriction would not establish guardianship.

The guardian page explicitly covers account storage, public publication, and AI processing together (`views/guardian-consent.ejs:75`). Cryptographic token delivery and affirmative POST are good controls, but they do not verify the human relationship or adult authority. Treat this as a demonstrated trust limitation, not a legal conclusion: I did not verify the applicable jurisdictional standard for parental consent. Launch with minors should not be justified by calling this "verified guardian consent" without a deliberate, documented safeguard and policy decision.

#### Controls observed and limits of coverage

- Firebase ID-token verification checks revocation by default; the verified-email gate exists for account email matching and team invitations. Login regenerates the session ID. No token-signature bypass established.
- Canonical API agency queries reviewed generally scope by agency ID; active membership/agency status is verified by the production legal gate. The concrete bypasses above are narrower and must not be generalized to arbitrary cross-tenant access.
- Guardian tokens use random values and stored hashes, confirmation is POST with an atomic pending-to-verified transition, agency scope is distinct from account scope, and grant expiry/revocation filters exist. These do not solve guardian identity assurance.
- Designer shares use hashed high-entropy tokens with expiry/revocation checks and a constrained snapshot DTO. Their public access is an intended trust boundary, not itself a vulnerability. No cross-list token bypass established in this lane.
- Public anonymous open-call intake is gated by `identity_policy`; claim creates/links an account through email-token possession. No live identity-policy configuration was queried, and the anonymous path was not fully exercised.
- Frontend event consent/claims were sampled, not completely audited. The historical strategic statement that the consent copy was never displayed was not reproduced and is not a finding here.
- No production configuration, deployment edge behavior, real browser cookie behavior, external identity provider, or PostgreSQL concurrency was tested. No claim of exhaustive coverage of all routes is made.

#### Launch judgment for this lane

**Do not launch unchanged.** A1, A2, A3, and A5 are verified authorization/moderation failures affecting real applicant decisions or personal information. Close these paths and prove revocation with existing cookies/tokens. Fix A4 alongside the authentication boundary work. If minors are in launch scope, resolve the mailbox-only guardian assurance limitation before representing that the platform has established guardian authorization.

#### Bounded follow-up: agency export-webhook transport

The lead requested an additional read-only check of DNS validation and response limits. No network or internal endpoint was contacted. The delivery module imports only standard-library dependencies, so it was invoked directly with an injected resolver and fetch substitute.

##### A6 — Medium: webhook error responses are fully buffered before the supposed size cap

**Attacker:** An agency OWNER/ADMIN permitted to configure its webhook, or someone controlling an existing receiver. They control a public HTTPS receiver with a valid certificate and arrange a >=400 response with a large body when Pholio sends an application. No DNS rebinding is necessary.

`src/domains/agency/services/export-webhook.js:242` executes `(await response.text()).slice(0, MAX_RESPONSE_BYTES)`. This limits the retained diagnostic string **after** the entire response has been received and materialized, rather than limiting bytes read. A receiver can make the worker buffer an arbitrarily large response subject to bandwidth and the five-second timer. The size limit is also a character count, despite its name. The configuration route is live at `src/domains/agency/routes/export-webhook.js:66`, and talent submission calls `await dispatchSubmission(...)` at `src/domains/talent/routes/applications.js:1980`; the wrapper calls `deliver()` directly (`src/domains/agency/services/export-webhook-dispatch.js:120`).

**Impact:** Avoidable worker memory pressure and submission latency; sufficiently large or concurrent responses can exhaust worker memory. An actual out-of-memory failure was not induced, and the amount required depends on the deployed memory/bandwidth limits. This finding does not claim cross-tenant data disclosure.

**Proof:** An injected fetch returned status 500 and a `text()` result containing 4,194,304 bytes. The actual `deliver()` function consumed that whole result and returned only 2,048 characters. The endpoint's ten-consecutive-failure disable is not a byte bound, and saving the endpoint resets the failure counter (`routes/export-webhook.js:104`).

**Fix:** Read the response stream only to a fixed byte budget and cancel it on exceeding that budget. Also cancel/discard response bodies when returning early on success or redirects. Keep deadline and byte bounds independent.

##### Verified SSRF defense gap; private-service compromise not established

`assertDeliverableUrl()` resolves the hostname and checks its returned addresses (`services/export-webhook.js:133`), then returns the original URL without the validated addresses (`:165`). `deliver()` passes that hostname to ordinary `globalThis.fetch` (`:191`, `:218`), which performs its own connection resolution. No pinned lookup, socket address, dispatcher, or agent is passed. Searched the mounted wrapper and repository for a global dispatcher/pinned lookup: none was found. Therefore the address checked is not bound to the address contacted, leaving a DNS-change window.

The IPv6 filter also compares presentation strings rather than normalized network ranges (`:80`): executing `isBlockedAddress()` returns false for `::ffff:7f00:1` (IPv4-mapped loopback), `0:0:0:0:0:0:0:1` (expanded loopback), and `fe90::1` (another address inside link-local fe80::/10). This proves classification defects, but does not prove the production DNS resolver emits those exact forms or the host has a usable route to them. Literal bracketed IPv6 URL handling may reject earlier during DNS resolution, so this is not presented as a working literal-IP bypass.

**Exploit constraints:** A malicious agency can control authoritative DNS answers and the URL, but HTTPS is mandatory, redirects are refused, and normal certificate verification remains enabled. Rebinding to an arbitrary internal HTTP/metadata service does **not** establish successful HTTP access: it additionally needs appropriate TLS and hostname validation, network reachability, and suitable internal service behavior. Private-address connection attempts are plausible; private HTTP response disclosure, cloud credential theft, and a production network pivot were **not demonstrated**. Do not elevate this to a proven critical SSRF exploit without that evidence.

**Fix direction:** Use one parsed/canonical IP policy for all address forms, pin the approved address in the actual connection while preserving hostname TLS verification, and keep redirect prohibition. Treat this as a concrete missing transport control with deployment-dependent exploitability, separately from A6's demonstrated response-buffering defect.

## Appendix B: complete privacy and media analysis

### Privacy, media, exports and third-party boundary audit

Audit date: 2026-09-08. Read-only review of the current, dirty working tree; no product code changed. Rechecked after concurrent changes to PDF generator/guardrails. Strategy reviewed as product intent, not evidence of implementation or legal authority. No live DB, production storage, external API, application server, browser, email or payment requests were made.

#### Verdict for this lane

Do not launch with real talent photos, minors and personal information until the seven high-severity issues below are fixed or their affected surfaces are disabled. These are actual implementation paths, not generic risk categories. CDN reachability and live provider configuration were not tested; findings involving those services state that dependency explicitly. Do not construe this as a legal determination.

#### Reproduction evidence

Run `node docs/audits/2026-09-08-evidence/privacy-media-proof.cjs` from the repository. It executes real route handlers/modules in a VM with explicit inert DB/storage/provider seams; uploader proof uses real Sharp with synthetic EXIF. It never loads application config or `.env`, never connects to storage or DB, and never launches a browser. All six assertions passed against the current tree:

1. Replacing pixels preserves approved/public flags and makes zero moderation/CSAM calls.
2. Deleting that replaced image removes the DB row without deleting the saved pre-edit image or original WebP key.
3. A returned public processed URL determines the raw original key; original bytes retain synthetic EXIF, processed bytes strip it.
4. The vision-jury provider boundary receives screenshots without any consent/age context.
5. An external card upload persists unparsed magic-prefixed bytes, and its delete returns success without any storage deletion.
6. A webhook payload built from a minor's profile includes their direct phone/email.

These are focused behavioral proofs, not complete authenticated HTTP integration tests. Authentication/mount reachability was separately traced in source. No illegal or real-person test images were used.

#### PM-01 — High: replace-image endpoint bypasses content moderation

**Where:** `src/domains/talent/routes/media.js:2481` (`POST /:id/replace`), processing at 2523, update patch at 2564 and DB write at 2608. Main upload moderation is at 947 and 959. Mount: `src/domains/talent/routes/index.js:44` under `/api/talent/media`, mounted by `src/app.js:925`.

**Attack:** An authenticated talent with an approved image replaces it with a different, decodable image. Ownership is checked, but the replacement handler calls `processImage`, updates the stored pixels and returns success without invoking `analyzeImageBuffer`, `screenImageForCsam`, or the review queue. It retains the old `moderation_status` and audience exclusions. A benign approved/public image is therefore a reusable approval for arbitrary subsequent pixels. The ordinary public/agency moderation query sees the inherited `approved` state.

**Impact:** An abusive account can publish imagery that the normal upload path would send to review; moderation reviewers are never notified. This is independent of which moderation vendor is configured. An existing image's approval is not evidence about its replacement.

**Proof:** Actual replacement handler executed with the moderation seams instrumented to return review/escalation. Response succeeds, URL changes, status remains approved, public exclusion remains false, both call counts remain zero.

**Fix/acceptance:** Route every new set of image bytes, including replace and attachment flows, through one moderation pipeline; withhold visibility until that specific content hash is approved. Update status/queue atomically with the new image references. Verify replacement with a review verdict disappears from public/agency/PDF viewers.

#### PM-02 — High: raw uploaded originals preserve EXIF behind derivable CDN keys

**Where:** `src/shared/lib/uploader.js:24`/30 (common prefix and public URL), 241–248 (same UUID for processed/original key), 328–357 (three R2 writes, raw `file.buffer` stored at 353). Long-running R2 path stores originals through multer-S3 at 87–103. Local/public static route at `src/app.js:977`.

**Attack/precondition:** An observer obtains one displayed image URL on the configured public media CDN. From `.../processed/<uuid>.webp`, change the segment to `originals` and try the four supported original extensions. In the serverless R2 path this object contains the exact pre-processing upload; it lives in the same bucket/prefix family as the processed image. No application authorization or signed-URL decision separates those keys.

**Impact:** For originals containing camera EXIF, the observer can recover metadata stripped from the displayed WebP, potentially GPS, camera information, time or author information. Public images of minors have particular location-safety implications. Private/review media is also stored through this public URL scheme: the flags only filter DB listings and do not revoke a known object URL.

**Evidence/limits:** Real Sharp proof confirms original and processed keys share the same UUID, original upload bytes are identical, original EXIF survives and processed EXIF is absent. No live CDN request was made; this becomes externally exploitable when `R2_PUBLIC_URL` exposes that original prefix, as the code's public-bucket delivery design assumes. An independently configured CDN rule denying originals would mitigate this specific URL attack but was not available for verification. Random UUIDs prevent blind enumeration; this finding does not claim they are guessable.

**Fix/acceptance:** Keep originals in private storage with separately authorized access, or discard/strip their metadata before retention. Serve private/review media through authorization or short-lived scoped URLs. Verify an unauthenticated request to a known original/private/review key fails and previously issued access expires when visibility is withdrawn.

#### PM-03 — High: ordinary image deletion loses artifacts and acknowledges failed purges

**Where:** `src/domains/talent/routes/media.js:2266` DELETE; derived keys at 2299–2336; `Promise.allSettled` at 2337; DB deletion at 2379. Replacement preserves first source in `original_path`, `original_storage_key`, etc. at 2583–2599, but DELETE never reads those fields. Subsequent replacement cleanup at 2615–2633 deletes only the processed key. Account deletion only discovers image keys from still-existing rows (`src/shared/lib/account-deletion.js:230–252`).

**Attack/precondition:** Someone who retained an earlier URL can continue using it after the owner deletes the image. Deterministically, an edited image's initial source and derivatives are not deleted at all. Uploaded WebP originals are also omitted from the DELETE extension list. Separately, if any R2 delete fails, `allSettled` suppresses the result and the route still deletes the row and says “Image deleted.”

**Impact:** Private photos may remain available from storage after a deletion the product reports as successful. Once the DB row is gone, a later account deletion cannot discover those artifacts. Failed deletes have no durable retry record on this route, unlike the separate account-deletion mechanism.

**Proof:** Real replace-then-delete handlers execute against a tracked row and intercepted storage commands. The pre-edit storage key and `.webp` original key never appear in deletes, while the image row is removed. The omission is deterministic and does not require a provider outage.

**Fix/acceptance:** Inventory all actual object keys at write time, including edit history/originals/thumbnails; use one deletion service for image and account deletion. Persist pending purge tasks before dropping ownership records, retry failures, and distinguish accepted deletion from completed erasure. Verify known URLs fail after replacement+delete and provider failure yields a durable retry.

#### PM-04 — High: external comp-card attachments bypass media safety and survive deletion

**Where:** `src/domains/talent/routes/external-comp-cards.js:41–62` upload; 65–68 DELETE. Mount `src/domains/talent/routes/index.js:47`. File check at 26–31 only inspects magic bytes. Upload stores unmodified bytes at 51 or 57 and returns their public URL. `src/shared/lib/account-deletion.js:230–252` inventories only `images`; this route writes `external_comp_cards`. Its table FK cascades metadata, not storage (`migrations/20260818220000_create_external_comp_cards.js`).

**Attack:** A talent uploads JPEG/PNG/WebP/PDF through the attachment route instead of the media route, obtains a public URL, and can distribute it. This route reads only the profile ID: it does not check age/guardian/public audience, invoke image moderation/CSAM, strip EXIF, or re-encode image content. Both uploaded images and PDFs retain all original contents. File deletion only sets `deleted_at` and reports success; account deletion never schedules these keys for removal.

**Impact:** This is a second media-safety bypass and a distinct deletion hole, including for attachments containing a teen's contact information/photos. Recipients retain access at the same hosted URL after “delete,” including after account deletion under the configured public CDN design.

**Proof/limits:** Actual upload handler accepts harmless `%PDF-`-prefixed non-document bytes and writes them unchanged through the mocked R2 seam. Actual DELETE reports success and makes no storage call. This proves insufficient validation and deletion omission; it is not a demonstration of PDF code execution. CDN reachability has the same explicit configuration condition as PM-02.

**Fix/acceptance:** Apply a deliberate attachment security policy: private storage, authenticated access until explicit sharing, safe image processing/moderation, PDF structural/content validation as appropriate, documented recipient exposure and comprehensive deletion. Include external cards in account erasure/export inventory and retries. An ordinary DB cascade is insufficient.

#### PM-05 — High: public PDF downloads send photos to Groq without talent AI consent

**Where:** `src/domains/pdf/routes/pdf.js:2104` unauthenticated GET `/pdf/:slug`; render call at 2320 and `jury` defaults to true at 2346. Current `src/domains/pdf/generator.js:339–370` gates only on `opts.jury`, `GROQ_API_KEY`, non-test runtime; renders five fronts to PNG. `src/domains/pdf/composition/front-program/jury.js:115–130` embeds image bytes and 225–236 calls Groq. This contrasts with central image-AI permission handling in `src/domains/ai/analyzeProfileImage.js:128` and its callers.

**Trigger:** Any visitor downloads a shareable profile's PDF in a deployment with Groq configured. No login or owner action is needed. Unless the visitor opts out using `?jury=0`, the server screenshots the candidate card fronts and sends them to the vision provider. The default composed template includes the required `#front` element (`src/domains/pdf/templates/compcard-composed.ejs:441`); this is not unreachable scaffolding.

**Impact:** Talent photos and printed identifying details cross the AI-provider boundary even when the talent disabled image analysis. Guardian-consented minors allowed to share public PDFs also pass this code, despite the central image-AI gate prohibiting provider analysis of minors. It additionally exposes unauthenticated paid compute: five browser renders plus a vision request per normal download.

**Proof/limits:** Executed real jury module with a mocked Groq client and synthetic screenshot bytes. Provider request contains both screenshots; the module accepts no profile, age or consent context. HTTP defaults and generator trigger were traced in current code. No real provider submission or browser render was run. Legal basis/vendor terms are unverified; the technical discrepancy with product consent is established.

**Fix/acceptance:** Make owner purpose-specific AI permission and age policy authoritative at this provider call, reread at dispatch, and keep ordinary public downloads deterministic. Do not allow a visitor-controlled URL parameter to authorize analysis of someone else. Cover opted-out adult, guardian-consented minor, unauthenticated download, and provider-cost limits.

#### PM-06 — High: submission export webhooks disclose minors' direct contact

**Where:** `src/domains/talent/routes/applications.js:851–867` loads raw profile and determines minor status; 1771–1777 deliberately sets snapshot `contact: null` for minors. The same request passes original `profile` to `dispatchSubmission` at 1981–1990. `src/domains/agency/services/export-webhook-dispatch.js:78–107` selects contact from `profile` and sends `email` and `phone` with no age/minimization filter. Agency owners/admins can configure their recipient endpoint at `src/domains/agency/routes/export-webhook.js:66–69`.

**Attack/precondition:** A legitimate or abusive agency owner/admin configures a webhook and receives an application from a guardian-consented minor whose profile has a direct phone (or profile-level email). The agency endpoint receives that raw contact even though the in-product application package suppresses it. Profile-level email may be absent because the canonical email is in `users`; phone leakage does not depend on that email population detail.

**Impact:** Agencies gain direct off-platform contact with a minor and can retain it externally. This contradicts both the actual minimized snapshot and the exact disclosure at `src/shared/lib/submission-disclosure-content.js:67`, which says direct contact is omitted and agency communication occurs through Pholio. Guardian authorization of the stated package is not evidence of authorization for this additional field.

**Proof:** Real `buildPayload` invoked with a synthetic minor DOB/guardian-approved profile returns their direct phone and email unchanged. The reachable submission caller passes raw `profile`; no sanitized snapshot is used.

**Fix/acceptance:** Build webhook/export payloads from the consented immutable submission snapshot or the same canonical minor-safe DTO used for the package; never directly serialize the current profile. Test minor and adult submission through configured delivery, asserting suppressed fields never leave the process.

#### PM-07 — High: account-erasure retries exist only as an uncalled function

**Where:** `src/shared/lib/account-deletion.js:275–294` persists provider failures; 303–304 proceeds with database cleanup/account removal; 337 defines `processPendingDeletions`; 443 exports it. The account-deletion response marks provider erasure pending (`account-deletion.js:428–435`, exposed by `src/domains/talent/routes/settings.js:1102`).

**Trigger:** An ordinary R2 or Firebase failure during account deletion creates a pending failure record. The user receives a pending-erasure response and their application row is removed. A search of `src`, `netlify` and `scripts` finds no invocation of `processPendingDeletions`; only tests invoke it. A retry function and a queue table do not execute themselves.

**Impact:** An account deletion affected by a transient provider outage can leave photos or the Firebase identity retained indefinitely unless someone performs an out-of-band manual intervention. The application correctly acknowledges incomplete erasure, but has no shipped consumer to complete it after recovery.

**Evidence/limits:** Confirmed independently by source/callsite search and by lead lane. No provider outage was induced. An external operator could invoke the function manually; no evidence of such a live operating procedure or independently deployed consumer was available. This is an absent in-repo recovery path, not proof no human has ever cleaned a record.

**Fix/acceptance:** Wire a bounded, scheduled retry consumer with concurrency ownership, backoff and alerts for oldest pending erasure; verify provider failure followed by recovery completes the same recorded task without user re-registration or database ownership rows.

#### Additional observations / unresolved candidates

- **CSAM escalation contract mismatch:** content moderation emits `flags.skinRatio`, `flags.extremeAspect`, and combined comma-separated reasons (`content-moderation.js:297–330`); `csam-moderation.js:40–48` reads `skin_tone_ratio`, `extreme_aspect_ratio` and tests exact `reason === "high_skin_ratio"`. An image flagged for both high skin and aspect ratio is kept in ordinary review but misses the special CSAM escalation. This is an escalation-priority defect, not proof of CSAM detection coverage or a public-visibility bypass. Do not claim the heuristic identifies CSAM reliably.
- **PDF logo URL SSRF candidate:** `/api/pdf/agency-logo-url/:slug` only calls `new URL` (`pdf.js:3488`) and stores the value; the legacy template renders it as `<img src>` (`templates/compcard.ejs:757–764`). Puppeteer has no request interception and serverless launch disables web security. A browser trace is needed to verify current theme/engine reachability and network restrictions before assigning a concrete SSRF severity. No internal host was probed.
- **Storage authorization:** the application emits direct R2 URLs, not signed URLs, and no Worker/bucket/CDN ACL configuration was available in this lane to prove a separate object-level authorization layer. Query-level audience controls alone do not protect known URLs. Review actual Cloudflare settings before asserting production data is protected.
- **External dependencies:** provider retention, processing terms, moderation staffing, mandatory reporting operations, backup deletion and live CDN cache purge behavior were not established. These are verification gaps, not invented violations.

#### Coverage and positive controls observed

Reviewed actual mounts, ordinary uploads/replacements/deletes, uploader and artifact purge, public portfolio/PDF loading, Wallet image selection and minor policy, external card uploads, comp-card import, privacy export/data inventory, account deletion and retry service, submission retention/redaction and scheduled callsites, content/CSAM/Hive moderation, image fetching and AI vision jury, and the agency export-contact boundary. This lane did not independently cover all auth/tenant, payments, infrastructure, or dependency code; other audit lanes own those.

Ordinary uploads do invoke moderation and default unconsented minors' audience columns private. Invalid images fail closed in `processImage`; processed image EXIF is stripped. Import uses in-memory buffers and its image branch checks image-AI consent. Wallet route requires the talent owner and sets `private, no-store`; content has a minor/guardian gate. Account deletion records R2/Firebase failures durably and has a retry function. Submission package expiry has a real redaction helper and scheduled/read-side callsites. These controls are real but do not cover the alternate paths reported above.

The recent user edits to PDF visibility/guardrails were preserved. No finding here relies on the removed default-private PDF loader check; the AI-jury problem remains in the current code independently.

## Appendix C: verification inventory

### Verification inventory — 2026-09-08

#### Scope and safety

- Repository audited: `/Users/lenquanhone/Projects/pholio-app`.
- Read-only inventory/version inspection plus the requested client test command.
- No client build, dependency install, backend test, server/database start, `.env` read, product edit, commit, or external write was performed.
- Landing-site package data was read from the sibling repository at `../pholio-site` (`/Users/lenquanhone/Projects/pholio-site`).
- Counts below are filesystem inventories at audit time. Source/test counts use `rg --files`; test files means filenames ending in `.test.*` or `.spec.*`.

#### Client test result

Command:

```text
npm run --prefix client test
```

Result: exit code `0` (passed).

```text
> client@0.0.0 test
> vitest run

 RUN  v4.1.10 /Users/lenquanhone/Projects/pholio-app/client

 Test Files  89 passed (89)
      Tests  932 passed (932)
   Start at  16:49:15
   Duration  37.00s (transform 7.69s, setup 18.91s, import 32.13s, tests 73.80s, environment 98.72s)
```

The run also emitted jsdom/Node informational warnings (`Window's scrollTo()`, navigation not implemented, and experimental localStorage warning); none caused failures.

#### Filesystem inventory

| Scope | Count | Definition |
| --- | ---: | --- |
| Backend route files | 73 | `src/**/routes/**/*.js` |
| Backend JavaScript source files | 381 | `src/**/*.js`, excluding test paths and `.test.js`/`.spec.js` names |
| Client source files | 570 | `client/src/**/*.{js,jsx,ts,tsx}` |
| Migration files | 231 | `migrations/**/*.js` |
| Test files | 380 | Repository files whose names end in `.test.*` or `.spec.*` |
| Netlify function files | 4 | All files under `netlify/functions/` (includes its `package.json`) |

For additional context, the backend contains 426 JavaScript files total, of which 45 match the test-file/path exclusion; the client contains 89 test files under `client/src`.

#### Lockfile-resolved package versions

All three lockfiles use `lockfileVersion: 3`.

| Package area | Package | Manifest range | Resolved version | Node engine requirement |
| --- | --- | --- | --- | --- |
| Root | `express` | `4.22.2` | `4.22.2` | `>= 0.10.0` |
| Root | `puppeteer` | `^25.3.0` | `25.3.0` | `>=22.12.0` |
| Root | `@sparticuz/chromium` | `^149.0.0` | `149.0.0` | `^22.17.0 || >=24.0.0` |
| Client | `react` | `^19.2.4` | `19.2.4` | `>=0.10.0` |
| Client | `react-dom` | `^19.2.4` | `19.2.4` | not declared in lock entry |
| Client | `vite` | `^7.3.6` | `7.3.6` | `^20.19.0 || >=22.12.0` |
| Landing (`../pholio-site`) | `next` | `^16.1.6` | `16.3.0` | `>=20.9.0` |
| Landing (`../pholio-site`) | `react` | `^19.2.4` | `19.2.8` | `>=0.10.0` |
| Landing (`../pholio-site`) | `react-dom` | `^19.2.4` | `19.2.8` | not declared in lock entry |

The root and client manifests do not declare an `engines` field. The root manifest reports Express `4.22.2` in both manifest and lockfile; this is the package evidence captured here.

#### Follow-up evidence

##### Landing-site `npm audit`

**Superseded snapshot:** The result below was the lane's earlier query. The lead's final same-day registry query returned 4 findings for current `pholio-site`: 1 critical (`next`), 3 high (`sharp`, `js-yaml`, `nanoid`). Root/client final totals were 32/18. See the main audit's dependency section for exact severity counts, maintainer-advisory applicability and the harmless decoder proof. Advisory counts are time-sensitive and are not counts of proven application exploits.

Command run from `/Users/lenquanhone/Projects/pholio-site` (no fixes):

```text
npm audit --json --registry=https://registry.npmjs.org
```

The command exited `1`, because the audit reported one vulnerability. Audit counts: `info 0`, `low 0`, `moderate 0`, `high 1`, `critical 0`, `total 1`. Dependency totals: `prod 24`, `dev 385`, `optional 88`, `peer 0`, `peerOptional 0`, `total 446`. Advisory package name: `nanoid`.

##### Cross-repo legal version

- `pholio-site/lib/legal-constants.ts`: `CURRENT_LEGAL_VERSION = "2026-07-18"`
- `pholio-app/src/shared/lib/legal-versions.js`: `CURRENT_LEGAL_VERSION = "2026-07-18"`
- Comparison: exact values match.

##### Netlify function clarification

The inventory count of 4 files under `netlify/functions/` includes `package.json`. There are 3 executable function files: `cleanup-application-drafts.js`, `discover-reindex.js`, and `server.js`.

## Appendix D: executable evidence and interpretation

All five scripts passed at the final audit recheck. They load actual implementation with isolated seams; they do not load production configuration or send real messages, payments, files or personal data to providers. They are intentionally **pre-remediation reproductions**: after a successful fix, their old vulnerable-behavior assertions should fail or be superseded by regression tests that assert safe behavior. Do not weaken fixes to make an old exploit assertion pass.

Run from the repository root only when reviewing that historical baseline:

```text
node docs/audits/2026-09-08-evidence/auth-tenants-proof.cjs
node docs/audits/2026-09-08-evidence/privacy-media-proof.cjs
node docs/audits/2026-09-08-evidence/payments-infra-proof.cjs
node docs/audits/2026-09-08-evidence/submission-binding-proof.cjs
node docs/audits/2026-09-08-evidence/image-decoder-proof.cjs
```

Observed outcomes are recorded inline in the findings: stale roles and self-DENY deletion; legacy decisions; login-origin bypass; replies after ban/withdrawal; moderation-free replacement; orphaned media; EXIF retention; provider dispatch without owner context; unvalidated external attachments; raw minor contacts; lost payment retries; stale event overwrite; collapsed subscriptions; stale auto-close overwrite; omitted consent inputs; and harmless AVIF reaching the affected decoder.

No real browser/production network exploitation, native code-execution payload or compromised account was used. The fixture semantics, source tracing and remaining deployment assumptions must be retained when using these results for prioritization.
