/**
 * Magic-link tokens for talent to reply to agency messages without signing in.
 */

exports.up = function up(knex) {
  return knex.schema.createTable("message_reply_tokens", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    table.uuid("application_id").notNullable().unique();
    table.uuid("talent_user_id").notNullable();
    table.string("token", 128).notNullable().unique();
    table.timestamp("expires_at").notNullable();
    table.timestamp("last_used_at").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table
      .foreign("application_id")
      .references("id")
      .inTable("applications")
      .onDelete("CASCADE");
    table
      .foreign("talent_user_id")
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    table.index("token");
    table.index("expires_at");
  });
};

exports.down = function down(knex) {
  return knex.schema.dropTableIfExists("message_reply_tokens");
};
