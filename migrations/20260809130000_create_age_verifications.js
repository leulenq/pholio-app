"use strict";

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable("age_verifications"))) {
    await knex.schema.createTable("age_verifications", (table) => {
      table.uuid("id").primary();
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table.string("provider", 32).notNullable().defaultTo("stripe_identity");
      table.string("provider_session_id", 128).nullable().unique();
      table.string("status", 32).notNullable().defaultTo("creating");
      table.boolean("verified_over_18").notNullable().defaultTo(false);
      table.boolean("dob_matches_profile").notNullable().defaultTo(false);
      table.string("failure_code", 100).nullable();
      table.string("consent_version", 32).nullable();
      table.timestamp("consented_at").nullable();
      table.timestamp("verified_at").nullable();
      table.timestamp("redaction_requested_at").nullable();
      table.timestamp("redacted_at").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

      table.index(["profile_id", "created_at"]);
      table.index(["profile_id", "status"]);
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("age_verifications");
};
