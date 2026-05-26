const {
  REFERENCE_LANGUAGES,
} = require("../src/shared/data/reference-languages");

/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable("reference_languages");
  if (exists) return;

  await knex.schema.createTable("reference_languages", (table) => {
    table.increments("id").primary();
    table.string("code", 12).notNullable().unique();
    table.string("name", 100).notNullable().unique();
    table.integer("sort_order").notNullable().defaultTo(0);
    table.index(["sort_order", "name"]);
  });

  await knex("reference_languages").insert(
    REFERENCE_LANGUAGES.map((lang, index) => ({
      code: lang.code,
      name: lang.name,
      sort_order: lang.sort_order ?? index,
    })),
  );
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("reference_languages");
};
