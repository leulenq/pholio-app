/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasAgencies = await knex.schema.hasTable('agencies');
  if (!hasAgencies) {
    return;
  }

  const hasSlug = await knex.schema.hasColumn('agencies', 'slug');
  if (!hasSlug) {
    await knex.schema.table('agencies', (table) => {
      table.string('slug').nullable().unique();
    });
  }

  const agencies = await knex('agencies as a')
    .leftJoin('agency_memberships as am', function () {
      this.on('am.agency_id', '=', 'a.id')
        .andOn('am.membership_role', '=', knex.raw('?', ['OWNER']))
        .andOn('am.status', '=', knex.raw('?', ['ACTIVE']));
    })
    .leftJoin('users as u', 'u.id', 'am.user_id')
    .select(
      'a.id as agency_id',
      'a.name as agency_name',
      'a.slug as agency_slug',
      'a.location as agency_location',
      'a.website as agency_website',
      'a.description as agency_description',
      'a.logo_path as agency_logo_path',
      'a.brand_color as agency_brand_color',
      'a.notify_new_applications',
      'a.notify_status_changes',
      'a.default_view',
      'u.email as owner_email',
      'u.first_name as owner_first_name',
      'u.last_name as owner_last_name',
      'u.agency_name as legacy_agency_name',
      'u.agency_slug as legacy_agency_slug',
      'u.agency_location as legacy_agency_location',
      'u.agency_website as legacy_agency_website',
      'u.agency_description as legacy_agency_description',
      'u.agency_logo_path as legacy_agency_logo_path',
      'u.agency_brand_color as legacy_agency_brand_color',
      'u.notify_new_applications as legacy_notify_new_applications',
      'u.notify_status_changes as legacy_notify_status_changes',
      'u.default_view as legacy_default_view',
    );

  for (const agency of agencies) {
    const updateData = {};

    if (!agency.agency_name) {
      updateData.name =
        agency.legacy_agency_name ||
        [agency.owner_first_name, agency.owner_last_name].filter(Boolean).join(' ') ||
        agency.owner_email ||
        'Agency';
    }

    if (!agency.agency_slug && agency.legacy_agency_slug) {
      updateData.slug = agency.legacy_agency_slug;
    }

    if (!agency.agency_location && agency.legacy_agency_location) {
      updateData.location = agency.legacy_agency_location;
    }

    if (!agency.agency_website && agency.legacy_agency_website) {
      updateData.website = agency.legacy_agency_website;
    }

    if (!agency.agency_description && agency.legacy_agency_description) {
      updateData.description = agency.legacy_agency_description;
    }

    if (!agency.agency_logo_path && agency.legacy_agency_logo_path) {
      updateData.logo_path = agency.legacy_agency_logo_path;
    }

    if (!agency.agency_brand_color && agency.legacy_agency_brand_color) {
      updateData.brand_color = agency.legacy_agency_brand_color;
    }

    if (
      agency.notify_new_applications === null ||
      agency.notify_new_applications === undefined
    ) {
      updateData.notify_new_applications =
        agency.legacy_notify_new_applications !== null &&
        agency.legacy_notify_new_applications !== undefined
          ? !!agency.legacy_notify_new_applications
          : true;
    }

    if (
      agency.notify_status_changes === null ||
      agency.notify_status_changes === undefined
    ) {
      updateData.notify_status_changes =
        agency.legacy_notify_status_changes !== null &&
        agency.legacy_notify_status_changes !== undefined
          ? !!agency.legacy_notify_status_changes
          : true;
    }

    if (!agency.default_view && agency.legacy_default_view) {
      updateData.default_view = agency.legacy_default_view;
    }

    if (Object.keys(updateData).length > 0) {
      updateData.updated_at = knex.fn.now();
      await knex('agencies')
        .where({ id: agency.agency_id })
        .update(updateData);
    }
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  const hasAgencies = await knex.schema.hasTable('agencies');
  if (!hasAgencies) {
    return;
  }

  const hasSlug = await knex.schema.hasColumn('agencies', 'slug');
  if (hasSlug) {
    await knex.schema.table('agencies', (table) => {
      table.dropColumn('slug');
    });
  }
};
