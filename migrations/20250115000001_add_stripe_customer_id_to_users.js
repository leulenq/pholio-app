/**
 * Add stripe_customer_id column to users table
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.table('users', (table) => {
    table.string('stripe_customer_id').nullable().unique();
    table.index('stripe_customer_id');
  });
};

exports.down = async function down(knex) {
  await knex.schema.table('users', (table) => {
    table.dropIndex('stripe_customer_id');
    table.dropColumn('stripe_customer_id');
  });
};

