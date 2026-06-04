/**
 * Corrective migration: add the profile analysis columns that the
 * 20250125000000_add_onboarding_state_machine migration was meant to create
 * but which are missing on drifted databases (the original migration applied
 * partially — its sibling columns landed, these did not).
 *
 * Without these, /casting/entry 500s ("column analysis_status does not exist")
 * because the onboarding entry insert and scout/confirm write them.
 *
 * Idempotent: each column is guarded by hasColumn so this is safe to run on
 * databases where some or all already exist.
 */

exports.up = async function up(knex) {
  const toAdd = [];

  if (!(await knex.schema.hasColumn("profiles", "analysis_status"))) {
    toAdd.push((table) =>
      table
        .string("analysis_status", 20)
        .notNullable()
        .defaultTo("pending")
        .comment("Photo analysis lifecycle: pending | complete | failed"),
    );
  }

  if (!(await knex.schema.hasColumn("profiles", "analysis_error"))) {
    toAdd.push((table) =>
      table.text("analysis_error").nullable().comment("Error message if analysis failed"),
    );
  }

  if (!(await knex.schema.hasColumn("profiles", "photo_key_primary"))) {
    toAdd.push((table) =>
      table
        .string("photo_key_primary", 255)
        .nullable()
        .comment("Canonical storage key for primary photo"),
    );
  }

  if (toAdd.length > 0) {
    await knex.schema.alterTable("profiles", (table) => {
      toAdd.forEach((fn) => fn(table));
    });
  }

  // Match the original migration's index on analysis_status (best-effort).
  if (await knex.schema.hasColumn("profiles", "analysis_status")) {
    try {
      await knex.schema.alterTable("profiles", (table) => {
        table.index("analysis_status", "profiles_analysis_status_index");
      });
    } catch (err) {
      // Index already exists — ignore.
      if (!/already exists/i.test(err.message)) throw err;
    }
  }
};

exports.down = async function down(knex) {
  try {
    await knex.schema.alterTable("profiles", (table) => {
      table.dropIndex("analysis_status", "profiles_analysis_status_index");
    });
  } catch (_) {
    // Index may not exist — ignore.
  }

  for (const col of ["analysis_status", "analysis_error", "photo_key_primary"]) {
    if (await knex.schema.hasColumn("profiles", col)) {
      await knex.schema.alterTable("profiles", (table) => {
        table.dropColumn(col);
      });
    }
  }
};
