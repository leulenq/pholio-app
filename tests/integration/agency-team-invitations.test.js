"use strict";

process.env.DATABASE_URL = "sqlite://./test-agency-team-invitations.sqlite3";
process.env.DB_CLIENT = "sqlite3";

const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../src/shared/db/knex");
const {
  acceptTeamInvitation,
  createTeamInvitation,
  hashInvitationToken,
  loadTeamInvitation,
} = require("../../src/domains/agency/services/team-invitations");

const DB_PATH = path.resolve(__dirname, "../../test-agency-team-invitations.sqlite3");
const AGENCY_ID = uuidv4();
const OWNER_ID = uuidv4();
const OWNER_MEMBERSHIP_ID = uuidv4();

beforeAll(async () => {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  await knex.schema.createTable("agencies", (table) => {
    table.string("id", 36).primary();
    table.string("name").notNullable();
    table.string("status").notNullable();
    table.timestamp("onboarding_completed_at").nullable();
  });
  await knex.schema.createTable("users", (table) => {
    table.string("id", 36).primary();
    table.string("email").notNullable().unique();
    table.string("role").notNullable();
  });
  await knex.schema.createTable("agency_memberships", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("user_id", 36).notNullable();
    table.string("membership_role").notNullable();
    table.string("status").notNullable();
    table.timestamp("invited_at").nullable();
    table.timestamp("joined_at").nullable();
    table.timestamp("created_at").nullable();
    table.timestamp("updated_at").nullable();
    table.unique(["agency_id", "user_id"]);
  });
  await knex.schema.createTable("agency_team_invitations", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("email", 320).notNullable();
    table.string("membership_role", 32).notNullable();
    table.string("token_hash", 64).notNullable().unique();
    table.string("invited_by_user_id", 36).nullable();
    table.string("invited_by_membership_id", 36).nullable();
    table.timestamp("expires_at").notNullable();
    table.timestamp("accepted_at").nullable();
    table.string("accepted_by_user_id", 36).nullable();
    table.timestamp("revoked_at").nullable();
    table.timestamp("created_at").nullable();
    table.timestamp("updated_at").nullable();
  });

  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Invitation Test Agency",
    status: "ACTIVE",
    onboarding_completed_at: knex.fn.now(),
  });
  await knex("users").insert({
    id: OWNER_ID,
    email: "owner@example.test",
    role: "AGENCY",
  });
  await knex("agency_memberships").insert({
    id: OWNER_MEMBERSHIP_ID,
    agency_id: AGENCY_ID,
    user_id: OWNER_ID,
    membership_role: "OWNER",
    status: "ACTIVE",
  });
});

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
});

async function issue(email = "invitee@example.test", overrides = {}) {
  return createTeamInvitation({
    agencyId: AGENCY_ID,
    email,
    membershipRole: "AGENT",
    invitedByUserId: OWNER_ID,
    invitedByMembershipId: OWNER_MEMBERSHIP_ID,
    ...overrides,
  });
}

test("persists only a hash and resolves a valid invitation", async () => {
  const { invitation, rawToken } = await issue();
  const stored = await knex("agency_team_invitations").where({ id: invitation.id }).first();

  expect(stored.token_hash).toBe(hashInvitationToken(rawToken));
  expect(JSON.stringify(stored)).not.toContain(rawToken);
  await expect(loadTeamInvitation(rawToken)).resolves.toMatchObject({
    id: invitation.id,
    agency_name: "Invitation Test Agency",
  });
});

test("acceptance is email-bound, verified, atomic, and single-use", async () => {
  const email = "booker@example.test";
  const userId = uuidv4();
  await knex("users").insert({ id: userId, email, role: "AGENCY" });
  const { rawToken } = await issue(email);

  await expect(
    acceptTeamInvitation({
      rawToken,
      userId,
      email: "wrong@example.test",
      emailVerified: true,
    }),
  ).rejects.toMatchObject({ code: "INVITATION_EMAIL_MISMATCH" });
  await expect(
    acceptTeamInvitation({ rawToken, userId, email, emailVerified: false }),
  ).rejects.toMatchObject({ code: "INVITATION_EMAIL_UNVERIFIED" });

  await knex.transaction((trx) =>
    acceptTeamInvitation({ db: trx, rawToken, userId, email, emailVerified: true }),
  );
  await expect(
    acceptTeamInvitation({ rawToken, userId, email, emailVerified: true }),
  ).rejects.toMatchObject({ code: "INVITATION_INVALID" });

  await expect(
    knex("agency_memberships")
      .where({ agency_id: AGENCY_ID, user_id: userId })
      .first(),
  ).resolves.toMatchObject({ membership_role: "AGENT", status: "ACTIVE" });
});

test("expired invitations fail closed", async () => {
  const { rawToken } = await issue("expired@example.test", {
    expiresAt: new Date(Date.now() - 1000),
  });
  await expect(loadTeamInvitation(rawToken)).resolves.toBeNull();
});
