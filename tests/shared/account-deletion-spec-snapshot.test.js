"use strict";

const crypto = require("crypto");
const path = require("path");

jest.mock("../../src/shared/lib/uploader", () => ({
  s3: { send: jest.fn() },
}));
jest.mock("../../src/domains/auth/services/firebase-admin", () => ({
  deleteUser: jest.fn(),
}));

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("account-deletion-spec-snapshot");
const db = require("../../src/shared/db/knex");
const { validateRegistry } = require("../../scripts/validate-spec-registry");
const { deleteUserAccount } = require("../../src/shared/lib/account-deletion");
const {
  getCurrentRevision,
  saveApplicationSnapshot,
} = require("../../src/domains/spec-registry/store");
const { publishRegistry } = require("../../src/domains/spec-registry/store/publisher");

const registryRoot = path.join(__dirname, "..", "..", "data", "spec-registry", "v1");

describe("account deletion with immutable Spec Registry snapshots", () => {
  const userId = crypto.randomUUID();
  const profileId = crypto.randomUUID();
  const agencyId = crypto.randomUUID();
  const applicationId = crypto.randomUUID();
  const submissionRequestId = crypto.randomUUID();

  beforeAll(async () => {
    await migrate(db);
    const registry = validateRegistry({
      registryRoot,
      asOf: new Date("2026-08-10T12:00:00.000Z"),
    });
    await publishRegistry(db, registry);

    await db("users").insert({
      id: userId,
      email: `snapshot-delete-${userId}@example.test`,
      password_hash: "test-only",
      role: "TALENT",
      firebase_uid: null,
    });
    await db("profiles").insert({
      id: profileId,
      user_id: userId,
      slug: `snapshot-delete-${profileId}`,
      first_name: "Delete",
      last_name: "Snapshot",
      city: "New York",
      height_cm: 175,
      bio_raw: "",
      bio_curated: "",
    });
    await db("agencies").insert({
      id: agencyId,
      name: "Snapshot Cascade Test Agency",
      slug: `snapshot-cascade-${agencyId}`,
    });
    await db("applications").insert({
      id: applicationId,
      profile_id: profileId,
      agency_id: agencyId,
      status: "submitted",
    });
    await db("application_submission_requests").insert({
      id: submissionRequestId,
      profile_id: profileId,
      agency_id: agencyId,
      idempotency_key: `snapshot-delete-${submissionRequestId}`,
      request_hash: "a".repeat(64),
      application_id: applicationId,
      status: "completed",
      completed_at: db.fn.now(),
    });

    const revision = await getCurrentRevision(
      db,
      "the-society-management-nyc:online",
    );
    await db.transaction((trx) =>
      saveApplicationSnapshot(trx, {
        applicationId,
        submissionRequestId,
        datasetVersion: revision.datasetVersion,
        revisionId: revision.revisionId,
        specPayloadSha256: revision.payloadSha256,
        evaluationEngineVersion: "1.0.0",
        inputFingerprint: "b".repeat(64),
        evaluation: { outcomes: [] },
        evaluatedAt: "2026-08-10T12:00:00.000Z",
      }),
    );
  }, 60000);

  afterAll(async () => {
    await db.destroy();
    dropIsolatedDatabase(TEST_DB_FILE);
  });

  test("deleting the user succeeds and cascades every submission-attempt snapshot", async () => {
    /* The registry is published data, not a fixture: it grows whenever new
       agencies are researched (6 series at launch, 12 plus a second Ford
       revision today). Asserting a literal count made this suite fail on a
       data change that has nothing to do with deletion. What the assertion is
       for is that erasing a user takes their snapshot and nothing else — so
       compare the registry against itself, before and after. */
    const revisionsBefore = Number(
      (await db("spec_registry_revisions").count("* as n").first()).n,
    );

    expect(
      Number(
        (
          await db("application_spec_snapshots")
            .where({ submission_request_id: submissionRequestId })
            .count("* as n")
            .first()
        ).n,
      ),
    ).toBe(1);

    await expect(deleteUserAccount(db, userId)).resolves.toMatchObject({
      deleted: true,
      userFound: true,
      fullyErased: true,
    });

    await expect(db("users").where({ id: userId }).first()).resolves.toBeUndefined();
    await expect(db("profiles").where({ id: profileId }).first()).resolves.toBeUndefined();
    await expect(
      db("applications").where({ id: applicationId }).first(),
    ).resolves.toBeUndefined();
    await expect(
      db("application_submission_requests").where({ id: submissionRequestId }).first(),
    ).resolves.toBeUndefined();
    await expect(
      db("application_spec_snapshots")
        .where({ submission_request_id: submissionRequestId })
        .first(),
    ).resolves.toBeUndefined();

    expect(
      Number((await db("spec_registry_revisions").count("* as n").first()).n),
    ).toBe(revisionsBefore);
    expect(revisionsBefore).toBeGreaterThan(0);
  });
});
