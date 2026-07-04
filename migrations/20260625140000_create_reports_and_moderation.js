/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const reportsExists = await knex.schema.hasTable('reports');
  if (!reportsExists) await knex.schema.createTable('reports', (table) => {
    table.uuid('id').primary().notNullable();
    table.uuid('reporter_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('target_type').notNullable(); // profile|image|message|agency|user
    table.string('target_id').notNullable();
    table.string('reason').notNullable();
    table.text('details').nullable();
    table.string('status').notNullable().defaultTo('pending'); // pending|reviewed|actioned|dismissed
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('reviewed_at').nullable();
    table.uuid('reviewed_by').nullable().references('id').inTable('users').onDelete('SET NULL');
  });

  const hasAccountStatus = await knex.schema.hasColumn('users', 'account_status');
  const hasSuspendedAt = await knex.schema.hasColumn('users', 'suspended_at');
  const hasSuspendedReason = await knex.schema.hasColumn('users', 'suspended_reason');

  if (!hasAccountStatus || !hasSuspendedAt || !hasSuspendedReason) {
    await knex.schema.alterTable('users', (table) => {
      if (!hasAccountStatus) table.string('account_status').notNullable().defaultTo('active');
      if (!hasSuspendedAt) table.timestamp('suspended_at').nullable();
      if (!hasSuspendedReason) table.text('suspended_reason').nullable();
    });
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  // Only drop the columns that THIS migration (140000) actually created.
  //
  // `account_status` is owned by migration 135000_add_user_account_status,
  // which always precedes this one in the migration sequence. Rolling back
  // only 140000 must leave `account_status` intact so 135000's schema stays
  // valid. If we dropped it here, any live code relying on 135000 would 500.
  //
  // `suspended_at` and `suspended_reason` were first introduced by this
  // migration (135000 does not add them), so we are responsible for removing
  // them on rollback. Use hasColumn guards to be safe in case a future
  // migration has already cleaned them up.
  const [hasSuspendedAt, hasSuspendedReason] = await Promise.all([
    knex.schema.hasColumn('users', 'suspended_at'),
    knex.schema.hasColumn('users', 'suspended_reason'),
  ]);

  if (hasSuspendedAt || hasSuspendedReason) {
    await knex.schema.alterTable('users', (table) => {
      if (hasSuspendedAt) table.dropColumn('suspended_at');
      if (hasSuspendedReason) table.dropColumn('suspended_reason');
    });
  }

  await knex.schema.dropTableIfExists('reports');
};
