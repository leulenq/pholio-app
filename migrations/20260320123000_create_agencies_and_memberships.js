/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';

  const hasAgencies = await knex.schema.hasTable('agencies');
  if (!hasAgencies) {
    await knex.schema.createTable('agencies', (table) => {
      table.uuid('id').primary();
      table.string('name').notNullable();
      table.string('slug').nullable().unique();
      table.string('location').nullable();
      table.string('website').nullable();
      table.text('description').nullable();
      table.string('logo_path').nullable();
      table.string('brand_color').nullable();
      table.boolean('notify_new_applications').notNullable().defaultTo(true);
      table.boolean('notify_status_changes').notNullable().defaultTo(true);
      table.string('default_view').nullable();
      table.timestamp('onboarding_started_at').nullable();
      table.timestamp('onboarding_completed_at').nullable();
      table.uuid('onboarding_completed_by_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('status').notNullable().defaultTo('ACTIVE');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  const hasMemberships = await knex.schema.hasTable('agency_memberships');
  if (!hasMemberships) {
    await knex.schema.createTable('agency_memberships', (table) => {
      table.uuid('id').primary();
      table.uuid('agency_id').notNullable().references('id').inTable('agencies').onDelete('CASCADE');
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('membership_role').notNullable().defaultTo('MEMBER');
      table.string('status').notNullable().defaultTo('ACTIVE');
      table.timestamp('invited_at').nullable();
      table.timestamp('joined_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique(['agency_id', 'user_id']);
      table.index(['user_id', 'status']);
    });
  }

  const legacyAgencyUsers = await knex('users')
    .where({ role: 'AGENCY' })
    .select(
      'id',
      'email',
      'first_name',
      'last_name',
      'agency_name',
      'agency_slug',
      'agency_location',
      'agency_website',
      'agency_description',
      'agency_logo_path',
      'agency_brand_color',
      'notify_new_applications',
      'notify_status_changes',
      'default_view',
      'created_at'
    );

  for (const user of legacyAgencyUsers) {
    const existingAgency = await knex('agencies').where({ id: user.id }).first();
    if (!existingAgency) {
      await knex('agencies').insert({
        id: user.id,
        name: user.agency_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
        slug: user.agency_slug || null,
        location: user.agency_location || null,
        website: user.agency_website || null,
        description: user.agency_description || null,
        logo_path: user.agency_logo_path || null,
        brand_color: user.agency_brand_color || null,
        notify_new_applications: user.notify_new_applications !== undefined ? !!user.notify_new_applications : true,
        notify_status_changes: user.notify_status_changes !== undefined ? !!user.notify_status_changes : true,
        default_view: user.default_view || null,
        status: 'ACTIVE',
        created_at: user.created_at || knex.fn.now(),
        updated_at: knex.fn.now(),
      });
    }

    const membership = await knex('agency_memberships')
      .where({ agency_id: user.id, user_id: user.id })
      .first();

    if (!membership) {
      await knex('agency_memberships').insert({
        id: isPostgres ? knex.raw('gen_random_uuid()') : require('uuid').v4(),
        agency_id: user.id,
        user_id: user.id,
        membership_role: 'OWNER',
        status: 'ACTIVE',
        joined_at: user.created_at || knex.fn.now(),
        created_at: user.created_at || knex.fn.now(),
        updated_at: knex.fn.now(),
      });
    }
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('agency_memberships');
  await knex.schema.dropTableIfExists('agencies');
};
