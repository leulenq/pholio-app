"use strict";

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../../shared/db/knex");
const firebaseAdmin = require("../../auth/services/firebase-admin");
const email = require("../../../shared/lib/email");
const config = require("../../../config");
const {
  provisionAgencyForUser,
} = require("../../agency/services/provisioning");

const REVIEW_STATUSES = Object.freeze({
  SUBMITTED: "submitted",
  TRIAGE: "triage",
  NEEDS_INFO: "needs_info",
  QUALIFICATION_CALL: "qualification_call",
  APPROVED: "approved",
  DECLINED: "declined",
});

const OPEN_STATUSES = [
  REVIEW_STATUSES.SUBMITTED,
  REVIEW_STATUSES.TRIAGE,
  REVIEW_STATUSES.NEEDS_INFO,
  REVIEW_STATUSES.QUALIFICATION_CALL,
];

function domainError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function parseJson(value, fallback = []) {
  if (value == null || value === "") return fallback;
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function requestDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    agencyName: row.agency_name,
    websiteUrl: row.website_url,
    primaryMarketCity: row.primary_market_city,
    primaryMarketCountry: row.primary_market_country,
    additionalLocations: parseJson(row.additional_locations),
    agencyType: row.agency_type,
    primaryBoards: parseJson(row.primary_boards),
    rosterSizeRange: row.roster_size_range,
    teamSizeRange: row.team_size_range,
    currentSystem: row.current_system,
    firstUseCases: parseJson(row.first_use_cases),
    migrationInterest: row.migration_interest,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactRole: row.contact_role,
    contactPhone: row.contact_phone,
    timezone: row.timezone,
    heardFrom: row.heard_from,
    notes: row.notes,
    status: row.status,
    reviewerUserId: row.reviewer_user_id,
    reviewNotesInternal: row.review_notes_internal,
    qualificationCallAt: row.qualification_call_at,
    approvedAt: row.approved_at,
    declinedAt: row.declined_at,
    provisionedAgencyId: row.provisioned_agency_id,
    provisionedOwnerUserId: row.provisioned_owner_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function eventDto(row) {
  return {
    id: row.id,
    eventType: row.event_type,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    previousStatus: row.previous_status,
    nextStatus: row.next_status,
    provisionedAgencyId: row.provisioned_agency_id,
    provisionedOwnerUserId: row.provisioned_owner_user_id,
    metadata: parseJson(row.metadata, {}),
    createdAt: row.created_at,
  };
}

function mergeReviewNotes(previous, next) {
  const clean = typeof next === "string" ? next.trim() : "";
  if (!clean) return previous || null;
  return previous ? `${previous}\n\n${clean}` : clean;
}

function splitContactName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || null,
    lastName: parts.length ? parts.join(" ") : null,
  };
}

async function recordEvent(trx, {
  request,
  actor,
  eventType,
  previousStatus,
  nextStatus,
  metadata = {},
  agencyId = null,
  ownerUserId = null,
}) {
  await trx("agency_access_request_events").insert({
    id: uuidv4(),
    request_id: request.id,
    actor_user_id: actor.userId,
    actor_email: actor.email || null,
    event_type: eventType,
    previous_status: previousStatus || null,
    next_status: nextStatus || null,
    provisioned_agency_id: agencyId,
    provisioned_owner_user_id: ownerUserId,
    source_ip: actor.ip || null,
    metadata: JSON.stringify(metadata),
    created_at: trx.fn.now(),
  });
}

function createAgencyRequestReviewService({
  db = knex,
  identity = firebaseAdmin,
  emailService = email,
  provisionAgency = provisionAgencyForUser,
} = {}) {
  async function listRequests({ status, limit = 50, offset = 0 } = {}) {
    const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const boundedOffset = Math.max(Number(offset) || 0, 0);
    const applyFilters = (query) => {
      if (status) query.where("status", status);
      return query;
    };

    const rowsQuery = applyFilters(db("agency_access_requests"))
      .orderBy("created_at", "desc")
      .limit(boundedLimit)
      .offset(boundedOffset);
    const countQuery = applyFilters(
      db("agency_access_requests").count("id as count"),
    ).first();
    const [rows, countRow] = await Promise.all([rowsQuery, countQuery]);

    return {
      items: rows.map(requestDto),
      pagination: {
        limit: boundedLimit,
        offset: boundedOffset,
        total: Number(countRow?.count || 0),
      },
    };
  }

  async function getRequest(requestId) {
    const [row, events] = await Promise.all([
      db("agency_access_requests").where({ id: requestId }).first(),
      db("agency_access_request_events")
        .where({ request_id: requestId })
        .orderBy("created_at", "asc"),
    ]);
    if (!row) {
      throw domainError("AGENCY_REQUEST_NOT_FOUND", "Agency request not found.", 404);
    }
    return { ...requestDto(row), events: events.map(eventDto) };
  }

  async function scheduleQualificationCall(requestId, { callAt, notes, actor }) {
    const callDate = new Date(callAt);
    if (!callAt || Number.isNaN(callDate.getTime())) {
      throw domainError(
        "INVALID_QUALIFICATION_CALL_TIME",
        "Provide a valid qualification call time.",
      );
    }

    await db.transaction(async (trx) => {
      const request = await trx("agency_access_requests")
        .where({ id: requestId })
        .forUpdate()
        .first();
      if (!request) {
        throw domainError("AGENCY_REQUEST_NOT_FOUND", "Agency request not found.", 404);
      }
      if (!OPEN_STATUSES.includes(request.status)) {
        throw domainError(
          "AGENCY_REQUEST_NOT_OPEN",
          "Only an open request can be moved to a qualification call.",
          409,
        );
      }

      await trx("agency_access_requests").where({ id: requestId }).update({
        status: REVIEW_STATUSES.QUALIFICATION_CALL,
        reviewer_user_id: actor.userId,
        review_notes_internal: mergeReviewNotes(request.review_notes_internal, notes),
        qualification_call_at: callDate,
        updated_at: trx.fn.now(),
      });
      await recordEvent(trx, {
        request,
        actor,
        eventType: "qualification_call_scheduled",
        previousStatus: request.status,
        nextStatus: REVIEW_STATUSES.QUALIFICATION_CALL,
        metadata: { callAt: callDate.toISOString() },
      });
    });
    return getRequest(requestId);
  }

  async function ensureIdentityForRequest(request) {
    const normalizedEmail = request.contact_email.trim().toLowerCase();
    let identityUser = await identity.getUserByEmail(normalizedEmail);
    let created = false;
    if (!identityUser) {
      // The random password is never exposed or sent. The owner receives a
      // single Firebase password-setup link after the DB transaction commits.
      const randomPassword = crypto.randomBytes(32).toString("base64url");
      identityUser = await identity.createUser(normalizedEmail, randomPassword, {
        displayName: request.contact_name || request.agency_name,
        // The random password is not disclosed. Ownership of this inbox is
        // established by redeeming the password-setup link we send below, so
        // the resulting Firebase session can pass Pholio's verified-email gate.
        emailVerified: true,
      });
      created = true;
    }
    return { identityUser, created, normalizedEmail };
  }

  /**
   * Issue the one-time activation link.
   *
   * The account was created during approval with a password that was never
   * disclosed, so this link is how the owner sets a real one for the first
   * time. It is a Firebase action link underneath, but the agency must never
   * be told to "reset" a password they have never had — that is why this sends
   * the activation template rather than sendPasswordResetEmail, and why it is
   * a single email rather than an activation plus a separate welcome.
   */
  async function deliverApprovalInvite({ request, ownerUser }) {
    const activationUrl = await identity.generatePasswordResetLink(ownerUser.email, {
      url: `${config.appUrl || "https://app.pholio.studio"}/login`,
      handleCodeInApp: false,
    });
    await emailService.sendAgencyActivationEmail({
      to: ownerUser.email,
      contactName: request.contact_name,
      agencyName: request.agency_name,
      activationUrl,
      expiresMinutes: 60,
    });
  }

  /**
   * Re-issue the activation link for an already-approved request.
   *
   * Delivery can fail (recorded as `approval_invitation_failed`) or the link
   * can simply lapse, and without this an approved agency has no way back in.
   * Re-approving is not an option — approval is idempotent and returns early.
   */
  async function resendApprovalInvite(requestId, { actor }) {
    const request = await db("agency_access_requests")
      .where({ id: requestId })
      .first();
    if (!request) {
      throw domainError("AGENCY_REQUEST_NOT_FOUND", "Agency request not found.", 404);
    }
    if (request.status !== REVIEW_STATUSES.APPROVED) {
      throw domainError(
        "AGENCY_REQUEST_NOT_APPROVED",
        "Only an approved request can have its activation link re-sent.",
        409,
      );
    }

    const ownerUser = await db("users")
      .where({ id: request.provisioned_owner_user_id })
      .first();
    if (!ownerUser) {
      throw domainError(
        "AGENCY_OWNER_NOT_PROVISIONED",
        "This request has no provisioned owner to send an activation link to.",
        409,
      );
    }

    try {
      await deliverApprovalInvite({ request, ownerUser });
    } catch (error) {
      await db.transaction((trx) =>
        recordEvent(trx, {
          request,
          actor,
          eventType: "approval_invitation_failed",
          previousStatus: REVIEW_STATUSES.APPROVED,
          nextStatus: REVIEW_STATUSES.APPROVED,
          agencyId: request.provisioned_agency_id,
          ownerUserId: ownerUser.id,
          metadata: { reason: "delivery_failed", resend: true },
        }),
      );
      throw domainError(
        "ACTIVATION_DELIVERY_FAILED",
        "The activation link could not be delivered.",
        502,
      );
    }

    await db.transaction((trx) =>
      recordEvent(trx, {
        request,
        actor,
        eventType: "approval_invitation_sent",
        previousStatus: REVIEW_STATUSES.APPROVED,
        nextStatus: REVIEW_STATUSES.APPROVED,
        agencyId: request.provisioned_agency_id,
        ownerUserId: ownerUser.id,
        metadata: { resend: true },
      }),
    );

    return getRequest(requestId);
  }

  async function approveRequest(requestId, { notes, actor }) {
    const initialRequest = await db("agency_access_requests")
      .where({ id: requestId })
      .first();
    if (!initialRequest) {
      throw domainError("AGENCY_REQUEST_NOT_FOUND", "Agency request not found.", 404);
    }
    if (initialRequest.status === REVIEW_STATUSES.APPROVED) {
      return { request: await getRequest(requestId), invitationDelivered: null };
    }
    if (!OPEN_STATUSES.includes(initialRequest.status)) {
      throw domainError(
        "AGENCY_REQUEST_NOT_OPEN",
        "Only an open request can be approved.",
        409,
      );
    }

    const identityResult = await ensureIdentityForRequest(initialRequest);
    let ownerUser;
    let agency;
    try {
      ({ ownerUser, agency } = await db.transaction(async (trx) => {
        const request = await trx("agency_access_requests")
          .where({ id: requestId })
          .forUpdate()
          .first();
        if (!request) {
          throw domainError("AGENCY_REQUEST_NOT_FOUND", "Agency request not found.", 404);
        }
        if (request.status === REVIEW_STATUSES.APPROVED) {
          const existingOwner = await trx("users")
            .where({ id: request.provisioned_owner_user_id })
            .first();
          const existingAgency = await trx("agencies")
            .where({ id: request.provisioned_agency_id })
            .first();
          return { ownerUser: existingOwner, agency: existingAgency };
        }
        if (!OPEN_STATUSES.includes(request.status)) {
          throw domainError(
            "AGENCY_REQUEST_NOT_OPEN",
            "Only an open request can be approved.",
            409,
          );
        }

        let localUser = await trx("users")
          .whereRaw("LOWER(email) = ?", [identityResult.normalizedEmail])
          .first();
        if (localUser && localUser.role !== "AGENCY") {
          throw domainError(
            "CONTACT_EMAIL_ALREADY_USED",
            "This contact email belongs to a non-agency account and requires manual resolution.",
            409,
          );
        }
        const names = splitContactName(request.contact_name);
        if (!localUser) {
          const localUserId = uuidv4();
          await trx("users").insert({
            id: localUserId,
            email: identityResult.normalizedEmail,
            password_hash: null,
            firebase_uid: identityResult.identityUser.uid,
            role: "AGENCY",
            first_name: names.firstName,
            last_name: names.lastName,
            created_at: trx.fn.now(),
          });
          localUser = await trx("users").where({ id: localUserId }).first();
        } else if (!localUser.firebase_uid) {
          await trx("users").where({ id: localUser.id }).update({
            firebase_uid: identityResult.identityUser.uid,
          });
          localUser.firebase_uid = identityResult.identityUser.uid;
        }

        const provisionedAgency = await provisionAgency({
          userId: localUser.id,
          agencyName: request.agency_name,
          location: [request.primary_market_city, request.primary_market_country]
            .filter(Boolean)
            .join(", "),
          website: request.website_url,
          db: trx,
        });
        await trx("agencies").where({ id: provisionedAgency.id }).update({
          agency_type: request.agency_type,
          support_email: identityResult.normalizedEmail,
          updated_at: trx.fn.now(),
        });

        await trx("agency_access_requests").where({ id: requestId }).update({
          status: REVIEW_STATUSES.APPROVED,
          reviewer_user_id: actor.userId,
          review_notes_internal: mergeReviewNotes(request.review_notes_internal, notes),
          approved_at: trx.fn.now(),
          declined_at: null,
          provisioned_agency_id: provisionedAgency.id,
          provisioned_owner_user_id: localUser.id,
          updated_at: trx.fn.now(),
        });
        await recordEvent(trx, {
          request,
          actor,
          eventType: "approved_and_provisioned",
          previousStatus: request.status,
          nextStatus: REVIEW_STATUSES.APPROVED,
          agencyId: provisionedAgency.id,
          ownerUserId: localUser.id,
          metadata: { invitationPending: true },
        });
        return { ownerUser: localUser, agency: provisionedAgency };
      }));
    } catch (error) {
      if (identityResult.created && identityResult.identityUser?.uid) {
        await identity.deleteUser(identityResult.identityUser.uid).catch(() => {});
      }
      throw error;
    }

    let invitationDelivered = true;
    try {
      await deliverApprovalInvite({ request: initialRequest, ownerUser });
      await db.transaction((trx) =>
        recordEvent(trx, {
          request: initialRequest,
          actor,
          eventType: "approval_invitation_sent",
          previousStatus: REVIEW_STATUSES.APPROVED,
          nextStatus: REVIEW_STATUSES.APPROVED,
          agencyId: agency.id,
          ownerUserId: ownerUser.id,
        }),
      );
    } catch (error) {
      invitationDelivered = false;
      await db.transaction((trx) =>
        recordEvent(trx, {
          request: initialRequest,
          actor,
          eventType: "approval_invitation_failed",
          previousStatus: REVIEW_STATUSES.APPROVED,
          nextStatus: REVIEW_STATUSES.APPROVED,
          agencyId: agency.id,
          ownerUserId: ownerUser.id,
          metadata: { reason: "delivery_failed" },
        }),
      );
    }

    return {
      request: await getRequest(requestId),
      invitationDelivered,
    };
  }

  async function declineRequest(requestId, { notes, actor }) {
    await db.transaction(async (trx) => {
      const request = await trx("agency_access_requests")
        .where({ id: requestId })
        .forUpdate()
        .first();
      if (!request) {
        throw domainError("AGENCY_REQUEST_NOT_FOUND", "Agency request not found.", 404);
      }
      if (request.status === REVIEW_STATUSES.DECLINED) return;
      if (request.status === REVIEW_STATUSES.APPROVED) {
        throw domainError(
          "APPROVED_REQUEST_CANNOT_BE_DECLINED",
          "An approved request cannot be declined.",
          409,
        );
      }
      await trx("agency_access_requests").where({ id: requestId }).update({
        status: REVIEW_STATUSES.DECLINED,
        reviewer_user_id: actor.userId,
        review_notes_internal: mergeReviewNotes(request.review_notes_internal, notes),
        declined_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
      await recordEvent(trx, {
        request,
        actor,
        eventType: "declined",
        previousStatus: request.status,
        nextStatus: REVIEW_STATUSES.DECLINED,
        metadata: { reason: notes },
      });
    });
    return getRequest(requestId);
  }

  return {
    listRequests,
    getRequest,
    scheduleQualificationCall,
    approveRequest,
    resendApprovalInvite,
    declineRequest,
  };
}

module.exports = {
  REVIEW_STATUSES,
  OPEN_STATUSES,
  createAgencyRequestReviewService,
  agencyRequestReviewService: createAgencyRequestReviewService(),
};
