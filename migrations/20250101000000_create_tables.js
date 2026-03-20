/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary();
    table.string('email').notNullable().unique();
    table.string('password_hash').notNullable();
    table.enu('role', ['TALENT', 'AGENCY']).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('profiles', (table) => {
    table.uuid('id').primary();
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('slug').notNullable().unique();
    table.string('first_name').notNullable();
    table.string('last_name').notNullable();
    table.string('city').notNullable();
    table.integer('height_cm').notNullable();
    table.string('measurements').notNullable();
    table.text('bio_raw').notNullable();
    table.text('bio_curated').notNullable();
    table.string('hero_image_path');
    table.boolean('is_pro').notNullable().defaultTo(false);
    table
      .uuid('partner_agency_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('images', (table) => {
    table.uuid('id').primary();
    table
      .uuid('profile_id')
      .notNullable()
      .references('id')
      .inTable('profiles')
      .onDelete('CASCADE');
    table.string('path').notNullable();
    table.string('label');
    table.integer('sort').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('commissions', (table) => {
    table.uuid('id').primary();
    table
      .uuid('agency_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .uuid('profile_id')
      .notNullable()
      .references('id')
      .inTable('profiles')
      .onDelete('CASCADE');
    table.decimal('percent').notNullable();
    table.integer('amount_cents').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('commissions');
  await knex.schema.dropTableIfExists('images');
  await knex.schema.dropTableIfExists('profiles');
  await knex.schema.dropTableIfExists('users');
};
