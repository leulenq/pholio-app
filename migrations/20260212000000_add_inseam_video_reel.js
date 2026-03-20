/**
 * Migration: Add inseam_cm and video_reel_url to profiles
 * Part of Profile Completeness Must-Fix
 */
exports.up = function (knex) {
  return knex.schema.alterTable('profiles', (table) => {
    table.integer('inseam_cm').nullable();
    table.string('video_reel_url', 500).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('profiles', (table) => {
    table.dropColumn('inseam_cm');
    table.dropColumn('video_reel_url');
  });
};
