/**
 * Matching Stage 1 — brief scope + conflict data.
 *
 *  - casting_briefs      brief-specific facts a casting board carries: shoot
 *                        window, market, usage/exclusivity spec, media required,
 *                        target look, and the division board it inherits from.
 *                        (No money/budget fields — Pholio has no payments system.)
 *  - talent_commitments  the option/hold/booked/bookout calendar + usage/
 *                        exclusivity commitments the availability and
 *                        usage_exclusivity constraints reason against.
 *
 * Non-breaking and idempotent.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const isPostgres =
    knex.client.config.client === "pg" ||
    knex.client.config.client === "postgresql";
  const jsonCol = (table, name) =>
    isPostgres ? table.jsonb(name).nullable() : table.text(name).nullable();
  const uuidPk = (table) =>
    isPostgres
      ? table.uuid("id").primary().defaultTo(knex.fn.uuid())
      : table.uuid("id").primary();

  // 1. casting_briefs -----------------------------------------------------------
  const hasBriefs = await knex.schema.hasTable("casting_briefs");
  if (!hasBriefs && (await knex.schema.hasTable("boards"))) {
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
      jsonCol(table, "usage"); // { territory, media[], duration, exclusivity, category }
      jsonCol(table, "media_requirements"); // ["digitals","polaroids","reel"]
      jsonCol(table, "look_target"); // aesthetic target for this job
      table.integer("target_slots").nullable();
      table.text("notes").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.unique(["board_id"]);
      table.index("board_id");
      table.index("parent_board_id");
    });
  }

  // 2. talent_commitments -------------------------------------------------------
  const hasCommit = await knex.schema.hasTable("talent_commitments");
  if (!hasCommit && (await knex.schema.hasTable("profiles"))) {
    await knex.schema.createTable("talent_commitments", (table) => {
      uuidPk(table);
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table.uuid("agency_id").nullable();
      table
        .string("kind", 20)
        .notNullable()
        .comment("option | hold | booked | bookout");
      table
        .integer("option_tier")
        .nullable()
        .comment("1 = 1st option, 2 = 2nd option (for kind = option)");
      table.date("start_date").nullable();
      table.date("end_date").nullable();
      table.string("market").nullable();
      table.string("client_ref").nullable().comment("client/job label, non-financial");
      table
        .string("category")
        .nullable()
        .comment("usage/exclusivity category, e.g. cosmetics, denim");
      table.boolean("exclusivity").notNullable().defaultTo(false);
      table.date("exclusivity_until").nullable();
      jsonCol(table, "usage"); // { territory, media[] } committed
      table.text("notes").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.index("profile_id");
      table.index(["profile_id", "kind"]);
      table.index(["start_date", "end_date"]);
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("talent_commitments");
  await knex.schema.dropTableIfExists("casting_briefs");
};
