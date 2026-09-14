# Pholio independent adversarial prelaunch audit

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
