"use strict";

/**
 * The anonymous draft, and the submit that produces a real application
 * (`docs/open-call-applicant-flow-design-2026-08.md` §3.1–§3.4, §5.1–§5.3, §7).
 *
 * State 1 of the identity ladder — *anonymous draft* — is an
 * `open_call_submissions` row keyed by an httpOnly cookie and nothing else. No
 * PII exists until the applicant types it, no `users` row is ever written here,
 * and pressing send produces exactly what an account-backed submit produces:
 * an `applications` row, a frozen `talent_submission_packages` snapshot, and an
 * `application_submission_consent_events` audit row. Only the identity pointer
 * differs (§3.4 — the organizer's inbox, triage, pick lists, offers, auto-close
 * and CSV all run on `applications`, and a parallel review surface is the fork
 * ruling R10 forbids).
 *
 * FIVE POSTURES THAT ARE DECISIONS, NOT DETAILS
 *
 * 1. **The draft cookie is a bearer token, protected by being unguessable.**
 *    `cookie-parser` is mounted without a secret (`src/app.js`), so
 *    `res.cookie({signed:true})` is unavailable app-wide. The cookie therefore
 *    carries a raw 256-bit `crypto.randomBytes(32).base64url` value and the
 *    database stores only its sha256 — the same hash-at-rest shape as
 *    `applicant_claim_tokens` and `message_reply_tokens`. An HMAC would add
 *    nothing: a signature proves the server minted the value, and a 256-bit
 *    random value nobody can guess already proves that. What the hash *does*
 *    buy is that a database dump contains no usable draft credential.
 *    `sameSite: 'lax'` is the CSRF boundary — a cross-site POST does not carry
 *    the cookie at all, so no third-party page can drive a draft write.
 *
 * 2. **Uploads are gated behind the email step** (§7's abuse controls): every
 *    stored asset has an accountable address attached before it exists. The
 *    gate fires for *everyone*, which is why it is not an oracle.
 *
 * 3. **The email step never branches visibly** (§5.3). `findClaimedProfileForEmail`
 *    is consulted at submit and its answer changes only two invisible things:
 *    which pointer the application carries, and which of two emails is sent.
 *    Every HTTP response is identical for a known and an unknown address.
 *
 * 4. **The consent binds to server-side state.** The account-backed flow hashes
 *    a client-declared package; here the draft *is* the server's state, so the
 *    fingerprint is computed from the stored answers, media and spec version.
 *    A submit whose fingerprint does not match what the consent screen was
 *    shown is refused with CONSENT_PACKAGE_CHANGED.
 *
 * 5. **The uniqueness constraint is the authority, not the pre-check.** Two
 *    submits racing on the same (link, identity) both pass a `SELECT`; only one
 *    passes the partial unique. Both the pre-check and the constraint map to
 *    the same coded ALREADY_APPLIED, with the same message, whether the
 *    collision was identity-keyed or profile-keyed — a message that
 *    distinguished them would be the oracle §5.3 forbids.
 */

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const {
  CALL_KINDS,
  FUNNEL_EVENT_TYPES,
} = require("../../../shared/constants/event-casting");
const {
  CUSTOM_QUESTION_LIMITS,
  IDENTITY_POLICIES,
  INTAKE_FIELDS,
  INTAKE_REQUIREMENTS,
  applyStageFields,
  normalizeIntakeSpec,
} = require("../../../shared/constants/open-call-intake");
const {
  callKindOf,
  eventCallDTO,
  eventDisclosureContextFromLink,
  hasEventCallColumns,
  isClosedByDeadline,
} = require("../../agency/services/open-call-brief");
const { hashArrivalIp } = require("../../talent/services/open-call-claims");
const {
  buildSubmissionDisclosureSnapshot,
  eventPackageRetentionDate,
} = require("../../../shared/lib/submission-disclosure-content");
const {
  recordSubmissionDisclosureConsent,
  requestClientMeta,
} = require("../../talent/services/submission-disclosure-consent");
const {
  submissionRetentionExpiry,
} = require("../../../shared/lib/submission-retention");
const { isMinorProfile } = require("../../../shared/lib/talent-age");
const {
  anonIdFromRequest,
  recordEventFunnelEvent,
} = require("../../../shared/services/event-funnel");
const config = require("../../../config");
const {
  ensureIdentityForEmail,
  findClaimedProfileForEmail,
  normalizeIdentityEmail,
  normalizePhone,
} = require("./applicant-identities");
const {
  CLAIM_TOKEN_PURPOSES,
  mintClaimToken,
} = require("./claim-tokens");
// One reader for the JSON-ish columns of this domain — see services/json.js for
// why it is its own module and what `allowArrays` is for. Re-exported below,
// unchanged, because `routes/materials.js` imports it from here.
const { parseJsonColumn } = require("./json");
const {
  MEDIA_FIELD_SHOT_TYPES,
  publicUrlForStorageKey,
  splitLegalName,
} = require("./claim");
const { sendOpenCallReceiptEmailQuietly } = require("./emails");

const SUBMISSIONS_TABLE = "open_call_submissions";
const SUBMISSION_MEDIA_TABLE = "open_call_submission_media";

const SUBMISSION_STATUSES = Object.freeze({
  DRAFT: "draft",
  SUBMITTED: "submitted",
  ABANDONED: "abandoned",
});

/** §3.2's table: "TTL 14 days", refreshed on every touch. */
const DRAFT_TTL_DAYS = 14;

const DRAFT_COOKIE_NAME = "pholio_oc_draft";

/** Media a submitted package may carry. A rejected upload never travels. */
const PACKAGED_MEDIA_STATES = Object.freeze(["pending", "approved"]);

/** Per-key text ceilings. Generous enough to be invisible, bounded enough to be a column. */
const TEXT_LIMITS = Object.freeze({
  legal_name: 160,
  city: 120,
  instagram: 120,
  core_measurements: 240,
  gender: 60,
  email: 254,
  phone: 40,
  url: 512,
});
const DEFAULT_TEXT_LIMIT = 200;

const HEIGHT_CM_MIN = 50;
const HEIGHT_CM_MAX = 260;

function codedError(message, code, extra = {}) {
  const error = new Error(message);
  error.code = code;
  return Object.assign(error, extra);
}

/** jsonb where the database has it, text where it does not — public.js's idiom. */
function jsonForDb(db, value) {
  const client = db?.client?.config?.client;
  return client === "pg" || client === "postgresql"
    ? value
    : JSON.stringify(value ?? null);
}

function isPostgres(db) {
  const client = db?.client?.config?.client;
  return client === "pg" || client === "postgresql";
}

function addDays(days, from = new Date()) {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/* ------------------------------------------------------------ draft cookie */

function generateDraftToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashDraftToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

/**
 * Read the raw draft token off the request.
 *
 * `cookie-parser` is mounted app-wide, so `req.cookies` is populated; the raw
 * header is read as a fallback so this function keeps working if a caller
 * mounts the router without it.
 */
function readDraftToken(req) {
  const fromParser = req?.cookies?.[DRAFT_COOKIE_NAME];
  if (typeof fromParser === "string" && fromParser.trim()) {
    return fromParser.trim();
  }
  const header = req?.headers?.cookie;
  if (typeof header !== "string") return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === DRAFT_COOKIE_NAME) {
      const value = rest.join("=").trim();
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

/**
 * HOST-ONLY, deliberately — this is the one first-party cookie that does NOT
 * use `baseCookieOptions()`'s shared `.pholio.studio` domain.
 *
 * The session cookie is domain-scoped because the marketing site and the app
 * share it. A draft token is only ever presented to the app that minted it, so
 * scoping it to the app host keeps a bearer credential for someone's
 * half-finished application off every other subdomain that could ever be
 * added. Narrower is correct here, and nothing needs the wider scope.
 *
 * `sameSite: 'lax'` is the CSRF boundary: a cross-site POST arrives without
 * this cookie, so a third-party page has no draft to write to.
 */
function draftCookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.nodeEnv === "production",
    maxAge: DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

function issueDraftToken(res, rawToken) {
  res.cookie(DRAFT_COOKIE_NAME, rawToken, draftCookieOptions());
}

function clearDraftToken(res) {
  // A deletion only matches when name, path and domain line up — so the clear
  // must be as host-only as the set.
  res.clearCookie(DRAFT_COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.nodeEnv === "production",
  });
}

/* -------------------------------------------------------------- call context */

/**
 * Everything the applicant flow needs to know about a call: its kind, its
 * identity policy, its normalized apply-stage spec and the context the event
 * consent copy interpolates.
 *
 * `findActiveLinkByCode` projects a fixed column list owned by the entitlements
 * service; widening it there would put intake knowledge in a module whose job
 * is claims. One indexed read by primary key, exactly as `loadEventCall` in
 * `src/routes/api/public.js` does for the arrival screen.
 */
async function loadCallContext(db, link) {
  const row = await db("agency_open_call_links as l")
    .leftJoin("agencies as a", "a.id", "l.agency_id")
    .where("l.id", link.id)
    .first("l.*", "a.name as agency_name");
  if (!row) return null;

  const eventColumnsReady = await hasEventCallColumns(db);
  const callKind = eventColumnsReady ? callKindOf(row) : CALL_KINDS.REPRESENTATION;

  // A stored spec that does not normalize is a bug in the authoring surface,
  // not something to paper over: falling back to the platform default would
  // silently change what the organizer asks for, and submissions would be
  // frozen against a spec nobody chose.
  const spec = normalizeIntakeSpec(
    row.intake_spec === null || row.intake_spec === undefined
      ? null
      : parseSpecColumn(row.intake_spec),
    callKind,
  );

  return {
    link: row,
    linkId: row.id,
    agencyId: row.agency_id,
    agencyName: row.agency_name || null,
    callKind,
    callPurpose: callKind,
    identityPolicy: row.identity_policy || IDENTITY_POLICIES.ACCOUNT_REQUIRED,
    specVersion: Number(row.intake_spec_version) || 1,
    spec,
    applyFields: applyStageFields(spec),
    eventCall: eventColumnsReady ? eventCallDTO(row) : null,
    disclosureContext: eventColumnsReady
      ? eventDisclosureContextFromLink(row, row.agency_name)
      : null,
    closed: isClosedByDeadline(row),
  };
}

function parseSpecColumn(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      throw codedError("Stored intake_spec is not valid JSON", "INVALID_INTAKE_SPEC");
    }
  }
  return null;
}

/* ------------------------------------------------------------ answer shapes */

function normalizeText(value, limit) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text.slice(0, limit);
}

function normalizeIsoDate(value) {
  const text = normalizeText(value, 10);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? null : text;
}

function normalizeHttpUrl(value) {
  const raw = normalizeText(value, TEXT_LIMITS.url);
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed.toString().slice(0, TEXT_LIMITS.url);
  } catch {
    return null;
  }
}

function normalizeDateRange(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const from = normalizeIsoDate(value.from);
  const to = normalizeIsoDate(value.to);
  if (!from || !to) return null;
  if (from > to) return null;
  return { from, to };
}

/**
 * One field, normalized by its vocabulary `kind`.
 *
 * Returns `{ value }` for a good answer, `{ clear: true }` for an empty one (a
 * partial save is allowed to un-answer a question), or `{ code }` for a value
 * the field cannot hold. NOTHING here is required — §5.1's autosave banks
 * whatever is typed, and the requirement check lives in `evaluateApplySpec`.
 */
function normalizeAnswer(key, raw) {
  const field = INTAKE_FIELDS[key];
  if (!field) return { code: "unknown_field" };

  const empty =
    raw === null ||
    raw === undefined ||
    (typeof raw === "string" && raw.trim() === "");
  if (empty && field.kind !== "attestation") return { clear: true };

  switch (field.kind) {
    case "text":
    case "enum": {
      const value = normalizeText(raw, TEXT_LIMITS[key] || DEFAULT_TEXT_LIMIT);
      return value ? { value } : { clear: true };
    }
    case "email": {
      // Kept AS TYPED for display and for the receipt address; validated by
      // the same normalizer that will key the identity, so an address that
      // cannot become an identity cannot be saved as an answer either.
      const typed = normalizeText(raw, TEXT_LIMITS.email);
      if (!typed || !normalizeIdentityEmail(typed)) return { code: "invalid_email" };
      return { value: typed };
    }
    case "phone": {
      // Tolerant on purpose: the FWBK response sheet has "I don't have a phone
      // num" in a phone column. An unparseable string is still the applicant's
      // answer; it just never becomes the `phone_normalized` signal (§5.6).
      const typed = normalizeText(raw, TEXT_LIMITS.phone);
      return typed ? { value: typed } : { clear: true };
    }
    case "number": {
      const numeric =
        typeof raw === "number" ? raw : Number(String(raw).replace(/[^\d.]/g, ""));
      if (!Number.isFinite(numeric)) return { code: "invalid_number" };
      const cm = Math.round(numeric);
      if (cm < HEIGHT_CM_MIN || cm > HEIGHT_CM_MAX) return { code: "out_of_range" };
      return { value: cm };
    }
    case "url": {
      const url = normalizeHttpUrl(raw);
      return url ? { value: url } : { code: "invalid_url" };
    }
    case "date": {
      const date = normalizeIsoDate(raw);
      return date ? { value: date } : { code: "invalid_date" };
    }
    case "date_range": {
      const range = normalizeDateRange(raw);
      return range ? { value: range } : { code: "invalid_date_range" };
    }
    case "attestation": {
      if (raw === true) return { value: true };
      if (raw === false || empty) return { clear: true };
      return { code: "invalid_attestation" };
    }
    case "media":
      // Media is a row in `open_call_submission_media`, never an answer. A
      // client that could write a media key into `answers` could satisfy a
      // required photo with a string.
      return { code: "media_not_an_answer" };
    default:
      return { code: "unknown_field" };
  }
}

/** Custom questions: free text, bounded, never promoted to a profile (§3.1). */
function normalizeCustomAnswers(existing, incoming) {
  if (incoming === null || incoming === undefined) return { answers: existing };
  if (typeof incoming !== "object" || Array.isArray(incoming)) {
    return { errors: [{ key: "customAnswers", code: "invalid_shape" }] };
  }

  const merged = { ...existing };
  const errors = [];
  for (const [rawKey, rawValue] of Object.entries(incoming)) {
    const key = String(rawKey).trim().slice(0, CUSTOM_QUESTION_LIMITS.maxLabelLength);
    if (!key) {
      errors.push({ key: rawKey, code: "invalid_key" });
      continue;
    }
    if (rawValue === null || rawValue === undefined || rawValue === "") {
      delete merged[key];
      continue;
    }
    const value = String(rawValue)
      .trim()
      .slice(0, CUSTOM_QUESTION_LIMITS.maxAnswerLength);
    if (!value) {
      delete merged[key];
      continue;
    }
    merged[key] = value;
  }

  if (Object.keys(merged).length > CUSTOM_QUESTION_LIMITS.maxQuestions) {
    errors.push({ key: "customAnswers", code: "too_many_questions" });
  }
  return errors.length ? { errors } : { answers: merged };
}

/* --------------------------------------------------------------- fingerprint */

/** Sorted-key JSON, byte-stable across property insertion order. */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * The exact bytes this consent is bound to.
 *
 * The account-backed flow hashes a package the *client* declares
 * (`buildSubmissionPackageFingerprint`). Here the draft is server-side state,
 * so there is nothing to declare: the hash is taken over what the server holds.
 * Everything the applicant consented to is in it — the answers, which media
 * rows exist, and the spec version those answers were given against.
 */
function packageFingerprint({ answers, customAnswers, mediaRows, specVersion }) {
  const media = (mediaRows || [])
    .map((row) => ({ id: row.id, fieldKey: row.field_key }))
    .sort((left, right) => left.fieldKey.localeCompare(right.fieldKey, "en-US"));
  return crypto
    .createHash("sha256")
    .update(
      canonicalJson({
        specVersion: Number(specVersion) || 1,
        answers: answers || {},
        customAnswers: customAnswers || {},
        media,
      }),
    )
    .digest("hex");
}

function fingerprintsMatch(left, right) {
  if (
    typeof left !== "string" ||
    typeof right !== "string" ||
    !/^[a-f0-9]{64}$/i.test(left) ||
    !/^[a-f0-9]{64}$/i.test(right)
  ) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(left.toLowerCase(), "hex"),
    Buffer.from(right.toLowerCase(), "hex"),
  );
}

/* ------------------------------------------------------------------ drafts */

async function loadDraftMedia(db, submissionId) {
  return db(SUBMISSION_MEDIA_TABLE)
    .where({ submission_id: submissionId })
    .orderBy("created_at", "asc")
    .select("*");
}

/**
 * Find the draft this cookie points at, or start a new one.
 *
 * A token minted for another call starts a fresh draft: one browser, one live
 * draft, and a token is scoped to the call it was issued on so a stale cookie
 * cannot graft answers from FWBK Brooklyn onto FWBK Queens.
 *
 * @returns {Promise<{draft: object, rawToken: string, created: boolean}>}
 */
async function getOrCreateDraft(db, { link, rawToken, ip, userAgent, specVersion } = {}) {
  if (rawToken) {
    const existing = await db(SUBMISSIONS_TABLE)
      .where({
        draft_token_hash: hashDraftToken(rawToken),
        open_call_link_id: link.id,
      })
      .first();
    if (existing && existing.status === SUBMISSION_STATUSES.DRAFT) {
      const expiresAt = addDays(DRAFT_TTL_DAYS).toISOString();
      await db(SUBMISSIONS_TABLE)
        .where({ id: existing.id })
        .update({ expires_at: expiresAt, updated_at: db.fn.now() });
      existing.expires_at = expiresAt;
      return { draft: existing, rawToken, created: false };
    }
    if (existing) {
      // Already submitted through this cookie. A new draft here would let the
      // same browser re-enter a call it has finished; the caller answers with
      // ALREADY_APPLIED instead.
      return { draft: existing, rawToken, created: false };
    }
  }

  const id = uuidv4();
  const token = generateDraftToken();
  await db(SUBMISSIONS_TABLE).insert({
    id,
    open_call_link_id: link.id,
    agency_id: link.agency_id,
    applicant_identity_id: null,
    draft_token_hash: hashDraftToken(token),
    answers: jsonForDb(db, {}),
    custom_answers: jsonForDb(db, {}),
    intake_spec_version: Number(specVersion) || 1,
    status: SUBMISSION_STATUSES.DRAFT,
    expires_at: addDays(DRAFT_TTL_DAYS).toISOString(),
    ip_hash: hashArrivalIp(ip),
    user_agent: userAgent ? String(userAgent).slice(0, 512) : null,
    created_at: db.fn.now(),
    updated_at: db.fn.now(),
  });

  const draft = await db(SUBMISSIONS_TABLE).where({ id }).first();
  return { draft, rawToken: token, created: true };
}

/**
 * Merge-validate a partial answer set against the call's apply-stage spec.
 *
 * Unknown keys, shortlist-stage keys and hidden keys are all refused rather
 * than stored: `answers` is projected onto profile columns at claim (§5.2), so
 * a key nobody asked for is a value that silently reaches a profile.
 *
 * @returns {Promise<{draft: object, answers: object, customAnswers: object, savedKeys: string[]}>}
 */
async function updateDraftAnswers(db, { draft, spec, answers, customAnswers } = {}) {
  const allowed = new Map(
    applyStageFields(spec).map((entry) => [entry.key, entry]),
  );

  const current = parseJsonColumn(draft.answers);
  const merged = { ...current };
  const errors = [];
  const savedKeys = [];

  if (answers !== null && answers !== undefined) {
    if (typeof answers !== "object" || Array.isArray(answers)) {
      throw codedError("answers must be an object", "INTAKE_VALIDATION_FAILED", {
        errors: [{ key: "answers", code: "invalid_shape" }],
      });
    }
    for (const [key, raw] of Object.entries(answers)) {
      if (!allowed.has(key)) {
        errors.push({ key, code: "not_asked_at_apply" });
        continue;
      }
      const result = normalizeAnswer(key, raw);
      if (result.code) {
        errors.push({ key, code: result.code });
        continue;
      }
      if (result.clear) {
        delete merged[key];
        savedKeys.push(key);
        continue;
      }
      merged[key] = result.value;
      savedKeys.push(key);
    }
  }

  const custom = normalizeCustomAnswers(
    parseJsonColumn(draft.custom_answers),
    customAnswers,
  );
  if (custom.errors) errors.push(...custom.errors);

  if (errors.length) {
    throw codedError(
      "Some answers could not be saved",
      "INTAKE_VALIDATION_FAILED",
      { errors },
    );
  }

  await db(SUBMISSIONS_TABLE)
    .where({ id: draft.id })
    .update({
      answers: jsonForDb(db, merged),
      custom_answers: jsonForDb(db, custom.answers),
      expires_at: addDays(DRAFT_TTL_DAYS).toISOString(),
      updated_at: db.fn.now(),
    });

  const updated = await db(SUBMISSIONS_TABLE).where({ id: draft.id }).first();
  return {
    draft: updated,
    answers: merged,
    customAnswers: custom.answers,
    savedKeys,
  };
}

/**
 * The email step (§5.3). Attaches an identity to the draft and unlocks uploads.
 *
 * NEVER TELLS THE CALLER ANYTHING. `ensureIdentityForEmail` reports whether the
 * identity was created and whether it was previously disowned; both are
 * swallowed here and neither reaches a response body.
 */
async function attachIdentity(db, { draft, spec, email, phone } = {}) {
  const normalized = normalizeIdentityEmail(email);
  if (!normalized) {
    throw codedError("A valid email address is required", "INTAKE_VALIDATION_FAILED", {
      errors: [{ key: "email", code: "invalid_email" }],
    });
  }

  const { identity } = await ensureIdentityForEmail(db, { email, phone });

  // The address as typed also becomes the `email` answer, because the spec
  // asks for it at apply and the frozen snapshot has to carry what the
  // applicant wrote, not the plus-stripped key.
  const answerPatch = { email };
  if (phone !== undefined && phone !== null && String(phone).trim() !== "") {
    const allowed = new Set(applyStageFields(spec).map((entry) => entry.key));
    if (allowed.has("phone")) answerPatch.phone = phone;
  }
  const saved = await updateDraftAnswers(db, {
    draft,
    spec,
    answers: answerPatch,
  });

  await db(SUBMISSIONS_TABLE)
    .where({ id: draft.id })
    .update({ applicant_identity_id: identity.id, updated_at: db.fn.now() });

  const updated = await db(SUBMISSIONS_TABLE).where({ id: draft.id }).first();
  return { draft: updated, identity, answers: saved.answers };
}

/* ------------------------------------------------------------- requirements */

/**
 * What still blocks send, as stable codes the client can key on.
 *
 * Media requirements are satisfied by an `open_call_submission_media` row that
 * is not rejected — ruling Q7: the two photos gate submission by default,
 * sequenced last.
 */
function evaluateApplySpec(spec, answers = {}, mediaRows = []) {
  const present = new Set(
    (mediaRows || [])
      .filter((row) => row.moderation_state !== "rejected")
      .map((row) => row.field_key),
  );
  const blockers = [];

  for (const entry of applyStageFields(spec)) {
    if (entry.requirement !== INTAKE_REQUIREMENTS.REQUIRED) continue;
    const field = INTAKE_FIELDS[entry.key];
    if (!field) continue;

    if (field.kind === "media") {
      if (!present.has(entry.key)) blockers.push(`intake_missing:${entry.key}`);
      continue;
    }
    if (field.kind === "attestation") {
      // Literal true only. A truthy string is not an attestation.
      if (answers[entry.key] !== true) blockers.push(`intake_missing:${entry.key}`);
      continue;
    }
    const value = answers[entry.key];
    const empty =
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "");
    if (empty) blockers.push(`intake_missing:${entry.key}`);
  }

  return blockers;
}

/* ------------------------------------------------------------------ submit */

/** Ruling R4 as a timestamp: `event_ends_on + 90 days`, or null when undated. */
function eventRetentionExpiry(disclosureContext) {
  const endsOn = disclosureContext?.eventEndsOn;
  const retentionDate = eventPackageRetentionDate(endsOn);
  return retentionDate
    ? new Date(`${retentionDate}T00:00:00.000Z`).toISOString()
    : null;
}

/** The frozen identity block §4's resolver reads for an unclaimed applicant. */
function buildIdentityBlock({ identity, answers }) {
  const { firstName, lastName } = splitLegalName(answers.legal_name);
  const displayName =
    normalizeText(answers.legal_name, TEXT_LIMITS.legal_name) ||
    [firstName, lastName].filter(Boolean).join(" ") ||
    null;
  return {
    source: "open_call_submission",
    applicantIdentityId: identity.id,
    firstName: firstName || null,
    lastName: lastName || null,
    displayName,
    // As typed, falling back to the identity key so the block is never
    // anonymous to the organizer.
    email: answers.email || identity.email_normalized || null,
    phone: answers.phone || identity.phone_normalized || null,
    city: answers.city || null,
    gender: answers.gender || null,
    heightCm: Number.isFinite(answers.height) ? answers.height : null,
    instagram: answers.instagram || null,
    // Event calls require this at apply (`normalizeIntakeSpec`) and submit
    // refuses without it, so this reads `true` on every event package.
    adultAttestation: answers.adult_attestation === true,
  };
}

/** Anonymous uploads, in the shape `snapshotSubmissionImage` produces. */
function buildPackageImages(mediaRows, spec) {
  const order = new Map(
    applyStageFields(spec)
      .filter((entry) => INTAKE_FIELDS[entry.key]?.kind === "media")
      .map((entry, index) => [entry.key, index]),
  );
  return (mediaRows || [])
    .filter((row) => PACKAGED_MEDIA_STATES.includes(row.moderation_state))
    .sort(
      (left, right) =>
        (order.get(left.field_key) ?? 99) - (order.get(right.field_key) ?? 99),
    )
    .map((row, index) => {
      const url = publicUrlForStorageKey(row.storage_key);
      return {
        id: row.id,
        path: url,
        public_url: url,
        alt: "",
        image_type: "digital",
        shot_type: MEDIA_FIELD_SHOT_TYPES[row.field_key] || null,
        sort: index + 1,
        is_primary: false,
      };
    });
}

function isUniqueViolation(error) {
  return (
    error?.code === "SQLITE_CONSTRAINT" ||
    error?.code === "23505" ||
    /UNIQUE constraint failed|duplicate key value/i.test(String(error?.message || ""))
  );
}

const ALREADY_APPLIED_MESSAGE =
  "You have already applied to this call.";

/**
 * Is the profile this address resolves to a minor's?
 *
 * Built from the same combined shape the account-backed submit feeds
 * `isMinorProfile` — the profile row plus the account's email — so the two paths
 * decide "minor" from identical inputs. `isMinorProfile` reads only the date of
 * birth; a profile with none (or an unparseable one) is not a minor to either
 * path, which is the pre-existing platform rule and not this guard's to change.
 */
async function isMinorDestinationProfile(db, claimed) {
  const profile = await db("profiles")
    .where({ id: claimed.profileId })
    .first("id", "date_of_birth");
  if (!profile) return false;
  const user = claimed.userId
    ? await db("users").where({ id: claimed.userId }).first("email")
    : null;
  return isMinorProfile({ ...profile, email: user?.email || null });
}

/** The one destination an address with nothing behind it produces. */
function identityOnlyDestination() {
  return { profileId: null, userId: null, alreadyHadAccount: false, mintClaim: true };
}

/**
 * Where this application lands (§5.3). NEVER SURFACED TO THE APPLICANT.
 *
 * A claimed talent profile takes the application; anything else — an agency
 * operator's mailbox, an account with no profile yet, a brand-new address —
 * stays identity-only. The only observable difference is which of two emails
 * arrives in a mailbox the applicant must control to read.
 *
 * A MINOR'S PROFILE IS "ANYTHING ELSE" HERE, and that is the whole of this
 * lane's minors handling.
 *
 * The account-backed submit (`src/domains/talent/routes/applications.js`) hard-
 * gates a minor profile behind `getAgencyConsentGrant`: without a guardian's
 * per-agency authorization the submission is refused GUARDIAN_AGENCY_CONSENT_
 * REQUIRED. This path has no such grant to check and no guardian in the room —
 * anyone can type a minor's address into a public form — so attaching would
 * hand that profile an agency application their guardian never approved, with a
 * consent row that records an adult's attestation. Not attaching is the only
 * answer available here that is both true and silent.
 *
 * Two constraints shape it, and neither is negotiable:
 *
 *  - **The response must not branch on account existence** (§5.3). So the minor
 *    case returns the SAME destination an unknown address returns, byte for
 *    byte: the application is identity-only, and every HTTP response, code and
 *    message is identical. A refusal here would be a live oracle for "this
 *    address belongs to a minor with a Pholio profile".
 *  - **Real minor intake is out of scope for this branch.** Design §9 Q1
 *    (minors / age policy) is explicitly owned by a separate workstream — the
 *    guardian-consent machinery assumes accounts throughout and grafting it onto
 *    an anonymous flow is that workstream's build, not this one's. This guard is
 *    the containment that keeps the anonymous path from writing into that
 *    problem before it is solved; it is not a policy, and it must be revisited
 *    by the minors workstream when it lands.
 *
 * WHAT THE APPLICANT SEES, end to end: the destination is identity-only, so
 * `alreadyHadAccount` is false and the ordinary claim receipt goes out — the one
 * that offers "Keep it — takes one tap" and never says the application was
 * attached to a Pholio profile (which would be false here). Clicking that claim
 * link reaches `claimIdentity`, which finds the existing minor-profile account
 * and refuses IDENTITY_EMAIL_IS_MINOR, and `routes/claim.js` answers with the
 * same friendly "manage this from your existing account" response it gives an
 * agency mailbox. Nothing is created, nothing is stranded, and the organizer has
 * the application either way.
 */
async function resolveDestination(db, { identity, answers }) {
  const claimed = await findClaimedProfileForEmail(
    db,
    answers.email || identity.email_normalized,
  );
  if (!claimed) {
    return identityOnlyDestination();
  }
  if (claimed.profileId && (await isMinorDestinationProfile(db, claimed))) {
    return identityOnlyDestination();
  }
  return {
    profileId: claimed.role === "TALENT" ? claimed.profileId || null : null,
    userId: claimed.userId || null,
    alreadyHadAccount: true,
    // An address that already has an account is signed into, not claimed. The
    // receipt says "sign in to see it" and carries no claim link at all —
    // including for an agency operator, for whom `claimIdentity` would refuse
    // anyway (IDENTITY_EMAIL_IS_AGENCY).
    mintClaim: false,
  };
}

/**
 * THE TRANSACTION. Draft → submitted application, in one commit.
 *
 * Coded failures: CALL_CLOSED, IDENTITY_REQUIRED, INTAKE_INCOMPLETE (carries
 * `blockers`), CONSENT_REQUIRED, CONSENT_PACKAGE_CHANGED, ALREADY_APPLIED.
 *
 * @returns {Promise<{submitted: true, applicationId: string, receiptEmailQueued: boolean}>}
 */
async function submitDraft(db, { call, draft, consent, req } = {}) {
  if (call.closed) {
    throw codedError("This call has closed", "CALL_CLOSED");
  }
  if (draft.status === SUBMISSION_STATUSES.SUBMITTED) {
    throw codedError(ALREADY_APPLIED_MESSAGE, "ALREADY_APPLIED");
  }
  if (!draft.applicant_identity_id) {
    throw codedError("An email address is required", "IDENTITY_REQUIRED");
  }

  const identity = await db("applicant_identities")
    .where({ id: draft.applicant_identity_id })
    .first();
  if (!identity) {
    throw codedError("An email address is required", "IDENTITY_REQUIRED");
  }

  const answers = parseJsonColumn(draft.answers);
  const customAnswers = parseJsonColumn(draft.custom_answers);
  const mediaRows = await loadDraftMedia(db, draft.id);

  const blockers = evaluateApplySpec(call.spec, answers, mediaRows);
  if (blockers.length) {
    throw codedError("This application is not finished", "INTAKE_INCOMPLETE", {
      blockers,
    });
  }

  if (
    !consent ||
    consent.confirmed !== true ||
    consent.accuracyConfirmed !== true ||
    consent.adultAuthorityConfirmed !== true
  ) {
    throw codedError("Consent is required to send", "CONSENT_REQUIRED");
  }

  const fingerprint = packageFingerprint({
    answers,
    customAnswers,
    mediaRows,
    specVersion: draft.intake_spec_version,
  });
  if (!fingerprintsMatch(consent.packageFingerprint, fingerprint)) {
    throw codedError(
      "Your application changed after you confirmed it",
      "CONSENT_PACKAGE_CHANGED",
    );
  }

  const destination = await resolveDestination(db, { identity, answers });

  // A friendly answer before the constraint speaks. The constraint is still
  // the authority — see the module header.
  const preExisting = await db("applications")
    .where({ open_call_link_id: call.linkId })
    .whereNot("status", "withdrawn")
    .where((builder) => {
      builder.where({ applicant_identity_id: identity.id });
      if (destination.profileId) {
        builder.orWhere({ profile_id: destination.profileId });
      }
    })
    .first("id");
  if (preExisting) {
    throw codedError(ALREADY_APPLIED_MESSAGE, "ALREADY_APPLIED");
  }

  const disclosureSnapshot = buildSubmissionDisclosureSnapshot({
    agencyName: call.agencyName,
    isMinor: false,
    accuracyConfirmed: true,
    adultAuthorityConfirmed: answers.adult_attestation === true,
    purpose: call.callPurpose,
    eventContext: call.disclosureContext || null,
  });
  const clientMeta = requestClientMeta(req);
  const applicationId = uuidv4();
  const retentionExpiresAt =
    eventRetentionExpiry(call.disclosureContext) ||
    submissionRetentionExpiry().toISOString();
  const submittedAt = new Date().toISOString();

  const payload = {
    packageSchemaVersion: 2,
    applicationId,
    agencyId: call.agencyId,
    agencyName: call.agencyName || null,
    callPurpose: call.callPurpose,
    openCallLinkId: call.linkId,
    // Top level, matching the account-backed package: the designer pick page
    // reads `payload.availability` / `payload.walkVideoUrl` straight off the
    // frozen snapshot. Both are shortlist-stage asks in the default event
    // spec, so they are normally null here until materials are fulfilled.
    availability: answers.availability_window || null,
    walkVideoUrl: answers.walk_video_url || null,
    identity: buildIdentityBlock({ identity, answers }),
    images: buildPackageImages(mediaRows, call.spec),
    answers,
    customAnswers,
  };

  try {
    await db.transaction(async (trx) => {
      const claimedDraft = await trx(SUBMISSIONS_TABLE)
        .where({ id: draft.id, status: SUBMISSION_STATUSES.DRAFT })
        .update({
          status: SUBMISSION_STATUSES.SUBMITTED,
          submitted_at: trx.fn.now(),
          // The draft TTL becomes the retention the consent copy stated.
          expires_at: retentionExpiresAt,
          updated_at: trx.fn.now(),
        });
      if (claimedDraft !== 1) {
        // Another request submitted this same draft first.
        throw codedError(ALREADY_APPLIED_MESSAGE, "ALREADY_APPLIED");
      }

      await trx("applications").insert({
        id: applicationId,
        profile_id: destination.profileId,
        applicant_identity_id: identity.id,
        agency_id: call.agencyId,
        open_call_link_id: call.linkId,
        call_purpose: call.callPurpose,
        status: "pending",
        // Anchors the organizer's review window at the send, exactly as the
        // account-backed submit does.
        status_changed_at: trx.fn.now(),
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

      await trx("talent_submission_packages").insert({
        id: uuidv4(),
        application_id: applicationId,
        applicant_identity_id: identity.id,
        user_id: destination.userId,
        profile_id: destination.profileId,
        label: `Open call application to ${call.agencyName || call.agencyId}`,
        retention_expires_at: retentionExpiresAt,
        payload: jsonForDb(db, { ...payload, submittedAt }),
        // An ISO string, not a Date: under Jest's VM realm knex's `instanceof
        // Date` check fails and it persists the literal "[object Object]" —
        // the same hazard `event-funnel.js` documents.
        created_at: submittedAt,
      });

      await recordSubmissionDisclosureConsent(trx, {
        applicationId,
        applicantIdentityId: identity.id,
        userId: destination.userId,
        profileId: destination.profileId,
        agencyId: call.agencyId,
        packageFingerprint: fingerprint,
        disclosureSnapshot,
        ipAddress: clientMeta.ipAddress,
        userAgent: clientMeta.userAgent,
        purpose: call.callPurpose,
        openCallLinkId: call.linkId,
        // The compensation sentence the applicant actually read, frozen beside
        // their consent. Restated verbatim, never paraphrased.
        compensationDisclosure: disclosureSnapshot.compensationDisclosure || null,
      });
    });
  } catch (error) {
    if (error.code === "ALREADY_APPLIED") throw error;
    if (isUniqueViolation(error)) {
      // Identity-keyed or profile-keyed, the answer is the same sentence: a
      // message that distinguished them would confirm an account exists.
      throw codedError(ALREADY_APPLIED_MESSAGE, "ALREADY_APPLIED");
    }
    throw error;
  }

  recordEventFunnelEvent({
    openCallLinkId: call.linkId,
    agencyId: call.agencyId,
    profileId: destination.profileId,
    anonId: anonIdFromRequest(req),
    eventType: FUNNEL_EVENT_TYPES.APPLICATION_COMPLETED,
  }).catch(() => {});

  const receipt = await sendReceipt(db, {
    call,
    identity,
    answers,
    destination,
    req,
  });

  return {
    submitted: true,
    applicationId,
    receiptEmailQueued: receipt.sent,
  };
}

/**
 * The receipt that is also the claim (§5.2), sent after the commit.
 *
 * Everything here is best-effort by construction: the application is already
 * with the organizer, and a bounced receipt is a lost receipt, not a lost
 * application. Nothing in this function may throw.
 */
async function sendReceipt(db, { call, identity, answers, destination, req }) {
  try {
    const claimToken = destination.mintClaim
      ? await mintClaimToken(db, {
          identityId: identity.id,
          purpose: CLAIM_TOKEN_PURPOSES.CLAIM,
        })
      : null;
    // Disown is minted in every case (§5.5): the address may not belong to the
    // person who typed it, and that is true whether or not it has an account.
    const disownToken = await mintClaimToken(db, {
      identityId: identity.id,
      purpose: CLAIM_TOKEN_PURPOSES.DISOWN,
    });

    const { firstName } = splitLegalName(answers.legal_name);
    const event = call.eventCall?.event || null;
    const result = await sendOpenCallReceiptEmailQuietly({
      to: answers.email || identity.email_normalized,
      agencyName: call.agencyName,
      eventName: event?.name || null,
      eventDatesLabel: formatEventDates(event),
      claimUrl: claimToken?.url || null,
      disownUrl: disownToken.url,
      alreadyHadAccount: destination.alreadyHadAccount,
      firstName,
    });

    if (claimToken && result.sent) {
      recordEventFunnelEvent({
        openCallLinkId: call.linkId,
        agencyId: call.agencyId,
        anonId: anonIdFromRequest(req),
        eventType: FUNNEL_EVENT_TYPES.CLAIM_SENT,
      }).catch(() => {});
    }

    return result;
  } catch (error) {
    console.error(
      "[OpenCall Submit] Receipt could not be prepared:",
      error?.code || error?.message || "unknown",
    );
    return { sent: false };
  }
}

/** "October 4–10" from the call's dates, or null. Pre-formatted for the email. */
function formatEventDates(event) {
  const startsOn = event?.startsOn || null;
  const endsOn = event?.endsOn || null;
  if (!startsOn && !endsOn) return null;

  const format = (iso) => {
    const parsed = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  };

  const start = startsOn ? format(startsOn) : null;
  const end = endsOn ? format(endsOn) : null;
  if (start && end) {
    if (start === end) return start;
    const sameMonth = startsOn.slice(0, 7) === endsOn.slice(0, 7);
    return sameMonth
      ? `${start}–${end.replace(/^\D+/, "")}`
      : `${start}–${end}`;
  }
  return start || end;
}

module.exports = {
  DRAFT_COOKIE_NAME,
  DRAFT_TTL_DAYS,
  PACKAGED_MEDIA_STATES,
  SUBMISSION_STATUSES,
  attachIdentity,
  buildIdentityBlock,
  buildPackageImages,
  clearDraftToken,
  evaluateApplySpec,
  formatEventDates,
  getOrCreateDraft,
  hashDraftToken,
  isPostgres,
  issueDraftToken,
  jsonForDb,
  loadCallContext,
  loadDraftMedia,
  // Exported for the shortlist-stage fulfilment route (`routes/materials.js`):
  // materials answers must be normalized by exactly the vocabulary rules the
  // apply stage uses, or a walk video URL accepted at fulfilment would be one
  // the apply stage would have refused.
  normalizeAnswer,
  packageFingerprint,
  parseJsonColumn,
  readDraftToken,
  submitDraft,
  updateDraftAnswers,
};
