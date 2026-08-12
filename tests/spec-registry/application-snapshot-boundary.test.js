"use strict";

const knexFactory = require("knex");

const {
  recordAdvisorySpecSnapshot,
} = require("../../src/domains/talent/routes/applications")._test;

describe("advisory application snapshot transaction boundary", () => {
  let db;

  beforeEach(async () => {
    db = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await db.schema.createTable("submission_marker", (table) => {
      table.string("id").primary();
    });
    await db.schema.createTable("registry_marker", (table) => {
      table.string("id").primary();
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("rolls a registry SQL failure back to a savepoint and commits the send", async () => {
    await db.transaction(async (trx) => {
      await trx("submission_marker").insert({ id: "before" });

      const result = await recordAdvisorySpecSnapshot(
        trx,
        { applicationId: "application-1" },
        async (registryTrx) => {
          await registryTrx("registry_marker").insert({ id: "rolled-back" });
          await registryTrx("table_that_does_not_exist").insert({ id: "fail" });
        },
      );

      expect(result).toBeNull();
      await trx("submission_marker").insert({ id: "after" });
    });

    await expect(db("submission_marker").orderBy("id").pluck("id")).resolves.toEqual([
      "after",
      "before",
    ]);
    await expect(db("registry_marker").select()).resolves.toEqual([]);
  });
});
