/**
 * Agency RBAC: custom permission grants + audit trail; migrate MEMBER → SCOUT.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const hasGrants = await knex.schema.hasTable("agency_membership_permissions");
  if (!hasGrants) {
    await knex.schema.createTable("agency_membership_permissions", (table) => {
      table.uuid("id").primary();
      table
        .uuid("agency_id")
        .notNullable()
        .references("id")
        .inTable("agencies")
        .onDelete("CASCADE");
      table
        .uuid("membership_id")
        .notNullable()
        .references("id")
        .inTable("agency_memberships")
        .onDelete("CASCADE");
      table.string("permission_key", 80).notNullable();
      table.string("effect", 5).notNullable();
      table.text("reason").nullable();
      table
        .uuid("granted_by_membership_id")
        .nullable()
        .references("id")
        .inTable("agency_memberships")
        .onDelete("SET NULL");
      table.timestamp("expires_at").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.unique(["membership_id", "permission_key", "effect"]);
      table.index(["agency_id"], "idx_amp_agency");
      table.index(["membership_id"], "idx_amp_membership");
    });
  }

  const hasAudit = await knex.schema.hasTable("agency_audit_events");
  if (!hasAudit) {
    await knex.schema.createTable("agency_audit_events", (table) => {
      table.uuid("id").primary();
      table
        .uuid("agency_id")
        .notNullable()
        .references("id")
        .inTable("agencies")
        .onDelete("CASCADE");
      table
        .uuid("actor_membership_id")
        .nullable()
        .references("id")
        .inTable("agency_memberships")
        .onDelete("SET NULL");
      table
        .uuid("actor_user_id")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      table.string("event_type", 60).notNullable();
      table.string("target_type", 40).nullable();
      table.uuid("target_id").nullable();
      table.text("summary").notNullable();
      table.json("before_state").nullable();
      table.json("after_state").nullable();
      table.string("ip_address", 45).nullable();
      table.text("user_agent").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.index(["agency_id", "created_at"], "idx_aae_agency_created");
      table.index(["event_type"], "idx_aae_type");
    });
  }

  await knex("agency_memberships")
    .where({ membership_role: "MEMBER" })
    .update({ membership_role: "SCOUT", updated_at: knex.fn.now() });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("agency_audit_events");
  await knex.schema.dropTableIfExists("agency_membership_permissions");

  await knex("agency_memberships")
    .where({ membership_role: "SCOUT" })
    .update({ membership_role: "MEMBER", updated_at: knex.fn.now() });
};
