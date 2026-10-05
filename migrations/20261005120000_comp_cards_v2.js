"use strict";

/**
 * Comp card studio (v2): the talent's composed card and the per-image
 * perception cache that composition depends on.
 *
 * comp_cards.scene is the frozen, fully resolved layout the talent approved;
 * printing renders exactly that, so a PDF never differs from the preview.
 */
exports.up = async function (knex) {
  await knex.schema.createTable("comp_cards", (table) => {
    table.uuid("id").primary();
    table.uuid("profile_id").notNullable().references("id").inTable("profiles").onDelete("CASCADE");
    table.json("settings").notNullable();
    table.json("scene").notNullable();
    table.json("notes").nullable();
    table.integer("engine_version").notNullable().defaultTo(1);
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    table.unique(["profile_id"]);
  });

  await knex.schema.createTable("image_perceptions", (table) => {
    table.uuid("image_id").primary().references("id").inTable("images").onDelete("CASCADE");
    table.integer("version").notNullable();
    table.string("source_url", 2048).nullable();
    table.json("data").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("image_perceptions");
  await knex.schema.dropTableIfExists("comp_cards");
};
