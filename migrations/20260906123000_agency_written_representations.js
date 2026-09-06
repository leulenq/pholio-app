"use strict";

/**
 * Close the signing loop (industry audit §3.2, decision §7.6).
 *
 * Until now `talent_representations` could only ever be written by the talent:
 * every route in `src/domains/talent/routes/representations.js` is
 * `requireRole("TALENT")`, and the CHECK constraints only admitted
 * `source in ('legacy', 'profile')`. An agency moving an application to
 * `represented` therefore wrote one string on the application row and nothing
 * else — so the signing agency read its own signed model as *unrepresented* in
 * Discover.
 *
 * This migration lets an agency ORIGINATE a representation row that is still
 * the talent's to accept:
 *
 *   source  += 'agency'   the agency wrote this row
 *   status  += 'pending'  written, awaiting the talent's confirmation
 *
 * A `pending` row is a proposal, not a relationship. Nothing downstream may
 * read it as representation until the talent confirms it (see
 * `discover-search.js` / `talent-dossier.js`).
 *
 * New columns
 *   confirmed_at              when the talent accepted
 *   confirmed_by_user_id      which user accepted (the talent's own user id)
 *   declined_at               when the talent refused (row also goes to ended)
 *   originating_application_id  the application whose scope line ended here
 *   board_name                the agency's board label AT SIGNING — a snapshot,
 *                             not a join: boards get renamed and deleted, and
 *                             the board someone was signed to is a historical
 *                             fact. `division` is left exactly as it was (the
 *                             talent's own word for their division).
 *
 * Lifecycle CHECK is widened so `pending` behaves like `active` w.r.t.
 * `ended_on` (a proposal has no end date); only `ended` requires one.
 *
 * UNIQUENESS DECISION — pending gets its OWN uniqueness scope.
 *   The existing partial unique indexes stay keyed on `status = 'active'`, so a
 *   pending row never blocks the eventual active row for the same scope, and
 *   never blocks the talent from recording that same relationship themselves.
 *   A second partial unique index keyed on `status = 'pending'` stops the same
 *   agency from stacking duplicate proposals for one profile/scope — the
 *   database backstop under `recordSigning`'s application-level idempotency.
 *   Consequence, accepted deliberately: if the talent has *already* recorded an
 *   active row for the same (profile, agency, relationship_type, scope), the
 *   pending row can be created but confirming it collides with
 *   `talent_representations_active_internal_unique`. The confirm route reports
 *   that as a 409 rather than silently producing two live rows.
 *
 * PostgreSQL: drop & replace the three named CHECK constraints, add columns.
 * SQLite: CHECKs are baked into the table at creation and cannot be ALTERed in
 *   place, so the table is rebuilt — the sanctioned procedure in this repo, see
 *   `20260627150000_add_advancing_application_statuses.js`.
 *
 * Transactions are disabled: the SQLite rebuild toggles `PRAGMA foreign_keys`
 * (a no-op inside a transaction) and manages its own.
 */

// Knex honours per-migration transaction control via this export.
exports.config = { transaction: false };

const NEW_STATUSES = ["active", "ended", "pending"];
const PRIOR_STATUSES = ["active", "ended"];
const NEW_SOURCES = ["legacy", "profile", "agency"];
const PRIOR_SOURCES = ["legacy", "profile"];

const NEW_LIFECYCLE =
  "((status in ('active', 'pending') and ended_on is null) or (status = 'ended' and ended_on is not null))";
const PRIOR_LIFECYCLE =
  "((status = 'active' and ended_on is null) or (status = 'ended' and ended_on is not null))";

const NEW_COLUMNS = [
  "confirmed_at",
  "confirmed_by_user_id",
  "declined_at",
  "originating_application_id",
  "board_name",
];

const PENDING_INTERNAL_UNIQUE =
  "talent_representations_pending_internal_unique";

function isPostgres(knex) {
  const client = knex.client.config.client;
  return client === "pg" || client === "postgresql";
}

function quoted(values) {
  return values.map((value) => `'${value}'`).join(", ");
}

// ---------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------

async function replacePgChecks(knex, { statuses, sources, lifecycle }) {
  await knex.raw(`
    ALTER TABLE talent_representations
      DROP CONSTRAINT IF EXISTS talent_representations_status_check,
      DROP CONSTRAINT IF EXISTS talent_representations_source_check,
      DROP CONSTRAINT IF EXISTS talent_representations_lifecycle_check
  `);
  await knex.raw(`
    ALTER TABLE talent_representations
      ADD CONSTRAINT talent_representations_status_check
        CHECK (status IN (${quoted(statuses)})),
      ADD CONSTRAINT talent_representations_source_check
        CHECK (source IN (${quoted(sources)})),
      ADD CONSTRAINT talent_representations_lifecycle_check
        CHECK ${lifecycle}
  `);
}

async function addColumns(knex) {
  const missing = [];
  for (const column of NEW_COLUMNS) {
    if (!(await knex.schema.hasColumn("talent_representations", column))) {
      missing.push(column);
    }
  }
  if (missing.length === 0) return;
  await knex.schema.alterTable("talent_representations", (table) => {
    if (missing.includes("confirmed_at")) table.timestamp("confirmed_at").nullable();
    if (missing.includes("confirmed_by_user_id")) {
      table
        .uuid("confirmed_by_user_id")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
    }
    if (missing.includes("declined_at")) table.timestamp("declined_at").nullable();
    if (missing.includes("originating_application_id")) {
      table
        .uuid("originating_application_id")
        .nullable()
        .references("id")
        .inTable("applications")
        .onDelete("SET NULL");
    }
    if (missing.includes("board_name")) table.string("board_name", 160).nullable();
  });
}

async function dropColumns(knex) {
  const present = [];
  for (const column of NEW_COLUMNS) {
    if (await knex.schema.hasColumn("talent_representations", column)) {
      present.push(column);
    }
  }
  if (present.length === 0) return;
  await knex.schema.alterTable("talent_representations", (table) => {
    table.dropColumns(...present);
  });
}

// ---------------------------------------------------------------------------
// SQLite — full table rebuild
// ---------------------------------------------------------------------------

/**
 * Rebuild `talent_representations` with the given CHECK vocabulary, optionally
 * carrying the agency-signing columns. Preserves data, foreign keys and every
 * index. Foreign keys are disabled during the swap so the DROP TABLE does not
 * cascade into (or reject on) related rows.
 */
async function rebuildSqlite(knex, { statuses, sources, lifecycle, withNewColumns }) {
  const hasDisclose = await knex.schema.hasColumn(
    "talent_representations",
    "disclose_agency_name",
  );

  const carried = [
    "id",
    "profile_id",
    "agency_id",
    "external_agency_name",
    "external_agency_key",
    "relationship_type",
    "market",
    "territory",
    "scope_key",
    "division",
    "is_exclusive",
    "status",
    "started_on",
    "ended_on",
    "source",
    "created_at",
    "updated_at",
    ...(hasDisclose ? ["disclose_agency_name"] : []),
  ];
  // Only the pre-existing columns are copied. Going up, the new columns start
  // NULL (no row predates the feature); going down, they are dropped with the
  // old table. Either way both sides of the INSERT..SELECT share this list.
  const columnList = carried.map((c) => `\`${c}\``).join(", ");

  const newColumnDdl = withNewColumns
    ? `,
          \`confirmed_at\` datetime null,
          \`confirmed_by_user_id\` char(36) null,
          \`declined_at\` datetime null,
          \`originating_application_id\` char(36) null,
          \`board_name\` varchar(160) null`
    : "";
  const newForeignKeys = withNewColumns
    ? `,
          foreign key(\`confirmed_by_user_id\`) references \`users\`(\`id\`) on delete SET NULL,
          foreign key(\`originating_application_id\`) references \`applications\`(\`id\`) on delete SET NULL`
    : "";

  await knex.raw("PRAGMA foreign_keys = OFF");
  try {
    await knex.transaction(async (trx) => {
      await trx.raw(`
        CREATE TABLE \`talent_representations_new\` (
          \`id\` char(36),
          \`profile_id\` char(36) not null,
          \`agency_id\` char(36) null,
          \`external_agency_name\` varchar(160) null,
          \`external_agency_key\` varchar(160) null,
          \`relationship_type\` varchar(20) not null,
          \`market\` varchar(120) null,
          \`territory\` varchar(120) null,
          \`scope_key\` varchar(245) not null default '|',
          \`division\` varchar(100) null,
          \`is_exclusive\` boolean not null default '0',
          \`status\` varchar(20) not null default 'active',
          \`started_on\` date null,
          \`ended_on\` date null,
          \`source\` varchar(20) not null default 'profile',
          \`created_at\` datetime not null default CURRENT_TIMESTAMP,
          \`updated_at\` datetime not null default CURRENT_TIMESTAMP${
            hasDisclose
              ? ",\n          `disclose_agency_name` boolean not null default '0'"
              : ""
          }${newColumnDdl},
          primary key (\`id\`),
          foreign key(\`profile_id\`) references \`profiles\`(\`id\`) on delete CASCADE,
          foreign key(\`agency_id\`) references \`agencies\`(\`id\`) on delete SET NULL${newForeignKeys},
          constraint talent_representations_relationship_type_check
            check (relationship_type in ('mother', 'placement')),
          constraint talent_representations_status_check
            check (status in (${quoted(statuses)})),
          constraint talent_representations_source_check
            check (source in (${quoted(sources)})),
          constraint talent_representations_counterparty_check
            check (((agency_id is not null and external_agency_name is null and external_agency_key is null) or (agency_id is null and external_agency_name is not null and external_agency_key is not null))),
          constraint talent_representations_lifecycle_check
            check (${lifecycle})
        )
      `);
      await trx.raw(`
        INSERT INTO \`talent_representations_new\` (${columnList})
        SELECT ${columnList} FROM \`talent_representations\`
      `);
      await trx.raw("DROP TABLE `talent_representations`");
      await trx.raw(
        "ALTER TABLE `talent_representations_new` RENAME TO `talent_representations`",
      );
      await trx.raw(
        "CREATE INDEX `talent_representations_profile_id_status_index` on `talent_representations` (`profile_id`, `status`)",
      );
      await trx.raw(
        "CREATE INDEX `talent_representations_agency_id_status_index` on `talent_representations` (`agency_id`, `status`)",
      );
      await trx.raw(
        "CREATE UNIQUE INDEX talent_representations_active_internal_unique on talent_representations (profile_id, agency_id, relationship_type, scope_key) where status = 'active' and agency_id is not null",
      );
      await trx.raw(
        "CREATE UNIQUE INDEX talent_representations_active_external_unique on talent_representations (profile_id, external_agency_key, relationship_type, scope_key) where status = 'active' and agency_id is null",
      );
      await trx.raw(
        "CREATE UNIQUE INDEX talent_representations_one_active_mother_unique on talent_representations (profile_id) where status = 'active' and relationship_type = 'mother'",
      );
      if (withNewColumns) {
        await trx.raw(
          `CREATE UNIQUE INDEX ${PENDING_INTERNAL_UNIQUE} on talent_representations (profile_id, agency_id, relationship_type, scope_key) where status = 'pending' and agency_id is not null`,
        );
      }
    });
  } finally {
    await knex.raw("PRAGMA foreign_keys = ON");
  }
}

// ---------------------------------------------------------------------------

/** @param {import("knex").Knex} knex */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable("talent_representations"))) return;

  if (isPostgres(knex)) {
    await addColumns(knex);
    await replacePgChecks(knex, {
      statuses: NEW_STATUSES,
      sources: NEW_SOURCES,
      lifecycle: NEW_LIFECYCLE,
    });
    await knex.raw(
      `create unique index if not exists ${PENDING_INTERNAL_UNIQUE} on talent_representations (profile_id, agency_id, relationship_type, scope_key) where status = 'pending' and agency_id is not null`,
    );
    return;
  }

  await rebuildSqlite(knex, {
    statuses: NEW_STATUSES,
    sources: NEW_SOURCES,
    lifecycle: NEW_LIFECYCLE,
    withNewColumns: true,
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable("talent_representations"))) return;

  // Lossy, and deliberately so: a pending proposal has no representation in the
  // prior vocabulary. Close it rather than promote it — the talent never
  // confirmed it, and inventing an active relationship on rollback would be the
  // exact bug this migration exists to fix.
  const endedOn = new Date().toISOString().slice(0, 10);
  await knex("talent_representations")
    .where({ status: "pending" })
    .update({ status: "ended", ended_on: endedOn });
  await knex("talent_representations")
    .where({ source: "agency" })
    .update({ source: "profile" });

  if (isPostgres(knex)) {
    await knex.raw(`drop index if exists ${PENDING_INTERNAL_UNIQUE}`);
    await replacePgChecks(knex, {
      statuses: PRIOR_STATUSES,
      sources: PRIOR_SOURCES,
      lifecycle: PRIOR_LIFECYCLE,
    });
    await dropColumns(knex);
    return;
  }

  await rebuildSqlite(knex, {
    statuses: PRIOR_STATUSES,
    sources: PRIOR_SOURCES,
    lifecycle: PRIOR_LIFECYCLE,
    withNewColumns: false,
  });
};
