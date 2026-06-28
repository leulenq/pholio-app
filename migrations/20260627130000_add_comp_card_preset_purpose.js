/**
 * Comp-card variants are strategic, not decorative: working models keep a
 * different card per board/division (commercial vs editorial) and per market
 * (NYC vs Paris). Tag each saved preset with its purpose so the talent can name
 * it meaningfully and the apply flow can default to the card that matches the
 * agency's board.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasBoard = await knex.schema.hasColumn('comp_card_presets', 'board');
  const hasMarket = await knex.schema.hasColumn('comp_card_presets', 'market');
  if (!hasBoard || !hasMarket) {
    await knex.schema.alterTable('comp_card_presets', (table) => {
      if (!hasBoard) table.string('board', 64).nullable();
      if (!hasMarket) table.string('market', 64).nullable();
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasBoard = await knex.schema.hasColumn('comp_card_presets', 'board');
  const hasMarket = await knex.schema.hasColumn('comp_card_presets', 'market');
  if (hasBoard || hasMarket) {
    await knex.schema.alterTable('comp_card_presets', (table) => {
      if (hasBoard) table.dropColumn('board');
      if (hasMarket) table.dropColumn('market');
    });
  }
};
