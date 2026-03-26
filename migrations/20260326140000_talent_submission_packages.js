/**
 * Talent submission packages: snapshot of selected media (+ optional comp-card flag)
 * for agency/application workflows, with audit via activities.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("talent_submission_packages")) {
    return;
  }

  await knex.schema.createTable("talent_submission_packages", (table) => {
    table.uuid("id").primary();
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
    table.string("label").nullable();
    table.json("payload").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.index(["user_id", "created_at"]);
    table.index(["profile_id", "created_at"]);
  });
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("talent_submission_packages");
};
