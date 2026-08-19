"use strict";

/**
 * The frozen snapshot and the consent audit trail learn to belong to an
 * applicant instead of an account
 * (`docs/open-call-applicant-flow-design-2026-08.md` §3.3, §4).
 *
 * An anonymous open-call application has to produce exactly what an
 * account-backed one produces, because the organizer's surfaces read those two
 * tables and not the applicant's identity state:
 *
 *   talent_submission_packages            the frozen package §4's resolver
 *                                         reads for an unclaimed applicant —
 *                                         "an unclaimed application's identity
 *                                         is by definition frozen", so the
 *                                         snapshot is its correct home, not a
 *                                         workaround
 *   application_submission_consent_events the audit row proving what the
 *                                         applicant was shown and agreed to
 *
 * Both were created account-first (`20260326140000`, `20260629120000`) with
 * `user_id` and `profile_id` NOT NULL, which makes a consented, snapshotted,
 * account-less submission unrepresentable. Both become nullable, and both gain
 * an `applicant_identity_id`.
 *
 * NO DATABASE CHECK HERE, deliberately, and unlike
 * `20260819120000`'s `chk_applications_identity_present`. `applications` is
 * read by eight agency join paths where a row with neither pointer is silently
 * unreachable, so the invariant is worth a constraint. These two tables are
 * written only by the submit/consent services and read by id from an
 * application that already carries an enforced identity pointer — a CHECK here
 * would restate that guarantee one table further from where it is established,
 * at the cost of a second CHECK to rebuild around on every future SQLite
 * migration. The presence rule stays in the services that write these rows.
 *
 * THE SQLITE REBUILD is `20260815090000`'s introspective procedure, imported
 * from `20260819120000` rather than hand-copied: the live `CREATE TABLE` text
 * comes from `sqlite_master`, the column list from `PRAGMA table_info`, indexes
 * are replayed verbatim. Both tables have gained columns since creation —
 * `retention_expires_at`, `redacted_at` and the guardian columns on packages;
 * `purpose`, `open_call_link_id` and `compensation_disclosure` on consent
 * events — and a hardcoded column list would drop whichever of them the author
 * failed to remember.
 *
 * TRANSACTIONS OFF: the rebuild toggles `PRAGMA foreign_keys`, a no-op inside a
 * transaction, and `down` drops a column, which knex implements as the same
 * rebuild behind the same ignored guard.
 */

exports.config = { transaction: false };

const {
  rebuildSqliteTable,
  rewriteNullability,
  notNullColumns,
} = require("./20260819120000_applications_optional_profile").sqliteRebuild;

const IDENTITY_COLUMN = "applicant_identity_id";

const TABLES = [
  {
    name: "talent_submission_packages",
    index: "idx_submission_packages_applicant_identity",
  },
  {
    name: "application_submission_consent_events",
    index: "idx_submission_consent_applicant_identity",
  },
];

const NULLABLE_COLUMNS = ["user_id", "profile_id"];

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const isPg = knex.client.config.client === "pg";

  for (const { name, index } of TABLES) {
    if (!(await knex.schema.hasTable(name))) continue;

    if (!(await knex.schema.hasColumn(name, IDENTITY_COLUMN))) {
      await knex.schema.alterTable(name, (table) => {
        table
          .uuid(IDENTITY_COLUMN)
          .nullable()
          .references("id")
          .inTable("applicant_identities")
          .onDelete("SET NULL");
      });
    }

    if (isPg) {
      for (const column of NULLABLE_COLUMNS) {
        await knex.raw(`ALTER TABLE ${name} ALTER COLUMN ${column} DROP NOT NULL`);
      }
    } else {
      await rebuildSqliteTable(
        knex,
        name,
        (ddl) => rewriteNullability(ddl, name, NULLABLE_COLUMNS, "drop"),
        (_ddl, columnInfo) => notNullColumns(columnInfo, NULLABLE_COLUMNS).length > 0,
      );
    }

    await knex.raw(
      `CREATE INDEX IF NOT EXISTS ${index} ON ${name} (${IDENTITY_COLUMN})`,
    );
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const isPg = knex.client.config.client === "pg";

  for (const { name, index } of [...TABLES].reverse()) {
    if (!(await knex.schema.hasTable(name))) continue;

    await knex.raw(`DROP INDEX IF EXISTS ${index}`);

    // Same honesty as `20260819120000`'s down: restoring NOT NULL is only
    // possible if no account-less row was ever written. Deleting an
    // organizer's consent audit trail to make a rollback succeed is not a
    // trade this migration is allowed to make.
    for (const column of NULLABLE_COLUMNS) {
      const row = await knex(name).whereNull(column).count({ n: "*" }).first();
      const count = Number(row && (row.n ?? row["count(*)"])) || 0;
      if (count > 0) {
        throw new Error(
          `Refusing to roll back: ${count} row(s) in ${name} have no ${column}. ` +
            "Those belong to anonymous open-call applicants; restoring NOT NULL " +
            "would require deleting them. Resolve those rows first.",
        );
      }
    }

    if (isPg) {
      for (const column of NULLABLE_COLUMNS) {
        await knex.raw(`ALTER TABLE ${name} ALTER COLUMN ${column} SET NOT NULL`);
      }
    } else {
      await rebuildSqliteTable(
        knex,
        name,
        (ddl) => rewriteNullability(ddl, name, NULLABLE_COLUMNS, "add"),
        (_ddl, columnInfo) =>
          notNullColumns(columnInfo, NULLABLE_COLUMNS).length < NULLABLE_COLUMNS.length,
      );
    }

    if (await knex.schema.hasColumn(name, IDENTITY_COLUMN)) {
      await knex.schema.alterTable(name, (table) => {
        table.dropColumn(IDENTITY_COLUMN);
      });
    }
  }
};
