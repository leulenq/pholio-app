"use strict";

process.env.NODE_ENV = "test";
process.env.DB_CLIENT = "sqlite3";
process.env.DATABASE_URL = "sqlite://./test-agency-login-session-rotation.sqlite3";

const fs = require("fs");
const path = require("path");
const cookieSig = require("cookie-signature");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

const FIREBASE_UID = "firebase-agency-session-rotation";
jest.mock("../../src/domains/auth/services/firebase-admin", () => ({
  initializeFirebaseAdmin: jest.fn(),
  verifyIdToken: jest.fn(async () => ({
    uid: FIREBASE_UID,
    email: "agency-session-rotation@example.com",
    email_verified: true,
    name: "Rotation Owner",
  })),
  createUser: jest.fn(),
  getUserByEmail: jest.fn(),
}));

const TEST_DB_PATH = path.resolve(
  __dirname,
  "../../test-agency-login-session-rotation.sqlite3",
);
if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const { sessionSecret } = require("../../src/config");
const firebaseAdmin = require("../../src/domains/auth/services/firebase-admin");
const {
  createTeamInvitation,
} = require("../../src/domains/agency/services/team-invitations");

const AGENCY_ID = uuidv4();
const MEMBER_USER_ID = uuidv4();
const MEMBERSHIP_ID = uuidv4();
const OLD_SESSION_ID = `fixed-${uuidv4()}`;

function signedSessionCookie(sessionId) {
  const signed = `s:${cookieSig.sign(sessionId, sessionSecret)}`;
  return `connect.sid=${encodeURIComponent(signed)}`;
}

function sessionIdFromSetCookie(setCookie) {
  const cookie = setCookie.find((value) => value.startsWith("connect.sid="));
  const encoded = cookie.split(";", 1)[0].slice("connect.sid=".length);
  const signed = decodeURIComponent(encoded);
  return cookieSig.unsign(signed.slice(2), sessionSecret);
}

beforeAll(async () => {
  await knex.migrate.latest();

  await knex("users").insert({
    id: MEMBER_USER_ID,
    email: "agency-session-rotation@example.com",
    password_hash: "firebase-authenticated-account",
    firebase_uid: FIREBASE_UID,
    email_verified: true,
    role: "AGENCY",
  });
  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Session Rotation Agency",
    status: "ACTIVE",
    onboarding_completed_at: new Date().toISOString(),
  });
  await knex("agency_memberships").insert({
    id: MEMBERSHIP_ID,
    agency_id: AGENCY_ID,
    user_id: MEMBER_USER_ID,
    membership_role: "OWNER",
    status: "ACTIVE",
    joined_at: new Date().toISOString(),
  });
  await knex("sessions").insert({
    sid: OLD_SESSION_ID,
    sess: JSON.stringify({
      cookie: { path: "/", httpOnly: true, secure: false },
      preAuthMarker: "attacker-known-session",
    }),
    expired: new Date(Date.now() + 60_000).toISOString(),
  });
}, 120000);

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe("agency login session fixation protection", () => {
  test("POST /api/login destroys the pre-auth session and issues a new authenticated id", async () => {
    const response = await request(app)
      .post("/api/login")
      .set("Cookie", signedSessionCookie(OLD_SESSION_ID))
      .send({
        firebase_token: "verified-agency-id-token",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.headers["set-cookie"]).toBeDefined();

    const newSessionId = sessionIdFromSetCookie(response.headers["set-cookie"]);
    expect(newSessionId).toBeTruthy();
    expect(newSessionId).not.toBe(OLD_SESSION_ID);

    expect(
      await knex("sessions").where({ sid: OLD_SESSION_ID }).first(),
    ).toBeUndefined();

    const persisted = await knex("sessions").where({ sid: newSessionId }).first();
    const session = JSON.parse(persisted.sess);
    expect(session).toEqual(
      expect.objectContaining({
        userId: AGENCY_ID,
        memberUserId: MEMBER_USER_ID,
        agencyId: AGENCY_ID,
        agencyMembershipId: MEMBERSHIP_ID,
        role: "AGENCY",
      }),
    );
    expect(session.preAuthMarker).toBeUndefined();
  });

  test("a verified invitee is provisioned only into the vetted workspace and the link cannot replay", async () => {
    const email = "invited-booker@example.com";
    const uid = "firebase-invited-booker";
    const { invitation, rawToken } = await createTeamInvitation({
      agencyId: AGENCY_ID,
      email,
      membershipRole: "AGENT",
      invitedByUserId: MEMBER_USER_ID,
      invitedByMembershipId: MEMBERSHIP_ID,
    });
    firebaseAdmin.verifyIdToken.mockResolvedValue({
      uid,
      email,
      email_verified: true,
      name: "Invited Booker",
    });

    const accepted = await request(app).post("/api/login").send({
      firebase_token: "verified-invited-booker-token",
      invite_token: rawToken,
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({
      success: true,
      redirect: "/dashboard/agency",
    });

    const user = await knex("users").where({ firebase_uid: uid }).first();
    expect(user).toMatchObject({ email, role: "AGENCY" });
    await expect(
      knex("agency_memberships")
        .where({ agency_id: AGENCY_ID, user_id: user.id })
        .first(),
    ).resolves.toMatchObject({ membership_role: "AGENT", status: "ACTIVE" });
    await expect(
      knex("agency_team_invitations").where({ id: invitation.id }).first(),
    ).resolves.toEqual(expect.objectContaining({ accepted_by_user_id: user.id }));

    const replay = await request(app).post("/api/login").send({
      firebase_token: "verified-invited-booker-token",
      invite_token: rawToken,
    });
    expect(replay.status).toBe(403);
  });
});
