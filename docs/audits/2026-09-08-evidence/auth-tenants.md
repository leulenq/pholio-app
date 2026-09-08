# Authentication, tenant boundaries, messaging, and minor-consent audit

Date: 2026-09-08. Audited the current working tree, including existing uncommitted changes. Findings were rechecked after the lead reported concurrent auth/CSRF edits. This lane makes no product changes.

## Method and evidence limits

Read actual Express mounts and middleware, auth/login and identity matching, agency membership/permission resolution and mutation routes, legacy agency form routes, team invitation tokens, public message-reply tokens and session bootstrap, guardian consent request/confirm/revoke, minor-submission access, open-call claim/intake, designer share tokens and routes. Read `docs/pholio-strategic-analysis-2026-08.md` as product context, not evidence of implementation or law. Its old inventory/consent conclusions were not adopted.

Executable evidence: `node docs/audits/2026-09-08-evidence/auth-tenants-proof.cjs` passed after the latest recheck. It loads the current source in a VM with explicit in-memory database substitutes, executes real route handlers and real permission/CSRF/token functions, and asserts results. No `.env`, app startup, real database, live server, or network access occurs. It proves handler and middleware logic; it is **not** a live deployment exploit or a PostgreSQL concurrency test. Actual mounting and missing outer controls were separately traced in `src/app.js`. No existing integration-suite result is presented as independent evidence.

## A1 — High: legacy agency actions bypass permission and membership revocation

**Attacker:** An agency VIEWER, another role denied the action, or a removed agency member retaining an existing signed session. The human user account itself must still be active. The attacker needs an application UUID in their own agency, which a current viewer can obtain from the inbox; a removed member can retain one.

**Request:** `POST /dashboard/agency/applications/APPLICATION_ID/accept` with the existing session. `decline` and `archive` are alternatives.

**Actual path:** `src/app.js:910` mounts the agency router after `requireActiveAccount()`. `src/domains/agency/routes/index.js:6` includes `roster.js`. Its handler at `src/domains/agency/routes/roster.js:31` requires only the coarse `AGENCY` role. The nominal guard installed at line 26 is scoped to `/api/agency` by `src/domains/agency/routes/agency-api-guard.js:28`; it does not execute on `/dashboard/agency/...`. Therefore the current membership, legal acceptance, setup completion, RBAC, and custom grants are not checked. `requireActiveAccount()` checks the human user's account status, not the membership (`src/domains/auth/middleware/require-auth.js:295`). Removal only updates membership status (`src/domains/agency/routes/inbox.js:3057`) and does not destroy this session.

The handler loads the application by `id` and `agency_id`, then directly writes accepted/declined/archived status (`roster.js:61`, `:88`). A parallel legacy invite route (`roster.js:147`) has the same permission/membership gap and can send a talent invitation.

**Impact:** Unauthorized talent decisions and outbound agency communications, including after a workspace owner removes a colleague. The actor acts under the agency's authority. These paths additionally omit the API's state-machine protections: the status handler accepts any existing application without checking its prior status or event purpose. This merits separate regression coverage when consolidating the handlers.

**Proof:** Real `requireRole()` plus the real legacy accept handler accepted a VIEWER session and produced an `applications` update with `status: "accepted"`. The proof stubs the database, email delivery, and the adult access decision; it does not disable any handler-local permission check. Source tracing establishes why the API-only guard cannot intercept the route.

**Ruled out:** This is not a cross-agency IDOR: the application query does include the session's agency ID. Minor application access is checked, but with OWNER/ADMIN session-role shortcuts rather than effective permissions. A banned human is blocked by the outer account guard; a deactivated membership is not.

**Launch action:** Remove the legacy mutations or route them through the exact same current-member, permission, legal, minor-access, and transition service as the canonical API. Prove both VIEWER denial and immediate removed-member denial on every surviving alias.

## A2 — High: demotion leaves existing agency sessions with their old privileges

**Attacker:** A previously authorized ADMIN who retains a session after the owner demotes them to VIEWER/SCOUT/AGENT.

`PATCH /api/agency/team/:membershipId` changes `agency_memberships.membership_role` only (`src/domains/agency/routes/inbox.js:2978`). `resolveEffectivePermissionsFromSession()` still takes the role from `session.agencyMembershipRole` (`src/domains/agency/services/permissions.js:35`, especially `:41`). It reloads custom permission rows, but never loads the actual membership role. The active legal/membership check selects only `membership.id` and checks ACTIVE status and identity (`src/domains/agency/services/legal-acceptance.js:168`); it does not refresh the session role. `/api/session` also computes permissions using that stale session (`src/domains/auth/routes/auth.js:1195`).

**Impact:** The demoted member can keep exporting applicant information, reading minor submissions where grants permit it, sending messages, managing invitations/roles, or altering workspace settings until the session is invalidated or reauthenticated. Setting the DB role to VIEWER does not remove the old ADMIN permission set.

**Proof:** Executed the actual permission resolver with an ADMIN session and a database substitute whose logged calls show only the permission-grants table. It retained `org.export_data`; the real VIEWER preset lacks that permission. Independently inspected the role-update handler for session invalidation and the active/legal check for role refresh: neither exists.

**Ruled out:** Full membership deactivation *does* block canonical `/api/agency` endpoints through the production legal guard; that does not fix active-member demotion and does not cover A1's legacy endpoints. Custom DENY changes are loaded per request; this defect specifically concerns the preset role.

**Launch action:** Resolve current membership status and preset role from authoritative DB state on authenticated agency requests, or atomically invalidate all member sessions on role changes. Test requests made with the pre-demotion cookie.

## A3 — High: restricted administrators can delete their own DENY permissions

**Attacker:** An ADMIN whose principal denied a sensitive permission, while leaving the normal `team.revoke_permission` permission intact. Example: prevent export of talent data with a DENY on `org.export_data`.

**Request:** `DELETE /api/agency/team/OWN_MEMBERSHIP_ID/permissions/org.export_data?effect=DENY` with valid first-party headers and the actor's own cookie.

The route map requires `team.revoke_permission` (`src/domains/agency/lib/route-permissions.js:131`). That permission is included in the ADMIN preset (`src/domains/agency/lib/permissions.js:153`). The DELETE handler validates that the target membership belongs to the same agency, but does not reject targeting oneself or check whether removing a DENY grants a right the actor is forbidden from holding (`src/domains/agency/routes/team-rbac.js:236`, `:249`, `:257`). It deletes the DENY row. The permission engine recomputes the ADMIN preset without that denial and restores the restricted permission.

**Impact:** Principal-imposed restrictions on exports, minor-submission access, or other ADMIN powers can be undone by the restricted administrator. The UI's permission customization is not an enforceable security boundary for these users.

**Proof:** Actual permission computation showed export denied and `team.revoke_permission` allowed; actual DELETE handler returned success against the actor's own membership; recomputation restored `org.export_data`.

**Ruled out:** The PUT handler has a self-edit prohibition (`team-rbac.js:121`), but DELETE does not. Tenant scoping does not prevent within-tenant privilege escalation. A plain VIEWER without delegated revoke permission cannot execute this directly.

**Launch action:** Apply the same self-modification protection to DELETE. Treat removal of a DENY as a grant operation, with authority checks against both the resulting privilege set and protected administrative permissions.

## A4 — Medium: the legacy `/login` alias permits login CSRF

**Attacker:** A person with their own valid Firebase token who can induce a victim to submit a top-level form. A hidden auto-submitted form can POST `firebase_token=ATTACKER_TOKEN` and `next=/dashboard/talent/profile` to `https://app.pholio.studio/login`.

The same-origin middleware protects `/api/login` but not `/login` (`src/shared/middleware/same-origin-mutation.js:28`, `:109`). Both paths execute the same authentication handler (`src/domains/auth/routes/auth.js:361`), which explicitly accepts URL-encoded `firebase_token` (`:394`); it then regenerates and establishes the supplied identity's session (`:854`). CORS uses an origin allowlist (`src/app.js:75`) and does not reject ordinary cross-origin form submissions; it merely controls CORS response visibility. SameSite=Lax does not stop setting a new cookie from a top-level login response, so this attack does not require sending the victim's existing session cookie.

**Impact:** The victim can be placed in the attacker's account. If they then upload photos, edit personal information, or work on an application without noticing the substituted identity, those actions affect an account the attacker controls. This is session swapping, **not** direct takeover of the victim's existing account. The frontend may display a different identity and the user may notice; that limits exploitation and is why this is rated Medium.

**Proof:** The actual same-origin middleware passes a headerless POST from `https://attacker.invalid` to `/login`, while rejecting the equivalent `/api/login` request. The shared form-capable route and session establishment were inspected. No browser-level end-to-end exploit was executed.

**Launch action:** Remove unused session-lifecycle aliases or apply the same origin/header protections to every alias. `/logout` is also absent from that guard; do not fix only the API spelling.

## A5 — High: emailed reply tokens bypass bans and message limits

**Attacker:** Talent with a still-valid emailed reply bearer, including a talent subsequently suspended or banned. The bearer is normally valid for three days (`src/domains/messaging/services/message-reply-tokens.js:6`). No account takeover or token guessing is necessary.

**Request:** Repeated `POST /api/reply/TOKEN/messages` with a <=4,000-character message, the standard custom header, and app Origin. A script can supply both headers; the same-origin control is not authorization against the token holder.

The route is mounted before `requireActiveAccount()` (`src/app.js:885` versus `:910`). `validateReplyToken()` checks hash, expiry, and matching talent identity only (`src/domains/messaging/services/message-reply-tokens.js:168`). Its context query does not select or check account status, application status, blocked relationships, or agency status (`:58`). The reply handler immediately inserts the message and triggers agency activity/notification (`src/domains/messaging/routes/message-reply.js:90`, `:111`, `:139`). The global message limiter only matches `/api/agency/applications/.../messages` and `/api/talent/applications/.../messages` (`src/app.js:729`); the public reply router defines no limiter. Suspension/ban handlers simply update the user's status (`src/domains/moderation/routes/reports.js:458`, `:492`).

**Impact:** Platform moderation does not stop this communication path. A banned talent can keep sending messages/notifications with no application-level message quota until the token expires/rotates, filling storage and the agency's inbox. This is especially relevant to harassment response immediately before launch.

A related lifecycle defect: withdrawal deletes existing messages and revokes/redacts the package but does not revoke reply tokens (`src/domains/talent/routes/applications.js:2828`; `src/shared/lib/submission-retention.js:41`). An old reply link can insert new messages on the withdrawn application, while the canonical agency route says that thread is closed (`src/domains/agency/routes/messages.js:163`).

**Proof:** Ran the actual token validator plus actual reply-route handlers 25 times against an in-memory fixture identifying a banned user and withdrawn application. All 25 produced message inserts. No account-state lookup occurred. Source tracing establishes the missing outer account guard and rate limiter. The fake database is explicitly permissive storage; this is logic evidence, not a measured production throughput test.

**Ruled out:** The bearer is cryptographically random and hashed at rest; this is not token brute force. Guardian grant revocation has its own purge path which deletes message-reply tokens; do not claim that path is broken. Deleted accounts lose the joined identity row and fail token validation. The exposed case is suspended/banned accounts and ordinary application withdrawal.

**Launch action:** Make every message entry point use a single authorization/lifecycle service, check the actor's current status, and rate-limit by stable talent/application identity. Revoke or reject reply bearers after withdrawal and moderation action. Test preexisting tokens after each transition.

## Additional minor-safety limitation requiring a launch decision

Guardian confirmation proves access to a supplied mailbox; it does not establish that its controller is a guardian. The authenticated minor supplies arbitrary `guardian_email` (`src/domains/talent/routes/guardian-consent.js:107`). Only email syntax is checked; it can be the minor's own address. `createConsentRequest()` normalizes and emails it without matching it against the talent email (`src/domains/talent/services/guardian-consent.js:137`), and confirmation sets `guardian_consent_at` or the agency grant solely from the bearer (`:329`, `:398`). Thus a minor can self-approve by requesting and confirming the link in their own inbox. Even a distinct-address restriction would not establish guardianship.

The guardian page explicitly covers account storage, public publication, and AI processing together (`views/guardian-consent.ejs:75`). Cryptographic token delivery and affirmative POST are good controls, but they do not verify the human relationship or adult authority. Treat this as a demonstrated trust limitation, not a legal conclusion: I did not verify the applicable jurisdictional standard for parental consent. Launch with minors should not be justified by calling this "verified guardian consent" without a deliberate, documented safeguard and policy decision.

## Controls observed and limits of coverage

- Firebase ID-token verification checks revocation by default; the verified-email gate exists for account email matching and team invitations. Login regenerates the session ID. No token-signature bypass established.
- Canonical API agency queries reviewed generally scope by agency ID; active membership/agency status is verified by the production legal gate. The concrete bypasses above are narrower and must not be generalized to arbitrary cross-tenant access.
- Guardian tokens use random values and stored hashes, confirmation is POST with an atomic pending-to-verified transition, agency scope is distinct from account scope, and grant expiry/revocation filters exist. These do not solve guardian identity assurance.
- Designer shares use hashed high-entropy tokens with expiry/revocation checks and a constrained snapshot DTO. Their public access is an intended trust boundary, not itself a vulnerability. No cross-list token bypass established in this lane.
- Public anonymous open-call intake is gated by `identity_policy`; claim creates/links an account through email-token possession. No live identity-policy configuration was queried, and the anonymous path was not fully exercised.
- Frontend event consent/claims were sampled, not completely audited. The historical strategic statement that the consent copy was never displayed was not reproduced and is not a finding here.
- No production configuration, deployment edge behavior, real browser cookie behavior, external identity provider, or PostgreSQL concurrency was tested. No claim of exhaustive coverage of all routes is made.

## Launch judgment for this lane

**Do not launch unchanged.** A1, A2, A3, and A5 are verified authorization/moderation failures affecting real applicant decisions or personal information. Close these paths and prove revocation with existing cookies/tokens. Fix A4 alongside the authentication boundary work. If minors are in launch scope, resolve the mailbox-only guardian assurance limitation before representing that the platform has established guardian authorization.

## Bounded follow-up: agency export-webhook transport

The lead requested an additional read-only check of DNS validation and response limits. No network or internal endpoint was contacted. The delivery module imports only standard-library dependencies, so it was invoked directly with an injected resolver and fetch substitute.

### A6 — Medium: webhook error responses are fully buffered before the supposed size cap

**Attacker:** An agency OWNER/ADMIN permitted to configure its webhook, or someone controlling an existing receiver. They control a public HTTPS receiver with a valid certificate and arrange a >=400 response with a large body when Pholio sends an application. No DNS rebinding is necessary.

`src/domains/agency/services/export-webhook.js:242` executes `(await response.text()).slice(0, MAX_RESPONSE_BYTES)`. This limits the retained diagnostic string **after** the entire response has been received and materialized, rather than limiting bytes read. A receiver can make the worker buffer an arbitrarily large response subject to bandwidth and the five-second timer. The size limit is also a character count, despite its name. The configuration route is live at `src/domains/agency/routes/export-webhook.js:66`, and talent submission calls `await dispatchSubmission(...)` at `src/domains/talent/routes/applications.js:1980`; the wrapper calls `deliver()` directly (`src/domains/agency/services/export-webhook-dispatch.js:120`).

**Impact:** Avoidable worker memory pressure and submission latency; sufficiently large or concurrent responses can exhaust worker memory. An actual out-of-memory failure was not induced, and the amount required depends on the deployed memory/bandwidth limits. This finding does not claim cross-tenant data disclosure.

**Proof:** An injected fetch returned status 500 and a `text()` result containing 4,194,304 bytes. The actual `deliver()` function consumed that whole result and returned only 2,048 characters. The endpoint's ten-consecutive-failure disable is not a byte bound, and saving the endpoint resets the failure counter (`routes/export-webhook.js:104`).

**Fix:** Read the response stream only to a fixed byte budget and cancel it on exceeding that budget. Also cancel/discard response bodies when returning early on success or redirects. Keep deadline and byte bounds independent.

### Verified SSRF defense gap; private-service compromise not established

`assertDeliverableUrl()` resolves the hostname and checks its returned addresses (`services/export-webhook.js:133`), then returns the original URL without the validated addresses (`:165`). `deliver()` passes that hostname to ordinary `globalThis.fetch` (`:191`, `:218`), which performs its own connection resolution. No pinned lookup, socket address, dispatcher, or agent is passed. Searched the mounted wrapper and repository for a global dispatcher/pinned lookup: none was found. Therefore the address checked is not bound to the address contacted, leaving a DNS-change window.

The IPv6 filter also compares presentation strings rather than normalized network ranges (`:80`): executing `isBlockedAddress()` returns false for `::ffff:7f00:1` (IPv4-mapped loopback), `0:0:0:0:0:0:0:1` (expanded loopback), and `fe90::1` (another address inside link-local fe80::/10). This proves classification defects, but does not prove the production DNS resolver emits those exact forms or the host has a usable route to them. Literal bracketed IPv6 URL handling may reject earlier during DNS resolution, so this is not presented as a working literal-IP bypass.

**Exploit constraints:** A malicious agency can control authoritative DNS answers and the URL, but HTTPS is mandatory, redirects are refused, and normal certificate verification remains enabled. Rebinding to an arbitrary internal HTTP/metadata service does **not** establish successful HTTP access: it additionally needs appropriate TLS and hostname validation, network reachability, and suitable internal service behavior. Private-address connection attempts are plausible; private HTTP response disclosure, cloud credential theft, and a production network pivot were **not demonstrated**. Do not elevate this to a proven critical SSRF exploit without that evidence.

**Fix direction:** Use one parsed/canonical IP policy for all address forms, pin the approved address in the actual connection while preserving hostname TLS verification, and keep redirect prohibition. Treat this as a concrete missing transport control with deployment-dependent exploitability, separately from A6's demonstrated response-buffering defect.
