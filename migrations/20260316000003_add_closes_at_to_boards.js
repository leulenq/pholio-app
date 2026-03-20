/**
 * Adds closes_at TIMESTAMP NULL to boards.
 * Semantics: UTC timestamp at which the casting closes (exclusive end).
 * NULL = no deadline.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
  const hasCol = await knex.schema.hasColumn('boards', 'closes_at')
  if (hasCol) return

  await knex.schema.alterTable('boards', (table) => {
    table.timestamp('closes_at').nullable()
  })
}

/** @param {import('knex').Knex} knex */
exports.down = async function (knex) {
  const hasCol = await knex.schema.hasColumn('boards', 'closes_at')
  if (!hasCol) return

  await knex.schema.alterTable('boards', (table) => {
    table.dropColumn('closes_at')
  })
}
