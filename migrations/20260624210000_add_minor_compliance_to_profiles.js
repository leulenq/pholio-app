/**
 * Minor compliance: guardian consent timestamp + work permit flag.
 */

exports.up = async function up(knex) {
  const hasConsent = await knex.schema.hasColumn('profiles', 'guardian_consent_at');
  if (!hasConsent) {
    await knex.schema.alterTable('profiles', (table) => {
      table.timestamp('guardian_consent_at').nullable();
    });
  }

  const hasPermit = await knex.schema.hasColumn('profiles', 'work_permit_on_file');
  if (!hasPermit) {
    await knex.schema.alterTable('profiles', (table) => {
      table.boolean('work_permit_on_file').notNullable().defaultTo(false);
    });
  }
};

exports.down = async function down(knex) {
  const hasConsent = await knex.schema.hasColumn('profiles', 'guardian_consent_at');
  if (hasConsent) {
    await knex.schema.alterTable('profiles', (table) => {
      table.dropColumn('guardian_consent_at');
    });
  }

  const hasPermit = await knex.schema.hasColumn('profiles', 'work_permit_on_file');
  if (hasPermit) {
    await knex.schema.alterTable('profiles', (table) => {
      table.dropColumn('work_permit_on_file');
    });
  }
};
