/**
 * Feedback log for image classification corrections (calibration, not training).
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable("image_classification_feedback");
  if (exists) return;

  const isPg =
    knex.client.config.client === "pg" ||
    knex.client.config.client === "postgresql";

  await knex.schema.createTable("image_classification_feedback", (table) => {
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
    table.string("predicted_shot_type").nullable();
    table.string("predicted_style_type").nullable();
    table.string("predicted_image_type").nullable();
    table.string("corrected_shot_type").nullable();
    table.string("corrected_style_type").nullable();
    table.string("corrected_image_type").nullable();
    if (isPg) {
      table.jsonb("confidence_json").nullable();
    } else {
      table.text("confidence_json").nullable();
    }
    table.string("model").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.index(["profile_id"]);
    table.index(["image_id"]);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("image_classification_feedback");
};
