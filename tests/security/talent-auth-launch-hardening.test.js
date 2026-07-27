"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const TEST_DB_PATH = path.join(
  os.tmpdir(),
  `pholio-talent-auth-launch-${process.pid}-${Date.now()}.sqlite3`,
);

// This suite is safe to run only through scripts/run-jest.js. Set these before
// importing config/Knex so no developer .env database or SMTP settings leak in.
process.env.NODE_ENV = "test";
process.env.DB_CLIENT = "sqlite3";
process.env.DATABASE_URL = `sqlite://${TEST_DB_PATH}`;
process.env.CSRF_ENFORCE = "1";
process.env.SMTP_HOST = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";

for (const suffix of ["", "-journal", "-shm", "-wal"]) {
  fs.rmSync(`${TEST_DB_PATH}${suffix}`, { force: true });
}

const authToken = { value: null };
jest.mock("../../src/domains/auth/services/firebase-admin", () => ({
  initializeFirebaseAdmin: jest.fn(),
  verifyIdToken: jest.fn(() => Promise.resolve(authToken.value)),
  createUser: jest.fn(),
  getUserByEmail: jest.fn(),
  revokeRefreshTokens: jest.fn(),
}));

const knex = require("../../src/shared/db/knex");
const authRoutes = require("../../src/domains/auth/routes/auth");
const {
  requireTalentDashboardEligibility,
} = require("../../src/domains/auth/middleware/require-auth");

function removeDbFiles() {
  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    fs.rmSync(`${TEST_DB_PATH}${suffix}`, { force: true });
  }
}

function firebaseIdentity({ uid, email, emailVerified }) {
  authToken.value = {
    uid,
    email,
    email_verified: emailVerified,
    name: "Launch Test",
  };
}

function createResponse(onComplete) {
  const response = {
    locals: {},
    statusCode: 200,
    body: undefined,
    redirectUrl: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      onComplete?.();
      return this;
    },
    redirect(url) {
      this.redirectUrl = url;
      onComplete?.();
      return this;
    },
    render(_view, body) {
      this.body = body;
      onComplete?.();
      return this;
    },
  };
  return response;
}

function createSession(req) {
  const session = {};
  session.regenerate = (callback) => {
    req.session = createSession(req);
    callback();
  };
  session.save = (callback) => callback();
  return session;
}

function invokeLogin() {
  return new Promise((resolve, reject) => {
    const req = {
      method: "POST",
      url: "/api/login",
      originalUrl: "/api/login",
      path: "/api/login",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: { firebase_token: "test-token" },
      get(name) {
        return this.headers[String(name).toLowerCase()];
      },
    };
    req.session = createSession(req);
    let res;
    res = createResponse(() => resolve({ req, res }));

    authRoutes.handle(req, res, (error) => {
      if (error) reject(error);
      else resolve({ req, res });
    });
  });
}

function invokeTalentDashboardEligibility(session) {
  return new Promise((resolve, reject) => {
    const req = {
      session,
      originalUrl: "/api/talent/profile",
      path: "/api/talent/profile",
      headers: { accept: "application/json" },
      get(name) {
        return this.headers[String(name).toLowerCase()];
      },
    };
    let res;
    res = createResponse(() => resolve({ req, res, passed: false }));
    requireTalentDashboardEligibility()(req, res, (error) => {
      if (error) reject(error);
      else resolve({ req, res, passed: true });
    });
  });
}

function invokeAppSession(session) {
  return new Promise((resolve, reject) => {
    const req = {
      method: "GET",
      url: "/api/session",
      originalUrl: "/api/session",
      path: "/api/session",
      headers: { accept: "application/json" },
      session,
      get(name) {
        return this.headers[String(name).toLowerCase()];
      },
    };
    let res;
    res = createResponse(() => resolve(res));
    res.set = jest.fn(() => res);
    authRoutes.handle(req, res, (error) => {
      if (error) reject(error);
      else resolve(res);
    });
  });
}

async function createTalent({
  email,
  firebaseUid = null,
  emailVerified = false,
  onboardingComplete = false,
}) {
  const userId = uuidv4();
  await knex("users").insert({
    id: userId,
    email,
    password_hash: "firebase-authenticated-account",
    firebase_uid: firebaseUid,
    email_verified: emailVerified,
    role: "TALENT",
    first_name: "Launch",
    last_name: "Test",
  });

  if (onboardingComplete) {
    await knex("profiles").insert({
      id: uuidv4(),
      user_id: userId,
      slug: `launch-${userId}`,
      first_name: "Launch",
      last_name: "Test",
      city: "Brooklyn",
      height_cm: 175,
      bio_raw: "",
      bio_curated: "",
      onboarding_completed_at: knex.fn.now(),
    });
  }

  return userId;
}

beforeAll(async () => {
  await knex.migrate.latest();
}, 120000);

beforeEach(async () => {
  await knex("sessions").del();
  await knex("profiles").del();
  await knex("users").del();
  authToken.value = null;
});

afterAll(async () => {
  await knex.destroy();
  removeDbFiles();
});

describe("talent auth launch containment", () => {
  test("an unverified email collision cannot bind or authenticate an existing talent", async () => {
    const email = "legacy-collision@example.test";
    const userId = await createTalent({ email, emailVerified: true });
    firebaseIdentity({
      uid: "attacker-firebase-uid",
      email,
      emailVerified: false,
    });

    const { res: response } = await invokeLogin();

    expect(response.statusCode).toBe(404);
    expect(response.body.error).toBe("NEEDS_ONBOARDING");
    await expect(knex("users").where({ id: userId }).first()).resolves.toEqual(
      expect.objectContaining({ firebase_uid: null }),
    );
    expect(await knex("sessions").count({ count: "*" }).first()).toEqual(
      expect.objectContaining({ count: 0 }),
    );
  });

  test("verified legacy identity binding still does not create or complete a profile during login", async () => {
    const storedEmail = "Verified-Legacy@Example.Test";
    const userId = await createTalent({ email: storedEmail, emailVerified: true });
    firebaseIdentity({
      uid: "verified-legacy-firebase-uid",
      email: "verified-legacy@example.test",
      emailVerified: true,
    });

    const { res: response } = await invokeLogin();

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({ success: true, redirect: "/onboarding" }),
    );
    await expect(knex("users").where({ id: userId }).first()).resolves.toEqual(
      expect.objectContaining({ firebase_uid: "verified-legacy-firebase-uid" }),
    );
    await expect(knex("profiles").where({ user_id: userId }).first()).resolves.toBeUndefined();
  });

  test("an unverified talent session is confined to onboarding even with a completed profile", async () => {
    const email = "unverified-complete@example.test";
    await createTalent({
      email,
      firebaseUid: "unverified-complete-firebase-uid",
      emailVerified: false,
      onboardingComplete: true,
    });
    firebaseIdentity({
      uid: "unverified-complete-firebase-uid",
      email,
      emailVerified: false,
    });

    const { req, res: login } = await invokeLogin();

    expect(login.statusCode).toBe(200);
    expect(login.body.redirect).toBe("/onboarding?verification=required");

    const sessionStatus = await invokeAppSession(req.session);
    expect(sessionStatus.body.redirect).toBe("/onboarding?verification=required");

    const dashboard = await invokeTalentDashboardEligibility(req.session);
    expect(dashboard.passed).toBe(false);
    expect(dashboard.res.statusCode).toBe(403);
    expect(dashboard.res.body).toEqual(
      expect.objectContaining({ error: "EMAIL_VERIFICATION_REQUIRED" }),
    );
  });
});
