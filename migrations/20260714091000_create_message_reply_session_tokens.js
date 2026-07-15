/**
 * SEC-0.8 — One-time, short-lived credentials for talent session bootstrap.
 *
 * The emailed message reply token remains a reusable, three-day credential for
 * reading and replying to a single agency conversation. It must never be used
 * directly to mint a full application session. This table stores a separate
 * hashed credential that is issued once per emailed token rotation, expires
 * quickly, and is atomically consumed by the session-bootstrap endpoint.
 */

exports.up = function up(knex) {
  return knex.schema.createTable("message_reply_session_tokens", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    table
      .uuid("reply_token_id")
      .notNullable()
      .unique()
      .references("id")
      .inTable("message_reply_tokens")
      .onDelete("CASCADE");
    table
      .uuid("talent_user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.string("token_hash", 64).notNullable().unique();
    table.timestamp("expires_at").notNullable();
    table.timestamp("consumed_at").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    table.index("expires_at");
    table.index(["talent_user_id", "created_at"]);
  });
};

exports.down = function down(knex) {
  return knex.schema.dropTableIfExists("message_reply_session_tokens");
};
