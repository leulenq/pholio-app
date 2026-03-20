/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  // modify 'ethnicity' to be a jsonb array
  // modify 'union_membership' to be a jsonb array
  // add 'playing_age_min' and 'playing_age_max'

  // Using raw SQL for type conversion is often safest for string -> jsonb
  // But since we want arrays, we might need to wrap existing strings in brackets
  
  // Strategy:
  // 1. Add new temporary columns
  // 2. Migrate data
  // 3. Drop old columns
  // 4. Rename new columns
  
  const hasTable = await knex.schema.hasTable('profiles');
  if (!hasTable) return;

  await knex.schema.table('profiles', (table) => {
    table.jsonb('ethnicity_new').nullable();
    table.jsonb('union_membership_new').nullable();
    table.integer('playing_age_min').nullable();
    table.integer('playing_age_max').nullable();
  });

  // Migrate existing data
  const profiles = await knex('profiles').select('id', 'ethnicity', 'union_membership');
  
  for (const profile of profiles) {
    const updates = {};
    if (profile.ethnicity) {
      // Wrap single string in array
      updates.ethnicity_new = JSON.stringify([profile.ethnicity]);
    }
    if (profile.union_membership) {
        // Wrap single string in array
       updates.union_membership_new = JSON.stringify([profile.union_membership]);
    }
    
    if (Object.keys(updates).length > 0) {
      await knex('profiles').where('id', profile.id).update(updates);
    }
  }

  // Drop old columns and rename new ones
  await knex.schema.table('profiles', (table) => {
    table.dropColumn('ethnicity');
    table.dropColumn('union_membership');
  });

  await knex.schema.table('profiles', (table) => {
    table.renameColumn('ethnicity_new', 'ethnicity');
    table.renameColumn('union_membership_new', 'union_membership');
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  // Revert changes
  // Note: This is lossy if multiple values were selected
  
  await knex.schema.table('profiles', (table) => {
    table.string('ethnicity_old').nullable();
    table.string('union_membership_old').nullable();
  });

  const profiles = await knex('profiles').select('id', 'ethnicity', 'union_membership');
  
  for (const profile of profiles) {
     const updates = {};
     // Take first element of array
     if (profile.ethnicity && Array.isArray(profile.ethnicity) && profile.ethnicity.length > 0) {
       updates.ethnicity_old = profile.ethnicity[0];
     }
     if (profile.union_membership && Array.isArray(profile.union_membership) && profile.union_membership.length > 0) {
        updates.union_membership_old = profile.union_membership[0];
     }
     
     if (Object.keys(updates).length > 0) {
       await knex('profiles').where('id', profile.id).update(updates);
     }
  }

  await knex.schema.table('profiles', (table) => {
     table.dropColumn('ethnicity');
     table.dropColumn('union_membership');
     table.dropColumn('playing_age_min');
     table.dropColumn('playing_age_max');
  });

  await knex.schema.table('profiles', (table) => {
     table.renameColumn('ethnicity_old', 'ethnicity');
     table.renameColumn('union_membership_old', 'union_membership');
  });
};
