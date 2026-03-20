/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
  const hasCol = await knex.schema.hasColumn('profiles', 'archetype')
  if (hasCol) return

  await knex.schema.alterTable('profiles', (table) => {
    table.string('archetype', 50).nullable()
  })
}

/** @param {import('knex').Knex} knex */
exports.down = async function (knex) {
  const hasCol = await knex.schema.hasColumn('profiles', 'archetype')
  if (!hasCol) return

  await knex.schema.alterTable('profiles', (table) => {
    table.dropColumn('archetype')
  })
}
