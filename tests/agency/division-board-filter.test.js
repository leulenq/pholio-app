"use strict";

const knex = require("../../src/shared/db/knex");

/**
 * `boards` is dual-purpose: standing DIVISIONS and CASTING/PACKAGE boards,
 * discriminated by a NULLABLE `board_type`. Every board created before that
 * column existed — including all divisions created by agency setup — is NULL.
 *
 * The filter therefore has to keep NULLs, and the obvious SQL does not:
 * `whereNot('board_type', 'package')` evaluates `NULL <> 'package'` to NULL,
 * which is not true, so it silently drops almost every real division.
 *
 * These tests pin that behaviour against a real database rather than trusting
 * the reasoning.
 */
describe("division board filter — NULL board_type must count as a division", () => {
  const table = "board_filter_fixture";

  beforeAll(async () => {
    await knex.schema.dropTableIfExists(table);
    await knex.schema.createTable(table, (t) => {
      t.increments("id");
      t.string("name");
      t.string("board_type").nullable();
    });
    await knex(table).insert([
      { name: "Women", board_type: null }, // created by setup, pre-column
      { name: "Editorial", board_type: "division" }, // created after
      { name: "Nike SS26", board_type: "package" }, // a casting board
    ]);
  });

  afterAll(async () => {
    await knex.schema.dropTableIfExists(table);
    await knex.destroy();
  });

  it("demonstrates the trap: whereNot alone drops NULL-typed divisions", async () => {
    const rows = await knex(table).whereNot("board_type", "package").select("name");
    const names = rows.map((r) => r.name);

    // The bug: "Women" is a division and vanishes.
    expect(names).not.toContain("Women");
    expect(names).toEqual(["Editorial"]);
  });

  it("keeps NULL-typed and explicit divisions, and excludes casting boards", async () => {
    const rows = await knex(table)
      .where((scope) => scope.whereNull("board_type").orWhereNot("board_type", "package"))
      .select("name");
    const names = rows.map((r) => r.name).sort();

    expect(names).toEqual(["Editorial", "Women"]);
    expect(names).not.toContain("Nike SS26");
  });

  it("selects only casting boards when asked for packages", async () => {
    const rows = await knex(table).where("board_type", "package").select("name");
    expect(rows.map((r) => r.name)).toEqual(["Nike SS26"]);
  });
});
