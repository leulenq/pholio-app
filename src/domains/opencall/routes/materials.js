"use strict";

/**
 * Shortlist-stage fulfilment — the applicant's half of "request materials"
 * (`docs/open-call-applicant-flow-design-2026-08.md` §2 Law 2, §5.4).
 *
 * The organizer's half lives in `src/domains/agency/routes/materials.js`: it
 * upserts `open_call_material_requests`, mints a `materials`-purpose claim token
 * for an identity-backed applicant, and emails
 * `${appBase}/opencall/materials/${raw}`. This file serves that URL.
 *
 * FIVE POSTURES, EACH A DECISION
 *
 * 1. **Fulfilment NEVER requires an account** (ruling Q8). No session is opened,
 *    no claim is required, nothing here writes to `users`. The credential is the
 *    raw token in the path, delivered to a mailbox. The claim is *offered* after
 *    the materials are sent, never before — asking someone to make an account in
 *    order to answer three questions they were asked for is the abandonment the
 *    whole flow exists to remove.
 * 2. **Viewing does not consume; only fulfilment does.** A `materials` link is
 *    clicked more than once as a matter of course — the applicant opens it on
 *    the train, gets the measuring tape out at home, opens it again. A mail
 *    client's link previewer clicks it before the human ever does. So `GET` uses
 *    `findClaimTokenByRawToken` / `validateClaimToken` *without* consuming, and
 *    `consumeClaimToken` runs inside the fulfilment transaction, where it is the
 *    replay boundary for a double-submit.
 * 3. **No oracles, with one narrow exception the codebase already makes.**
 *    Unknown, expired, wrong-purpose and disowned all answer the identical
 *    `{success:true, data:{valid:false}}` shape `claim.js` and `apply.js` use.
 *    The exception is a *spent* token whose request is already fulfilled: it
 *    also answers `{valid:false}`, plus `alreadySent: true` — exactly the shape
 *    and exactly the reasoning of `claim.js`'s `alreadyClaimed` branch. The
 *    caller already holds the raw token, so it learns nothing it did not
 *    present, and "no dead ends" beats a second click on your own confirmation
 *    landing on "invalid link".
 * 4. **The write lands where the organizer reads.** Fulfilment merges into the
 *    LATEST `talent_submission_packages` payload — `payload.answers` (which
 *    `resolveApplicantIdentity` reads for `core_measurements`) *and* the
 *    top-level `availability` / `walkVideoUrl` (which the designer pick page
 *    reads) — and into `open_call_submissions.answers` for the same application
 *    where that row still exists. One transaction, so a half-fulfilled snapshot
 *    with a spent token cannot exist.
 * 5. **Only what was asked for.** Validation runs over the request row's
 *    `requested_keys` and nothing else, with the same normalizers the apply flow
 *    uses (`normalizeAnswer`, exported from `services/submissions.js`). A key
 *    the organizer did not ask for is refused rather than stored: `answers` is
 *    projected onto profile columns at claim (§5.2), so an unasked key is a
 *    value that silently reaches a profile.
 *
 * NOT SAME-ORIGIN GUARDED, for `claim.js`'s reason: the request originates from
 * a click in a mail client, which sends no useful Origin and cannot set a custom
 * header. What stands in for CSRF is that the mutation is authorized by an
 * unguessable single-use token in the path, not by ambient cookie authority.
 * Rate limiting is `authLimiter` on `/api/public/opencall/materials` in
 * `src/app.js` — low volume, credential-shaped.
 */

const express = require("express");

const knex = require("../../../shared/db/knex");
const { hasApplicantIdentitySchema } = require("../services/schema");
const {
  CLAIM_TOKEN_PURPOSES,
  consumeClaimToken,
  findClaimTokenByRawToken,
  isExpired,
  mintClaimToken,
  validateClaimToken,
} = require("../services/claim-tokens");
const {
  jsonForDb,
  normalizeAnswer,
  parseJsonColumn,
} = require("../services/submissions");
const {
  findClaimedProfileForEmail,
} = require("../services/applicant-identities");
const {
  INTAKE_FIELDS,
} = require("../../../shared/constants/open-call-intake");
const {
  EVENT_CASTING_DISCLOSURE_CONTENT,
  EVENT_CASTING_DISCLOSURE_VERSION,
} = require("../../../shared/lib/submission-disclosure-content");
const {
  FUNNEL_EVENT_TYPES,
} = require("../../../shared/constants/event-casting");
const {
  anonIdFromRequest,
  recordEventFunnelEvent,
} = require("../../../shared/services/event-funnel");
const {
  eventDTO,
  hasEventCallColumns,
} = require("../../agency/services/open-call-brief");

const router = express.Router();

const REQUESTS_TABLE = "open_call_material_requests";
const PACKAGES_TABLE = "talent_submission_packages";
const SUBMISSIONS_TABLE = "open_call_submissions";

/** The one shape an unusable token ever produces. */
const INVALID = { success: true, data: { valid: false } };

/** Bound on the typed measurements answer — `TEXT_LIMITS.core_measurements`. */
const MEASUREMENTS_TEXT_LIMIT = 240;

function ok(res, data) {
  return res.json({ success: true, data });
}

function fail(res, status, code, message, extra = {}) {
  return res.status(status).json({ success: false, error: code, message, ...extra });
}

function codedError(message, code, extra = {}) {
  const error = new Error(message);
  error.code = code;
  return Object.assign(error, extra);
}

function millis(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function hasTable(db, table) {
  return db.schema.hasTable(table).catch(() => false);
}

/**
 * `requested_keys` is jsonb on PostgreSQL (already an array) and text on SQLite.
 * `parseJsonColumn` deliberately flattens arrays to `{}`, so this column is
 * parsed on its own terms.
 */
function parseKeys(value) {
  if (Array.isArray(value)) return value.filter((key) => typeof key === "string");
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
  } catch {
    return [];
  }
}

/** Only keys the closed vocabulary knows. An unknown key cannot be rendered or stored. */
function knownKeys(keys) {
  return keys.filter((key) => Boolean(INTAKE_FIELDS[key]));
}

function fieldDefsFor(keys) {
  return keys.map((key) => ({
    key,
    kind: INTAKE_FIELDS[key].kind,
    label: INTAKE_FIELDS[key].label,
  }));
}

/**
 * Which ask is this link for?
 *
 * SINCE `20260819140000`, THE TOKEN SAYS. `applicant_claim_tokens.
 * material_request_id` names the one request the link was emailed for, and the
 * identity join below is what confirms that request is this applicant's — a
 * token cannot reach a request belonging to someone else, and cannot reach one
 * whose application has been withdrawn.
 *
 * The identity-join heuristic that follows is now LEGACY-ONLY: it runs when the
 * token carries no binding, which means a token minted before the migration (or
 * before the column existed on this deployment). It was the only rule this page
 * had, and it is wrong whenever two organizers have outstanding requests against
 * the same applicant at once — both links resolve to the same request, so one
 * organizer's link renders the other's asks and marks the other's request
 * fulfilled. Keeping it only for unbound tokens honours the links already in
 * people's inboxes without carrying the bug forward.
 *
 * Legacy ordering: unfulfilled requests win, newest due date first (a re-request
 * moves the deadline, and the deadline the applicant was last told about is the
 * one they are answering). When nothing is outstanding, the most recently
 * fulfilled request is returned so the page can say "already sent" instead of
 * "invalid".
 */
async function loadRequestContext(db, identity, token = null) {
  if (!(await hasTable(db, REQUESTS_TABLE))) return null;

  const rows = await db(`${REQUESTS_TABLE} as r`)
    .join("applications as a", "a.id", "r.application_id")
    .where("a.applicant_identity_id", identity.id)
    .whereNot("a.status", "withdrawn")
    .select(
      "r.id as request_id",
      "r.requested_keys",
      "r.due_at",
      "r.fulfilled_at",
      "r.created_at as requested_at",
      "a.id as application_id",
      "a.agency_id",
      "a.open_call_link_id",
      "a.profile_id",
    )
    .catch(() => []);
  if (!rows.length) return null;

  const boundRequestId = token?.material_request_id || null;
  let request;
  if (boundRequestId) {
    // The bound request must be among this identity's own rows. It is not there
    // when it belongs to another applicant, when the application was withdrawn,
    // or when the request was deleted — all of which are "this link has nothing
    // to show", answered in the one INVALID shape by the callers.
    request = rows.find((row) => row.request_id === boundRequestId) || null;
  } else {
    const outstanding = rows
      .filter((row) => !row.fulfilled_at)
      .sort(
        (left, right) =>
          (millis(right.due_at) ?? -Infinity) - (millis(left.due_at) ?? -Infinity) ||
          (millis(right.requested_at) ?? 0) - (millis(left.requested_at) ?? 0),
      );
    const fulfilled = rows
      .filter((row) => row.fulfilled_at)
      .sort((left, right) => (millis(right.fulfilled_at) ?? 0) - (millis(left.fulfilled_at) ?? 0));
    request = outstanding[0] || fulfilled[0];
  }
  if (!request) return null;

  const link = request.open_call_link_id
    ? await db("agency_open_call_links").where({ id: request.open_call_link_id }).first()
    : null;
  const agency = request.agency_id
    ? await db("agencies")
        .where({ id: request.agency_id })
        .first("name", "location", "logo_path")
        .catch(() => null)
    : null;

  const eventColumnsReady = link ? await hasEventCallColumns(db) : false;

  return {
    request,
    link,
    organizer: {
      name: agency?.name || null,
      logo: agency?.logo_path || null,
      location: agency?.location || null,
    },
    event: eventColumnsReady ? eventDTO(link) : null,
    requestedKeys: knownKeys(parseKeys(request.requested_keys)),
    fulfilled: Boolean(request.fulfilled_at),
  };
}

/** The LATEST usable snapshot for an application — the row §4's resolver reads. */
async function loadLatestPackage(db, applicationId) {
  if (!(await hasTable(db, PACKAGES_TABLE))) return null;
  const row = await db(PACKAGES_TABLE)
    .where({ application_id: applicationId })
    .orderBy([
      { column: "created_at", order: "desc" },
      { column: "id", order: "desc" },
    ])
    .first()
    .catch(() => null);
  if (!row) return null;
  // A revoked or redacted package is not written back into — the applicant
  // withdrew, or the snapshot was redacted for holding what it held.
  if (row.revoked_at || row.redacted_at) return null;
  return row;
}

/**
 * What the applicant already sent, so the form is not blank on a second visit.
 * `payload.answers` first, then the two top-level fields the account-backed
 * package writes — the same precedence `submitDraft` writes them in.
 */
function existingValues(payload, requestedKeys) {
  const answers = payload?.answers && typeof payload.answers === "object" ? payload.answers : {};
  const values = {};
  for (const key of requestedKeys) {
    if (answers[key] !== undefined && answers[key] !== null) {
      values[key] = answers[key];
      continue;
    }
    if (key === "walk_video_url" && payload?.walkVideoUrl) {
      values[key] = payload.walkVideoUrl;
      continue;
    }
    if (key === "availability_window" && payload?.availability) {
      values[key] = payload.availability;
    }
  }
  return values;
}

/**
 * The designer-visibility sentence, restated verbatim.
 *
 * §5.4's whole point: the materials being asked for now — the walk video, the
 * availability, the measurements — are precisely the fields third-party
 * designers see. The applicant consented to that at submit; they are told it
 * again, in the same words, at the moment they hand over the new values. Quoted
 * from `EVENT_CASTING_DISCLOSURE_CONTENT`, never paraphrased.
 */
function disclosureBlock() {
  return {
    thirdPartyAccess: EVENT_CASTING_DISCLOSURE_CONTENT.thirdPartyAccess,
    version: EVENT_CASTING_DISCLOSURE_VERSION,
  };
}

/**
 * GET /api/public/opencall/materials/:token
 *
 * Does NOT consume. See posture 2.
 */
router.get("/materials/:token", async (req, res) => {
  try {
    if (!(await hasApplicantIdentitySchema(knex))) return res.json(INVALID);

    const found = await findClaimTokenByRawToken(
      knex,
      req.params.token,
      CLAIM_TOKEN_PURPOSES.MATERIALS,
    );
    if (!found) return res.json(INVALID);
    // "That wasn't me" (§5.5). The link stops working and says nothing about
    // what the application contained.
    if (found.identity.disowned_at) return res.json(INVALID);

    const context = await loadRequestContext(knex, found.identity, found.token);
    const usable = !found.token.consumed_at && !isExpired(found.token.expires_at);

    if (!usable) {
      // The double-click case: this token was spent by a fulfilment that
      // succeeded. Same `{valid:false}` shape, one extra fact the holder of the
      // token already knows — `claim.js`'s `alreadyClaimed` precedent.
      return res.json({
        success: true,
        data: context?.fulfilled ? { valid: false, alreadySent: true } : { valid: false },
      });
    }

    if (!context) return res.json(INVALID);

    if (context.fulfilled) {
      return ok(res, {
        valid: true,
        fulfilled: true,
        organizer: context.organizer,
        event: context.event,
        fulfilledAt: context.request.fulfilled_at || null,
      });
    }

    const pkg = await loadLatestPackage(knex, context.request.application_id);
    const payload = pkg ? parseJsonColumn(pkg.payload) : {};

    return ok(res, {
      valid: true,
      fulfilled: false,
      organizer: context.organizer,
      event: context.event,
      requestedKeys: context.requestedKeys,
      fieldDefs: fieldDefsFor(context.requestedKeys),
      dueAt: context.request.due_at || null,
      values: existingValues(payload, context.requestedKeys),
      disclosure: disclosureBlock(),
    });
  } catch (error) {
    console.error("[OpenCall Materials] GET /materials/:token failed:", error.message);
    return fail(res, 500, "MATERIALS_LOAD_FAILED", "Failed to load this link.");
  }
});

/**
 * Validate the submitted answers against the requested keys, and nothing else.
 *
 * `core_measurements` is not a plain text field here even though its `kind` is
 * `text`. The organizer's ask is a *confirmation*: `validate-submission-package`
 * frames it as "the applicant asserting the numbers are current for these dates,
 * not merely present on the profile". An anonymous applicant has no profile to
 * assert about, so both halves are required — the current numbers, typed, and an
 * explicit confirmation that they are current. Storing the numbers without the
 * confirmation would make the organizer's record say something the applicant
 * never said.
 */
function validateAnswers(body, requestedKeys) {
  const incoming = body?.answers;
  if (incoming === null || incoming === undefined || typeof incoming !== "object" || Array.isArray(incoming)) {
    return { errors: [{ key: "answers", code: "invalid_shape" }] };
  }

  const requested = new Set(requestedKeys);
  const errors = [];
  const accepted = {};

  for (const [key, raw] of Object.entries(incoming)) {
    // `measurementsConfirmed` is the confirmation flag, not a vocabulary key.
    if (key === "measurementsConfirmed") continue;
    if (!requested.has(key)) {
      errors.push({ key, code: "not_requested" });
      continue;
    }
    const result = normalizeAnswer(key, raw);
    if (result.code) {
      errors.push({ key, code: result.code });
      continue;
    }
    if (result.clear) continue;
    accepted[key] = result.value;
  }

  const confirmed =
    incoming.measurementsConfirmed === true || body?.measurementsConfirmed === true;

  for (const key of requestedKeys) {
    if (accepted[key] === undefined) {
      errors.push({ key, code: "required" });
      continue;
    }
    if (key === "core_measurements") {
      if (String(accepted[key]).length > MEASUREMENTS_TEXT_LIMIT) {
        accepted[key] = String(accepted[key]).slice(0, MEASUREMENTS_TEXT_LIMIT);
      }
      if (!confirmed) {
        errors.push({ key: "core_measurements", code: "confirmation_required" });
      }
    }
  }

  return errors.length ? { errors } : { accepted, measurementsConfirmed: confirmed };
}

/**
 * POST /api/public/opencall/materials/:token
 * Body: { answers: { walk_video_url?, availability_window?, core_measurements?,
 *                    measurementsConfirmed? } }
 */
router.post("/materials/:token", async (req, res) => {
  try {
    if (!(await hasApplicantIdentitySchema(knex))) return res.json(INVALID);

    const valid = await validateClaimToken(
      knex,
      req.params.token,
      CLAIM_TOKEN_PURPOSES.MATERIALS,
    );
    // Unknown, expired, and the second half of a double-submit all land here,
    // in one shape.
    if (!valid) return res.json(INVALID);
    if (valid.identity.disowned_at) return res.json(INVALID);

    const context = await loadRequestContext(knex, valid.identity, valid.token);
    if (!context) return res.json(INVALID);
    if (context.fulfilled) {
      // Nothing outstanding. Not an error — the page says "already sent".
      return ok(res, { valid: true, fulfilled: true, organizer: context.organizer });
    }

    const validated = validateAnswers(req.body, context.requestedKeys);
    if (validated.errors) {
      return fail(res, 400, "VALIDATION", "Some answers could not be sent.", {
        errors: validated.errors,
      });
    }

    const { accepted, measurementsConfirmed } = validated;
    const fulfilledAt = new Date().toISOString();
    const applicationId = context.request.application_id;

    await knex.transaction(async (trx) => {
      // The replay boundary for the request row, alongside the token's own.
      const claimed = await trx(REQUESTS_TABLE)
        .where({ id: context.request.request_id })
        .whereNull("fulfilled_at")
        .update({ fulfilled_at: fulfilledAt, updated_at: trx.fn.now() });
      if (claimed !== 1) {
        throw codedError("This request was already fulfilled", "ALREADY_FULFILLED");
      }

      const pkg = await loadLatestPackage(trx, applicationId);
      if (pkg) {
        const payload = parseJsonColumn(pkg.payload);
        const answers = {
          ...(payload.answers && typeof payload.answers === "object" ? payload.answers : {}),
          ...accepted,
        };
        const nextPayload = {
          ...payload,
          answers,
          // Top level too, because that is where the designer pick page reads
          // them. Both homes, one write.
          availability: accepted.availability_window || payload.availability || null,
          walkVideoUrl: accepted.walk_video_url || payload.walkVideoUrl || null,
          materials: {
            requestedKeys: context.requestedKeys,
            fulfilledAt,
            measurementsConfirmed:
              context.requestedKeys.includes("core_measurements")
                ? measurementsConfirmed === true
                : payload.materials?.measurementsConfirmed === true,
          },
        };
        await trx(PACKAGES_TABLE)
          .where({ id: pkg.id })
          .update({ payload: jsonForDb(trx, nextPayload) });
      }

      // The submission row the application came from, where it still exists.
      // `open_call_submissions` has no `application_id`; the pair
      // (link, identity) is unique among submitted rows.
      if (
        context.request.open_call_link_id &&
        (await hasTable(trx, SUBMISSIONS_TABLE))
      ) {
        const submission = await trx(SUBMISSIONS_TABLE)
          .where({
            open_call_link_id: context.request.open_call_link_id,
            applicant_identity_id: valid.identity.id,
            status: "submitted",
          })
          .first();
        if (submission) {
          const merged = { ...parseJsonColumn(submission.answers), ...accepted };
          await trx(SUBMISSIONS_TABLE)
            .where({ id: submission.id })
            .update({ answers: jsonForDb(trx, merged), updated_at: trx.fn.now() });
        }
      }

      await consumeClaimToken(trx, valid.token.id);
    });

    recordEventFunnelEvent({
      openCallLinkId: context.request.open_call_link_id,
      agencyId: context.request.agency_id,
      profileId: context.request.profile_id || null,
      anonId: anonIdFromRequest(req),
      eventType: FUNNEL_EVENT_TYPES.MATERIALS_FULFILLED,
    }).catch(() => {});

    // Ruling Q8: the claim is offered AFTER the materials are sent, never as a
    // condition of sending them. Nothing is minted for an identity that is
    // already claimed, already disowned, or whose address already has an
    // account — `resolveDestination` in `services/submissions.js` makes the same
    // three exclusions at submit, for the same reason.
    const claimUrl = await mintClaimOffer(valid.identity);

    return ok(res, {
      valid: true,
      fulfilled: true,
      organizer: context.organizer,
      fulfilledAt,
      claimUrl,
    });
  } catch (error) {
    if (error.code === "ALREADY_FULFILLED" || error.code === "CLAIM_TOKEN_CONFLICT") {
      // Lost the race with the applicant's own second click.
      return res.json(INVALID);
    }
    console.error("[OpenCall Materials] POST /materials/:token failed:", error.message);
    return fail(res, 500, "MATERIALS_SEND_FAILED", "Failed to send your materials.");
  }
});

/** Best-effort — a claim offer that could not be minted is not a failed send. */
async function mintClaimOffer(identity) {
  try {
    if (identity.claimed_at || identity.disowned_at || identity.profile_id) return null;
    const existingAccount = await findClaimedProfileForEmail(
      knex,
      identity.email_normalized,
    );
    if (existingAccount) return null;
    const token = await mintClaimToken(knex, {
      identityId: identity.id,
      purpose: CLAIM_TOKEN_PURPOSES.CLAIM,
    });
    return token?.url || null;
  } catch (error) {
    console.error(
      "[OpenCall Materials] Claim offer could not be minted:",
      error?.code || error?.message || "unknown",
    );
    return null;
  }
}

module.exports = router;
