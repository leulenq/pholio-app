/**
 * Migration: Add hair_type and pronouns to profiles
 * Part of Profile Should-Fix (competitive parity)
 */
exports.up = function (knex) {
  return knex.schema.alterTable('profiles', (table) => {
    table.string('hair_type', 50).nullable();    // Straight, Wavy, Curly, Coily
    table.string('pronouns', 50).nullable();      // He/Him, She/Her, They/Them, etc.
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('profiles', (table) => {
    table.dropColumn('hair_type');
    table.dropColumn('pronouns');
  });
};
