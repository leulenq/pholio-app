/**
 * CSAM escalation tracking (internal review — not automated NCMEC submission).
 */

exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable("csam_escalations");
  if (!exists) {
    await knex.schema.createTable("csam_escalations", (table) => {
      table.uuid("id").primary();
      table
        .uuid("image_id")
        .notNullable()
        .references("id")
        .inTable("images")
        .onDelete("CASCADE");
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table.string("provider").notNullable().defaultTo("heuristic_escalation");
      table.string("severity").notNullable().defaultTo("medium");
      table.string("status").notNullable().defaultTo("pending_review");
      table.json("flags").nullable();
      table.text("notes").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("reviewed_at").nullable();
      table.uuid("reviewed_by").nullable();
    });
    await knex.schema.raw(
      "CREATE INDEX IF NOT EXISTS csam_escalations_status_index ON csam_escalations (status)",
    );
  }
};

exports.down = async function down(knex) {
  const exists = await knex.schema.hasTable("csam_escalations");
  if (exists) {
    await knex.schema.dropTableIfExists("csam_escalations");
  }
};
