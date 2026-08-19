"use strict";

/**
 * The anonymous open-call applicant, as a first-class record
 * (`docs/open-call-applicant-flow-design-2026-08.md` §3.2, §3.3).
 *
 * Five tables, one idea: an application is the primary object and does not
 * depend on a `users` row, a `profiles` row or a session. State 2 of the
 * identity ladder — *submitted, unclaimed* — needs somewhere to live that is
 * demonstrably not an account, which is what `applicant_identities` and
 * `open_call_submissions` are. Nothing here writes to `users`.
 *
 *   applicant_identities        this human, as asserted by an application
 *   open_call_submissions       the draft/submitted application, pre-account
 *   open_call_submission_media  anonymous uploads scoped to one draft
 *   applicant_claim_tokens      the magic link (claim | disown | materials)
 *   open_call_material_requests the shortlist-stage ask (§2.3)
 *
 * `email_normalized` is the identity key and the only UNIQUE among the
 * identity fields. `phone_normalized` is a duplicate *signal* and never a key:
 * the FWBK response sheet contains "I don't have a phone num" sitting in a
 * phone column, and a key that a typo can collide is worse than no key.
 *
 * The link also learns what it asks for and who it asks it of. One deliberate
 * deviation from the design text there — see INTAKE_SPEC below.
 *
 * TRANSACTIONS OFF, for the reason `20260815091000` and `20260815092000` state:
 * `down` drops columns from `agency_open_call_links`, knex implements a SQLite
 * column drop as create-copy-drop-rename, and the `PRAGMA foreign_keys = OFF`
 * it guards that with is silently ignored inside a transaction — so a
 * transactional rollback would cascade away every arrival, claim and
 * submission hanging off those links. Every statement is individually guarded
 * so a partial run re-runs cleanly.
 */

exports.config = { transaction: false };

const LINKS_TABLE = "agency_open_call_links";

const SUBMITTED_UNIQUE = "uq_open_call_submissions_link_identity_submitted";

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const isPostgres =
    knex.client.config.client === "pg" ||
    knex.client.config.client === "postgresql";

  const uuidPk = (table) => {
    if (isPostgres) {
      table.uuid("id").primary().defaultTo(knex.fn.uuid());
    } else {
      table.uuid("id").primary();
    }
  };

  // jsonb where the database can index it, text where it cannot. The idiom is
  // `20260710120000`'s; the callers here add their own nullability/default.
  const jsonCol = (table, name) =>
    isPostgres ? table.jsonb(name) : table.text(name);

  if (!(await knex.schema.hasTable("applicant_identities"))) {
    await knex.schema.createTable("applicant_identities", (table) => {
      uuidPk(table);
      // Lowercased, plus-stripped. The identity key, and the thing a claim
      // proves possession of.
      table.string("email_normalized", 254).notNullable().unique();
      // E.164 where parseable. A duplicate signal, never a key.
      table.string("phone_normalized", 32).nullable();
      // Set at claim; NULL for the whole of states 1 and 2.
      table
        .uuid("profile_id")
        .nullable()
        .references("id")
        .inTable("profiles")
        .onDelete("SET NULL");
      table.timestamp("claimed_at").nullable();
      // "This wasn't me" (§5.5). Distinct from deletion: the organizer's
      // application must not silently vanish from their pool.
      table.timestamp("disowned_at").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

      table.index(["phone_normalized"], "idx_applicant_identities_phone");
      table.index(["profile_id"], "idx_applicant_identities_profile");
    });
  }

  if (!(await knex.schema.hasTable("open_call_submissions"))) {
    await knex.schema.createTable("open_call_submissions", (table) => {
      uuidPk(table);
      table
        .uuid("open_call_link_id")
        .notNullable()
        .references("id")
        .inTable(LINKS_TABLE)
        .onDelete("CASCADE");
      // Denormalized off the link so pool reads and retention sweeps do not
      // join for a value that cannot change.
      table
        .uuid("agency_id")
        .notNullable()
        .references("id")
        .inTable("agencies")
        .onDelete("CASCADE");
      // NULL until the applicant types an email — state 1 holds no PII.
      table
        .uuid("applicant_identity_id")
        .nullable()
        .references("id")
        .inTable("applicant_identities")
        .onDelete("SET NULL");
      // sha256 hex; the raw token lives only in the httpOnly draft cookie.
      table.string("draft_token_hash", 64).nullable().unique();
      // Keyed by intake-spec field key. `{}` rather than NULL so every read
      // path can parse unconditionally.
      jsonCol(table, "answers").notNullable().defaultTo("{}");
      jsonCol(table, "custom_answers").notNullable().defaultTo("{}");
      // The spec version the applicant actually answered. Frozen at write, so
      // an organizer editing the spec mid-call cannot retroactively invalidate
      // submissions already made against it.
      table.integer("intake_spec_version").notNullable();
      // draft | submitted | abandoned
      table.string("status", 16).notNullable().defaultTo("draft");
      table.timestamp("submitted_at").nullable();
      // TTL for the anonymous draft; the retention the consent stated for a
      // submitted one.
      table.timestamp("expires_at").notNullable();
      table.string("ip_hash", 64).nullable();
      table.string("user_agent", 512).nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

      table.index(
        ["open_call_link_id", "status"],
        "idx_open_call_submissions_link_status",
      );
      table.index(
        ["applicant_identity_id"],
        "idx_open_call_submissions_identity",
      );
    });
  }

  // One *submitted* application per (edition, human). Drafts are deliberately
  // outside the index: an applicant who abandons and returns on another device
  // must be able to start again, and a half-finished draft is not a claim on
  // the edition. Partial uniques work on both PostgreSQL and SQLite — the
  // precedent is `uq_open_call_claims_agency_profile` (`20260704120000:113`).
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${SUBMITTED_UNIQUE}
      ON open_call_submissions (open_call_link_id, applicant_identity_id)
      WHERE status = 'submitted'
  `);

  if (!(await knex.schema.hasTable("open_call_submission_media"))) {
    await knex.schema.createTable("open_call_submission_media", (table) => {
      uuidPk(table);
      table
        .uuid("submission_id")
        .notNullable()
        .references("id")
        .inTable("open_call_submissions")
        .onDelete("CASCADE");
      // An intake-spec key: digital_headshot, digital_full_length, …
      table.string("field_key", 48).notNullable();
      table.string("storage_key", 500).notNullable();
      table.string("content_type", 100).nullable();
      table.integer("bytes").nullable();
      // pending | approved | rejected. An anonymous upload is never trusted
      // into the image pipeline unreviewed.
      table.string("moderation_state", 16).notNullable().defaultTo("pending");
      // Set at claim, when the upload becomes a real portfolio image.
      table
        .uuid("promoted_image_id")
        .nullable()
        .references("id")
        .inTable("images")
        .onDelete("SET NULL");
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

      // One file per spec key: re-uploading a headshot replaces it rather than
      // leaving the organizer to guess which of two is current.
      table.unique(
        ["submission_id", "field_key"],
        "uq_open_call_submission_media_field",
      );
    });
  }

  if (!(await knex.schema.hasTable("applicant_claim_tokens"))) {
    await knex.schema.createTable("applicant_claim_tokens", (table) => {
      uuidPk(table);
      table
        .uuid("applicant_identity_id")
        .notNullable()
        .references("id")
        .inTable("applicant_identities")
        .onDelete("CASCADE");
      // sha256 hex; the raw token exists only inside the emailed URL. Same
      // shape as message reply tokens.
      table.string("token_hash", 64).notNullable().unique();
      // claim | disown | materials
      table.string("purpose", 16).notNullable();
      table.timestamp("expires_at").notNullable();
      table.timestamp("consumed_at").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

      table.index(
        ["applicant_identity_id", "purpose"],
        "idx_applicant_claim_tokens_identity_purpose",
      );
    });
  }

  if (!(await knex.schema.hasTable("open_call_material_requests"))) {
    await knex.schema.createTable("open_call_material_requests", (table) => {
      uuidPk(table);
      // Keyed to the application, not the submission: the request is triggered
      // from the existing `shortlisted` status and rides the rails the
      // organizer's inbox already runs on (§3.4, ruling R10).
      table
        .uuid("application_id")
        .notNullable()
        .references("id")
        .inTable("applications")
        .onDelete("CASCADE");
      // The shortlist-stage keys drawn from the call's intake spec.
      jsonCol(table, "requested_keys").notNullable();
      table.timestamp("due_at").nullable();
      table
        .uuid("requested_by_user_id")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      table.timestamp("fulfilled_at").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

      // One live request per application; re-requesting updates it rather than
      // stacking deadlines the applicant cannot tell apart.
      table.unique(["application_id"], "uq_open_call_material_requests_app");
    });
  }

  /*
   * INTAKE_SPEC — a deliberate deviation from §3.1's column sketch.
   *
   * The design writes `intake_spec json NOT NULL DEFAULT (platform default for
   * call_kind)`. This migration makes it NULLABLE with no default, and reads
   * NULL as "use the platform default for this call kind".
   *
   * Baking the default into rows means every link created before the platform
   * default is next revised carries a frozen copy of it, and revising the
   * recommendation then requires a data migration over links whose owners never
   * chose those keys. NULL keeps the recommendation in code, where it is
   * versioned with the vocabulary it references, and makes "this organizer
   * customised their intake" a fact the schema can answer.
   *
   * `intake_spec_version` stays NOT NULL DEFAULT 1 because submissions freeze
   * it (`open_call_submissions.intake_spec_version`) and a NULL there would
   * make a frozen answer set unattributable.
   */
  const linkColumns = [
    ["intake_spec", (table) => jsonCol(table, "intake_spec").nullable()],
    [
      "intake_spec_version",
      (table) => table.integer("intake_spec_version").notNullable().defaultTo(1),
    ],
    // account_required (today's behaviour, preserved exactly) |
    // account_optional | account_never. §4's containment depends on existing
    // representation calls defaulting to the current flow.
    [
      "identity_policy",
      (table) =>
        table
          .string("identity_policy", 24)
          .notNullable()
          .defaultTo("account_required"),
    ],
  ];

  for (const [name, define] of linkColumns) {
    if (await knex.schema.hasColumn(LINKS_TABLE, name)) continue;
    await knex.schema.alterTable(LINKS_TABLE, (table) => define(table));
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const present = [];
  for (const name of ["intake_spec", "intake_spec_version", "identity_policy"]) {
    if (await knex.schema.hasColumn(LINKS_TABLE, name)) present.push(name);
  }
  if (present.length) {
    await knex.schema.alterTable(LINKS_TABLE, (table) => {
      table.dropColumns(...present);
    });
  }

  await knex.schema.dropTableIfExists("open_call_material_requests");
  await knex.schema.dropTableIfExists("applicant_claim_tokens");
  await knex.schema.dropTableIfExists("open_call_submission_media");
  await knex.raw(`DROP INDEX IF EXISTS ${SUBMITTED_UNIQUE}`);
  await knex.schema.dropTableIfExists("open_call_submissions");
  await knex.schema.dropTableIfExists("applicant_identities");
};
