"use strict";

const knexFactory = require("knex");

const persistenceMigration = require("../../migrations/20260810120000_create_spec_registry_persistence");
const agencyAuthoredMigration = require("../../migrations/20260811090000_agency_authored_spec_registry");
const delistingMigration = require("../../migrations/20260814131000_spec_registry_series_delisting");
const {
  parseArgs,
  resolveSeries,
  siblingCandidates,
} = require("../../scripts/delist-spec-registry-agency");

/**
 * The registry holds one agency network as several organizations, on purpose.
 * Elite publishes three: the global page asks for 3 shots, North America asks
 * for 6, and Japan publishes no shot list at all. Merging them would tell a
 * talent applying in New York to send the wrong set.
 *
 * The removal path has to cope with that. An agency asking to be delisted is
 * writing on behalf of a brand, not a database key.
 */
const SERIES = [
  ["elite-japan-tokyo:online", "elite-model-japan"],
  ["elite-model-management-global:online", "elite-model-management"],
  ["elite-models-na:online-general", "elite-models"],
  ["ford-models:selected-city-online", "ford-models"],
  ["storm-management-uk:online", "storm-management"],
];

describe("spec registry delisting — agency networks", () => {
  let db;

  beforeEach(async () => {
    db = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await db.schema.createTable("agencies", (table) => {
      table.uuid("id").primary();
      table.string("name");
    });
    await db.schema.createTable("applications", (table) => table.uuid("id").primary());
    await db.schema.createTable("application_submission_requests", (table) =>
      table.uuid("id").primary(),
    );
    await persistenceMigration.up(db);
    await agencyAuthoredMigration.up(db);
    await delistingMigration.up(db);
    await db("spec_registry_series").insert(
      SERIES.map(([series_id, organization_key]) => ({ series_id, organization_key })),
    );
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("arguments", () => {
    test("reads a network sweep, a dry run and a reason", () => {
      expect(
        parseArgs(["--like", "elite", "--dry-run", "--reason", "Asked by email"]),
      ).toMatchObject({ like: "elite", dryRun: true, reason: "Asked by email" });
    });

    test("refuses an argument it does not understand rather than ignoring it", () => {
      expect(() => parseArgs(["--organisation", "elite"])).toThrow(/Unknown argument/);
    });
  });

  describe("resolving what to remove", () => {
    test("an organization key takes only that organization", async () => {
      const rows = await resolveSeries(
        { organization: "elite-model-management", series: [] },
        db,
      );
      expect(rows.map((row) => row.series_id)).toEqual([
        "elite-model-management-global:online",
      ]);
    });

    test("--like sweeps the whole network in one command", async () => {
      const rows = await resolveSeries({ like: "elite", series: [] }, db);
      expect(rows.map((row) => row.organization_key)).toEqual([
        "elite-model-japan",
        "elite-model-management",
        "elite-models",
      ]);
    });
  });

  describe("sibling reporting", () => {
    test("names the rest of the network so it cannot be left live by accident", async () => {
      // The failure this exists to prevent: an operator acting on a delisting
      // request removes one of three Elite entries and never learns the other
      // two are still being served.
      const targets = await resolveSeries(
        { organization: "elite-model-management", series: [] },
        db,
      );
      const siblings = await siblingCandidates(targets, db);
      expect(siblings.map((row) => row.organization_key).sort()).toEqual([
        "elite-model-japan",
        "elite-models",
      ]);
    });

    test("says nothing for an agency with no lookalikes", async () => {
      const targets = await resolveSeries({ organization: "storm-management", series: [] }, db);
      expect(await siblingCandidates(targets, db)).toEqual([]);
    });

    test("does not re-report what is already being removed", async () => {
      const targets = await resolveSeries({ like: "elite", series: [] }, db);
      expect(await siblingCandidates(targets, db)).toEqual([]);
    });

    test("does not report a series that is already delisted", async () => {
      await db("spec_registry_series")
        .where({ series_id: "elite-models-na:online-general" })
        .update({ delisted_at: "2026-08-14T00:00:00.000Z" });

      const targets = await resolveSeries(
        { organization: "elite-model-management", series: [] },
        db,
      );
      const siblings = await siblingCandidates(targets, db);
      expect(siblings.map((row) => row.organization_key)).toEqual(["elite-model-japan"]);
    });

    test("only ever reports — it never widens the removal itself", async () => {
      // Pholio has not established that these three are one legal entity;
      // `legalName` is null on all of them. Delisting a sibling on a shared name
      // prefix would assert a corporate relationship nobody verified.
      const targets = await resolveSeries(
        { organization: "elite-model-management", series: [] },
        db,
      );
      await siblingCandidates(targets, db);
      const stillListed = await db("spec_registry_series")
        .whereNull("delisted_at")
        .pluck("series_id");
      expect(stillListed).toHaveLength(SERIES.length);
    });
  });
});
