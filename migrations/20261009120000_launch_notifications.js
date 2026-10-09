"use strict";

/**
 * Pre-launch notify list for talent (pholio-site /opening).
 *
 * Holds an email address and nothing about the person. The page promises one
 * email on launch day and then deletion, so scripts/send-launch-notifications.js
 * deletes each row once its email is sent. Do not add columns that outlive it.
 */
exports.up = async function (knex) {
  await knex.schema.createTable("launch_notifications", (table) => {
    table.uuid("id").primary();
    table.string("email", 254).notNullable().unique();
    // Which CTA brought them: "talent" or "studio". Not personal data.
    table.string("source", 40).nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("launch_notifications");
};
