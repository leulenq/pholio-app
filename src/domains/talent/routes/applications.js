const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole, requireActiveAccount } = require("../../auth/middleware/require-auth");
const {
  getBlockedAgencyIds,
  isAgencyBlockedForTalent,
} = require("../../../shared/lib/blocked-agencies");
const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const {
  notifyTalentApplicationSubmitted,
  markMessageNotificationsReadForApplication,
} = require("../../../shared/services/notifications");
const {
  notifyAgencyNewApplication,
  notifyAgencyApplicationWithdrawn,
  notifyAgencyEventSlotResponse,
  notifyAgencyNewMessage,
} = require("../../../shared/services/agency-notifications");
const {
  validateSubmissionPackage,
} = require("../services/validate-submission-package");
const { loadImageRightsMap } = require("../../../shared/lib/image-rights");
const { isMinorProfile, hasGuardianConsent } = require("../../../shared/lib/talent-age");
const {
  buildSubmissionProfileSnapshot,
} = require("../../../shared/lib/submission-profile");
const {
  loadSocialAccountsForProfile,
} = require("../../../shared/lib/social-accounts");
const {
  getAgencyConsentGrant,
  hasAgencyConsent,
} = require("../services/guardian-consent");
const logActivity = require("../../agency/routes/agency-log-activity");
const { v4: uuidv4 } = require("uuid");
const {
  dispatchSubmission,
} = require("../../agency/services/export-webhook-dispatch");
const {
  findInvitation,
  latestInvitationForProfile,
} = require("../../agency/services/agency-invitations");
const {
  CURRENT_SUBMISSION_PROGRAM_VERSION,
  recordSubmissionProgramAcknowledgment,
  requireSubmissionProgramAcknowledgment,
} = require("../../../shared/lib/submission-program");
const {
  SUBMISSION_PROGRAM_CONTENT,
} = require("../../../shared/lib/submission-program-content");
const {
  DRAFT_LIFECYCLE_STATES,
  DRAFT_SCHEMA_VERSION,
  draftDocumentFingerprint,
  draftMaterialFingerprint,
  draftRevisionToken,
  expiryTimestamp,
  expireInactiveDrafts,
  isEligibleAgencyImage,
  isMaterialRepairWarning,
  mapDraftRow,
  normalizeAvailabilityRange,
  normalizeClientId,
  normalizeClientUpdatedAt,
  normalizeDraftPayloadWithRepairs,
  normalizeStepId,
  normalizeWalkVideoUrl,
  parseDraftPayload,
  recordDraftEvent,
  recoveryTimestamp,
  scrubUnrecoverableDrafts,
} = require("../services/application-drafts");
const { toPresetPayload } = require("../../pdf/presets");
const {
  buildSubmissionDisclosureSnapshot,
  buildSubmissionPackageFingerprint,
  normalizeSubmissionNote,
  recordSubmissionDisclosureConsent,
  requestClientMeta,
} = require("../services/submission-disclosure-consent");
const {
  redactSubmissionPackages,
  submissionRetentionExpiry,
} = require("../../../shared/lib/submission-retention");
const {
  loadApplicationQuota,
  MONTHLY_DISCOVERY_SUBMISSION_LIMIT,
} = require("../services/application-quota");
const {
  hasOpenCallSchema,
  ensureClaimFromSession,
  listActiveClaims,
  resolveActiveClaim,
  consumeClaim,
} = require("../services/open-call-claims");
const {
  buildOpenCallDisclosure,
  eventPackageRetentionDate,
} = require("../../../shared/lib/submission-disclosure-content");
const {
  snapshotApplicationSpec,
} = require("../../spec-registry/preflight-service");
const {
  CALL_PURPOSES,
  DEFAULT_CALL_PURPOSE,
  FUNNEL_EVENT_TYPES,
} = require("../../../shared/constants/event-casting");
const {
  PAYOFF_ACTIONS,
  PAYOFF_ACTION_VALUES,
  hasPriorEventSubmission,
  recordEventFunnelEvent,
} = require("../../../shared/services/event-funnel");
const {
  CONFIRMED_APPLICATION_STATUS,
  OFFERED_APPLICATION_STATUSES,
  TALENT_DECLINED_APPLICATION_STATUS,
  TALENT_WRITABLE_APPLICATION_STATUSES,
} = require("../../../shared/constants/application-status");
const {
  eventCallDTO,
  eventDisclosureContextFromLink,
  isEventCall,
} = require("../../agency/services/open-call-brief");

async function recordAdvisorySpecSnapshot(
  trx,
  payload,
  snapshot = snapshotApplicationSpec,
) {
  try {
    // PostgreSQL marks the whole transaction failed after any SQL error. Keep
    // advisory registry work inside a savepoint so rolling it back leaves the
    // application transaction usable; SQLite uses the same nested-transaction
    // contract.
    return await trx.transaction((registryTrx) => snapshot(registryTrx, payload));
  } catch (registryError) {
    console.warn("[SpecRegistry] Submission snapshot unavailable", {
      applicationId: payload.applicationId,
      code: registryError.code || "SPEC_REGISTRY_SNAPSHOT_FAILED",
    });
    return null;
  }
}

function serializeClaim(claim) {
  return {
    agencyId: claim.agency_id,
    agencyName: claim.agency_name,
    agencyLocation: claim.agency_location,
    agencyLogo: claim.agency_logo,
    expiresAt: claim.expires_at,
    ...(claim.link_id ? { openCallLinkId: claim.link_id } : {}),
    ...(claim.call ? { call: claim.call } : {}),
  };
}

/* ── Event calls ─────────────────────────────────────────────────────────────
   An event submission is an ordinary submission that arrived through a link
   whose `call_kind` is `event_casting`. The link is carried by the open-call
   claim the arrival minted, so nothing client-supplied decides the purpose of
   a submission — the same rule that already governs the quota exemption. */

// Deploy-before-migrate guard: until `applications.call_purpose` exists every
// submission is a representation submission and the event columns are not
// written. Cached per process, like the note-flag probe above.
let applicationEventColumnsPromise = null;
function hasApplicationEventColumns(db) {
  if (!applicationEventColumnsPromise) {
    applicationEventColumnsPromise = db.schema
      .hasColumn("applications", "call_purpose")
      .catch(() => {
        applicationEventColumnsPromise = null;
        return false;
      });
  }
  return applicationEventColumnsPromise;
}

const OPEN_CALL_LINK_COLUMNS = [
  "l.id",
  "l.agency_id",
  "l.status",
  "l.call_kind",
  "l.compensation_type",
  "l.compensation_details",
  "l.event_name",
  "l.event_starts_on",
  "l.event_ends_on",
  "l.event_location",
  "l.requires_walk_video",
  "l.requires_availability",
  "l.requires_measurements",
  "l.review_window_days",
  "l.offer_response_window_hours",
];

/** The link row a claim points at, or null when the event schema is absent. */
async function loadOpenCallLink(db, linkId) {
  if (!linkId) return null;
  try {
    return (
      (await db("agency_open_call_links as l")
        .leftJoin("agencies as a", "a.id", "l.agency_id")
        .where("l.id", linkId)
        .first(...OPEN_CALL_LINK_COLUMNS, "a.name as agency_name")) || null
    );
  } catch {
    // The event columns ship in a later migration than the links table.
    return null;
  }
}

/**
 * Everything the submit path needs to know about the call behind a claim:
 * whether it is an event cast, what the organizer requires at intake, and the
 * context the event consent copy interpolates. Null for representation.
 */
function eventCallContext(link) {
  if (!link || !isEventCall(link)) return null;
  const dto = eventCallDTO(link);
  return {
    linkId: link.id,
    link,
    call: dto,
    intake: {
      requiresWalkVideo: Boolean(link.requires_walk_video),
      requiresAvailability: Boolean(link.requires_availability),
      requiresMeasurements: Boolean(link.requires_measurements),
    },
    disclosureContext: eventDisclosureContextFromLink(link, link.agency_name),
  };
}

/**
 * Decorate claims with the call they came from, so the apply flow knows before
 * the first keystroke whether it is composing a representation submission or an
 * event application (and, for an event, what the organizer requires).
 *
 * `listActiveClaims` deliberately projects only agency identity — this joins
 * the link here rather than widening a query the whole open-call surface uses.
 */
async function attachCallContext(db, claims) {
  if (!claims.length) return claims;
  let rows = [];
  try {
    rows = await db("agency_open_call_claims as c")
      .join("agency_open_call_links as l", "l.id", "c.link_id")
      .leftJoin("agencies as a", "a.id", "l.agency_id")
      .whereIn(
        "c.id",
        claims.map((claim) => claim.id),
      )
      .select("c.id as claim_id", ...OPEN_CALL_LINK_COLUMNS, "a.name as agency_name");
  } catch {
    // Pre-migration schema: claims stay exactly as they were.
    return claims;
  }
  const byClaimId = new Map(rows.map((row) => [row.claim_id, row]));
  return claims.map((claim) => {
    const link = byClaimId.get(claim.id);
    if (!link) return claim;
    return { ...claim, link_id: link.id, call: eventCallDTO(link) };
  });
}

/**
 * The live claim for (profile, agency) outside a transaction, for preflight.
 *
 * Since `20260819100000` an organizer can hold more than one live claim for one
 * profile — one per edition — and this claim decides the purpose of the
 * submission being composed. The most recently refreshed one wins: a claim is
 * refreshed on arrival, so it is the call the applicant just walked in through.
 */
async function previewClaimForAgency(db, profileId, agencyId) {
  try {
    return (
      (await db("agency_open_call_claims")
        .where({ profile_id: profileId, agency_id: agencyId, status: "active" })
        .orderBy("updated_at", "desc")
        .first()) || null
    );
  } catch {
    return null;
  }
}

/**
 * Funnel step 4 (design §g): why an event submission that was started never
 * completed. `reason` is the stable blocker code the validate path emits
 * (`event_walk_video_required` and friends) — codes and counts only, never the
 * applicant-facing message, which is prose about a person.
 */
async function recordIntakeBlocked(eventCall, profileId, reason, blockerCount) {
  if (!eventCall || !reason) return;
  try {
    await recordEventFunnelEvent({
      openCallLinkId: eventCall.linkId,
      agencyId: eventCall.link?.agency_id || null,
      profileId,
      eventType: FUNNEL_EVENT_TYPES.INTAKE_BLOCKED,
      metadata: { reason, blockerCount },
    });
  } catch (error) {
    console.debug("[EventFunnel] intake_blocked failed:", error?.message);
  }
}

/**
 * Funnel steps 3, 5 and 7 (design §g), written once the submission is durable.
 *
 * Deliberately after the transaction commits and outside it: a rolled-back
 * submission is not a completion, and an analytics insert has no business
 * holding a lock on the row the organizer is about to read. Everything here is
 * swallowed — `recordEventFunnelEvent` never throws, and the try/catch covers
 * the case where the writer itself has been stubbed out or torn down.
 */
async function recordSubmitFunnelEvents({
  eventCall,
  profileId,
  strengthScore,
  digitalSlotCount,
  compCardPresent,
}) {
  if (!eventCall) return;
  const base = {
    openCallLinkId: eventCall.linkId,
    agencyId: eventCall.link?.agency_id || null,
    profileId,
  };
  try {
    // Asked before the completion below is written, or every submission would
    // find itself and every applicant would look like a returning one.
    const isSecondRecipient = await hasPriorEventSubmission({
      profileId,
      excludeOpenCallLinkId: eventCall.linkId,
    });

    await recordEventFunnelEvent({
      ...base,
      eventType: FUNNEL_EVENT_TYPES.APPLICATION_COMPLETED,
    });
    await recordEventFunnelEvent({
      ...base,
      eventType: FUNNEL_EVENT_TYPES.PROFILE_COMPLETED_AT_SUBMIT,
      metadata: {
        // Already computed by the package validation a few lines up — this
        // costs nothing beyond reading the number.
        ...(Number.isFinite(strengthScore) ? { completeness: strengthScore } : {}),
        digitalSlots: digitalSlotCount,
        compCardPresent,
      },
    });
    if (isSecondRecipient) {
      await recordEventFunnelEvent({
        ...base,
        eventType: FUNNEL_EVENT_TYPES.SECOND_RECIPIENT_SUBMITTED,
      });
    }
  } catch (error) {
    console.debug("[EventFunnel] Submit instrumentation failed:", error?.message);
  }
}

/** Ruling R4 as a timestamp: `event_ends_on + 90 days`, or null when undated. */
function eventPackageRetentionExpiry(eventCall) {
  const endsOn = eventCall?.disclosureContext?.eventEndsOn;
  const retentionDate = eventPackageRetentionDate(endsOn);
  return retentionDate ? new Date(`${retentionDate}T00:00:00.000Z`).toISOString() : null;
}

/**
 * Availability and the walk video are the two fields an event call adds to the
 * package. They are normalized here — never trusted as sent — because the
 * consent fingerprint hashes them and the organizer's dossier renders them.
 */
function normalizeEventSubmissionFields(submissionPackage) {
  return {
    availability: normalizeAvailabilityRange(submissionPackage?.availability),
    walkVideoUrl: normalizeWalkVideoUrl(submissionPackage?.walkVideoUrl) || null,
    measurementsConfirmed: submissionPackage?.measurementsConfirmed === true,
  };
}

// Statuses a talent may withdraw from (still in process). Terminal states stay put.
const WITHDRAWABLE_STATUSES = new Set([
  "pending",
  "submitted",
  "reviewing",
  "shortlisted",
  "requested_more",
  "meeting_requested",
  "kept_on_file",
  "development",
  "accepted",
]);

async function getProfileBySessionUserId(userId) {
  return knex("profiles").where({ user_id: userId }).first();
}

// Deploy-before-migrate guard: until the note flag exists, the note falls back
// to the legacy "earliest TALENT message" derivation. Checked once per process.
let submissionNoteFlagPromise = null;
function hasSubmissionNoteFlag(db) {
  if (!submissionNoteFlagPromise) {
    submissionNoteFlagPromise = db.schema
      .hasColumn("messages", "is_submission_note")
      .catch(() => {
        submissionNoteFlagPromise = null;
        return false;
      });
  }
  return submissionNoteFlagPromise;
}

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

function submissionRequestHash(body) {
  return crypto
    .createHash("sha256")
    .update(canonicalJson(body || {}))
    .digest("hex");
}

function parseNonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
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

function snapshotSubmissionImage(image) {
  return {
    id: image.id,
    path: image.path || null,
    public_url: image.public_url || null,
    alt: image.alt || image.alt_text || null,
    image_type: image.image_type || null,
    shot_type: image.shot_type || null,
    sort: image.sort ?? null,
    is_primary: Boolean(image.is_primary),
  };
}

function boardNameKey(value) {
  return String(value || "").trim().toLocaleLowerCase("en-US");
}

async function resolveRelationalSubmissionBoards(
  trx,
  agencyId,
  selectedBoardNames,
) {
  if (!selectedBoardNames.length) return [];

  const existingBoards = await trx("boards")
    .where({ agency_id: agencyId, is_active: true })
    .select("id", "name")
    .orderBy("created_at", "asc")
    .orderBy("id", "asc");
  const boardsByName = new Map();
  for (const board of existingBoards) {
    const key = boardNameKey(board.name);
    if (key && !boardsByName.has(key)) {
      boardsByName.set(key, board);
    }
  }

  const resolvedBoards = [];
  const resolvedKeys = new Set();
  for (const boardName of selectedBoardNames) {
    const key = boardNameKey(boardName);
    if (!key || resolvedKeys.has(key)) continue;

    let board = boardsByName.get(key);
    if (!board) {
      board = { id: uuidv4(), name: boardName.trim() };
      await trx("boards").insert({
        id: board.id,
        agency_id: agencyId,
        name: board.name,
        is_active: true,
        sort_order: 0,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
      boardsByName.set(key, board);
    }

    resolvedKeys.add(key);
    resolvedBoards.push(board);
  }

  return resolvedBoards;
}

/**
 * GET /api/talent/applications/submission-program-status
 * Whether the talent must acknowledge the submission program notice.
 */
router.get(
  "/submission-program-status",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const user = await knex("users").where({ id: req.session.userId }).first();
    const acknowledged = requireSubmissionProgramAcknowledgment(user, {
      throwOnMissing: false,
    });

    return res.json({
      success: true,
      data: {
        needsAcknowledgment: !acknowledged,
        currentVersion: CURRENT_SUBMISSION_PROGRAM_VERSION,
        content: SUBMISSION_PROGRAM_CONTENT,
      },
    });
  }),
);

/**
 * POST /api/talent/applications/submission-program-acknowledgment
 * Record one-time (per version) acknowledgment of the submission program notice.
 */
router.post(
  "/submission-program-acknowledgment",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    if (req.body?.acknowledged !== true) {
      return res.status(400).json({
        success: false,
        error: "Validation error",
        message: "acknowledged: true is required.",
      });
    }

    await recordSubmissionProgramAcknowledgment(knex, req.session.userId);

    return res.json({
      success: true,
      data: {
        acknowledged: true,
        version: CURRENT_SUBMISSION_PROGRAM_VERSION,
      },
    });
  }),
);

/**
 * GET /api/talent/applications
 * List all applications for the current talent
 */
router.get(
  "/",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    const openCallReady = await hasOpenCallSchema(knex);

    // The submitted note lives in the messages table so it opens the agency's
    // thread, but only the row flagged at submission time is the note. Deriving
    // it from "earliest TALENT message" promoted ordinary chat into "Your note"
    // whenever a submission carried no note.
    const noteQuery = knex("messages as note_msg")
      .select("note_msg.message")
      .whereRaw("note_msg.application_id = applications.id")
      .where("note_msg.sender_type", "TALENT")
      .orderBy("note_msg.created_at", "asc")
      .limit(1);
    if (await hasSubmissionNoteFlag(knex)) {
      noteQuery.where("note_msg.is_submission_note", true);
    }

    const eventColumnsReady = await hasApplicationEventColumns(knex);

    // Fetch applications with organization-backed agency info
    const applications = await knex("applications")
      .leftJoin("agencies", "applications.agency_id", "agencies.id")
      .leftJoin("agency_memberships as am", function () {
        this.on("am.agency_id", "=", "agencies.id")
          .andOn("am.membership_role", "=", knex.raw("?", ["OWNER"]))
          .andOn("am.status", "=", knex.raw("?", ["ACTIVE"]));
      })
      .leftJoin("users", "am.user_id", "users.id")
      .modify((query) => {
        // The call is what a talent-facing event row is actually about — the
        // event name, its dates, and how long an offer stays open.
        if (eventColumnsReady) {
          query.leftJoin(
            "agency_open_call_links as call_link",
            "call_link.id",
            "applications.open_call_link_id",
          );
        }
      })
      .where({ profile_id: profile.id })
      .select(
        "applications.id",
        "applications.agency_id",
        "applications.status",
        "applications.created_at",
        "applications.updated_at",
        "agencies.name as agency_name",
        "agencies.location as agency_location",
        "agencies.website as agency_website",
        "agencies.logo_path as agency_logo",
        "agencies.open_boards as agency_open_boards",
        noteQuery.as("note"),
        ...(eventColumnsReady
          ? [
              "applications.call_purpose",
              "applications.open_call_link_id",
              "applications.status_changed_at",
              "call_link.event_name",
              "call_link.event_starts_on",
              "call_link.event_ends_on",
              "call_link.event_location",
              "call_link.offer_response_window_hours",
            ]
          : []),
        ...(openCallReady
          ? [
              // Provenance: the latest completed quota event tells whether this
              // submission was an invited open call or platform discovery.
              knex("application_submission_requests as sr")
                .select("sr.quota_exempt")
                .whereRaw("sr.application_id = applications.id")
                .where("sr.status", "completed")
                .orderBy("sr.completed_at", "desc")
                .limit(1)
                .as("open_call_exempt"),
            ]
          : []),
      )
      .orderBy("applications.created_at", "desc");

    const data = applications.map((application) => {
      const {
        open_call_exempt: openCallExempt,
        event_name: eventName,
        event_starts_on: eventStartsOn,
        event_ends_on: eventEndsOn,
        event_location: eventLocation,
        offer_response_window_hours: offerResponseWindowHours,
        ...rest
      } = application;
      const isEvent = rest.call_purpose === CALL_PURPOSES.EVENT_CASTING;
      return {
        ...rest,
        source: openCallExempt ? "open_call" : "discovery",
        // Only event rows carry an event block, so a representation row is
        // shaped exactly as it always was.
        ...(isEvent
          ? {
              event: {
                name: eventName || null,
                startsOn: eventStartsOn || null,
                endsOn: eventEndsOn || null,
                location: eventLocation || null,
                offerResponseWindowHours: offerResponseWindowHours ?? null,
              },
            }
          : {}),
      };
    });

    res.json({ success: true, data });
  }),
);

router.get(
  "/quota",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
      });
    }
    const openCallReady = await hasOpenCallSchema(knex);
    if (openCallReady) {
      // Convert any pending open-call arrival carried through signup into a
      // durable claim now that a talent profile exists.
      await ensureClaimFromSession(knex, req, profile.id);
    }
    const quota = await loadApplicationQuota(knex, profile);
    const activeClaims = openCallReady
      ? await listActiveClaims(knex, profile.id)
      : [];
    return res.json({
      success: true,
      data: {
        ...quota,
        activeClaims: (await attachCallContext(knex, activeClaims)).map(
          serializeClaim,
        ),
      },
    });
  }),
);

/**
 * GET /api/talent/applications/prompt-context
 * Determine if talent should see a targeted agency apply prompt
 */
router.get(
  "/prompt-context",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    // Live open-call claims are the primary invite signal: target the first
    // invited agency the talent hasn't already applied to.
    if (await hasOpenCallSchema(knex)) {
      await ensureClaimFromSession(knex, req, profile.id);
      const claims = await listActiveClaims(knex, profile.id);
      for (const claim of claims) {
        const existing = await knex("applications")
          .where({ profile_id: profile.id, agency_id: claim.agency_id })
          .whereNot("status", "withdrawn")
          .first("id");
        if (!existing) {
          return res.json({
            success: true,
            data: {
              hasRedirectSignal: true,
              source: "open_call",
              targetAgency: {
                id: claim.agency_id,
                name: claim.agency_name,
                location: claim.agency_location,
                logo: claim.agency_logo,
                website: null,
              },
              claimExpiresAt: claim.expires_at,
              alreadyAppliedToTarget: false,
            },
          });
        }
      }
    }

    // The most recent standing invitation, from `agency_invitations`.
    //
    // This used to read `applications` rows carrying `invited_by_agency_id`,
    // which the invite endpoints wrote on the talent's behalf. That made
    // `alreadyAppliedToTarget` below self-fulfilling: the invitation *was* the
    // application row it then found, so an invited talent was told they had
    // already applied to an agency they had never applied to. Since
    // `20260820100000_create_agency_invitations.js` the two are separate
    // records, and the question "have I applied here?" has an honest answer.
    const latestRedirectSignal = await latestInvitationForProfile(
      knex,
      profile.id,
    );

    const targetAgencyId = latestRedirectSignal?.invited_by_agency_id || null;
    let alreadyAppliedToTarget = false;

    if (targetAgencyId) {
      const existing = await knex("applications")
        .where({ profile_id: profile.id, agency_id: targetAgencyId })
        .whereNot("status", "withdrawn")
        .first("id");
      alreadyAppliedToTarget = !!existing;
    }

    return res.json({
      success: true,
      data: {
        hasRedirectSignal: !!latestRedirectSignal,
        source: latestRedirectSignal ? "agency_invitation" : null,
        targetAgency: latestRedirectSignal
          ? {
              id: latestRedirectSignal.agency_id,
              name: latestRedirectSignal.agency_name,
              location: latestRedirectSignal.agency_location,
              logo: latestRedirectSignal.agency_logo,
              website: latestRedirectSignal.agency_website,
            }
          : null,
        alreadyAppliedToTarget,
      },
    });
  }),
);

/**
 * POST /api/talent/applications
 * Create a new application (direct apply)
 */
router.post(
  "/",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const {
      agencyId,
      note,
      submissionPackage,
      draftVersion,
      draftGeneration,
    } = req.body;
    if (!agencyId) {
      return res.status(400).json({
        success: false,
        error: "Agency ID required",
        message: "Agency ID required",
      });
    }
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    const user = await knex("users").where({ id: req.session.userId }).first();
    // Contact email is owned by users, while the rest of submission readiness
    // lives on profiles. Validate the same combined shape the client receives.
    const submissionProfile = {
      ...profile,
      email: profile.email || user?.email || null,
    };
    const minorSubmission = isMinorProfile(submissionProfile);
    // Minors never get social links in a submission snapshot (data
    // minimization) — skip the query entirely rather than load-then-discard.
    const submissionSocial = minorSubmission
      ? []
      : await loadSocialAccountsForProfile(profile.id);
    if (
      minorSubmission &&
      !hasGuardianConsent(submissionProfile)
    ) {
      return res.status(403).json({
        success: false,
        error: "minor_guardian_consent_required",
        message:
          "A parent or guardian must verify consent before a minor can submit to an agency.",
      });
    }
    const agencyConsentGranted =
      !minorSubmission ||
      (await hasAgencyConsent(knex, profile.id, agencyId));
    if (
      !requireSubmissionProgramAcknowledgment(user, { throwOnMissing: false })
    ) {
      return res.status(403).json({
        success: false,
        error: "SUBMISSION_PROGRAM_ACKNOWLEDGMENT_REQUIRED",
        message:
          "Please acknowledge how agency submissions work on Pholio before submitting.",
      });
    }
    const submittedSchemaVersion = submissionPackage?.schemaVersion;
    if (
      !Number.isInteger(submittedSchemaVersion) ||
      submittedSchemaVersion <= 0
    ) {
      return res.status(400).json({
        success: false,
        error: "invalid_draft_schema",
        message:
          "submissionPackage.schemaVersion must be a positive integer.",
        supportedSchemaVersion: DRAFT_SCHEMA_VERSION,
      });
    }
    if (submittedSchemaVersion > DRAFT_SCHEMA_VERSION) {
      return res.status(422).json({
        success: false,
        error: "unsupported_draft_schema",
        message: "This draft was created by a newer version of Pholio.",
        supportedSchemaVersion: DRAFT_SCHEMA_VERSION,
      });
    }

    const idempotencyKey = String(
      req.get("Idempotency-Key") || req.body?.idempotencyKey || "",
    ).trim();
    if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(idempotencyKey)) {
      return res.status(400).json({
        success: false,
        error: "invalid_idempotency_key",
        message:
          "A valid Idempotency-Key header or idempotencyKey value is required.",
      });
    }
    const expectedDraftVersion = parseNonNegativeInteger(draftVersion);
    const expectedDraftGeneration = parseNonNegativeInteger(draftGeneration);
    if (expectedDraftVersion === null || expectedDraftGeneration === null) {
      return res.status(428).json({
        success: false,
        error: "draft_precondition_required",
        message: "draftVersion and draftGeneration are required.",
      });
    }
    const requestHash = submissionRequestHash(req.body);
    const priorRequest = await knex("application_submission_requests")
      .where({ profile_id: profile.id, idempotency_key: idempotencyKey })
      .first();
    if (priorRequest) {
      if (priorRequest.request_hash !== requestHash) {
        return res.status(409).json({
          success: false,
          error: "idempotency_conflict",
          message: "This idempotency key was already used for another submission.",
        });
      }
      if (priorRequest.status === "completed" && priorRequest.application_id) {
        return res.json({
          success: true,
          id: priorRequest.application_id,
          idempotent: true,
        });
      }
      return res.status(409).json({
        success: false,
        error: "submission_in_progress",
        message: "This application submission is already being processed.",
      });
    }

    if (submissionPackage?.consentConfirmed !== true) {
      return res.status(400).json({
        success: false,
        error: "submission_consent_required",
        message: "Confirm the application package before submitting.",
      });
    }
    if (
      !minorSubmission &&
      submissionPackage?.accuracyConfirmed !== true
    ) {
      return res.status(400).json({
        success: false,
        error: "submission_accuracy_attestation_required",
        message:
          "Confirm that your statistics are current and your agency digitals are unretouched.",
      });
    }
    if (
      !minorSubmission &&
      submissionPackage?.adultAuthorityConfirmed !== true
    ) {
      return res.status(400).json({
        success: false,
        error: "submission_adult_authority_required",
        message:
          "Confirm that you are 18 or older and authorised to submit your own work.",
      });
    }

    await expireInactiveDrafts(knex);
    await scrubUnrecoverableDrafts(knex);

    if (await isAgencyBlockedForTalent(knex, req.session.userId, agencyId)) {
      return res.status(403).json({
        success: false,
        error: "Agency blocked",
        message: "You have blocked this agency.",
      });
    }

    // Convert any pending open-call arrival into a durable claim before
    // anything reads one. The claim carries the link, and the link decides
    // whether this is an event cast — so it has to exist by the time the
    // purpose is resolved, not merely by the time the quota is checked.
    const openCallReady = await hasOpenCallSchema(knex);
    if (openCallReady) {
      await ensureClaimFromSession(knex, req, profile.id);
    }

    // 1. Resolve the call this submission came through. The claim minted on
    //    arrival carries the link; the link decides the purpose. A client
    //    cannot declare its own submission an event cast.
    const eventColumnsReady = await hasApplicationEventColumns(knex);
    const previewClaim = eventColumnsReady
      ? await previewClaimForAgency(knex, profile.id, agencyId)
      : null;
    const eventCall = eventColumnsReady
      ? eventCallContext(await loadOpenCallLink(knex, previewClaim?.link_id))
      : null;
    const callPurpose = eventCall
      ? CALL_PURPOSES.EVENT_CASTING
      : DEFAULT_CALL_PURPOSE;

    /*
     * Event calls are 18+ (ruling R8), and until now only the back of the
     * pipeline knew it. `pick-share.js` runs `applyMinorSubmissionFilter` with
     * `force: true` precisely because "a designer can never hold the guardian
     * authorization that would make an exception valid" — so a minor who
     * submitted here was accepted, stored, and then silently excluded from
     * every designer pick list. They would wait out an event they were never
     * going to be shown for, with nothing anywhere telling them why. Silence
     * like that is the thing this product exists to remove, not produce.
     *
     * The anonymous intake path has always enforced this (`open-call-intake.js`
     * requires an adult attestation at the apply stage for event kinds). The
     * logged-in path — the only one anybody actually reaches, since
     * `identity_policy` never leaves `account_required` — did not.
     *
     * Refused rather than filtered: an event application from a minor cannot
     * succeed, so accepting it would only be a politer way of losing it. 403
     * with a reason the talent can read.
     */
    if (eventCall && minorSubmission) {
      return res.status(403).json({
        success: false,
        error: "event_call_adults_only",
        message:
          "Event casting calls are open to applicants aged 18 and over. This does not affect applying to agencies for representation.",
      });
    }
    const eventFields = normalizeEventSubmissionFields(submissionPackage);

    // 2. Check if already applied. A previously withdrawn application can be
    //    resubmitted (we revive that row below to preserve its history).
    //
    //    Scope follows the uniqueness rule the schema enforces (design A3): one
    //    live representation application per agency, but one event application
    //    per *call*, so a model who walked the Brooklyn edition can still apply
    //    to Queens under the same organizer.
    let existingQuery = knex("applications").where({ profile_id: profile.id });
    if (eventCall) {
      existingQuery = existingQuery.where({
        open_call_link_id: eventCall.linkId,
        call_purpose: CALL_PURPOSES.EVENT_CASTING,
      });
    } else {
      existingQuery = existingQuery.where({ agency_id: agencyId });
      if (eventColumnsReady) {
        existingQuery = existingQuery.where({
          call_purpose: DEFAULT_CALL_PURPOSE,
        });
      }
    }
    const existing = await existingQuery.first();
    if (existing && existing.status !== "withdrawn") {
      return res.status(409).json({
        success: false,
        error: "application_already_submitted",
        message: eventCall
          ? "You've already applied to this casting."
          : "You've already applied to this agency.",
      });
    }
    const reapplying = !!existing;

    const profileImages = (await knex("images")
      .where({ profile_id: profile.id })
      .orderBy("sort", "asc"))
      .filter(isEligibleAgencyImage);
    let packageImages = profileImages;
    const submittedImageIds = submissionPackage?.imageIds;
    if (Array.isArray(submittedImageIds) && submittedImageIds.length > 0) {
      const idSet = new Set(submittedImageIds);
      packageImages = profileImages.filter((img) => idSet.has(img.id));
    }
    const rightsMap = await loadImageRightsMap(
      knex,
      packageImages.map((img) => img.id),
    );
    const packageValidation = validateSubmissionPackage(submissionProfile, packageImages, {
      rightsMap,
      agencyConsentGranted,
      eventIntake: eventCall?.intake || null,
      eventSubmission: eventFields,
    });
    if (!packageValidation.ok) {
      await recordIntakeBlocked(
        eventCall,
        profile.id,
        packageValidation.errors[0]?.code,
        packageValidation.errors.length,
      );
      return res.status(400).json({
        success: false,
        error: "submission_package_incomplete",
        message:
          packageValidation.errors[0]?.message ||
          "Your submission package is not ready to send.",
        errors: packageValidation.errors,
      });
    }

    // Fast preflight for UX. The authoritative quota + claim check is
    // repeated while holding the profile lock inside the final submission
    // transaction — nothing here grants anything.
    //
    // Event submissions need no separate exemption: they only exist when a
    // claim exists, and a claim is exactly what lifts the discovery ceiling
    // here and in the transaction below. There is no monthly allowance to
    // spend on a casting, which is why the event consent copy never mentions
    // one (`buildOpenCallDisclosure` branches on purpose).
    //
    // The discovery limit applies to every account identically — it is an
    // anti-spam ceiling, not a commercial lever, so there is nothing to
    // upgrade to and the response never says otherwise.
    const preflightQuota = await loadApplicationQuota(knex, profile);
    if (preflightQuota.remaining === 0) {
      const preflightClaim = openCallReady
        ? await knex("agency_open_call_claims")
            .where({
              profile_id: profile.id,
              agency_id: agencyId,
              status: "active",
            })
            .first()
        : null;
      if (!preflightClaim) {
        const activeClaims = openCallReady
          ? await listActiveClaims(knex, profile.id)
          : [];
        return res.status(403).json({
          success: false,
          error: "monthly_discovery_limit_reached",
          message:
            "You have used this month's discovery submissions. Submitting through an agency's own open call link is always unlimited.",
          limit: preflightQuota.limit,
          current: preflightQuota.used,
          activeClaims: activeClaims.map(serializeClaim),
        });
      }
    }

    const agency = await knex("agencies")
      .where({ id: agencyId })
      .select("id", "name", "open_boards", "status")
      .first();
    if (!agency) {
      return res.status(404).json({
        success: false,
        error: "Agency not found",
        message: "Agency not found",
      });
    }
    if (String(agency.status || "").toUpperCase() !== "ACTIVE") {
      return res.status(409).json({
        success: false,
        error: "agency_unavailable",
        message: "This agency is not currently accepting applications.",
      });
    }
    let normalizedSubmissionResult;
    try {
      normalizedSubmissionResult = await normalizeDraftPayloadWithRepairs(knex, {
        profileId: profile.id,
        agency,
        payload: {
          schemaVersion: submissionPackage?.schemaVersion,
          boards: submissionPackage?.boards,
          mediaSetId: submissionPackage?.mediaSetId,
          digitalSlotPicks: submissionPackage?.digitalSlotPicks,
          compCardPresetId: submissionPackage?.compCardPresetId,
          externalCompCardId: submissionPackage?.externalCompCardId,
          specRegistryRevisionId:
            submissionPackage?.specRegistryRevisionId,
          note,
          openCallLinkId: eventCall?.linkId || null,
          availability: eventFields.availability,
          walkVideoUrl: eventFields.walkVideoUrl,
          measurementsConfirmed: eventFields.measurementsConfirmed,
        },
      });
    } catch (error) {
      if (error.code === "UNSUPPORTED_DRAFT_SCHEMA") {
        return res.status(422).json({
          success: false,
          error: "unsupported_draft_schema",
          message: "This draft was created by a newer version of Pholio.",
          supportedSchemaVersion: DRAFT_SCHEMA_VERSION,
        });
      }
      throw error;
    }
    const normalizedSubmissionReferences = normalizedSubmissionResult.payload;
    // A schema upgrade is not a changed selection — see isMaterialRepairWarning.
    // Blocking on it would make a draft-schema bump invalidate every submission
    // already in flight, which is precisely the failure the conditional
    // fingerprint spread exists to avoid.
    const materialRepairWarnings =
      normalizedSubmissionResult.repairWarnings.filter(isMaterialRepairWarning);
    if (materialRepairWarnings.length > 0) {
      return res.status(409).json({
        success: false,
        error: "submission_references_changed",
        message:
          "Some saved selections are no longer available. Review the repaired draft before submitting.",
        repairWarnings: materialRepairWarnings,
      });
    }
    if (normalizedSubmissionReferences.mediaSetId !== "current") {
      packageImages = packageImages.filter(
        (image) =>
          String(image.image_type || "").toLowerCase() === "digital" ||
          image.set_id === normalizedSubmissionReferences.mediaSetId,
      );
    }
    const packageImageIdSet = new Set(packageImages.map((image) => image.id));
    for (const [slot, imageId] of Object.entries(
      normalizedSubmissionReferences.digitalSlotPicks,
    )) {
      if (!packageImageIdSet.has(imageId)) {
        delete normalizedSubmissionReferences.digitalSlotPicks[slot];
      }
    }
    const canonicalRightsMap = await loadImageRightsMap(
      knex,
      packageImages.map((image) => image.id),
    );
    const canonicalPackageValidation = validateSubmissionPackage(
      submissionProfile,
      packageImages,
      {
        rightsMap: canonicalRightsMap,
        agencyConsentGranted,
        eventIntake: eventCall?.intake || null,
        eventSubmission: {
          availability: normalizedSubmissionReferences.availability,
          walkVideoUrl: normalizedSubmissionReferences.walkVideoUrl,
          measurementsConfirmed:
            normalizedSubmissionReferences.measurementsConfirmed,
        },
      },
    );
    if (!canonicalPackageValidation.ok) {
      await recordIntakeBlocked(
        eventCall,
        profile.id,
        canonicalPackageValidation.errors[0]?.code,
        canonicalPackageValidation.errors.length,
      );
      return res.status(400).json({
        success: false,
        error: "submission_package_incomplete",
        message:
          canonicalPackageValidation.errors[0]?.message ||
          "Your submission package is not ready to send.",
        errors: canonicalPackageValidation.errors,
      });
    }
    const registryImageIds = [
      ...new Set(
        Object.values(normalizedSubmissionReferences.digitalSlotPicks || {})
          .filter((imageId) => packageImageIdSet.has(imageId)),
      ),
    ];
    if (registryImageIds.length === 0) {
      registryImageIds.push(
        ...packageImages
          .filter(
            (image) =>
              String(image.image_type || "").toLowerCase() === "digital",
          )
          .map((image) => image.id),
      );
    }

    // 3. Create (or revive a withdrawn) application, snapshot the exact
    // submission, write its first message, and retire the draft atomically.
    let applicationId;
    const applicationNote = minorSubmission
      ? ""
      : normalizeSubmissionNote(normalizedSubmissionReferences.note);
    const noteFlagReady = await hasSubmissionNoteFlag(knex);
    const packageFingerprint = buildSubmissionPackageFingerprint({
      agencyId,
      boards: normalizedSubmissionReferences.boards,
      mediaSetId: normalizedSubmissionReferences.mediaSetId,
      digitalSlotPicks: normalizedSubmissionReferences.digitalSlotPicks,
      compCardPresetId:
        normalizedSubmissionReferences.compCardPreset?.id ||
        submissionPackage?.compCardPresetId ||
        null,
      imageIds: packageImages.map((image) => image.id),
      note: applicationNote,
      // Conditional by construction: null on a representation submission, so
      // the hash is byte-identical to the pre-event-casting one.
      openCallLinkId: eventCall?.linkId || null,
      availability: normalizedSubmissionReferences.availability,
      walkVideoUrl: normalizedSubmissionReferences.walkVideoUrl,
    });
    if (
      !minorSubmission &&
      !fingerprintsMatch(
        submissionPackage?.consentPackageFingerprint,
        packageFingerprint,
      )
    ) {
      await recordIntakeBlocked(eventCall, profile.id, "consent_package_changed", 1);
      return res.status(409).json({
        success: false,
        error: "consent_package_changed",
        message:
          "Your submission package changed after you confirmed it. Review the current package and consent again.",
        errors: [
          {
            code: "consent_package_changed",
            key: "submission_consent",
            message:
              "Review the current package and confirm consent again before submitting.",
          },
        ],
      });
    }
    const disclosureSnapshot = buildSubmissionDisclosureSnapshot({
      agencyName: agency.name,
      isMinor: minorSubmission,
      minorAgencyAuthorized: agencyConsentGranted,
      accountGuardianConsent: hasGuardianConsent(submissionProfile),
      accuracyConfirmed:
        minorSubmission || submissionPackage?.accuracyConfirmed === true,
      adultAuthorityConfirmed:
        !minorSubmission &&
        submissionPackage?.adultAuthorityConfirmed === true,
      // Defaults to representation, which keeps the existing snapshot
      // byte-identical for every non-event submission.
      purpose: callPurpose,
      eventContext: eventCall?.disclosureContext || null,
    });
    const clientMeta = requestClientMeta(req);
    const hasSubmissionPackagesTable = await knex.schema.hasTable(
      "talent_submission_packages",
    );
    try {
      await knex.transaction(async (trx) => {
        // Row-locked only to serialize concurrent submissions. The quota does
        // not read the subscription tier — no tier lifts it.
        let quotaProfileQuery = trx("profiles")
          .where({ id: profile.id })
          .select("id");
        if (trx.client.config.client === "pg") {
          quotaProfileQuery = quotaProfileQuery.forUpdate();
        }
        const quotaProfile = await quotaProfileQuery.first();
        const quota = await loadApplicationQuota(
          trx,
          quotaProfile || profile,
        );
        // Authoritative open-call resolution: an active claim for this exact
        // call exempts this submission from the monthly discovery quota, with
        // no ceiling on how many such claims a talent may redeem. The claim is
        // consumed below in this same transaction. Nothing client-supplied
        // participates — the link comes from `eventCall`, which was itself
        // resolved from the claim minted on arrival.
        //
        // An event cast resolves by link, not by agency: one organizer can hold
        // a live claim for Brooklyn and another for Queens at the same time
        // (design §1 C4), and the agency-keyed lookup would spend whichever row
        // came back first.
        let openCallClaim = null;
        if (openCallReady) {
          openCallClaim = await resolveActiveClaim(trx, profile.id, agencyId, {
            callPurpose,
            linkId: eventCall?.linkId || null,
          });
        }
        // The claim was re-attributed to a different link between preflight and
        // now (the talent re-arrived through another of the organizer's calls).
        // The consent the applicant gave names one event; it cannot be spent on
        // another, so this fails like any other package change.
        if (
          eventCall &&
          openCallClaim &&
          openCallClaim.link_id !== eventCall.linkId
        ) {
          const error = new Error("Open call link changed during submission");
          error.code = "OPEN_CALL_CLAIM_CONFLICT";
          throw error;
        }
        const quotaExempt = Boolean(openCallClaim);
        if (!quotaExempt && quota.remaining === 0) {
          const error = new Error("Monthly application limit reached");
          error.code = "MONTHLY_APPLICATION_LIMIT";
          error.quota = quota;
          throw error;
        }

        let guardianConsentRequestId = null;
        let guardianConsentGrantId = null;
        let guardianConsentExpiresAt = null;
        let agencyGuardQuery = trx("agencies")
          .where({ id: agencyId })
          .select("id", "status");
        if (trx.client.config.client === "pg") {
          agencyGuardQuery = agencyGuardQuery.forUpdate();
        }
        const agencyGuard = await agencyGuardQuery.first();
        if (
          !agencyGuard ||
          String(agencyGuard.status || "").toUpperCase() !== "ACTIVE"
        ) {
          const error = new Error("Agency unavailable");
          error.code = "AGENCY_UNAVAILABLE";
          throw error;
        }
        if (minorSubmission) {
          const guardianGrant = await getAgencyConsentGrant(
            trx,
            profile.id,
            agencyId,
          );
          if (!guardianGrant) {
            const error = new Error("Guardian agency consent required");
            error.code = "GUARDIAN_AGENCY_CONSENT_REQUIRED";
            throw error;
          }
          guardianConsentRequestId = guardianGrant.consent_request_id;
          guardianConsentGrantId = guardianGrant.id;
          guardianConsentExpiresAt = guardianGrant.authorization_expires_at;
        }

        const draft = await trx("application_drafts")
          .where({ profile_id: profile.id, agency_id: agencyId })
          .first();
        const isActiveDraft =
          draft?.lifecycle_state === DRAFT_LIFECYCLE_STATES.ACTIVE ||
          (draft && !draft.lifecycle_state);
        const currentDraftVersion = isActiveDraft ? Number(draft.version) : 0;
        const currentDraftGeneration = isActiveDraft
          ? Number(draft.generation || 1)
          : 0;
        if (
          (draft && !isActiveDraft) ||
          currentDraftVersion !== expectedDraftVersion ||
          currentDraftGeneration !== expectedDraftGeneration
        ) {
          const error = new Error("Draft version conflict");
          error.code = "DRAFT_CONFLICT";
          throw error;
        }
        if (
          draft &&
          parseDraftPayload(draft.payload).consent !== true
        ) {
          const error = new Error("Draft consent required");
          error.code = "DRAFT_CONSENT_REQUIRED";
          throw error;
        }
        if (draft && !minorSubmission) {
          const draftPayload = parseDraftPayload(draft.payload);
          if (
            draftPayload.accuracyConfirmed !== true ||
            draftPayload.adultAuthorityConfirmed !== true
          ) {
            const error = new Error("Draft attestations required");
            error.code = "DRAFT_CONSENT_REQUIRED";
            throw error;
          }
        }

        const submissionRequestId = uuidv4();
        await trx("application_submission_requests").insert({
          id: submissionRequestId,
          profile_id: profile.id,
          agency_id: agencyId,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          status: "processing",
          created_at: trx.fn.now(),
          ...(openCallReady
            ? {
                quota_exempt: quotaExempt,
                exemption_claim_id: quotaExempt ? openCallClaim.id : null,
              }
            : {}),
        });

        // Written only once the columns exist; the purpose of an application is
        // immutable, so a revived row restates the same values it was created
        // with rather than inheriting a stale purpose from an older send.
        const eventColumns = eventColumnsReady
          ? {
              open_call_link_id: eventCall?.linkId || null,
              call_purpose: callPurpose,
            }
          : {};

        if (reapplying) {
          const revived = await trx("applications")
            .where({ id: existing.id, status: "withdrawn" })
            .update({
              ...eventColumns,
              status: "pending",
              minor_at_submission: minorSubmission,
              guardian_consent_grant_id: guardianConsentGrantId,
              guardian_consent_expires_at: guardianConsentExpiresAt,
              minor_access_revoked_at: null,
              minor_access_revocation_reason: null,
              // The status genuinely moved (withdrawn → pending), so the review
              // clock restarts here. Auto-close reads this column, and leaving
              // it on the original send would hand the agency a window that had
              // already half-lapsed before they saw the resubmission.
              status_changed_at: trx.fn.now(),
              updated_at: trx.fn.now(),
            });
          if (revived !== 1) {
            const error = new Error("Application already submitted");
            error.code = "APPLICATION_ALREADY_SUBMITTED";
            throw error;
          }
          applicationId = existing.id;
          await logActivity(
            req,
            trx,
            applicationId,
            agencyId,
            "status_change",
            "Application resubmitted",
            { old_status: "withdrawn", new_status: "pending" },
          );
        } else {
          // Provenance, written here and nowhere else: `invited_by_agency_id`
          // now means "this real application followed an invitation we sent",
          // which is what the agency dossier's `invited` flag has always
          // claimed. It used to be set by the invite itself, on a row the
          // talent never created — see
          // `20260820100000_create_agency_invitations.js`.
          const invitation = await findInvitation(trx, {
            agencyId,
            profileId: profile.id,
          });

          applicationId = uuidv4();
          await trx("applications").insert({
            id: applicationId,
            profile_id: profile.id,
            agency_id: agencyId,
            ...eventColumns,
            status: "pending",
            invited_by_agency_id: invitation ? agencyId : null,
            minor_at_submission: minorSubmission,
            guardian_consent_grant_id: guardianConsentGrantId,
            guardian_consent_expires_at: guardianConsentExpiresAt,
            // Anchor the agency's review window at the send. Without it the row
            // falls back to `updated_at`, which any later talent-side write
            // bumps — silently restarting a clock the agency never touched.
            status_changed_at: trx.fn.now(),
          });
        }

        if (quotaExempt) {
          // Spend the claim atomically with the submission it exempts, and
          // make the consent record state what the UI stated.
          await consumeClaim(trx, openCallClaim.id, applicationId);
          disclosureSnapshot.openCall = buildOpenCallDisclosure(agency.name, {
            purpose: callPurpose,
            eventName: eventCall?.disclosureContext?.eventName || null,
          });
        }

        await trx("application_submission_requests")
          .where({ id: submissionRequestId })
          .update({ application_id: applicationId });

        // Registry evaluation is an immutable send-time audit, never a send
        // gate. An unmapped agency or transient registry failure cannot stop
        // the application transaction.
        await recordAdvisorySpecSnapshot(trx, {
          applicationId,
          submissionRequestId,
          profileId: profile.id,
          agencyId,
          imageIds: registryImageIds,
          expectedRevisionId:
            normalizedSubmissionReferences.specRegistryRevisionId,
        });

        await recordSubmissionDisclosureConsent(trx, {
          applicationId,
          userId: req.session.userId,
          profileId: profile.id,
          agencyId,
          packageFingerprint,
          disclosureSnapshot,
          guardianConsentRequestId,
          guardianConsentGrantId,
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
          purpose: callPurpose,
          openCallLinkId: eventCall?.linkId || null,
          // The compensation sentence the applicant actually read, frozen
          // beside their consent. Restated verbatim, never paraphrased.
          compensationDisclosure:
            disclosureSnapshot.compensationDisclosure || null,
        });

        await trx("application_submission_boards")
          .where({ application_id: applicationId })
          .delete();
        if (normalizedSubmissionReferences.boards.length > 0) {
          await trx("application_submission_boards").insert(
            normalizedSubmissionReferences.boards.map((boardName) => ({
              id: uuidv4(),
              application_id: applicationId,
              agency_id: agencyId,
              board_name: boardName,
              created_at: trx.fn.now(),
            })),
          );
        }

        const relationalBoards = await resolveRelationalSubmissionBoards(
          trx,
          agencyId,
          normalizedSubmissionReferences.boards,
        );
        await trx("board_applications")
          .where({ application_id: applicationId })
          .delete();
        if (relationalBoards.length > 0) {
          await trx("board_applications").insert(
            relationalBoards.map((board) => ({
              id: uuidv4(),
              board_id: board.id,
              application_id: applicationId,
              created_at: trx.fn.now(),
              updated_at: trx.fn.now(),
            })),
          );
        }

        if (
          hasSubmissionPackagesTable &&
          submissionPackage &&
          typeof submissionPackage === "object"
        ) {
          const selectedExternalCard = normalizedSubmissionReferences.externalCompCard;
          const selectedPresetId =
            normalizedSubmissionReferences.compCardPreset?.id || null;
          const selectedPreset = selectedPresetId
            ? await trx("comp_card_presets")
                .where({
                  id: selectedPresetId,
                  profile_id: profile.id,
                })
                .first()
            : null;
          const selectedMediaSet =
            normalizedSubmissionReferences.mediaSetId !== "current"
              ? await trx("image_sets")
                  .where({
                    id: normalizedSubmissionReferences.mediaSetId,
                    profile_id: profile.id,
                  })
                  .first("id", "name")
              : null;
          const compCard = selectedExternalCard
            ? { id: selectedExternalCard.id, name: selectedExternalCard.name, mimeType: selectedExternalCard.mimeType, externalUrl: selectedExternalCard.url, external: true }
            : selectedPreset
            ? {
                id: selectedPreset.id,
                ...toPresetPayload(selectedPreset),
              }
            : {
                id: null,
                name: "Comp card",
                seed: `profile:${submissionProfile.slug}`,
                layoutFamily: null,
                styleVariant: null,
                lockHeroId: null,
                lockGridIds: [],
                board: null,
                market: null,
              };
          await trx("talent_submission_packages").insert({
            id: uuidv4(),
            application_id: applicationId,
            user_id: req.session.userId,
            profile_id: profile.id,
            label: `Application to ${agencyId}`,
            created_at: new Date(),
            // Ruling R4: an event package is deleted 90 days after the event
            // ends, and the consent copy says so in those words. Holding it for
            // 24 months like a representation package would make that sentence
            // false. A call with no stated end date has nothing to count from,
            // so it keeps the default window.
            retention_expires_at:
              eventPackageRetentionExpiry(eventCall) ||
              submissionRetentionExpiry().toISOString(),
            guardian_consent_grant_id: guardianConsentGrantId,
            guardian_consent_expires_at: guardianConsentExpiresAt,
            payload: {
              packageSchemaVersion: 2,
              applicationId,
              agencyId,
              agencyName: agency.name || null,
              // Top-level, not nested: the designer pick page reads
              // `payload.availability` / `payload.walkVideoUrl` straight off
              // the frozen snapshot, never off a live application row.
              callPurpose,
              openCallLinkId: eventCall?.linkId || null,
              availability: normalizedSubmissionReferences.availability,
              walkVideoUrl: normalizedSubmissionReferences.walkVideoUrl,
              eventContext: eventCall
                ? {
                    ...eventCall.disclosureContext,
                    availability: normalizedSubmissionReferences.availability,
                    walkVideoUrl: normalizedSubmissionReferences.walkVideoUrl,
                  }
                : null,
              boards: normalizedSubmissionReferences.boards,
              boardLabels: normalizedSubmissionReferences.boards,
              mediaSetId: normalizedSubmissionReferences.mediaSetId,
              mediaSetName:
                selectedMediaSet?.name ||
                (normalizedSubmissionReferences.mediaSetId === "current"
                  ? "Current book"
                  : null),
              compCardId: selectedPresetId,
              compCardName: compCard.name,
              compCardPresetId:
                normalizedSubmissionReferences.compCardPreset?.id || null,
              compCardPresetName:
                normalizedSubmissionReferences.compCardPreset?.name || null,
              compCardSeed: compCard.seed,
              externalCompCardId: selectedExternalCard?.id || null,
              compCard,
              digitalSlotPicks:
                normalizedSubmissionReferences.digitalSlotPicks,
              specRegistryRevisionId:
                normalizedSubmissionReferences.specRegistryRevisionId,
              imageIds: packageImages.map((image) => image.id),
              images: packageImages.map(snapshotSubmissionImage),
              profile: buildSubmissionProfileSnapshot(submissionProfile, {
                minor: minorSubmission,
                social: submissionSocial,
              }),
              contact: minorSubmission
                ? null
                : {
                    email: submissionProfile.email || null,
                    phone: submissionProfile.phone || null,
                  },
              minorDataMinimized: minorSubmission,
              consentConfirmed: !!submissionPackage.consentConfirmed,
              accuracyConfirmed:
                minorSubmission ||
                submissionPackage.accuracyConfirmed === true,
              adultAuthorityConfirmed:
                !minorSubmission &&
                submissionPackage.adultAuthorityConfirmed === true,
              submittedAt: new Date().toISOString(),
            },
          });
        }

        if (applicationNote) {
          // Flagged so the applications list can tell the cover note apart from
          // the chat messages that follow it in this same thread.
          await trx("messages").insert({
            application_id: applicationId,
            sender_id: req.session.userId,
            sender_type: "TALENT",
            message: applicationNote.slice(0, 1200),
            is_read: false,
            ...(noteFlagReady ? { is_submission_note: true } : {}),
          });
        }

        if (draft) {
          const deleted = await trx("application_drafts")
            .where({
              id: draft.id,
              version: currentDraftVersion,
              generation: currentDraftGeneration,
              lifecycle_state: DRAFT_LIFECYCLE_STATES.ACTIVE,
            })
            .del();
          if (deleted !== 1) {
            const error = new Error("Draft changed during submission");
            error.code = "DRAFT_CONFLICT";
            throw error;
          }
          await recordDraftEvent(trx, {
            ...draft,
            eventType: "submitted",
            lifecycleState: "submitted",
            metadata: { hadDraft: true },
          });
        }

        await trx("application_submission_requests")
          .where({ profile_id: profile.id, idempotency_key: idempotencyKey })
          .update({
            status: "completed",
            application_id: applicationId,
            completed_at: trx.fn.now(),
          });
      });
    } catch (error) {
      if (error.code === "DRAFT_CONFLICT") {
        const latestRow = await knex("application_drafts")
          .where({ profile_id: profile.id, agency_id: agencyId })
          .first();
        const latest = await loadDraftRepresentation(
          knex,
          latestRow,
          profile.id,
          agency,
        );
        return sendDraftConflict(res, latest);
      }
      if (error.code === "DRAFT_CONSENT_REQUIRED") {
        return res.status(409).json({
          success: false,
          error: "draft_consent_required",
          message: "Review and confirm the latest saved draft before submitting.",
        });
      }
      if (error.code === "AGENCY_UNAVAILABLE") {
        return res.status(409).json({
          success: false,
          error: "agency_unavailable",
          message: "This agency is not currently accepting applications.",
        });
      }
      if (error.code === "GUARDIAN_AGENCY_CONSENT_REQUIRED") {
        return res.status(403).json({
          success: false,
          error: "guardian_agency_consent_required",
          message:
            "A parent or guardian must authorize this submission to the selected agency.",
        });
      }
      if (error.code === "MONTHLY_APPLICATION_LIMIT") {
        const activeClaims = openCallReady
          ? await listActiveClaims(knex, profile.id)
          : [];
        return res.status(403).json({
          success: false,
          error: "monthly_discovery_limit_reached",
          message:
            "You have used this month's discovery submissions. Submitting through an agency's own open call link is always unlimited.",
          limit: error.quota?.limit ?? MONTHLY_DISCOVERY_SUBMISSION_LIMIT,
          current: error.quota?.used ?? MONTHLY_DISCOVERY_SUBMISSION_LIMIT,
          activeClaims: activeClaims.map(serializeClaim),
        });
      }
      if (error.code === "OPEN_CALL_CLAIM_CONFLICT") {
        return res.status(409).json({
          success: false,
          error: "open_call_claim_conflict",
          message:
            "Your open call invitation was already used. Review your submissions and try again.",
        });
      }
      if (error.code === "APPLICATION_ALREADY_SUBMITTED") {
        return res.status(409).json({
          success: false,
          error: "application_already_submitted",
          message: "This application has already been submitted.",
        });
      }
      if (
        error.code === "SQLITE_CONSTRAINT" ||
        error.code === "23505"
      ) {
        const completed = await knex("application_submission_requests")
          .where({ profile_id: profile.id, idempotency_key: idempotencyKey })
          .first();
        if (
          completed?.request_hash === requestHash &&
          completed?.status === "completed" &&
          completed?.application_id
        ) {
          return res.json({
            success: true,
            id: completed.application_id,
            idempotent: true,
          });
        }
        const racedApplication = await knex("applications")
          .where({ profile_id: profile.id, agency_id: agencyId })
          .whereNot("status", "withdrawn")
          .first("id");
        if (racedApplication) {
          return res.status(409).json({
            success: false,
            error: "application_already_submitted",
            message: "This application has already been submitted.",
          });
        }
      }
      throw error;
    }

    await recordSubmitFunnelEvents({
      eventCall,
      profileId: profile.id,
      strengthScore: canonicalPackageValidation.strength?.score,
      digitalSlotCount: Object.keys(
        normalizedSubmissionReferences.digitalSlotPicks || {},
      ).length,
      compCardPresent: Boolean(normalizedSubmissionReferences.compCardPreset),
    });

    try {
      await notifyTalentApplicationSubmitted({
        userId: req.session.userId,
        applicationId,
        agencyId,
        agencyName: agency?.name,
      });
    } catch (notifyErr) {
      console.error(
        "[Applications] Submission notification failed:",
        notifyErr,
      );
    }

    const talentName = [profile.first_name, profile.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    try {
      await notifyAgencyNewApplication({
        agencyId,
        applicationId,
        talentName: talentName || profile.name || "A talent",
      });
    } catch (notifyErr) {
      console.error("[Applications] Agency notification failed:", notifyErr);
    }

    /* Export hand-off (plan §9.4): push the submission into whatever the agency
       already uses, so Pholio does not become the second inbox.

       AWAITED. I originally left this unawaited to keep an agency's endpoint
       latency off the talent's send, which is sound reasoning on a long-lived
       server and wrong under Lambda: the container freezes when the handler
       resolves, so the delivery simply never happened. A submission that never
       reaches the agency's system is the precise failure this feature exists to
       prevent, and it would have failed silently.

       The cost is bounded — delivery carries its own 5s timeout and swallows
       its own errors, and only agencies that configured an endpoint pay it. */
    await dispatchSubmission(knex, {
      agencyId,
      application: {
        id: applicationId,
        status: "pending",
        created_at: new Date().toISOString(),
        profile_id: profile.id,
      },
      profile,
    }).catch(() => {});

    res.json({ success: true, id: applicationId });
  }),
);

/* ── Application drafts ──────────────────────────────────────────────────────
   An in-progress submission, one per (talent, agency). Kept off the
   `applications` table so it can never surface in the agency's inbox until the
   talent actually sends. */

router.use("/drafts", (_req, res, next) => {
  res.set("Cache-Control", "private, no-store, max-age=0");
  res.set("Pragma", "no-cache");
  next();
});

async function loadDraftRepresentation(db, row, profileId, agency) {
  if (!row) return null;
  const storedPayload = parseDraftPayload(row.payload);
  if (
    Number(row.schema_version) > DRAFT_SCHEMA_VERSION ||
    Number(storedPayload.schemaVersion) > DRAFT_SCHEMA_VERSION
  ) {
    return mapDraftRow(row, {}, Date.now(), {
      agency: agency
        ? {
            id: agency.id,
            name: agency.name || null,
            location: agency.location || null,
            logo: agency.logo_path || null,
            website: agency.website || null,
            status: agency.status || null,
            isBlocked: agency.isBlocked === true,
          }
        : null,
      repairWarnings: [
        {
          code: "unsupported_schema",
          field: "schemaVersion",
          message:
            "This draft was created by a newer version of Pholio and cannot be resumed here.",
        },
      ],
    });
  }
  const normalized = await normalizeDraftPayloadWithRepairs(db, {
    profileId,
    agency,
    payload: storedPayload,
  });
  return mapDraftRow(row, normalized.payload, Date.now(), {
    agency: agency
      ? {
          id: agency.id,
          name: agency.name || null,
          location: agency.location || null,
          logo: agency.logo_path || null,
          website: agency.website || null,
          status: agency.status || null,
          isBlocked: agency.isBlocked === true,
        }
      : null,
    repairWarnings: normalized.repairWarnings,
  });
}

async function getDraftAgency(db, agencyId) {
  return db("agencies")
    .where({ id: agencyId })
    .first(
      "id",
      "name",
      "location",
      "logo_path",
      "website",
      "open_boards",
      "status",
    );
}

function unavailableDraftAgency(agencyId) {
  return {
    id: agencyId,
    name: null,
    location: null,
    logo_path: null,
    website: null,
    open_boards: "[]",
    status: "unavailable",
  };
}

function sendDraftConflict(res, latest) {
  return res.status(409).json({
    success: false,
    error: "draft_conflict",
    message:
      "This draft was updated elsewhere. Choose which version to continue with.",
    latest,
  });
}

function sendDraftLifecycleConflict(res, latest) {
  const state = latest?.lifecycleState;
  const error =
    state === DRAFT_LIFECYCLE_STATES.DELETED
      ? "draft_deleted"
      : state === DRAFT_LIFECYCLE_STATES.EXPIRED
        ? "draft_expired"
        : "draft_conflict";
  const message =
    error === "draft_deleted"
      ? "This draft was deleted. Recover it before making changes."
      : error === "draft_expired"
        ? "This draft expired. Recover it before making changes."
        : "This draft was updated elsewhere.";
  return res.status(409).json({
    success: false,
    error,
    message,
    latest,
  });
}

async function maintainDraftLifecycle() {
  await expireInactiveDrafts(knex);
  await scrubUnrecoverableDrafts(knex);
}

function validateDraftPreconditions(body, { allowZero = true } = {}) {
  const expectedVersion = parseNonNegativeInteger(body?.expectedVersion);
  const expectedGeneration = parseNonNegativeInteger(body?.expectedGeneration);
  if (
    expectedVersion === null ||
    expectedGeneration === null ||
    (!allowZero && (expectedVersion < 1 || expectedGeneration < 1))
  ) {
    return null;
  }
  return { expectedVersion, expectedGeneration };
}

// GET /api/talent/applications/drafts — all drafts the talent can resume,
// recover, or intentionally discard. Submitted applications are never mixed in.
router.get(
  "/drafts",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }
    await maintainDraftLifecycle();
    const blockedAgencyIds = await getBlockedAgencyIds(
      knex,
      req.session.userId,
    );
    const rows = await knex("application_drafts")
      .where({ profile_id: profile.id })
      .whereIn("lifecycle_state", [
        DRAFT_LIFECYCLE_STATES.ACTIVE,
        DRAFT_LIFECYCLE_STATES.DELETED,
        DRAFT_LIFECYCLE_STATES.EXPIRED,
      ])
      .orderBy("updated_at", "desc");
    const data = [];
    for (const row of rows) {
      const agency =
        (await getDraftAgency(knex, row.agency_id)) ||
        unavailableDraftAgency(row.agency_id);
      agency.isBlocked = blockedAgencyIds.has(row.agency_id);
      data.push(
        await loadDraftRepresentation(knex, row, profile.id, agency),
      );
    }
    return res.json({ success: true, data });
  }),
);

// GET /api/talent/applications/drafts/latest — route-level resume when /apply
// is opened without an agency query parameter.
router.get(
  "/drafts/latest",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found", message: "Profile not found" });
    }
    await maintainDraftLifecycle();
    const blockedAgencyIds = await getBlockedAgencyIds(
      knex,
      req.session.userId,
    );
    const latestQuery = knex("application_drafts as draft")
      .join("agencies as agency", "agency.id", "draft.agency_id")
      .where({
        "draft.profile_id": profile.id,
        "draft.lifecycle_state": DRAFT_LIFECYCLE_STATES.ACTIVE,
      })
      .whereRaw("UPPER(agency.status) = ?", ["ACTIVE"])
      .select("draft.*")
      .orderBy("draft.updated_at", "desc")
      .orderBy("draft.created_at", "desc")
      .orderBy("draft.id", "desc");
    if (blockedAgencyIds.size > 0) {
      latestQuery.whereNotIn("draft.agency_id", [...blockedAgencyIds]);
    }
    const draft = await latestQuery
      .first();
    if (!draft) {
      return res.json({ success: true, data: null });
    }
    const agency = await getDraftAgency(knex, draft.agency_id);
    if (!agency) {
      return res.json({ success: true, data: null });
    }
    return res.json({
      success: true,
      data: await loadDraftRepresentation(knex, draft, profile.id, agency),
    });
  }),
);

// GET /api/talent/applications/drafts/:agencyId — resume a saved draft.
router.get(
  "/drafts/:agencyId",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found", message: "Profile not found" });
    }
    await maintainDraftLifecycle();
    const agency =
      (await getDraftAgency(knex, req.params.agencyId)) ||
      unavailableDraftAgency(req.params.agencyId);
    agency.isBlocked = await isAgencyBlockedForTalent(
      knex,
      req.session.userId,
      req.params.agencyId,
    );
    const draft = await knex("application_drafts")
      .where({ profile_id: profile.id, agency_id: req.params.agencyId })
      .first();
    res.json({
      success: true,
      data: await loadDraftRepresentation(knex, draft, profile.id, agency),
    });
  }),
);

/**
 * Funnel step 2 (design §g): the numerator's numerator.
 *
 * Fires on the *first* write that carries a given call, not on every autosave —
 * an apply flow saves a draft every few keystrokes and counting those would
 * turn "applications started" into "keystrokes". First means either a freshly
 * created draft or an existing one that did not previously name this call
 * (a talent who opened a representation draft and then arrived through an
 * event link genuinely started an event application at that moment).
 */
async function recordApplicationStarted({
  previousPayload,
  nextPayload,
  profileId,
  agencyId,
}) {
  const linkId = nextPayload?.openCallLinkId;
  if (!linkId || previousPayload?.openCallLinkId === linkId) return;
  try {
    await recordEventFunnelEvent({
      openCallLinkId: linkId,
      agencyId,
      profileId,
      eventType: FUNNEL_EVENT_TYPES.APPLICATION_STARTED,
    });
  } catch (error) {
    console.debug("[EventFunnel] application_started failed:", error?.message);
  }
}

// PUT /api/talent/applications/drafts/:agencyId — upsert the in-progress dossier.
router.put(
  "/drafts/:agencyId",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { agencyId } = req.params;
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found", message: "Profile not found" });
    }
    await maintainDraftLifecycle();
    const agency = await getDraftAgency(knex, agencyId);
    if (!agency) {
      return res.status(404).json({
        success: false,
        error: "Agency not found",
        message: "Agency not found",
      });
    }
    if (String(agency.status || "").toUpperCase() !== "ACTIVE") {
      return res.status(409).json({
        success: false,
        error: "agency_unavailable",
        message: "This agency is not currently accepting applications.",
      });
    }
    if (await isAgencyBlockedForTalent(knex, req.session.userId, agencyId)) {
      return res.status(403).json({
        success: false,
        error: "Agency blocked",
        message: "You have blocked this agency.",
      });
    }
    const submittedApplication = await knex("applications")
      .where({ profile_id: profile.id, agency_id: agencyId })
      .whereNot("status", "withdrawn")
      .first("id");
    if (submittedApplication) {
      return res.status(409).json({
        success: false,
        error: "application_already_submitted",
        message: "This application has already been submitted.",
      });
    }

    const preconditions = validateDraftPreconditions(req.body);
    if (!preconditions) {
      return res.status(400).json({
        success: false,
        error: "invalid_draft_precondition",
        message: "Valid expectedVersion and expectedGeneration values are required.",
      });
    }
    const { expectedVersion, expectedGeneration } = preconditions;
    const expectedRevisionToken = typeof req.body?.expectedRevisionToken === "string"
      ? req.body.expectedRevisionToken.trim().toLowerCase()
      : null;

    let normalized;
    try {
      normalized = await normalizeDraftPayloadWithRepairs(knex, {
        profileId: profile.id,
        agency,
        payload: req.body?.payload,
      });
    } catch (error) {
      if (error.code === "UNSUPPORTED_DRAFT_SCHEMA") {
        return res.status(422).json({
          success: false,
          error: "unsupported_draft_schema",
          message: "This draft was created by a newer version of Pholio.",
          supportedSchemaVersion: DRAFT_SCHEMA_VERSION,
        });
      }
      throw error;
    }
    const normalizedPayload = normalized.payload;
    const serializedPayload = JSON.stringify(normalizedPayload);
    const clientId = normalizeClientId(req.body?.clientId);
    const clientUpdatedAt = normalizeClientUpdatedAt(req.body?.clientUpdatedAt);
    const currentStepId = normalizeStepId(req.body?.currentStepId);
    let savedRow = null;

    let inactiveRow = null;
    // What the draft named before this write, for the first-write-only funnel
    // check below. Read inside the transaction; used after it commits.
    let previousPayload = null;
    try {
      await knex.transaction(async (trx) => {
        const existing = await trx("application_drafts")
          .where({ profile_id: profile.id, agency_id: agencyId })
          .first();
        previousPayload = existing ? parseDraftPayload(existing.payload) : null;

        if (!existing) {
          if (expectedVersion !== 0 || expectedGeneration !== 0) return;
          const id = uuidv4();
          await trx("application_drafts").insert({
            id,
            profile_id: profile.id,
            agency_id: agencyId,
            payload: serializedPayload,
            schema_version: DRAFT_SCHEMA_VERSION,
            current_step_id: currentStepId,
            version: 1,
            generation: 1,
            lifecycle_state: DRAFT_LIFECYCLE_STATES.ACTIVE,
            expires_at: expiryTimestamp(),
            repair_warnings: JSON.stringify(normalized.repairWarnings),
            last_saved_by_client_id: clientId,
            client_updated_at: clientUpdatedAt,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
          savedRow = await trx("application_drafts").where({ id }).first();
          await recordDraftEvent(trx, {
            ...savedRow,
            eventType: "created",
            lifecycleState: DRAFT_LIFECYCLE_STATES.ACTIVE,
            metadata: {
              repairCount: normalized.repairWarnings.length,
              repairCodes: normalized.repairWarnings.map((item) => item.code),
            },
          });
          return;
        }

        if (existing.lifecycle_state !== DRAFT_LIFECYCLE_STATES.ACTIVE) {
          inactiveRow = existing;
          return;
        }
        const existingGeneration = Number(existing.generation || 1);
        if (existingGeneration !== expectedGeneration) {
          return;
        }
        const existingNormalized = await normalizeDraftPayloadWithRepairs(trx, {
          profileId: profile.id,
          agency,
          payload: parseDraftPayload(existing.payload),
        });
        const sameDocument =
          draftDocumentFingerprint(existingNormalized.payload, existing.current_step_id) ===
          draftDocumentFingerprint(normalizedPayload, currentStepId);
        if (sameDocument) {
          savedRow = existing;
          return;
        }
        const versionMatches =
          Number(existing.version) === expectedVersion &&
          (
            !expectedRevisionToken ||
            expectedRevisionToken === draftRevisionToken(
              existingNormalized.payload,
              existing.current_step_id,
            )
          );
        const sameMaterial =
          draftMaterialFingerprint(existingNormalized.payload) ===
          draftMaterialFingerprint(normalizedPayload);
        if (!versionMatches) {
          if (!sameMaterial) return;
          // A delayed same-material request is not allowed to roll cursor or
          // confirmation state backward. Return the authoritative row; the
          // client can rebase any still-current volatile state and retry it on
          // this revision.
          savedRow = existing;
          return;
        }
        const nextVersion = Number(existing.version) + 1;
        const updated = await trx("application_drafts")
          .where({
            id: existing.id,
            version: existing.version,
            generation: existingGeneration,
            lifecycle_state: DRAFT_LIFECYCLE_STATES.ACTIVE,
          })
          .update({
            payload: serializedPayload,
            schema_version: DRAFT_SCHEMA_VERSION,
            current_step_id: currentStepId,
            version: nextVersion,
            expires_at: expiryTimestamp(),
            repair_warnings: JSON.stringify(normalized.repairWarnings),
            last_saved_by_client_id: clientId,
            client_updated_at: clientUpdatedAt,
            updated_at: trx.fn.now(),
          });
        if (updated) {
          savedRow = await trx("application_drafts")
            .where({ id: existing.id })
            .first();
          await recordDraftEvent(trx, {
            ...savedRow,
            eventType: "saved",
            lifecycleState: DRAFT_LIFECYCLE_STATES.ACTIVE,
            metadata: {
              repairCount: normalized.repairWarnings.length,
              repairCodes: normalized.repairWarnings.map((item) => item.code),
            },
          });
        }
      });
    } catch (error) {
      if (error.code !== "SQLITE_CONSTRAINT" && error.code !== "23505") {
        throw error;
      }
    }

    if (!savedRow) {
      const latestRow = inactiveRow || await knex("application_drafts")
        .where({ profile_id: profile.id, agency_id: agencyId })
        .first();
      const latest = await loadDraftRepresentation(
        knex,
        latestRow,
        profile.id,
        agency,
      );
      // Covers a duplicate create that lost the unique-key race, and a retry
      // after the client never received the successful response. Identical
      // normalized documents converge on the saved revision without creating
      // another version or presenting a false conflict.
      if (
        latest?.lifecycleState === DRAFT_LIFECYCLE_STATES.ACTIVE &&
        (
          draftDocumentFingerprint(latest.payload, latest.currentStepId) ===
            draftDocumentFingerprint(normalizedPayload, currentStepId) ||
          (
            expectedVersion === 0 &&
            expectedGeneration === 0 &&
            draftMaterialFingerprint(latest.payload) ===
              draftMaterialFingerprint(normalizedPayload)
          )
        )
      ) {
        return res.json({ success: true, data: latest });
      }
      await recordDraftEvent(knex, {
        ...(latestRow || {}),
        profileId: profile.id,
        agencyId,
        eventType: "save_conflict",
        lifecycleState: latest?.lifecycleState || null,
      });
      return sendDraftLifecycleConflict(res, latest);
    }

    await recordApplicationStarted({
      previousPayload,
      nextPayload: normalizedPayload,
      profileId: profile.id,
      agencyId,
    });

    return res.json({
      success: true,
      data: await loadDraftRepresentation(
        knex,
        savedRow,
        profile.id,
        agency,
      ),
    });
  }),
);

// DELETE /api/talent/applications/drafts/:agencyId — discard a draft.
router.delete(
  "/drafts/:agencyId",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found", message: "Profile not found" });
    }
    await maintainDraftLifecycle();
    const agency =
      (await getDraftAgency(knex, req.params.agencyId)) ||
      unavailableDraftAgency(req.params.agencyId);
    const preconditions = validateDraftPreconditions(req.body, {
      allowZero: false,
    });
    if (!preconditions) {
      return res.status(400).json({
        success: false,
        error: "invalid_draft_precondition",
        message: "Valid expectedVersion and expectedGeneration values are required.",
      });
    }
    const existing = await knex("application_drafts")
      .where({
        profile_id: profile.id,
        agency_id: req.params.agencyId,
      })
      .first();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "draft_not_found",
        message: "Draft not found.",
      });
    }
    const latest = await loadDraftRepresentation(
      knex,
      existing,
      profile.id,
      agency,
    );
    const canDelete = [
      DRAFT_LIFECYCLE_STATES.ACTIVE,
      DRAFT_LIFECYCLE_STATES.EXPIRED,
    ].includes(existing.lifecycle_state);
    if (
      !canDelete ||
      Number(existing.version) !== preconditions.expectedVersion ||
      Number(existing.generation || 1) !== preconditions.expectedGeneration
    ) {
      await recordDraftEvent(knex, {
        ...existing,
        eventType: "delete_conflict",
        lifecycleState: existing.lifecycle_state,
      });
      return sendDraftLifecycleConflict(res, latest);
    }
    const nextVersion = Number(existing.version) + 1;
    const now = new Date();
    const updated = await knex("application_drafts")
      .where({
        id: existing.id,
        version: preconditions.expectedVersion,
        generation: preconditions.expectedGeneration,
        lifecycle_state: existing.lifecycle_state,
      })
      .update({
        lifecycle_state: DRAFT_LIFECYCLE_STATES.DELETED,
        deleted_at: now.toISOString(),
        recoverable_until: recoveryTimestamp(now),
        expires_at: null,
        version: nextVersion,
        updated_at: knex.fn.now(),
      });
    if (updated !== 1) {
      const conflicting = await knex("application_drafts")
        .where({ id: existing.id })
        .first();
      return sendDraftLifecycleConflict(
        res,
        await loadDraftRepresentation(knex, conflicting, profile.id, agency),
      );
    }
    const deleted = await knex("application_drafts")
      .where({ id: existing.id })
      .first();
    await recordDraftEvent(knex, {
      ...deleted,
      eventType: "deleted",
      lifecycleState: DRAFT_LIFECYCLE_STATES.DELETED,
    });
    return res.json({
      success: true,
      data: await loadDraftRepresentation(knex, deleted, profile.id, agency),
    });
  }),
);

// POST /api/talent/applications/drafts/:agencyId/recover
router.post(
  "/drafts/:agencyId/recover",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }
    await maintainDraftLifecycle();
    const agency = await getDraftAgency(knex, req.params.agencyId);
    if (!agency) {
      return res.status(404).json({
        success: false,
        error: "Agency not found",
        message: "Agency not found",
      });
    }
    if (String(agency.status || "").toUpperCase() !== "ACTIVE") {
      return res.status(409).json({
        success: false,
        error: "agency_unavailable",
        message: "This agency is not currently accepting applications.",
      });
    }
    if (
      await isAgencyBlockedForTalent(
        knex,
        req.session.userId,
        req.params.agencyId,
      )
    ) {
      return res.status(403).json({
        success: false,
        error: "Agency blocked",
        message: "You have blocked this agency.",
      });
    }
    const expectedGeneration = parseNonNegativeInteger(
      req.body?.expectedGeneration,
    );
    if (expectedGeneration === null || expectedGeneration < 1) {
      return res.status(400).json({
        success: false,
        error: "invalid_draft_generation",
        message: "A valid expectedGeneration is required.",
      });
    }
    const existing = await knex("application_drafts")
      .where({
        profile_id: profile.id,
        agency_id: req.params.agencyId,
      })
      .first();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "draft_not_found",
        message: "Draft not found or its recovery window has ended.",
      });
    }
    const recoverableUntil = existing.recoverable_until
      ? new Date(existing.recoverable_until)
      : null;
    const isRecoverableState = [
      DRAFT_LIFECYCLE_STATES.DELETED,
      DRAFT_LIFECYCLE_STATES.EXPIRED,
    ].includes(existing.lifecycle_state);
    if (
      !isRecoverableState ||
      Number(existing.generation || 1) !== expectedGeneration ||
      !recoverableUntil ||
      Number.isNaN(recoverableUntil.getTime()) ||
      recoverableUntil.getTime() <= Date.now()
    ) {
      const latest = await loadDraftRepresentation(
        knex,
        existing,
        profile.id,
        agency,
      );
      await recordDraftEvent(knex, {
        ...existing,
        eventType: "recovery_failed",
        lifecycleState: existing.lifecycle_state,
      });
      return sendDraftLifecycleConflict(res, latest);
    }
    const nextGeneration = expectedGeneration + 1;
    const updated = await knex("application_drafts")
      .where({
        id: existing.id,
        generation: expectedGeneration,
        lifecycle_state: existing.lifecycle_state,
      })
      .update({
        lifecycle_state: DRAFT_LIFECYCLE_STATES.ACTIVE,
        generation: nextGeneration,
        version: 1,
        expires_at: expiryTimestamp(),
        deleted_at: null,
        expired_at: null,
        recoverable_until: null,
        updated_at: knex.fn.now(),
      });
    if (updated !== 1) {
      const conflicting = await knex("application_drafts")
        .where({ id: existing.id })
        .first();
      return sendDraftLifecycleConflict(
        res,
        await loadDraftRepresentation(knex, conflicting, profile.id, agency),
      );
    }
    const recovered = await knex("application_drafts")
      .where({ id: existing.id })
      .first();
    await recordDraftEvent(knex, {
      ...recovered,
      eventType: "recovered",
      lifecycleState: DRAFT_LIFECYCLE_STATES.ACTIVE,
    });
    return res.json({
      success: true,
      data: await loadDraftRepresentation(
        knex,
        recovered,
        profile.id,
        agency,
      ),
    });
  }),
);

/**
 * POST /api/talent/applications/:id/withdraw
 * Withdraw an application
 */
router.post(
  "/:id/withdraw",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    const application = await knex("applications")
      .where({ id, profile_id: profile.id })
      .first();

    if (!application) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
        message: "Application not found",
      });
    }

    if (!WITHDRAWABLE_STATUSES.has(application.status)) {
      return res.status(400).json({
        success: false,
        error: "Cannot withdraw",
        message: "This application can no longer be withdrawn.",
      });
    }

    const previousStatus = application.status;

    const withdrawnAt = new Date();
    await knex.transaction(async (trx) => {
      await trx("applications")
        .where({ id, profile_id: profile.id })
        .update({ status: "withdrawn", updated_at: withdrawnAt });
      await redactSubmissionPackages(trx, {
        applicationId: id,
        reason: "talent_withdrawal",
        at: withdrawnAt,
        revoke: true,
      });
      await trx("messages").where({ application_id: id }).delete();
    });

    // Preserve the journey: record the withdrawal in application history.
    await logActivity(
      req,
      knex,
      id,
      application.agency_id,
      "status_change",
      "Application withdrawn",
      { old_status: previousStatus, new_status: "withdrawn" },
    );

    // Let the agency know the talent stepped back.
    try {
      const talentName = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      await notifyAgencyApplicationWithdrawn({
        agencyId: application.agency_id,
        applicationId: id,
        talentName: talentName || profile.name || "A talent",
      });
    } catch (notifyErr) {
      console.error("[Applications] Withdrawal notification failed:", notifyErr);
    }

    res.json({
      success: true,
      disclosure: {
        agencyAccessRevokedAt: withdrawnAt.toISOString(),
        packageRedacted: true,
        platformMessagesDeleted: true,
        limitation:
          "Pholio cannot delete copies the agency downloaded before withdrawal.",
      },
    });
  }),
);

/* ── Answering a slot offer ──────────────────────────────────────────────────
   The only two statuses a talent may write. An organizer offering a slot moves
   an event application to `accepted`; whether that slot is taken is the
   applicant's sentence to speak, and `TALENT_WRITABLE_APPLICATION_STATUSES` is
   deliberately absent from the agency's writable list so nobody can record a
   confirmation on their behalf. */

const SLOT_RESPONSES = Object.freeze({
  [CONFIRMED_APPLICATION_STATUS]: {
    activityDescription: "Talent confirmed the slot",
    successMessage: "Slot confirmed",
  },
  [TALENT_DECLINED_APPLICATION_STATUS]: {
    activityDescription: "Talent declined the slot",
    successMessage: "Slot declined",
  },
});

// Fails at require time rather than at runtime: if a future edit moves either
// status into the agency's writable list, these routes are no longer the only
// way it can be written and the guarantee above is quietly gone.
for (const status of Object.keys(SLOT_RESPONSES)) {
  if (!TALENT_WRITABLE_APPLICATION_STATUSES.includes(status)) {
    throw new Error(
      `Slot response status "${status}" is not talent-writable — see application-status.js`,
    );
  }
}

/**
 * Answer an offer. Legal only from `accepted` on an event application: there is
 * no slot to confirm before one is offered, and re-answering after the fact
 * would rewrite a decision the organizer has already staffed around.
 */
async function respondToSlotOffer(req, res, nextStatus) {
  const { id } = req.params;
  const response = SLOT_RESPONSES[nextStatus];
  const profile = await getProfileBySessionUserId(req.session.userId);
  if (!profile) {
    return res.status(404).json({
      success: false,
      error: "Profile not found",
      message: "Profile not found",
    });
  }

  if (!(await hasApplicationEventColumns(knex))) {
    return res.status(404).json({
      success: false,
      error: "event_casting_unavailable",
      message: "Event casting is not available yet.",
    });
  }

  const application = await knex("applications")
    .where({ id, profile_id: profile.id })
    .first();
  if (!application) {
    return res.status(404).json({
      success: false,
      error: "Application not found",
      message: "Application not found",
    });
  }

  if (application.call_purpose !== CALL_PURPOSES.EVENT_CASTING) {
    return res.status(409).json({
      success: false,
      error: "not_an_event_application",
      message: "Only an event casting can offer a slot.",
    });
  }

  if (!OFFERED_APPLICATION_STATUSES.includes(application.status)) {
    return res.status(409).json({
      success: false,
      error: "slot_offer_not_open",
      message:
        application.status === nextStatus
          ? "You have already answered this offer."
          : "There is no open slot offer on this application.",
    });
  }

  // ISO strings, not Date objects: under a VM realm (jest) knex's
  // `instanceof Date` check fails and it stores the literal "[object Object]",
  // which reads back as an unparseable anchor and breaks the auto-close clock.
  const respondedAt = new Date().toISOString();
  const updated = await knex("applications")
    // Conditional on the status we read: two taps, or a tap racing the
    // auto-close job, must not both land.
    .where({ id, profile_id: profile.id, status: application.status })
    .update({
      status: nextStatus,
      status_changed_at: respondedAt,
      updated_at: respondedAt,
    });
  if (updated !== 1) {
    return res.status(409).json({
      success: false,
      error: "slot_offer_not_open",
      message: "This offer was already answered or has expired.",
    });
  }

  await logActivity(
    req,
    knex,
    id,
    application.agency_id,
    "status_change",
    response.activityDescription,
    { old_status: application.status, new_status: nextStatus },
  );

  const talentName =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
    profile.name ||
    "A talent";
  try {
    const link = await loadOpenCallLink(knex, application.open_call_link_id);
    await notifyAgencyEventSlotResponse({
      agencyId: application.agency_id,
      applicationId: id,
      talentName,
      eventName: link?.event_name || null,
      confirmed: nextStatus === CONFIRMED_APPLICATION_STATUS,
    });
  } catch (notifyErr) {
    // The organizer's inbox is the record; the ping is best-effort.
    console.error("[Applications] Slot response notification failed:", notifyErr);
  }

  return res.json({
    success: true,
    data: {
      id,
      status: nextStatus,
      statusChangedAt: respondedAt,
    },
    message: response.successMessage,
  });
}

/** POST /api/talent/applications/:id/confirm */
router.post(
  "/:id/confirm",
  requireRole("TALENT"),
  requireActiveAccount(),
  asyncHandler((req, res) =>
    respondToSlotOffer(req, res, CONFIRMED_APPLICATION_STATUS),
  ),
);

/** POST /api/talent/applications/:id/decline-slot */
router.post(
  "/:id/decline-slot",
  requireRole("TALENT"),
  requireActiveAccount(),
  asyncHandler((req, res) =>
    respondToSlotOffer(req, res, TALENT_DECLINED_APPLICATION_STATUS),
  ),
);

/**
 * POST /api/talent/applications/:id/payoff-viewed
 *
 * Funnel step 6 (design §g): did the "What you keep" block on ApplySuccess
 * actually land? The mechanism is the cheapest correct one available.
 *
 *  - Not `navigator.sendBeacon`: this surface is behind the session cookie and
 *    behind `sameOriginMutationGuard`, which requires a custom header that
 *    sendBeacon cannot set. The success screen also stays mounted, so there is
 *    no unload race for a beacon to win.
 *  - Not the public `POST /portfolio/:slug/event` shape, where the *client*
 *    names the subject: here the client sends only an action code, and the
 *    server derives link, organizer and profile from an application row it has
 *    already confirmed belongs to the caller. A client cannot inflate another
 *    organizer's funnel.
 *  - Not a new top-level analytics route: one verb on the application the
 *    screen is confirming keeps the authorization question to "is this yours",
 *    which the route already answers everywhere else.
 *
 * Always 204 — an analytics call has nothing to tell the browser, and a
 * representation submission (no open call link) simply records nothing.
 */
router.post(
  "/:id/payoff-viewed",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) return res.status(204).end();
    // Deploy-before-migrate: without the event columns there is no link to
    // attribute the view to, and selecting one would throw.
    if (!(await hasApplicationEventColumns(knex))) return res.status(204).end();
    const action = PAYOFF_ACTION_VALUES.includes(req.body?.action)
      ? req.body.action
      : PAYOFF_ACTIONS.VIEWED;
    const application = await knex("applications")
      .where({ id: req.params.id, profile_id: profile.id })
      .first("id", "agency_id", "open_call_link_id");
    if (application?.open_call_link_id) {
      try {
        await recordEventFunnelEvent({
          openCallLinkId: application.open_call_link_id,
          agencyId: application.agency_id,
          profileId: profile.id,
          eventType: FUNNEL_EVENT_TYPES.PAYOFF_VIEWED,
          metadata: { action },
        });
      } catch (error) {
        console.debug("[EventFunnel] payoff_viewed failed:", error?.message);
      }
    }
    return res.status(204).end();
  }),
);

/**
 * GET /api/talent/applications/:id/activity
 * Status-change history (the lifecycle timeline) for one of the talent's
 * applications. Read-only; scoped to the requesting talent's own profile.
 */
router.get(
  "/:id/activity",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    const application = await knex("applications")
      .where({ id, profile_id: profile.id })
      .first();
    if (!application) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
        message: "Application not found",
      });
    }

    const rows = await knex("application_activities")
      .where({ application_id: id, activity_type: "status_change" })
      .orderBy("created_at", "asc")
      .select("id", "activity_type", "description", "metadata", "created_at");

    const data = rows.map((row) => {
      let metadata = row.metadata;
      if (typeof metadata === "string") {
        try {
          metadata = JSON.parse(metadata);
        } catch {
          metadata = {};
        }
      }
      return {
        id: row.id,
        type: row.activity_type,
        description: row.description,
        metadata: metadata || {},
        created_at: row.created_at,
      };
    });

    res.json({ success: true, data });
  }),
);

/**
 * GET /api/talent/applications/:id/record
 *
 * The talent's own receipt for one submission: exactly what left, and
 * everything that has happened to it since.
 *
 * Both halves already existed and neither was reachable. The frozen package in
 * `talent_submission_packages` is the only truthful answer to "what did they
 * get" — the history panel had been linking to the talent's *current* book and
 * comp card instead, which shows what they have now, not what was sent. And
 * `application_activities` has carried the chronology all along.
 *
 * Only a summary of the package crosses the wire. The payload holds a full
 * profile snapshot and contact details, and a receipt needs counts and names,
 * not a second copy of the talent's personal data on another surface.
 */
router.get(
  "/:id/record",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    const application = await knex("applications")
      .where({ id, profile_id: profile.id })
      .first("id", "created_at");
    if (!application) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
        message: "Application not found",
      });
    }

    const packageRow = await knex("talent_submission_packages")
      .where({ application_id: id, profile_id: profile.id })
      .orderBy("created_at", "desc")
      .first();

    let sent = null;
    if (packageRow) {
      // A package can be revoked or redacted — by retention, by a withdrawal,
      // or by a guardian consent lapse. Saying so is the honest answer; the
      // alternative is a receipt that quietly under-reports what was sent.
      const withheld = Boolean(packageRow.revoked_at || packageRow.redacted_at);
      let payload = packageRow.payload;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          payload = null;
        }
      }
      sent = withheld
        ? {
            available: false,
            reason: packageRow.redacted_at ? "redacted" : "revoked",
            at: packageRow.created_at,
          }
        : {
            available: true,
            at: packageRow.created_at,
            frameCount: Array.isArray(payload?.images)
              ? payload.images.length
              : Array.isArray(payload?.imageIds)
                ? payload.imageIds.length
                : null,
            mediaSetName: payload?.mediaSetName || null,
            compCardName: payload?.compCardName || null,
            boards: Array.isArray(payload?.boardLabels) ? payload.boardLabels : [],
            specRevisionId: payload?.specRegistryRevisionId || null,
          };
    }

    const rows = await knex("application_activities")
      .where({ application_id: id })
      .orderBy("created_at", "asc")
      .select("id", "activity_type", "description", "created_at");

    res.json({
      success: true,
      data: {
        sent,
        // The note is not a column — the list endpoint composes it from the
        // talent's first message. The row already carries it, so this does not
        // fetch it a second time.
        timeline: rows.map((row) => ({
          id: row.id,
          type: row.activity_type,
          description: row.description,
          at: row.created_at,
        })),
      },
    });
  }),
);

/**
 * GET /api/talent/applications/:id/messages
 * Conversation thread for one of the talent's applications. Marks the agency's
 * messages as read on view.
 */
router.get(
  "/:id/messages",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found", message: "Profile not found" });
    }

    const application = await knex("applications")
      .where({ id, profile_id: profile.id })
      .first();
    if (!application) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
        message: "Application not found",
      });
    }

    const messages = await knex("messages")
      .where({ application_id: id })
      .orderBy("created_at", "asc")
      .select("id", "sender_type", "message", "attachment_url", "is_read", "created_at");

    await knex("messages")
      .where({ application_id: id, sender_type: "AGENCY", is_read: false })
      .update({ is_read: true, read_at: knex.fn.now() });

    // Keep the bell in step: opening the thread clears its message notification.
    await markMessageNotificationsReadForApplication(req.session.userId, id);

    res.json({ success: true, data: messages });
  }),
);

/**
 * POST /api/talent/applications/:id/messages
 * Talent sends a message to the agency from inside the dashboard.
 */
router.post(
  "/:id/messages",
  requireRole("TALENT"),
  requireActiveAccount(),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const trimmed = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!trimmed) {
      return res
        .status(400)
        .json({ success: false, error: "Message required", message: "Message is required." });
    }
    if (trimmed.length > 4000) {
      return res
        .status(400)
        .json({ success: false, error: "Too long", message: "Message is too long." });
    }

    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found", message: "Profile not found" });
    }

    const application = await knex("applications")
      .where({ id, profile_id: profile.id })
      .first();
    if (!application) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
        message: "Application not found",
      });
    }

    const messageId = uuidv4();
    await knex("messages").insert({
      id: messageId,
      application_id: id,
      sender_id: req.session.userId,
      sender_type: "TALENT",
      message: trimmed,
      is_read: false,
      created_at: knex.fn.now(),
    });

    await logActivity(
      req,
      knex,
      id,
      application.agency_id,
      "message_sent",
      "Talent sent a message",
      { message_preview: trimmed.substring(0, 100), via: "dashboard" },
    );

    try {
      const talentName =
        [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
        profile.name ||
        "A talent";
      await notifyAgencyNewMessage({
        agencyId: application.agency_id,
        applicationId: id,
        talentName,
        preview: trimmed.substring(0, 80),
      });
    } catch (notifyErr) {
      console.error("[Applications] Message notification failed:", notifyErr);
    }

    const newMessage = await knex("messages").where({ id: messageId }).first();
    res.json({ success: true, data: newMessage });
  }),
);

/**
 * POST /api/talent/redirect-apply
 * Retired agency-invite write path. Canonical submissions go through /apply.
 */
router.post(
  "/redirect-apply",
  requireRole("TALENT"),
  (_req, res) =>
    res.status(410).json({
      success: false,
      error: "redirect_apply_retired",
      message:
        "Agency invite submissions must be reviewed and sent through the standard submission flow.",
      redirectTo: "/apply",
    }),
);

module.exports = router;
module.exports._test = {
  recordAdvisorySpecSnapshot,
};
