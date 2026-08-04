"use strict";

/**
 * POST /api/login's `password_just_reset` flag is how ResetPasswordPage tells
 * the backend "this sign-in follows a password reset, not an ordinary login" —
 * the only way the "your password was changed" confirmation email should ever
 * fire. Confirming here rather than trusting the client is the whole point:
 * Firebase's hosted reset flow (or now, ResetPasswordPage) never calls back
 * into this server on its own, and an ordinary login must never send this
 * email just because the client happened to pass the flag.
 */

process.env.NODE_ENV = "test";
process.env.DB_CLIENT = "sqlite3";
process.env.DATABASE_URL = "sqlite://./test-password-changed-notification.sqlite3";

const fs = require("fs");
const path = require("path");
const request = require("supertest");

const UID = "firebase-password-reset-notify";
const EMAIL = "reset-notify@example.com";

jest.mock("../../src/domains/auth/services/firebase-admin", () => ({
  initializeFirebaseAdmin: jest.fn(),
  verifyIdToken: jest.fn(async () => ({
    uid: UID,
    email: EMAIL,
    email_verified: true,
    name: "Reset Notify",
    firebase: { sign_in_provider: "password" },
  })),
  createUser: jest.fn(),
  getUserByEmail: jest.fn(),
}));

jest.mock("../../src/shared/lib/email", () => ({
  ...jest.requireActual("../../src/shared/lib/email"),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue({ ok: true }),
}));

const TEST_DB_PATH = path.resolve(
  __dirname,
  "../../test-password-changed-notification.sqlite3",
);
if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const { sendPasswordChangedEmail } = require("../../src/shared/lib/email");
const {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} = require("../../src/shared/lib/legal-acceptance");

beforeAll(async () => {
  await knex.migrate.latest();
}, 120000);

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

beforeEach(async () => {
  await knex("profiles").del();
  await knex("users").del();
  sendPasswordChangedEmail.mockClear();

  await knex("users").insert({
    id: "reset-notify-user-id",
    email: EMAIL,
    password_hash: "firebase-authenticated-account",
    firebase_uid: UID,
    email_verified: true,
    role: "TALENT",
    first_name: "Reset",
    last_name: "Notify",
    terms_accepted_at: knex.fn.now(),
    terms_accepted_version: CURRENT_TERMS_VERSION,
    privacy_accepted_at: knex.fn.now(),
    privacy_accepted_version: CURRENT_PRIVACY_VERSION,
  });
});

describe("POST /api/login password_just_reset", () => {
  test("sends the confirmation email when the flag is set", async () => {
    const response = await request(app).post("/api/login").send({
      firebase_token: "verified-token",
      password_just_reset: true,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(sendPasswordChangedEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordChangedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: EMAIL, firstName: "Reset" }),
    );
  });

  test("stays silent on an ordinary login without the flag", async () => {
    const response = await request(app).post("/api/login").send({
      firebase_token: "verified-token",
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(sendPasswordChangedEmail).not.toHaveBeenCalled();
  });

  test("a truthy-looking non-boolean flag does not trigger the email", async () => {
    // The check is `=== true` specifically — a client bug that sends the
    // string "true" (e.g. from a form field) must not silently pass.
    const response = await request(app).post("/api/login").send({
      firebase_token: "verified-token",
      password_just_reset: "true",
    });

    expect(response.status).toBe(200);
    expect(sendPasswordChangedEmail).not.toHaveBeenCalled();
  });

  test("a failed send does not fail the login", async () => {
    sendPasswordChangedEmail.mockRejectedValueOnce(new Error("SMTP down"));

    const response = await request(app).post("/api/login").send({
      firebase_token: "verified-token",
      password_just_reset: true,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
