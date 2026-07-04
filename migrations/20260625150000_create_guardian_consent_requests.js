/**
 * Guardian consent verification scaffold (legal audit Phase 1).
 *
 * Replaces the self-attested "guardian consent on file" toggle for minors with a
 * real, token-verified consent flow. A request is created when the talent submits
 * a guardian's email; the guardian receives a one-time link and verification sets
 * `profiles.guardian_consent_at`.
 *
 * Note: we intentionally do NOT add `guardian_verified_at` to `profiles` — it would
 * be redundant with the existing `guardian_consent_at` column, which already records
 * the moment verified guardian consent was established.
 */

exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable("guardian_consent_requests");
  if (!hasTable) {
    await knex.schema.createTable("guardian_consent_requests", (table) => {
      table.uuid("id").primary().notNullable();
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table.string("guardian_email").notNullable();
      table.string("guardian_name").nullable();
      // sha256 hex of the raw token; the raw token is only ever in the email link.
      table.string("token_hash").notNullable();
      // pending | verified | expired | revoked
      table.string("status").notNullable().defaultTo("pending");
      table.timestamp("expires_at").notNullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("verified_at").nullable();

      table.index(["profile_id"], "guardian_consent_profile_idx");
      table.index(["token_hash"], "guardian_consent_token_idx");
    });
  }

  const hasGuardianEmail = await knex.schema.hasColumn(
    "profiles",
    "guardian_email",
  );
  if (!hasGuardianEmail) {
    await knex.schema.alterTable("profiles", (table) => {
      table.string("guardian_email").nullable();
    });
  }
};

exports.down = async function down(knex) {
  const hasGuardianEmail = await knex.schema.hasColumn(
    "profiles",
    "guardian_email",
  );
  if (hasGuardianEmail) {
    await knex.schema.alterTable("profiles", (table) => {
      table.dropColumn("guardian_email");
    });
  }

  await knex.schema.dropTableIfExists("guardian_consent_requests");
};
