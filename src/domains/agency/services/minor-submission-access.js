"use strict";

const { hasPermission } = require("../lib/permissions");
const { getSessionAgencyId } = require("./context");
const config = require("../../../config");

const MINOR_SUBMISSION_PERMISSION = "talent.view_minor_submissions";
const MINOR_ACCESS_ERROR = "MINOR_SUBMISSION_ACCESS_DENIED";

// Audited agency surfaces that can expose or mutate a submitted minor's data.
// `application_guard` paths carry an application id and are blocked centrally;
// `filtered_collection` paths apply applyMinorSubmissionFilter at query time;
// roster paths additionally bind through source_application_id.
const MINOR_SUBMISSION_ENDPOINT_MATRIX = Object.freeze([
  ["GET", "/api/agency/applications", "filtered_collection"],
  ["GET", "/api/agency/applications/:applicationId/details", "application_guard"],
  ["GET", "/api/agency/applications/:applicationId/dossier", "application_guard"],
  ["GET", "/api/agency/applications/:applicationId/timeline", "application_guard"],
  ["PATCH", "/api/agency/applications/:applicationId/status", "application_guard"],
  ["POST", "/api/agency/applications/:applicationId/accept", "application_guard"],
  ["POST", "/api/agency/applications/:applicationId/decline", "application_guard"],
  ["POST", "/api/agency/applications/:applicationId/archive", "application_guard"],
  ["GET", "/api/agency/applications/:applicationId/messages", "application_guard"],
  ["POST", "/api/agency/applications/:applicationId/messages", "application_guard"],
  ["GET", "/api/agency/applications/:applicationId/notes", "application_guard"],
  ["POST", "/api/agency/applications/:applicationId/notes", "application_guard"],
  ["GET", "/api/agency/applications/:applicationId/tags", "application_guard"],
  ["POST", "/api/agency/applications/:applicationId/tags", "application_guard"],
  ["GET", "/api/agency/applications/:applicationId/interviews", "application_guard"],
  ["POST", "/api/agency/applications/:applicationId/interviews", "application_guard"],
  ["GET", "/api/agency/applications/:applicationId/reminders", "application_guard"],
  ["POST", "/api/agency/applications/:applicationId/reminders", "application_guard"],
  ["POST", "/api/agency/applications/:applicationId/assign-board", "application_guard"],
  ["GET", "/api/agency/messages/threads", "filtered_collection"],
  ["GET", "/api/agency/messages/unread-count", "filtered_collection"],
  ["GET", "/api/agency/activity", "filtered_collection"],
  ["GET", "/api/agency/analytics/season", "filtered_collection"],
  ["GET", "/api/agency/boards", "filtered_collection"],
  ["GET", "/api/agency/boards/:boardId/candidates", "filtered_collection"],
  ["POST", "/api/agency/boards/:boardId/rank", "filtered_collection"],
  ["POST", "/api/agency/boards/:boardId/candidates/:profileId/decision", "source_application_guard"],
  ["GET", "/api/agency/roster", "source_application_guard"],
  ["GET", "/api/agency/roster/:membershipId", "source_application_guard"],
  ["GET", "/api/agency/export", "admin_permission_and_filter"],
  ["POST", "/dashboard/agency/applications/:applicationId/:action", "application_guard"],
]);

function canViewMinorSubmissions(req) {
  return Boolean(
    req?.agencyPermissions &&
      hasPermission(req.agencyPermissions, MINOR_SUBMISSION_PERMISSION),
  );
}

function isGrantCurrent(row, now = Date.now()) {
  if (!row?.minor_at_submission) return true;
  if (row.minor_access_revoked_at || row.grant_revoked_at) return false;
  const expiresAt = new Date(
    row.guardian_consent_expires_at || row.authorization_expires_at,
  ).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
}

async function loadApplicationAccess(knex, agencyId, applicationId) {
  if (!agencyId || !applicationId) return null;
  return knex("applications as application")
    .leftJoin(
      "minor_agency_consents as grant",
      "grant.id",
      "application.guardian_consent_grant_id",
    )
    .where({
      "application.id": applicationId,
      "application.agency_id": agencyId,
    })
    .first(
      "application.id",
      "application.profile_id",
      "application.agency_id",
      "application.minor_at_submission",
      "application.guardian_consent_grant_id",
      "application.guardian_consent_expires_at",
      "application.minor_access_revoked_at",
      "application.minor_access_revocation_reason",
      "grant.revoked_at as grant_revoked_at",
      "grant.authorization_expires_at",
    );
}

async function getApplicationAccessDecision(
  knex,
  { agencyId, applicationId, allowMinor },
) {
  const row = await loadApplicationAccess(knex, agencyId, applicationId);
  if (!row) return { allowed: false, reason: "not_found", row: null };
  if (!row.minor_at_submission) return { allowed: true, reason: "adult", row };
  if (!allowMinor) {
    return { allowed: false, reason: "permission_required", row };
  }
  if (!isGrantCurrent(row)) {
    return {
      allowed: false,
      reason:
        row.minor_access_revocation_reason ||
        (row.grant_revoked_at ? "guardian_revoked" : "guardian_grant_expired"),
      row,
    };
  }
  return { allowed: true, reason: "guardian_authorized", row };
}

function applyMinorSubmissionFilter(
  query,
  { alias = "applications", allowMinor = false, force = false } = {},
) {
  // `force` is used by aggregate/report builders whose focused test schemas
  // explicitly carry the minor-access columns. It keeps the security contract
  // testable even though the global test runner disables enforcement for older
  // hand-built fixtures.
  if (!config.minorSubmissionEnforce && !force) return query;
  if (!allowMinor) {
    return query.where(`${alias}.minor_at_submission`, false);
  }
  const now = new Date().toISOString();
  return query.where((scope) => {
    scope.where(`${alias}.minor_at_submission`, false).orWhere((minor) => {
      minor
        .where(`${alias}.minor_at_submission`, true)
        .whereNull(`${alias}.minor_access_revoked_at`)
        .where(`${alias}.guardian_consent_expires_at`, ">", now);
    });
  });
}

async function purgeApplicationDisclosure(
  trx,
  applicationId,
  { reason = "guardian_revoked", revokedAt = new Date().toISOString() } = {},
) {
  // Preserve only the immutable provenance shell for note events; authored
  // content is no longer necessary once the guardian grant is revoked.
  if (await trx.schema.hasTable("application_note_audit_events")) {
    await trx("application_note_audit_events")
      .where({ application_id: applicationId })
      .update({ before_note: null, after_note: null });
  }

  const deletions = [
    "application_notes",
    "application_tags",
    "messages",
    "message_reply_tokens",
    "reminders",
    "interviews",
    "board_applications",
    "application_activities",
  ];
  for (const table of deletions) {
    if (await trx.schema.hasTable(table)) {
      await trx(table).where({ application_id: applicationId }).delete();
    }
  }

  if (await trx.schema.hasTable("application_submission_boards")) {
    await trx("application_submission_boards")
      .where({ application_id: applicationId })
      .delete();
  }
  if (await trx.schema.hasTable("notifications")) {
    await trx("notifications")
      .where({ source_type: "application", source_id: applicationId })
      .delete();
  }
  if (await trx.schema.hasTable("talent_submission_packages")) {
    await trx("talent_submission_packages")
      .where({ application_id: applicationId })
      .update({
        payload: JSON.stringify({
          redacted: true,
          reason,
          revokedAt,
        }),
        revoked_at: revokedAt,
        redacted_at: revokedAt,
        redaction_reason: reason,
      });
  }
  if (await trx.schema.hasTable("roster_memberships")) {
    await trx("roster_memberships")
      .where({ source_application_id: applicationId })
      .delete();
  }

  await trx("applications").where({ id: applicationId }).update({
    status: "withdrawn",
    minor_access_revoked_at: revokedAt,
    minor_access_revocation_reason: reason,
    updated_at: trx.fn.now(),
  });
}

async function revokeGrantAndPurge(
  knex,
  grantId,
  { reason = "guardian_revoked" } = {},
) {
  const revokedAt = new Date().toISOString();
  return knex.transaction(async (trx) => {
    let grantQuery = trx("minor_agency_consents").where({ id: grantId });
    if (trx.client.config.client === "pg") grantQuery = grantQuery.forUpdate();
    const grant = await grantQuery.first();
    if (!grant) return { ok: false, reason: "not_found", applicationIds: [] };

    const newlyRevoked = !grant.revoked_at;
    if (newlyRevoked) {
      await trx("minor_agency_consents").where({ id: grant.id }).update({
        revoked_at: revokedAt,
        revocation_reason: reason,
        updated_at: trx.fn.now(),
      });
    }

    const applications = await trx("applications")
      .where({ guardian_consent_grant_id: grant.id })
      .select("id", "minor_access_revoked_at");
    for (const application of applications) {
      if (!application.minor_access_revoked_at) {
        await purgeApplicationDisclosure(trx, application.id, {
          reason,
          revokedAt,
        });
      }
    }
    return {
      ok: true,
      alreadyRevoked: !newlyRevoked,
      grantId: grant.id,
      profileId: grant.profile_id,
      agencyId: grant.agency_id,
      applicationIds: applications.map((row) => row.id),
    };
  });
}

async function revokeProfileGrantsAndPurge(
  knex,
  profileId,
  { reason = "account_guardian_consent_revoked" } = {},
) {
  const revokedAt = new Date().toISOString();
  return knex.transaction(async (trx) => {
    let grantsQuery = trx("minor_agency_consents")
      .where({ profile_id: profileId })
      .whereNull("revoked_at");
    if (trx.client.config.client === "pg") grantsQuery = grantsQuery.forUpdate();
    const grants = await grantsQuery.select("id");
    const grantIds = grants.map((grant) => grant.id);
    if (grantIds.length) {
      await trx("minor_agency_consents").whereIn("id", grantIds).update({
        revoked_at: revokedAt,
        revocation_reason: reason,
        updated_at: trx.fn.now(),
      });
    }
    const applications = grantIds.length
      ? await trx("applications")
          .whereIn("guardian_consent_grant_id", grantIds)
          .select("id", "minor_access_revoked_at")
      : [];
    for (const application of applications) {
      if (!application.minor_access_revoked_at) {
        await purgeApplicationDisclosure(trx, application.id, {
          reason,
          revokedAt,
        });
      }
    }
    await trx("profiles").where({ id: profileId }).update({
      guardian_consent_at: null,
      updated_at: trx.fn.now(),
    });
    return {
      ok: true,
      profileId,
      grantIds,
      applicationIds: applications.map((application) => application.id),
    };
  });
}

async function expireMinorSubmissionAccessForAgency(knex, agencyId) {
  if (!agencyId) return [];
  /* ISO string, not a Date object. `guardian_consent_expires_at` is TEXT under
     SQLite, and binding a Date there makes node-sqlite3 stringify it as
     "Fri Jul 31 2026 …" — so the comparison runs lexicographically against an
     ISO timestamp and every unexpired grant looks expired ("2027-…" < "Fri").
     The sweep then purges a live minor submission and marks it withdrawn,
     which is destructive and irreversible. applyMinorSubmissionFilter above
     already compares against an ISO string; this is the same contract. */
  const now = new Date().toISOString();
  const expired = await knex("applications as application")
    .leftJoin(
      "minor_agency_consents as grant",
      "grant.id",
      "application.guardian_consent_grant_id",
    )
    .where({
      "application.agency_id": agencyId,
      "application.minor_at_submission": true,
    })
    .whereNull("application.minor_access_revoked_at")
    .where((scope) => {
      scope
        .whereNull("application.guardian_consent_grant_id")
        .orWhereNotNull("grant.revoked_at")
        .orWhere("application.guardian_consent_expires_at", "<=", now)
        .orWhereNull("application.guardian_consent_expires_at");
    })
    .select("application.id", "grant.revoked_at as grant_revoked_at");
  for (const application of expired) {
    await knex.transaction(async (trx) => {
      let claim = trx("applications")
        .where({ id: application.id })
        .whereNull("minor_access_revoked_at");
      if (trx.client.config.client === "pg") claim = claim.forUpdate();
      const current = await claim.first("id");
      if (!current) return;
      await purgeApplicationDisclosure(trx, application.id, {
        reason: application.grant_revoked_at
          ? "guardian_revoked"
          : "guardian_grant_expired",
      });
    });
  }
  return expired.map((row) => row.id);
}

function extractApplicationIds(req) {
  const ids = new Set();
  const path = String(req.originalUrl || req.url || "").split("?")[0];
  const single = path.match(/\/applications\/([^/]+)/);
  if (single && !single[1].startsWith("bulk-")) ids.add(single[1]);
  const bodyIds = req.body?.application_ids || req.body?.applicationIds;
  if (Array.isArray(bodyIds)) bodyIds.forEach((id) => ids.add(String(id)));
  return [...ids].filter(Boolean);
}

function enforceMinorSubmissionAccess(knex) {
  return async function minorSubmissionAccess(req, res, next) {
    if (req._minorSubmissionAccessChecked) return next();
    req._minorSubmissionAccessChecked = true;
    try {
      const agencyId = getSessionAgencyId(req.session);
      if (!agencyId) return next();
      await expireMinorSubmissionAccessForAgency(knex, agencyId);

      const allowMinor = canViewMinorSubmissions(req);
      req.allowMinorSubmissions = allowMinor;
      const applicationIds = extractApplicationIds(req);
      for (const applicationId of applicationIds) {
        const decision = await getApplicationAccessDecision(knex, {
          agencyId,
          applicationId,
          allowMinor,
        });
        if (decision.reason === "not_found") continue;
        if (!decision.allowed) {
          return res
            .status(decision.reason === "permission_required" ? 403 : 410)
            .json({
              error: MINOR_ACCESS_ERROR,
              message:
                decision.reason === "permission_required"
                  ? "You do not have permission to access minor submissions."
                  : "Guardian authorization for this minor submission is no longer active.",
              reason: decision.reason,
            });
        }
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  MINOR_SUBMISSION_ENDPOINT_MATRIX,
  MINOR_SUBMISSION_PERMISSION,
  MINOR_ACCESS_ERROR,
  canViewMinorSubmissions,
  isGrantCurrent,
  loadApplicationAccess,
  getApplicationAccessDecision,
  applyMinorSubmissionFilter,
  purgeApplicationDisclosure,
  revokeGrantAndPurge,
  revokeProfileGrantsAndPurge,
  expireMinorSubmissionAccessForAgency,
  extractApplicationIds,
  enforceMinorSubmissionAccess,
};
