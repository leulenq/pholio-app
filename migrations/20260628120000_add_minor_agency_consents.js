/**
 * Add guardian authorization scoped to disclosure to one named agency.
 *
 * `profiles.guardian_consent_at` remains the account-level authorization used
 * to collect and manage a minor's sensitive profile data. It must not be
 * treated as authorization to disclose that data to every agency.
 */

exports.up = async function up(knex) {
  const hasAgencyId = await knex.schema.hasColumn(
    "guardian_consent_requests",
    "agency_id",
  );
  if (!hasAgencyId) {
    await knex.schema.alterTable("guardian_consent_requests", (table) => {
      table
        .uuid("agency_id")
        .nullable()
        .references("id")
        .inTable("agencies")
        .onDelete("CASCADE");
      table.index(
        ["profile_id", "agency_id", "status"],
        "guardian_consent_request_scope_idx",
      );
    });
  }

  const hasTable = await knex.schema.hasTable("minor_agency_consents");
  if (!hasTable) {
    await knex.schema.createTable("minor_agency_consents", (table) => {
      table.uuid("id").primary().notNullable();
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table
        .uuid("agency_id")
        .notNullable()
        .references("id")
        .inTable("agencies")
        .onDelete("CASCADE");
      table
        .uuid("consent_request_id")
        .notNullable()
        .references("id")
        .inTable("guardian_consent_requests")
        .onDelete("RESTRICT");
      table.string("guardian_email").notNullable();
      table.timestamp("verified_at").notNullable();
      table.timestamp("revoked_at").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

      table.unique(
        ["profile_id", "agency_id"],
        "uq_minor_agency_consents_profile_agency",
      );
      table.index(["agency_id"], "minor_agency_consents_agency_idx");
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("minor_agency_consents");

  const hasAgencyId = await knex.schema.hasColumn(
    "guardian_consent_requests",
    "agency_id",
  );
  if (hasAgencyId) {
    await knex.schema.alterTable("guardian_consent_requests", (table) => {
      table.dropIndex(
        ["profile_id", "agency_id", "status"],
        "guardian_consent_request_scope_idx",
      );
      table.dropColumn("agency_id");
    });
  }
};
