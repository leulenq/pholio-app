/**
 * Migration: Add body_type and drivers_license to profiles
 * Part of Profile Nice-to-Have
 */
exports.up = function (knex) {
  return knex.schema.alterTable('profiles', (table) => {
    table.string('body_type', 50).nullable();       // Slim, Athletic, Average, Curvy, Plus-size
    table.boolean('drivers_license').defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('profiles', (table) => {
    table.dropColumn('body_type');
    table.dropColumn('drivers_license');
  });
};
