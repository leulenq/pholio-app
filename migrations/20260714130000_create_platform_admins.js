"use strict";

/**
 * Platform staff authorization is intentionally separate from the product
 * account role. A person can retain a TALENT or AGENCY account while staff
 * access is granted and revoked independently through this table.
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("platform_admins")) return;

  await knex.schema.createTable("platform_admins", (table) => {
    table.uuid("id").primary();
    table
      .uuid("user_id")
      .notNullable()
      .unique()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.string("status", 24).notNullable().defaultTo("ACTIVE");
    table.string("display_name", 160).nullable();
    table
      .uuid("granted_by_user_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.timestamp("granted_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("revoked_at").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    table.index(["status", "user_id"], "idx_platform_admin_status_user");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("platform_admins");
};
