"use strict";

/**
 * POST /api/auth/password-reset used to ask Firebase for a reset link for
 * every existing account, unconditionally. Firebase refuses that request for
 * an account with no `password` entry in its `providerData` — a Google- or
 * Instagram-only account has nothing to reset — so `generatePasswordResetLink`
 * threw and the client only ever saw a generic "Failed to send reset email."
 *
 * These pin the fix: the route now inspects `providerData` before ever
 * calling Firebase for a link, sends the reset link only to accounts that
 * actually have a password, sends a different "here's how you sign in" email
 * to provider-only accounts, and — since account existence must never be
 * exposed through this endpoint — returns the same `{ success: true }` in
 * every case.
 */

process.env.NODE_ENV = "test";
process.env.DB_CLIENT = "sqlite3";
process.env.DATABASE_URL = "sqlite://./test-password-reset-provider-mismatch.sqlite3";

const fs = require("fs");
const path = require("path");
const request = require("supertest");

jest.mock("../../src/domains/auth/services/firebase-admin", () => ({
  initializeFirebaseAdmin: jest.fn(),
  getUserByEmail: jest.fn(),
  generatePasswordResetLink: jest.fn(async () => "https://app.pholio.studio/login?reset=1"),
}));

const TEST_DB_PATH = path.resolve(
  __dirname,
  "../../test-password-reset-provider-mismatch.sqlite3",
);
if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const firebaseAdmin = require("../../src/domains/auth/services/firebase-admin");
const {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} = require("../../src/shared/lib/legal-acceptance");

const PASSWORD_EMAIL = "password-account@example.com";
const GOOGLE_ONLY_EMAIL = "google-only-account@example.com";
const NO_FIREBASE_EMAIL = "orphan-db-row@example.com";
const UNKNOWN_EMAIL = "never-signed-up@example.com";

async function insertUser({ id, email }) {
  await knex("users").insert({
    id,
    email,
    password_hash: "firebase-authenticated-account",
    firebase_uid: `${id}-uid`,
    email_verified: true,
    role: "TALENT",
    first_name: "Test",
    last_name: "User",
    terms_accepted_at: knex.fn.now(),
    terms_accepted_version: CURRENT_TERMS_VERSION,
    privacy_accepted_at: knex.fn.now(),
    privacy_accepted_version: CURRENT_PRIVACY_VERSION,
  });
}

beforeAll(async () => {
  await knex.migrate.latest();
}, 120000);

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

beforeEach(async () => {
  await knex("users").del();
  firebaseAdmin.getUserByEmail.mockReset();
  firebaseAdmin.generatePasswordResetLink.mockClear();
});

describe("POST /api/auth/password-reset", () => {
  test("account with a password provider gets a reset link", async () => {
    await insertUser({ id: "user-password", email: PASSWORD_EMAIL });
    firebaseAdmin.getUserByEmail.mockResolvedValue({
      providerData: [{ providerId: "password" }],
    });

    const response = await request(app)
      .post("/api/auth/password-reset")
      .send({ email: PASSWORD_EMAIL });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    // handleCodeInApp: true + url: .../reset-password is what routes the link
    // at ResetPasswordPage instead of Firebase's own generic hosted page —
    // regressing either half silently reverts to the unbranded flow.
    expect(firebaseAdmin.generatePasswordResetLink).toHaveBeenCalledWith(
      PASSWORD_EMAIL,
      expect.objectContaining({
        handleCodeInApp: true,
        url: expect.stringMatching(/\/reset-password$/),
      }),
    );
  });

  test("Google-only account does not fail, and gets no reset link", async () => {
    await insertUser({ id: "user-google", email: GOOGLE_ONLY_EMAIL });
    firebaseAdmin.getUserByEmail.mockResolvedValue({
      providerData: [{ providerId: "google.com" }],
    });

    const response = await request(app)
      .post("/api/auth/password-reset")
      .send({ email: GOOGLE_ONLY_EMAIL });

    // This is the actual bug: this used to come back non-200 ("Failed to
    // send reset email") because generatePasswordResetLink threw for exactly
    // this account shape.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(firebaseAdmin.generatePasswordResetLink).not.toHaveBeenCalled();
  });

  test("account with no matching Firebase identity still returns success", async () => {
    await insertUser({ id: "user-orphan", email: NO_FIREBASE_EMAIL });
    firebaseAdmin.getUserByEmail.mockResolvedValue(null);

    const response = await request(app)
      .post("/api/auth/password-reset")
      .send({ email: NO_FIREBASE_EMAIL });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(firebaseAdmin.generatePasswordResetLink).not.toHaveBeenCalled();
  });

  test("unknown email still returns success, without looking up Firebase", async () => {
    const response = await request(app)
      .post("/api/auth/password-reset")
      .send({ email: UNKNOWN_EMAIL });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(firebaseAdmin.getUserByEmail).not.toHaveBeenCalled();
    expect(firebaseAdmin.generatePasswordResetLink).not.toHaveBeenCalled();
  });

  test("malformed email is rejected before any lookup", async () => {
    const response = await request(app)
      .post("/api/auth/password-reset")
      .send({ email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(firebaseAdmin.getUserByEmail).not.toHaveBeenCalled();
  });
});
