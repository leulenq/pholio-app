"use strict";

const knexFactory = require("knex");

const persistenceMigration = require("../../migrations/20260810120000_create_spec_registry_persistence");
const agencyAuthoredMigration = require("../../migrations/20260811090000_agency_authored_spec_registry");
const engagementMigration = require("../../migrations/20260814130000_spec_registry_engagement_events");
const {
  EVENT_TYPES,
  engagementSentence,
  recordEngagement,
  summarizeEngagement,
} = require("../../src/domains/spec-registry/engagement-service");

const PROFILE_A = "b0000000-0000-4000-8000-000000000001";
const PROFILE_B = "b0000000-0000-4000-8000-000000000002";
const USER_A = "b0000000-0000-4000-8000-000000000003";
const USER_B = "b0000000-0000-4000-8000-000000000004";

const ELITE = "elite-model-management-global:online";
const STORM = "storm-management-uk:online";

async function createSchema(db) {
  await db.raw("PRAGMA foreign_keys = ON");
  await db.schema.createTable("agencies", (table) => {
    table.uuid("id").primary();
    table.string("name").notNullable();
  });
  await db.schema.createTable("applications", (table) => table.uuid("id").primary());
  await db.schema.createTable("application_submission_requests", (table) =>
    table.uuid("id").primary(),
  );
  await db.schema.createTable("users", (table) => {
    table.uuid("id").primary();
    table.string("email");
  });
  await db.schema.createTable("profiles", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id").references("id").inTable("users");
  });
  await persistenceMigration.up(db);
  await agencyAuthoredMigration.up(db);
  await engagementMigration.up(db);

  await db("users").insert([
    { id: USER_A, email: "a@example.test" },
    { id: USER_B, email: "b@example.test" },
  ]);
  await db("profiles").insert([
    { id: PROFILE_A, user_id: USER_A },
    { id: PROFILE_B, user_id: USER_B },
  ]);
  await db("spec_registry_series").insert([
    { series_id: ELITE, organization_key: "elite-model-management" },
    { series_id: STORM, organization_key: "storm-management" },
  ]);
}

describe("spec registry engagement", () => {
  let db;

  beforeEach(async () => {
    db = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await createSchema(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("records an export and an outbound click", async () => {
    await expect(
      recordEngagement(db, {
        seriesId: ELITE,
        profileId: PROFILE_A,
        eventType: EVENT_TYPES.EXPORT,
        fileCount: 3,
      }),
    ).resolves.toBe(true);
    await expect(
      recordEngagement(db, {
        seriesId: ELITE,
        profileId: PROFILE_A,
        eventType: EVENT_TYPES.OUTBOUND_CLICK,
      }),
    ).resolves.toBe(true);

    const rows = await db("spec_registry_engagement_events").select("*");
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.event_type).sort()).toEqual(["export", "outbound_click"]);
    // Guards the knex-under-Jest trap: a Date object persists as the literal
    // text "[object Object]" because `instanceof Date` fails across VM realms.
    expect(rows[0].created_at).not.toContain("[object");
  });

  test("counts people, not events — the sentence is about people", async () => {
    // One talent exporting six times is one person who prepared a set.
    for (let index = 0; index < 6; index += 1) {
      await recordEngagement(db, {
        seriesId: ELITE,
        profileId: PROFILE_A,
        eventType: EVENT_TYPES.EXPORT,
      });
    }
    await recordEngagement(db, {
      seriesId: ELITE,
      profileId: PROFILE_B,
      eventType: EVENT_TYPES.EXPORT,
    });
    await recordEngagement(db, {
      seriesId: ELITE,
      profileId: PROFILE_B,
      eventType: EVENT_TYPES.OUTBOUND_CLICK,
    });

    const [elite] = await summarizeEngagement(db, { seriesId: ELITE });
    expect(elite).toMatchObject({
      seriesId: ELITE,
      exports: 7,
      talentWhoExported: 2,
      outboundClicks: 1,
      talentWhoClickedThrough: 1,
    });
  });

  test("separates one agency's numbers from another's", async () => {
    await recordEngagement(db, {
      seriesId: ELITE,
      profileId: PROFILE_A,
      eventType: EVENT_TYPES.EXPORT,
    });
    await recordEngagement(db, {
      seriesId: STORM,
      profileId: PROFILE_B,
      eventType: EVENT_TYPES.EXPORT,
    });

    const summary = await summarizeEngagement(db);
    expect(summary).toHaveLength(2);
    expect(summary.map((row) => row.seriesId).sort()).toEqual([ELITE, STORM].sort());
  });

  test("windows the counts, so 'last quarter' means last quarter", async () => {
    await db("spec_registry_engagement_events").insert([
      {
        id: "b0000000-0000-4000-8000-00000000000a",
        series_id: ELITE,
        profile_id: PROFILE_A,
        event_type: EVENT_TYPES.EXPORT,
        created_at: "2026-01-15T00:00:00.000Z",
      },
      {
        id: "b0000000-0000-4000-8000-00000000000b",
        series_id: ELITE,
        profile_id: PROFILE_B,
        event_type: EVENT_TYPES.EXPORT,
        created_at: "2026-06-15T00:00:00.000Z",
      },
    ]);

    const recent = await summarizeEngagement(db, { since: "2026-05-01T00:00:00.000Z" });
    expect(recent[0].talentWhoExported).toBe(1);

    const all = await summarizeEngagement(db);
    expect(all[0].talentWhoExported).toBe(2);
  });

  test("rejects an unknown event type instead of storing an uncountable row", async () => {
    await expect(
      recordEngagement(db, {
        seriesId: ELITE,
        profileId: PROFILE_A,
        eventType: "browsed",
      }),
    ).resolves.toBe(false);
    expect(await db("spec_registry_engagement_events").count({ n: "*" })).toEqual([{ n: 0 }]);
  });

  test("never throws when the table is missing — a count must not break a download", async () => {
    const bare = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await expect(
      recordEngagement(bare, {
        seriesId: ELITE,
        profileId: PROFILE_A,
        eventType: EVENT_TYPES.EXPORT,
      }),
    ).resolves.toBe(false);
    await expect(summarizeEngagement(bare)).resolves.toEqual([]);
    await bare.destroy();
  });

  describe("the sentence", () => {
    test("is the one guardrail 4 asks for", () => {
      expect(
        engagementSentence(
          {
            agencyName: "Elite Model Management",
            talentWhoExported: 142,
            talentWhoClickedThrough: 96,
          },
          "last quarter",
        ),
      ).toBe(
        "142 people prepared an Elite Model Management-spec set on Pholio last quarter and 96 of them went on to your site.",
      );
    });

    test("picks the article the agency's own name takes", () => {
      expect(
        engagementSentence({ agencyName: "IMG Models", talentWhoExported: 4 }),
      ).toMatch(/^4 people prepared an IMG Models-spec set/);
      expect(
        engagementSentence({ agencyName: "Ford Models", talentWhoExported: 4 }),
      ).toMatch(/^4 people prepared a Ford Models-spec set/);
    });

    test("stays honest about one person", () => {
      expect(
        engagementSentence({ agencyName: "Storm", talentWhoExported: 1, talentWhoClickedThrough: 1 }),
      ).toBe("1 person prepared a Storm-spec set on Pholio recently and all of them went on to your site.");
    });

    test("says nothing when there is nothing to say", () => {
      expect(engagementSentence({ agencyName: "Ford", talentWhoExported: 0 })).toBeNull();
    });
  });
});
