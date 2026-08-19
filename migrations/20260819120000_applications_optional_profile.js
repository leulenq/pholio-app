"use strict";

/**
 * `applications.profile_id` becomes optional
 * (`docs/open-call-applicant-flow-design-2026-08.md` §3.3 end, §4).
 *
 * This is the one genuinely invasive change in the applicant-flow design. An
 * application submitted from an anonymous open-call flow has an
 * `applicant_identity_id` and no profile — because no `profiles` row exists,
 * and inventing one would be exactly the silent account creation §3.2 refuses.
 * The organizer still reads it out of `applications`, because their inbox,
 * triage, pick lists, offers, auto-close and CSV export all run on that table
 * and a parallel review surface is the fork ruling R10 forbids.
 *
 * Exactly one of the two identity pointers must be present, which is a
 * database CHECK rather than an application invariant: eight agency read paths
 * join `profiles` today (§4) and a row with neither pointer is unreachable
 * from every one of them. `chk_applications_identity_present` is the thing that
 * makes "unreachable row" impossible to write in the first place.
 *
 * THE SQLITE REBUILD
 *
 * SQLite cannot drop a NOT NULL, and cannot add a CHECK. Both are one
 * create-copy-drop-rename, and this migration follows `20260815090000`'s
 * INTROSPECTIVE procedure: the live `CREATE TABLE` text comes out of
 * `sqlite_master`, only the clauses being changed are rewritten inside it,
 * rows are copied through the column list from `PRAGMA table_info`, and index
 * DDL is replayed verbatim from `sqlite_master` so the partial uniques keep
 * their WHERE clause. It never states a column list of its own —
 * `20260701111000` hardcoded one, and every column added to `applications`
 * after it was written would have been silently dropped had it run late.
 *
 * The two profile-keyed partial uniques from `20260815091000` survive that
 * rebuild by replay, and `tests/migrations/applicant-identity-schema.test.js`
 * asserts all four exist afterwards.
 *
 * TRANSACTIONS OFF. The rebuild toggles `PRAGMA foreign_keys`, which SQLite
 * silently ignores inside a transaction — with the pragma left ON, `DROP TABLE
 * applications` cascades into `application_tags`, `application_notes` and every
 * other dependent row. `down` also drops a column, which knex implements as the
 * same rebuild behind the same ignored guard. Running outside a transaction
 * lets both guards work, and every statement here is individually guarded so a
 * partial run re-runs cleanly.
 */

exports.config = { transaction: false };

const TABLE = "applications";
const IDENTITY_COLUMN = "applicant_identity_id";
const IDENTITY_CHECK = "chk_applications_identity_present";
const IDENTITY_INDEX = "idx_applications_identity_status";
const IDENTITY_REPR_INDEX = "uq_applications_identity_agency_repr";
const IDENTITY_EVENT_INDEX = "uq_applications_identity_event_call";

/* ------------------------------------------------- SQLite DDL surgery (shared) */

/*
 * These helpers are exported and reused by
 * `20260819130000_snapshot_and_consent_identity_support.js`, which performs the
 * same NOT NULL drop on `talent_submission_packages` and
 * `application_submission_consent_events`. One copy of a table-rebuild
 * procedure is worth a cross-migration require: three hand-copied parsers would
 * be three chances to reintroduce the hardcoded-column-list bug.
 */

/** Index of the closing quote that matches the opener at `start`. */
function skipQuoted(sql, start, quote) {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === quote) {
      if (sql[i + 1] === quote) {
        i += 2; // doubled quote = escaped, keep going
        continue;
      }
      return i;
    }
    i += 1;
  }
  return sql.length - 1;
}

/** Index of the `)` matching the `(` at `openIndex`, skipping quoted text. */
function matchingParen(sql, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipQuoted(sql, i, ch);
      continue;
    }
    if (ch === "[") {
      while (i < sql.length && sql[i] !== "]") i += 1;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Rewrite `CREATE TABLE <table>` to create `<table>_new` instead. */
function retargetCreateTable(ddl, table, newName) {
  const re = new RegExp(
    `^(\\s*CREATE\\s+(?:TEMP\\s+|TEMPORARY\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?)("${table}"|\`${table}\`|\\[${table}\\]|${table})`,
    "i",
  );
  if (!re.test(ddl)) {
    throw new Error(
      `Cannot locate the CREATE TABLE header for \`${table}\` in sqlite_master; refusing to rebuild.`,
    );
  }
  return ddl.replace(re, (_all, head) => `${head}"${newName}"`);
}

/** The `( … )` body of a CREATE TABLE statement. */
function tableBodyRange(ddl, table) {
  const header = new RegExp(
    `CREATE\\s+(?:TEMP\\s+|TEMPORARY\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?("${table}"|\`${table}\`|\\[${table}\\]|${table})`,
    "i",
  );
  const match = header.exec(ddl);
  if (!match) throw new Error(`Cannot parse CREATE TABLE for \`${table}\`.`);
  const open = ddl.indexOf("(", match.index + match[0].length);
  if (open === -1) throw new Error(`Cannot find the column list for \`${table}\`.`);
  const close = matchingParen(ddl, open);
  if (close === -1) throw new Error(`Unbalanced column list for \`${table}\`.`);
  return { open, close, body: ddl.slice(open + 1, close) };
}

/** Split a table body on its top-level commas. */
function splitTopLevel(body) {
  const items = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipQuoted(body, i, ch);
      continue;
    }
    if (ch === "[") {
      while (i < body.length && body[i] !== "]") i += 1;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) {
      items.push(body.slice(start, i));
      start = i + 1;
    }
  }
  items.push(body.slice(start));
  return items;
}

/**
 * The column name a body item declares, or null when the item is a table-level
 * constraint (PRIMARY KEY / UNIQUE / FOREIGN KEY / CHECK / CONSTRAINT …).
 */
function declaredColumnName(item) {
  const text = item.trimStart();
  if (!text) return null;
  const quote = text[0];
  if (quote === "`" || quote === '"') {
    const end = skipQuoted(text, 0, quote);
    return text.slice(1, end).replace(new RegExp(`${quote}${quote}`, "g"), quote);
  }
  if (quote === "[") {
    const end = text.indexOf("]");
    return end === -1 ? null : text.slice(1, end);
  }
  const word = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(text);
  if (!word) return null;
  if (
    /^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK)$/i.test(word[0])
  ) {
    return null;
  }
  return word[0];
}

/** Remove the first top-level `NOT NULL` from a column definition. */
function stripNotNull(item) {
  let depth = 0;
  for (let i = 0; i < item.length; i += 1) {
    const ch = item[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipQuoted(item, i, ch);
      continue;
    }
    if (ch === "[") {
      while (i < item.length && item[i] !== "]") i += 1;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (depth === 0) {
      const rest = item.slice(i);
      const match = /^NOT\s+NULL\b/i.exec(rest);
      if (match) {
        const before = item.slice(0, i).replace(/\s+$/, "");
        return `${before} ${item.slice(i + match[0].length).trimStart()}`.replace(
          /\s+$/,
          "",
        );
      }
    }
  }
  return item;
}

/** Add a top-level `NOT NULL` to a column definition, before any CHECK/DEFAULT. */
function addNotNull(item) {
  return `${item.replace(/\s+$/, "")} not null`;
}

/**
 * Rewrite the given columns' nullability inside a CREATE TABLE statement.
 *
 * @param {string} ddl        live `sqlite_master.sql`
 * @param {string} table
 * @param {readonly string[]} columns
 * @param {"drop"|"add"} mode
 */
function rewriteNullability(ddl, table, columns, mode) {
  const targets = new Set(columns.map((name) => name.toLowerCase()));
  const { open, close, body } = tableBodyRange(ddl, table);
  const rewritten = splitTopLevel(body)
    .map((item) => {
      const name = declaredColumnName(item);
      if (!name || !targets.has(name.toLowerCase())) return item;
      return mode === "drop" ? stripNotNull(item) : addNotNull(item);
    })
    .join(",");
  return `${ddl.slice(0, open + 1)}${rewritten}${ddl.slice(close)}`;
}

/** Append a table-level constraint to a CREATE TABLE statement. */
function appendTableConstraint(ddl, table, constraintSql) {
  const { close } = tableBodyRange(ddl, table);
  return `${ddl.slice(0, close)}, ${constraintSql}${ddl.slice(close)}`;
}

/** Remove a named table-level constraint from a CREATE TABLE statement. */
function removeNamedConstraint(ddl, table, name) {
  const { open, close, body } = tableBodyRange(ddl, table);
  const kept = splitTopLevel(body).filter(
    (item) =>
      !new RegExp(`^\\s*CONSTRAINT\\s+(?:"|\`|\\[)?${name}(?:"|\`|\\])?\\b`, "i").test(
        item,
      ),
  );
  return `${ddl.slice(0, open + 1)}${kept.join(",")}${ddl.slice(close)}`;
}

/**
 * Create-copy-drop-rename a SQLite table under a caller-supplied DDL rewrite.
 *
 * @param {import('knex').Knex} knex
 * @param {string} table
 * @param {(ddl: string) => string} rewrite
 * @param {(ddl: string, columnInfo: Array<{name:string, notnull:number}>) => boolean} needsRebuild
 */
async function rebuildSqliteTable(knex, table, rewrite, needsRebuild) {
  const tableRow = await knex("sqlite_master")
    .select("sql")
    .where({ type: "table", name: table })
    .first();
  const ddl = tableRow && tableRow.sql;
  if (!ddl) return false;

  const columnInfo = await knex.raw(`PRAGMA table_info('${table}')`);
  if (!columnInfo.length) {
    throw new Error(`PRAGMA table_info returned no columns for ${table}.`);
  }
  if (!needsRebuild(ddl, columnInfo)) return false;

  const createNew = retargetCreateTable(rewrite(ddl), table, `${table}_new`);

  // Column list comes from the live table, never from this file.
  const columns = columnInfo.map((column) => `"${column.name}"`).join(", ");

  // Explicit indexes only: origin 'pk'/'u' indexes are implied by the table
  // DDL being carried over, and re-creating them by hand would duplicate.
  const indexList = await knex.raw(`PRAGMA index_list('${table}')`);
  const explicit = new Set(
    indexList.filter((index) => index.origin === "c").map((index) => index.name),
  );
  const objects = await knex("sqlite_master")
    .select("type", "name", "sql")
    .whereIn("type", ["index", "trigger"])
    .andWhere({ tbl_name: table });
  const replay = objects
    .filter((row) => row.sql && (row.type === "trigger" || explicit.has(row.name)))
    .map((row) => row.sql);

  // Restored rather than forced back ON: this migration has no business
  // changing a setting it did not set, and a stray ON is what makes knex's own
  // SQLite column-drop rebuild cascade in later migrations.
  const [{ foreign_keys: wasEnabled }] = await knex.raw("PRAGMA foreign_keys");
  await knex.raw("PRAGMA foreign_keys = OFF");
  try {
    await knex.transaction(async (trx) => {
      await trx.raw(createNew);
      await trx.raw(
        `INSERT INTO "${table}_new" (${columns}) SELECT ${columns} FROM "${table}"`,
      );
      await trx.raw(`DROP TABLE "${table}"`);
      await trx.raw(`ALTER TABLE "${table}_new" RENAME TO "${table}"`);
      for (const sql of replay) await trx.raw(sql);
    });
  } finally {
    if (wasEnabled) await knex.raw("PRAGMA foreign_keys = ON");
  }
  return true;
}

/** Column names the live SQLite table still declares NOT NULL. */
function notNullColumns(columnInfo, columns) {
  const wanted = new Set(columns.map((name) => name.toLowerCase()));
  return columnInfo
    .filter((column) => wanted.has(column.name.toLowerCase()) && column.notnull)
    .map((column) => column.name);
}

exports.sqliteRebuild = {
  rebuildSqliteTable,
  rewriteNullability,
  appendTableConstraint,
  removeNamedConstraint,
  notNullColumns,
};

/* ------------------------------------------------------------------ PostgreSQL */

async function pgHasConstraint(knex, table, name) {
  const result = await knex.raw(
    `SELECT 1 FROM pg_constraint
       WHERE conrelid = ?::regclass AND conname = ?`,
    [table, name],
  );
  return (result.rows || []).length > 0;
}

/* ------------------------------------------------------------------------ up */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const isPg = knex.client.config.client === "pg";

  if (!(await knex.schema.hasColumn(TABLE, IDENTITY_COLUMN))) {
    await knex.schema.alterTable(TABLE, (table) => {
      table
        .uuid(IDENTITY_COLUMN)
        .nullable()
        .references("id")
        .inTable("applicant_identities")
        .onDelete("SET NULL");
    });
  }

  if (isPg) {
    await knex.raw(`ALTER TABLE ${TABLE} ALTER COLUMN profile_id DROP NOT NULL`);
    if (!(await pgHasConstraint(knex, TABLE, IDENTITY_CHECK))) {
      await knex.raw(`
        ALTER TABLE ${TABLE}
          ADD CONSTRAINT ${IDENTITY_CHECK}
          CHECK (profile_id IS NOT NULL OR ${IDENTITY_COLUMN} IS NOT NULL)
      `);
    }
  } else {
    await rebuildSqliteTable(
      knex,
      TABLE,
      (ddl) =>
        appendTableConstraint(
          rewriteNullability(ddl, TABLE, ["profile_id"], "drop"),
          TABLE,
          `constraint "${IDENTITY_CHECK}" check ("profile_id" is not null or "${IDENTITY_COLUMN}" is not null)`,
        ),
      (ddl, columnInfo) =>
        notNullColumns(columnInfo, ["profile_id"]).length > 0 ||
        !ddl.includes(IDENTITY_CHECK),
    );
  }

  await knex.raw(
    `CREATE INDEX IF NOT EXISTS ${IDENTITY_INDEX} ON ${TABLE} (${IDENTITY_COLUMN}, status)`,
  );

  // The identity-keyed twins of `20260815091000`'s profile-keyed uniques. Both
  // pairs coexist: a claimed applicant is deduplicated by profile, an unclaimed
  // one by identity, and neither index can express the other's key. The
  // `IS NOT NULL` term keeps every account-backed application out of these two.
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${IDENTITY_REPR_INDEX}
      ON ${TABLE} (${IDENTITY_COLUMN}, agency_id)
      WHERE call_purpose = 'representation' AND ${IDENTITY_COLUMN} IS NOT NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${IDENTITY_EVENT_INDEX}
      ON ${TABLE} (${IDENTITY_COLUMN}, open_call_link_id)
      WHERE call_purpose = 'event_casting' AND ${IDENTITY_COLUMN} IS NOT NULL
  `);
};

/* ---------------------------------------------------------------------- down */

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const isPg = knex.client.config.client === "pg";

  await knex.raw(`DROP INDEX IF EXISTS ${IDENTITY_EVENT_INDEX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${IDENTITY_REPR_INDEX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${IDENTITY_INDEX}`);

  // Restoring NOT NULL is only possible if no anonymous application was ever
  // taken. Failing loudly is the correct outcome: a rollback must not decide to
  // delete an organizer's applicants, and it must not invent a profile for
  // someone who never asked for an account.
  const orphans = await knex(TABLE).whereNull("profile_id").count({ n: "*" }).first();
  const orphanCount = Number(orphans && (orphans.n ?? orphans["count(*)"])) || 0;
  if (orphanCount > 0) {
    throw new Error(
      `Refusing to roll back: ${orphanCount} application(s) have no profile_id. ` +
        "Rolling back would require deleting anonymous open-call applications " +
        "or fabricating profiles for them. Resolve those rows first.",
    );
  }

  if (isPg) {
    if (await pgHasConstraint(knex, TABLE, IDENTITY_CHECK)) {
      await knex.raw(`ALTER TABLE ${TABLE} DROP CONSTRAINT ${IDENTITY_CHECK}`);
    }
    await knex.raw(`ALTER TABLE ${TABLE} ALTER COLUMN profile_id SET NOT NULL`);
  } else {
    // The CHECK must go before the column it names: knex's own SQLite column
    // drop copies the table DDL forward, and a CHECK referencing a dropped
    // column would come with it and make the table unwritable.
    await rebuildSqliteTable(
      knex,
      TABLE,
      (ddl) =>
        removeNamedConstraint(
          rewriteNullability(ddl, TABLE, ["profile_id"], "add"),
          TABLE,
          IDENTITY_CHECK,
        ),
      (ddl, columnInfo) =>
        notNullColumns(columnInfo, ["profile_id"]).length === 0 ||
        ddl.includes(IDENTITY_CHECK),
    );
  }

  if (await knex.schema.hasColumn(TABLE, IDENTITY_COLUMN)) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.dropColumn(IDENTITY_COLUMN);
    });
  }
};
