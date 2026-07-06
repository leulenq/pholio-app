/**
 * Matching Stage 3 — learning loop + fairness monitoring.
 *
 *  - match_decisions        booker decisions (advance/shortlist/pass/book/release)
 *                           = the preference labels the learner trains on.
 *  - match_fairness_audits  impact-ratio snapshots of the learned model, for the
 *                           feedback-loop bias monitoring the design requires.
 *
 * (agency_preference_model already exists from Stage 0 and holds the learned
 * per-agency capacities the learner writes.)
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

  const hasDecisions = await knex.schema.hasTable("match_decisions");
  if (!hasDecisions && (await knex.schema.hasTable("profiles"))) {
    await knex.schema.createTable("match_decisions", (table) => {
      uuidPk(table);
      table.uuid("agency_id").notNullable();
      table.string("scope_type", 20).notNullable();
      table.uuid("scope_id").notNullable();
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table
        .uuid("evaluation_id")
        .nullable()
        .comment("match_evaluations.id the decision was made against");
      table
        .string("decision", 20)
        .notNullable()
        .comment("advance | shortlist | pass | book | release");
      table.uuid("decided_by").nullable();
      table.text("notes").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.index(["agency_id", "scope_type", "scope_id"]);
      table.index("profile_id");
    });
  }

  const hasAudits = await knex.schema.hasTable("match_fairness_audits");
  if (!hasAudits) {
    await knex.schema.createTable("match_fairness_audits", (table) => {
      uuidPk(table);
      table.uuid("agency_id").notNullable();
      table.string("scope_type", 20).nullable();
      table.uuid("scope_id").nullable();
      table
        .string("attribute", 40)
        .notNullable()
        .comment("monitored (NOT scored) attribute, e.g. gender");
      jsonCol(table, "rates"); // { group: { selected, total, rate } }
      table.decimal("impact_ratio", 5, 4).nullable();
      table.boolean("flagged").notNullable().defaultTo(false);
      table.integer("sample_size").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.index(["agency_id", "attribute"]);
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("match_fairness_audits");
  await knex.schema.dropTableIfExists("match_decisions");
};
