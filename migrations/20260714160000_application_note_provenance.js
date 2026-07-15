/**
 * Attribute every private agency note to a human member and preserve an
 * append-only change trail. Deletes become tombstones.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasNotes = await knex.schema.hasTable("application_notes");
  if (!hasNotes) return;

  const columns = {
    created_by_user_id: await knex.schema.hasColumn("application_notes", "created_by_user_id"),
    updated_by_user_id: await knex.schema.hasColumn("application_notes", "updated_by_user_id"),
    deleted_at: await knex.schema.hasColumn("application_notes", "deleted_at"),
    deleted_by_user_id: await knex.schema.hasColumn("application_notes", "deleted_by_user_id"),
  };
  await knex.schema.table("application_notes", (table) => {
    if (!columns.created_by_user_id) {
      table.uuid("created_by_user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
    }
    if (!columns.updated_by_user_id) {
      table.uuid("updated_by_user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
    }
    if (!columns.deleted_at) table.timestamp("deleted_at").nullable();
    if (!columns.deleted_by_user_id) {
      table.uuid("deleted_by_user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
    }
  });

  const hasAudit = await knex.schema.hasTable("application_note_audit_events");
  if (!hasAudit) {
    await knex.schema.createTable("application_note_audit_events", (table) => {
      table.uuid("id").primary();
      table.uuid("note_id").notNullable();
      table.uuid("application_id").notNullable().references("id").inTable("applications").onDelete("CASCADE");
      table.uuid("agency_id").notNullable().references("id").inTable("agencies").onDelete("CASCADE");
      table.uuid("actor_user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
      table.string("event_type", 24).notNullable();
      table.text("before_note").nullable();
      table.text("after_note").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.index(["note_id", "created_at"]);
      table.index(["agency_id", "created_at"]);
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("application_note_audit_events");
  const hasNotes = await knex.schema.hasTable("application_notes");
  if (!hasNotes) return;
  await knex.schema.table("application_notes", (table) => {
    table.dropColumn("deleted_by_user_id");
    table.dropColumn("deleted_at");
    table.dropColumn("updated_by_user_id");
    table.dropColumn("created_by_user_id");
  });
};
