/**
 * @param {import('knex')} knex
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table.boolean('email_verified').defaultTo(false);
    table.string('verification_code').nullable();
    table.timestamp('verification_code_expires_at').nullable();
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('verification_code_expires_at');
    table.dropColumn('verification_code');
    table.dropColumn('email_verified');
  });
};
