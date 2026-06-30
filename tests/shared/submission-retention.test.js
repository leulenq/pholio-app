"use strict";

const createKnex = require("knex");
const { v4: uuidv4 } = require("uuid");

const {
  redactExpiredSubmissionPackages,
} = require("../../src/shared/lib/submission-retention");

describe("submission package retention", () => {
  let db;

  beforeAll(async () => {
    db = createKnex({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await db.schema.createTable("talent_submission_packages", (table) => {
      table.uuid("id").primary();
      table.uuid("application_id").notNullable();
      table.text("payload").notNullable();
      table.timestamp("created_at").notNullable();
      table.timestamp("retention_expires_at").nullable();
      table.timestamp("revoked_at").nullable();
      table.timestamp("redacted_at").nullable();
      table.string("redaction_reason", 80).nullable();
    });
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("redacts only expired packages and reports the changed count", async () => {
    const expiredId = uuidv4();
    const futureId = uuidv4();
    const now = new Date("2026-06-29T12:00:00.000Z");
    await db("talent_submission_packages").insert([
      {
        id: expiredId,
        application_id: uuidv4(),
        payload: JSON.stringify({
          agencyId: "agency-expired",
          imageIds: ["private-image"],
          contact: { email: "private@example.com" },
        }),
        created_at: "2024-06-01T12:00:00.000Z",
        retention_expires_at: "2026-06-01T12:00:00.000Z",
      },
      {
        id: futureId,
        application_id: uuidv4(),
        payload: JSON.stringify({
          agencyId: "agency-future",
          imageIds: ["still-retained"],
        }),
        created_at: "2026-06-01T12:00:00.000Z",
        retention_expires_at: "2028-06-01T12:00:00.000Z",
      },
    ]);

    await expect(redactExpiredSubmissionPackages(db, now)).resolves.toBe(1);

    const expired = await db("talent_submission_packages")
      .where({ id: expiredId })
      .first();
    const future = await db("talent_submission_packages")
      .where({ id: futureId })
      .first();
    const expiredPayload = JSON.parse(expired.payload);
    expect(expired.redaction_reason).toBe("retention_expired");
    expect(expired.revoked_at).toBeTruthy();
    expect(expiredPayload.disclosureRedacted).toBe(true);
    expect(expiredPayload.imageIds).toBeUndefined();
    expect(expiredPayload.contact).toBeUndefined();
    expect(future.redacted_at).toBeNull();
    expect(JSON.parse(future.payload).imageIds).toEqual(["still-retained"]);
  });
});
