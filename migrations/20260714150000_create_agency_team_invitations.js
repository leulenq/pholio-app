/**
 * Expiring, single-use invitations into an already-vetted agency workspace.
 * Raw bearer tokens are never persisted.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable("agency_team_invitations");
  if (exists) return;

  await knex.schema.createTable("agency_team_invitations", (table) => {
    table.uuid("id").primary();
    table
      .uuid("agency_id")
      .notNullable()
      .references("id")
      .inTable("agencies")
      .onDelete("CASCADE");
    table.string("email", 320).notNullable();
    table.string("membership_role", 32).notNullable();
    table.string("token_hash", 64).notNullable().unique();
    table
      .uuid("invited_by_user_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table
      .uuid("invited_by_membership_id")
      .nullable()
      .references("id")
      .inTable("agency_memberships")
      .onDelete("SET NULL");
    table.timestamp("expires_at").notNullable();
    table.timestamp("accepted_at").nullable();
    table
      .uuid("accepted_by_user_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.timestamp("revoked_at").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    table.index(["agency_id", "email"]);
    table.index(["agency_id", "accepted_at", "revoked_at", "expires_at"]);
  });
};

/** @param {import('knex')} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("agency_team_invitations");
};
