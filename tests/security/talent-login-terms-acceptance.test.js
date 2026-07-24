"use strict";

process.env.NODE_ENV = "test";
process.env.DB_CLIENT = "sqlite3";
process.env.DATABASE_URL = "sqlite://./test-talent-login-terms-acceptance.sqlite3";

const fs = require("fs");
const path = require("path");
const request = require("supertest");

const NEW_GOOGLE_UID = "firebase-google-new-talent-terms";
const NEW_GOOGLE_EMAIL = "google-new-talent@example.com";

jest.mock("../../src/domains/auth/services/firebase-admin", () => ({
  initializeFirebaseAdmin: jest.fn(),
  verifyIdToken: jest.fn(async () => ({
    uid: NEW_GOOGLE_UID,
    email: NEW_GOOGLE_EMAIL,
    email_verified: true,
    name: "Google Talent",
  })),
  createUser: jest.fn(),
  getUserByEmail: jest.fn(),
}));

const TEST_DB_PATH = path.resolve(
  __dirname,
  "../../test-talent-login-terms-acceptance.sqlite3",
);
if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const firebaseAdmin = require("../../src/domains/auth/services/firebase-admin");
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

describe("talent Google login legal acceptance on first-time account create", () => {
  beforeEach(async () => {
    await knex("profiles").del();
    await knex("users").del();
    firebaseAdmin.verifyIdToken.mockResolvedValue({
      uid: NEW_GOOGLE_UID,
      email: NEW_GOOGLE_EMAIL,
      email_verified: true,
      name: "Google Talent",
    });
  });

  test("rejects first-time talent login without terms/privacy acceptance", async () => {
    const response = await request(app).post("/api/login").send({
      firebase_token: "verified-google-id-token",
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error:
        "You must accept the Terms of Service and Privacy Policy to create an account.",
    });
    await expect(
      knex("users").where({ firebase_uid: NEW_GOOGLE_UID }).first(),
    ).resolves.toBeUndefined();
  });

  test("creates talent account when login includes terms/privacy acceptance", async () => {
    const response = await request(app).post("/api/login").send({
      firebase_token: "verified-google-id-token",
      terms_accepted: true,
      privacy_accepted: true,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const user = await knex("users").where({ firebase_uid: NEW_GOOGLE_UID }).first();
    expect(user).toMatchObject({
      email: NEW_GOOGLE_EMAIL,
      role: "TALENT",
      terms_accepted_version: CURRENT_TERMS_VERSION,
      privacy_accepted_version: CURRENT_PRIVACY_VERSION,
    });
    expect(user.terms_accepted_at).toBeTruthy();
    expect(user.privacy_accepted_at).toBeTruthy();

    const profile = await knex("profiles").where({ user_id: user.id }).first();
    expect(profile).toBeTruthy();
    expect(profile.onboarding_completed_at).toBeTruthy();
  });

  test("existing talent can sign in without resending acceptance flags", async () => {
    await knex("users").insert({
      id: "existing-talent-user-id",
      email: NEW_GOOGLE_EMAIL,
      password_hash: "firebase-authenticated-account",
      firebase_uid: NEW_GOOGLE_UID,
      email_verified: true,
      role: "TALENT",
      first_name: "Google",
      last_name: "Talent",
      terms_accepted_at: knex.fn.now(),
      terms_accepted_version: CURRENT_TERMS_VERSION,
      privacy_accepted_at: knex.fn.now(),
      privacy_accepted_version: CURRENT_PRIVACY_VERSION,
    });

    const response = await request(app).post("/api/login").send({
      firebase_token: "verified-google-id-token",
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
