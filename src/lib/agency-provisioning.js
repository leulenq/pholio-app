const knex = require('../shared/db/knex');
const { v4: uuidv4 } = require('uuid');

async function provisionAgencyForUser({
  userId,
  agencyName,
  location = null,
  website = null,
  description = null,
  logoPath = null,
  brandColor = null,
  db = knex,
}) {
  if (!userId || !agencyName) {
    throw new Error('userId and agencyName are required');
  }

  return db.transaction(async (trx) => {
    const user = await trx('users').where({ id: userId }).first();
    if (!user) {
      throw new Error('User not found');
    }

    if (user.role !== 'AGENCY') {
      await trx('users').where({ id: userId }).update({ role: 'AGENCY' });
    }

    // If the user is already a member of an agency, treat provisioning as idempotent
    // and update that organization rather than creating a second one.
    const existingMembership = await trx('agency_memberships as am')
      .join('agencies as a', 'a.id', 'am.agency_id')
      .where({
        'am.user_id': userId,
        'am.status': 'ACTIVE',
      })
      .select(
        'am.id as membership_id',
        'am.membership_role',
        'a.id',
        'a.name',
        'a.location',
        'a.website',
        'a.description',
        'a.logo_path',
        'a.brand_color',
        'a.status',
      )
      .orderBy([
        { column: 'am.membership_role', order: 'asc' },
        { column: 'am.created_at', order: 'asc' },
      ])
      .first();

    if (existingMembership) {
      const updateData = {
        name: agencyName,
        location,
        website,
        description,
        logo_path: logoPath,
        brand_color: brandColor,
        updated_at: trx.fn.now(),
      };

      await trx('agencies')
        .where({ id: existingMembership.id })
        .update(updateData);

      return trx('agencies').where({ id: existingMembership.id }).first();
    }

    const agencyId = uuidv4();
    await trx('agencies').insert({
      id: agencyId,
      name: agencyName,
      location,
      website,
      description,
      logo_path: logoPath,
      brand_color: brandColor,
      status: 'ACTIVE',
      created_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });

    await trx('agency_memberships').insert({
      id: uuidv4(),
      agency_id: agencyId,
      user_id: userId,
      membership_role: 'OWNER',
      status: 'ACTIVE',
      joined_at: trx.fn.now(),
      created_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });

    return trx('agencies').where({ id: agencyId }).first();
  });
}

module.exports = {
  provisionAgencyForUser,
};
