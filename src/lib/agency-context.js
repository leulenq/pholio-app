const knex = require('../shared/db/knex');

function getSessionLike(value) {
  if (!value) {
    return null;
  }

  return value.session || value;
}

function getSessionActorUserId(value) {
  const session = getSessionLike(value);
  return session?.memberUserId || session?.userId || null;
}

function getSessionAgencyId(value) {
  const session = getSessionLike(value);
  return session?.agencyId || (session?.role === 'AGENCY' ? session?.userId : null) || null;
}

async function ensureLegacyAgencyContextForUser(userId, db = knex) {
  const user = await db('users').where({ id: userId, role: 'AGENCY' }).first();
  if (!user) return null;

  const hasAgencies = await db.schema.hasTable('agencies');
  const hasMemberships = await db.schema.hasTable('agency_memberships');

  if (!hasAgencies || !hasMemberships) {
    return {
      agency: {
        id: user.id,
        name: user.agency_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
        location: user.agency_location || null,
        website: user.agency_website || null,
        description: user.agency_description || null,
        logo_path: user.agency_logo_path || null,
        brand_color: user.agency_brand_color || null,
        notify_new_applications: user.notify_new_applications !== undefined ? !!user.notify_new_applications : true,
        notify_status_changes: user.notify_status_changes !== undefined ? !!user.notify_status_changes : true,
        default_view: user.default_view || null,
        onboarding_started_at: null,
        onboarding_completed_at: null,
        status: 'ACTIVE',
      },
      membership: {
        id: null,
        membership_role: 'OWNER',
        status: 'ACTIVE',
      },
      user,
    };
  }
  return null;
}

async function resolveAgencyContextForMemberUser(userId, db = knex) {
  const hasAgencies = await db.schema.hasTable('agencies');
  const hasMemberships = await db.schema.hasTable('agency_memberships');
  if (!hasAgencies || !hasMemberships) {
    return ensureLegacyAgencyContextForUser(userId, db);
  }

  const membershipRow = await db('agency_memberships as am')
    .join('agencies as a', 'a.id', 'am.agency_id')
    .join('users as u', 'u.id', 'am.user_id')
    .where({
      'am.user_id': userId,
      'am.status': 'ACTIVE',
    })
    .select(
      'am.id as membership_id',
      'am.membership_role',
      'am.status as membership_status',
      'a.id as agency_id',
      'a.name as agency_name',
      'a.location as agency_location',
      'a.website as agency_website',
      'a.description as agency_description',
      'a.logo_path as agency_logo_path',
      'a.brand_color as agency_brand_color',
      'a.notify_new_applications',
      'a.notify_status_changes',
      'a.default_view',
      'a.onboarding_started_at',
      'a.onboarding_completed_at',
      'a.status as agency_status',
      'u.id as user_id',
      'u.email',
      'u.first_name',
      'u.last_name'
    )
    .orderBy([{ column: 'am.membership_role', order: 'asc' }, { column: 'am.created_at', order: 'asc' }])
    .first();

  if (membershipRow) {
    return {
      agency: {
        id: membershipRow.agency_id,
        name: membershipRow.agency_name,
        location: membershipRow.agency_location,
        website: membershipRow.agency_website,
        description: membershipRow.agency_description,
        logo_path: membershipRow.agency_logo_path,
        brand_color: membershipRow.agency_brand_color,
        notify_new_applications: membershipRow.notify_new_applications,
        notify_status_changes: membershipRow.notify_status_changes,
        default_view: membershipRow.default_view,
        onboarding_started_at: membershipRow.onboarding_started_at,
        onboarding_completed_at: membershipRow.onboarding_completed_at,
        status: membershipRow.agency_status,
      },
      membership: {
        id: membershipRow.membership_id,
        membership_role: membershipRow.membership_role,
        status: membershipRow.membership_status,
      },
      user: {
        id: membershipRow.user_id,
        email: membershipRow.email,
        first_name: membershipRow.first_name,
        last_name: membershipRow.last_name,
      },
    };
  }

  return null;
}

module.exports = {
  ensureLegacyAgencyContextForUser,
  resolveAgencyContextForMemberUser,
  getSessionActorUserId,
  getSessionAgencyId,
};
