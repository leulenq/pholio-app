"use strict";

/**
 * Agency open call links: agency-controlled entry links whose arrivals mint
 * server-side claims that exempt one submission to that agency from the
 * monthly discovery quota. The entitlement lives in the claims table — the
 * link code is addressing/attribution only, never a bearer credential.
 */

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable("agency_open_call_links"))) {
    await knex.schema.createTable("agency_open_call_links", (table) => {
      table.uuid("id").primary().notNullable();
      table
        .uuid("agency_id")
        .notNullable()
        .references("id")
        .inTable("agencies")
        .onDelete("CASCADE");
      table.string("code", 32).notNullable().unique();
      table.string("label", 120).notNullable();
      // active | paused | revoked
      table.string("status", 16).notNullable().defaultTo("active");
      table
        .uuid("created_by_user_id")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("revoked_at").nullable();

      table.index(["agency_id", "status"], "idx_open_call_links_agency_status");
    });
  }

  if (!(await knex.schema.hasTable("agency_open_call_arrivals"))) {
    await knex.schema.createTable("agency_open_call_arrivals", (table) => {
      table.uuid("id").primary().notNullable();
      table
        .uuid("link_id")
        .notNullable()
        .references("id")
        .inTable("agency_open_call_links")
        .onDelete("CASCADE");
      table.uuid("agency_id").notNullable();
      table.string("ip_hash", 64).nullable();
      table.string("user_agent", 512).nullable();
      table.timestamp("arrived_at").notNullable().defaultTo(knex.fn.now());
      table.uuid("claimed_by_profile_id").nullable();

      table.index(["link_id", "arrived_at"], "idx_open_call_arrivals_link_time");
      table.index(
        ["agency_id", "arrived_at"],
        "idx_open_call_arrivals_agency_time",
      );
    });
  }

  if (!(await knex.schema.hasTable("agency_open_call_claims"))) {
    await knex.schema.createTable("agency_open_call_claims", (table) => {
      table.uuid("id").primary().notNullable();
      table
        .uuid("link_id")
        .notNullable()
        .references("id")
        .inTable("agency_open_call_links")
        .onDelete("CASCADE");
      table
        .uuid("arrival_id")
        .nullable()
        .references("id")
        .inTable("agency_open_call_arrivals")
        .onDelete("SET NULL");
      table
        .uuid("agency_id")
        .notNullable()
        .references("id")
        .inTable("agencies")
        .onDelete("CASCADE");
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      // active | consumed | expired | revoked
      table.string("status", 16).notNullable().defaultTo("active");
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("expires_at").notNullable();
      table.timestamp("consumed_at").nullable();
      table.timestamp("revoked_at").nullable();
      table
        .uuid("consumed_application_id")
        .nullable()
        .references("id")
        .inTable("applications")
        .onDelete("SET NULL");

      table.index(
        ["profile_id", "status"],
        "idx_open_call_claims_profile_status",
      );
      table.index(["agency_id", "status"], "idx_open_call_claims_agency_status");
    });

    // One claim per (agency, profile) that is still live or already spent.
    // Expired/revoked claims fall out of the index so a fresh arrival can
    // mint again — but a consumed claim blocks re-exemption forever.
    // Partial indexes are supported by both PostgreSQL and SQLite.
    await knex.raw(
      `CREATE UNIQUE INDEX uq_open_call_claims_agency_profile
         ON agency_open_call_claims (agency_id, profile_id)
         WHERE status IN ('active', 'consumed')`,
    );
  }

  const hasQuotaExempt = await knex.schema.hasColumn(
    "application_submission_requests",
    "quota_exempt",
  );
  if (!hasQuotaExempt) {
    await knex.schema.alterTable("application_submission_requests", (table) => {
      table.boolean("quota_exempt").notNullable().defaultTo(false);
      table
        .uuid("exemption_claim_id")
        .nullable()
        .references("id")
        .inTable("agency_open_call_claims")
        .onDelete("SET NULL");
    });
  }
};

exports.down = async function down(knex) {
  if (
    await knex.schema.hasColumn("application_submission_requests", "quota_exempt")
  ) {
    await knex.schema.alterTable("application_submission_requests", (table) => {
      table.dropColumn("exemption_claim_id");
      table.dropColumn("quota_exempt");
    });
  }
  await knex.schema.dropTableIfExists("agency_open_call_claims");
  await knex.schema.dropTableIfExists("agency_open_call_arrivals");
  await knex.schema.dropTableIfExists("agency_open_call_links");
};
