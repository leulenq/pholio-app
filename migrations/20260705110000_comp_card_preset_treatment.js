/**
 * Name-treatment pin on saved comp cards: 'classic' | 'statement' |
 * a named choreography variant ('straddle' | 'over' | 'band' | 'inset').
 * Null = Pholio's choice. Frozen plans remain authoritative for rendering;
 * this column keeps the parameter fallback (and future redesigns) honest.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable("comp_card_presets", (table) => {
    table.string("treatment", 16);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("comp_card_presets", (table) => {
    table.dropColumn("treatment");
  });
};
