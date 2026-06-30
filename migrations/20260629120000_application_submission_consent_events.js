"use strict";

/**
 * Immutable audit trail for agency submission disclosure consent.
 */

exports.up = async function up(knex) {
  if (await knex.schema.hasTable("application_submission_consent_events")) {
    return;
  }

  await knex.schema.createTable("application_submission_consent_events", (table) => {
    table.uuid("id").primary().notNullable();
    table
      .uuid("application_id")
      .notNullable()
      .references("id")
      .inTable("applications")
      .onDelete("CASCADE");
    table
      .uuid("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table
      .uuid("profile_id")
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");
    table
      .uuid("agency_id")
      .notNullable()
      .references("id")
      .inTable("agencies")
      .onDelete("CASCADE");
    table.string("package_fingerprint", 64).notNullable();
    table.string("consent_text_version", 32).notNullable();
    table.string("acknowledgement_version", 32).notNullable();
    table.json("disclosure_snapshot").notNullable();
    table.string("ip_address", 64).nullable();
    table.text("user_agent").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    table.index(
      ["application_id", "created_at"],
      "idx_submission_consent_application_created",
    );
    table.index(
      ["profile_id", "created_at"],
      "idx_submission_consent_profile_created",
    );
    table.index(
      ["agency_id", "created_at"],
      "idx_submission_consent_agency_created",
    );
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("application_submission_consent_events");
};
