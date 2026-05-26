const {
  REFERENCE_LANGUAGES,
} = require("../src/shared/data/reference-languages");
const {
  clearLanguageLookupCache,
} = require("../src/shared/lib/language-reference");

/**
 * Replace reference_languages with the full Google Translation Hub NMT list.
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable("reference_languages");
  if (!exists) return;

  await knex.schema.alterTable("reference_languages", (table) => {
    table.string("code", 16).notNullable().alter();
  });

  await knex("reference_languages").del();

  await knex("reference_languages").insert(
    REFERENCE_LANGUAGES.map((lang, index) => ({
      code: lang.code,
      name: lang.name,
      sort_order: lang.sort_order ?? index,
    })),
  );

  clearLanguageLookupCache();
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down() {
  clearLanguageLookupCache();
};
