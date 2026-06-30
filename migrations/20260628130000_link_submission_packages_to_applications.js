"use strict";

/**
 * Give submission snapshots an explicit application relationship and persist
 * the talent's selected agency divisions relationally.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("talent_submission_packages")) {
    const hasApplicationId = await knex.schema.hasColumn(
      "talent_submission_packages",
      "application_id",
    );
    if (!hasApplicationId) {
      await knex.schema.alterTable("talent_submission_packages", (table) => {
        table.uuid("application_id").nullable().index();
      });
    }

    const rows = await knex("talent_submission_packages")
      .whereNull("application_id")
      .select("id", "payload");
    for (const row of rows) {
      const payload = parsePayload(row.payload);
      if (typeof payload.applicationId === "string" && payload.applicationId) {
        await knex("talent_submission_packages")
          .where({ id: row.id })
          .update({ application_id: payload.applicationId });
      }
    }
  }

  if (!(await knex.schema.hasTable("application_submission_boards"))) {
    await knex.schema.createTable("application_submission_boards", (table) => {
      table.uuid("id").primary();
      table
        .uuid("application_id")
        .notNullable()
        .references("id")
        .inTable("applications")
        .onDelete("CASCADE");
      table
        .uuid("agency_id")
        .notNullable()
        .references("id")
        .inTable("agencies")
        .onDelete("CASCADE");
      table.string("board_name", 120).notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());

      table.unique(["application_id", "board_name"]);
      table.index(["agency_id", "board_name"]);
    });
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("application_submission_boards");
  if (
    (await knex.schema.hasTable("talent_submission_packages")) &&
    (await knex.schema.hasColumn(
      "talent_submission_packages",
      "application_id",
    ))
  ) {
    await knex.schema.alterTable("talent_submission_packages", (table) => {
      table.dropColumn("application_id");
    });
  }
};

function parsePayload(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
