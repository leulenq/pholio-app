"use strict";

const createKnex = require("knex");

const {
  MONTHLY_DISCOVERY_SUBMISSION_LIMIT,
  loadApplicationQuota,
  utcMonthWindow,
} = require("../../src/domains/talent/services/application-quota");

describe("application submission quota", () => {
  let db;

  beforeAll(async () => {
    db = createKnex({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await db.schema.createTable("application_submission_requests", (table) => {
      table.increments("id");
      table.string("profile_id").notNullable();
      table.string("status").notNullable();
      table.timestamp("completed_at").nullable();
    });
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db("application_submission_requests").delete();
  });

  test("uses one canonical UTC calendar-month window", () => {
    const window = utcMonthWindow("2026-06-30T23:59:59.000-04:00");
    expect(window.periodStart.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(window.periodEnd.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  test("counts completed submission events, including reapplications", async () => {
    await db("application_submission_requests").insert([
      {
        profile_id: "profile-1",
        status: "completed",
        completed_at: "2026-06-02T12:00:00.000Z",
      },
      {
        profile_id: "profile-1",
        status: "completed",
        completed_at: "2026-06-20T12:00:00.000Z",
      },
      {
        profile_id: "profile-1",
        status: "processing",
        completed_at: null,
      },
      {
        profile_id: "profile-1",
        status: "completed",
        completed_at: "2026-05-20T12:00:00.000Z",
      },
    ]);

    await expect(
      loadApplicationQuota(
        db,
        { id: "profile-1", is_pro: false },
        "2026-06-29T12:00:00.000Z",
      ),
    ).resolves.toMatchObject({
      used: 2,
      limit: MONTHLY_DISCOVERY_SUBMISSION_LIMIT,
      remaining: 3,
    });
  });

  // Selling a higher submission ceiling would make Pholio a regulated
  // "talent listing service" under Cal. Lab. Code §1701. The cap is flat.
  test("applies the same limit to a paid account", async () => {
    await db("application_submission_requests").insert({
      profile_id: "profile-1",
      status: "completed",
      completed_at: "2026-06-20T12:00:00.000Z",
    });

    await expect(
      loadApplicationQuota(
        db,
        { id: "profile-1", is_pro: true },
        "2026-06-29T12:00:00.000Z",
      ),
    ).resolves.toMatchObject({
      used: 1,
      limit: MONTHLY_DISCOVERY_SUBMISSION_LIMIT,
      remaining: MONTHLY_DISCOVERY_SUBMISSION_LIMIT - 1,
    });
  });
});
