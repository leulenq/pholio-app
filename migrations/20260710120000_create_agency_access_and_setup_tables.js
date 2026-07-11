"use strict";

/**
 * Agency reviewed-access + setup foundation.
 *
 * Public agency request pages live in pholio-landing; this app owns the intake
 * API, review/provisioning persistence, authenticated agency setup state, and
 * import-intake records used after approval.
 */

exports.up = async function up(knex) {
  const isPostgres =
    knex.client.config.client === "pg" ||
    knex.client.config.client === "postgresql";

  const uuidPk = (table) => {
    if (isPostgres) {
      table.uuid("id").primary().defaultTo(knex.fn.uuid());
    } else {
      table.uuid("id").primary();
    }
  };

  const jsonCol = (table, name) =>
    isPostgres ? table.jsonb(name).nullable() : table.text(name).nullable();

  if (!(await knex.schema.hasTable("agency_access_requests"))) {
    await knex.schema.createTable("agency_access_requests", (table) => {
      uuidPk(table);
      table.string("agency_name", 180).notNullable();
      table.string("website_url", 512).notNullable();
      table.string("primary_market_city", 120).notNullable();
      table.string("primary_market_country", 120).nullable();
      jsonCol(table, "additional_locations");
      table.string("agency_type", 80).notNullable();
      jsonCol(table, "primary_boards");
      table.string("roster_size_range", 40).notNullable();
      table.string("team_size_range", 40).notNullable();
      table.string("current_system", 120).nullable();
      jsonCol(table, "first_use_cases");
      table.string("migration_interest", 20).nullable();
      table.string("contact_name", 160).notNullable();
      table.string("contact_email", 254).notNullable();
      table.string("contact_role", 120).notNullable();
      table.string("contact_phone", 80).nullable();
      table.string("timezone", 80).nullable();
      table.string("heard_from", 160).nullable();
      table.text("notes").nullable();
      table.string("status", 40).notNullable().defaultTo("submitted");
      table.uuid("reviewer_user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
      table.text("review_notes_internal").nullable();
      table.timestamp("qualification_call_at").nullable();
      table.timestamp("approved_at").nullable();
      table.timestamp("declined_at").nullable();
      table.uuid("provisioned_agency_id").nullable().references("id").inTable("agencies").onDelete("SET NULL");
      table.uuid("provisioned_owner_user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
      table.string("ip_hash", 64).nullable();
      table.string("user_agent", 512).nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

      table.index(["status", "created_at"], "idx_agency_access_status_created");
      table.index(["contact_email"], "idx_agency_access_contact_email");
      table.index(["agency_name"], "idx_agency_access_agency_name");
    });
  }

  if (!(await knex.schema.hasTable("agency_access_request_events"))) {
    await knex.schema.createTable("agency_access_request_events", (table) => {
      uuidPk(table);
      table.uuid("request_id").notNullable().references("id").inTable("agency_access_requests").onDelete("CASCADE");
      table.uuid("actor_user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
      table.string("actor_email", 254).nullable();
      table.string("event_type", 80).notNullable();
      table.string("previous_status", 40).nullable();
      table.string("next_status", 40).nullable();
      table.uuid("provisioned_agency_id").nullable().references("id").inTable("agencies").onDelete("SET NULL");
      table.uuid("provisioned_owner_user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
      table.string("source_ip", 80).nullable();
      jsonCol(table, "metadata");
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

      table.index(["request_id", "created_at"], "idx_access_events_request_time");
      table.index(["event_type", "created_at"], "idx_access_events_type_time");
    });
  }

  if (!(await knex.schema.hasTable("agency_setup_steps"))) {
    await knex.schema.createTable("agency_setup_steps", (table) => {
      uuidPk(table);
      table.uuid("agency_id").notNullable().references("id").inTable("agencies").onDelete("CASCADE");
      table.string("step_key", 80).notNullable();
      table.string("status", 40).notNullable().defaultTo("not_started");
      table.uuid("completed_by_user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
      table.timestamp("completed_at").nullable();
      jsonCol(table, "data");
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

      table.unique(["agency_id", "step_key"], "uniq_agency_setup_step");
      table.index(["agency_id", "status"], "idx_agency_setup_status");
    });
  }

  if (!(await knex.schema.hasTable("agency_import_jobs"))) {
    await knex.schema.createTable("agency_import_jobs", (table) => {
      uuidPk(table);
      table.uuid("agency_id").notNullable().references("id").inTable("agencies").onDelete("CASCADE");
      table.uuid("requested_by_user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
      table.string("source_type", 80).notNullable();
      table.string("status", 40).notNullable().defaultTo("uploaded");
      table.string("original_filename", 255).nullable();
      jsonCol(table, "mapping");
      jsonCol(table, "validation_summary");
      table.boolean("includes_minors").notNullable().defaultTo(false);
      table.timestamp("completed_at").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

      table.index(["agency_id", "status"], "idx_agency_import_jobs_status");
      table.index(["agency_id", "created_at"], "idx_agency_import_jobs_created");
    });
  }

  if (await knex.schema.hasTable("agencies")) {
    const agencyColumns = [
      ["minor_data_acknowledged_at", (table) => table.timestamp("minor_data_acknowledged_at").nullable()],
      ["setup_return_to", (table) => table.string("setup_return_to", 512).nullable()],
      ["support_email", (table) => table.string("support_email", 254).nullable()],
      ["agency_type", (table) => table.string("agency_type", 80).nullable()],
    ];

    for (const [column, addColumn] of agencyColumns) {
      if (!(await knex.schema.hasColumn("agencies", column))) {
        await knex.schema.alterTable("agencies", addColumn);
      }
    }
  }

  if (await knex.schema.hasTable("agency_open_call_links")) {
    const openCallColumns = [
      ["default_roster_board_id", (table) => table.uuid("default_roster_board_id").nullable()],
      ["receiving_board_ids", (table) => jsonCol(table, "receiving_board_ids")],
      ["instructions_by_board", (table) => jsonCol(table, "instructions_by_board")],
      ["accepts_minors", (table) => table.boolean("accepts_minors").notNullable().defaultTo(false)],
      ["guardian_consent_required", (table) => table.boolean("guardian_consent_required").notNullable().defaultTo(false)],
      ["notification_recipient_membership_ids", (table) => jsonCol(table, "notification_recipient_membership_ids")],
    ];

    for (const [column, addColumn] of openCallColumns) {
      if (!(await knex.schema.hasColumn("agency_open_call_links", column))) {
        await knex.schema.alterTable("agency_open_call_links", addColumn);
      }
    }
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable("agency_open_call_links")) {
    await knex.schema.alterTable("agency_open_call_links", (table) => {
      table.dropColumn("default_roster_board_id");
      table.dropColumn("receiving_board_ids");
      table.dropColumn("instructions_by_board");
      table.dropColumn("accepts_minors");
      table.dropColumn("guardian_consent_required");
      table.dropColumn("notification_recipient_membership_ids");
    });
  }

  if (await knex.schema.hasTable("agencies")) {
    await knex.schema.alterTable("agencies", (table) => {
      table.dropColumn("minor_data_acknowledged_at");
      table.dropColumn("setup_return_to");
      table.dropColumn("support_email");
      table.dropColumn("agency_type");
    });
  }

  await knex.schema.dropTableIfExists("agency_import_jobs");
  await knex.schema.dropTableIfExists("agency_setup_steps");
  await knex.schema.dropTableIfExists("agency_access_request_events");
  await knex.schema.dropTableIfExists("agency_access_requests");
};
