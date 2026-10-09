"use strict";

/**
 * Print-grade subject cutouts for the comp card studio: a decontaminated
 * RGBA PNG per image, computed in the talent's browser (MODNet + guided
 * filter) and stored so every print renders the same matte.
 */
exports.up = async function (knex) {
  await knex.schema.createTable("image_cutouts", (table) => {
    table.uuid("image_id").primary().references("id").inTable("images").onDelete("CASCADE");
    table.integer("version").notNullable();
    table.integer("width").notNullable();
    table.integer("height").notNullable();
    table.binary("png").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("image_cutouts");
};
