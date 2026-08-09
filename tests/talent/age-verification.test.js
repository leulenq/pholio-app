"use strict";

const crypto = require("crypto");
const {
  useIsolatedDatabase,
  migrateAndSeed,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("talent-age-verification");

const mockRedact = jest.fn().mockResolvedValue({ id: "redacted" });
jest.mock("../../src/shared/lib/stripe", () => ({
  stripe: {
    identity: {
      verificationSessions: { redact: mockRedact },
    },
  },
}));

const knex = require("../../src/shared/db/knex");
const {
  applyProviderSession,
  getAdultContext,
  invalidateAdultVerification,
  updateAdultContext,
} = require("../../src/domains/talent/services/age-verification");

let profile;

beforeAll(async () => {
  await migrateAndSeed(knex);
  profile = await knex("profiles")
    .join("users", "profiles.user_id", "users.id")
    .where("users.email", "talent@example.com")
    .select("profiles.*")
    .first();
  await knex("profiles").where({ id: profile.id }).update({ date_of_birth: "1990-04-12" });
});

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(TEST_DB_FILE);
});

async function verificationRecord(sessionId) {
  const id = crypto.randomUUID();
  await knex("age_verifications").insert({
    id,
    profile_id: profile.id,
    provider_session_id: sessionId,
    status: "processing",
  });
  return id;
}

test("matching provider DOB verifies adulthood without storing identity document data", async () => {
  const sessionId = "vs_matching_dob";
  await verificationRecord(sessionId);

  const status = await applyProviderSession({
    id: sessionId,
    status: "verified",
    verified_outputs: { dob: { year: 1990, month: 4, day: 12 } },
  });

  expect(status.verifiedAdult).toBe(true);
  const record = await knex("age_verifications").where({ provider_session_id: sessionId }).first();
  expect(record.verified_over_18).toBeTruthy();
  expect(record.dob_matches_profile).toBeTruthy();
  expect(record).not.toHaveProperty("document_number");
  expect(record).not.toHaveProperty("document_image");
  expect(mockRedact).toHaveBeenCalledWith(sessionId);
});

test("a DOB mismatch fails closed and invalidates private adult context", async () => {
  const sessionId = "vs_wrong_dob";
  await verificationRecord(sessionId);

  const status = await applyProviderSession({
    id: sessionId,
    status: "verified",
    verified_outputs: { dob: { year: 1991, month: 4, day: 12 } },
  });

  expect(status.verifiedAdult).toBe(false);
  const record = await knex("age_verifications").where({ provider_session_id: sessionId }).first();
  expect(record.status).toBe("failed");
  expect(record.failure_code).toBe("dob_mismatch");
});

test("adult context stays owner-private and saving never grants sharing consent", async () => {
  await knex("adult_context").where({ profile_id: profile.id }).update({
    verified_adult: true,
    verified_adult_at: knex.fn.now(),
    share_with_named_submission: true,
    share_with_confirmed_job: true,
  });

  const saved = await updateAdultContext(profile.id, {
    contentBoundaries: ["Swimwear", "Fitness/Athletic"],
    onlyfansUrl: "onlyfans.com/example",
  });
  expect(saved.contentBoundaries).toEqual(["Swimwear", "Fitness/Athletic"]);
  expect(saved.onlyfansUrl).toBe("https://onlyfans.com/example");

  const row = await knex("adult_context").where({ profile_id: profile.id }).first();
  expect(row.share_with_named_submission).toBeFalsy();
  expect(row.share_with_confirmed_job).toBeFalsy();

  await invalidateAdultVerification(knex, profile.id);
  expect(await getAdultContext(profile.id)).toEqual({
    verifiedAdult: false,
    verifiedAt: null,
    contentBoundaries: [],
    onlyfansUrl: null,
  });
});
