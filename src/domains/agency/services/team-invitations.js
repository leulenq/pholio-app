const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../../shared/db/knex");

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hashInvitationToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function createRawInvitationToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function isInvitationUsable(invitation, now = new Date()) {
  const rawExpiry = invitation?.expires_at;
  const expiryMillis =
    typeof rawExpiry === "string" && /^\d+$/.test(rawExpiry)
      ? Number(rawExpiry)
      : new Date(rawExpiry).getTime();
  return Boolean(
    invitation &&
      !invitation.accepted_at &&
      !invitation.revoked_at &&
      Number.isFinite(expiryMillis) &&
      expiryMillis > now.getTime(),
  );
}

async function loadTeamInvitation(rawToken, db = knex) {
  if (!rawToken || String(rawToken).length > 512) return null;
  const tokenHash = hashInvitationToken(rawToken);
  const invitation = await db("agency_team_invitations as invitation")
    .join("agencies as agency", "agency.id", "invitation.agency_id")
    .where("invitation.token_hash", tokenHash)
    .select(
      "invitation.*",
      "agency.name as agency_name",
      "agency.status as agency_status",
      "agency.onboarding_completed_at as agency_onboarding_completed_at",
    )
    .first();

  if (!isInvitationUsable(invitation) || invitation.agency_status !== "ACTIVE") {
    return null;
  }
  return invitation;
}

async function createTeamInvitation({
  db = knex,
  agencyId,
  email,
  membershipRole,
  invitedByUserId = null,
  invitedByMembershipId = null,
  expiresAt = new Date(Date.now() + INVITATION_TTL_MS),
}) {
  const normalizedEmail = normalizeEmail(email);
  const rawToken = createRawInvitationToken();
  const now = db.fn.now();

  await db("agency_team_invitations")
    .where({ agency_id: agencyId, email: normalizedEmail })
    .whereNull("accepted_at")
    .whereNull("revoked_at")
    .update({ revoked_at: now, updated_at: now });

  const row = {
    id: uuidv4(),
    agency_id: agencyId,
    email: normalizedEmail,
    membership_role: membershipRole,
    token_hash: hashInvitationToken(rawToken),
    invited_by_user_id: invitedByUserId,
    invited_by_membership_id: invitedByMembershipId,
    expires_at: new Date(expiresAt).toISOString(),
    created_at: now,
    updated_at: now,
  };
  await db("agency_team_invitations").insert(row);
  return { invitation: row, rawToken };
}

async function acceptTeamInvitation({
  db = knex,
  rawToken,
  userId,
  email,
  emailVerified,
}) {
  if (!emailVerified) {
    const error = new Error("Verify your email before accepting this invitation.");
    error.code = "INVITATION_EMAIL_UNVERIFIED";
    throw error;
  }

  const normalizedEmail = normalizeEmail(email);
  const tokenHash = hashInvitationToken(rawToken);
  let query = db("agency_team_invitations")
    .where({ token_hash: tokenHash })
    .first();
  if (["pg", "postgresql"].includes(db.client.config.client)) {
    query = query.forUpdate();
  }
  const invitation = await query;

  if (!isInvitationUsable(invitation)) {
    const error = new Error("This invitation is invalid, expired, or has already been used.");
    error.code = "INVITATION_INVALID";
    throw error;
  }
  if (normalizeEmail(invitation.email) !== normalizedEmail) {
    const error = new Error("Sign in with the email address that received this invitation.");
    error.code = "INVITATION_EMAIL_MISMATCH";
    throw error;
  }

  const agency = await db("agencies")
    .where({ id: invitation.agency_id, status: "ACTIVE" })
    .first();
  if (!agency) {
    const error = new Error("This agency workspace is not available.");
    error.code = "INVITATION_AGENCY_UNAVAILABLE";
    throw error;
  }

  const existingMembership = await db("agency_memberships")
    .where({ agency_id: invitation.agency_id, user_id: userId })
    .first();
  const now = db.fn.now();
  if (existingMembership) {
    await db("agency_memberships").where({ id: existingMembership.id }).update({
      membership_role: invitation.membership_role,
      status: "ACTIVE",
      invited_at: existingMembership.invited_at || now,
      joined_at: now,
      updated_at: now,
    });
  } else {
    await db("agency_memberships").insert({
      id: uuidv4(),
      agency_id: invitation.agency_id,
      user_id: userId,
      membership_role: invitation.membership_role,
      status: "ACTIVE",
      invited_at: invitation.created_at || now,
      joined_at: now,
      created_at: now,
      updated_at: now,
    });
  }

  const consumed = await db("agency_team_invitations")
    .where({ id: invitation.id, token_hash: tokenHash })
    .whereNull("accepted_at")
    .whereNull("revoked_at")
    .update({ accepted_at: now, accepted_by_user_id: userId, updated_at: now });
  if (consumed !== 1) {
    const error = new Error("This invitation has already been used.");
    error.code = "INVITATION_INVALID";
    throw error;
  }

  return { ...invitation, agency };
}

module.exports = {
  INVITATION_TTL_MS,
  acceptTeamInvitation,
  createTeamInvitation,
  hashInvitationToken,
  isInvitationUsable,
  loadTeamInvitation,
  normalizeEmail,
};
