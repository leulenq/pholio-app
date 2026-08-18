/**
 * Drop `casting_briefs`.
 *
 * The table was created in 20260706130000 to carry job-specific facts (shoot
 * dates, usage, media requirements, look target) for a casting board, and was
 * read only by the matching engine when compiling brief-scope criteria. It
 * never had a writer — no route, service or seed ever inserted a row.
 *
 * The August 2026 product plan ends Pholio's agency product at the
 * representation decision. Job briefs, shoot dates and usage terms belong to
 * the system the agency already runs bookings in, and the matching engine that
 * was the table's only reader is removed in the same change.
 *
 * `down` recreates the table exactly as 20260706130000 built it, so rolling
 * back restores the schema. It cannot restore rows, which is safe here only
 * because there were never any.
 */

exports.up = async function up(knex) {
  await knex.schema.dropTableIfExists("casting_briefs");
};

exports.down = async function down(knex) {
  const isPg = knex.client.config.client === "pg";
  const uuidPk = (table) =>
    isPg
      ? table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
      : table.uuid("id").primary();
  const jsonCol = (table, name) =>
    isPg ? table.jsonb(name).nullable() : table.text(name).nullable();

  const exists = await knex.schema.hasTable("casting_briefs");
  if (exists || !(await knex.schema.hasTable("boards"))) return;

  await knex.schema.createTable("casting_briefs", (table) => {
    uuidPk(table);
    table
      .uuid("board_id")
      .notNullable()
      .references("id")
      .inTable("boards")
      .onDelete("CASCADE")
      .comment("The casting board (boards.kind = 'casting') this brief backs");
    table
      .uuid("parent_board_id")
      .nullable()
      .references("id")
      .inTable("boards")
      .onDelete("SET NULL")
      .comment("Division board this brief inherits criteria from");
    table.date("shoot_start").nullable();
    table.date("shoot_end").nullable();
    table.string("market").nullable();
    jsonCol(table, "usage");
    jsonCol(table, "media_requirements");
    jsonCol(table, "look_target");
    table.integer("target_slots").nullable();
    table.text("notes").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table.unique(["board_id"]);
    table.index("board_id");
    table.index("parent_board_id");
  });
};
