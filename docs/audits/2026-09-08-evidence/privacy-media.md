# Privacy, media, exports and third-party boundary audit

Audit date: 2026-09-08. Read-only review of the current, dirty working tree; no product code changed. Rechecked after concurrent changes to PDF generator/guardrails. Strategy reviewed as product intent, not evidence of implementation or legal authority. No live DB, production storage, external API, application server, browser, email or payment requests were made.

## Verdict for this lane

Do not launch with real talent photos, minors and personal information until the seven high-severity issues below are fixed or their affected surfaces are disabled. These are actual implementation paths, not generic risk categories. CDN reachability and live provider configuration were not tested; findings involving those services state that dependency explicitly. Do not construe this as a legal determination.

## Reproduction evidence

Run `node docs/audits/2026-09-08-evidence/privacy-media-proof.cjs` from the repository. It executes real route handlers/modules in a VM with explicit inert DB/storage/provider seams; uploader proof uses real Sharp with synthetic EXIF. It never loads application config or `.env`, never connects to storage or DB, and never launches a browser. All six assertions passed against the current tree:

1. Replacing pixels preserves approved/public flags and makes zero moderation/CSAM calls.
2. Deleting that replaced image removes the DB row without deleting the saved pre-edit image or original WebP key.
3. A returned public processed URL determines the raw original key; original bytes retain synthetic EXIF, processed bytes strip it.
4. The vision-jury provider boundary receives screenshots without any consent/age context.
5. An external card upload persists unparsed magic-prefixed bytes, and its delete returns success without any storage deletion.
6. A webhook payload built from a minor's profile includes their direct phone/email.

These are focused behavioral proofs, not complete authenticated HTTP integration tests. Authentication/mount reachability was separately traced in source. No illegal or real-person test images were used.

## PM-01 — High: replace-image endpoint bypasses content moderation

**Where:** `src/domains/talent/routes/media.js:2481` (`POST /:id/replace`), processing at 2523, update patch at 2564 and DB write at 2608. Main upload moderation is at 947 and 959. Mount: `src/domains/talent/routes/index.js:44` under `/api/talent/media`, mounted by `src/app.js:925`.

**Attack:** An authenticated talent with an approved image replaces it with a different, decodable image. Ownership is checked, but the replacement handler calls `processImage`, updates the stored pixels and returns success without invoking `analyzeImageBuffer`, `screenImageForCsam`, or the review queue. It retains the old `moderation_status` and audience exclusions. A benign approved/public image is therefore a reusable approval for arbitrary subsequent pixels. The ordinary public/agency moderation query sees the inherited `approved` state.

**Impact:** An abusive account can publish imagery that the normal upload path would send to review; moderation reviewers are never notified. This is independent of which moderation vendor is configured. An existing image's approval is not evidence about its replacement.

**Proof:** Actual replacement handler executed with the moderation seams instrumented to return review/escalation. Response succeeds, URL changes, status remains approved, public exclusion remains false, both call counts remain zero.

**Fix/acceptance:** Route every new set of image bytes, including replace and attachment flows, through one moderation pipeline; withhold visibility until that specific content hash is approved. Update status/queue atomically with the new image references. Verify replacement with a review verdict disappears from public/agency/PDF viewers.

## PM-02 — High: raw uploaded originals preserve EXIF behind derivable CDN keys

**Where:** `src/shared/lib/uploader.js:24`/30 (common prefix and public URL), 241–248 (same UUID for processed/original key), 328–357 (three R2 writes, raw `file.buffer` stored at 353). Long-running R2 path stores originals through multer-S3 at 87–103. Local/public static route at `src/app.js:977`.

**Attack/precondition:** An observer obtains one displayed image URL on the configured public media CDN. From `.../processed/<uuid>.webp`, change the segment to `originals` and try the four supported original extensions. In the serverless R2 path this object contains the exact pre-processing upload; it lives in the same bucket/prefix family as the processed image. No application authorization or signed-URL decision separates those keys.

**Impact:** For originals containing camera EXIF, the observer can recover metadata stripped from the displayed WebP, potentially GPS, camera information, time or author information. Public images of minors have particular location-safety implications. Private/review media is also stored through this public URL scheme: the flags only filter DB listings and do not revoke a known object URL.

**Evidence/limits:** Real Sharp proof confirms original and processed keys share the same UUID, original upload bytes are identical, original EXIF survives and processed EXIF is absent. No live CDN request was made; this becomes externally exploitable when `R2_PUBLIC_URL` exposes that original prefix, as the code's public-bucket delivery design assumes. An independently configured CDN rule denying originals would mitigate this specific URL attack but was not available for verification. Random UUIDs prevent blind enumeration; this finding does not claim they are guessable.

**Fix/acceptance:** Keep originals in private storage with separately authorized access, or discard/strip their metadata before retention. Serve private/review media through authorization or short-lived scoped URLs. Verify an unauthenticated request to a known original/private/review key fails and previously issued access expires when visibility is withdrawn.

## PM-03 — High: ordinary image deletion loses artifacts and acknowledges failed purges

**Where:** `src/domains/talent/routes/media.js:2266` DELETE; derived keys at 2299–2336; `Promise.allSettled` at 2337; DB deletion at 2379. Replacement preserves first source in `original_path`, `original_storage_key`, etc. at 2583–2599, but DELETE never reads those fields. Subsequent replacement cleanup at 2615–2633 deletes only the processed key. Account deletion only discovers image keys from still-existing rows (`src/shared/lib/account-deletion.js:230–252`).

**Attack/precondition:** Someone who retained an earlier URL can continue using it after the owner deletes the image. Deterministically, an edited image's initial source and derivatives are not deleted at all. Uploaded WebP originals are also omitted from the DELETE extension list. Separately, if any R2 delete fails, `allSettled` suppresses the result and the route still deletes the row and says “Image deleted.”

**Impact:** Private photos may remain available from storage after a deletion the product reports as successful. Once the DB row is gone, a later account deletion cannot discover those artifacts. Failed deletes have no durable retry record on this route, unlike the separate account-deletion mechanism.

**Proof:** Real replace-then-delete handlers execute against a tracked row and intercepted storage commands. The pre-edit storage key and `.webp` original key never appear in deletes, while the image row is removed. The omission is deterministic and does not require a provider outage.

**Fix/acceptance:** Inventory all actual object keys at write time, including edit history/originals/thumbnails; use one deletion service for image and account deletion. Persist pending purge tasks before dropping ownership records, retry failures, and distinguish accepted deletion from completed erasure. Verify known URLs fail after replacement+delete and provider failure yields a durable retry.

## PM-04 — High: external comp-card attachments bypass media safety and survive deletion

**Where:** `src/domains/talent/routes/external-comp-cards.js:41–62` upload; 65–68 DELETE. Mount `src/domains/talent/routes/index.js:47`. File check at 26–31 only inspects magic bytes. Upload stores unmodified bytes at 51 or 57 and returns their public URL. `src/shared/lib/account-deletion.js:230–252` inventories only `images`; this route writes `external_comp_cards`. Its table FK cascades metadata, not storage (`migrations/20260818220000_create_external_comp_cards.js`).

**Attack:** A talent uploads JPEG/PNG/WebP/PDF through the attachment route instead of the media route, obtains a public URL, and can distribute it. This route reads only the profile ID: it does not check age/guardian/public audience, invoke image moderation/CSAM, strip EXIF, or re-encode image content. Both uploaded images and PDFs retain all original contents. File deletion only sets `deleted_at` and reports success; account deletion never schedules these keys for removal.

**Impact:** This is a second media-safety bypass and a distinct deletion hole, including for attachments containing a teen's contact information/photos. Recipients retain access at the same hosted URL after “delete,” including after account deletion under the configured public CDN design.

**Proof/limits:** Actual upload handler accepts harmless `%PDF-`-prefixed non-document bytes and writes them unchanged through the mocked R2 seam. Actual DELETE reports success and makes no storage call. This proves insufficient validation and deletion omission; it is not a demonstration of PDF code execution. CDN reachability has the same explicit configuration condition as PM-02.

**Fix/acceptance:** Apply a deliberate attachment security policy: private storage, authenticated access until explicit sharing, safe image processing/moderation, PDF structural/content validation as appropriate, documented recipient exposure and comprehensive deletion. Include external cards in account erasure/export inventory and retries. An ordinary DB cascade is insufficient.

## PM-05 — High: public PDF downloads send photos to Groq without talent AI consent

**Where:** `src/domains/pdf/routes/pdf.js:2104` unauthenticated GET `/pdf/:slug`; render call at 2320 and `jury` defaults to true at 2346. Current `src/domains/pdf/generator.js:339–370` gates only on `opts.jury`, `GROQ_API_KEY`, non-test runtime; renders five fronts to PNG. `src/domains/pdf/composition/front-program/jury.js:115–130` embeds image bytes and 225–236 calls Groq. This contrasts with central image-AI permission handling in `src/domains/ai/analyzeProfileImage.js:128` and its callers.

**Trigger:** Any visitor downloads a shareable profile's PDF in a deployment with Groq configured. No login or owner action is needed. Unless the visitor opts out using `?jury=0`, the server screenshots the candidate card fronts and sends them to the vision provider. The default composed template includes the required `#front` element (`src/domains/pdf/templates/compcard-composed.ejs:441`); this is not unreachable scaffolding.

**Impact:** Talent photos and printed identifying details cross the AI-provider boundary even when the talent disabled image analysis. Guardian-consented minors allowed to share public PDFs also pass this code, despite the central image-AI gate prohibiting provider analysis of minors. It additionally exposes unauthenticated paid compute: five browser renders plus a vision request per normal download.

**Proof/limits:** Executed real jury module with a mocked Groq client and synthetic screenshot bytes. Provider request contains both screenshots; the module accepts no profile, age or consent context. HTTP defaults and generator trigger were traced in current code. No real provider submission or browser render was run. Legal basis/vendor terms are unverified; the technical discrepancy with product consent is established.

**Fix/acceptance:** Make owner purpose-specific AI permission and age policy authoritative at this provider call, reread at dispatch, and keep ordinary public downloads deterministic. Do not allow a visitor-controlled URL parameter to authorize analysis of someone else. Cover opted-out adult, guardian-consented minor, unauthenticated download, and provider-cost limits.

## PM-06 — High: submission export webhooks disclose minors' direct contact

**Where:** `src/domains/talent/routes/applications.js:851–867` loads raw profile and determines minor status; 1771–1777 deliberately sets snapshot `contact: null` for minors. The same request passes original `profile` to `dispatchSubmission` at 1981–1990. `src/domains/agency/services/export-webhook-dispatch.js:78–107` selects contact from `profile` and sends `email` and `phone` with no age/minimization filter. Agency owners/admins can configure their recipient endpoint at `src/domains/agency/routes/export-webhook.js:66–69`.

**Attack/precondition:** A legitimate or abusive agency owner/admin configures a webhook and receives an application from a guardian-consented minor whose profile has a direct phone (or profile-level email). The agency endpoint receives that raw contact even though the in-product application package suppresses it. Profile-level email may be absent because the canonical email is in `users`; phone leakage does not depend on that email population detail.

**Impact:** Agencies gain direct off-platform contact with a minor and can retain it externally. This contradicts both the actual minimized snapshot and the exact disclosure at `src/shared/lib/submission-disclosure-content.js:67`, which says direct contact is omitted and agency communication occurs through Pholio. Guardian authorization of the stated package is not evidence of authorization for this additional field.

**Proof:** Real `buildPayload` invoked with a synthetic minor DOB/guardian-approved profile returns their direct phone and email unchanged. The reachable submission caller passes raw `profile`; no sanitized snapshot is used.

**Fix/acceptance:** Build webhook/export payloads from the consented immutable submission snapshot or the same canonical minor-safe DTO used for the package; never directly serialize the current profile. Test minor and adult submission through configured delivery, asserting suppressed fields never leave the process.

## PM-07 — High: account-erasure retries exist only as an uncalled function

**Where:** `src/shared/lib/account-deletion.js:275–294` persists provider failures; 303–304 proceeds with database cleanup/account removal; 337 defines `processPendingDeletions`; 443 exports it. The account-deletion response marks provider erasure pending (`account-deletion.js:428–435`, exposed by `src/domains/talent/routes/settings.js:1102`).

**Trigger:** An ordinary R2 or Firebase failure during account deletion creates a pending failure record. The user receives a pending-erasure response and their application row is removed. A search of `src`, `netlify` and `scripts` finds no invocation of `processPendingDeletions`; only tests invoke it. A retry function and a queue table do not execute themselves.

**Impact:** An account deletion affected by a transient provider outage can leave photos or the Firebase identity retained indefinitely unless someone performs an out-of-band manual intervention. The application correctly acknowledges incomplete erasure, but has no shipped consumer to complete it after recovery.

**Evidence/limits:** Confirmed independently by source/callsite search and by lead lane. No provider outage was induced. An external operator could invoke the function manually; no evidence of such a live operating procedure or independently deployed consumer was available. This is an absent in-repo recovery path, not proof no human has ever cleaned a record.

**Fix/acceptance:** Wire a bounded, scheduled retry consumer with concurrency ownership, backoff and alerts for oldest pending erasure; verify provider failure followed by recovery completes the same recorded task without user re-registration or database ownership rows.

## Additional observations / unresolved candidates

- **CSAM escalation contract mismatch:** content moderation emits `flags.skinRatio`, `flags.extremeAspect`, and combined comma-separated reasons (`content-moderation.js:297–330`); `csam-moderation.js:40–48` reads `skin_tone_ratio`, `extreme_aspect_ratio` and tests exact `reason === "high_skin_ratio"`. An image flagged for both high skin and aspect ratio is kept in ordinary review but misses the special CSAM escalation. This is an escalation-priority defect, not proof of CSAM detection coverage or a public-visibility bypass. Do not claim the heuristic identifies CSAM reliably.
- **PDF logo URL SSRF candidate:** `/api/pdf/agency-logo-url/:slug` only calls `new URL` (`pdf.js:3488`) and stores the value; the legacy template renders it as `<img src>` (`templates/compcard.ejs:757–764`). Puppeteer has no request interception and serverless launch disables web security. A browser trace is needed to verify current theme/engine reachability and network restrictions before assigning a concrete SSRF severity. No internal host was probed.
- **Storage authorization:** the application emits direct R2 URLs, not signed URLs, and no Worker/bucket/CDN ACL configuration was available in this lane to prove a separate object-level authorization layer. Query-level audience controls alone do not protect known URLs. Review actual Cloudflare settings before asserting production data is protected.
- **External dependencies:** provider retention, processing terms, moderation staffing, mandatory reporting operations, backup deletion and live CDN cache purge behavior were not established. These are verification gaps, not invented violations.

## Coverage and positive controls observed

Reviewed actual mounts, ordinary uploads/replacements/deletes, uploader and artifact purge, public portfolio/PDF loading, Wallet image selection and minor policy, external card uploads, comp-card import, privacy export/data inventory, account deletion and retry service, submission retention/redaction and scheduled callsites, content/CSAM/Hive moderation, image fetching and AI vision jury, and the agency export-contact boundary. This lane did not independently cover all auth/tenant, payments, infrastructure, or dependency code; other audit lanes own those.

Ordinary uploads do invoke moderation and default unconsented minors' audience columns private. Invalid images fail closed in `processImage`; processed image EXIF is stripped. Import uses in-memory buffers and its image branch checks image-AI consent. Wallet route requires the talent owner and sets `private, no-store`; content has a minor/guardian gate. Account deletion records R2/Firebase failures durably and has a retry function. Submission package expiry has a real redaction helper and scheduled/read-side callsites. These controls are real but do not cover the alternate paths reported above.

The recent user edits to PDF visibility/guardrails were preserved. No finding here relies on the removed default-private PDF loader check; the AI-jury problem remains in the current code independently.
