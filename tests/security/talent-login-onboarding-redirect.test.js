"use strict";

process.env.NODE_ENV = "test";
process.env.DB_CLIENT = "sqlite3";
process.env.DATABASE_URL = "sqlite://./test-talent-login-onboarding-redirect.sqlite3";

const fs = require("fs");
const path = require("path");
const request = require("supertest");

const NEW_GOOGLE_UID = "firebase-google-new-talent-onboarding";
const NEW_GOOGLE_EMAIL = "google-new-talent-onboarding@example.com";

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
  "../../test-talent-login-onboarding-redirect.sqlite3",
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

describe("talent Google login redirects unknown users to onboarding", () => {
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

  test("first-time talent Google login does not create a user and returns NEEDS_ONBOARDING", async () => {
    const response = await request(app).post("/api/login").send({
      firebase_token: "verified-google-id-token",
      terms_accepted: true,
      privacy_accepted: true,
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: "NEEDS_ONBOARDING",
      message: "Finish creating your Pholio account to continue.",
      redirect: "/onboarding",
    });
    await expect(
      knex("users").where({ firebase_uid: NEW_GOOGLE_UID }).first(),
    ).resolves.toBeUndefined();
  });

  test("existing talent can sign in normally", async () => {
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
