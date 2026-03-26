/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasAgencies = await knex.schema.hasTable('agencies');
  if (!hasAgencies) {
    return;
  }

  const hasStartedAt = await knex.schema.hasColumn('agencies', 'onboarding_started_at');
  const hasCompletedAt = await knex.schema.hasColumn('agencies', 'onboarding_completed_at');
  const hasCompletedBy = await knex.schema.hasColumn('agencies', 'onboarding_completed_by_user_id');

  if (!hasStartedAt || !hasCompletedAt || !hasCompletedBy) {
    await knex.schema.alterTable('agencies', (table) => {
      if (!hasStartedAt) {
        table.timestamp('onboarding_started_at').nullable();
      }
      if (!hasCompletedAt) {
        table.timestamp('onboarding_completed_at').nullable();
      }
      if (!hasCompletedBy) {
        table.uuid('onboarding_completed_by_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      }
    });
  }

  await knex('agencies')
    .whereNull('onboarding_completed_at')
    .update({
      onboarding_started_at: knex.raw('COALESCE(onboarding_started_at, created_at, ?)', [knex.fn.now()]),
      onboarding_completed_at: knex.raw('COALESCE(onboarding_completed_at, created_at, ?)', [knex.fn.now()]),
      updated_at: knex.fn.now(),
    });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  const hasAgencies = await knex.schema.hasTable('agencies');
  if (!hasAgencies) {
    return;
  }

  const hasCompletedBy = await knex.schema.hasColumn('agencies', 'onboarding_completed_by_user_id');
  const hasCompletedAt = await knex.schema.hasColumn('agencies', 'onboarding_completed_at');
  const hasStartedAt = await knex.schema.hasColumn('agencies', 'onboarding_started_at');

  await knex.schema.alterTable('agencies', (table) => {
    if (hasCompletedBy) {
      table.dropForeign(['onboarding_completed_by_user_id']);
      table.dropColumn('onboarding_completed_by_user_id');
    }
    if (hasCompletedAt) {
      table.dropColumn('onboarding_completed_at');
    }
    if (hasStartedAt) {
      table.dropColumn('onboarding_started_at');
    }
  });
};
