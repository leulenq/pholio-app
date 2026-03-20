/**
 * Create subscriptions table for Stripe subscription management
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('subscriptions', (table) => {
    table.uuid('id').primary();
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('stripe_customer_id').notNullable().unique();
    table.string('stripe_subscription_id').nullable().unique();
    table.string('stripe_price_id').notNullable(); // Stripe Price ID for Pro plan
    table
      .enu('status', ['trialing', 'active', 'past_due', 'canceled', 'unpaid'])
      .notNullable()
      .defaultTo('trialing');
    table.timestamp('trial_start').nullable();
    table.timestamp('trial_end').nullable();
    table.timestamp('current_period_start').nullable();
    table.timestamp('current_period_end').nullable();
    table.boolean('cancel_at_period_end').notNullable().defaultTo(false);
    table.timestamp('canceled_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Indexes for common queries
    table.index('user_id');
    table.index('stripe_customer_id');
    table.index('stripe_subscription_id');
    table.index('status');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('subscriptions');
};

