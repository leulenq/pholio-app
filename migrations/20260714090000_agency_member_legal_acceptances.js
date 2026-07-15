exports.up = async function up(knex) {
  await knex.schema.createTable("agency_member_legal_acceptances", (table) => {
    table.uuid("id").primary();
    table.uuid("acceptance_batch_id").notNullable();
    table
      .uuid("agency_id")
      .notNullable()
      .references("id")
      .inTable("agencies")
      .onDelete("RESTRICT");
    table
      .uuid("member_user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("RESTRICT");
    table
      .uuid("membership_id")
      .notNullable()
      .references("id")
      .inTable("agency_memberships")
      .onDelete("RESTRICT");
    table.string("policy_key", 48).notNullable();
    table.string("policy_version", 32).notNullable();
    table.text("policy_url").notNullable();
    table.string("content_digest", 71).notNullable();
    table.timestamp("accepted_at").notNullable();
    table.string("ip_address", 45).nullable();
    table.text("user_agent").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    table.unique(["acceptance_batch_id", "policy_key"]);
    table.index(
      ["agency_id", "member_user_id", "membership_id", "accepted_at"],
      "idx_agency_legal_member",
    );
    table.index(["policy_key", "policy_version"], "idx_agency_legal_policy");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("agency_member_legal_acceptances");
};
