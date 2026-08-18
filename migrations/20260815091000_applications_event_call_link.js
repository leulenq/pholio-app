"use strict";

/**
 * Applications learn which call they came from, and what that call was for
 * (design A3).
 *
 * `call_purpose` is denormalized off the link on purpose. The purpose of an
 * application is immutable once submitted — an event cast never becomes a
 * representation submission — and practically every read path branches on it,
 * so a join for a value that cannot change is cost without a benefit. It also
 * survives `open_call_link_id` going NULL when a link is deleted.
 *
 * UNIQUENESS SWAP (the reason this migration is not just three ALTERs)
 *
 * `applications` has carried `UNIQUE(profile_id, agency_id)` since
 * `20250103000000:29`. Under one event organizer running Brooklyn and Queens
 * editions, that says a model who walked Brooklyn may never apply to Queens —
 * which is not a rule anyone wrote, just a constraint that predates events.
 * It is replaced by two partial uniques, one per purpose:
 *
 *   representation — still one live application per (profile, agency)
 *   event_casting  — one per (profile, open_call_link), i.e. per edition
 *
 * Partial unique indexes work on both PostgreSQL and SQLite; the precedent is
 * `uq_open_call_claims_agency_profile` (`20260704120000:113-117`).
 *
 * Must run after `20260815090000`: that migration rebuilds the SQLite
 * `applications` table, and a rebuild replays indexes from `sqlite_master` —
 * ordering it first means these indexes simply do not exist yet.
 *
 * TRANSACTIONS OFF. `down` drops columns, and knex implements a SQLite column
 * drop as create-copy-drop-rename. It guards that with
 * `PRAGMA foreign_keys = OFF`, which SQLite silently ignores inside a
 * transaction — so with the pragma left ON (as `20260701111000` and M1 both
 * leave it), `DROP TABLE applications` would cascade into `application_tags`,
 * `application_notes` and every other dependent row. Running outside a
 * transaction lets knex's own guard work, and every statement here is
 * individually guarded so a partial run re-runs cleanly.
 */

exports.config = { transaction: false };

const REPR_INDEX = "uq_applications_profile_agency_repr";
const EVENT_INDEX = "uq_applications_profile_event_call";
const LEGACY_UNIQUE = "applications_profile_id_agency_id_unique";

/**
 * Drop the old blanket unique however this database happens to express it: a
 * table constraint on PostgreSQL (knex `table.unique()` emits ADD CONSTRAINT),
 * a bare index on SQLite. Matched by definition as well as by name, because a
 * database restored from a dump can carry a server-generated name.
 */
async function dropLegacyUnique(knex, isPg) {
  if (isPg) {
    await knex.raw(`
      DO $$
      DECLARE _cname TEXT;
      BEGIN
        FOR _cname IN
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'applications'::regclass
            AND contype = 'u'
            AND (
              conname = '${LEGACY_UNIQUE}'
              OR pg_get_constraintdef(oid) ILIKE 'UNIQUE (profile_id, agency_id)%'
            )
        LOOP
          EXECUTE 'ALTER TABLE applications DROP CONSTRAINT ' || quote_ident(_cname);
        END LOOP;
      END $$;
    `);
  }
  await knex.raw(`DROP INDEX IF EXISTS ${LEGACY_UNIQUE}`);
}

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const isPg = knex.client.config.client === "pg";

  if (!(await knex.schema.hasColumn("applications", "open_call_link_id"))) {
    await knex.schema.alterTable("applications", (table) => {
      table
        .uuid("open_call_link_id")
        .nullable()
        .references("id")
        .inTable("agency_open_call_links")
        .onDelete("SET NULL");
    });
  }

  if (!(await knex.schema.hasColumn("applications", "call_purpose"))) {
    await knex.schema.alterTable("applications", (table) => {
      table.string("call_purpose", 24).notNullable().defaultTo("representation");
    });
  }

  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_applications_open_call_link_status ON applications (open_call_link_id, status)",
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_applications_agency_purpose_status ON applications (agency_id, call_purpose, status)",
  );

  await dropLegacyUnique(knex, isPg);

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${REPR_INDEX}
      ON applications (profile_id, agency_id)
      WHERE call_purpose = 'representation'
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${EVENT_INDEX}
      ON applications (profile_id, open_call_link_id)
      WHERE call_purpose = 'event_casting'
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw(`DROP INDEX IF EXISTS ${EVENT_INDEX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${REPR_INDEX}`);

  // Restoring the blanket unique is only safe if no organizer has since taken
  // two applications from one profile. Duplicates would make this migration
  // fail loudly, which is the correct outcome — a rollback must not decide
  // which of a model's two event applications to delete.
  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${LEGACY_UNIQUE} ON applications (profile_id, agency_id)`,
  );

  await knex.raw("DROP INDEX IF EXISTS idx_applications_agency_purpose_status");
  await knex.raw("DROP INDEX IF EXISTS idx_applications_open_call_link_status");

  if (await knex.schema.hasColumn("applications", "call_purpose")) {
    await knex.schema.alterTable("applications", (table) => {
      table.dropColumn("call_purpose");
    });
  }
  if (await knex.schema.hasColumn("applications", "open_call_link_id")) {
    await knex.schema.alterTable("applications", (table) => {
      table.dropColumn("open_call_link_id");
    });
  }
};
