/**
 * Migration: persist the art-director design brief per profile so card
 * regeneration is stable — the brief is re-authored only when the inputs it
 * was based on (images, casting analysis, category, representation) change.
 *
 * Stored shape: JSON string { brief, fingerprint, authoredAt }.
 */
exports.up = function (knex) {
  return knex.schema.alterTable("profiles", (table) => {
    table.text("pdf_design_brief").nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("profiles", (table) => {
    table.dropColumn("pdf_design_brief");
  });
};
