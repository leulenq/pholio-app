"use strict";

/**
 * `talent_likeness_consents` — the rights/consent ledger (§9.6 #7).
 *
 * Plan C6 requires THREE consents that must be separate, never bundled:
 *
 *   1. Transmission of images to the specific agency applied to — already held
 *      by `application_submission_consent_events` (20260629120000).
 *   2. Any PHOLIO-INITIATED use — marketing, success stories, social posts,
 *      investor materials. "Separate opt-in, never covered by general ToS
 *      acceptance."
 *   3. Any AI-GENERATED OR ENHANCED LIKENESS — per the NY Fashion Workers Act,
 *      "must be separate and specific, stating scope, purpose, pay and
 *      duration. Routine colour correction and minor retouching are excluded.
 *      A power of attorney cannot authorise it."
 *
 * This table is 2 and 3. They share a shape because both are permissions to USE
 * a person's likeness rather than to process a file, and both are governed by
 * the same body of law — NY Civil Rights Law §§50–51, Cal. Civ. Code §3344,
 * Cal. AB 2602, the ELVIS Act.
 *
 * APPEND-ONLY, deliberately, following `ai_processing_consent_events`. A consent
 * record whose history can be edited is worth nothing in the only situation it
 * exists for: someone asking, later, what exactly this person agreed to and
 * when. A withdrawal is a new row, never an update, and never a delete.
 *
 * `scope`, `purpose`, `compensation` and the duration columns are NOT NULL for
 * a replica grant because the statute names them. A grant that cannot say what
 * it covers, what for, for what pay and for how long is not a grant the FWA
 * recognises, and the schema should not be able to express one. They are
 * nullable at the column level only because a WITHDRAWAL row carries none of
 * them; the service enforces their presence on a grant.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("talent_likeness_consents")) return;

  await knex.schema.createTable("talent_likeness_consents", (table) => {
    /* A monotonic tiebreaker, as `ai_processing_consent_events` has. Ordering an
       append-only ledger by timestamp alone is unsafe: a grant and a withdrawal
       recorded in the same millisecond tie, and "which came last" is then
       undefined — which for this table means a withdrawal that may not take
       effect. Insertion order is the only thing that can answer it.

       `sequence` is the primary key and `id` a unique uuid — the same shape
       `ai_processing_consent_events` uses, and the only one SQLite accepts,
       since it makes an autoincrement column the primary key regardless of
       what knex is asked for. */
    table.increments("sequence").primary();
    table.uuid("id").notNullable().unique();
    table
      .uuid("profile_id")
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");

    // 'marketing_use' | 'ai_replica' — never a combined value. The whole point
    // of C6 is that these cannot be bundled, and a single row that meant both
    // would be exactly the bundling it prohibits.
    table.string("purpose", 32).notNullable();
    // 'granted' | 'withdrawn'
    table.string("event_type", 16).notNullable();

    // The FWA quartet. Present on a grant, absent on a withdrawal.
    table.text("scope").nullable();
    table.text("use_purpose").nullable();
    table.text("compensation").nullable();
    table.date("starts_on").nullable();
    table.date("ends_on").nullable();

    // What the talent was actually shown, and its hash — so a later dispute is
    // about a fixed text rather than about what the page said that month.
    table.string("disclosure_version", 32).notNullable();
    table.string("disclosure_hash", 64).notNullable();

    // Who acted. `actor_type` exists because a guardian may consent for a minor
    // and that must be distinguishable in the record forever.
    table.uuid("actor_user_id").nullable();
    table.string("actor_type", 24).notNullable().defaultTo("talent");
    table.string("request_ip", 64).nullable();
    table.text("user_agent").nullable();

    table.uuid("supersedes_id").nullable();
    table.timestamp("occurred_at").notNullable().defaultTo(knex.fn.now());

    table.index(["profile_id", "purpose", "sequence"], "idx_likeness_profile_purpose");
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("talent_likeness_consents");
};
