"use strict";

process.env.DATABASE_URL = "sqlite://./test-application-auto-close.sqlite3";
process.env.DB_CLIENT = "sqlite3";

const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../src/shared/db/knex");
const {
  DEFAULT_REVIEW_WINDOW_DAYS,
  resolveWindowDays,
  runApplicationAutoClose,
} = require("../../src/shared/lib/application-auto-close");
const {
  AUTO_CLOSED_APPLICATION_STATUS,
  WRITABLE_APPLICATION_STATUSES,
} = require("../../src/shared/constants/application-status");

jest.mock("../../src/shared/services/notify-talent-application", () => ({
  notifyTalentForApplicationStatus: jest.fn().mockResolvedValue(undefined),
}));
const {
  notifyTalentForApplicationStatus,
} = require("../../src/shared/services/notify-talent-application");

const TEST_DB_PATH = path.resolve(__dirname, "../../test-application-auto-close.sqlite3");
const NOW = new Date("2026-08-14T12:00:00.000Z");
const AGENCY_ID = uuidv4();
const QUIET_AGENCY_ID = uuidv4();
const PROFILE_ID = uuidv4();

/*
 * ISO strings, not Date objects. Under jest's VM realm knex's `instanceof Date`
 * check fails and it serializes the value with `String()`, storing the literal
 * text "[object Object]" — which then reads back as an unparseable anchor and
 * silently makes every application look immortal.
 */
function daysAgo(days) {
  return new Date(NOW.getTime() - days * 86400000).toISOString();
}

async function createSchema() {
  await knex.schema.createTable("agencies", (table) => {
    table.string("id", 36).primary();
    table.string("name").notNullable();
    table.integer("application_review_window_days").notNullable().defaultTo(30);
  });
  await knex.schema.createTable("profiles", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).nullable();
  });
  await knex.schema.createTable("applications", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("profile_id", 36).notNullable();
    table.string("status").notNullable();
    table.timestamp("status_changed_at").nullable();
    table.timestamp("auto_closed_at").nullable();
    table.timestamp("created_at").nullable();
    table.timestamp("updated_at").nullable();
  });
  await knex.schema.createTable("application_activities", (table) => {
    table.string("id", 36).primary();
    table.string("application_id", 36).notNullable();
    table.string("agency_id", 36).nullable();
    table.string("user_id", 36).nullable();
    table.string("activity_type", 50).notNullable();
    table.text("description").nullable();
    table.text("metadata").nullable();
    table.timestamp("created_at").nullable();
  });
}

async function seedApplication({ status, changedDaysAgo, agencyId = AGENCY_ID }) {
  const id = uuidv4();
  await knex("applications").insert({
    id,
    agency_id: agencyId,
    profile_id: PROFILE_ID,
    status,
    status_changed_at: daysAgo(changedDaysAgo),
    created_at: daysAgo(changedDaysAgo),
    updated_at: daysAgo(changedDaysAgo),
  });
  return id;
}

beforeAll(async () => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  await createSchema();
  await knex("agencies").insert([
    { id: AGENCY_ID, name: "Windowed", application_review_window_days: 30 },
    { id: QUIET_AGENCY_ID, name: "Opted out", application_review_window_days: 0 },
  ]);
  await knex("profiles").insert({ id: PROFILE_ID, user_id: uuidv4() });
});

afterEach(async () => {
  await knex("application_activities").del();
  await knex("applications").del();
  notifyTalentForApplicationStatus.mockClear();
});

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe("application auto-close", () => {
  test("closes an application the agency has sat on past its review window", async () => {
    const id = await seedApplication({ status: "submitted", changedDaysAgo: 31 });

    const result = await runApplicationAutoClose(knex, { now: NOW });
    expect(result).toMatchObject({ closed: 1, notified: 1 });

    const row = await knex("applications").where({ id }).first();
    expect(row.status).toBe(AUTO_CLOSED_APPLICATION_STATUS);
    expect(row.auto_closed_at).toBeTruthy();
  });

  test("leaves an application inside the window alone", async () => {
    const id = await seedApplication({ status: "submitted", changedDaysAgo: 29 });

    const result = await runApplicationAutoClose(knex, { now: NOW });
    expect(result.closed).toBe(0);

    const row = await knex("applications").where({ id }).first();
    expect(row.status).toBe("submitted");
  });

  test("only runs the clock on statuses where the agency holds the next move", async () => {
    // requested_more and meeting_requested are waiting on the talent;
    // development and kept_on_file are outcomes the agency chose. None of
    // those are silence, so none of them should expire.
    const waiting = ["requested_more", "meeting_requested", "development", "kept_on_file"];
    for (const status of waiting) {
      await seedApplication({ status, changedDaysAgo: 400 });
    }
    await seedApplication({ status: "accepted", changedDaysAgo: 400 });

    const result = await runApplicationAutoClose(knex, { now: NOW });
    expect(result.closed).toBe(0);
  });

  test("an agency can opt out with a zero window", async () => {
    await seedApplication({
      status: "submitted",
      changedDaysAgo: 400,
      agencyId: QUIET_AGENCY_ID,
    });

    const result = await runApplicationAutoClose(knex, { now: NOW });
    expect(result.closed).toBe(0);
  });

  test("records the close as no-response, not as a decision the agency made", async () => {
    const id = await seedApplication({ status: "shortlisted", changedDaysAgo: 45 });

    await runApplicationAutoClose(knex, { now: NOW });

    const row = await knex("applications").where({ id }).first();
    // `passed` and `declined` are verdicts. The agency never gave one.
    expect(row.status).not.toBe("passed");
    expect(row.status).not.toBe("declined");
    expect(row.status).toBe(AUTO_CLOSED_APPLICATION_STATUS);

    const activity = await knex("application_activities")
      .where({ application_id: id })
      .first();
    expect(activity.activity_type).toBe("auto_closed");
    // No human did this, so no human is credited with it.
    expect(activity.user_id).toBeNull();
    expect(JSON.parse(activity.metadata)).toMatchObject({
      previousStatus: "shortlisted",
      reviewWindowDays: 30,
    });
  });

  test("an agency cannot set the auto-closed status by hand", () => {
    expect(WRITABLE_APPLICATION_STATUSES).not.toContain(AUTO_CLOSED_APPLICATION_STATUS);
  });

  test("tells the talent, and survives a notification failure", async () => {
    const id = await seedApplication({ status: "submitted", changedDaysAgo: 31 });
    notifyTalentForApplicationStatus.mockRejectedValueOnce(new Error("smtp down"));

    const result = await runApplicationAutoClose(knex, { now: NOW });

    // The close is the product promise; the notification is best-effort.
    expect(result.closed).toBe(1);
    expect(result.notified).toBe(0);
    const row = await knex("applications").where({ id }).first();
    expect(row.status).toBe(AUTO_CLOSED_APPLICATION_STATUS);
  });

  test("an unresolvable window reads as the default, not as opted out", async () => {
    // The column is NOT NULL with a default, so the real source of an absent
    // window is the left join missing its agency row. Absent is not a decision
    // to disable auto-close.
    expect(resolveWindowDays(null)).toBe(DEFAULT_REVIEW_WINDOW_DAYS);
    expect(resolveWindowDays(undefined)).toBe(DEFAULT_REVIEW_WINDOW_DAYS);
    expect(resolveWindowDays("not a number")).toBe(DEFAULT_REVIEW_WINDOW_DAYS);
    expect(resolveWindowDays(0)).toBe(0);
    expect(resolveWindowDays(14)).toBe(14);
  });

  test("is idempotent — a second run does not re-close or re-notify", async () => {
    await seedApplication({ status: "submitted", changedDaysAgo: 31 });

    const first = await runApplicationAutoClose(knex, { now: NOW });
    notifyTalentForApplicationStatus.mockClear();
    const second = await runApplicationAutoClose(knex, { now: NOW });

    expect(first.closed).toBe(1);
    expect(second.closed).toBe(0);
    expect(notifyTalentForApplicationStatus).not.toHaveBeenCalled();
  });

  /*
   * The scan pages rather than loading every open application at once. Paging
   * is where a sweep like this goes wrong in two directions, so both are pinned:
   * it must not stop after the first page, and it must not spin forever on rows
   * it decides to leave open (those stay in the candidate set, so a naive
   * "loop while rows came back" never terminates).
   */
  describe("batching", () => {
    test("closes everything expired across more than one page", async () => {
      const ids = [];
      for (let index = 0; index < 7; index += 1) {
        ids.push(await seedApplication({ status: "submitted", changedDaysAgo: 31 }));
      }

      const result = await runApplicationAutoClose(knex, { now: NOW, batchSize: 2 });

      expect(result.closed).toBe(7);
      expect(result.notified).toBe(7);
      const remaining = await knex("applications").whereIn("status", ["submitted"]);
      expect(remaining).toHaveLength(0);
    });

    test("terminates when a full page is all still inside its window", async () => {
      for (let index = 0; index < 5; index += 1) {
        await seedApplication({ status: "submitted", changedDaysAgo: 1 });
      }

      const result = await runApplicationAutoClose(knex, { now: NOW, batchSize: 2 });

      expect(result.closed).toBe(0);
      // Each row is examined exactly once — proof the offset advanced past the
      // rows the sweep left open instead of re-reading them.
      expect(result.scanned).toBe(5);
    });

    test("pages correctly when expired and live applications are interleaved", async () => {
      const expired = [];
      for (let index = 0; index < 6; index += 1) {
        const id = await seedApplication({
          status: "submitted",
          changedDaysAgo: index % 2 === 0 ? 31 : 1,
        });
        if (index % 2 === 0) expired.push(id);
      }

      const result = await runApplicationAutoClose(knex, { now: NOW, batchSize: 2 });

      expect(result.closed).toBe(3);
      const closed = await knex("applications")
        .where({ status: AUTO_CLOSED_APPLICATION_STATUS })
        .pluck("id");
      expect(closed.sort()).toEqual(expired.sort());
    });
  });
});
